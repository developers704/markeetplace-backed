const B2BPurchaseRequest = require('../models/b2bPurchaseRequest.model');
const B2bStoreTransferOrder = require('../models/b2bStoreTransferOrder.model');
const SpecialOrder = require('../models/specialOrder.model');
const { countUnreadChatMessages } = require('../utils/chatUnread');

function isAdminActor(req) {
  const actor = req.b2bActor;
  const role = String(actor?.roleName || req.user?.role?.role_name || '').toLowerCase().trim();
  return (
    !!actor?.isSuperUser ||
    !!req.user?.is_superuser ||
    role === 'admin' ||
    role === 'super admin' ||
    role === 'superuser'
  );
}

/**
 * GET /api/admin/chat-unread-summary
 * Unread inbound chat counts for admin menu badges.
 */
const getAdminChatUnreadSummary = async (req, res) => {
  try {
    if (!isAdminActor(req)) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const viewerId = req.user._id;
    const viewerModel = req.b2bActor?.model || 'User';

    const [b2bRows, transferRows, spoRows] = await Promise.all([
      B2BPurchaseRequest.find({}).select('chatMessages').lean(),
      B2bStoreTransferOrder.find({}).select('chatMessages').lean(),
      SpecialOrder.find({}).select('chatMessages').lean(),
    ]);

    const sumUnread = (rows) =>
      rows.reduce((sum, row) => sum + countUnreadChatMessages(row.chatMessages, viewerId, viewerModel), 0);

    const b2bPurchaseApprovals = sumUnread(b2bRows);
    const storeToStoreTransfers = sumUnread(transferRows);
    const specialOrders = sumUnread(spoRows);

    return res.status(200).json({
      success: true,
      data: {
        b2bPurchaseApprovals,
        storeToStoreTransfers,
        specialOrders,
        total: b2bPurchaseApprovals + storeToStoreTransfers + specialOrders,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getAdminChatUnreadSummary };
