const express = require('express');
const router = express.Router();
const {
    createWarehouse,
    getAllWarehouses,
    getWarehouseById,
    updateWarehouse,
    deleteWarehouse,
    bulkDeleteWarehouses,
    WarehouseController
} = require('../controllers/warehouse.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const adminLogger = require('../middlewares/adminLogger');
const upload = require('../middlewares/uploadWarehouse.middleware');


router.post('/', authMiddleware, adminLogger(), createWarehouse);
router.post('/mass-import', upload.single('file'), WarehouseController.massImport);
router.get('/', 
    // authMiddleware, 
    getAllWarehouses);
// router.get('/export/excel', WarehouseController.exportToExcel);
router.get('/export', WarehouseController.exportBalance);
router.get('/template', WarehouseController.downloadTemplate);
router.get('/:id', authMiddleware, getWarehouseById);
router.put('/:id', authMiddleware, adminLogger(), updateWarehouse);
router.delete('/bulk-delete', authMiddleware, adminLogger(), bulkDeleteWarehouses);
router.delete('/:id', authMiddleware, adminLogger(), deleteWarehouse);

module.exports = router;
