const mongoose = require('mongoose');

const VendorProduct = require('../models/vendorProduct.model');
const Sku = require('../models/sku.model');
const SkuInventory = require('../models/skuInventory.model');
const Warehouse = require('../models/warehouse.model');
const Customer = require('../models/customer.model');
const User = require('../models/user.model');

const B2BPurchaseRequest = require('../models/b2bPurchaseRequest.model');
const { attachUnreadChatCount } = require('../utils/chatUnread');
const StoreInventory = require('../models/storeInventory.model');
const Notification = require('../models/notification.model');
const AdminNotification = require('../models/adminNotification.model');
const { sendEmail } = require('../config/sendMails');
const { Parser } = require('json2csv');
const B2BCart = require('../models/b2bCart.model');
const InventoryWallet = require('../models/inventoryWallet.model');
const { emitB2bPurchaseChatMessage, emitB2bPurchaseChatSeen } = require('../socket/b2bPurchaseChat.socket');
const { emitAdminChatUnreadChanged } = require('../socket/adminChat.socket');
const { emitCustomerChatUnreadChanged } = require('../socket/customerChat.socket');


const MAX_B2B_PURCHASE_REPLY_PREVIEW = 88;

const isObjectId = (value) => mongoose.isValidObjectId(String(value || '').trim());

/** JWT-selected warehouse id (same shape as special-order / cart flows) */
function selectedWarehouseObjectId(user) {
  const sw = user?.selectedWarehouse;
  if (!sw) return null;
  const id = typeof sw === 'object' && sw._id != null ? sw._id : sw;
  const s = String(id || '').trim();
  return isObjectId(s) ? s : null;
}

const sumSkuInventory = async (skuId, warehouseId, session) => {
  if (!skuId || !warehouseId) return 0;

  const pipeline = [
    {
      $match: {
        skuId: new mongoose.Types.ObjectId(String(skuId)),
        warehouse: new mongoose.Types.ObjectId(String(warehouseId)), // ✅ FIXED FIELD
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$quantity' },
      },
    },
  ];

  const q = SkuInventory.aggregate(pipeline);
  if (session) q.session(session);

  const agg = await q;
  return agg?.[0]?.total || 0;
};



const deductSkuInventory = async ({ skuId, warehouseId, quantity, session }) => {
  let remaining = quantity;
  const deductions = [];

  const invQuery = SkuInventory.find({
    skuId,
    warehouse: warehouseId, // ✅ correct field name
    quantity: { $gt: 0 },
  }).sort({ quantity: -1, updatedAt: 1 });

  if (session) invQuery.session(session);
  const inventories = await invQuery.lean();

  for (const inv of inventories) {
    if (remaining <= 0) break;

    const updateOpts = session ? { session } : {};

    // concurrency-safe deduction loop
    for (let attempt = 0; attempt < 3; attempt++) {
      const currentQuery = SkuInventory.findById(inv._id).select('quantity');
      if (session) currentQuery.session(session);
      const current = await currentQuery.lean();

      const available = Number(current?.quantity || 0);
      if (available <= 0) break;

      const take = Math.min(remaining, available);

      const updateRes = await SkuInventory.updateOne(
        {
          _id: inv._id,
          warehouse: warehouseId, // ✅ ensure same warehouse
          quantity: { $gte: take },
        },
        { $inc: { quantity: -take } },
        updateOpts
      );

      if (updateRes.modifiedCount === 1) {
        deductions.push({
          inventoryId: inv._id,
          deducted: take,
        });

        remaining -= take;
        break;
      }
    }
  }

  if (remaining > 0) {
    throw new Error('Vendor inventory changed. Not enough stock to fulfill request.');
  }

  return deductions;
};

/** Add SKU qty at store warehouse (same pattern as store-to-store transfer). */
async function incrementSkuInventoryAtWarehouse({ skuId, warehouseId, quantity, session }) {
  const filter = {
    skuId: new mongoose.Types.ObjectId(String(skuId)),
    warehouse: new mongoose.Types.ObjectId(String(warehouseId)),
    city: null,
  };
  const opts = { upsert: true };
  if (session) opts.session = session;
  await SkuInventory.updateOne(
    filter,
    {
      $inc: { quantity },
      $setOnInsert: { city: null },
    },
    opts
  );
}

const resolveRequestedByDetails = async (requests) => {
  const customerIds = [];
  const userIds = [];

  for (const r of requests) {
    if (r.requestedByModel === 'Customer') customerIds.push(r.requestedBy);
    if (r.requestedByModel === 'User') userIds.push(r.requestedBy);
  }

  const [customers, users] = await Promise.all([
    customerIds.length ? Customer.find({ _id: { $in: customerIds } }).select('_id username email userId').lean() : [],
    userIds.length ? User.find({ _id: { $in: userIds } }).select('_id username email userId').lean() : [],
  ]);

  const customerMap = new Map(customers.map((c) => [String(c._id), c]));
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  return requests.map((r) => {
    const key = String(r.requestedBy);
    const requestedByUser =
      r.requestedByModel === 'Customer' ? customerMap.get(key) : r.requestedByModel === 'User' ? userMap.get(key) : null;
    return { ...r, requestedByUser: requestedByUser || null };
  });
};

function buildPurchaseRequestsFilter(req) {
  const actor = req.b2bActor;
  const role = String(actor?.roleName || '').toLowerCase().trim();
  const view = String(req.query.view || 'approvals').toLowerCase().trim();
  const statusParam = String(req.query.status || '').trim();
  const statusList = statusParam
    ? statusParam
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    : [];

  const filter = {};
  const returnPending = String(req.query.returnPending || '').trim() === '1';

  if (returnPending) {
    filter.status = 'APPROVED';
    filter['returnRequest.status'] = 'PENDING';
  }

  if (view === 'my-orders') {
    const scope = String(req.query.scope || 'mine').toLowerCase().trim();
    if (scope === 'store') {
      const wid = selectedWarehouseObjectId(req.user);
      if (!wid) {
        return { error: 'No warehouse selected. Choose a store warehouse to view store-wide orders.' };
      }
      filter.storeWarehouseId = wid;
    } else {
      filter.requestedBy = actor.id;
    }

    if (!returnPending && statusList.length) {
      filter.status = { $in: statusList };
    }
  } else if (actor?.isSuperUser || role === 'admin') {
    if (!returnPending && statusList.length) {
      filter.status = { $in: statusList };
    }
    if (req.query.storeWarehouseId && isObjectId(req.query.storeWarehouseId)) {
      filter.storeWarehouseId = req.query.storeWarehouseId;
    }
  } else if (role === 'district manager') {
    filter.dmUserId = actor.id;
    if (!returnPending && statusList.length) {
      filter.status = { $in: statusList };
    }
  } else if (role === 'corporate manager') {
    filter.cmUserId = actor.id;
    if (!returnPending && statusList.length) {
      filter.status = { $in: statusList };
    }
  } else {
    filter.requestedBy = actor.id;
    if (!returnPending && statusList.length) {
      filter.status = { $in: statusList };
    }
  }

  const startDate = String(req.query.startDate || '').trim();
  const endDate = String(req.query.endDate || '').trim();
  if (startDate) {
    const start = new Date(`${startDate}T00:00:00.000`);
    if (!Number.isNaN(start.getTime())) {
      filter.createdAt = { ...(filter.createdAt || {}), $gte: start };
    }
  }
  if (endDate) {
    const end = new Date(`${endDate}T23:59:59.999`);
    if (!Number.isNaN(end.getTime())) {
      filter.createdAt = { ...(filter.createdAt || {}), $lte: end };
    }
  }

  return { filter };
}

async function attachVendorStockToRequests(requests) {
  const skuIds = [
    ...new Set(
      requests
        .map((r) => r.skuId?._id || r.skuId)
        .filter(Boolean)
        .map(String),
    ),
  ];

  const inventoryMap = new Map();
  const skuWarehousePairs = requests
    .map((r) => ({
      skuId: String(r.skuId?._id || r.skuId || ''),
      warehouseId: String(r.vendorWarehouseId?._id || r.vendorWarehouseId || ''),
    }))
    .filter((x) => x.skuId && x.warehouseId);

  const vendorWarehouseIds = [...new Set(skuWarehousePairs.map((x) => x.warehouseId))];

  if (skuIds.length > 0 && vendorWarehouseIds.length > 0) {
    const inventories = await SkuInventory.find({
      skuId: { $in: skuIds },
      warehouse: { $in: vendorWarehouseIds },
    })
      .select('skuId warehouse quantity')
      .lean();

    inventories.forEach((inv) => {
      const key = `${String(inv.skuId)}_${String(inv.warehouse)}`;
      inventoryMap.set(key, (inventoryMap.get(key) || 0) + Number(inv.quantity || 0));
    });
  }

  return requests.map((r) => {
    const skuId = String(r.skuId?._id || r.skuId || '');
    const vendorWarehouseId = String(r.vendorWarehouseId?._id || r.vendorWarehouseId || '');
    const vendorStock = inventoryMap.get(`${skuId}_${vendorWarehouseId}`) || 0;

    return {
      ...r,
      vendorStock,
      availableVendorStock: vendorStock,
      insufficientVendorStock: Number(r.quantity || 0) > vendorStock,
      shortageQuantity: Math.max(0, Number(r.quantity || 0) - vendorStock),
    };
  });
}


const B2B_PURCHASE_CSV_FIELDS = [
  'DATE',
  'TICKET NUMBER',
  'STORE REQUESTING',
  'SKU',
  'DESCRIPTION',
  'VENDOR MODEL',
  'QTY IN MAIN',
  'QTY REQUESTED',
  'VENDOR',
  'BRAND',
  'Image LINK',
  'Metal Type',
  'Metal Color',
  'Size',
  'Requested By',
  'Requester Email',
  'Status',
  'Return Request Status',
  'DM Approved At',
  'CM Approved At',
  'Admin Approved At',
];

function b2bPurchaseCsvDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}
function getCsvImageLink(images) {
  if (!Array.isArray(images) || !images.length) {
    return '';
  }

  const image = images[0];

  if (typeof image === 'string') {
    return image;
  }

  return (
    image?.url ||
    image?.imageUrl ||
    image?.secure_url ||
    image?.src ||
    ''
  );
}
function b2bPurchaseRequestToCsvRow(request) {
  return {
    DATE: b2bPurchaseCsvDate(request.createdAt),

    'TICKET NUMBER': request.orderNumber || '',

    'STORE REQUESTING': request.storeWarehouseId?.name || '',

    SKU: request.skuId?.sku || '',

    DESCRIPTION:
      request.skuId?.attributes?.descriptionname ||
      request.vendorProductId?.title ||
      '',

    'VENDOR MODEL':
      request.vendorProductId?.vendorModel || '',

    'QTY IN MAIN':
      Number(request.vendorStock || 0),

    'QTY REQUESTED':
      Number(request.quantity || 0),

    VENDOR:
      request.skuId?.attributes?.vendor || '',

    BRAND: request.vendorProductId?.brand || '',

    'Image LINK':
      getCsvImageLink(request.skuId?.images),
  //  now commit key and values 
    'Metal Type': request.skuId?.metalType || '',
    'Metal Color': request.skuId?.metalColor || '',
    Size: request.skuId?.size || '',
  
    'Requested By': request.requestedByUser?.username || '',
    'Requester Email': request.requestedByUser?.email || '',
    Status: request.status || '',
    'Return Request Status': request.returnRequest?.status || '',
    'DM Approved At': b2bPurchaseCsvDate(request.approvals?.dm?.approvedAt),
    'CM Approved At': b2bPurchaseCsvDate(request.approvals?.cm?.approvedAt),
    'Admin Approved At': b2bPurchaseCsvDate(request.approvals?.admin?.approvedAt),
    };
}

/**
 * Helper: Send notifications and emails for purchase lifecycle events
 */


const getProductImageUrl = (sku) => {
  const img = Array.isArray(sku?.images) ? sku.images[0] : '';
  if (!img) return '';

  if (String(img).startsWith('http')) return img;

  const baseUrl = process.env.BACKEND_URL || process.env.BASE_API || 'https://backend.vallianimarketplace.com';
  return `${baseUrl}/${String(img).replace(/^\/+/, '')}`;
};



