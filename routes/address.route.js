const express = require('express');
const {
    getAllAddresses,
    addAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
    adminUpdateAddress,
    getAllCustomerAddresses
} = require('../controllers/address.controller');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const authMiddleware = require('../middlewares/authMiddleware');
const adminLogger = require('../middlewares/adminLogger');

const router = express.Router();

router.use(authMiddleware);

router.get('/', getAllAddresses);
// Admin routes
router.get('/admin/customer/:customerId', 
    authMiddleware,
    checkSuperuserOrPermission('Customers', 'View'), 
    getAllCustomerAddresses
);
router.post('/', addAddress);
router.put('/:id', updateAddress);
router.delete('/:id', deleteAddress);
router.put('/:id/set-default', setDefaultAddress);
// Admin route for updating any address by ID
router.put('/admin/:id', 
    authMiddleware,
    checkSuperuserOrPermission('Customers', 'Update'), 
    adminLogger(),
    adminUpdateAddress
);

module.exports = router;
