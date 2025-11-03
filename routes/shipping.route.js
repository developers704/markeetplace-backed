const express = require('express');
const router = express.Router();
const {
    createShippingMethod,
    getAllShippingMethods,
    updateShippingMethod,
    deleteShippingMethod
} = require('../controllers/shipping.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const adminLogger = require('../middlewares/adminLogger');


router.post('/', authMiddleware, checkSuperuserOrPermission('Shipping', 'Create'),adminLogger(), createShippingMethod);
router.get('/', getAllShippingMethods);
router.put('/:id', authMiddleware, checkSuperuserOrPermission('Shipping', 'Update'), adminLogger(), updateShippingMethod);
router.delete('/:id', authMiddleware, checkSuperuserOrPermission('Shipping', 'Delete'), adminLogger(), deleteShippingMethod);

module.exports = router;
