const express = require('express');
const router = express.Router();
const tagController = require('../controllers/tag.controller');
const multer = require('multer');
const upload = multer({ dest: 'uploads/temp/' });
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const adminLogger = require('../middlewares/adminLogger');


router.post('/', authMiddleware, checkSuperuserOrPermission('Products', 'Create'), adminLogger(), tagController.createTag);
router.get('/', tagController.getTags);
router.post('/bulk-upload', authMiddleware, checkSuperuserOrPermission('Products', 'Create'), upload.single('file'), tagController.bulkUploadTags);
router.delete('/bulk-delete', authMiddleware, checkSuperuserOrPermission('Products', 'Delete'), adminLogger(), tagController.bulkDeleteTags);

module.exports = router;
