/**
 * Salary email service
 * Sends personalized emails with PDF attachment via Nodemailer
 */

const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

// Create transporter
function createTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD must be set in .env');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}
const transporter = createTransporter();

function getEmailTemplate(employeeName) {
  const fromName = process.env.EMAIL_FROM_NAME || 'HR Department';

    return {
      subject: `Your Salary Report - ${employeeName}`,
      text: `Hi ${employeeName},

    Kindly review your timesheet and confirm its accuracy within 24 hours of receiving this email.

    If no confirmation or correction is received within the stated time frame, the timesheet will be deemed accurate and will be processed for payroll accordingly.

    Please find attached your salary report for your records.

    Best regards,
    ${fromName}`,
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <p>Hi ${employeeName},</p>
      <p>Kindly review your timesheet and confirm its accuracy within 24 hours of receiving this email.</p>
      <p>If no confirmation or correction is received within the stated time frame, the timesheet will be deemed accurate and will be processed for payroll accordingly.</p>
      <p>Please find attached your salary report for your records.</p>
      <p>Best regards,<br>${fromName}</p>
    </div>
  `,
};

}


async function sendSalaryEmail({ to, employeeName, pdfPath, pdfFilename }) {
  // const transporter = createTransporter();
  const template = getEmailTemplate(employeeName);
  const fromName = process.env.EMAIL_FROM_NAME || 'HR Department';
  const fromEmail = process.env.GMAIL_USER;

  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject: template.subject,
    text: template.text,
    html: template.html,
    attachments: [
      {
        filename: pdfFilename,
        path: pdfPath,
       
      },
    ],
  };


  await transporter.sendMail(mailOptions);
}

/**
 * Clean up temporary files after sending
 */
async function cleanupTempFiles(filePaths) {
  const tempDir = path.join(__dirname, '../temp');

  for (const filePath of filePaths) {
    if (!filePath || !filePath.startsWith(tempDir)) continue;
    try {
      await fs.unlink(filePath);
    } catch (err) {
      console.error(`Failed to delete temp file ${filePath}:`, err.message);
    }
  }
}

module.exports = {
  sendSalaryEmail,
  cleanupTempFiles,
};
