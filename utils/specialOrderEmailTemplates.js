/**
 * Responsive HTML emails for Special Order notifications.
 * Table-based layout, typography-only (no icons — reliable across all email clients).
 */

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

function formatEta(eta) {
  if (!eta) return '-';
  try {
    return new Date(eta).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '-';
  }
}

function detailRow(label, value, options = {}) {
  const { isEmail = false } = options;
  let valueHtml;
  if (isEmail && value && value !== '-') {
    valueHtml = `<a href="mailto:${escapeHtml(value)}" style="color:${BRAND.brown};text-decoration:none;font-weight:600;font-size:14px;">${safe(value)}</a>`;
  } else {
    valueHtml = `<span style="color:${BRAND.text};font-weight:600;font-size:14px;word-break:break-word;line-height:1.5;">${safe(value)}</span>`;
  }

  return `
    <tr>
      <td class="detail-row" style="padding:13px 0;border-bottom:1px solid ${BRAND.border};vertical-align:top;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.muted};margin-bottom:4px;">${escapeHtml(label)}</div>
        ${valueHtml}
      </td>
    </tr>
  `;
}

function buildOrderDetailsRows(data) {
  const {
    ticketNumber,
    requesterName,
    requesterEmail,
    storeName,
    receiptNumber,
    customerNumber,
    typeOfRequest,
    referenceSkuNumber,
    metalQuality,
    diamondType,
    diamondColor,
    diamondClarity,
    diamondDetails,
    customization,
    notes,
    eta,
    attachmentCount,
  } = data;

  return `
    ${detailRow('Ticket Number', ticketNumber)}
    ${detailRow('Requested By', requesterName)}
    ${detailRow('Requester Email', requesterEmail, { isEmail: true })}
    ${detailRow('Store', storeName)}
    ${detailRow('Receipt Number', receiptNumber)}
    ${detailRow('Customer Number', customerNumber)}
    ${detailRow('Type of Request', typeOfRequest)}
    ${detailRow('Reference SKU', referenceSkuNumber)}
    ${detailRow('Metal Quality', metalQuality)}
    ${detailRow('Diamond Type', diamondType)}
    ${detailRow('Diamond Color', diamondColor)}
    ${detailRow('Diamond Clarity', diamondClarity)}
    ${detailRow('Diamond Details', diamondDetails)}
    ${detailRow('Customization', customization)}
    ${detailRow('Notes', notes)}
    ${detailRow('ETA', formatEta(eta))}
    ${detailRow('Attachments', `${attachmentCount || 0} File(s)`)}
  `;
}

