const express = require('express');
const router = express.Router();
const controller = require('../controllers/policyAcceptance.controller.js');
const authMiddleware = require('../middlewares/authMiddleware.js');
const { uploadMultiple } = require('../config/policyMulter.js')



// policy with digital sign and photo:
router.post('/accept', authMiddleware, uploadMultiple, controller.acceptPolicy);

// get all acceptances
router.get('/', authMiddleware, controller.getAllPolicyAcceptances);

// get acceptance statistics
router.get('/stats', authMiddleware, controller.getPolicyAcceptanceStats);

// get logged in customer's accepted policies
router.get('/logged-in', authMiddleware, controller.getCustomerAcceptedPolicies);

// get by policy id:
router.get('/:policyId', authMiddleware, controller.getAcceptancesByPolicy);

// get by customer id:
router.get('/customer/:customerId', authMiddleware, controller.getbyCustomerAcceptedPolicy);

// get by accpetance id:
router.get('/:id', authMiddleware, controller.getPolicyAcceptance);


module.exports = router;
