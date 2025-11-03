const express = require('express');
const router = express.Router();
const paymentStatusController = require('../controllers/paymentStatus.controller'); // Require the PaymentStatus controller
const adminLogger = require('../middlewares/adminLogger');
const authMiddleware = require('../middlewares/authMiddleware');



// Route to create a new payment status
router.post('/', authMiddleware, adminLogger(), paymentStatusController.createPaymentStatus);

// Route to get all payment statuses
router.get('/', paymentStatusController.getPaymentStatuses);

// Route to update a payment status by ID
router.put('/:id', authMiddleware, adminLogger(), paymentStatusController.updatePaymentStatus);

// Route to delete a payment status by ID
router.delete('/bulk-delete', authMiddleware, adminLogger(), paymentStatusController.bulkDeletePaymentStatuses);

module.exports = router;
