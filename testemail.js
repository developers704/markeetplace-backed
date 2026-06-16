require("dotenv").config();

const mailchimpTransactional = require("@mailchimp/mailchimp_transactional")(
  process.env.MAILCHIMP_API_KEY
);

console.log("MAILCHIMP key loaded:", !!process.env.MAILCHIMP_API_KEY);

(async () => {
  const res = await mailchimpTransactional.users.info();
  console.log(res);
})();