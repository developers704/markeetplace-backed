/**
 * HTML emails for Store-to-Store transfer order notifications.
 */

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

function getSkuProductTitle(sku, product) {
  const fromSku = String(sku?.attributes?.descriptionname || '').trim();
  if (fromSku) return fromSku;
  return String(product?.title || product?.vendorModel || '').trim();
}

function getProductImageUrl(sku) {
  const img = Array.isArray(sku?.images) ? sku.images[0] : '';
  if (!img) return '';
  if (String(img).startsWith('http')) return img;
  const baseUrl = process.env.BACKEND_URL || process.env.BASE_API || 'https://backend.vallianimarketplace.com';
  return `${baseUrl}/${String(img).replace(/^\/+/, '')}`;
}

function productImageSection(imageUrl, productTitle) {
  if (!imageUrl) return '';
  return `
          <tr>
            <td style="padding:0 20px 20px;text-align:center;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;">
                <tr>
                  <td style="background:${BRAND.creamBox};border:1px solid ${BRAND.border};border-radius:16px;padding:16px;text-align:center;">
                    <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(productTitle || 'Product')}" width="200" style="width:200px;max-width:100%;height:auto;border-radius:12px;border:1px solid ${BRAND.border};display:block;margin:0 auto;background:${BRAND.white};object-fit:contain;" />
                    ${productTitle ? `<p style="margin:12px 0 0;font-size:14px;font-weight:700;color:${BRAND.text};line-height:1.4;">${safe(productTitle)}</p>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

function detailRow(label, value, options = {}) {
  const { isEmail = false } = options;
  let valueHtml;
  if (isEmail && value && value !== '-') {
    valueHtml = `<a href="mailto:${escapeHtml(value)}" style="color:${BRAND.brown};text-decoration:none;font-weight:600;font-size:14px;">${safe(value)}</a>`;
  } else {
    valueHtml = `<span style="color:${BRAND.text};font-weight:600;font-size:14px;word-break:break-word;line-height:1.5;">${safe(value)}</span>`;
  }

  return `
    <tr>
      <td style="padding:13px 0;border-bottom:1px solid ${BRAND.border};vertical-align:top;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.muted};margin-bottom:4px;">${escapeHtml(label)}</div>
        ${valueHtml}
      </td>
    </tr>
  `;
}

function ctaButton(orderUrl, label) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;margin:0 auto;">
      <tr>
        <td align="center" style="border-radius:10px;background:linear-gradient(135deg, ${BRAND.brownDark} 0%, ${BRAND.brown} 100%);box-shadow:0 4px 14px rgba(75,47,32,0.22);">
          <a href="${escapeHtml(orderUrl)}" style="display:inline-block;padding:14px 32px;color:${BRAND.white};text-decoration:none;font-size:15px;font-weight:700;letter-spacing:0.02em;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
  `;
}

function emailShell({ preheader, title, subtitle, bodyIntro, ticketNumber, imageUrl, productTitle, detailsRows, ctaLabel, orderUrl, footerNote }) {
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.creamLight};font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.creamLight};">
    <tr>
      <td align="center" style="padding:12px 0;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${BRAND.white};border-radius:12px;border:1px solid ${BRAND.border};">
          <tr>
            <td style="background:linear-gradient(135deg, ${BRAND.brownDark} 0%, ${BRAND.brown} 100%);padding:24px 20px;text-align:center;">
              <div style="font-size:13px;letter-spacing:0.28em;text-transform:uppercase;color:${BRAND.cream};font-weight:700;">Valliani Marketplace</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 20px 12px;text-align:center;">
              <h1 style="margin:0 0 10px;font-size:24px;color:${BRAND.text};font-family:Georgia,serif;">${escapeHtml(title)}</h1>
              <p style="margin:0;font-size:15px;line-height:1.6;color:${BRAND.muted};">${escapeHtml(subtitle)}</p>
            </td>
          </tr>
          ${bodyIntro ? `<tr><td style="padding:4px 20px 20px;"><p style="margin:0;font-size:15px;line-height:1.7;color:${BRAND.muted};">${bodyIntro}</p></td></tr>` : ''}
          <tr>
            <td style="padding:0 20px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.creamBox};border:1px solid ${BRAND.border};border-radius:12px;">
                <tr>
                  <td style="padding:20px;text-align:center;">
                    <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.muted};margin-bottom:6px;">Ticket Number</div>
                    <div style="font-size:28px;font-weight:800;color:${BRAND.brownDark};font-family:Georgia,serif;">${safe(ticketNumber)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${productImageSection(imageUrl, productTitle)}
          <tr>
            <td style="padding:0 20px 8px;">
              <div style="font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.muted};padding-bottom:12px;border-bottom:2px solid ${BRAND.brown};margin-bottom:4px;">Order Details</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${detailsRows}</table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 20px 10px;text-align:center;">${ctaButton(orderUrl, ctaLabel)}</td>
          </tr>
          <tr>
            <td style="padding:6px 20px 24px;">
              <p style="margin:0;font-size:12px;color:${BRAND.muted};text-align:center;">Button not working? Copy this link:</p>
              <p style="margin:6px 0 0;font-size:12px;text-align:center;word-break:break-all;"><a href="${escapeHtml(orderUrl)}" style="color:${BRAND.brown};">${escapeHtml(orderUrl)}</a></p>
            </td>
          </tr>
          <tr>
            <td style="background:${BRAND.brownDark};padding:20px;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;color:${BRAND.cream};">${escapeHtml(footerNote)}</p>
              <p style="margin:0;font-size:11px;color:${BRAND.cream};opacity:0.75;">© ${year} Valliani Marketplace</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildOrderDetailsRows(data) {
  const {
    ticketNumber,
    status,
    requesterName,
    requesterEmail,
    sourceStoreName,
    destStoreName,
    productTitle,
    vendorModel,
    brand,
    skuCode,
    metalColor,
    metalType,
    size,
    quantity,
    unitPrice,
    lineTotal,
    currency,
    receiptNumber,
    eta,
    note,
    confirmedBy,
  } = data;

  return `
    ${detailRow('Ticket Number', ticketNumber)}
    ${detailRow('Status', status)}
    ${detailRow('Requested By', requesterName)}
    ${detailRow('Requester Email', requesterEmail, { isEmail: true })}
    ${detailRow('Source Store', sourceStoreName)}
    ${detailRow('Destination Store', destStoreName)}
     ${detailRow('Product', productTitle)}
    ${detailRow('Vendor Model', vendorModel)}
    ${detailRow('Brand', brand)}
    ${detailRow('SKU', skuCode)}
    ${detailRow('Metal Color', metalColor)}
    ${detailRow('Metal Type', metalType)}
    ${detailRow('Size', size)}
    ${detailRow('Quantity', quantity)}
    ${detailRow('Unit Price', money(unitPrice, currency))}
    ${detailRow('Total', money(lineTotal, currency))}
    ${detailRow('Receipt Number', receiptNumber)}
    ${detailRow('ETA', eta)}
    ${detailRow('Confirmed By', confirmedBy)}
    ${detailRow('Note', note)}
  `;
}

function buildEmailContext({ order, populated, requester, destWarehouse }) {
  const product = populated?.vendorProductId || {};
  const sku = populated?.skuId || {};
  const source = populated?.sourceWarehouseId || {};
  const dest = populated?.destWarehouseId || destWarehouse || {};
  const currency = order?.currency || sku?.currency || 'USD';
  const qty = Number(order?.quantity || 0);
  const unitPrice = Number(order?.unitPrice ?? sku?.price ?? 0);

  return {
    ticketNumber: order?.ticketNumber,
    status: order?.status || 'SUBMITTED',
    requesterName: requester?.username || requester?.name || 'Store User',
    requesterEmail: requester?.email || '',
    sourceStoreName: source?.name,
    destStoreName: dest?.name,
    productTitle: getSkuProductTitle(sku, product),
    imageUrl: getProductImageUrl(sku),
    vendorModel: product?.vendorModel,
    brand: product?.brand,
    skuCode: sku?.sku,
    metalColor: sku?.metalColor,
    metalType: sku?.metalType,
    size: sku?.size,
    quantity: qty,
    unitPrice,
    lineTotal: unitPrice * qty,
    currency,
    receiptNumber: order?.receiptNumber,
    eta: order?.eta,
    note: order?.note,
    confirmedBy: order?.confirmedByUserId,
  };
}

function buildCreatorStoreTransferEmail({ orderUrl, order, populated, requester, destWarehouse }) {
  const ctx = buildEmailContext({ order, populated, requester, destWarehouse });
  const name = safe(requester?.username || requester?.name || 'Customer');

  return emailShell({
    preheader: `Your store transfer ${order.ticketNumber} was submitted successfully.`,
    title: 'Store Transfer Submitted',
    subtitle: 'Your store-to-store transfer request has been submitted successfully.',
    bodyIntro: `Hi <strong style="color:${BRAND.text};">${name}</strong>, we received your transfer request. Our team will review it shortly. You can track progress using the button below.`,
    ticketNumber: order.ticketNumber,
    imageUrl: ctx.imageUrl,
    productTitle: ctx.productTitle,
    detailsRows: buildOrderDetailsRows(ctx),
    ctaLabel: 'View Transfer Order',
    orderUrl,
    footerNote: 'This email was sent automatically by Valliani Marketplace.',
  });
}

function buildManagerStoreTransferEmail({ orderUrl, order, populated, requester, destWarehouse, badge = 'New Transfer Request' }) {
  const ctx = buildEmailContext({ order, populated, requester, destWarehouse });

  return emailShell({
    preheader: `New store transfer ${order.ticketNumber} — ${badge}.`,
    title: 'New Store-to-Store Transfer',
    subtitle: badge,
    bodyIntro: null,
    ticketNumber: order.ticketNumber,
    imageUrl: ctx.imageUrl,
    productTitle: ctx.productTitle,
    detailsRows: buildOrderDetailsRows(ctx),
    ctaLabel: 'Review Transfer Order',
    orderUrl,
    footerNote: 'This email was generated automatically by Valliani Marketplace.',
  });
}

function buildStoreTransferNotificationContent({ order, populated, requester, destWarehouse, role }) {
  const ctx = buildEmailContext({ order, populated, requester, destWarehouse });
  const headline =
    role === 'REQUESTER'
      ? 'Your store transfer was submitted.'
      : `New store transfer notification (${role}).`;

  const metal = [ctx.metalColor, ctx.metalType, ctx.size].filter(Boolean).join(' ');

  return [
    headline,
    `Ticket: ${ctx.ticketNumber}`,
    `Status: ${ctx.status}`,
    `Product: ${ctx.productTitle}`,
    `SKU: ${ctx.skuCode || '-'}`,
    ctx.vendorModel ? `Model: ${ctx.vendorModel}` : null,
    ctx.brand ? `Brand: ${ctx.brand}` : null,
    metal ? `Metal/Size: ${metal}` : null,
    `Quantity: ${ctx.quantity}`,
    `Unit Price: ${money(ctx.unitPrice, ctx.currency)}`,
    `Total: ${money(ctx.lineTotal, ctx.currency)}`,
    `Source Store: ${ctx.sourceStoreName || '-'}`,
    `Destination Store: ${ctx.destStoreName || '-'}`,
    `Requested By: ${ctx.requesterName}`,
    ctx.receiptNumber ? `Receipt: ${ctx.receiptNumber}` : null,
    ctx.eta ? `ETA: ${ctx.eta}` : null,
    ctx.confirmedBy ? `Confirmed By: ${ctx.confirmedBy}` : null,
    ctx.note ? `Note: ${ctx.note}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

module.exports = {
  getSkuProductTitle,
  buildStoreTransferNotificationContent,
  buildCreatorStoreTransferEmail,
  buildManagerStoreTransferEmail,
};
