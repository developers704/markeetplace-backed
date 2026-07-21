const SupportChatEmailRecipient = require('../models/supportChatEmailRecipient.model');
const { sendSupportAgentNotificationEmail } = require('../utils/supportChatEmail');

async function getActiveSupportChatRecipients() {
  const rows = await SupportChatEmailRecipient.find({ isActive: true })
    .populate('userId', 'username email')
    .lean();

  return rows
    .filter((row) => row.userId?.email)
    .map((row) => ({
      _id: String(row._id),
      userId: String(row.userId._id),
      username: row.userId.username || row.userId.email,
      email: row.userId.email,
    }));
}

async function notifySupportChatRecipientsForSession(session, options = {}) {
  const recipients = await getActiveSupportChatRecipients();
  if (!recipients.length) {
    return { sent: 0, total: 0, skipped: true, recipients: [] };
  }

  const recentMessages = (session.messages || []).slice(-8);
  const results = await Promise.allSettled(
    recipients.map((recipient) =>
      sendSupportAgentNotificationEmail({
        to: recipient.email,
        agentName: recipient.username,
        customerName: session.customerName,
        customerEmail: session.customerEmail,
        sessionId: String(session._id),
        recentMessages,
        note: options.note || '',
        requestedByName: options.requestedByName || 'Marketplace Support',
      }),
    ),
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.length - sent;

  if (failed > 0) {
    console.warn(`[support-chat-email] ${failed} recipient email(s) failed for session ${session._id}`);
  }

  return {
    sent,
    total: recipients.length,
    skipped: false,
    recipients: recipients.map((r) => r.email),
  };
}

module.exports = {
  getActiveSupportChatRecipients,
  notifySupportChatRecipientsForSession,
};
