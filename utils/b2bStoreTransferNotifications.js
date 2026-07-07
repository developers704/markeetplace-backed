const mongoose = require('mongoose');
const Notification = require('../models/notification.model');
const AdminNotification = require('../models/adminNotification.model');
const User = require('../models/user.model');
const {
  getActiveRecipientsForOrder,
  normalizeEmail,
  resolveDualAccountsByEmails,
} = require('../services/b2bStoreTransferEmailRecipient.service');
const { buildStoreTransferNotificationContent } = require('./b2bStoreTransferEmailTemplates');

const CUSTOMER_ORDER_PATH = (orderId) => `/special-order/store-transfer/${orderId}`;

function collectRecipientEmail(rec, { requester, warehouse }) {
  if (rec.role === 'REQUESTER') return normalizeEmail(requester?.email);
  if (rec.role === 'STORE_EMAIL') return normalizeEmail(warehouse?.storeEmail);
  return normalizeEmail(rec.userEmail);
}

function isPortalUserAccount(account) {
  return account && typeof account.is_superuser === 'boolean';
}

async function resolveUserIdByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const user = await User.findOne({
    email: { $regex: new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
  })
    .select('_id')
    .lean();
  return user?._id ? String(user._id) : null;
}

/**
 * Send notifications: email → users + customers collections, with ID fallbacks.
 */
async function sendStoreTransferCreatedNotifications({
  order,
  populated,
  requester,
  destWarehouseId,
}) {
  try {
    const { warehouse, recipients } = await getActiveRecipientsForOrder(destWarehouseId);
    if (!recipients.length) return;

    const emails = recipients
      .map((rec) => collectRecipientEmail(rec, { requester, warehouse }))
      .filter(Boolean);

    const accountMap = await resolveDualAccountsByEmails(emails);

    const customerUrl = CUSTOMER_ORDER_PATH(order._id);
    const customerNotifications = [];
    const adminNotifications = [];
    const seenCustomer = new Set();
    const seenAdmin = new Set();

    const pushCustomer = (customerId, content) => {
      const id = String(customerId || '').trim();
      if (!mongoose.isValidObjectId(id) || seenCustomer.has(id)) return;
      seenCustomer.add(id);
      customerNotifications.push({
        user: new mongoose.Types.ObjectId(id),
        content,
        url: customerUrl,
        read: false,
      });
    };

    const pushAdminUser = (userId, content) => {
      const id = String(userId || '').trim();
      if (!mongoose.isValidObjectId(id) || seenAdmin.has(id)) return;
      seenAdmin.add(id);
      adminNotifications.push({
        user: new mongoose.Types.ObjectId(id),
        type: 'ORDER',
        content,
        resourceId: order._id,
        resourceModel: 'B2bStoreTransferOrder',
        priority: 'high',
        read: false,
      });
    };

    const notifyByEmail = async (email, content) => {
      const key = normalizeEmail(email);
      if (!key) return;

      let accounts = accountMap.get(key);
      if (!accounts || (!accounts.userId && !accounts.customerId)) {
        const userId = await resolveUserIdByEmail(key);
        if (userId) {
          accounts = { ...(accounts || { email: key }), userId };
          accountMap.set(key, accounts);
        }
      }

      if (!accounts) return;
      if (accounts.userId) pushAdminUser(accounts.userId, content);
      if (accounts.customerId) pushCustomer(accounts.customerId, content);
    };

    for (const rec of recipients) {
      if (rec.role === 'STORE_EMAIL') continue;

      const content = buildStoreTransferNotificationContent({
        order,
        populated,
        requester,
        destWarehouse: warehouse,
        role: rec.role,
      });

      const email = collectRecipientEmail(rec, { requester, warehouse });
      await notifyByEmail(email, content);

      // Fallback: assigned recipient record IDs (users vs customers collection)
      if (rec.role === 'REQUESTER' && requester?._id) {
        if (isPortalUserAccount(requester)) {
          pushAdminUser(requester._id, content);
        } else {
          pushCustomer(requester._id, content);
        }
      } else if (rec.userId) {
        if (rec.userModel === 'User') {
          pushAdminUser(rec.userId, content);
        } else if (rec.userModel === 'Customer') {
          pushCustomer(rec.userId, content);
        }
      }
    }

    let customerResult = null;
    let adminResult = null;

    if (customerNotifications.length) {
      try {
        customerResult = await Notification.insertMany(customerNotifications, { ordered: false });
      } catch (err) {
        console.error('[b2bStoreTransfer] customer Notification.insertMany error:', err.message);
        if (err.writeErrors) console.error(err.writeErrors);
      }
    }

    if (adminNotifications.length) {
      try {
        adminResult = await AdminNotification.insertMany(adminNotifications, { ordered: false });
      } catch (err) {
        console.error('[b2bStoreTransfer] AdminNotification.insertMany error:', err.message);
        if (err.writeErrors) console.error(err.writeErrors);
      }
    }

    console.log('[b2bStoreTransfer] notifications sent:', {
      orderId: String(order._id),
      customer: customerResult?.length || 0,
      admin: adminResult?.length || 0,
      adminPending: adminNotifications.length,
      customerPending: customerNotifications.length,
      emailsResolved: [...accountMap.entries()].map(([email, a]) => ({
        email,
        userId: a.userId,
        customerId: a.customerId,
      })),
    });
  } catch (error) {
    console.error('[b2bStoreTransfer] sendStoreTransferCreatedNotifications error:', error.message || error);
  }
}

module.exports = { sendStoreTransferCreatedNotifications, CUSTOMER_ORDER_PATH };
