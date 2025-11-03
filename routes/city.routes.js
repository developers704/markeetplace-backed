const express = require('express');
const router = express.Router();
const cityController = require('../controllers/city.controller');
const multer = require('multer');
const upload = multer({ dest: 'uploads/temp/' });
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const adminLogger = require('../middlewares/adminLogger');


router.post('/', authMiddleware, checkSuperuserOrPermission('Inventory', 'Create'), adminLogger(), cityController.createCity);
router.get('/', cityController.getCities);
router.post('/bulk-upload', authMiddleware, checkSuperuserOrPermission('Inventory', 'Create'), upload.single('file'), cityController.bulkUploadCities);
router.delete('/bulk-delete', authMiddleware, checkSuperuserOrPermission('Inventory', 'Delete'), adminLogger(), cityController.bulkDeleteCities);

module.exports = router;
