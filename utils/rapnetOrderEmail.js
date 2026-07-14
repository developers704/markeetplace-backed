const { sendEmail } = require('../config/sendMails');
const Customer = require('../models/customer.model');
const { getActiveRecipientsForOrder } = require('../services/rapnetOrderEmailRecipient.service');
const {
  buildCreatorRapnetOrderEmail,
  buildManagerRapnetOrderEmail,
  buildStatusRapnetOrderEmail,
  STATUS_EMAIL_COPY,
} = require('./rapnetOrderEmailTemplates');

function pushUniqueEmail(emails, { to, subject, html }) {
  const normalized = String(to || '').trim().toLowerCase();
  if (!normalized) return;
  if (emails.some((m) => String(m.to || '').trim().toLowerCase() === normalized)) return;
  emails.push({ to: normalized, subject, html });
}

async function resolveRequester(order) {
  if (!order?.customerId) return null;
  const id = typeof order.customerId === 'object' ? order.customerId._id : order.customerId;
  if (!id) return null;
  if (typeof order.customerId === 'object' && order.customerId.email) {
    return {
      _id: order.customerId._id,
      username: order.customerId.username,
      email: order.customerId.email,
    };
  }
  return Customer.findById(id).select('username email').lean();
}

async function dispatchRecipientEmails({ order, requester, storeId, status, copy }) {
  const ticket = order?.ticketNumber || order?._id;
  const customerOrderUrl = `${process.env.FRONTEND_URL || 'https://vallianimarketplace.com'}/en/profile-details?option=Outsource Loose Stone`;
  const adminOrderUrl = `${process.env.ADMIN_URL || 'https://portal.vallianimarketplace.com'}/#/orders/outsource-loose-stone-orders`;

  const { warehouse, recipients } = await getActiveRecipientsForOrder(storeId);
  if (!recipients.length) return;

  const sharedPayload = { order, requester, warehouse, status };
  const emails = [];

  for (const rec of recipients) {
    if (rec.role === 'REQUESTER') {
      if (requester?.email) {
        pushUniqueEmail(emails, {
          to: requester.email,
          subject: copy.requesterSubject(ticket),
          html: buildStatusRapnetOrderEmail({
            ...sharedPayload,
            orderUrl: customerOrderUrl,
            forManager: false,
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
          subject: copy.managerSubject(ticket),
          html: buildStatusRapnetOrderEmail({
            ...sharedPayload,
            orderUrl: customerOrderUrl,
            forManager: true,
          }),
        });
      }
      continue;
    }

    const email = rec.userEmail;
    if (!email) continue;

    pushUniqueEmail(emails, {
      to: email,
      subject: copy.managerSubject(ticket),
      html: buildStatusRapnetOrderEmail({
        ...sharedPayload,
        orderUrl: adminOrderUrl,
        forManager: true,
      }),
    });
  }

  if (!emails.length) return;
  const results = await Promise.all(emails.map((mail) => sendEmail(mail)));
  const failed = results.filter((r) => !r?.success);
  if (failed.length) {
    console.error('[rapnetOrder] status email failures:', failed);
  }
}

async function sendRapnetOrderCreatedEmails({ order, requester, storeId }) {
  try {
    if (!storeId) return;
    const ticket = order?.ticketNumber || order?._id;
    const customerOrderUrl = `${process.env.FRONTEND_URL || 'https://vallianimarketplace.com'}/en/profile-details?option=Outsource Loose Stone`;
    const adminOrderUrl = `${process.env.ADMIN_URL || 'https://portal.vallianimarketplace.com'}/#/orders/outsource-loose-stone-orders`;

    const { warehouse, recipients } = await getActiveRecipientsForOrder(storeId);
    if (!recipients.length) return;

    const sharedPayload = { order, requester, warehouse };
    const creatorHtml = buildCreatorRapnetOrderEmail({
      ...sharedPayload,
      orderUrl: customerOrderUrl,
    });

    const emails = [];

    for (const rec of recipients) {
      if (rec.role === 'REQUESTER') {
        if (requester?.email) {
          pushUniqueEmail(emails, {
            to: requester.email,
            subject: `Loose Stone Inquiry Submitted - ${ticket}`,
            html: creatorHtml,
          });
        }
        continue;
      }

      if (rec.role === 'STORE_EMAIL') {
        const storeEmail = String(warehouse?.storeEmail || '').trim();
        if (storeEmail) {
          pushUniqueEmail(emails, {
            to: storeEmail,
            subject: `New Loose Stone Inquiry - ${ticket}`,
            html: buildManagerRapnetOrderEmail({
              ...sharedPayload,
              orderUrl: customerOrderUrl,
              badge: 'New Loose Stone Inquiry for Your Store',
            }),
          });
        }
        continue;
      }

      const email = rec.userEmail;
      if (!email) continue;

      let badge = 'New Loose Stone Inquiry';
      if (rec.role === 'DM') badge = 'DM — New Loose Stone Inquiry';
      else if (rec.role === 'CM') badge = 'CM — New Loose Stone Inquiry';
      else if (rec.role === 'ADMIN') badge = 'Admin — New Loose Stone Inquiry';
      else if (rec.role === 'ADDITIONAL') badge = 'Loose Stone Inquiry Notification';

      pushUniqueEmail(emails, {
        to: email,
        subject: `New Loose Stone Inquiry - ${ticket}`,
        html: buildManagerRapnetOrderEmail({
          ...sharedPayload,
          orderUrl: adminOrderUrl,
          badge,
        }),
      });
    }

    if (!emails.length) return;
    const results = await Promise.all(emails.map((mail) => sendEmail(mail)));
    const failed = results.filter((r) => !r?.success);
    if (failed.length) {
      console.error('[rapnetOrder] email failures:', failed);
    }
  } catch (error) {
    console.error('[rapnetOrder] sendRapnetOrderCreatedEmails error:', error.message || error);
  }
}

async function sendRapnetOrderStatusEmails({ order, requester, storeId, status }) {
  try {
    if (!storeId) return;
    const copy = STATUS_EMAIL_COPY[status];
    if (!copy) return;

    const resolvedRequester = requester || (await resolveRequester(order));
    await dispatchRecipientEmails({
      order,
      requester: resolvedRequester,
      storeId,
      status,
      copy,
    });
  } catch (error) {
    console.error('[rapnetOrder] sendRapnetOrderStatusEmails error:', error.message || error);
  }
}

module.exports = {
  sendRapnetOrderCreatedEmails,
  sendRapnetOrderStatusEmails,
};
