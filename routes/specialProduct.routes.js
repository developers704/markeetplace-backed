const express = require('express');
const router = express.Router();
const upload = require('../config/specialProductMulter.js');
const controller = require('../controllers/specialProduct.controller.js');
const authMiddleware = require('../middlewares/authMiddleware.js');

const uploadFields = upload.fields([
    {name:  'image', maxCount: 1},
    {name: 'gallery', maxCount: 5}

]);

router.post('/', [authMiddleware,uploadFields], controller.createProduct);
router.post('/bulk-delete', authMiddleware , controller.bulkDeleteProducts)
router.get('/', authMiddleware,controller.getAllProducts);
router.get('/search', authMiddleware,controller.searchSpecialProducts);

router.get('/type/:type', controller.specialProductController.getProductsByType);
router.get('/filters/:categoryId', controller.getCategoryFiltersAndProducts)
router.get('/category/:categoryId', controller.specialProductController.getProductsByCategory);
router.get('/:id', authMiddleware,controller.getProductById);
router.put('/:id',[authMiddleware, uploadFields], controller.updateProduct);
router.delete('/:id', authMiddleware,controller.deleteProduct);
module.exports = router;