const mongoose = require('mongoose');
const StoreToMainTransfer = require('../models/storeToMainTransfer.model');
const Warehouse = require('../models/warehouse.model');
const { sendEmail } = require('../config/sendMails');
const { getActiveRecipientsForOrder } = require('../services/merchandiseReturnEmailRecipient.service');
const {
  buildCreatorMerchandiseReturnEmail,
  buildManagerMerchandiseReturnEmail,
} = require('./merchandiseReturnEmailTemplates');

const isObjectId = (v) => mongoose.isValidObjectId(String(v || '').trim());

function pushUniqueEmail(emails, { to, subject, html }) {
  const normalized = String(to || '').trim().toLowerCase();
  if (!normalized) return;
  if (emails.some((m) => String(m.to || '').trim().toLowerCase() === normalized)) return;
  emails.push({ to: normalized, subject, html });
}

function getOrderUrls(transferId) {
  const id = String(transferId);
  return {
    customerOrderUrl: `${process.env.FRONTEND_URL || 'https://vallianimarketplace.com'}/profile-details/store-to-main/${id}`,
    adminOrderUrl: `${process.env.ADMIN_URL || 'https://portal.vallianimarketplace.com'}/#/orders/store-to-main-transfers/${id}`,
  };
}

async function resolveRequester(transfer) {
  const requesterId = transfer?.requestedBy?._id || transfer?.requestedBy;
  const requesterModel = transfer?.requestedByModel;
  if (!requesterId || !isObjectId(requesterId)) return null;

  if (requesterModel === 'User') {
    const User = require('../models/user.model');
    return User.findById(requesterId).select('username email').lean();
  }

  const Customer = require('../models/customer.model');
  return Customer.findById(requesterId).select('username email').lean();
}

async function loadTransferContext(transferId) {
  const transfer = await StoreToMainTransfer.findById(transferId).lean();
  if (!transfer) return null;

  const [sourceWarehouse, destWarehouse, requester] = await Promise.all([
    Warehouse.findById(transfer.sourceWarehouseId).select('_id name storeEmail').lean(),
    Warehouse.findById(transfer.destWarehouseId).select('_id name').lean(),
    resolveRequester(transfer),
  ]);

  return { transfer, sourceWarehouse, destWarehouse, requester };
}

const EVENT_SUBJECTS = {
  CREATED: {
    requester: (ticket) => `Merchandise Return Submitted - ${ticket}`,
    manager: (ticket) => `New Merchandise Return - ${ticket}`,
    additional: (ticket) => `Merchandise Return - ${ticket}`,
  },
  APPROVED: {
    requester: (ticket) => `Merchandise Return Approved - ${ticket}`,
    manager: (ticket) => `Merchandise Return Approved - ${ticket}`,
    additional: (ticket) => `Merchandise Return Approved - ${ticket}`,
  },
  REJECTED: {
    requester: (ticket) => `Merchandise Return Rejected - ${ticket}`,
    manager: (ticket) => `Merchandise Return Rejected - ${ticket}`,
    additional: (ticket) => `Merchandise Return Rejected - ${ticket}`,
  },
  STATUS_UPDATED: {
    requester: (ticket) => `Merchandise Return Status Updated - ${ticket}`,
    manager: (ticket) => `Merchandise Return Status Updated - ${ticket}`,
    additional: (ticket) => `Merchandise Return Status Updated - ${ticket}`,
  },
  RECEIVED: {
    requester: (ticket) => `Merchandise Return Received - ${ticket}`,
    manager: (ticket) => `Merchandise Return Received - ${ticket}`,
    additional: (ticket) => `Merchandise Return Received - ${ticket}`,
  },
};

const EVENT_BADGES = {
  CREATED: {
    DM: 'DM - Merchandise Return Request',
    CM: 'CM - Merchandise Return Request',
    ADMIN: 'Admin - Merchandise Return Request',
    STORE_EMAIL: 'Store Email - Merchandise Return',
    ADDITIONAL: 'Merchandise Return Notification',
    default: 'New Merchandise Return Request',
  },
  APPROVED: {
    DM: 'DM - Merchandise Return Approved',
    CM: 'CM - Merchandise Return Approved',
    ADMIN: 'Admin - Merchandise Return Approved',
    STORE_EMAIL: 'Store Email - Merchandise Return Approved',
    ADDITIONAL: 'Merchandise Return Approved',
    default: 'Merchandise Return Approved',
  },
  REJECTED: {
    DM: 'DM - Merchandise Return Rejected',
    CM: 'CM - Merchandise Return Rejected',
    ADMIN: 'Admin - Merchandise Return Rejected',
    STORE_EMAIL: 'Store Email - Merchandise Return Rejected',
    ADDITIONAL: 'Merchandise Return Rejected',
    default: 'Merchandise Return Rejected',
  },
  STATUS_UPDATED: {
    DM: 'DM - Merchandise Return Status Update',
    CM: 'CM - Merchandise Return Status Update',
    ADMIN: 'Admin - Merchandise Return Status Update',
    STORE_EMAIL: 'Store Email - Merchandise Return Status Update',
    ADDITIONAL: 'Merchandise Return Status Update',
    default: 'Merchandise Return Status Updated',
  },
  RECEIVED: {
    DM: 'DM - Merchandise Return Received',
    CM: 'CM - Merchandise Return Received',
    ADMIN: 'Admin - Merchandise Return Received',
    STORE_EMAIL: 'Store Email - Merchandise Return Received',
    ADDITIONAL: 'Merchandise Return Received',
    default: 'Merchandise Return Received',
  },
};

