const express = require("express");
const {
  userLogin,
  customerLogin,
  signout,
  refreshToken,
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
} = require("../controllers/auth.controller");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();

router.post("/admin/login", userLogin);
router.post("/customer/login", customerLogin);
router.post("/customer/login-with-phone", customerLoginWithPhone);

router.post("/accept-terms-and-conditions", authMiddleware,acceptTermsAndConditions);
//for verifying otp
router.post('/customer/verify-otp', verifyCustomerOTP);
router.post('/customer/resend-otp', resendCustomerOTP);


//signout api for admin and customer
router.post("/signout", authMiddleware, signout);

//for refreshing token
router.post("/refresh-token", refreshToken);

router.post('/user/forgot-password', userRequestPasswordReset);
router.post('/user/reset-password', userResetPassword);
router.post('/customer/forgot-password', customerRequestPasswordReset);
router.post('/customer/reset-password', customerResetPassword);


// new route
router.get('/terms/accepted-users', getAcceptedTermsUsers);
router.get('/terms/user-details/:userId', getUserTermsDetails);
router.get('/terms/stats', getTermsAcceptanceStats);




module.exports = router;
