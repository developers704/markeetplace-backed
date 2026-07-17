const { sendEmail } = require('../config/sendMails');
const { getActiveRecipientsForOrder } = require('../services/suppliesOrderEmailRecipient.service');
const { buildSuppliesOrderEmail } = require('./suppliesOrderEmailTemplates');

function pushUniqueEmail(emails, { to, subject, html }) {
  const normalized = String(to || '').trim().toLowerCase();
  if (!normalized) return;
  if (emails.some((m) => String(m.to || '').trim().toLowerCase() === normalized)) return;
  emails.push({ to: normalized, subject, html });
}

const EVENT_META = {
  PLACED: {
    headline: 'New supplies order submitted',
    requesterBadge: 'Your supplies order was submitted',
    managerBadge: 'New supplies order',
  },
  APPROVED: {
    headline: 'Supplies order approved',
    requesterBadge: 'Your supplies order was approved',
    managerBadge: 'Supplies order approved',
  },
  REJECTED: {
    headline: 'Supplies order rejected',
    requesterBadge: 'Your supplies order was rejected',
    managerBadge: 'Supplies order rejected',
  },
  SHIPPED: {
    headline: 'Supplies order shipped',
    requesterBadge: 'Your supplies order has shipped',
    managerBadge: 'Supplies order shipped',
  },
  RECEIVED: {
    headline: 'Supplies order received',
    requesterBadge: 'Supplies order marked as received',
    managerBadge: 'Supplies order received at store',
  },
};

/**
 * @param {'PLACED'|'APPROVED'|'REJECTED'|'SHIPPED'|'RECEIVED'} event
 */
async function sendSuppliesOrderEmails({ event, order, requester, rejectionReason }) {
  try {
    if (!order?.warehouse) return;

    const warehouseId = typeof order.warehouse === 'object' ? order.warehouse._id : order.warehouse;
    const meta = EVENT_META[event] || EVENT_META.PLACED;
    const ticket = order?.ticketNumber || order?._id;

    const frontendBase = process.env.FRONTEND_URL || 'https://vallianimarketplace.com';
    const adminBase = process.env.ADMIN_URL || 'https://portal.vallianimarketplace.com';
    const customerOrderUrl = `${frontendBase}/en/profile-details?option=${encodeURIComponent('Supplies Orders')}`;
    const adminOrderUrl = `${adminBase}/#/orders/supplies-orders/${order._id}`;

    const { warehouse, recipients } = await getActiveRecipientsForOrder(warehouseId);
    if (!recipients.length) return;

    const extraNote =
      event === 'REJECTED' && rejectionReason ? `Reason: ${rejectionReason}` : '';

    const emails = [];

    for (const rec of recipients) {
      if (rec.role === 'REQUESTER') {
        if (requester?.email) {
          pushUniqueEmail(emails, {
            to: requester.email,
            subject: `${meta.headline} - ${ticket}`,
            html: buildSuppliesOrderEmail({
              badge: meta.requesterBadge,
              headline: meta.headline,
              order,
              warehouse,
              requester,
              orderUrl: customerOrderUrl,
              extraNote,
            }),
          });
        }
        continue;
      }

      if (rec.role === 'STORE_EMAIL') {
        const storeEmail = String(warehouse?.storeEmail || '').trim();
        if (storeEmail) {
          pushUniqueEmail(emails, {
            to: storeEmail,
            subject: `${meta.managerBadge} - ${ticket}`,
            html: buildSuppliesOrderEmail({
              badge: meta.managerBadge,
              headline: meta.headline,
              order,
              warehouse,
              requester,
              orderUrl: customerOrderUrl,
              extraNote,
            }),
          });
        }
        continue;
      }

      const email = rec.userEmail;
      if (!email) continue;

      let badge = meta.managerBadge;
      if (rec.role === 'DM') badge = `DM — ${meta.managerBadge}`;
      else if (rec.role === 'CM') badge = `CM — ${meta.managerBadge}`;
      else if (rec.role === 'ADMIN') badge = `Admin — ${meta.managerBadge}`;

      const orderUrl = ['ADMIN', 'ADDITIONAL'].includes(rec.role) ? adminOrderUrl : customerOrderUrl;

      pushUniqueEmail(emails, {
        to: email,
        subject: `${meta.managerBadge} - ${ticket}`,
        html: buildSuppliesOrderEmail({
          badge,
          headline: meta.headline,
          order,
          warehouse,
          requester,
          orderUrl,
          extraNote,
        }),
      });
    }

    if (!emails.length) return;

    const results = await Promise.all(emails.map((mail) => sendEmail(mail)));
    const failed = results.filter((r) => !r?.success);
    if (failed.length) {
      console.error('[suppliesOrder] email failures:', failed);
    }
  } catch (error) {
    console.error('[suppliesOrder] sendSuppliesOrderEmails error:', error.message || error);
  }
}

module.exports = { sendSuppliesOrderEmails };
