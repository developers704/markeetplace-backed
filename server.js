// server.js
const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const BlacklistedToken = require('./models/blacklistedToken.model.js');
const connectDB = require('./config/db.js');
const allRoutes = require('./config/indexRoute.js'); // Import the route manager
const session = require('express-session');
const crypto = require('crypto');
const  {sendEmail}  = require('./config/sendMails.js');



const app = express();
const PORT = process.env.PORT || 5000;


// env config
dotenv.config();

// Connect to database
connectDB();

// Middleware
app.use(express.json({limit: "50mb"})); // Parse JSON bodies
// // CORS options to allow all origins, methods, and headers
// const corsOptions = {
//   origin: '*', // Allow all origins
//   methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', // Allow all methods
//   allowedHeaders: '*', // Allow all headers
// };

app.use(cors()); // Enable CORS with permissive options
app.use('/uploads', express.static('uploads')); // Serve static files from the uploads folder


// Generate a random session secret
const sessionSecret = crypto.randomBytes(32).toString('hex');

// Configure session middleware
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: true,
    cookie: { httpOnly: true, secure: false }, // Set to true if using https
    genid: function(req) {
      return crypto.randomBytes(16).toString('hex') // Use crypto to generate unique IDs
    }
  })
);


const testEmailController = async (req, res) => {
  try {
    const { to, subject, message } = req.body;

    // Validate required fields
    if (!to || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'to, subject, and message are required'
      });
    }

    console.log('Controller received:', { to, subject, message });

    // Light subject sanitization to avoid common spam triggers
    const improvedSubject = String(subject)
      .replace(/test/gi, 'Message')
      .replace(/free/gi, 'Complimentary')
      .replace(/urgent/gi, 'Important')
      .replace(/!!!+/g, '!')
      .trim();

    // Build both html and text; sendEmail will map correctly to SendGrid
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
          Hello there!
        </h2>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <p style="font-size: 16px; line-height: 1.6; color: #333; margin: 0;">
            ${message}
          </p>
        </div>
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="color: #7f8c8d; font-size: 14px; margin: 0;">
            Best regards,<br>
            ${process.env.FROM_NAME || 'Cloud lab private LTD'}
          </p>
        </div>
      </div>
    `;

    const mailOptions = {
      to,
      subject: improvedSubject,
      html,
      text: String(message)
    };

    console.log('Calling sendEmail function...');

    const result = await sendEmail(mailOptions);

    console.log('sendEmail result:', result);

    const ok = !!result?.success;
    return res.status(ok ? 200 : 502).json({
      success: ok,
      message: ok ? 'Email request accepted by provider' : 'Email provider rejected the request',
      data: result
    });

  } catch (error) {
    console.error('Controller error:', error);
    if (error.response) {
      console.error('API Error Response:', error.response.body || error.response.data);
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to send email',
      error: error.message,
      details: error.response?.body || error.response?.data || 'No additional details available'
    });
  }
};

// Add this route before your existing routes (after middleware setup)
app.post('/api/test-email', testEmailController);

app.use('/api', allRoutes); // Use the route manager with a common API endpoint
app.set('trust proxy', true);

app.use((req, res, next) => {
  console.log('Detected IP:', req.ip);
  console.log('Headers:', req.headers);
  next();
});

// Schedule a cron job to run every day at midnight
cron.schedule('0 0 * * *', async () => {
  try {
      const now = new Date();
      await BlacklistedToken.deleteMany({ expiresAt: { $lt: now } });
      console.log('Expired tokens cleaned up');
  } catch (error) {
      console.error('Error cleaning up expired tokens:', error);
  }
});

// Define a route
app.get('/', (req, res) => {
  res.send('2pl');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});




const mailchimp = require('@mailchimp/mailchimp_marketing');

mailchimp.setConfig({
  apiKey: process.env.MAILCHIMP_API_KEY,
  server: process.env.MAILCHIMP_SERVER_PREFIX,
});

const checkAccountDetails = async () => {
  try {
    console.log('🔍 Checking Mailchimp Account Details...\n');
    
    // Correct method - ping API to check connection
    const pingResponse = await mailchimp.ping.get();
    console.log('API Connection:', pingResponse);
    
    // Get account info using root endpoint
    const accountInfo = await mailchimp.root.getRoot();
    
    console.log('📊 ACCOUNT INFORMATION:');
    console.log('========================');
    console.log(`Account Name: ${accountInfo.account_name || 'N/A'}`);
    console.log(`Account ID: ${accountInfo.account_id || 'N/A'}`);
    console.log(`Username: ${accountInfo.username || 'N/A'}`);
    console.log(`Email: ${accountInfo.email || 'N/A'}`);
    console.log(`Role: ${accountInfo.role || 'N/A'}`);
    
    // Check lists to determine account status
    const listsResponse = await mailchimp.lists.getAllLists();
    const totalContacts = listsResponse.lists.reduce((sum, list) => sum + list.stats.member_count, 0);
    
    console.log(`\n👥 CONTACT INFORMATION:`);
    console.log(`Total Lists: ${listsResponse.lists.length}`);
    console.log(`Total Contacts: ${totalContacts}`);
    
    // Determine if free account (basic heuristic)
    const isFreeAccount = totalContacts <= 2000 && listsResponse.lists.length <= 1;
    
    console.log(`\n🎯 ACCOUNT STATUS:`);
    console.log(`Likely Free Account: ${isFreeAccount ? 'YES ✅' : 'NO ❌'}`);
    
    if (isFreeAccount) {
      console.log(`\n⚠️  FREE ACCOUNT LIMITATIONS:`);
      console.log(`- Maximum 2,000 contacts`);
      console.log(`- 10,000 emails per month`);
      console.log(`- Limited API access`);
      console.log(`- Mailchimp branding in emails`);
    }
    
    return {
      isFree: isFreeAccount,
      totalContacts: totalContacts,
      totalLists: listsResponse.lists.length,
      accountInfo: accountInfo,
      canSendEmails: totalContacts < 2000
    };
    
  } catch (error) {
    console.error('❌ Error checking account:', error.message);
    
    if (error.status === 403) {
      console.log('\n🚫 PERMISSION ERROR:');
      console.log('- API key has limited permissions');
      console.log('- Free account with restricted API access');
      console.log('- Account might be suspended');
      
      return {
        isFree: true,
        error: 'API_RESTRICTED',
        message: 'Free account with limited API access',
        canSendEmails: false
      };
    }
    
    throw error;
  }
};


app.get('/test/:quizId', async (req, res) => {
  try {
    const { quizId } = req.params;
    console.log('Test route - Quiz ID:', quizId);
    
    const Quiz = require('./models/quiz.model');
    const quiz = await Quiz.findById(quizId);
    
    res.json({
      success: true,
      message: 'Test route working',
      quizId: quizId,
      found: !!quiz,
      data: quiz
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      quizId: req.params.quizId
    });
  }
});

// Call function
// checkAccountDetails()
//   .then(result => {
//     console.log('\n✅ Account check completed');
//     console.log('Result:', result);
//   })
//   .catch(error => {
//     console.error('❌ Account check failed:', error.message);
//   });