const safe = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const money = (value, currency = 'USD') => {
  const n = Number(value || 0);
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const buildB2BPurchaseNotificationContent = ({
  headline,
  request,
  sku,
  product,
  store,
  requester,
  status,
  quantity,
  approvedBy,
  reason,
  vendorWarehouseName,
}) => {
  const attrs = sku?.attributes || {};
  const unitPrice = request?.cartItemPrice ?? sku?.price ?? 0;
  const currency = request?.cartItemCurrency ?? sku?.currency ?? 'USD';
  const qty = quantity ?? request?.quantity ?? 0;
  const totalPrice = Number(unitPrice || 0) * Number(qty || 0);
  const productTitle = attrs?.descriptionname || product?.title || product?.vendorModel || '-';
  const metal = [sku?.metalColor, sku?.metalType, sku?.size].filter(Boolean).join(' ');

  return [
    headline,
    request?.orderNumber ? `Order #: ${request.orderNumber}` : null,
    `Request ID: ${request?._id}`,
    `Status: ${status ?? request?.status}`,
    `Product: ${productTitle}`,
    `SKU: ${sku?.sku || '-'}`,
    product?.vendorModel ? `Vendor Model: ${product.vendorModel}` : null,
    product?.brand ? `Brand: ${product.brand}` : null,
    attrs?.modelno ? `Model No: ${attrs.modelno}` : null,
    attrs?.style ? `Style: ${attrs.style}` : null,
    attrs?.vendor ? `Vendor: ${attrs.vendor}` : null,
    metal ? `Metal/Size: ${metal}` : null,
    attrs?.avgweight ? `Avg Weight: ${attrs.avgweight}` : null,
    `Quantity: ${qty}`,
    `Unit Price: ${money(unitPrice, currency)}`,
    `Total: ${money(totalPrice, currency)}`,
    store?.name ? `Store: ${store.name}` : null,
    vendorWarehouseName ? `Vendor Warehouse: ${vendorWarehouseName}` : null,
    requester?.username ? `Requested By: ${requester.username}` : null,
    requester?.email ? `Requester Email: ${requester.email}` : null,
    approvedBy ? `Action By: ${approvedBy}` : null,
    reason ? `Reason: ${reason}` : null,
  ]
    .filter(Boolean)
    .join('\n');
};

const buildB2BEmailTemplate = ({
  title,
  badge,
  productInfo,
  skuInfo,
  storeName,
  vendorWarehouseName,
  quantity,
  status,
  requestedBy,
  requestedByEmail,
  approvedBy,
  reason,
  orderUrl,
  imageUrl,
  urgentNote = false,
  request,
  sku,
  product,
}) => {
  const attrs = sku?.attributes || {};
  const unitPrice = request?.cartItemPrice ?? sku?.price ?? 0;
  const currency = request?.cartItemCurrency ?? sku?.currency ?? 'USD';
  const totalPrice = Number(unitPrice || 0) * Number(quantity || 0);

  const rows = [
    ['Order ID', request?._id],
    ['Status', status],
    ['Store', storeName],
    // ['Vendor Warehouse', vendorWarehouseName],
    ['Requested By', requestedBy],
    ['Requester Email', requestedByEmail],
    approvedBy ? ['Action By', approvedBy] : null,
    reason ? ['Reason', reason] : null,
    ['Quantity', quantity],
    ['Unit Price', money(unitPrice, currency)],
    ['Total Amount', money(totalPrice, currency)],
  ].filter(Boolean);

  const productRows = [
    ['Product Title', product?.title || attrs?.descriptionname],
    ['Brand', product?.brand],
    ['Vendor Model', product?.vendorModel],
    ['SKU', sku?.sku],
    ['Model No', attrs?.modelno],
    ['Style', attrs?.style],
    ['Vendor', attrs?.vendor],
    ['Metal Type', sku?.metalType],
    ['Metal Color', sku?.metalColor],
    ['Size', sku?.size],
    ['Avg Weight', attrs?.avgweight],
    // ['Category', product?.category],
  ].filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#EDE8D0;font-family:Arial,Helvetica,sans-serif;color:#2b211b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#EDE8D0;padding:28px 12px;">
    <tr>
      <td align="center">
        <table width="720" cellpadding="0" cellspacing="0" style="max-width:720px;width:100%;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #d8cfad;box-shadow:0 18px 45px rgba(111,78,55,0.18);">
          
          <tr>
            <td style="background:linear-gradient(135deg,#4b2f20,#6f4e37,#8a624a);padding:30px 34px;color:#EDE8D0;">
              <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.85;">Valliani Jewelers</div>
              <h1 style="margin:10px 0 6px;font-size:26px;line-height:1.25;">${safe(title)}</h1>
              <div style="display:inline-block;margin-top:8px;padding:7px 13px;border-radius:999px;background:rgba(237,232,208,.16);border:1px solid rgba(237,232,208,.28);font-size:12px;font-weight:700;">
                ${safe(badge || 'Purchase Request')}
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:26px 34px;">
              ${
                urgentNote
                  ? `<div style="margin-bottom:22px;border-left:5px solid #6f4e37;background:#fff7df;border-radius:12px;padding:14px 16px;color:#6f4e37;font-size:14px;line-height:1.55;">
                      <strong>Action Required:</strong> This order should be reviewed/completed within <strong>6 hours</strong>.
                    </div>`
                  : ''
              }

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  ${
                    imageUrl
                      ? `<td width="160" valign="top" style="padding-right:20px;">
                          <img src="${safe(imageUrl)}" width="150" style="width:150px;max-width:150px;border-radius:16px;border:1px solid #e7dfc2;display:block;background:#f7f3e8;" />
                        </td>`
                      : ''
                  }
                  <td valign="top">
                    <h2 style="margin:0 0 8px;color:#6f4e37;font-size:21px;line-height:1.35;">${safe(productInfo)}</h2>
                    <p style="margin:0 0 14px;color:#6b625b;font-size:14px;line-height:1.5;">${safe(skuInfo)}</p>
                    <a href="${safe(orderUrl)}" target="_blank" style="display:inline-block;background:#6f4e37;color:#EDE8D0;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:700;">
                      Review Order
                    </a>
                  </td>
                </tr>
              </table>

              <div style="margin-top:28px;">
                <h3 style="margin:0 0 12px;color:#6f4e37;font-size:16px;">Order Summary</h3>
                <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee3c5;border-radius:14px;overflow:hidden;">
                  ${rows
                    .map(
                      ([k, v], i) => `
                      <tr>
                        <td style="width:38%;padding:12px 15px;background:${i % 2 === 0 ? '#f8f5e8' : '#ffffff'};color:#6f4e37;font-size:13px;font-weight:700;border-bottom:1px solid #eee3c5;">${safe(k)}</td>
                        <td style="padding:12px 15px;background:${i % 2 === 0 ? '#fbfaf3' : '#ffffff'};color:#2b211b;font-size:13px;border-bottom:1px solid #eee3c5;">${safe(v || 'N/A')}</td>
                      </tr>`
                    )
                    .join('')}
                </table>
              </div>

              <div style="margin-top:24px;">
                <h3 style="margin:0 0 12px;color:#6f4e37;font-size:16px;">Product Details</h3>
                <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee3c5;border-radius:14px;overflow:hidden;">
                  ${productRows
                    .map(
                      ([k, v], i) => `
                      <tr>
                        <td style="width:38%;padding:11px 15px;background:${i % 2 === 0 ? '#f8f5e8' : '#ffffff'};color:#6f4e37;font-size:13px;font-weight:700;border-bottom:1px solid #eee3c5;">${safe(k)}</td>
                        <td style="padding:11px 15px;background:${i % 2 === 0 ? '#fbfaf3' : '#ffffff'};color:#2b211b;font-size:13px;border-bottom:1px solid #eee3c5;">${safe(v || 'N/A')}</td>
                      </tr>`
                    )
                    .join('')}
                </table>
              </div>

              <div style="margin-top:28px;text-align:center;">
                <a href="${safe(orderUrl)}" target="_blank" style="background:#6f4e37;color:#EDE8D0;text-decoration:none;padding:14px 30px;border-radius:999px;font-weight:700;display:inline-block;">
                  Open Purchase Request
                </a>
              </div>

              <p style="margin:24px 0 0;text-align:center;color:#8a7c70;font-size:12px;line-height:1.5;">
                This is an automated notification from Valliani Marketplace. Please do not reply directly to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

  const notifyB2BEvent = async ({ event, request, actor }) => {
    try {
      const populated = await B2BPurchaseRequest.findById(request._id)
        .populate('vendorProductId', 'vendorModel title brand category')
        .populate('skuId', 'sku metalColor metalType size images attributes price currency')
        .populate('storeWarehouseId', 'name')
        .populate('vendorWarehouseId', 'name')
        .populate('requestedBy', 'username email')
        .populate('dmUserId', 'username email')
        .populate('cmUserId', 'username email')
        .lean();

      const vendorProduct = populated.vendorProductId;
      const sku = populated.skuId;
      const store = populated.storeWarehouseId;
      const requester = populated.requestedBy;
      const dm = populated.dmUserId;
      const cm = populated.cmUserId;
      const vendorWarehouseName = populated.vendorWarehouseId?.name;
      const imageUrl = getProductImageUrl(sku);

      const purchaseNotify = (headline, extra = {}) =>
        buildB2BPurchaseNotificationContent({
          headline,
          request: populated,
          sku,
          product: vendorProduct,
          store,
          requester,
          quantity: request.quantity,
          status: request.status,
          vendorWarehouseName,
          ...extra,
        });
      
      const productInfo = `${sku?.attributes?.descriptionname || '-'} (${sku?.sku || '-'})`;
      const skuInfo = `SKU: ${sku?.sku || 'N/A'} | ${sku?.metalColor || ''} ${sku?.metalType || ''} ${sku?.size || ''}`.trim();
      const requestLink = `/profile-details/b2b-order/${request._id}`;
      const orderUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}${requestLink}`;

      // Fetch all admins for admin notifications
      const admins = await User.find({ isAdmin: true }).select('_id email username').lean();
      const purchaseRequestResolver = await User.find({isRequestResolver:true}).select('_id email username').lean();

      let notifications = [];
      let emails = [];

      switch (event) {
        case 'REQUEST_CREATED': {
          // Notify DM, CM
          if (requester?.email) {
          emails.push({
            to: requester.email,
            subject: `Purchase Request Created - ${productInfo}`,
            html: buildB2BEmailTemplate({
            title: 'Purchase Request Created',
            badge: 'Request Submitted',
            productInfo,
            skuInfo,
            storeName: store?.name,
            vendorWarehouseName: populated.vendorWarehouseId?.name,
            quantity: request.quantity,
            status: request.status,
            requestedBy: requester?.username || 'N/A',
            requestedByEmail: requester?.email || '',
            orderUrl,
            imageUrl,
            urgentNote: true,
            request,
            sku,
            product: vendorProduct,
          }),
          
          
          });
        }
        if (requester?._id) {
        notifications.push({
          user: requester._id,
          content: purchaseNotify('Your purchase request has been created.'),
          url: requestLink,
          read: false,
        });
      }


          admins.forEach((admin) => {
            if (admin.email) {
              emails.push({
                to: admin.email,
                subject: `New Purchase Request - ${productInfo}`,
                html: buildB2BEmailTemplate({
                title: 'New Purchase Request',
                badge: 'Admin Review',
                productInfo,
                skuInfo,
                storeName: store?.name,
                vendorWarehouseName: populated.vendorWarehouseId?.name,
                quantity: request.quantity,
                status: request.status,
                requestedBy: requester?.username || 'N/A',
                requestedByEmail: requester?.email || '',
                orderUrl,
                imageUrl,
                urgentNote: true,
                request,
                sku,
                product: vendorProduct,
              }),
              
              
              });
            }
          });
              admins.forEach((admin) => {
              notifications.push({
              user: admin._id,
              type: 'ORDER',
              content: purchaseNotify(`New purchase request from ${requester?.username || 'Store Manager'} — admin review required.`),
              resourceId: request._id,
              resourceModel: 'B2BPurchaseRequest',
              priority: 'high',
              read: false,
            });
          });
          purchaseRequestResolver.forEach((resolveruser) => {
            if (resolveruser.email) {
              emails.push({
                to: resolveruser.email,
                subject: `New Purchase Request - ${productInfo}`,
                html: buildB2BEmailTemplate({
                title: 'New Purchase Request',
                badge: 'Admin Review',
                productInfo,
                skuInfo,
                storeName: store?.name,
                vendorWarehouseName: populated.vendorWarehouseId?.name,
                quantity: request.quantity,
                status: request.status,
                requestedBy: requester?.username || 'N/A',
                requestedByEmail: requester?.email || '',
                orderUrl,
                imageUrl,
                urgentNote: true,
                request,
                sku,
                product: vendorProduct,
              }),
              
              
              });
            }
          });
              purchaseRequestResolver.forEach((resolveruser) => {
              notifications.push({
              user: resolveruser._id,
              type: 'ORDER',
              content: purchaseNotify(`New purchase request from ${requester?.username || 'Store Manager'} — review required.`),
              resourceId: request._id,
              resourceModel: 'B2BPurchaseRequest',
              priority: 'high',
              read: false,
            });
          });


          if (dm) {
            notifications.push({
              user: dm._id,
              content: purchaseNotify(`New purchase request from ${requester?.username || 'Store Manager'} — DM action required.`),
              url: requestLink,
              read: false,
            });
            if (dm.email) {
              emails.push({
                to: dm.email,
                subject: `New Purchase Request - ${productInfo}`,
                html: buildB2BEmailTemplate({
                title: 'New Purchase Request',
                badge: 'DM Action Required',
                productInfo,
                skuInfo,
                storeName: store?.name,
                vendorWarehouseName: populated.vendorWarehouseId?.name,
                quantity: request.quantity,
                status: request.status,
                requestedBy: requester?.username || 'N/A',
                requestedByEmail: requester?.email || '',
                orderUrl,
                imageUrl,
                urgentNote: true,
                request,
                sku,
                product: vendorProduct,
              }),
                
               
              });
            }
          }
          if (cm) {
            notifications.push({
              user: cm._id,
              content: purchaseNotify(`New purchase request from ${requester?.username || 'Store Manager'} — CM action required.`),
              url: requestLink,
              read: false,
            });
            if (cm.email) {
              emails.push({
                to: cm.email,
                subject: `New Purchase Request - ${productInfo}`,
                html: buildB2BEmailTemplate({
                title: 'New Purchase Request',
                badge: 'CM Action Required',
                productInfo,
                skuInfo,
                storeName: store?.name,
                vendorWarehouseName: populated.vendorWarehouseId?.name,
                quantity: request.quantity,
                status: request.status,
                requestedBy: requester?.username || 'N/A',
                requestedByEmail: requester?.email || '',
                orderUrl,
                imageUrl,
                urgentNote: true,
                request,
                sku,
                product: vendorProduct,
              }),
              
              
               
              });
            }
          }
          break;
        }
        case 'DM_APPROVED': {
          const actorName = actor?.username || 'District Manager';
          // Notify CM, Admin, Store Manager
          if (cm) {
            notifications.push({
              user: cm._id,
              content: purchaseNotify(`DM ${actorName} approved this purchase request. Awaiting your approval.`, {
                approvedBy: actorName,
              }),
              url: requestLink,
              read: false,
            });
            if (cm.email) {
              emails.push({
                to: cm.email,
                subject: `Request Approved by DM - ${productInfo}`,
                html: `
                  <h2>DM Approval Received</h2>
                  <p><strong>Store:</strong> ${store?.name || 'N/A'}</p>
                  <p><strong>Product:</strong> ${productInfo}</p>
                  <p><strong>${skuInfo}</strong></p>
                  <p><strong>Approved By:</strong> ${actorName}</p>
                  <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}${requestLink}">Review Request</a></p>
                `,
              });
            }
          }
          admins.forEach((admin) => {
            notifications.push({
              user: admin._id,
              type: 'ORDER',
              content: purchaseNotify(`DM ${actorName} approved this purchase request.`, { approvedBy: actorName }),
              resourceId: request._id,
              resourceModel: 'B2BPurchaseRequest',
              priority: 'medium',
              read: false,
            });    

          });
          
          purchaseRequestResolver.forEach((resolveruser) => {
            notifications.push({
              user: resolveruser._id,
              type: 'ORDER',
              content: purchaseNotify(`DM ${actorName} approved this purchase request.`, { approvedBy: actorName }),
              resourceId: request._id,
              resourceModel: 'B2BPurchaseRequest',
              priority: 'medium',
              read: false,
            });    

          });
          if (requester) {
            notifications.push({
              user: requester._id,
              content: purchaseNotify(`Your purchase request was approved by DM ${actorName}.`, { approvedBy: actorName }),
              url: requestLink,
              read: false,
            });
            if (requester.email) {
              emails.push({
                to: requester.email,
                subject: `Purchase Request Approved by DM - ${productInfo}`,
                html: buildB2BEmailTemplate({
                title: 'Request Approved by District Manager',
                badge: 'Approval Update',
                productInfo,
                skuInfo,
                storeName: store?.name,
                vendorWarehouseName: populated.vendorWarehouseId?.name,
                quantity: request.quantity,
                status: request.status,
                requestedBy: requester?.username || 'N/A',
                requestedByEmail: requester?.email || '',
                approvedBy: actorName,
                orderUrl,
                imageUrl,
                urgentNote: true,
                request,
                sku,
                product: vendorProduct,
              }),
               
              });
            }
          }
          break;
        }
        case 'CM_APPROVED': {
          const actorName = actor?.username || 'Corporate Manager';
          // Notify Admin, Store Manager
          admins.forEach((admin) => {
            notifications.push({
              user: admin._id,
              type: 'ORDER',
              content: purchaseNotify(`CM ${actorName} approved this purchase request. Awaiting final admin approval.`, {
                approvedBy: actorName,
              }),
              resourceId: request._id,
              resourceModel: 'B2BPurchaseRequest',
              priority: 'high',
              read: false,
            });
          });
          purchaseRequestResolver.forEach((resolveruser) => {
            notifications.push({
              user: resolveruser._id,
              type: 'ORDER',
              content: purchaseNotify(`CM ${actorName} approved this purchase request. Awaiting final admin approval.`, {
                approvedBy: actorName,
              }),
              resourceId: request._id,
              resourceModel: 'B2BPurchaseRequest',
              priority: 'high',
              read: false,
            });
          });
          if (requester) {
            notifications.push({
              user: requester._id,
              content: purchaseNotify(`Your purchase request was approved by CM ${actorName}. Awaiting admin approval.`, {
                approvedBy: actorName,
              }),
              url: requestLink,
              read: false,
            });
            if (requester.email) {
              emails.push({
                to: requester.email,
                subject: `Purchase Request Approved by CM - ${productInfo}`,
                html: buildB2BEmailTemplate({
                title: 'Request Approved by Corporate Manager',
                badge: 'Awaiting Admin Approval',
                productInfo,
                skuInfo,
                storeName: store?.name,
                quantity: request.quantity,
                status: request.status,
                requestedBy: requester?.username || 'N/A',
                approvedBy: actorName,
                orderUrl,
                imageUrl,
                vendorWarehouseName: populated.vendorWarehouseId?.name,
                requestedByEmail: requester?.email || '',
                urgentNote: true,
                request,
                sku,
                product: vendorProduct,
              }),
                
               
              });
            }
          }
          break;
        }
        case 'ADMIN_APPROVED': {
          const actorName = actor?.username || 'Admin';
          // Notify Store Manager, DM, CM, Vendor (if applicable)
          if (requester) {
            notifications.push({
              user: requester._id,
              content: purchaseNotify('Your purchase request was FINALLY APPROVED by Admin. Inventory added to store.', {
                approvedBy: actorName,
                status: 'APPROVED - Inventory added to store',
              }),
              url: requestLink,
              read: false,
            });
            if (requester.email) {
              emails.push({
                to: requester.email,
                subject: `Purchase Request APPROVED - ${productInfo}`,
                html: buildB2BEmailTemplate({
                title: 'Purchase Request Approved',
                badge: 'Inventory Added to Store',
                productInfo,
                skuInfo,
                storeName: store?.name,
                quantity: request.quantity,
                status: 'APPROVED - Inventory added to store',
                requestedBy: requester?.username || 'N/A',
                approvedBy: actorName,
                orderUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/marketplace/store-inventory`,
                imageUrl,
                vendorWarehouseName: populated.vendorWarehouseId?.name, 
                product: vendorProduct,
                requestedByEmail: requester?.email || '',
                urgentNote: false,
                request,
                sku,
              }),
              
               
              });
            }
          }
          if (dm) {
            notifications.push({
              user: dm._id,
              content: purchaseNotify(`Purchase request approved by Admin. Inventory moved to ${store?.name || 'store'}.`, {
                approvedBy: actorName,
                status: 'APPROVED - Inventory added to store',
              }),
              url: requestLink,
              read: false,
            });
          }
          if (cm) {
            notifications.push({
              user: cm._id,
              content: purchaseNotify(`Purchase request approved by Admin. Inventory moved to ${store?.name || 'store'}.`, {
                approvedBy: actorName,
                status: 'APPROVED - Inventory added to store',
              }),
              url: requestLink,
              read: false,
            });
          }
          break;
        }
        case 'REJECTED': {
          const actorName = actor?.username || 'Approver';
          const reason = request.rejection?.reason || 'No reason provided';
          // Notify Store Manager, DM, CM, Admin
          if (requester) {
            notifications.push({
              user: requester._id,
              content: purchaseNotify(`Your purchase request was REJECTED by ${actorName}.`, {
                approvedBy: actorName,
                status: 'REJECTED',
                reason,
              }),
              url: requestLink,
              read: false,
            });
            if (requester.email) {
              emails.push({
                to: requester.email,
                subject: `Purchase Request Rejected - ${productInfo}`,
                html: buildB2BEmailTemplate({
                title: 'Purchase Request Rejected',
                badge: 'Request Rejected',
                productInfo,
                skuInfo,
                storeName: store?.name,
                quantity: request.quantity,
                status: 'REJECTED',
                requestedBy: requester?.username || 'N/A',
                approvedBy: actorName,
                reason,
                orderUrl,
                imageUrl,
                vendorWarehouseName: populated.vendorWarehouseId?.name,
                requestedByEmail: requester?.email || '',
                urgentNote: false,
                request,
                sku,
                product: vendorProduct,
              }),
               
              });
            }
          }
          break;
        }
      }

      // Save notifications (non-blocking)
      if (notifications.length > 0) {
        const customerNotifications = notifications.filter((n) => !n.type).map(({ user, content, url, read }) => ({
          user,
          content,
          url,
          read,
        }));
        const adminNotifications = notifications.filter((n) => n.type).map(({ user, type, content, resourceId, resourceModel, priority, read }) => ({
          user,
          type,
          content,
          resourceId,
          resourceModel,
          priority,
          read,
        }));

        await Promise.all([
          customerNotifications.length > 0 ? Notification.insertMany(customerNotifications) : Promise.resolve(),
          adminNotifications.length > 0 ? AdminNotification.insertMany(adminNotifications) : Promise.resolve(),
        ]);
      }
      //   console.log('email debug:', {
      //   event,
      //   requestId: String(request._id),
      //   requesterEmail: requester?.email,
      //   dmEmail: dm?.email,
      //   cmEmail: cm?.email,
      //   adminCount: admins.length,
      //   emailsCount: emails.length,
      //   emailsTo: emails.map((e) => e.to),
      // });

      // Send emails (non-blocking, fire and forget)
      if (emails.length > 0) {
        // Promise.all(emails.map((mail) => sendEmail(mail))).catch((err) => console.error('email error:', err));
        Promise.all(emails.map((mail) => sendEmail(mail))).then((results) => {
        // console.log('email results:', results);

        const failed = results.filter((r) => !r.success);
        if (failed.length) {
          console.error('failed emails:', failed);
        }
      }).catch((err) => {
        console.error('email error:', err);
      });
      }
    } catch (error) {
      console.error('notification error:', error);
      // Don't throw - notifications are non-critical
    }
  };

