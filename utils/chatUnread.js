/**
 * Count chat messages the viewer has not marked seen (excluding their own sends).
 */
function countUnreadChatMessages(chatMessages, viewerId, viewerModel = 'User') {
  if (!Array.isArray(chatMessages) || !viewerId) return 0;
  const vid = String(viewerId);
  const vmodel = String(viewerModel || 'User').toLowerCase();

  return chatMessages.reduce((count, msg) => {
    if (String(msg?.senderId || '') === vid) return count;
    const seen = (msg?.seenBy || []).some(
      (s) =>
        String(s?.userId || '') === vid &&
        String(s?.userModel || '').toLowerCase() === vmodel,
    );
    return seen ? count : count + 1;
  }, 0);
}

function attachUnreadChatCount(doc, viewerId, viewerModel = 'User') {
  if (!doc) return doc;
  const unreadChatCount = countUnreadChatMessages(doc.chatMessages, viewerId, viewerModel);
  if (Array.isArray(doc)) {
    return doc.map((d) => attachUnreadChatCount(d, viewerId, viewerModel));
  }
  const { chatMessages, ...rest } = doc;
  return { ...rest, unreadChatCount };
}

function markChatMessagesSeen(order, viewerId, viewerModel = 'User') {
  if (!order || !viewerId) return false;
  const vid = String(viewerId);
  const vmodel = String(viewerModel || 'User');
  const now = new Date();
  let touched = false;

  for (const msg of order.chatMessages || []) {
    if (String(msg.senderId || '') === vid) continue;
    const exists = (msg.seenBy || []).some(
      (s) =>
        String(s?.userId || '') === vid &&
        String(s?.userModel || '').toLowerCase() === vmodel.toLowerCase(),
    );
    if (!exists) {
      if (!msg.seenBy) msg.seenBy = [];
      msg.seenBy.push({ userId: viewerId, userModel: vmodel, seenAt: now });
      touched = true;
    }
  }
  return touched;
}

module.exports = {
  countUnreadChatMessages,
  attachUnreadChatCount,
  markChatMessagesSeen,
};
