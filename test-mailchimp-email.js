// const { sendEmail } = require("./config/sendMails");

const { sendEmail } = require("./config/sendMails");

require("dotenv").config();

// const { sendEmail } = require("./config/sendMails");

(async () => {
  const result = await sendEmail({
    to: "info@vallianimarketplace.com",
    subject: "Test Email from Valliani Marketplace",
    text: "This is a test email from local backend.",
    html: "<h2>Test Email</h2><p>This is a test email from local backend.</p>",
  });

  console.log("Result:", result);
  process.exit(result.success ? 0 : 1);
})();