/**
 * POST /api/v2/b2b/purchase
 *
 * Store Manager initiates purchase request from cart (pending DM approval)
 * 
 * Supports two modes:
 * 1. Cart-based (recommended): { cartId } - creates requests for all cart items
 * 2. Single-item (backward compatible): { vendorProductId, skuId, quantity, storeWarehouseId }
 */

const inventoryCounter = require("../models/InvCounter.model");

const generateOrderNumber = async () => {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  const counter = await inventoryCounter.findByIdAndUpdate(
    `B2B-ORDER`,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const serial = String(counter.seq).padStart(7, "0");

  return `INV-${year}-${month}-${serial}`;
};

const createPurchaseRequest = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const { cartId, vendorProductId, skuId, quantity, storeWarehouseId } = req.body || {};

    // Determine selected warehouse
    const selectedWarehouse = req.user?.selectedWarehouse ? String(req.user.selectedWarehouse) : null;
    const userWarehouses = Array.isArray(req.user?.warehouse) ? req.user.warehouse.map((w) => String(w)) : [];
    let storeWh = storeWarehouseId ? String(storeWarehouseId) : selectedWarehouse || userWarehouses[0] || null;

    if (!storeWh || !isObjectId(storeWh)) {
      return res.status(400).json({
        success: false,
        message: 'No warehouse selected. Please select a warehouse first.',
        data: { requiresWarehouseSelection: true },
      });
    }

    const ownsStore = (selectedWarehouse && selectedWarehouse === storeWh) || userWarehouses.includes(storeWh);
    if (!actor?.isSuperUser && !ownsStore) {
      return res.status(403).json({ success: false, message: 'You are not allowed to purchase for this store warehouse' });
    }

    // Mode 1: Cart-based purchase (multi-item)
    if (cartId) {
      if (!isObjectId(cartId)) {
        return res.status(400).json({ success: false, message: 'Invalid cartId' });
      }

      const cart = await B2BCart.findOne({
        _id: cartId,
        customer: actor.id,
        storeWarehouseId: storeWh,
      })
        .populate('items.vendorProductId', '_id vendorModel title')
        .populate('items.skuId', '_id sku productId price currency')
        .lean();

      if (!cart) {
        return res.status(404).json({ success: false, message: 'Cart not found or does not belong to you' });
      }

      if (!cart.items || cart.items.length === 0) {
        return res.status(400).json({ success: false, message: 'Cart is empty' });
      }

      // Validate wallet balance
      const inventoryWallet = await InventoryWallet.findOne({ warehouse: storeWh }).lean();
      const walletBalance = inventoryWallet?.balance || 0;
      const cartTotal = cart.subtotal || 0;

      if (walletBalance < cartTotal) {
        return res.status(400).json({
          success: false,
          message: `Insufficient wallet balance. Available: ${walletBalance.toFixed(2)}, Required: ${cartTotal.toFixed(2)}`,
          data: { walletBalance, required: cartTotal, shortfall: cartTotal - walletBalance },
        });
      }

      // Validate all SKUs have sufficient vendor inventory
      const storeWarehouse = await Warehouse.findById(storeWh)
        .select('_id name districtManager corporateManager isMain isActive requireDMApproval requireCMApproval')
        .lean();

      if (!storeWarehouse) return res.status(404).json({ success: false, message: 'Store warehouse not found' });
      if (storeWarehouse.isActive === false) {
        return res.status(400).json({ success: false, message: 'Store warehouse is not active' });
      }

      const dmUserId = storeWarehouse.districtManager;
      const cmUserId = storeWarehouse.corporateManager;
  

      const requireDM = storeWarehouse.requireDMApproval !== false;
      const requireCM = storeWarehouse.requireCMApproval !== false;
  

      let initialStatus = 'PENDING_ADMIN'; // default

      if (requireDM && dmUserId && requireCM && cmUserId) {
        initialStatus = 'PENDING_DM';
      } else if (requireDM && dmUserId && (!requireCM || !cmUserId)) {
        initialStatus = 'PENDING_DM';
      } else if ((!requireDM || !dmUserId) && requireCM && cmUserId) {
        initialStatus = 'PENDING_CM';
      } else {
        initialStatus = 'PENDING_ADMIN';
      }

      // Validate inventory for all items
      const inventoryChecks = await Promise.all(
        cart.items.map(async (item) => {
          // Use cart item's warehouseId (from your cart)
          const warehouseId = item.warehouseId || item.vendorWarehouseId || null;
          const available = warehouseId ? await sumSkuInventory(item.skuId._id, warehouseId) : 0;

          // console.log(`[Inventory Check] SKU: ${item.skuId._id}, Warehouse: ${warehouseId}, Available: ${available}, Requested: ${item.quantity}`);

          return {
            item,
            available,
            requested: item.quantity,
            sufficient: available >= item.quantity,
            warehouseId, // now properly set
          };
        })
      );

      const insufficientItems = inventoryChecks.filter((check) => !check.sufficient);
      if (insufficientItems.length > 0) {
        const details = insufficientItems.map(
          (check) =>
            `SKU ${check.item.skuId._id}: Available=${check.available}, Requested=${check.requested}, Warehouse=${check.warehouseId || 'N/A'}`
        );

        console.error('[Insufficient Stock]', details);

        return res.status(400).json({
          success: false,
          message: 'Insufficient vendor stock for some items',
          data: { insufficientItems: details },
        });
      }


      // Create purchase requests for each cart item
      const createdRequests = [];
      for (const item of cart.items) {
      if (!item.warehouseId) {
        return res.status(400).json({
          success: false,
          message: `Vendor warehouse missing for SKU ${item.skuId.sku}`,
        });
      }
        const orderNumber = await generateOrderNumber();

        const request = await B2BPurchaseRequest.create({
          orderNumber,
          vendorProductId: item.vendorProductId._id,
          skuId: item.skuId._id,
          vendorWarehouseId: item.warehouseId,
          quantity: item.quantity,
          storeId: storeWarehouse._id,
          storeWarehouseId: storeWarehouse._id,
          dmUserId : dmUserId || null,
          cmUserId : cmUserId || null,
          status: initialStatus,
          requestedBy: actor.id,
          requestedByModel: actor.model,
          approvals: {},
          cartId: cart._id, // Track which cart this came from
          cartItemPrice: item.price, // Store price at time of request
          cartItemCurrency: item.currency || 'USD',
        });
        createdRequests.push(request);

        // Notify DM/CM (non-blocking)
        notifyB2BEvent({ event: 'REQUEST_CREATED', request, actor }).catch((err) => console.error('Notification error:', err));
      }

      // Clear cart after successful request creation
      await B2BCart.findByIdAndUpdate(cart._id, { items: [], subtotal: 0 });

      return res.status(201).json({
        success: true,
        message: `Purchase requests created (${createdRequests.length} items)`,
        data: {
            requests: createdRequests.map((r) => ({
              id: r._id,
              orderNumber: r.orderNumber,
            })),
          status: initialStatus,
          totalAmount: cartTotal,
          walletBalance,
          remainingBalance: walletBalance - cartTotal,
        },
      });
    }

    // Mode 2: Single-item purchase (backward compatible)
    if (!isObjectId(vendorProductId) || !isObjectId(skuId)) {
      return res.status(400).json({ success: false, message: 'Invalid vendorProductId/skuId or provide cartId' });
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ success: false, message: 'Quantity must be a positive number' });
    }

    const [vendorProduct, sku, storeWarehouse] = await Promise.all([
      VendorProduct.findById(vendorProductId).select('_id vendorModel title').lean(),
      Sku.findById(skuId).select('_id sku productId price currency metalColor metalType size').lean(),
      Warehouse.findById(storeWh).select('_id name districtManager corporateManager isMain isActive requireDMApproval requireCMApproval').lean(),
    ]);

    if (!vendorProduct) return res.status(404).json({ success: false, message: 'Vendor product not found' });
    if (!sku) return res.status(404).json({ success: false, message: 'SKU not found' });
    if (String(sku.productId) !== String(vendorProduct._id)) {
      return res.status(400).json({ success: false, message: 'SKU does not belong to the provided vendor product' });
    }
    if (!storeWarehouse) return res.status(404).json({ success: false, message: 'Store warehouse not found' });
    if (storeWarehouse.isActive === false) {
      return res.status(400).json({ success: false, message: 'Store warehouse is not active' });
    }

    const available = await sumSkuInventory(sku._id, vendorWarehouseId);
    if (available < qty) {
      return res.status(400).json({
        success: false,
        message: `Insufficient vendor stock. Available=${available}, requested=${qty}`,
        data: { available, requested: qty, warehouse: vendorWarehouseId },
      });
    }

    // Validate wallet balance for single item
    const itemTotal = sku.price * qty;
    const inventoryWallet = await InventoryWallet.findOne({ warehouse: storeWh }).lean();
    const walletBalance = inventoryWallet?.balance || 0;

    if (walletBalance < itemTotal) {
      return res.status(400).json({
        success: false,
        message: `Insufficient wallet balance. Available: ${walletBalance.toFixed(2)}, Required: ${itemTotal.toFixed(2)}`,
        data: { walletBalance, required: itemTotal, shortfall: itemTotal - walletBalance },
      });
    }

    const dmUserId = storeWarehouse.districtManager || null;
    const cmUserId = storeWarehouse.corporateManager || null;

    const requireDM = storeWarehouse.requireDMApproval !== false; // Default true if not set
    const requireCM = storeWarehouse.requireCMApproval !== false; // Default true if not set

    let initialStatus = 'PENDING_ADMIN'; // default if no DM/CM exists

      if (requireDM && dmUserId && requireCM && cmUserId) {
        initialStatus = 'PENDING_DM'; // DM -> CM -> Admin
      } else if (requireDM && dmUserId && (!requireCM || !cmUserId)) {
        initialStatus = 'PENDING_DM'; // DM -> Admin
      } else if ((!requireDM || !dmUserId) && requireCM && cmUserId) {
        initialStatus = 'PENDING_CM'; // CM -> Admin
      } 


    const { vendorWarehouseId } = req.body;
    if (!isObjectId(vendorWarehouseId)) {
    return res.status(400).json({
      success: false,
      message: 'vendorWarehouseId required',
    });
    }
    const orderNumber = await generateOrderNumber();

    const created = await B2BPurchaseRequest.create({
      orderNumber,
      vendorProductId: vendorProduct._id,
      skuId: sku._id,
      vendorWarehouseId,
      quantity: qty,
      storeId: storeWarehouse._id,
      storeWarehouseId: storeWarehouse._id,
      dmUserId,
      cmUserId,
      status: initialStatus,
      requestedBy: actor.id,
      requestedByModel: actor.model,
      approvals: {},
      cartItemPrice: sku.price,
      cartItemCurrency: sku.currency || 'USD',
    });

    // Notify DM/CM on request creation (non-blocking)
    notifyB2BEvent({ event: 'REQUEST_CREATED', request: created, actor }).catch((err) => console.error('Notification error:', err));

    return res.status(201).json({
      success: true,
      message: 'Purchase request created',
      purchaseId: created._id,
      orderNumber: created.orderNumber,
      status: created.status,
      data: {
        requestId: created._id,
        status: created.status,
        vendorProduct: { _id: vendorProduct._id, vendorModel: vendorProduct.vendorModel, title: vendorProduct.title },
        sku: { _id: sku._id, sku: sku.sku },
        storeWarehouse: { _id: storeWarehouse._id, name: storeWarehouse.name },
        totalAmount: itemTotal,
        walletBalance,
        remainingBalance: walletBalance - itemTotal,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create purchase request', error: error.message });
  }
};

/**
 * GET /api/v2/b2b/status/:purchaseId
 * - Store manager can poll status
 * - Approvers/admin can also view
 */
const getPurchaseStatus = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const role = String(actor?.roleName || '').toLowerCase().trim();
    const { purchaseId } = req.params;
    if (!isObjectId(purchaseId)) return res.status(400).json({ success: false, message: 'Invalid purchaseId' });

    const request = await B2BPurchaseRequest.findById(purchaseId)
      .populate('vendorProductId', 'vendorModel title brand category')
      .populate('skuId', 'sku price currency metalColor metalType size attributes images')
      .populate('storeWarehouseId', 'name isMain')
      .populate('vendorWarehouseId', 'name')
      .populate('dmUserId', 'username email')
      .populate('cmUserId', 'username email')
      .lean();

    if (!request) return res.status(404).json({ success: false, message: 'Purchase request not found' });

    // const isAdminViewer =
    //   !!actor?.isSuperUser ||
    //   role === 'admin' ||
    //   role === 'super admin' ||
    //   role === 'superuser';

    // const canView =
    //   isAdminViewer ||
    //   String(request.requestedBy) === String(actor.id) ||
    //   String(request.dmUserId?._id || request.dmUserId) === String(actor.id) ||
    //   String(request.cmUserId?._id || request.cmUserId) === String(actor.id);
    
    const isAdminViewer =
      !!actor?.isSuperUser ||
      !!req.user?.is_superuser ||
      role === 'admin' ||
      role === 'super admin' ||
      role === 'superuser';

    const actorId = String(actor?.id || req.user?._id || req.user?.id || '');

    const getId = (value) => String(value?._id || value || '');

    const userWarehouses = Array.isArray(req.user?.warehouse)
      ? req.user.warehouse.map((w) => String(w?._id || w))
      : [];

    const selectedWarehouse = req.user?.selectedWarehouse
      ? String(req.user.selectedWarehouse?._id || req.user.selectedWarehouse)
      : null;

    const canView =
      isAdminViewer ||
      !!req.user?.is_superuser ||
      getId(request.requestedBy) === actorId ||
      getId(request.dmUserId) === actorId ||
      getId(request.cmUserId) === actorId ||
      getId(request.storeWarehouseId) === selectedWarehouse ||
      userWarehouses.includes(getId(request.storeWarehouseId));

    //   console.log('canView debug:', {
    //   actorId,
    //   role,
    //   isAdminViewer,
    //   requestedBy: getId(request.requestedBy),
    //   dmUserId: getId(request.dmUserId),
    //   cmUserId: getId(request.cmUserId),
    //   storeWarehouseId: getId(request.storeWarehouseId),
    //   selectedWarehouse,
    //   userWarehouses,
    // });
    if (!canView) return res.status(403).json({ success: false, message: 'Access denied' });
    
    // const skuObjectId = request.skuId?._id || request.skuId;

    // const inventories = skuObjectId
    //   ? await SkuInventory.find({ skuId: skuObjectId })
    //       .select('quantity')
    //       .lean()
    //   : [];

    // const vendorStock = inventories.reduce(
    //   (sum, inv) => sum + Number(inv.quantity || 0),
    //   0
    // );
    const skuObjectId = request.skuId?._id || request.skuId;
    const vendorWarehouseId = request.vendorWarehouseId;

    const inventories = skuObjectId && vendorWarehouseId
      ? await SkuInventory.find({
          skuId: skuObjectId,
          warehouse: vendorWarehouseId,
        })
          .select('quantity')
          .lean()
      : [];

    const vendorStock = inventories.reduce(
      (sum, inv) => sum + Number(inv.quantity || 0),
      0
    );

    const [withRequester] = await resolveRequestedByDetails([request]);
    const data = {
    ...withRequester,
    vendorStock,
    availableVendorStock: vendorStock,
    insufficientVendorStock: Number(withRequester.quantity || 0) > vendorStock,
    shortageQuantity: Math.max(0, Number(withRequester.quantity || 0) - vendorStock),
    };

    return res.status(200).json({
      success: true,
      message: 'Status retrieved',
      status: data.status,
      data,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch purchase status', error: error.message });
  }
};

/**
 * GET /api/v2/b2b/requests
 *
 * view=my-orders:
 *   - scope=mine (default): requestedBy = actor
 *   - scope=store: storeWarehouseId = JWT selected warehouse
 *
 * view=approvals:
 *   - DM: all requests where dmUserId = actor (any status unless ?status= narrows)
 *   - CM: all requests where cmUserId = actor
 *   - Admin: all requests (any status unless ?status=), optional storeWarehouseId
 *
 * Optional: status=PENDING_DM,PENDING_ADMIN,... (comma-separated)
 * Optional (admin): storeWarehouseId=<id>
 * Optional: startDate=YYYY-MM-DD, endDate=YYYY-MM-DD (filters on createdAt)
 */
// const listPurchaseRequests = async (req, res) => {
//   try {
//     const actor = req.b2bActor;
//     const role = String(actor?.roleName || '').toLowerCase().trim();

//     const view = String(req.query.view || 'approvals').toLowerCase().trim();
//     const statusParam = String(req.query.status || '').trim();
//     const statusList = statusParam
//       ? statusParam
//           .split(',')
//           .map((s) => s.trim().toUpperCase())
//           .filter(Boolean)
//       : [];

//     const filter = {};

//     if (actor?.isSuperUser || role === 'admin') {
//       // Admin can view everything; default to PENDING_ADMIN if no explicit status
//       if (statusList.length) filter.status = { $in: statusList };
//       else filter.status = 'PENDING_ADMIN';

//       if (req.query.storeWarehouseId && isObjectId(req.query.storeWarehouseId)) {
//         filter.storeWarehouseId = req.query.storeWarehouseId;
//       }
//     } else if (role === 'district manager') {
//       filter.status = 'PENDING_DM';
//       filter.dmUserId = actor.id;
//     } else if (role === 'corporate manager') {
//       filter.status = 'PENDING_CM';
//       filter.cmUserId = actor.id;
//     } else {
//       // Store manager (or any other role): show own requests
//       filter.requestedBy = actor.id;
//       if (statusList.length) filter.status = { $in: statusList };
//     }

//     const requests = await B2BPurchaseRequest.find(filter)
//       .sort({ createdAt: -1 })
//       .populate('vendorProductId', 'vendorModel title brand category')
//       .populate('skuId', 'sku price currency metalColor metalType size attributes images')
//       .populate('storeWarehouseId', 'name isMain')
//       .lean();

//     const withRequester = await resolveRequestedByDetails(requests);

//     return res.status(200).json({
//       success: true,
//       message: 'Purchase requests retrieved successfully',
//       data: withRequester,
//     });
//   } catch (error) {
//     return res.status(500).json({ success: false, message: 'Failed to list purchase requests', error: error.message });
//   }
// };

const listPurchaseRequests = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const role = String(actor?.roleName || '').toLowerCase().trim();

    const view = String(req.query.view || 'approvals').toLowerCase().trim();
    // view = "my-orders" | "approvals"

    const statusParam = String(req.query.status || '').trim();
    const statusList = statusParam
      ? statusParam
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean)
      : [];

    const filter = {};
    const returnPending = String(req.query.returnPending || '').trim() === '1';

    if (returnPending) {
      filter.status = 'APPROVED';
      filter['returnRequest.status'] = 'PENDING';
    }

    if (view === 'my-orders') {
      const scope = String(req.query.scope || 'mine').toLowerCase().trim();
      if (scope === 'store') {
        const wid = selectedWarehouseObjectId(req.user);
        if (!wid) {
          return res.status(400).json({
            success: false,
            message: 'No warehouse selected. Choose a store warehouse to view store-wide orders.',
          });
        }
        filter.storeWarehouseId = wid;
      } else {
        // mine — only orders this user created
        filter.requestedBy = actor.id;
      }

      if (!returnPending && statusList.length) {
        filter.status = { $in: statusList };
      }
    } else {
      // Approval queue
      if (actor?.isSuperUser || role === 'admin') {
        if (!returnPending && statusList.length) {
          filter.status = { $in: statusList };
        }
        if (req.query.storeWarehouseId && isObjectId(req.query.storeWarehouseId)) {
          filter.storeWarehouseId = req.query.storeWarehouseId;
        }
      } else if (role === 'district manager') {
        filter.dmUserId = actor.id;
        if (!returnPending && statusList.length) {
          filter.status = { $in: statusList };
        }
      } else if (role === 'corporate manager') {
        filter.cmUserId = actor.id;
        if (!returnPending && statusList.length) {
          filter.status = { $in: statusList };
        }
      } else {
        filter.requestedBy = actor.id;

        if (!returnPending && statusList.length) {
          filter.status = { $in: statusList };
        }
      }
    }

    const startDate = String(req.query.startDate || '').trim();
    const endDate = String(req.query.endDate || '').trim();
    if (startDate) {
      const start = new Date(`${startDate}T00:00:00.000`);
      if (!Number.isNaN(start.getTime())) {
        filter.createdAt = { ...(filter.createdAt || {}), $gte: start };
      }
    }
    if (endDate) {
      const end = new Date(`${endDate}T23:59:59.999`);
      if (!Number.isNaN(end.getTime())) {
        filter.createdAt = { ...(filter.createdAt || {}), $lte: end };
      }
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const skip = (page - 1) * limit;

    const [total, requests] = await Promise.all([
      B2BPurchaseRequest.countDocuments(filter),
      B2BPurchaseRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('vendorProductId', 'vendorModel title brand category')
        .populate('skuId', 'sku price currency metalColor metalType size attributes images')
        .populate('storeWarehouseId', 'name isMain')
        .populate('vendorWarehouseId', 'name isMain')
        .lean(),
    ]);

      const skuIds = [
        ...new Set(
          requests
            .map((r) => r.skuId?._id || r.skuId)
            .filter(Boolean)
            .map(String)
        ),
      ];

      // const inventoryMap = new Map();

      // if (skuIds.length > 0) {
      //   const inventories = await SkuInventory.find({
      //     skuId: { $in: skuIds },
      //   })
      //     .select('skuId quantity')
      //     .lean();

      //   inventories.forEach((inv) => {
      //     const key = String(inv.skuId);
      //     inventoryMap.set(key, (inventoryMap.get(key) || 0) + Number(inv.quantity || 0));
      //   });
      // }
      const inventoryMap = new Map();

      const skuWarehousePairs = requests
        .map((r) => ({
          skuId: String(r.skuId?._id || r.skuId || ''),
          warehouseId: String(r.vendorWarehouseId?._id || r.vendorWarehouseId || ''),
        }))
        .filter((x) => x.skuId && x.warehouseId);

      const vendorWarehouseIds = [
        ...new Set(skuWarehousePairs.map((x) => x.warehouseId)),
      ];

      if (skuIds.length > 0 && vendorWarehouseIds.length > 0) {
        const inventories = await SkuInventory.find({
          skuId: { $in: skuIds },
          warehouse: { $in: vendorWarehouseIds },
        })
          .select('skuId warehouse quantity')
          .lean();

        inventories.forEach((inv) => {
          const key = `${String(inv.skuId)}_${String(inv.warehouse)}`;
          inventoryMap.set(key, (inventoryMap.get(key) || 0) + Number(inv.quantity || 0));
        });
      }

    const withRequester = await resolveRequestedByDetails(requests);
    const viewerModel = req.b2bActor?.model || 'User';
    const data = attachUnreadChatCount(withRequester, req.user._id, viewerModel);

    const dataWithInventory = data.map((r) => {
    const skuId = String(r.skuId?._id || r.skuId || '');
    // const vendorStock = inventoryMap.get(skuId) || 0;
    const vendorWarehouseId = String(r.vendorWarehouseId?._id || r.vendorWarehouseId || '');
    const vendorStock = inventoryMap.get(`${skuId}_${vendorWarehouseId}`) || 0;

    return {
      ...r,
      vendorStock,
      availableVendorStock: vendorStock,
      insufficientVendorStock: Number(r.quantity || 0) > vendorStock,
      shortageQuantity: Math.max(0, Number(r.quantity || 0) - vendorStock),
    };
    });

    return res.status(200).json({
      success: true,
      message: 'Purchase requests retrieved successfully',
      data: dataWithInventory,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
        hasNextPage: page * limit < total,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to list purchase requests',
      error: error.message,
    });
  }
};

