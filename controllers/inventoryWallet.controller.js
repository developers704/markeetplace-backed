const InventoryWallet = require('../models/inventoryWallet.model');
const Warehouse = require('../models/warehouse.model');

// Create Inventory Wallet
const createInventoryWallet = async (req, res) => {
    try {
        const { warehouseId, balance } = req.body;
        
        const existingWallet = await InventoryWallet.findOne({ warehouse: warehouseId });
        if (existingWallet) {
            return res.status(400).json({ message: 'Inventory wallet already exists for this warehouse' });
        }

        const wallet = new InventoryWallet({
            warehouse: warehouseId,
            balance: balance || 0
        });

        await wallet.save();
        res.status(201).json({ message: 'Inventory wallet created', wallet });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Get All Inventory Wallets
const getAllInventoryWallets = async (req, res) => {
    try {
        const wallets = await InventoryWallet.find()
            .populate('warehouse', 'name location');
        res.status(200).json(wallets);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Get Single Inventory Wallet
const getInventoryWallet = async (req, res) => {
    try {
        const wallet = await InventoryWallet.findOne({ warehouse: req.params.warehouseId })
            .populate('warehouse', 'name location');
        
        if (!wallet) {
            return res.status(404).json({ message: 'Inventory wallet not found' });
        }
        res.status(200).json(wallet);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Update Inventory Wallet Balance
const updateInventoryWallet = async (req, res) => {
    try {
        const { balance, type } = req.body;
        const wallet = await InventoryWallet.findOne({ warehouse: req.params.warehouseId });
        
        if (!wallet) {
            return res.status(404).json({ message: 'Inventory wallet not found' });
        }

        if (type === 'add') {
            wallet.balance += Number(balance);
        } else if (type === 'subtract') {
            if (wallet.balance < balance) {
                return res.status(400).json({ message: 'Insufficient balance' });
            }
            wallet.balance -= Number(balance);
        } else {
            wallet.balance = Number(balance);
        }

        wallet.lastTransaction = Date.now();
        await wallet.save();
        
        res.status(200).json({ message: 'Inventory wallet updated successfully', wallet });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Delete Inventory Wallet
const deleteInventoryWallet = async (req, res) => {
    try {
        const wallet = await InventoryWallet.findOneAndDelete({ warehouse: req.params.warehouseId });
        
        if (!wallet) {
            return res.status(404).json({ message: 'Inventory wallet not found' });
        }
        
        res.status(200).json({ message: 'Inventory wallet deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

module.exports = {
    createInventoryWallet,
    getAllInventoryWallets,
    getInventoryWallet,
    updateInventoryWallet,
    deleteInventoryWallet
};
