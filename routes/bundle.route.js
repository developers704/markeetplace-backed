// routes/bundle.route.js
const express = require('express');
const router = express.Router();
const {
    createBundle,
    getAllBundles,
    getBundleById,
    updateBundle,
    deleteBundle
} = require('../controllers/bundle.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const uploadBundleImageMiddleware = require('../middlewares/uploadBundleImageMiddleware');

router.post('/', authMiddleware, checkSuperuserOrPermission('Bundles', 'Create'), uploadBundleImageMiddleware, createBundle);
router.get('/', getAllBundles);
router.get('/:id', getBundleById);
router.put('/:id', authMiddleware, checkSuperuserOrPermission('Bundles', 'Update'), uploadBundleImageMiddleware, updateBundle);
router.delete('/:id', authMiddleware, checkSuperuserOrPermission('Bundles', 'Delete'), deleteBundle);

module.exports = router;