const exportPurchaseRequestsCsv = async (req, res) => {
  try {
    const built = buildPurchaseRequestsFilter(req);
    if (built.error) {
      return res.status(400).json({ success: false, message: built.error });
    }
    const { filter } = built;

    const requests = await B2BPurchaseRequest.find(filter)
      .sort({ createdAt: -1 })
      .populate('vendorProductId', 'vendorModel title brand category')
      .populate('skuId', 'sku price currency metalColor metalType size attributes images')
      .populate('storeWarehouseId', 'name isMain')
      .populate('vendorWarehouseId', 'name isMain')
      .lean();

    const withRequester = await resolveRequestedByDetails(requests);
    const dataWithInventory = await attachVendorStockToRequests(withRequester);
    const csvRows = dataWithInventory.map(b2bPurchaseRequestToCsvRow);
    const parser = new Parser({ fields: B2B_PURCHASE_CSV_FIELDS });
    const csv = parser.parse(csvRows.length ? csvRows : [{}]);
    const stamp = new Date().toISOString().slice(0, 10);
    const startDate = String(req.query.startDate || '').trim();
    const endDate = String(req.query.endDate || '').trim();
    const rangeSuffix = startDate && endDate ? `-${startDate}_to_${endDate}` : '';
    const statusParam = String(req.query.status || '').trim().toLowerCase();
    const statusSuffix = statusParam ? `-${statusParam.replace(/,/g, '-')}` : '';
    const returnSuffix = String(req.query.returnPending || '').trim() === '1' ? '-return-pending' : '';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=b2b-purchase-requests${statusSuffix}${returnSuffix}${rangeSuffix}-${stamp}.csv`,
    );
    return res.status(200).send(`\uFEFF${csv}`);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to export purchase requests',
      error: error.message,
    });
  }
};

/**
 * POST /api/v2/b2b/approve/:requestId
 * DM -> PENDING_CM
 * CM -> PENDING_ADMIN
 * Admin -> APPROVED (and moves inventory)
 */
const approvePurchaseRequest = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const role = String(actor?.roleName || '').toLowerCase().trim();
    const { requestId } = req.params;
    if (!isObjectId(requestId)) return res.status(400).json({ success: false, message: 'Invalid requestId' });

    const now = new Date();

    const request = await B2BPurchaseRequest.findById(requestId);
    if (!request) return res.status(404).json({ success: false, message: 'Purchase request not found' });
    if (request.status === 'REJECTED') return res.status(400).json({ success: false, message: 'Request is rejected' });
    if (request.status === 'APPROVED') return res.status(400).json({ success: false, message: 'Request is already approved' });

    const actorId = String(actor.id);

    // DM approval (no transaction needed)
    if (role === 'district manager' && !actor.isSuperUser) {
      // if (request.status !== 'PENDING_DM') return res.status(400).json({ success: false, message: 'Request is not pending DM approval' });
      if (!['PENDING_DM', 'PENDING_CM'].includes(request.status)) {
      return res.status(400).json({
        success: false,
        message: 'Request is not pending DM/CM approval',
      });
    }
      if (String(request.dmUserId) !== actorId) return res.status(403).json({ success: false, message: 'You are not the assigned DM for this store' });

      request.approvals.dm = { userId: actor.id, userModel: actor.model, approvedAt: now };

      // Auto-skip CM if store doesn't require CM approval (v2)
      // const storeWarehouse = await Warehouse.findById(request.storeWarehouseId).select('requireCMApproval').lean();
      // const requireCM = storeWarehouse?.requireCMApproval !== false; // Default true if not set

      // if (requireCM) {
      //   request.status = 'PENDING_CM';
      // } else {
      //   request.status = 'PENDING_ADMIN'; // Skip CM, go directly to Admin
      // }
      const storeWarehouse = await Warehouse.findById(request.storeWarehouseId)
      .select('requireDMApproval requireCMApproval')
      .lean();

      const requireDM = storeWarehouse?.requireDMApproval !== false;
      const requireCM = storeWarehouse?.requireCMApproval !== false;

      // DM ne approve kar diya.
      // Agar CM bhi required hai tab bhi admin ke paas bhej do.
      request.status = 'PENDING_ADMIN';

      await request.save();

      // Notify CM, Admin, Store Manager (non-blocking)
      const dmUser = await (actor.model === 'Customer' ? Customer : User).findById(actor.id).select('username email').lean();
      notifyB2BEvent({ event: 'DM_APPROVED', request, actor: dmUser || actor }).catch((err) => console.error('Notification error:', err));

      return res.status(200).json({ success: true, message: 'Request approved by DM', data: { requestId, status: request.status } });
    }

    // CM approval (no transaction needed)
    if (role === 'corporate manager' && !actor.isSuperUser) {
      // if (request.status !== 'PENDING_CM') return res.status(400).json({ success: false, message: 'Request is not pending CM approval' });
    if (!['PENDING_DM', 'PENDING_CM'].includes(request.status)) {
    return res.status(400).json({
      success: false,
      message: 'Request is not pending DM/CM approval',
    });
  }
      if (String(request.cmUserId) !== actorId) return res.status(403).json({ success: false, message: 'You are not the assigned CM for this store' });

      request.approvals.cm = { userId: actor.id, userModel: actor.model, approvedAt: now };
      request.status = 'PENDING_ADMIN';
      await request.save();

      // Notify Admin, Store Manager (non-blocking)
      const cmUser = await (actor.model === 'Customer' ? Customer : User).findById(actor.id).select('username email').lean();
      notifyB2BEvent({ event: 'CM_APPROVED', request, actor: cmUser || actor }).catch((err) => console.error('Notification error:', err));

      return res.status(200).json({ success: true, message: 'Request approved by CM', data: { requestId, status: request.status } });
    }

    // Admin final approval (inventory mutation) — prefer transaction, fallback if unsupported
    const isAdmin = actor.isSuperUser || role === 'admin';
    if (!isAdmin) return res.status(403).json({ success: false, message: 'Admin approval required' });
    if (request.status !== 'PENDING_ADMIN') return res.status(400).json({ success: false, message: 'Request is not pending admin approval' });

    const runFinalApproval = async (session) => {
      const reqQuery = B2BPurchaseRequest.findById(requestId);
      if (session) reqQuery.session(session);
      const fresh = await reqQuery;
      if (!fresh) throw new Error('Purchase request not found');
      if (fresh.status !== 'PENDING_ADMIN') throw new Error('Request is not pending admin approval');

      const available = await sumSkuInventory(fresh.skuId,   fresh.vendorWarehouseId, session);
      if (available < fresh.quantity) {
        throw new Error(`Insufficient vendor stock at approval time. Available=${available}, requested=${fresh.quantity}`);
      }

      await deductSkuInventory({ skuId: fresh.skuId, warehouseId: fresh.vendorWarehouseId, quantity: fresh.quantity, session });

      const storeInvOpts = session ? { upsert: true, session } : { upsert: true };
      await StoreInventory.updateOne(
        {
          storeWarehouseId: fresh.storeWarehouseId,
          storeId: fresh.storeId,
          vendorProductId: fresh.vendorProductId,
          skuId: fresh.skuId,
        },
        { $inc: { quantity: fresh.quantity } },
        storeInvOpts
      );

      await incrementSkuInventoryAtWarehouse({
        skuId: fresh.skuId,
        warehouseId: fresh.storeWarehouseId,
        quantity: fresh.quantity,
        session,
      });

      // Deduct wallet balance (InventoryWallet for purchases)
      const itemTotal = (fresh.cartItemPrice || 0) * fresh.quantity;
      if (itemTotal > 0) {
        const inventoryWalletQuery = InventoryWallet.findOne({ warehouse: fresh.storeWarehouseId });
        if (session) inventoryWalletQuery.session(session);
        const inventoryWallet = await inventoryWalletQuery;

        if (!inventoryWallet) {
          throw new Error('Inventory wallet not found for store warehouse');
        }

        if (inventoryWallet.balance < itemTotal) {
          throw new Error(
            `Insufficient wallet balance at approval time. Available: ${inventoryWallet.balance}, Required: ${itemTotal}`
          );
        }

        inventoryWallet.balance -= itemTotal;
        inventoryWallet.lastTransaction = now;
        await inventoryWallet.save(session ? { session } : {});
      }

      const vendorWalletQuery = InventoryWallet.findOne({ warehouse: fresh.vendorWarehouseId });
      if (session) vendorWalletQuery.session(session);
      const vendorWallet = await vendorWalletQuery;

      if (!vendorWallet) {
        throw new Error('Inventory wallet not found for vendor warehouse');
      }
      
      // Credit vendor warehouse
      vendorWallet.balance += itemTotal;
      vendorWallet.lastTransaction = now;
      await vendorWallet.save(session ? { session } : {});


      fresh.approvals.admin = { userId: actor.id, userModel: actor.model, approvedAt: now };
      fresh.status = 'APPROVED';
      fresh.fulfillmentStatus = 'SUBMITTED';
      fresh.shippedAt = null;
      fresh.completedAt = null;
      await fresh.save(session ? { session } : {});

      // Notify Store Manager, DM, CM (non-blocking, after save)
      const adminUser = await (actor.model === 'Customer' ? Customer : User).findById(actor.id).select('username email').lean();
      notifyB2BEvent({ event: 'ADMIN_APPROVED', request: fresh, actor: adminUser || actor }).catch((err) => console.error('Notification error:', err));
    };

    try {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => runFinalApproval(session));
      } finally {
        session.endSession();
      }
    } catch (txErr) {
      // Fallback for standalone MongoDB environments (no transactions)
      const msg = String(txErr?.message || '');
      if (msg.includes('Transaction numbers are only allowed') || msg.includes('replica set')) {
        await runFinalApproval(null);
      } else {
        throw txErr;
      }
    }

    return res.status(200).json({ success: true, message: 'Request approved by Admin (inventory moved to store)', data: { requestId, status: 'APPROVED' } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/v2/b2b/reject/:requestId
 */
const rejectPurchaseRequest = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const role = String(actor?.roleName || '').toLowerCase().trim();
    const { requestId } = req.params;
    const { reason } = req.body || {};

    if (!isObjectId(requestId)) return res.status(400).json({ success: false, message: 'Invalid requestId' });

    const request = await B2BPurchaseRequest.findById(requestId);
    if (!request) return res.status(404).json({ success: false, message: 'Purchase request not found' });
    if (request.status === 'REJECTED') return res.status(400).json({ success: false, message: 'Request is already rejected' });
    if (request.status === 'APPROVED') return res.status(400).json({ success: false, message: 'Cannot reject an approved request' });

    const actorId = String(actor.id);
    const isAdmin = actor.isSuperUser || role === 'admin';

    if (!isAdmin) {
      if (request.status === 'PENDING_DM' && (role !== 'district manager' || String(request.dmUserId) !== actorId)) {
        return res.status(403).json({ success: false, message: 'Only assigned DM can reject this request' });
      }
      if (request.status === 'PENDING_CM' && (role !== 'corporate manager' || String(request.cmUserId) !== actorId)) {
        return res.status(403).json({ success: false, message: 'Only assigned CM can reject this request' });
      }
      if (request.status === 'PENDING_ADMIN') {
        return res.status(403).json({ success: false, message: 'Only admin can reject at admin stage' });
      }
    }

    request.status = 'REJECTED';
    request.rejection = {
      rejectedBy: actor.id,
      rejectedByModel: actor.model,
      rejectedAt: new Date(),
      reason: String(reason || ''),
    };
    await request.save();

    // Notify Store Manager, DM, CM, Admin (non-blocking)
    const rejectorUser = await (actor.model === 'Customer' ? Customer : User).findById(actor.id).select('username email').lean();
    notifyB2BEvent({ event: 'REJECTED', request, actor: rejectorUser || actor }).catch((err) => console.error('Notification error:', err));

    return res.status(200).json({ success: true, message: 'Purchase request rejected', data: { requestId } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to reject request', error: error.message });
  }
};

const hasApprovalStep = (step) => !!step?.approvedAt;

/** Ensure store still holds enough SKU qty to reverse an approved transfer. */
async function assertStoreHasReturnStock(fresh, session) {
  const available = await sumSkuInventory(fresh.skuId, fresh.storeWarehouseId, session);
  if (available < fresh.quantity) {
    throw new Error(
      `Insufficient stock at store to roll back. Available=${available}, required=${fresh.quantity}`,
    );
  }

  const storeInvQuery = StoreInventory.findOne({
    storeWarehouseId: fresh.storeWarehouseId,
    storeId: fresh.storeId,
    vendorProductId: fresh.vendorProductId,
    skuId: fresh.skuId,
  }).select('quantity');
  if (session) storeInvQuery.session(session);
  const storeInv = await storeInvQuery.lean();
  const storeInvQty = Number(storeInv?.quantity || 0);
  if (storeInvQty < fresh.quantity) {
    throw new Error(
      `Insufficient store inventory record. Available=${storeInvQty}, required=${fresh.quantity}`,
    );
  }
}

/** Reverse admin approval: store -> vendor inventory + wallet (same amounts as approval). */
async function reverseApprovedPurchaseInventory(fresh, session) {
  const now = new Date();
  await assertStoreHasReturnStock(fresh, session);

  await deductSkuInventory({
    skuId: fresh.skuId,
    warehouseId: fresh.storeWarehouseId,
    quantity: fresh.quantity,
    session,
  });

  const storeInvOpts = session ? { session } : {};
  await StoreInventory.updateOne(
    {
      storeWarehouseId: fresh.storeWarehouseId,
      storeId: fresh.storeId,
      vendorProductId: fresh.vendorProductId,
      skuId: fresh.skuId,
    },
    { $inc: { quantity: -fresh.quantity } },
    storeInvOpts,
  );

  await incrementSkuInventoryAtWarehouse({
    skuId: fresh.skuId,
    warehouseId: fresh.vendorWarehouseId,
    quantity: fresh.quantity,
    session,
  });

  const itemTotal = (fresh.cartItemPrice || 0) * fresh.quantity;
  if (itemTotal > 0) {
    const storeWalletQuery = InventoryWallet.findOne({ warehouse: fresh.storeWarehouseId });
    if (session) storeWalletQuery.session(session);
    let storeWallet = await storeWalletQuery;
    if (!storeWallet) {
      storeWallet = new InventoryWallet({ warehouse: fresh.storeWarehouseId, balance: 0 });
    }
    storeWallet.balance += itemTotal;
    storeWallet.lastTransaction = now;
    await storeWallet.save(session ? { session } : {});

    const vendorWalletQuery = InventoryWallet.findOne({ warehouse: fresh.vendorWarehouseId });
    if (session) vendorWalletQuery.session(session);
    const vendorWallet = await vendorWalletQuery;
    if (!vendorWallet) {
      throw new Error('Inventory wallet not found for vendor warehouse');
    }
    if (vendorWallet.balance < itemTotal) {
      throw new Error(
        `Insufficient vendor wallet balance to reverse transfer. Available: ${vendorWallet.balance}, Required: ${itemTotal}`,
      );
    }
    vendorWallet.balance -= itemTotal;
    vendorWallet.lastTransaction = now;
    await vendorWallet.save(session ? { session } : {});
  }
}

async function runWithOptionalTransaction(fn) {
  try {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => fn(session));
    } finally {
      session.endSession();
    }
  } catch (txErr) {
    const msg = String(txErr?.message || '');
    if (msg.includes('Transaction numbers are only allowed') || msg.includes('replica set')) {
      await fn(null);
    } else {
      throw txErr;
    }
  }
}

/**
 * POST /api/v2/b2b/rollback/:requestId
 * DM/CM undo their approval; Admin undo final approval (inventory + wallet reverse if store has stock).
 */
const rollbackPurchaseApproval = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const role = String(actor?.roleName || '').toLowerCase().trim();
    const { requestId } = req.params;
    if (!isObjectId(requestId)) return res.status(400).json({ success: false, message: 'Invalid requestId' });

    const request = await B2BPurchaseRequest.findById(requestId);
    if (!request) return res.status(404).json({ success: false, message: 'Purchase request not found' });
    if (request.status === 'REJECTED') {
      return res.status(400).json({ success: false, message: 'Rejected requests cannot be rolled back' });
    }
    if (request.status === 'RETURNED') {
      return res.status(400).json({ success: false, message: 'Request is already returned / rolled back' });
    }
    if (String(request.returnRequest?.status || 'NONE') === 'PENDING') {
      return res.status(400).json({
        success: false,
        message: 'A customer return is pending. Approve or reject the return request instead.',
      });
    }

    const actorId = String(actor.id);
    const isAdmin = actor.isSuperUser || role === 'admin';
    const now = new Date();

    // Admin rollback after final approval
    if (isAdmin && request.status === 'APPROVED' && hasApprovalStep(request.approvals?.admin)) {
      await runWithOptionalTransaction(async (session) => {
        const reqQuery = B2BPurchaseRequest.findById(requestId);
        if (session) reqQuery.session(session);
        const fresh = await reqQuery;
        if (!fresh || fresh.status !== 'APPROVED') throw new Error('Request is not approved');
        await reverseApprovedPurchaseInventory(fresh, session);
        fresh.approvals.admin = { userId: null, userModel: null, approvedAt: null };
        fresh.status = 'RETURNED';
        fresh.fulfillmentStatus = 'NONE';
        fresh.shippedAt = null;
        fresh.completedAt = null;
        await fresh.save(session ? { session } : {});
      });

      return res.status(200).json({
        success: true,
        message: 'Approval rolled back. Inventory and wallets reversed.',
        data: { requestId, status: 'RETURNED' },
      });
    }

    // DM rollback — only if CM and Admin have not approved
    if (role === 'district manager' && !actor.isSuperUser) {
      if (String(request.dmUserId) !== actorId) {
        return res.status(403).json({ success: false, message: 'You are not the assigned DM for this store' });
      }
      if (!hasApprovalStep(request.approvals?.dm)) {
        return res.status(400).json({ success: false, message: 'DM approval has not been recorded yet' });
      }
      if (hasApprovalStep(request.approvals?.cm)) {
        return res.status(400).json({ success: false, message: 'Cannot roll back: CM has already approved' });
      }
      if (hasApprovalStep(request.approvals?.admin) || request.status === 'APPROVED') {
        return res.status(400).json({ success: false, message: 'Cannot roll back: Admin has already approved' });
      }
      if (!['PENDING_CM', 'PENDING_ADMIN'].includes(request.status)) {
        return res.status(400).json({ success: false, message: 'Request is not in a DM-rollbackable state' });
      }

      request.approvals.dm = { userId: null, userModel: null, approvedAt: null };
      request.status = 'PENDING_DM';
      await request.save();

      return res.status(200).json({
        success: true,
        message: 'DM approval rolled back',
        data: { requestId, status: request.status },
      });
    }

    // CM rollback — only if Admin has not approved
    if (role === 'corporate manager' && !actor.isSuperUser) {
      if (String(request.cmUserId) !== actorId) {
        return res.status(403).json({ success: false, message: 'You are not the assigned CM for this store' });
      }
      if (!hasApprovalStep(request.approvals?.cm)) {
        return res.status(400).json({ success: false, message: 'CM approval has not been recorded yet' });
      }
      if (hasApprovalStep(request.approvals?.admin) || request.status === 'APPROVED') {
        return res.status(400).json({ success: false, message: 'Cannot roll back: Admin has already approved' });
      }
      if (request.status !== 'PENDING_ADMIN') {
        return res.status(400).json({ success: false, message: 'Request is not pending admin approval' });
      }

      request.approvals.cm = { userId: null, userModel: null, approvedAt: null };
      request.status = 'PENDING_CM';
      await request.save();

      return res.status(200).json({
        success: true,
        message: 'CM approval rolled back',
        data: { requestId, status: request.status },
      });
    }

    return res.status(403).json({ success: false, message: 'Rollback not allowed for your role on this request' });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/v2/b2b/return-request/:requestId
 * Store user requests return on an approved order (admin must approve).
 */
const requestPurchaseReturn = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const { requestId } = req.params;
    if (!isObjectId(requestId)) return res.status(400).json({ success: false, message: 'Invalid requestId' });

    const request = await B2BPurchaseRequest.findById(requestId);
    if (!request) return res.status(404).json({ success: false, message: 'Purchase request not found' });
    if (request.status !== 'APPROVED') {
      return res.status(400).json({ success: false, message: 'Only approved orders can be returned' });
    }
    if (String(request.returnRequest?.status || 'NONE') === 'PENDING') {
      return res.status(400).json({ success: false, message: 'Return request is already pending admin review' });
    }
    if (String(request.returnRequest?.status || 'NONE') === 'APPROVED' || request.status === 'RETURNED') {
      return res.status(400).json({ success: false, message: 'This order has already been returned' });
    }

    const actorId = String(actor.id);
    if (String(request.requestedBy) !== actorId) {
      return res.status(403).json({ success: false, message: 'Only the requester can submit a return' });
    }

    const now = new Date();
    request.returnRequest = {
      status: 'PENDING',
      requestedAt: now,
      requestedBy: actor.id,
      requestedByModel: actor.model,
      processedAt: null,
      processedBy: null,
      processedByModel: null,
      note: String(req.body?.note || '').trim(),
    };
    await request.save();

    notifyB2BEvent({ event: 'RETURN_REQUESTED', request, actor }).catch((err) => console.error('Notification error:', err));

    return res.status(200).json({
      success: true,
      message: 'Return request submitted. Awaiting admin approval.',
      data: { requestId, returnRequest: request.returnRequest },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to submit return request', error: error.message });
  }
};

/**
 * POST /api/v2/b2b/return-approve/:requestId
 * Admin approves customer return — reverses inventory/wallets at original cart price if store has stock.
 */
const approvePurchaseReturn = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const role = String(actor?.roleName || '').toLowerCase().trim();
    const isAdmin = actor.isSuperUser || role === 'admin';
    if (!isAdmin) return res.status(403).json({ success: false, message: 'Admin access required' });

    const { requestId } = req.params;
    if (!isObjectId(requestId)) return res.status(400).json({ success: false, message: 'Invalid requestId' });

    const request = await B2BPurchaseRequest.findById(requestId);
    if (!request) return res.status(404).json({ success: false, message: 'Purchase request not found' });
    if (request.status !== 'APPROVED') {
      return res.status(400).json({ success: false, message: 'Order must be approved before return can be processed' });
    }
    if (String(request.returnRequest?.status || 'NONE') !== 'PENDING') {
      return res.status(400).json({ success: false, message: 'No pending return request for this order' });
    }

    const now = new Date();

    await runWithOptionalTransaction(async (session) => {
      const reqQuery = B2BPurchaseRequest.findById(requestId);
      if (session) reqQuery.session(session);
      const fresh = await reqQuery;
      if (!fresh || fresh.status !== 'APPROVED') throw new Error('Order is not approved');
      if (String(fresh.returnRequest?.status || 'NONE') !== 'PENDING') {
        throw new Error('Return request is no longer pending');
      }

      await reverseApprovedPurchaseInventory(fresh, session);

      fresh.returnRequest.status = 'APPROVED';
      fresh.returnRequest.processedAt = now;
      fresh.returnRequest.processedBy = actor.id;
      fresh.returnRequest.processedByModel = actor.model;
      fresh.status = 'RETURNED';
      fresh.fulfillmentStatus = 'NONE';
      fresh.shippedAt = null;
      fresh.completedAt = null;
      await fresh.save(session ? { session } : {});
    });

    return res.status(200).json({
      success: true,
      message: 'Return approved. Inventory and wallets reversed at original purchase price.',
      data: { requestId, status: 'RETURNED' },
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/v2/b2b/return-reject/:requestId
 */
const rejectPurchaseReturn = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const role = String(actor?.roleName || '').toLowerCase().trim();
    const isAdmin = actor.isSuperUser || role === 'admin';
    if (!isAdmin) return res.status(403).json({ success: false, message: 'Admin access required' });

    const { requestId } = req.params;
    const { note } = req.body || {};
    if (!isObjectId(requestId)) return res.status(400).json({ success: false, message: 'Invalid requestId' });

    const request = await B2BPurchaseRequest.findById(requestId);
    if (!request) return res.status(404).json({ success: false, message: 'Purchase request not found' });
    if (String(request.returnRequest?.status || 'NONE') !== 'PENDING') {
      return res.status(400).json({ success: false, message: 'No pending return request' });
    }

    const now = new Date();
    request.returnRequest.status = 'REJECTED';
    request.returnRequest.processedAt = now;
    request.returnRequest.processedBy = actor.id;
    request.returnRequest.processedByModel = actor.model;
    request.returnRequest.note = String(note || request.returnRequest.note || '').trim();
    await request.save();

    return res.status(200).json({
      success: true,
      message: 'Return request rejected',
      data: { requestId, returnRequest: request.returnRequest },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to reject return', error: error.message });
  }
};

/**
 * GET /api/v2/b2b/store-inventory
 * Admin-only: view store inventory created from approved purchases.
 *
 * Optional query:
 * - storeWarehouseId=<id>
 */
const listStoreInventory = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const role = String(actor?.roleName || '').toLowerCase().trim();
    const isAdmin = actor.isSuperUser || role === 'admin';
    if (!isAdmin) return res.status(403).json({ success: false, message: 'Admin access required' });

    const filter = {};
    if (req.query.storeWarehouseId && isObjectId(req.query.storeWarehouseId)) {
      filter.storeWarehouseId = req.query.storeWarehouseId;
    }

    const rows = await StoreInventory.find(filter)
      .sort({ updatedAt: -1 })
      .populate('storeWarehouseId', 'name isMain')
      .populate('vendorProductId', 'vendorModel title brand category')
      .populate('skuId', 'sku price currency metalColor metalType size')
      .lean();

    return res.status(200).json({ success: true, message: 'Store inventory retrieved', data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to list store inventory', error: error.message });
  }
};

/**
 * GET /api/v2/b2b/store-inventory/my
 * Store managers can view inventory that was added to their store via approved purchase requests.
 */
const listMyStoreInventory = async (req, res) => {
  try {
    const actor = req.b2bActor;

    // Determine selected store warehouse
    const selectedWarehouse = req.user?.selectedWarehouse ? String(req.user.selectedWarehouse) : null;
    const userWarehouses = Array.isArray(req.user?.warehouse) ? req.user.warehouse.map((w) => String(w)) : [];
    const storeWarehouseId = selectedWarehouse || userWarehouses[0] || null;

    if (!storeWarehouseId || !isObjectId(storeWarehouseId)) {
      return res.status(400).json({ success: false, message: 'No store warehouse selected' });
    }

    // Non-admin users can only view their own store inventory
    if (!actor?.isSuperUser) {
      const owns = (selectedWarehouse && selectedWarehouse === String(storeWarehouseId)) || userWarehouses.includes(String(storeWarehouseId));
      if (!owns) {
        return res.status(403).json({ success: false, message: 'You are not allowed to view this store inventory' });
      }
    }

    const rows = await StoreInventory.find({ storeWarehouseId })
      .sort({ updatedAt: -1 })
      .populate('storeWarehouseId', 'name isMain')
      .populate('vendorProductId', 'vendorModel title brand category')
      .populate('skuId', 'sku price currency metalColor metalType size images')
      .lean();

    return res.status(200).json({ success: true, message: 'My store inventory retrieved', data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch my store inventory', error: error.message });
  }
};

// function canViewPurchaseRequestDoc(req, order) {
//   const actor = req.b2bActor;
//   const role = String(actor?.roleName || '').toLowerCase().trim();
//   const isAdminViewer =
//     !!actor?.isSuperUser ||
//     role === 'admin' ||
//     role === 'super admin' ||
//     role === 'superuser';
//   if (isAdminViewer) return true;
//   if (String(order.requestedBy) === String(actor.id)) return true;
//   if (String(order.dmUserId?._id || order.dmUserId) === String(actor.id)) return true;
//   if (String(order.cmUserId?._id || order.cmUserId) === String(actor.id)) return true;
//   return false;
// }
function canViewPurchaseRequestDoc(req, order) {
  const actor = req.b2bActor;
  const role = String(actor?.roleName || '').toLowerCase().trim();

  const actorId = String(actor?.id || req.user?._id || req.user?.id || '');

  const getId = (value) => String(value?._id || value || '');

  const isAdminViewer =
    !!actor?.isSuperUser ||
    !!req.user?.is_superuser ||
    role === 'admin' ||
    role === 'super admin' ||
    role === 'superuser';

  if (isAdminViewer) return true;

  if (getId(order.requestedBy) === actorId) return true;
  if (getId(order.dmUserId) === actorId) return true;
  if (getId(order.cmUserId) === actorId) return true;

  const selectedWarehouse = req.user?.selectedWarehouse
    ? String(req.user.selectedWarehouse?._id || req.user.selectedWarehouse)
    : null;

  const userWarehouses = Array.isArray(req.user?.warehouse)
    ? req.user.warehouse.map((w) => String(w?._id || w))
    : [];

  if (getId(order.storeWarehouseId) === selectedWarehouse) return true;
  if (userWarehouses.includes(getId(order.storeWarehouseId))) return true;

  return false;
}

function sanitizeChatAttachments(rawAttachments) {
  if (!Array.isArray(rawAttachments)) return [];
  return rawAttachments
    .slice(0, 4)
    .map((a) => ({
      name: String(a?.name || '').slice(0, 180),
      url: String(a?.url || '').trim(),
      mimeType: String(a?.mimeType || '').slice(0, 120),
      size: Number(a?.size || 0),
    }))
    .filter((a) => a.url);
}

function sanitizeChatVoice(rawVoice) {
  if (!rawVoice || typeof rawVoice !== 'object') return null;
  const url = String(rawVoice.url || '').trim();
  if (!url) return null;
  return {
    name: String(rawVoice.name || '').slice(0, 180),
    url,
    mimeType: String(rawVoice.mimeType || '').slice(0, 120),
    size: Number(rawVoice.size || 0),
    durationMs: Number(rawVoice.durationMs || 0),
  };
}

function toChatPayload(message) {
  return {
    _id: message._id,
    text: message.text,
    role: message.role,
    senderId: message.senderId,
    senderName: message.senderName,
    replyToMessageId: message.replyToMessageId || null,
    replyToText: message.replyToText || '',
    replyToSenderName: message.replyToSenderName || '',
    attachments: Array.isArray(message.attachments) ? message.attachments : [],
    voice: message.voice || null,
    seenBy: Array.isArray(message.seenBy) ? message.seenBy : [],
    createdAt: message.createdAt,
  };
}

/**
 * PATCH /api/v2/b2b/requests/:purchaseId/fulfillment
 * Admin sets shipping / fulfillment status (including rollback).
 */
const patchPurchaseFulfillment = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const role = String(actor?.roleName || '').toLowerCase().trim();
    const isAdmin =
      actor.isSuperUser ||
      role === 'admin' ||
      role === 'super admin' ||
      role === 'superuser' ||
      !!req.user?.is_superuser;
    if (!isAdmin) return res.status(403).json({ success: false, message: 'Admin only' });

    const { purchaseId } = req.params;
    if (!isObjectId(purchaseId)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const next = String(req.body?.fulfillmentStatus || '').trim().toUpperCase();
    const allowed = ['SUBMITTED', 'IN_PROCESS', 'SHIPPED', 'COMPLETED'];
    if (!allowed.includes(next)) {
      return res.status(400).json({ success: false, message: `Use one of: ${allowed.join(', ')}` });
    }

    const order = await B2BPurchaseRequest.findById(purchaseId);
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    if (order.status !== 'APPROVED') {
      return res.status(400).json({ success: false, message: 'Fulfillment only for approved requests' });
    }

    order.fulfillmentStatus = next;
    if (next === 'SHIPPED') {
      order.shippedAt = new Date();
    } else {
      order.shippedAt = null;
    }
    if (next === 'COMPLETED') {
      order.completedAt = new Date();
    } else {
      order.completedAt = null;
    }
    await order.save();

    const populated = await B2BPurchaseRequest.findById(order._id)
      .populate('vendorProductId', 'vendorModel title brand category')
      .populate('skuId', 'sku price currency metalColor metalType size attributes images')
      .populate('storeWarehouseId', 'name isMain')
      .lean();
    const [withR] = await resolveRequestedByDetails([populated]);

    return res.status(200).json({ success: true, data: withR });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/v2/b2b/requests/:purchaseId/mark-received
 * Requester confirms receipt → COMPLETED (only when fulfillment is SHIPPED).
 */
const markPurchaseReceived = async (req, res) => {
  try {
    const actor = req.b2bActor;
    const { purchaseId } = req.params;
    if (!isObjectId(purchaseId)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const order = await B2BPurchaseRequest.findById(purchaseId);
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    if (String(order.requestedBy) !== String(actor.id)) {
      return res.status(403).json({ success: false, message: 'Only the requester can confirm receipt' });
    }
    if (order.status !== 'APPROVED') {
      return res.status(400).json({ success: false, message: 'Only approved orders' });
    }
    const fs = order.fulfillmentStatus || 'SUBMITTED';
    if (fs !== 'SHIPPED') {
      return res.status(400).json({
        success: false,
        message: 'Confirm receipt only after the order is marked shipped',
      });
    }

    order.fulfillmentStatus = 'COMPLETED';
    order.completedAt = new Date();
    await order.save();

    const populated = await B2BPurchaseRequest.findById(order._id)
      .populate('vendorProductId', 'vendorModel title brand category')
      .populate('skuId', 'sku price currency metalColor metalType size attributes images')
      .populate('storeWarehouseId', 'name isMain')
      .lean();
    const [withR] = await resolveRequestedByDetails([populated]);

    return res.status(200).json({ success: true, message: 'Marked complete', data: withR });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const listB2bPurchaseChatMessages = async (req, res) => {
  try {
    const { purchaseId } = req.params;
    if (!isObjectId(purchaseId)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const order = await B2BPurchaseRequest.findById(purchaseId).select('requestedBy dmUserId cmUserId storeWarehouseId  chatMessages status').lean();
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    if (!canViewPurchaseRequestDoc(req, order)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const messages = Array.isArray(order.chatMessages)
      ? order.chatMessages.map((m) => toChatPayload(m))
      : [];
    return res.status(200).json({ success: true, data: messages });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const postB2bPurchaseChatMessage = async (req, res) => {
  try {
    const { purchaseId } = req.params;
    if (!isObjectId(purchaseId)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const text = String(req.body?.text || '').trim();
    const replyToMessageIdRaw = req.body?.replyToMessageId;
    const attachments = sanitizeChatAttachments(req.body?.attachments);
    const voice = sanitizeChatVoice(req.body?.voice);
    if (!text) return res.status(400).json({ success: false, message: 'Message required' });
    if (text.length > 4000) return res.status(400).json({ success: false, message: 'Message too long' });

    const order = await B2BPurchaseRequest.findById(purchaseId);
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    if (!canViewPurchaseRequestDoc(req, order.toObject())) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (order.status === 'REJECTED') {
      return res.status(400).json({ success: false, message: 'Chat closed for rejected requests' });
    }

    const actor = req.b2bActor;
    const role = String(actor?.roleName || '').toLowerCase().trim();
    const isAdmin =
      !!actor?.isSuperUser ||
      !!req.user?.is_superuser ||
      role === 'admin' ||
      role === 'super admin' ||
      role === 'superuser';
    const chatRole = isAdmin ? 'admin' : 'user';
    const senderName =
      req.user.username || req.user.email || (isAdmin ? 'Admin' : 'User');

    let replyToMessageId = null;
    let replyToText = '';
    let replyToSenderName = '';
    if (replyToMessageIdRaw && isObjectId(replyToMessageIdRaw)) {
      const ref = order.chatMessages.id(replyToMessageIdRaw);
      if (ref) {
        replyToMessageId = ref._id;
        replyToSenderName = ref.senderName || (ref.role === 'admin' ? 'Admin' : 'User');
        const compact = String(ref.text || '').replace(/\s+/g, ' ').trim();
        replyToText =
          compact.length > MAX_B2B_PURCHASE_REPLY_PREVIEW
            ? `${compact.slice(0, MAX_B2B_PURCHASE_REPLY_PREVIEW)}...`
            : compact;
      }
    }

    order.chatMessages.push({
      text,
      role: chatRole,
      senderId: req.user._id,
      senderName,
      replyToMessageId,
      replyToText,
      replyToSenderName,
      attachments,
      voice,
      seenBy: [{ userId: req.user._id, userModel: actor.model || 'User', seenAt: new Date() }],
    });
    await order.save();
    const last = order.chatMessages[order.chatMessages.length - 1];
    const payload = toChatPayload(last);

    emitB2bPurchaseChatMessage(String(order._id), payload);
    const storeWh = String(order.storeWarehouseId || '');
    const requesterId = String(order.requestedBy || '');
    if (chatRole === 'user') {
      emitAdminChatUnreadChanged({
        channel: 'b2b',
        orderId: String(order._id),
        action: 'message',
      });
    } else if (chatRole === 'admin') {
      emitCustomerChatUnreadChanged({
        channel: 'b2b',
        orderId: String(order._id),
        action: 'message',
        userId: requesterId,
        warehouseId: storeWh,
      });
    }

    return res.status(201).json({ success: true, data: payload });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const markB2bPurchaseChatSeen = async (req, res) => {
  try {
    const { purchaseId } = req.params;
    if (!isObjectId(purchaseId)) {
      return res.status(400).json({ success: false, message: 'Invalid id' });
    }

    const order = await B2BPurchaseRequest.findById(purchaseId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    if (!canViewPurchaseRequestDoc(req, order.toObject())) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const userId = String(req.user?._id || '');
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Invalid actor' });
    }

    const userModel =
      req.b2bActor?.model ||
      (req.userType === 'customer' ? 'Customer' : 'User');

    const messageIds = [];
    const seenAt = new Date();

    for (const msg of order.chatMessages || []) {
      if (String(msg.senderId || '') === userId) continue;
      const alreadySeen = (msg.seenBy || []).some(
        (s) => String(s?.userId || '') === userId,
      );
      if (alreadySeen) continue;

      msg.seenBy.push({
        userId: req.user._id,
        userModel,
        seenAt,
      });
      messageIds.push(String(msg._id));
    }

    if (messageIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: { updated: false, messageIds: [] },
      });
    }

    await order.save();

    emitB2bPurchaseChatSeen(String(order._id), {
      purchaseId: String(order._id),
      userId,
      userModel,
      seenAt: seenAt.toISOString(),
      messageIds,
    });

    emitAdminChatUnreadChanged({
      channel: 'b2b',
      orderId: String(order._id),
      action: 'seen',
    });
    emitCustomerChatUnreadChanged({
      channel: 'b2b',
      orderId: String(order._id),
      action: 'seen',
      userId: String(order.requestedBy || ''),
      warehouseId: String(order.storeWarehouseId || ''),
    });

    return res.status(200).json({
      success: true,
      data: { updated: true, messageIds },
    });
  } catch (error) {
    console.error('Mark chat seen error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to mark messages as seen',
    });
  }
};

module.exports = {
  createPurchaseRequest,
  getPurchaseStatus,
  listPurchaseRequests,
  exportPurchaseRequestsCsv,
  approvePurchaseRequest,
  rejectPurchaseRequest,
  rollbackPurchaseApproval,
  requestPurchaseReturn,
  approvePurchaseReturn,
  rejectPurchaseReturn,
  listStoreInventory,
  listMyStoreInventory,
  patchPurchaseFulfillment,
  markPurchaseReceived,
  listB2bPurchaseChatMessages,
  postB2bPurchaseChatMessage,
  markB2bPurchaseChatSeen,
  sumSkuInventory,
  deductSkuInventory,
};


