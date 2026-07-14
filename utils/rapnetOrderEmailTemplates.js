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

function money(amount) {
  const n = Number(amount || 0);
  try {
    return `USD ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } catch {
    return `USD ${n.toFixed(2)}`;
  }
}

function getProductImageUrl(snapshot) {
  const img = snapshot?.image || snapshot?.raw?.image_file || '';
  if (!img) return '';
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
        <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(productTitle || 'Diamond')}" width="200"
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
        <p style="margin:0;color:${BRAND.muted};font-size:12px;line-height:1.5;text-align:center;">${safe(footerNote || 'Valliani Marketplace — Outsource Loose Stone')}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function diamondTitle(order) {
  const snap = order?.productSnapshot || {};
  const parts = [
    order?.shape || snap.shape,
    order?.carat != null ? `${order.carat}ct` : snap.carat ? `${snap.carat}ct` : null,
    order?.color || snap.color,
    order?.clarity || snap.clarity,
  ].filter(Boolean);
  return parts.join(' ') || snap.title || 'Diamond';
}

function buildOrderDetailsRows(order, requester, warehouse) {
  const snap = order?.productSnapshot || {};
  const rows = [
    detailRow('Status', order.status),
    detailRow('Diamond', diamondTitle(order)),
    detailRow('Shape', order.shape || snap.shape),
    detailRow('Carat', order.carat ?? snap.carat),
    detailRow('Color', order.color || snap.color),
    detailRow('Clarity', order.clarity || snap.clarity),
    detailRow('Lab', order.lab || snap.lab),
    detailRow('Certificate', snap.certificateNumber || snap.raw?.certificate_number),
    detailRow('RapNet ID', order.rapnetProductId),
    detailRow('Supplier Ref', order.rapnetOrderRef),
    detailRow('Quantity', order.quantity),
    detailRow('Price', money(order.price ?? snap.price)),
    detailRow('Store', warehouse?.name),
    detailRow('Requester', requester?.username || requester?.email),
    detailRow('Requester Email', requester?.email),
    order.notes ? detailRow('Notes', order.notes) : '',
    order.adminNote ? detailRow('Admin Note', order.adminNote) : '',
    order.confirmedAt ? detailRow('Confirmed At', new Date(order.confirmedAt).toLocaleString()) : '',
    order.shippedAt ? detailRow('Shipped At', new Date(order.shippedAt).toLocaleString()) : '',
    order.rejectedAt ? detailRow('Rejected At', new Date(order.rejectedAt).toLocaleString()) : '',
    order.receivedAt ? detailRow('Received At', new Date(order.receivedAt).toLocaleString()) : '',
  ];
  return rows.filter(Boolean).join('');
}

function buildCreatorRapnetOrderEmail({ order, requester, warehouse, orderUrl }) {
  const snap = order?.productSnapshot || {};
  const ticket = order.ticketNumber || order._id;
  return emailShell({
    preheader: `Your Outsource Loose Stone inquiry ${ticket} was submitted.`,
    title: 'Loose Stone Inquiry Submitted',
    subtitle: 'We received your inquiry',
    bodyIntro: `Hello ${safe(requester?.username || 'there')}, your Outsource Loose Stone inquiry has been submitted successfully. Our team will review it shortly.`,
    ticketNumber: ticket,
    imageUrl: getProductImageUrl(snap),
    productTitle: diamondTitle(order),
    detailsRows: buildOrderDetailsRows(order, requester, warehouse),
    ctaLabel: 'View My Order',
    orderUrl,
    footerNote: 'You will receive updates when your order status changes.',
  });
}

function buildManagerRapnetOrderEmail({ order, requester, warehouse, orderUrl, badge, bodyIntro }) {
  const snap = order?.productSnapshot || {};
  const ticket = order.ticketNumber || order._id;
  return emailShell({
    preheader: `${badge || 'Outsource Loose Stone'} ${ticket}`,
    title: badge || 'Outsource Loose Stone Update',
    subtitle: warehouse?.name || 'Store inquiry',
    bodyIntro: bodyIntro || 'An Outsource Loose Stone inquiry requires your attention.',
    ticketNumber: ticket,
    imageUrl: getProductImageUrl(snap),
    productTitle: diamondTitle(order),
    detailsRows: buildOrderDetailsRows(order, requester, warehouse),
    ctaLabel: 'View Order',
    orderUrl,
    footerNote: 'Manage Outsource Loose Stone orders from the admin portal.',
  });
}

const STATUS_EMAIL_COPY = {
  CONFIRMED: {
    requesterTitle: 'Loose Stone Inquiry Confirmed',
    requesterIntro: (name) =>
      `Hello ${safe(name || 'there')}, great news — your Outsource Loose Stone inquiry has been confirmed. We will notify you when it ships.`,
    managerBadge: 'Loose Stone Confirmed',
    managerIntro: 'An Outsource Loose Stone inquiry has been confirmed.',
    requesterSubject: (ticket) => `Loose Stone Inquiry Confirmed - ${ticket}`,
    managerSubject: (ticket) => `Loose Stone Inquiry Confirmed - ${ticket}`,
  },
  SHIPPED: {
    requesterTitle: 'Loose Stone Shipped',
    requesterIntro: (name) =>
      `Hello ${safe(name || 'there')}, your Outsource Loose Stone order has been shipped. Please mark it as received once you have the stone.`,
    managerBadge: 'Loose Stone Shipped',
    managerIntro: 'An Outsource Loose Stone order has been marked as shipped.',
    requesterSubject: (ticket) => `Loose Stone Shipped - ${ticket}`,
    managerSubject: (ticket) => `Loose Stone Shipped - ${ticket}`,
  },
  REJECTED: {
    requesterTitle: 'Loose Stone Inquiry Rejected',
    requesterIntro: (name) =>
      `Hello ${safe(name || 'there')}, your Outsource Loose Stone inquiry was rejected. See the admin note below for details if provided.`,
    managerBadge: 'Loose Stone Rejected',
    managerIntro: 'An Outsource Loose Stone inquiry has been rejected.',
    requesterSubject: (ticket) => `Loose Stone Inquiry Rejected - ${ticket}`,
    managerSubject: (ticket) => `Loose Stone Inquiry Rejected - ${ticket}`,
  },
  RECEIVED: {
    requesterTitle: 'Loose Stone Marked Received',
    requesterIntro: (name) =>
      `Hello ${safe(name || 'there')}, you marked your Outsource Loose Stone order as received. Thank you!`,
    managerBadge: 'Loose Stone Received by Customer',
    managerIntro: 'The customer has marked a shipped Outsource Loose Stone order as received.',
    requesterSubject: (ticket) => `Loose Stone Received - ${ticket}`,
    managerSubject: (ticket) => `Loose Stone Marked Received - ${ticket}`,
  },
};

function buildStatusRapnetOrderEmail({ order, requester, warehouse, orderUrl, status, forManager = false }) {
  const snap = order?.productSnapshot || {};
  const copy = STATUS_EMAIL_COPY[status] || STATUS_EMAIL_COPY.CONFIRMED;
  const ticket = order.ticketNumber || order._id;

  if (forManager) {
    return buildManagerRapnetOrderEmail({
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
    productTitle: diamondTitle(order),
    detailsRows: buildOrderDetailsRows(order, requester, warehouse),
    ctaLabel: 'View My Order',
    orderUrl,
    footerNote: 'Valliani Marketplace — Outsource Loose Stone',
  });
}

module.exports = {
  buildCreatorRapnetOrderEmail,
  buildManagerRapnetOrderEmail,
  buildStatusRapnetOrderEmail,
  STATUS_EMAIL_COPY,
};
