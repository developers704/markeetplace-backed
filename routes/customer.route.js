const express = require('express');
const { registerCustomer, getCustomerProfile, deleteCustomer, getAllCustomers, updateCustomerProfile, changeCustomerPassword, verifyEmail, deleteOwnAccount, deactivateAccount, reactivateAccount, deleteCustomers, updateCustomerByAdmin, exportCustomersToCSV, getAllCustomersForStore } = require('../controllers/customer.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission.js');
const checkBlacklistedToken = require('../middlewares/checkBlacklistedToken');
const uploadSingleImage = require('../middlewares/uploadOneImage');
const adminLogger = require('../middlewares/adminLogger');


const router = express.Router();

// Register a new customer
router.post('/register', registerCustomer);

router.post('/admin', authMiddleware, checkSuperuserOrPermission('Customers', 'Create'), adminLogger(), registerCustomer);

router.get('/profile', authMiddleware, checkBlacklistedToken, getCustomerProfile);
router.get('/verify/:token', verifyEmail);

// Get customer profile

// Route to export customers data as CSV
router.get('/export/csv', 
    authMiddleware, 
    checkBlacklistedToken, 
    checkSuperuserOrPermission('Customers', 'View'), 
    exportCustomersToCSV
);


// Route to update customer profile
router.put('/profile', authMiddleware, checkBlacklistedToken, uploadSingleImage, updateCustomerProfile);

// Route to change customer password
router.put('/change-password', authMiddleware, checkBlacklistedToken, changeCustomerPassword);

// Route for admin to update customer profile by ID
router.put('/:id', authMiddleware, checkBlacklistedToken, checkSuperuserOrPermission('Customers', 'Update'), uploadSingleImage, adminLogger(), updateCustomerByAdmin);


//customer delete his own account
router.delete('/delete-account', authMiddleware, deleteOwnAccount);

router.delete('/bulk-delete', authMiddleware, checkBlacklistedToken, checkSuperuserOrPermission('Customers', 'Delete'), adminLogger(), deleteCustomers);

// Route to delete a customer by ID
router.delete('/:id', authMiddleware, checkBlacklistedToken, checkSuperuserOrPermission('Customers', 'Delete'), adminLogger(), deleteCustomer);

// Route to get all customers
router.get('/', authMiddleware, checkBlacklistedToken, checkSuperuserOrPermission('Customers', 'View'), getAllCustomers);
router.get('/getcustomer-forstore',  getAllCustomersForStore);

// Route to deactivate a customer account
router.post('/deactivate', authMiddleware, checkBlacklistedToken, deactivateAccount);

// Route to reactivate a customer account
router.post('/reactivate', authMiddleware, checkBlacklistedToken, reactivateAccount);



module.exports = router;
