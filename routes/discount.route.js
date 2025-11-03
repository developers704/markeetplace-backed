const express = require('express');
const {
    createDiscount,
    getAllDiscounts,
    getDiscountById,
    updateDiscount,
    deleteDiscount,
    applyDiscount,
    removeDiscount
} = require('../controllers/discount.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const adminLogger = require('../middlewares/adminLogger');



const router = express.Router();

router.post('/', authMiddleware, checkSuperuserOrPermission('Discounts', 'Create'), adminLogger(), createDiscount);
router.get('/', authMiddleware, checkSuperuserOrPermission('Discounts', 'View'), getAllDiscounts);
router.get('/:id', authMiddleware, checkSuperuserOrPermission('Discounts', 'View'), getDiscountById);
router.put('/:id', authMiddleware, checkSuperuserOrPermission('Discounts', 'Update'), adminLogger(), updateDiscount);
router.delete('/:id', authMiddleware, checkSuperuserOrPermission('Discounts', 'Delete'), adminLogger(), deleteDiscount);
router.post('/apply', authMiddleware, checkSuperuserOrPermission('Discounts', 'Update'), applyDiscount);
router.post('/remove', authMiddleware, checkSuperuserOrPermission('Discounts', 'Delete'), removeDiscount);


module.exports = router;
