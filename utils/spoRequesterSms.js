/**
 * Optional SMS when an admin replies on an SPO thread.
 * Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM (E.164).
 * Requester phone must be valid E.164 for delivery to succeed.
 */
async function notifySpoRequesterSms({ to, ticketNumber, snippet }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_SMS_FROM;
  if (!sid || !token || !from || !to) return;

  const preview =
    snippet && String(snippet).trim()
      ? ` "${String(snippet).trim().slice(0, 72)}${String(snippet).length > 72 ? '…' : ''}"`
      : '';
  const body = `SPO ${ticketNumber || ''}: New message from the team.${preview} Open the store portal to view and reply.`;

  try {
    const twilio = require('twilio')(sid, token);
    await twilio.messages.create({ from, to: String(to).trim(), body });
  } catch (e) {
    console.error('SPO requester SMS failed:', e.message);
  }
}

module.exports = { notifySpoRequesterSms };
