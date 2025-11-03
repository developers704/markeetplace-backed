const express = require('express');
const router = express.Router();
const upload = require('../config/specialCategory.js');
const controller = require('../controllers/specialSubCategory.controller');
const authMiddleware = require('../middlewares/authMiddleware.js')
router.post('/', [authMiddleware,upload.single('image')], controller.createSubCategory);
router.get('/', authMiddleware,controller.getAllSubCategories);
router.get('/:id', authMiddleware,controller.getSubCategoryById);
router.patch('/:id', [authMiddleware,upload.single('image')], controller.updateSubCategory);
router.delete('/:id', authMiddleware,controller.deleteSubCategory);

module.exports = router;
