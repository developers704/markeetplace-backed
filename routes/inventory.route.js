const express = require('express');
const router = express.Router();
const {
    addInventory,
    updateInventory,
    deleteInventory,
    getAllInventories,
    getAvailableInventoriesDetailed,
    createSampleInventoryCsvTemplate,
    bulkUploadInventory,
    deleteInventories,
    bulkUpdateInventories
} = require('../controllers/inventory.controller');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');
const multer = require('multer');
const upload = multer({ dest: 'uploads/temp/' });
const adminLogger = require('../middlewares/adminLogger');


router.post('/', checkSuperuserOrPermission('Inventory', 'Create'), adminLogger(), addInventory);
router.post('/bulk-upload', checkSuperuserOrPermission('Inventory', 'Create'), upload.single('csv'), bulkUploadInventory);
router.put('/bulk-update', checkSuperuserOrPermission('Inventory', 'Update'), bulkUpdateInventories);
router.put('/:id', checkSuperuserOrPermission('Inventory', 'Update'), adminLogger(), updateInventory);
// router.get('/', checkSuperuserOrPermission('Inventory', 'View'), getAllInventories);
router.get('/',  getAllInventories);
// Public route to fetch available inventories with full product details (image, prices, gallery)
router.get('/available-detailed', getAvailableInventoriesDetailed);
router.get('/sample-csv', createSampleInventoryCsvTemplate);
router.delete('/bulk-delete', checkSuperuserOrPermission('Inventory', 'Delete'), adminLogger(), deleteInventories);
router.delete('/:id', checkSuperuserOrPermission('Inventory', 'Delete'), adminLogger(), deleteInventory);


module.exports = router;