function filterTransferForEmail(transfer, itemIds) {
  const allItems = Array.isArray(transfer?.items) ? transfer.items : [];
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return {
      transfer,
      displayItems: allItems,
      isPartial: false,
      itemCount: allItems.length,
      orderItemCount: allItems.length,
      actionAmount: Number(transfer?.totalAmount || 0),
    };
  }

  const idSet = new Set(itemIds.map(String));
  const displayItems = allItems.filter((item) => idSet.has(String(item._id)));
  const actionAmount = displayItems.reduce(
    (sum, item) => sum + Number(item.lineTotal || (Number(item.unitPrice || 0) * Number(item.quantity || 0))),
    0
  );

  return {
    transfer: { ...transfer, items: displayItems },
    displayItems,
    isPartial: displayItems.length > 0 && displayItems.length < allItems.length,
    itemCount: displayItems.length,
    orderItemCount: allItems.length,
    actionAmount,
  };
}

function buildSubject(subjects, ticket, itemCount, orderItemCount, event) {
  if (itemCount > 0 && itemCount < orderItemCount) {
    const label =
      event === 'APPROVED'
        ? 'approved'
        : event === 'REJECTED'
          ? 'rejected'
          : event === 'RECEIVED'
            ? 'received'
            : 'updated';
    return `${itemCount} item(s) ${label} - ${ticket}`;
  }
  return subjects.manager(ticket);
}

async function sendMerchandiseReturnEventEmails({
  transferId,
  transfer: transferInput,
  sourceWarehouse: sourceWarehouseInput,
  destWarehouse: destWarehouseInput,
  requester: requesterInput,
  event = 'CREATED',
  actor,
  reason,
  previousStatus,
  itemIds,
}) {
  try {
    let transfer = transferInput;
    let sourceWarehouse = sourceWarehouseInput;
    let destWarehouse = destWarehouseInput;
    let requester = requesterInput;

    if (!transfer && transferId) {
      const ctx = await loadTransferContext(transferId);
      if (!ctx) return;
      ({ transfer, sourceWarehouse, destWarehouse, requester } = ctx);
    }

    if (!transfer?._id || !sourceWarehouse?._id) return;

    const emailView = filterTransferForEmail(transfer, itemIds);
    transfer = emailView.transfer;

    const ticket = transfer.ticketNumber || transfer._id;
    const { customerOrderUrl, adminOrderUrl } = getOrderUrls(transfer._id);
    const subjects = EVENT_SUBJECTS[event] || EVENT_SUBJECTS.CREATED;
    const badges = EVENT_BADGES[event] || EVENT_BADGES.CREATED;

    const { warehouse, recipients } = await getActiveRecipientsForOrder(sourceWarehouse._id);
    if (!recipients.length) return;

    const sourceWh = sourceWarehouse || warehouse;
    const actorName = actor?.username || actor?.name || null;
    const sharedPayload = {
      event,
      transfer,
      requester,
      sourceWarehouse: sourceWh,
      destWarehouse,
      actorName,
      reason: reason || transfer?.rejection?.reason || '',
      previousStatus,
      displayItems: emailView.displayItems,
      isPartial: emailView.isPartial,
      itemCount: emailView.itemCount,
      orderItemCount: emailView.orderItemCount,
      actionAmount: emailView.actionAmount,
    };

    const requesterSubject = emailView.isPartial
      ? buildSubject(subjects, ticket, emailView.itemCount, emailView.orderItemCount, event)
      : subjects.requester(ticket);
    const creatorHtml = buildCreatorMerchandiseReturnEmail({
      ...sharedPayload,
      orderUrl: customerOrderUrl,
    });

    const emails = [];

    for (const rec of recipients) {
      if (rec.role === 'REQUESTER') {
        const requesterEmail = requester?.email;
        if (requesterEmail) {
          pushUniqueEmail(emails, {
            to: requesterEmail,
            subject: requesterSubject,
            html: creatorHtml,
          });
        }
        continue;
      }

      if (rec.role === 'STORE_EMAIL') {
        const storeEmail = String(sourceWh?.storeEmail || '').trim();
        if (storeEmail) {
          const html = buildManagerMerchandiseReturnEmail(
            { ...sharedPayload, orderUrl: customerOrderUrl },
            badges.STORE_EMAIL
          );
          pushUniqueEmail(emails, {
            to: storeEmail,
            subject: emailView.isPartial
              ? buildSubject(subjects, ticket, emailView.itemCount, emailView.orderItemCount, event)
              : subjects.additional(ticket),
            html,
          });
        }
        continue;
      }

      if (!rec.userEmail) continue;

      const badge = badges[rec.role] || badges.default;
      const html = buildManagerMerchandiseReturnEmail(
        { ...sharedPayload, orderUrl: adminOrderUrl },
        badge
      );

      const subject =
        rec.role === 'ADDITIONAL'
          ? emailView.isPartial
            ? buildSubject(subjects, ticket, emailView.itemCount, emailView.orderItemCount, event)
            : subjects.additional(ticket)
          : buildSubject(subjects, ticket, emailView.itemCount, emailView.orderItemCount, event);

      pushUniqueEmail(emails, { to: rec.userEmail, subject, html });
    }

    if (!emails.length) return;

    const results = await Promise.all(emails.map((mail) => sendEmail(mail)));
    const failed = results.filter((r) => !r?.success);
    if (failed.length) {
      console.error(`[merchandiseReturn] ${event} email failures:`, failed);
    }
  } catch (error) {
    console.error(
      `[merchandiseReturn] sendMerchandiseReturnEventEmails (${event}) error:`,
      error.message || error
    );
  }
}

async function sendMerchandiseReturnCreatedEmails(payload) {
  return sendMerchandiseReturnEventEmails({ ...payload, event: 'CREATED' });
}

module.exports = {
  sendMerchandiseReturnCreatedEmails,
  sendMerchandiseReturnEventEmails,
};
