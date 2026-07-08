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

function detailRow(label, value) {
  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid ${BRAND.border};">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.muted};margin-bottom:4px;">${escapeHtml(label)}</div>
        <span style="color:${BRAND.text};font-weight:600;font-size:14px;word-break:break-word;line-height:1.5;">${safe(value)}</span>
      </td>
    </tr>`;
}

function getItemActionStatus(event) {
  if (event === 'APPROVED') return 'Approved';
  if (event === 'REJECTED') return 'Rejected';
  if (event === 'RECEIVED') return 'Received';
  return '-';
}

function getItemTable(items = [], { event, showStatus = false } = {}) {
  const rows = items
    .slice(0, 20)
    .map((item) => {
      const currency = item?.currency || 'USD';
      return `
      <tr>
        <td style="padding:10px;border:1px solid ${BRAND.border};font-size:13px;">${safe(item?.skuCode || '-')}</td>
        <td style="padding:10px;border:1px solid ${BRAND.border};font-size:13px;">${safe(item?.vendorModel || '-')}</td>
        <td style="padding:10px;border:1px solid ${BRAND.border};font-size:13px;">${safe(item?.quantity || 0)}</td>
        <td style="padding:10px;border:1px solid ${BRAND.border};font-size:13px;">${safe(money(item?.unitPrice || 0, currency))}</td>
        <td style="padding:10px;border:1px solid ${BRAND.border};font-size:13px;">${safe(money(item?.lineTotal || 0, currency))}</td>
        ${showStatus ? `<td style="padding:10px;border:1px solid ${BRAND.border};font-size:13px;">${safe(getItemActionStatus(event))}</td>` : ''}
      </tr>`;
    })
    .join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">
      <thead>
        <tr style="background:${BRAND.creamBox};">
          <th style="padding:10px;border:1px solid ${BRAND.border};text-align:left;font-size:12px;">SKU</th>
          <th style="padding:10px;border:1px solid ${BRAND.border};text-align:left;font-size:12px;">Vendor Model</th>
          <th style="padding:10px;border:1px solid ${BRAND.border};text-align:left;font-size:12px;">Qty</th>
          <th style="padding:10px;border:1px solid ${BRAND.border};text-align:left;font-size:12px;">Unit Price</th>
          <th style="padding:10px;border:1px solid ${BRAND.border};text-align:left;font-size:12px;">Line Total</th>
          ${showStatus ? `<th style="padding:10px;border:1px solid ${BRAND.border};text-align:left;font-size:12px;">Item Status</th>` : ''}
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="${showStatus ? 6 : 5}" style="padding:10px;border:1px solid ${BRAND.border};font-size:13px;">No items</td></tr>`}</tbody>
    </table>`;
}

function shell({ title, subtitle, badge, orderUrl, detailsRows, itemsTable, footerNote }) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background-color:${BRAND.creamLight};font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.creamLight};">
    <tr><td align="center" style="padding:12px 0;">
      <table role="presentation" width="680" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;width:100%;background:${BRAND.white};border-radius:12px;border:1px solid ${BRAND.border};">
        <tr><td style="background:linear-gradient(135deg, ${BRAND.brownDark} 0%, ${BRAND.brown} 100%);padding:24px 20px;text-align:center;color:${BRAND.cream};">
          <div style="font-size:13px;letter-spacing:0.22em;text-transform:uppercase;font-weight:700;">Valliani Marketplace</div>
          <div style="margin-top:8px;font-size:12px;">${escapeHtml(badge)}</div>
        </td></tr>
        <tr><td style="padding:24px 20px 10px;text-align:center;">
          <h1 style="margin:0 0 8px;font-size:24px;color:${BRAND.text};font-family:Georgia,serif;">${escapeHtml(title)}</h1>
          <p style="margin:0;font-size:14px;color:${BRAND.muted};line-height:1.5;">${escapeHtml(subtitle)}</p>
        </td></tr>
        <tr><td style="padding:0 20px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${detailsRows}</table>
        </td></tr>
        <tr><td style="padding:8px 20px 16px;">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.muted};margin-bottom:8px;">Items</div>
          ${itemsTable}
        </td></tr>
        <tr><td style="padding:16px 20px 20px;text-align:center;">
          <a href="${escapeHtml(orderUrl)}" style="display:inline-block;padding:13px 28px;color:${BRAND.white};background:linear-gradient(135deg, ${BRAND.brownDark} 0%, ${BRAND.brown} 100%);text-decoration:none;border-radius:10px;font-weight:700;">View Order</a>
          <p style="margin:10px 0 0;font-size:12px;word-break:break-all;"><a href="${escapeHtml(orderUrl)}" style="color:${BRAND.brown};">${escapeHtml(orderUrl)}</a></p>
        </td></tr>
        <tr><td style="background:${BRAND.brownDark};padding:18px;text-align:center;color:${BRAND.cream};font-size:12px;">
          ${escapeHtml(footerNote)}<br/>© ${year} Valliani Marketplace
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildDetailsRows({
  transfer,
  requester,
  sourceWarehouse,
  destWarehouse,
  actorName,
  reason,
  previousStatus,
  displayItems,
  isPartial,
  itemCount,
  orderItemCount,
  actionAmount,
}) {
  const items = displayItems || transfer?.items || [];
  const currency = items?.[0]?.currency || 'USD';
  const amount = actionAmount ?? transfer?.totalAmount ?? 0;

  return `
    ${detailRow('Ticket Number', transfer?.ticketNumber)}
    ${detailRow('Status', transfer?.status || 'SUBMITTED')}
    ${previousStatus ? detailRow('Previous Status', previousStatus) : ''}
    ${detailRow('Requester', requester?.username || requester?.name || 'Store User')}
    ${detailRow('Requester Email', requester?.email || '-')}
    ${actorName ? detailRow('Action By', actorName) : ''}
    ${reason ? detailRow('Reason', reason) : ''}
    ${detailRow('Source Store', sourceWarehouse?.name || '-')}
    ${detailRow('Destination Store', destWarehouse?.name || '-')}
    ${detailRow('Receipt Number', transfer?.receiptNumber || '-')}
    ${detailRow('Note', transfer?.note || '-')}
    ${isPartial ? detailRow('Items In This Action', itemCount) : ''}
    ${isPartial ? detailRow('Total Items In Order', orderItemCount) : detailRow('Items Count', itemCount ?? items.length)}
    ${detailRow(isPartial ? 'Action Amount' : 'Total Amount', money(amount, currency))}
  `;
}

const EVENT_COPY = {
  CREATED: {
    requesterTitle: 'Merchandise Return Submitted',
    requesterSubtitle: 'Your merchandise return request to main store was submitted successfully.',
    managerTitle: 'New Merchandise Return Request',
  },
  APPROVED: {
    requesterTitle: 'Merchandise Return Approved',
    requesterSubtitle: 'Your merchandise return request has been approved. Stock and wallet updates were applied.',
    requesterSubtitlePartial: 'The following item(s) in your merchandise return were approved.',
    managerTitle: 'Merchandise Return Approved',
    managerSubtitlePartial: 'The following item(s) were approved in this merchandise return.',
  },
  REJECTED: {
    requesterTitle: 'Merchandise Return Rejected',
    requesterSubtitle: 'Your merchandise return request was rejected. See details below.',
    requesterSubtitlePartial: 'The following item(s) in your merchandise return were rejected.',
    managerTitle: 'Merchandise Return Rejected',
    managerSubtitlePartial: 'The following item(s) were rejected in this merchandise return.',
  },
  STATUS_UPDATED: {
    requesterTitle: 'Merchandise Return Status Updated',
    requesterSubtitle: 'The status of your merchandise return request has been updated.',
    managerTitle: 'Merchandise Return Status Updated',
  },
  RECEIVED: {
    requesterTitle: 'Merchandise Return Received',
    requesterSubtitle: 'Approved merchandise return items were marked as received at main store.',
    requesterSubtitlePartial: 'The following approved item(s) were marked as received at main store.',
    managerTitle: 'Merchandise Return Received',
    managerSubtitlePartial: 'The following item(s) were marked as received in this merchandise return.',
  },
};

function buildMerchandiseReturnEmail(payload, { audience = 'manager', badge } = {}) {
  const event = payload.event || 'CREATED';
  const copy = EVENT_COPY[event] || EVENT_COPY.CREATED;
  const detailsRows = buildDetailsRows(payload);
  const displayItems = payload.displayItems || payload.transfer?.items || [];
  const showStatus = ['APPROVED', 'REJECTED', 'RECEIVED'].includes(event);
  const itemsTable = getItemTable(displayItems, { event, showStatus });
  const isRequester = audience === 'requester';
  const isPartial = Boolean(payload.isPartial);

  const subtitle = isRequester
    ? (isPartial && copy.requesterSubtitlePartial ? copy.requesterSubtitlePartial : copy.requesterSubtitle)
    : (isPartial && copy.managerSubtitlePartial ? copy.managerSubtitlePartial : badge || copy.managerTitle);

  return shell({
    title: isRequester ? copy.requesterTitle : copy.managerTitle,
    subtitle,
    badge: badge || (isRequester ? 'Requester Copy' : copy.managerTitle),
    orderUrl: payload.orderUrl,
    detailsRows,
    itemsTable,
    footerNote: 'This email was generated automatically by Valliani Marketplace.',
  });
}

function buildCreatorMerchandiseReturnEmail(payload) {
  return buildMerchandiseReturnEmail(
    { ...payload, event: payload.event || 'CREATED' },
    { audience: 'requester', badge: 'Requester Copy' }
  );
}

function buildManagerMerchandiseReturnEmail(payload, badge = 'New Merchandise Return Request') {
  return buildMerchandiseReturnEmail(
    { ...payload, event: payload.event || 'CREATED' },
    { audience: 'manager', badge }
  );
}

module.exports = {
  EVENT_COPY,
  buildMerchandiseReturnEmail,
  buildCreatorMerchandiseReturnEmail,
  buildManagerMerchandiseReturnEmail,
};
