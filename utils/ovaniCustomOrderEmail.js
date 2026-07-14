const { sendEmail } = require('../config/sendMails');
const Customer = require('../models/customer.model');
const { getActiveRecipientsForOrder } = require('../services/ovaniCustomOrderEmailRecipient.service');
const {
  buildCreatorOvaniOrderEmail,
  buildManagerOvaniOrderEmail,
  buildStatusOvaniOrderEmail,
  STATUS_EMAIL_COPY,
} = require('./ovaniCustomOrderEmailTemplates');

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

async function dispatchRecipientEmails({
  order,
  requester,
  storeWarehouseId,
  status,
  copy,
}) {
  const ticket = order?.ticketNumber || order?._id;
  const customerOrderUrl = `${process.env.FRONTEND_URL || 'https://vallianimarketplace.com'}/en/profile-details?option=Ovani Custom Orders`;
  const adminOrderUrl = `${process.env.ADMIN_URL || 'https://portal.vallianimarketplace.com'}/#/orders/ovani-custom-orders`;

  const { warehouse, recipients } = await getActiveRecipientsForOrder(storeWarehouseId);
  if (!recipients.length) return;

  const sharedPayload = { order, requester, warehouse, status };
  const emails = [];

  for (const rec of recipients) {
    if (rec.role === 'REQUESTER') {
      if (requester?.email) {
        pushUniqueEmail(emails, {
          to: requester.email,
          subject: copy.requesterSubject(ticket),
          html: buildStatusOvaniOrderEmail({
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
          html: buildStatusOvaniOrderEmail({
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
      html: buildStatusOvaniOrderEmail({
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
    console.error('[ovaniCustomOrder] status email failures:', failed);
  }
}

async function sendOvaniCustomOrderCreatedEmails({ order, requester, storeWarehouseId }) {
  try {
    const ticket = order?.ticketNumber || order?._id;
    const customerOrderUrl = `${process.env.FRONTEND_URL || 'https://vallianimarketplace.com'}/en/profile-details?option=Ovani Custom Orders`;
    const adminOrderUrl = `${process.env.ADMIN_URL || 'https://portal.vallianimarketplace.com'}/#/orders/ovani-custom-orders`;

    const { warehouse, recipients } = await getActiveRecipientsForOrder(storeWarehouseId);
    if (!recipients.length) return;

    const sharedPayload = { order, requester, warehouse };
    const creatorHtml = buildCreatorOvaniOrderEmail({
      ...sharedPayload,
      orderUrl: customerOrderUrl,
    });

    const emails = [];

    for (const rec of recipients) {
      if (rec.role === 'REQUESTER') {
        if (requester?.email) {
          pushUniqueEmail(emails, {
            to: requester.email,
            subject: `Ovani Custom Order Submitted - ${ticket}`,
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
            subject: `New Ovani Custom Order - ${ticket}`,
            html: buildManagerOvaniOrderEmail({
              ...sharedPayload,
              orderUrl: customerOrderUrl,
              badge: 'New Ovani Order for Your Store',
            }),
          });
        }
        continue;
      }

      const email = rec.userEmail;
      if (!email) continue;

      let badge = 'New Ovani Custom Order';
      if (rec.role === 'DM') badge = 'DM — New Ovani Custom Order';
      else if (rec.role === 'CM') badge = 'CM — New Ovani Custom Order';
      else if (rec.role === 'ADMIN') badge = 'Admin — New Ovani Custom Order';
      else if (rec.role === 'ADDITIONAL') badge = 'Ovani Custom Order Notification';

      pushUniqueEmail(emails, {
        to: email,
        subject: `New Ovani Custom Order - ${ticket}`,
        html: buildManagerOvaniOrderEmail({
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
      console.error('[ovaniCustomOrder] email failures:', failed);
    }
  } catch (error) {
    console.error('[ovaniCustomOrder] sendOvaniCustomOrderCreatedEmails error:', error.message || error);
  }
}

async function sendOvaniCustomOrderStatusEmails({ order, requester, storeWarehouseId, status }) {
  try {
    const copy = STATUS_EMAIL_COPY[status];
    if (!copy) return;

    const resolvedRequester = requester || (await resolveRequester(order));
    await dispatchRecipientEmails({
      order,
      requester: resolvedRequester,
      storeWarehouseId,
      status,
      copy,
    });
  } catch (error) {
    console.error('[ovaniCustomOrder] sendOvaniCustomOrderStatusEmails error:', error.message || error);
  }
}

module.exports = {
  sendOvaniCustomOrderCreatedEmails,
  sendOvaniCustomOrderStatusEmails,
};
