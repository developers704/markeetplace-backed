const express = require('express');
const router = express.Router();
const {
    createOrderStatus,
    getAllOrderStatuses,
    updateOrderStatus,
    deleteOrderStatus
} = require('../controllers/orderStatus.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const adminLogger = require('../middlewares/adminLogger');

router.post('/', authMiddleware, checkSuperuserOrPermission('OrderStatus', 'Create'), adminLogger(), createOrderStatus);
router.get('/', getAllOrderStatuses);
router.put('/:id', authMiddleware, checkSuperuserOrPermission('OrderStatus', 'Update'), adminLogger(), updateOrderStatus);
router.delete('/:id', authMiddleware, checkSuperuserOrPermission('OrderStatus', 'Delete'), adminLogger(), deleteOrderStatus);

module.exports = router;
