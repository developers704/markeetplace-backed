const express = require('express');
const router = express.Router();
const securityController = require('../controllers/securitySettings.controller');
// const { protect, authorize } = require('../middleware/auth');
const authMiddleware = require('../middlewares/authMiddleware');
// User routes
// router.get('/user-settings',  authMiddleware,securityController.getUserSecuritySettings);
// router.post('/violation',  authMiddleware,securityController.logSecurityViolation);

// Admin routes
router.post('/settings', authMiddleware,securityController.createOrUpdateGlobalSecuritySettings);

router.get('/settings', authMiddleware,securityController.getGlobalSecuritySettings);
router.put('/update-global-settings', authMiddleware,securityController.createOrUpdateGlobalSecuritySettings);
router.delete('/settings/:id', authMiddleware,securityController.deleteSecuritySettings);

module.exports = router;
