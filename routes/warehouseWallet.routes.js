const express = require('express');
const router = express.Router();
const { 
    createWarehouseWallet, 
    getAllWarehouseWallets, 
    getWarehouseWallet, 
    updateWarehouseWallet, 
    deleteWarehouseWallet 
} = require('../controllers/warehouseWallet.controller');

// Create warehouse wallet
router.post('/', createWarehouseWallet);

// Get all warehouse wallets
router.get('/', getAllWarehouseWallets);

// Get single warehouse wallet
router.get('/:warehouseId', getWarehouseWallet);

// Update warehouse wallet
router.put('/:warehouseId', updateWarehouseWallet);

// Delete warehouse wallet
router.delete('/:warehouseId', deleteWarehouseWallet);

module.exports = router;
