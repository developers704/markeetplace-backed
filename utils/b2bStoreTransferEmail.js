const { sendEmail } = require('../config/sendMails');
const { getActiveRecipientsForOrder } = require('../services/b2bStoreTransferEmailRecipient.service');
const {
  getSkuProductTitle,
  buildCreatorStoreTransferEmail,
  buildManagerStoreTransferEmail,
} = require('./b2bStoreTransferEmailTemplates');

function pushUniqueEmail(emails, { to, subject, html }) {
  const normalized = String(to || '').trim().toLowerCase();
  if (!normalized) return;
  if (emails.some((m) => String(m.to || '').trim().toLowerCase() === normalized)) return;
  emails.push({ to: normalized, subject, html });
}

/**
 * Send store-to-store transfer emails based on per-warehouse recipient settings.
 */
async function sendStoreTransferCreatedEmails({ order, populated, requester, destWarehouseId }) {
  try {
    const ticket = order?.ticketNumber || order?._id;
    const product = populated?.vendorProductId || {};
    const sku = populated?.skuId || {};
    const productLabel = `${getSkuProductTitle(sku, product) || 'Product'} (${sku?.sku || 'SKU'})`;

    const customerOrderUrl = `${process.env.FRONTEND_URL || 'https://vallianimarketplace.com'}/special-order/store-transfer/${order._id}`;
    const adminOrderUrl = `${process.env.ADMIN_URL || 'https://portal.vallianimarketplace.com'}/#/orders/store-to-store-transfers/${order._id}`;

    const { warehouse, recipients } = await getActiveRecipientsForOrder(destWarehouseId);
    if (!recipients.length) return;

    const sharedPayload = { order, populated, requester, destWarehouse: warehouse };
    const creatorHtml = buildCreatorStoreTransferEmail({
      ...sharedPayload,
      orderUrl: customerOrderUrl,
    });

    const emails = [];

    for (const rec of recipients) {
      if (rec.role === 'REQUESTER') {
        if (requester?.email) {
          pushUniqueEmail(emails, {
            to: requester.email,
            subject: `Store Transfer Submitted - ${ticket}`,
            html: creatorHtml,
          });
        }
        continue;
      }

      if (rec.role === 'STORE_EMAIL') {
        const storeEmail = String(warehouse?.storeEmail || '').trim();
        if (storeEmail) {
          const storeHtml = buildManagerStoreTransferEmail({
            ...sharedPayload,
            orderUrl: customerOrderUrl,
            badge: 'New Transfer Request for Your Store',
          });
          pushUniqueEmail(emails, {
            to: storeEmail,
            subject: `New Store Transfer - ${ticket}`,
            html: storeHtml,
          });
        }
        continue;
      }

      const email = rec.userEmail;
      if (!email) continue;

      let badge = 'New Store Transfer Request';
      let orderUrl = adminOrderUrl;
      let subject = `New Store Transfer - ${productLabel}`;

      if (rec.role === 'DM') badge = 'DM — New Store Transfer Request';
      else if (rec.role === 'CM') badge = 'CM — New Store Transfer Request';
      else if (rec.role === 'ADMIN') badge = 'Admin — New Store Transfer Request';
      else if (rec.role === 'ADDITIONAL') badge = 'Store Transfer Notification';

      const html = buildManagerStoreTransferEmail({
        ...sharedPayload,
        orderUrl,
        badge,
      });

      if (rec.role === 'ADDITIONAL') {
        subject = `Store Transfer - ${ticket}`;
      }

      pushUniqueEmail(emails, { to: email, subject, html });
    }

    if (emails.length === 0) return;

    const results = await Promise.all(emails.map((mail) => sendEmail(mail)));
    const failed = results.filter((r) => !r?.success);
    if (failed.length) {
      console.error('[b2bStoreTransfer] email failures:', failed);
    }
  } catch (error) {
    console.error('[b2bStoreTransfer] sendStoreTransferCreatedEmails error:', error.message || error);
  }
}

module.exports = { sendStoreTransferCreatedEmails };
