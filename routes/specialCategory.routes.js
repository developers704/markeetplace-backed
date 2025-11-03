const express = require('express');
const router = express.Router();
const upload = require('../config/specialCategory.js');
const controller = require('../controllers/specialCategory.controller.js');
const authMiddleware = require('../middlewares/authMiddleware.js');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission.js');
router.post('/', [authMiddleware,upload.single('image')], controller.createCategory);
router.post('/bulk-delete',  [authMiddleware],controller.bulkDeleteCategories);
router.get('/', authMiddleware, controller.getAllCategories);
router.get('/:id',  authMiddleware, controller.getCategoryById);
router.patch('/:id',  authMiddleware,upload.single('image'), controller.updateCategory);
router.delete('/:id',  [authMiddleware],controller.deleteCategory);

module.exports = router;