function ctaButton(orderUrl, label) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" class="cta-wrap" style="border-collapse:collapse;margin:0 auto;">
      <tr>
        <td align="center" style="border-radius:10px;background:linear-gradient(135deg, ${BRAND.brownDark} 0%, ${BRAND.brown} 100%);box-shadow:0 4px 14px rgba(75,47,32,0.22);">
          <a href="${escapeHtml(orderUrl)}" class="cta-button" style="display:inline-block;padding:14px 32px;color:${BRAND.white};text-decoration:none;font-size:15px;font-weight:700;letter-spacing:0.02em;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
  `;
}

function emailShell({ preheader, title, subtitle, bodyIntro, ticketNumber, detailsRows, ctaLabel, orderUrl, footerNote }) {
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${escapeHtml(title)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body, table, td, p, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table { border-collapse:collapse; mso-table-lspace:0; mso-table-rspace:0; }

    @media only screen and (max-width: 620px) {
      .email-outer { padding:0 !important; }
      .email-container {
        width:100% !important;
        max-width:100% !important;
        border-radius:0 !important;
        border-left:none !important;
        border-right:none !important;
      }
      .email-padding { padding-left:14px !important; padding-right:14px !important; }
      .header-padding { padding:20px 14px !important; }
      .ticket-number { font-size:22px !important; }
      .cta-button { display:block !important; width:100% !important; box-sizing:border-box !important; text-align:center !important; }
      .cta-wrap { width:100% !important; }
      .fallback-url { font-size:11px !important; word-break:break-all !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:${BRAND.creamLight};font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:${BRAND.creamLight};border-collapse:collapse;">
    <tr>
      <td align="center" class="email-outer" style="padding:12px 0;">
        <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;background:${BRAND.white};border-radius:12px;overflow:hidden;border:1px solid ${BRAND.border};box-shadow:0 4px 20px rgba(75,47,32,0.06);">

          <tr>
            <td class="header-padding" style="background:linear-gradient(135deg, ${BRAND.brownDark} 0%, ${BRAND.brown} 100%);padding:24px 20px;text-align:center;">
              <div style="font-size:13px;letter-spacing:0.28em;text-transform:uppercase;color:${BRAND.cream};font-weight:700;">Valliani Marketplace</div>
            </td>
          </tr>

          <tr>
            <td class="email-padding" style="padding:32px 20px 12px;text-align:center;background:${BRAND.white};">
              <h1 style="margin:0 0 10px;font-size:24px;line-height:1.3;font-weight:700;color:${BRAND.text};font-family:Georgia,'Times New Roman',serif;">${escapeHtml(title)}</h1>
              <p style="margin:0;font-size:15px;line-height:1.6;color:${BRAND.muted};">${escapeHtml(subtitle)}</p>
            </td>
          </tr>

          ${bodyIntro ? `
          <tr>
            <td class="email-padding" style="padding:4px 20px 20px;background:${BRAND.white};">
              <p style="margin:0;font-size:15px;line-height:1.7;color:${BRAND.muted};">${bodyIntro}</p>
            </td>
          </tr>` : ''}

          <tr>
            <td class="email-padding" style="padding:0 20px 20px;background:${BRAND.white};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:${BRAND.creamBox};border:1px solid ${BRAND.border};border-radius:12px;">
                <tr>
                  <td style="padding:20px;text-align:center;">
                    <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.muted};margin-bottom:6px;">Ticket Number</div>
                    <div class="ticket-number" style="font-size:28px;font-weight:800;color:${BRAND.brownDark};letter-spacing:0.02em;font-family:Georgia,'Times New Roman',serif;">${safe(ticketNumber)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="email-padding" style="padding:0 20px 8px;background:${BRAND.white};">
              <div style="font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.muted};padding-bottom:12px;border-bottom:2px solid ${BRAND.brown};margin-bottom:4px;">Order Details</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                ${detailsRows}
              </table>
            </td>
          </tr>

          <tr>
            <td class="email-padding" style="padding:24px 20px 10px;text-align:center;background:${BRAND.white};">
              ${ctaButton(orderUrl, ctaLabel)}
            </td>
          </tr>

          <tr>
            <td class="email-padding" style="padding:6px 20px 24px;background:${BRAND.white};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px dashed ${BRAND.border};border-radius:10px;background:${BRAND.creamLight};">
                <tr>
                  <td style="padding:14px 12px;text-align:center;">
                    <p style="margin:0 0 6px;font-size:12px;color:${BRAND.muted};">Button not working? Copy and paste this link:</p>
                    <a href="${escapeHtml(orderUrl)}" class="fallback-url" style="color:${BRAND.brown};font-size:12px;word-break:break-all;text-decoration:underline;">${escapeHtml(orderUrl)}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:${BRAND.brownDark};padding:20px;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:${BRAND.cream};opacity:0.92;">${escapeHtml(footerNote)}</p>
              <p style="margin:0;font-size:11px;color:${BRAND.cream};opacity:0.75;">© ${year} Valliani Marketplace. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildEmailPayloadRows({ order, requester, populated, formData, attachmentCount }) {
  return buildOrderDetailsRows({
    ticketNumber: order.ticketNumber,
    requesterName: requester?.username,
    requesterEmail: requester?.email,
    storeName: populated?.storeId?.name,
    receiptNumber: formData.receiptNumber,
    customerNumber: formData.customerNumber,
    typeOfRequest: formData.typeOfRequest,
    referenceSkuNumber: formData.referenceSkuNumber,
    metalQuality: formData.metalQuality,
    diamondType: formData.diamondType,
    diamondColor: formData.diamondColor,
    diamondClarity: formData.diamondClarity,
    diamondDetails: formData.diamondDetails,
    customization: formData.customization,
    notes: formData.notes,
    eta: formData.eta,
    attachmentCount,
  });
}

function buildCreatorSpecialOrderEmail({ orderUrl, order, requester, populated, formData, attachmentCount }) {
  const name = safe(requester?.username || 'Customer');

  return emailShell({
    preheader: `Your special order ${order.ticketNumber} was submitted successfully.`,
    title: 'Special Order Submitted',
    subtitle: 'Thank you! Your special order has been submitted successfully.',
    bodyIntro: `Hi <strong style="color:${BRAND.text};">${name}</strong>, our team has received your request and will review it shortly. You can track progress anytime using the button below.`,
    ticketNumber: order.ticketNumber,
    detailsRows: buildEmailPayloadRows({ order, requester, populated, formData, attachmentCount }),
    ctaLabel: 'View Special Order',
    orderUrl,
    footerNote: 'This email was sent automatically by Valliani Marketplace.',
  });
}

function buildAdminSpecialOrderEmail({ orderUrl, order, requester, populated, formData, attachmentCount }) {
  return emailShell({
    preheader: `New special order ${order.ticketNumber} requires your review.`,
    title: 'New Special Order Received',
    subtitle: 'A new special order has been submitted and is waiting for your review.',
    bodyIntro: null,
    ticketNumber: order.ticketNumber,
    detailsRows: buildEmailPayloadRows({ order, requester, populated, formData, attachmentCount }),
    ctaLabel: 'Review Special Order',
    orderUrl,
    footerNote: 'This email was generated automatically by Valliani Marketplace.',
  });
}

module.exports = {
  buildCreatorSpecialOrderEmail,
  buildAdminSpecialOrderEmail,
};
