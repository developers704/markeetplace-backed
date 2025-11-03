const express = require('express');
const router = express.Router();
const { createShowcasedProduct, updateShowcasedProduct, getShowcasedProducts, deleteShowcasedProduct } = require('../controllers/showcasedProduct.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const uploadMiddleware = require('../middlewares/uploadMiddleware');
const adminLogger = require('../middlewares/adminLogger');


router.post('/', authMiddleware, checkSuperuserOrPermission('Showcased Products', 'Create'), uploadMiddleware, adminLogger(), createShowcasedProduct);
router.get('/', getShowcasedProducts);
router.put('/:id', authMiddleware, checkSuperuserOrPermission('Showcased Products', 'Update'), uploadMiddleware, adminLogger(), updateShowcasedProduct);
router.delete('/:id', authMiddleware, checkSuperuserOrPermission('Showcased Products', 'Delete'), adminLogger(), deleteShowcasedProduct);

module.exports = router;
