const { filePathToPublicUrl } = require('../config/uploadPaths');

const BRAND = {
  brown: '#6f4e37',
  cream: '#EDE8D0',
  text: '#4b2f20',
  muted: '#7a6a5c',
  border: '#E8DFD2',
  box: '#F9F7F4',
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
  return `${currency} ${n.toFixed(2)}`;
}

function getBackendBase() {
  const base = process.env.BACKEND_URL || process.env.BASE_API || 'https://backend.vallianimarketplace.com';
  return String(base).replace(/\/+$/, '');
}

/** Default placeholder when line has no image (same as marketplace supplies cards). */
function getComingSoonImageUrl() {
  return `${getBackendBase()}/uploads/products/coming.webp`;
}

function resolveSuppliesLineImageUrl(image) {
  const fallback = getComingSoonImageUrl();
  const raw = String(image || '').trim();
  if (!raw) return fallback;

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }

  const publicPath = filePathToPublicUrl(raw);
  if (publicPath) {
    const base = getBackendBase();
    return `${base}${publicPath.startsWith('/') ? publicPath : `/${publicPath}`}`;
  }

  const base = getBackendBase();
  if (!raw.includes('/')) {
    return `${base}/uploads/products/${encodeURIComponent(raw)}`;
  }
  return `${base}/${raw.replace(/^\/+/, '')}`;
}

function formatOrderStatus(status) {
  const map = {
    PENDING_ADMIN: 'Pending admin approval',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    SHIPPED: 'Shipped',
    RECEIVED: 'Received',
  };
  return map[String(status || '').toUpperCase()] || status || '-';
}

function buildProductBlocks(items = []) {
  if (!items.length) {
    return `<p style="margin:0;color:${BRAND.muted};font-size:13px;">No line items.</p>`;
  }

  return items
    .map((line, index) => {
      const imageUrl = resolveSuppliesLineImageUrl(line.image);
      const unit = Number(line.unitPrice || 0);
      const qty = Number(line.quantity || 0);
      const lineTotal = unit * qty;
      const currency = line.currency || 'USD';

      return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:${index < items.length - 1 ? '12px' : '0'};border:1px solid ${BRAND.border};border-radius:10px;overflow:hidden;background:${BRAND.box};">
        <tr>
          <td width="96" valign="top" style="padding:12px;background:${BRAND.white};border-right:1px solid ${BRAND.border};text-align:center;">
            <img
              src="${escapeHtml(imageUrl)}"
              alt="${safe(line.name)}"
              width="72"
              height="72"
              style="display:block;margin:0 auto;width:72px;height:72px;object-fit:cover;border-radius:8px;border:1px solid ${BRAND.border};background:${BRAND.cream};"
            />
          </td>
          <td valign="top" style="padding:12px 14px;font-size:13px;color:${BRAND.text};line-height:1.5;">
            <div style="font-size:15px;font-weight:700;color:${BRAND.text};margin-bottom:6px;">${safe(line.name)}</div>
            <div style="margin-bottom:4px;"><span style="color:${BRAND.muted};">SKU:</span> <strong>${safe(line.sku)}</strong></div>
            <div style="margin-bottom:4px;"><span style="color:${BRAND.muted};">Quantity:</span> <strong>${safe(qty)}</strong></div>
            <div style="margin-bottom:4px;"><span style="color:${BRAND.muted};">Unit price:</span> <strong>${money(unit, currency)}</strong></div>
            <div><span style="color:${BRAND.muted};">Line total:</span> <strong>${money(lineTotal, currency)}</strong></div>
          </td>
        </tr>
      </table>`;
    })
    .join('');
}

function buildSuppliesOrderEmail({ badge, headline, order, warehouse, requester, orderUrl, extraNote }) {
  const ticket = order?.ticketNumber || order?._id;
  const storeName = warehouse?.name || order?.warehouse?.name || '-';
  const requesterName = requester?.username || requester?.email || order?.customer?.username || '-';
  const requesterEmail = requester?.email || order?.customer?.email || '';
  const productsHtml = buildProductBlocks(order?.items || []);
  const itemCount = Array.isArray(order?.items) ? order.items.length : 0;

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#faf7f4;font-family:Georgia,serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:24px auto;background:#fff;border:1px solid ${BRAND.border};border-radius:12px;overflow:hidden;">
    <tr>
      <td style="background:linear-gradient(135deg,${BRAND.brown},#4b2f20);padding:20px 24px;color:${BRAND.cream};">
        <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;opacity:0.85;">${safe(badge)}</div>
        <div style="font-size:22px;font-weight:700;margin-top:6px;">${safe(headline)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 24px;color:${BRAND.text};font-size:14px;line-height:1.6;">
        <p style="margin:0 0 10px;"><strong>Ticket:</strong> ${safe(ticket)}</p>
        <p style="margin:0 0 10px;"><strong>Store:</strong> ${safe(storeName)}</p>
        <p style="margin:0 0 10px;"><strong>Requester:</strong> ${safe(requesterName)}${requesterEmail ? ` (${safe(requesterEmail)})` : ''}</p>
        <p style="margin:0 0 10px;"><strong>Status:</strong> ${safe(formatOrderStatus(order?.status))}</p>
        <p style="margin:0 0 16px;"><strong>Order total:</strong> ${money(order?.totalAmount, order?.currency)} · <strong>${safe(itemCount)}</strong> item(s)</p>
        ${extraNote ? `<p style="margin:0 0 16px;color:${BRAND.muted};padding:10px 12px;background:#fef2f2;border-radius:8px;border:1px solid #fecaca;">${safe(extraNote)}</p>` : ''}

        <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.muted};">Products</p>
        ${productsHtml}

        ${
          orderUrl
            ? `<p style="margin:22px 0 0;text-align:center;"><a href="${escapeHtml(orderUrl)}" style="display:inline-block;background:${BRAND.brown};color:${BRAND.cream};padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">View order</a></p>`
            : ''
        }
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = {
  buildSuppliesOrderEmail,
  resolveSuppliesLineImageUrl,
  getComingSoonImageUrl,
};
