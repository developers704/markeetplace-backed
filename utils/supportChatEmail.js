const { sendEmail } = require('../config/sendMails');

const BRAND = {
  brown: '#6f4e37',
  brownDark: '#4b2f20',
  cream: '#EDE8D0',
  creamLight: '#F9F7F4',
  creamBox: '#F3EDE3',
  text: '#4b2f20',
  muted: '#7a6a5c',
  border: '#E8DFD2',
  white: '#ffffff',
  pending: '#d97706',
  pendingBg: '#fff7ed',
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

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatSessionRef(sessionId) {
  const id = String(sessionId || '').trim();
  if (!id) return '-';
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function buildInboxUrl(sessionId) {
  const adminBase = process.env.ADMIN_URL || 'https://portal.vallianimarketplace.com';
  return `${adminBase}/#/support/chat-inbox?session=${encodeURIComponent(String(sessionId))}`;
}

function detailRow(label, value, options = {}) {
  const isLink = options.isLink === true;
  const valueHtml = isLink
    ? `<a href="mailto:${safe(value)}" style="color:${BRAND.brown};text-decoration:none;font-weight:600;">${safe(value)}</a>`
    : `<span style="color:${BRAND.text};font-weight:600;font-size:14px;word-break:break-word;">${safe(value)}</span>`;

  return `
    <tr>
      <td class="detail-label" style="padding:12px 0;border-bottom:1px solid ${BRAND.border};width:38%;vertical-align:top;">
        <span style="font-size:11px;font-weight:700;color:${BRAND.muted};text-transform:uppercase;letter-spacing:0.08em;">${safe(label)}</span>
      </td>
      <td class="detail-value" style="padding:12px 0;border-bottom:1px solid ${BRAND.border};vertical-align:top;">
        ${valueHtml}
      </td>
    </tr>`;
}

function messageRoleLabel(message, customerName) {
  if (message.role === 'user') return customerName || 'Customer';
  if (message.role === 'admin') return message.senderName || 'Support Agent';
  if (message.role === 'system') return 'System';
  return message.senderName || 'Valliani AI';
}

function buildChatMessageBlock(message, customerName) {
  const role = message.role || 'assistant';
  const label = messageRoleLabel(message, customerName);
  const text = stripHtml(message.text).slice(0, 320);
  if (!text) return '';

  const styles = {
    user: {
      bg: BRAND.brown,
      color: BRAND.cream,
      border: BRAND.brownDark,
      align: 'right',
    },
    admin: {
      bg: '#e8f5ef',
      color: BRAND.text,
      border: '#86b49a',
      align: 'left',
    },
    assistant: {
      bg: BRAND.white,
      color: BRAND.text,
      border: BRAND.border,
      align: 'left',
    },
    system: {
      bg: BRAND.pendingBg,
      color: '#92400e',
      border: '#fdba74',
      align: 'center',
    },
  };

  const style = styles[role] || styles.assistant;
  const align = style.align === 'center' ? 'center' : style.align === 'right' ? 'right' : 'left';
  const marginSide = style.align === 'right' ? 'margin-left:auto;' : style.align === 'center' ? 'margin:0 auto;' : '';

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;border-collapse:collapse;">
      <tr>
        <td align="${align}" style="padding:0;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:92%;width:100%;${marginSide}border-collapse:separate;">
            <tr>
              <td style="background:${style.bg};border:1px solid ${style.border};border-radius:14px;padding:12px 14px;">
                <div style="font-size:11px;font-weight:700;color:${role === 'user' ? 'rgba(237,232,208,0.92)' : BRAND.muted};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">
                  ${safe(label)}
                </div>
                <div style="font-size:14px;line-height:1.55;color:${style.color};word-break:break-word;">
                  ${safe(text)}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function buildSupportAgentEmailHtml({
  agentName,
  customerName,
  customerEmail,
  sessionId,
  recentMessages = [],
  note = '',
  requestedByName = '',
}) {
  const inboxUrl = buildInboxUrl(sessionId);
  const preheader = `${customerName || 'A customer'} requested a human support agent on Valliani Marketplace.`;
  const chatBlocks = recentMessages
    .slice(-6)
    .map((m) => buildChatMessageBlock(m, customerName))
    .filter(Boolean)
    .join('');

  const noteBlock = note
    ? `
      <tr><td style="padding:0 24px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.creamBox};border:1px solid ${BRAND.border};border-radius:14px;">
          <tr><td style="padding:14px 16px;">
            <div style="font-size:11px;font-weight:700;color:${BRAND.muted};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Note from admin</div>
            <div style="font-size:14px;line-height:1.55;color:${BRAND.text};">${safe(stripHtml(note))}</div>
          </td></tr>
        </table>
      </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Support agent requested</title>
  <style>
    @media only screen and (max-width: 620px) {
      .email-shell { width: 100% !important; }
      .content-pad { padding-left: 16px !important; padding-right: 16px !important; }
      .detail-label, .detail-value {
        display: block !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      .detail-label { padding-bottom: 4px !important; border-bottom: 0 !important; }
      .detail-value { padding-top: 0 !important; padding-bottom: 14px !important; }
      .cta-button {
        display: block !important;
        width: 100% !important;
        box-sizing: border-box !important;
        text-align: center !important;
      }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${BRAND.creamLight};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${safe(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.creamLight};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" class="email-shell" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${BRAND.white};border-radius:20px;overflow:hidden;border:1px solid ${BRAND.border};box-shadow:0 10px 30px rgba(75,47,32,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg, ${BRAND.brown} 0%, ${BRAND.brownDark} 100%);padding:28px 24px;text-align:center;">
              <div style="display:inline-block;background:rgba(255,255,255,0.12);color:${BRAND.cream};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;padding:6px 12px;border-radius:999px;margin-bottom:12px;">
                Human Support Request
              </div>
              <h1 style="margin:0;color:${BRAND.cream};font-size:24px;line-height:1.25;font-weight:800;">Support agent requested</h1>
              <p style="margin:10px 0 0;color:rgba(237,232,208,0.88);font-size:14px;line-height:1.5;">
                A marketplace customer needs live assistance
              </p>
            </td>
          </tr>

          <tr>
            <td class="content-pad" style="padding:24px 24px 8px;">
              <p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;line-height:1.65;">
                Hello <strong>${safe(agentName || 'there')}</strong>,
              </p>
              <p style="margin:0;color:${BRAND.muted};font-size:14px;line-height:1.65;">
                Please review the conversation below and respond from the admin support inbox as soon as possible.
              </p>
            </td>
          </tr>

          <tr>
            <td class="content-pad" style="padding:8px 24px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.creamBox};border:1px solid ${BRAND.border};border-radius:16px;">
                <tr>
                  <td style="padding:18px 18px 8px;text-align:center;">
                    <div style="font-size:11px;font-weight:700;color:${BRAND.muted};text-transform:uppercase;letter-spacing:0.12em;">Customer</div>
                    <div style="font-size:24px;line-height:1.2;font-weight:800;color:${BRAND.brownDark};margin-top:4px;">${safe(customerName || 'Customer')}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 18px 18px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      ${detailRow('Email', customerEmail || 'N/A', { isLink: Boolean(customerEmail) })}
                      ${detailRow('Session', formatSessionRef(sessionId))}
                      ${requestedByName ? detailRow('Assigned by', requestedByName) : ''}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${noteBlock}

          ${
            chatBlocks
              ? `<tr>
            <td class="content-pad" style="padding:8px 24px 8px;">
              <div style="font-size:12px;font-weight:700;color:${BRAND.muted};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px;">
                Recent conversation
              </div>
              ${chatBlocks}
            </td>
          </tr>`
              : ''
          }

          <tr>
            <td class="content-pad" style="padding:12px 24px 28px;text-align:center;">
              <a
                href="${escapeHtml(inboxUrl)}"
                class="cta-button"
                style="display:inline-block;background:${BRAND.brown};color:${BRAND.cream};text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:800;font-size:14px;letter-spacing:0.02em;"
              >
                Open support inbox
              </a>
              <p style="margin:14px 0 0;font-size:12px;line-height:1.5;color:${BRAND.muted};word-break:break-all;">
                Or copy this link:<br>
                <a href="${escapeHtml(inboxUrl)}" style="color:${BRAND.brown};text-decoration:underline;">${safe(inboxUrl)}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 24px 24px;border-top:1px solid ${BRAND.border};background:${BRAND.creamLight};">
              <p style="margin:0;color:${BRAND.muted};font-size:12px;line-height:1.6;text-align:center;">
                Valliani Marketplace Support<br>
                This is an automated notification for configured support agents.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildSupportAgentEmail({
  agentName,
  customerName,
  customerEmail,
  sessionId,
  recentMessages = [],
  note = '',
  requestedByName = '',
}) {
  const inboxUrl = buildInboxUrl(sessionId);
  const html = buildSupportAgentEmailHtml({
    agentName,
    customerName,
    customerEmail,
    sessionId,
    recentMessages,
    note,
    requestedByName,
  });

  const recentText = recentMessages
    .slice(-6)
    .map((m) => {
      const role = messageRoleLabel(m, customerName);
      return `${role}: ${stripHtml(m.text).slice(0, 280)}`;
    })
    .join('\n');

  const text = [
    'Support agent requested',
    '',
    `Hello ${agentName || 'there'},`,
    '',
    'A marketplace customer has requested to speak with a human support agent.',
    '',
    `Customer: ${customerName || 'Customer'}`,
    `Email: ${customerEmail || 'N/A'}`,
    `Session: ${sessionId || 'N/A'}`,
    note ? `Note: ${stripHtml(note)}` : '',
    requestedByName ? `Assigned by: ${stripHtml(requestedByName)}` : '',
    recentText ? `\nRecent chat:\n${recentText}` : '',
    '',
    `Open inbox: ${inboxUrl}`,
    '',
    'Valliani Marketplace Support',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    subject: `[Valliani Support] Human agent requested — ${customerName || 'Customer'}`,
    html,
    text,
  };
}

async function sendSupportAgentNotificationEmail({
  to,
  agentName,
  customerName,
  customerEmail,
  sessionId,
  recentMessages,
  note,
  requestedByName,
}) {
  if (!to) throw new Error('Recipient email is required');
  const payload = buildSupportAgentEmail({
    agentName,
    customerName,
    customerEmail,
    sessionId,
    recentMessages,
    note,
    requestedByName,
  });
  await sendEmail({ to, subject: payload.subject, html: payload.html, text: payload.text });
  return payload;
}

module.exports = {
  buildInboxUrl,
  buildSupportAgentEmail,
  sendSupportAgentNotificationEmail,
};
