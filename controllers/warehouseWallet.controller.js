const WarehouseWallet = require('../models/warehouseWallet.model');
const Warehouse = require('../models/warehouse.model');

// Create Warehouse Wallet
const createWarehouseWallet = async (req, res) => {
    try {
        const { warehouseId, balance } = req.body;
        
        const existingWallet = await WarehouseWallet.findOne({ warehouse: warehouseId });
        if (existingWallet) {
            return res.status(400).json({ message: 'Wallet already exists for this warehouse' });
        }

        const wallet = new WarehouseWallet({
            warehouse: warehouseId,
            balance: balance || 0
        });

        await wallet.save();
        res.status(201).json({ message: 'Warehouse wallet created', wallet });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Get All Warehouse Wallets
const getAllWarehouseWallets = async (req, res) => {
    try {
        const wallets = await WarehouseWallet.find()
            .populate('warehouse', 'name location');
        res.status(200).json(wallets);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Get Single Warehouse Wallet
const getWarehouseWallet = async (req, res) => {
    try {
        const wallet = await WarehouseWallet.findOne({ warehouse: req.params.warehouseId })
            .populate('warehouse', 'name location');
        
        if (!wallet) {
            return res.status(404).json({ message: 'Wallet not found' });
        }
        res.status(200).json(wallet);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Update Warehouse Wallet Balance
const updateWarehouseWallet = async (req, res) => {
    try {
        const { balance, type } = req.body;
        const wallet = await WarehouseWallet.findOne({ warehouse: req.params.warehouseId });
        
        if (!wallet) {
            return res.status(404).json({ message: 'Wallet not found' });
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
        
        res.status(200).json({ message: 'Wallet updated successfully', wallet });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Delete Warehouse Wallet
const deleteWarehouseWallet = async (req, res) => {
    try {
        const wallet = await WarehouseWallet.findOneAndDelete({ warehouse: req.params.warehouseId });
        
        if (!wallet) {
            return res.status(404).json({ message: 'Wallet not found' });
        }
        
        res.status(200).json({ message: 'Wallet deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

module.exports = {
    createWarehouseWallet,
    getAllWarehouseWallets,
    getWarehouseWallet,
    updateWarehouseWallet,
    deleteWarehouseWallet
};
