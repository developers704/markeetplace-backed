const express = require('express');
const router = express.Router();
const controller = require('../controllers/policy.controller.js');
const authMiddleware = require('../middlewares/authMiddleware.js');
const policyUploadMiddleware = require('../middlewares/policyUploadMiddleware.js');


router.post('/', policyUploadMiddleware,controller.createPolicy);
router.get('/',controller.getPolicies);
router.get('/:id',controller.getPolicyById);
router.put('/:id', policyUploadMiddleware,controller.updatePolicy);
// router.delete('/:id', controller.deletePolicy);
router.delete('/bulk-delete', controller.bulkDeletePolicies);

// router.delete('/policies/bulk-delete', bulkDeletePolicies);

router.get('/applicable/:roleId/:warehouseId',controller.getApplicablePolicies);
router.get('/user/:customerId', controller.getUserPolicies);
router.get('/applicable/priority/:roleId/:warehouseId',controller.getFirstPriorityPolicy);

module.exports = router;




