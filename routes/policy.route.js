// routes/policy.routes.js
const express = require('express');
const router = express.Router();
const {
  createTermsAndConditions,
  getTermsAndConditions,
  getTermsAndConditionsById,
  updateTermsAndConditions,
  deleteTermsAndConditions,
} = require('../controllers/termsAndConditions.controller');
const {
  createPrivacyPolicy,
  getPrivacyPolicy,
  updatePrivacyPolicy,
  deletePrivacyPolicy,
} = require('../controllers/privacyPolicy.controller');
const {
  createRefundPolicy,
  getRefundPolicy,
  updateRefundPolicy,
  deleteRefundPolicy,
} = require('../controllers/refundPolicy.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const adminLogger = require('../middlewares/adminLogger');


// Terms and Conditions routes
router.post('/terms', authMiddleware, createTermsAndConditions);

router.get('/terms', getTermsAndConditions);
router.get('/terms/:id', getTermsAndConditionsById);
router.put('/terms/:id', authMiddleware, checkSuperuserOrPermission('Terms and Conditions', 'Update'), adminLogger(), updateTermsAndConditions);
router.delete('/terms/:id', authMiddleware, checkSuperuserOrPermission('Terms and Conditions', 'Delete'), adminLogger(), deleteTermsAndConditions);

// Privacy Policy routes
router.post('/privacy', authMiddleware, checkSuperuserOrPermission('Privacy Policy', 'Create'), adminLogger(), createPrivacyPolicy);
router.get('/privacy', getPrivacyPolicy);
router.put('/privacy/:id', authMiddleware, checkSuperuserOrPermission('Privacy Policy', 'Update'), adminLogger(), updatePrivacyPolicy);
router.delete('/privacy/:id', authMiddleware, checkSuperuserOrPermission('Privacy Policy', 'Delete'), adminLogger(), deletePrivacyPolicy);

// Refund Policy routes
router.post('/refund', authMiddleware, checkSuperuserOrPermission('Refund Policy', 'Create'), adminLogger(), createRefundPolicy);
router.get('/refund', getRefundPolicy);
router.put('/refund/:id', authMiddleware, checkSuperuserOrPermission('Refund Policy', 'Update'), adminLogger(), updateRefundPolicy);
router.delete('/refund/:id', authMiddleware, checkSuperuserOrPermission('Refund Policy', 'Delete'), adminLogger(), deleteRefundPolicy);

module.exports = router;
