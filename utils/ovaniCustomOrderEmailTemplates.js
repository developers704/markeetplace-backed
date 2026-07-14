const BRAND = {
  brown: '#6f4e37',
  brownDark: '#4b2f20',
  cream: '#EDE8D0',
  creamLight: '#F9F7F4',
  creamBox: '#F3EDE3',
  text: '#4b2f20',
  muted: '#7a6a5c',
  border: '#E8DFD2',
  white: '#ffffff',
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safe(v) {
  const s = v === null || v === undefined || String(v).trim() === '' ? '-' : String(v).trim();
  return escapeHtml(s);
}

function money(amount, currency = 'USD') {
  const n = Number(amount || 0);
  try {
    return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function getProductImageUrl(snapshot) {
  const img = snapshot?.image || snapshot?.raw?.image_link || '';
  if (!img) return '';
  if (String(img).startsWith('http')) return img;
  return String(img);
}

function detailRow(label, value) {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};width:42%;vertical-align:top;">
        <span style="font-size:12px;font-weight:700;color:${BRAND.muted};text-transform:uppercase;letter-spacing:0.06em;">${safe(label)}</span>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};vertical-align:top;">
        <span style="color:${BRAND.text};font-weight:600;font-size:14px;word-break:break-word;">${safe(value)}</span>
      </td>
    </tr>`;
}

function emailShell({ preheader, title, subtitle, bodyIntro, ticketNumber, imageUrl, productTitle, detailsRows, ctaLabel, orderUrl, footerNote }) {
  const imageSection = imageUrl
    ? `<tr><td style="padding:0 20px 20px;text-align:center;">
        <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(productTitle || 'Product')}" width="200"
          style="width:200px;max-width:100%;height:auto;border-radius:12px;border:1px solid ${BRAND.border};" />
      </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${safe(title)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.creamLight};font-family:Georgia,'Times New Roman',serif;">
<span style="display:none;max-height:0;overflow:hidden;">${safe(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.creamLight};padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:${BRAND.white};border-radius:20px;overflow:hidden;border:1px solid ${BRAND.border};">
      <tr><td style="background:${BRAND.brown};padding:28px 24px;text-align:center;">
        <h1 style="margin:0;color:${BRAND.cream};font-size:22px;font-weight:800;">${safe(title)}</h1>
        ${subtitle ? `<p style="margin:8px 0 0;color:rgba(237,232,208,0.85);font-size:13px;">${safe(subtitle)}</p>` : ''}
      </td></tr>
      <tr><td style="padding:24px 20px 8px;">
        <p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;line-height:1.6;">${bodyIntro}</p>
        <div style="background:${BRAND.creamBox};border:1px solid ${BRAND.border};border-radius:14px;padding:16px;text-align:center;margin-bottom:16px;">
          <div style="font-size:11px;font-weight:700;color:${BRAND.muted};text-transform:uppercase;letter-spacing:0.12em;">Ticket Number</div>
          <div style="font-size:28px;font-weight:800;color:${BRAND.brownDark};">${safe(ticketNumber)}</div>
        </div>
      </td></tr>
      ${imageSection}
      <tr><td style="padding:0 20px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${detailsRows}</table>
      </td></tr>
      ${orderUrl ? `<tr><td style="padding:0 20px 28px;text-align:center;">
        <a href="${escapeHtml(orderUrl)}" style="display:inline-block;background:${BRAND.brown};color:${BRAND.cream};text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:800;font-size:14px;">${safe(ctaLabel || 'View Order')}</a>
      </td></tr>` : ''}
      <tr><td style="padding:16px 20px 24px;border-top:1px solid ${BRAND.border};">
        <p style="margin:0;color:${BRAND.muted};font-size:12px;line-height:1.5;text-align:center;">${safe(footerNote || 'Valliani Marketplace — Ovani Custom Orders')}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function buildOrderDetailsRows(order, requester, warehouse, extraRows = []) {
  const snap = order?.productSnapshot || {};
  const rows = [
    detailRow('Status', order.status),
    detailRow('Product', snap.title || order.title),
    detailRow('Model', order.modelNumber || snap.modelNumber),
    detailRow('Brand', order.brand || snap.brand),
    detailRow('Product Type', order.productType || snap.productType),
    detailRow('GUID', order.laravoGuid),
    detailRow('Quantity', order.quantity),
    detailRow('Available Qty', order.availableQty),
    detailRow('Unit Price', money(order.price, order.currency)),
    detailRow('Line Total', money(Number(order.price || 0) * Number(order.quantity || 1), order.currency)),
    detailRow('Material', snap.material),
    detailRow('Collection', snap.collection),
    detailRow('Store', warehouse?.name),
    detailRow('Requester', requester?.username || requester?.email),
    detailRow('Requester Email', requester?.email),
    order.notes ? detailRow('Notes', order.notes) : '',
    order.adminNote ? detailRow('Admin Note', order.adminNote) : '',
    order.approvedAt ? detailRow('Approved At', new Date(order.approvedAt).toLocaleString()) : '',
    order.shippedAt ? detailRow('Shipped At', new Date(order.shippedAt).toLocaleString()) : '',
    order.rejectedAt ? detailRow('Rejected At', new Date(order.rejectedAt).toLocaleString()) : '',
    order.receivedAt ? detailRow('Received At', new Date(order.receivedAt).toLocaleString()) : '',
    ...extraRows,
  ];
  return rows.filter(Boolean).join('');
}

function buildCreatorOvaniOrderEmail({ order, requester, warehouse, orderUrl }) {
  const snap = order?.productSnapshot || {};
  return emailShell({
    preheader: `Your Ovani custom order ${order.ticketNumber} was submitted.`,
    title: 'Ovani Custom Order Submitted',
    subtitle: 'We received your inquiry',
    bodyIntro: `Hello ${safe(requester?.username || 'there')}, your Ovani custom order inquiry has been submitted successfully. Our team will review it shortly.`,
    ticketNumber: order.ticketNumber,
    imageUrl: getProductImageUrl(snap),
    productTitle: snap.title || order.title,
    detailsRows: buildOrderDetailsRows(order, requester, warehouse),
    ctaLabel: 'View My Order',
    orderUrl,
    footerNote: 'You will receive updates when your order status changes.',
  });
}

function buildManagerOvaniOrderEmail({ order, requester, warehouse, orderUrl, badge, bodyIntro }) {
  const snap = order?.productSnapshot || {};
  return emailShell({
    preheader: `${badge || 'Ovani Custom Order'} ${order.ticketNumber}`,
    title: badge || 'Ovani Custom Order Update',
    subtitle: warehouse?.name || 'Store inquiry',
    bodyIntro: bodyIntro || 'An Ovani custom order requires your attention.',
    ticketNumber: order.ticketNumber,
    imageUrl: getProductImageUrl(snap),
    productTitle: snap.title || order.title,
    detailsRows: buildOrderDetailsRows(order, requester, warehouse),
    ctaLabel: 'View Order',
    orderUrl,
    footerNote: 'Manage Ovani custom orders from the admin portal.',
  });
}

const STATUS_EMAIL_COPY = {
  APPROVED: {
    requesterTitle: 'Ovani Custom Order Approved',
    requesterIntro: (name) =>
      `Hello ${safe(name || 'there')}, great news — your Ovani custom order has been approved. We will notify you when it ships.`,
    managerBadge: 'Ovani Order Approved',
    managerIntro: 'An Ovani custom order has been approved.',
    requesterSubject: (ticket) => `Ovani Custom Order Approved - ${ticket}`,
    managerSubject: (ticket) => `Ovani Custom Order Approved - ${ticket}`,
  },
  SHIPPED: {
    requesterTitle: 'Ovani Custom Order Shipped',
    requesterIntro: (name) =>
      `Hello ${safe(name || 'there')}, your Ovani custom order has been shipped. Please mark it as received once you have the item.`,
    managerBadge: 'Ovani Order Shipped',
    managerIntro: 'An Ovani custom order has been marked as shipped.',
    requesterSubject: (ticket) => `Ovani Custom Order Shipped - ${ticket}`,
    managerSubject: (ticket) => `Ovani Custom Order Shipped - ${ticket}`,
  },
  REJECTED: {
    requesterTitle: 'Ovani Custom Order Rejected',
    requesterIntro: (name) =>
      `Hello ${safe(name || 'there')}, your Ovani custom order inquiry was rejected. See the admin note below for details if provided.`,
    managerBadge: 'Ovani Order Rejected',
    managerIntro: 'An Ovani custom order has been rejected.',
    requesterSubject: (ticket) => `Ovani Custom Order Rejected - ${ticket}`,
    managerSubject: (ticket) => `Ovani Custom Order Rejected - ${ticket}`,
  },
  RECEIVED: {
    requesterTitle: 'Ovani Custom Order Received',
    requesterIntro: (name) =>
      `Hello ${safe(name || 'there')}, you marked your Ovani custom order as received. Thank you!`,
    managerBadge: 'Ovani Order Received by Customer',
    managerIntro: 'The customer has marked a shipped Ovani custom order as received.',
    requesterSubject: (ticket) => `Ovani Custom Order Received - ${ticket}`,
    managerSubject: (ticket) => `Ovani Order Marked Received - ${ticket}`,
  },
};

function buildStatusOvaniOrderEmail({ order, requester, warehouse, orderUrl, status, forManager = false }) {
  const snap = order?.productSnapshot || {};
  const copy = STATUS_EMAIL_COPY[status] || STATUS_EMAIL_COPY.APPROVED;
  const ticket = order.ticketNumber;

  if (forManager) {
    return buildManagerOvaniOrderEmail({
      order,
      requester,
      warehouse,
      orderUrl,
      badge: copy.managerBadge,
      bodyIntro: copy.managerIntro,
    });
  }

  return emailShell({
    preheader: `${copy.requesterTitle} ${ticket}`,
    title: copy.requesterTitle,
    subtitle: `Status: ${status}`,
    bodyIntro:
      typeof copy.requesterIntro === 'function'
        ? copy.requesterIntro(requester?.username)
        : copy.requesterIntro,
    ticketNumber: ticket,
    imageUrl: getProductImageUrl(snap),
    productTitle: snap.title || order.title,
    detailsRows: buildOrderDetailsRows(order, requester, warehouse),
    ctaLabel: 'View My Order',
    orderUrl,
    footerNote: 'Valliani Marketplace — Ovani Custom Orders',
  });
}

module.exports = {
  buildCreatorOvaniOrderEmail,
  buildManagerOvaniOrderEmail,
  buildStatusOvaniOrderEmail,
  STATUS_EMAIL_COPY,
};
