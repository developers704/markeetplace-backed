// // config/sendMails.js
// const nodemailer = require("nodemailer");

// const transporter = nodemailer.createTransport({
//   host: "smtp.gmail.com",
//   port: 465,
//   secure: true,
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_APP_PASSWORD
//   }
// });

// const sendEmail = async (mailOptions) => {
//   try {
//     await transporter.sendMail(mailOptions);
//   } catch (error) {
//     console.error("Error sending email:", error);
//   }
// };

// module.exports = {
//   sendEmail,
// };



// config/sendMails.js
// config/sendMails.js
// config/sendMails.js
// const mailchimp = require('@mailchimp/mailchimp_marketing');

// mailchimp.setConfig({
//   apiKey: process.env.MAILCHIMP_API_KEY,
//   server: process.env.MAILCHIMP_SERVER_PREFIX,
// });

// const sendEmail = async (mailOptions) => {
//   console.log('🚀 Starting email process with existing list...');
  
//   try {
//     // Use existing list instead of creating new one
//     const existingListId = '6f778cb001'; // Valliani Jewelers list
    
//     console.log('📧 Adding/updating subscriber in existing list...');
    
//     // Step 1: Add or update subscriber in existing list
//     try {
//       await mailchimp.lists.setListMember(existingListId, 
//         mailOptions.to.toLowerCase(), // email as member ID
//         {
//           email_address: mailOptions.to,
//           status_if_new: "subscribed",
//           status: "subscribed",
//           merge_fields: {
//             FNAME: "Customer",
//             LNAME: "User"
//           }
//         }
//       );
//       console.log('✅ Subscriber added/updated successfully');
//     } catch (memberError) {
//       console.log('⚠️ Member operation warning:', memberError.message);
//       // Continue anyway
//     }

//     // Step 2: Create campaign with segment targeting specific email
//     console.log('📨 Creating targeted campaign...');
    
//     const campaign = await mailchimp.campaigns.create({
//       type: "regular",
//       recipients: {
//         list_id: existingListId,
//         segment_opts: {
//           match: "any",
//           conditions: [{
//             condition_type: "EmailAddress",
//             field: "EMAIL",
//             op: "is",
//             value: mailOptions.to
//           }]
//         }
//       },
//       settings: {
//         subject_line: mailOptions.subject,
//         from_name: process.env.FROM_NAME || "Valliani Jewelers",
//         reply_to: process.env.FROM_EMAIL || "marketing@vallianijewelers.com",
//         title: `Email_${Date.now()}`,
//         authenticate: true,
//         auto_footer: false,
//         inline_css: true,
//         opens: true,
//         html_clicks: true
//       }
//     });

//     console.log('✅ Campaign created:', campaign.id);

//     // Step 3: Set campaign content
//     await mailchimp.campaigns.setContent(campaign.id, {
//       html: mailOptions.html || `<p>${mailOptions.text}</p>`
//     });

//     console.log('✅ Campaign content set');

//     // Step 4: Send campaign
//     await mailchimp.campaigns.send(campaign.id);

//     console.log("🎉 Email sent successfully via existing list!");
    
//     return {
//       success: true,
//       campaignId: campaign.id,
//       listId: existingListId,
//       message: "Email sent successfully using existing audience"
//     };

//   } catch (error) {
//     console.error("❌ Error sending email:", error.message);
    
//     // Better error handling
//     if (error.status === 403) {
//       console.log('🚫 Permission Error Details:');
//       console.log('- Campaign creation might be restricted');
//       console.log('- API key permissions issue');
//       console.log('- Rate limiting in effect');
      
//       return {
//         success: false,
//         error: 'PERMISSION_DENIED',
//         message: 'Campaign creation restricted. Check API permissions.',
//         details: error.response?.body || error.message
//       };
//     }
    
//     if (error.status === 400) {
//       console.log('⚠️ Bad Request - possibly invalid email or list issue');
//       return {
//         success: false,
//         error: 'INVALID_REQUEST',
//         message: 'Invalid email address or list configuration',
//         details: error.response?.body || error.message
//       };
//     }
    
//     throw error;
//   }
// };

// module.exports = { sendEmail };







// config/sendMails.js
// config/sendMails.js
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendEmail = async (mailOptions) => {
  try {
    const fromEmail = process.env.FROM_EMAIL || "no-reply@studylinksuk.com"; 
    const html = mailOptions.html || (mailOptions.message ? `<p>${mailOptions.message}</p>` : undefined);
    const text = mailOptions.text || mailOptions.message || mailOptions.subject || " ";

    const msg = {
      to: mailOptions.to,
      from: fromEmail,
      subject: mailOptions.subject,
      text,
      html,
    };

    const [res] = await sgMail.send(msg);
    console.log("✅ SendGrid:", { statusCode: res.statusCode, messageId: res.headers["x-message-id"] });
    return { success: res.statusCode === 202, messageId: res.headers["x-message-id"] };
  } catch (error) {
    console.error("⚠️ SendGrid Error:", error.response?.body || error.message);
    return { success: false, error: error.response?.body || error.message };
  }
};
module.exports = { sendEmail };






