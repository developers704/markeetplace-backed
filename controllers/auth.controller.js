const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/user.model");
const SecuritySettings = require("../models/securitySettings.model");
const Customer = require("../models/customer.model");
const BlacklistedToken = require("../models/blacklistedToken.model");
const crypto = require("crypto");
const { sendEmail } = require('../config/sendMails');
const Settings = require('../models/settings.model');
const IPAccess = require("../models/IPAccess.model");
const TermsAndConditions = require("../models/TermsAndConditions.model");
const Warehouse = require("../models/warehouse.model");


const generateSixDigitOTP = () => crypto.randomInt(100000, 1000000);

const userLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    // comment code 
    // let clientIP = req.headers['x-real-ip'] 
    //   || req.headers['x-forwarded-for']?.split(',')[0]
    //   || req.headers['cf-connecting-ip']
    //   || req.headers['true-client-ip']
    //   || req.connection.remoteAddress
    //   || req.socket.remoteAddress;

    // Clean the IP address and handle multiple IPs
    // clientIP = clientIP.split(',')[0].trim().replace('::ffff:', '');

    // // comment code:
    // clientIP = clientIP?.replace('::ffff:', '').trim();
    // // Handle localhost and internal network cases
    // if (clientIP === '::1' || clientIP === 'localhost' || clientIP === '127.0.0.1') {
    //   const networkInterfaces = require('os').networkInterfaces();
    //   const localIP = Object.values(networkInterfaces)
    //     .flat()
    //     .find(details => 
    //       details.family === 'IPv4' && 
    //       !details.internal && 
    //       (details.address.startsWith('192.168.') || 
    //        details.address.startsWith('10.') || 
    //        details.address.startsWith('172.'))
    //     );
      
    //   if (localIP) {
    //     clientIP = localIP.address;
    //   }
    // }
    // console.log('Headers:', req.headers);
    // console.log('Client IP:', clientIP);
    //                 const ipAccess = await IPAccess.findOne({
    //                   $or: [
    //                     { address: clientIP },
    //                     { address: clientIP.split('.').slice(0, 3).join('.') + '.*' }
    //                   ]
    //                 });
                
    //                 if (!ipAccess || !ipAccess.access) {
    //                   return res.status(403).json({ 
    //                     message: "Your IP address is not authorized. Please contact your system administrator for access.",
    //                     actualIP: clientIP,
    //                     patternIP: clientIP.split('.').slice(0, 3).join('.') + '.*',
    //                     headers: req.headers
    //                   });
    //                 }


    const user = await User.findOne({ email })
      .populate({
        path: "role",
        select: "role_name permissions", // Ensure permissions are included
      });

    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Create JWT tokens
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1y" }
    );
    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" }
    );

    // Ensure that permissions are serialized correctly in the response
    const userData = user.toObject({ getters: true, versionKey: false });
    userData.role.permissions = Object.fromEntries(user.role.permissions); // Convert Map to object

    // Send response with tokens and populated user data
    res.status(200).json({
      token,
      refreshToken,
      user: userData,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const customerLogin = async (req, res) => {
  try {
    const { email, password, warehouseId } = req.body;
     if (!warehouseId) {
      return res.status(400).json({ message: "Warehouse ID is required for login" });
    }
    console.log("Selected warehouseId:", warehouseId);

    // comment code 
    let clientIP = req.headers['x-real-ip'] 
      || req.headers['x-forwarded-for']?.split(',')[0]
      || req.headers['cf-connecting-ip']
      || req.headers['true-client-ip']
      || req.connection.remoteAddress
      || req.socket.remoteAddress;

    // Clean the IP address and handle multiple IPs
    clientIP = clientIP.split(',')[0].trim().replace('::ffff:', '');

    // comment code:
    clientIP = clientIP?.replace('::ffff:', '').trim();
    // Handle localhost and internal network cases
    if (clientIP === '::1' || clientIP === 'localhost' || clientIP === '127.0.0.1') {
      const networkInterfaces = require('os').networkInterfaces();
      const localIP = Object.values(networkInterfaces)
        .flat()
        .find(details => 
          details.family === 'IPv4' && 
          !details.internal && 
          (details.address.startsWith('192.168.') || 
           details.address.startsWith('10.') || 
           details.address.startsWith('172.'))
        );
      
      if (localIP) {
        clientIP = localIP.address;
      }
    }
    console.log('Headers:', req.headers);
    console.log('Client IP:', clientIP);
                    const ipAccess = await IPAccess.findOne({
                      $or: [
                        { address: clientIP },
                        { address: clientIP.split('.').slice(0, 3).join('.') + '.*' }
                      ]
                    });
                
                    if (!ipAccess || !ipAccess.access) {
                      return res.status(403).json({ 
                        message: "Your IP address is not authorized. Please contact your system administrator for access.",
                        actualIP: clientIP,
                        patternIP: clientIP.split('.').slice(0, 3).join('.') + '.*',
                        headers: req.headers
                      });
                    }

    const customer = await Customer.findOne({ email })
    .populate({
        path: "role",
        select: "role_name permissions", // Ensure permissions are included
      }).populate("warehouse");
    if (!customer) {
      return res.status(400).json({ message: "Invalid email or password" });
    }
    // log('customer.warehouse:', customer);

     // 3️⃣ Verify that the selected warehouse is assigned to this user
    const hasAccess = customer.warehouse.some(
      (w) => w._id.toString() === warehouseId
    );

    if (!hasAccess) {
      return res.status(403).json({
        message: "You do not have access to this warehouse."
      });
    }
 


    const isMatch = await bcrypt.compare(password, customer.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const settings = await Settings.findOne();
    if (settings && settings.twoFactorAuthEnabled) {
      const otpCode = generateSixDigitOTP();
      customer.otpCode = otpCode;
      customer.otpExpires = Date.now() + 600000; // 10 minutes
      await customer.save();

      const mailOptions = {
        to: customer.email,
        from: process.env.EMAIL_USER,
        subject: "Login OTP",
        text: `Your OTP for login is: ${otpCode}\nThis OTP will expire in 10 minutes.`
      };

      await sendEmail(mailOptions);

      return res.status(200).json({ message: "OTP sent to email", requireOTP: true });
    }
    // const previousLoginDate = customer.lastLoginDate;
    // customer.lastLoginDate = new Date();
    // const oldLastLoginDate = customer.lastLoginDate;
    // const lastLoginDate = customer.lastLoginDate || new Date(0);
    // const previousLoginDate = customer.lastLoginDate || customer.createdAt;
    const lastProductCheckDate = customer.lastProductCheckDate || customer.createdAt;
    const currentLoginDate = new Date();
      customer.lastLoginDate = currentLoginDate;
    await customer.save();
    // console.log('previousLoginDate', previousLoginDate);

    const activeTerms = await TermsAndConditions.findOne({ isActive: true }).sort({ createdAt: -1 });

    console.log('customer.lastLoginDate', customer.lastLoginDate);

       const tokenPayload = {
      id: customer._id,
      isCustomer: true,
      role: customer.role?._id,
      warehouse: warehouseId, 
    };

       const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: "1y",
    });
   const refreshToken = jwt.sign(tokenPayload, process.env.JWT_REFRESH_SECRET, {
      expiresIn: "7d",
    });
    const customerData = customer.toObject({ getters: true, versionKey: false });
    customerData.role.permissions = Object.fromEntries(customer.role.permissions); // Convert Map to object

    let securitySettings = await SecuritySettings.findOne({ 
      type: 'user', 
      user: customer._id 
    });

    if (!securitySettings) {
      securitySettings = await SecuritySettings.findOne({
        type: 'role',
        roles: { $in: [customer.role] }
      });
    }

    if (!securitySettings) {
      securitySettings = await SecuritySettings.findOne({ type: 'global' });
    }

    if (!securitySettings) {
      securitySettings = {
        autoLogout: {
          enabled: false,
          timeLimit: 60000
        }
      };
    }
       const warehouse = await Warehouse.findById(warehouseId);

    // customerData.oldLastLoginDate = oldLastLoginDate;
    res.status(200).json({
      token,
      refreshToken,
      customer: customerData,
      selectedWarehouse: warehouse,
      securitySettings,
      lastProductCheckDate, // Send this to frontend
      currentLoginDate,
      termsAndConditions: activeTerms ? {
        // _id: latestTerms._id,
        // content: latestTerms.content
      } : null
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const resendCustomerOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required to resend OTP" });

    const customer = await Customer.findOne({ email });
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    const otpCode = generateSixDigitOTP();
    customer.otpCode = otpCode;
    customer.otpExpires = Date.now() + 10 * 60 * 1000;
    await customer.save();

    await sendEmail({
      to: customer.email,
      from: process.env.EMAIL_USER,
      subject: "Login OTP (Resent)",
      text: `Your OTP for login is: ${otpCode}\nThis OTP will expire in 10 minutes.`
    });

    res.status(200).json({ message: "OTP resent to email" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



const acceptTermsAndConditions = async (req, res) => {
  try {
    const customerId = req.user._id ;
    // Find the customer
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    
    // Update customer's terms acceptance status
    customer.termsAccepted = true;
    customer.termsAcceptedDate = new Date();
    await customer.save();
    
    res.status(200).json({ 
      message: "Terms and conditions accepted successfully",
      termsAccepted: true,
      termsAcceptedDate: customer.termsAcceptedDate
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



// get details accept terms and conditions
const getAcceptedTermsUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    // Get customers who have accepted terms (termsAccepted = true)
    const acceptedUsers = await Customer.find({ 
      termsAccepted: true 
    })
    .select('username email phone_number termsAcceptedDate city gender profileImage role warehouse department')
    .populate('role', 'role_name') // Populate role with role_name
    .populate('warehouse', 'name location') // Populate warehouse with name and location
    .populate('department', 'name code') // Populate department with name and code
    .sort({ termsAcceptedDate: -1 })
    .sort({ termsAcceptedDate: -1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit));
    
    // Get total count
    const totalAccepted = await Customer.countDocuments({ termsAccepted: true });
    
    // Get current terms and conditions
    const currentTerms = await TermsAndConditions.findOne().sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      data: {
        acceptedUsers,
        totalAccepted,
        currentTerms,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalAccepted / parseInt(limit)),
          hasNext: parseInt(page) * parseInt(limit) < totalAccepted
        }
      }
    });
    
  } catch (error) {
    console.error('Error fetching accepted terms users:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// Get detailed view of specific user who accepted terms
const getUserTermsDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get user details
    const user = await Customer.findById(userId)
    .select('username email phone_number termsAccepted termsAcceptedDate city date_of_birth gender profileImage date_joined');
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }
    
    if (!user.termsAccepted) {
      return res.status(400).json({ 
        success: false, 
        message: "User has not accepted terms and conditions" 
      });
    }
    
    // Get terms and conditions
    const terms = await TermsAndConditions.findOne().sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      data: {
        user,
        terms
      }
    });
    
  } catch (error) {
    console.error('Error fetching user terms details:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};


const getTermsAcceptanceStats = async (req, res) => {
  try {
    // Total customers
    const totalCustomers = await Customer.countDocuments();
    
    // Accepted customers
    const acceptedCustomers = await Customer.countDocuments({ termsAccepted: true });
    
    // Pending customers
    const pendingCustomers = totalCustomers - acceptedCustomers;
    
    // Recent acceptances (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentAcceptances = await Customer.countDocuments({
      termsAccepted: true,
      termsAcceptedDate: { $gte: sevenDaysAgo }
    });
    
    // Get current terms
    const currentTerms = await TermsAndConditions.findOne().sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      data: {
        totalCustomers,
        acceptedCustomers,
        pendingCustomers,
        acceptanceRate: totalCustomers > 0 ? ((acceptedCustomers / totalCustomers) * 100).toFixed(2) : 0,
        recentAcceptances,
        currentTerms: currentTerms ? {
          id: currentTerms._id,
          content: currentTerms.content.substring(0, 100) + '...',
          createdAt: currentTerms.createdAt
        } : null
      }
    });
    
  } catch (error) {
    console.error('Error fetching terms stats:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};



const customerLoginWithPhone = async (req, res) => {
  try {
    const { phone_number, password } = req.body; // Destructure phone number and password from the request body

    const customer = await Customer.findOne({ phone_number }); // Find customer by phone number
    if (!customer) {
      return res.status(400).json({ message: "Invalid phone number or password" });
    }

    const isMatch = await bcrypt.compare(password, customer.password); // Compare passwords
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid phone number or password" });
    }

    // Generate JWT tokens without 2FA
    const token = jwt.sign(
      { id: customer._id, isCustomer: true },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );
    const refreshToken = jwt.sign(
      { id: customer._id, isCustomer: true },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" }
    );

    customer.lastLoginDate = new Date();
    await customer.save();

    res.status(200).json({
      token,
      refreshToken,
      customer: customer.toObject({ getters: true, versionKey: false }),
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};


const verifyCustomerOTP = async (req, res) => {
    try {
        const otpCode = Number(req.body.otpCode);
        if (!Number.isInteger(otpCode)) return res.status(400).json({ message: "Invalid OTP format" });

        const customer = await Customer.findOne({
            otpCode,
            otpExpires: { $gt: Date.now() }
        });

        if (!customer) return res.status(400).json({ message: "Invalid or expired OTP" });

        // generate tokens...
        const token = jwt.sign({ id: customer._id, isCustomer: true }, process.env.JWT_SECRET, { expiresIn: "1d" });
        const refreshToken = jwt.sign({ id: customer._id, isCustomer: true }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });

        customer.otpCode = null;
        customer.otpExpires = null;
        await customer.save();

        res.status(200).json({
            token,
            refreshToken,
            customer: customer.toObject({ getters: true, versionKey: false }),
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token is required" });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (error) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    let entity;
    let isUser = true;

    try {
      entity = await User.findById(decoded.id).populate("role");
      if (!entity) {
        entity = await Customer.findById(decoded.id);
        isUser = false;
      }
    } catch (error) {
      return res.status(500).json({ message: "Error retrieving user data" });
    }

    if (!entity) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const tokenPayload = isUser
      ? { id: entity._id, role: entity.role, isUser }
      : { id: entity._id, isUser };

    const newToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    res.status(200).json({ token: newToken });
  } catch (error) {
    res.status(400).json({ message: "Invalid refresh token" });
  }
};


//logout / signout
const signout = async (req, res) => {
  try {
    const token = req.header("Authorization").replace("Bearer ", "");
    const decoded = jwt.decode(token);

    const expiresAt = new Date(decoded.exp * 1000); // Convert to milliseconds

    const blacklistedToken = new BlacklistedToken({
      token,
      expiresAt,
    });

    await blacklistedToken.save();

    res.status(200).json({ message: "Signed out successfully" });
  } catch (error) {
    res.status(500).json({ message: "Signout failed", error: error.message });
  }
};

const userRequestPasswordReset = async (req, res) => {
  try {
      const { email } = req.body;
      const user = await User.findOne({ email });
      if (!user) {
          return res.status(404).json({ message: "User not found" });
      }
      const otpCode = crypto.randomBytes(3).toString('hex');
      user.otpCode = otpCode;
      user.otpExpires = Date.now() + 5 * 60 * 1000; // 5 minutes
      await user.save();

      const mailOptions = {
          to: user.email,
          from: process.env.EMAIL_USER,
          subject: "Password Reset OTP",
          text: `Your OTP for password reset is: ${otpCode}\n\nThis OTP will expire in 5 minutes.`,
      };

      await sendEmail(mailOptions);

      res.status(200).json({ message: "OTP sent to email" });
  } catch (error) {
      res.status(500).json({ message: "Error requesting password reset", error });
  }
};

const userResetPassword = async (req, res) => {
  try {
    const { otpCode, newPassword } = req.body;
    const user = await User.findOne({
      otpCode,
      otpExpires: { $gt: Date.now() },
    });
    if (!user) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.otpCode = undefined;
    user.otpExpires = undefined;
    await user.save();
    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error resetting password", error });
  }
};


const customerRequestPasswordReset = async (req, res) => {
  try {
      const { email } = req.body;
      const customer = await Customer.findOne({ email });
      if (!customer) {
          return res.status(404).json({ message: "Customer not found" });
      }
      const otpCode = crypto.randomBytes(3).toString('hex');
      customer.otpCode = otpCode;
      customer.otpExpires = Date.now() + 5 * 60 * 1000; // 5 minutes
      await customer.save();

      const mailOptions = {
          to: customer.email,
          from: process.env.EMAIL_USER,
          subject: "Password Reset OTP",
          text: `Your OTP for password reset is: ${otpCode}\n\nThis OTP will expire in 5 minutes.`,
      };

      await sendEmail(mailOptions);

      res.status(200).json({ message: "OTP sent to email" });
  } catch (error) {
      res.status(500).json({ message: "Error requesting password reset", error });
  }
};

const customerResetPassword = async (req, res) => {
  try {
    const { otpCode, newPassword } = req.body;
    const customer = await Customer.findOne({
      otpCode,
      otpExpires: { $gt: Date.now() },
    });
    if (!customer) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }
    const salt = await bcrypt.genSalt(10);
    customer.password = await bcrypt.hash(newPassword, salt);
    customer.otpCode = undefined;
    customer.otpExpires = undefined;
    await customer.save();
    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error resetting password", error });
  }
};


//login with creating zen desk token and sending it to frontend dev
// const customerLogin = async (req, res) => {
//   try {
//     const { email, password } = req.body;
//     const customer = await Customer.findOne({ email });
    
//     if (!customer) {
//       return res.status(400).json({ message: "Invalid email or password" });
//     }

//     // Verify password
//     const isMatch = await bcrypt.compare(password, customer.password);
//     if (!isMatch) {
//       return res.status(400).json({ message: "Invalid email or password" });
//     }

//     // Check if Two Factor Authentication (OTP) is enabled
//     const settings = await Settings.findOne();
//     if (settings && settings.twoFactorAuthEnabled) {
//       const otpCode = crypto.randomBytes(3).toString('hex');
//       customer.otpCode = otpCode;
//       customer.otpExpires = Date.now() + 600000; // 10 minutes
//       await customer.save();

//       const mailOptions = {
//         to: customer.email,
//         from: process.env.EMAIL_USER,
//         subject: "Login OTP",
//         text: `Your OTP for login is: ${otpCode}\nThis OTP will expire in 10 minutes.`
//       };

//       await sendEmail(mailOptions);

//       return res.status(200).json({ message: "OTP sent to email", requireOTP: true });
//     }

//     // Generate JWT for customer login
//     const token = jwt.sign(
//       { id: customer._id, isCustomer: true },
//       process.env.JWT_SECRET,
//       { expiresIn: "1d" }
//     );

//     const refreshToken = jwt.sign(
//       { id: customer._id, isCustomer: true },
//       process.env.JWT_REFRESH_SECRET,
//       { expiresIn: "7d" }
//     );

//     // **Zendesk JWT**: Generate a separate JWT for Zendesk live chat
//     const zendeskToken = jwt.sign(
//       {
//         name: customer.name,
//         email: customer.email,
//         external_id: customer._id // Use your customer's unique ID
//       },
//       process.env.ZENDESK_SHARED_SECRET, // Zendesk shared secret
//       {
//         algorithm: 'HS256',
//         expiresIn: '1h' // Token expires in 1 hour
//       }
//     );

//     // Send back tokens and customer data
//     res.status(200).json({
//       token, // Login token
//       refreshToken, // Refresh token
//       zendeskToken, // Zendesk JWT token for live chat
//       customer: customer.toObject({ getters: true, versionKey: false })
//     });
    
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };



module.exports = {
  userLogin,
  customerLogin,
  refreshToken,
  signout,
  userRequestPasswordReset,
  userResetPassword,
  customerRequestPasswordReset,
  customerResetPassword,
  verifyCustomerOTP,
  resendCustomerOTP,
  customerLoginWithPhone,
  acceptTermsAndConditions,
  // new route
  getAcceptedTermsUsers,
  getUserTermsDetails,
  getTermsAcceptanceStats
};
