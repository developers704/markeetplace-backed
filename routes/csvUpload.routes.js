const express = require('express');
const router = express.Router();
const csvUpload = require('../config/csvUpload.config.js');
const controller = require('../controllers/csvUpload.controller.js')

router.post('/special', csvUpload.single('csvFile'), controller.uploadCSV);
router.post('/special-category', csvUpload.single('csvFile'), controller.uploadCategoryCSV);
router.get('/export/inventory', controller.exportAllProductsInventory);
router.get('/export/special', controller.exportSpecialProducts);
router.get('/export/product', controller.exportProducts);


module.exports = router;