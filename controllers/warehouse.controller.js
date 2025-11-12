const Warehouse = require('../models/warehouse.model');
const WarehouseWallet = require('../models/warehouseWallet.model');
const InventoryWallet = require('../models/inventoryWallet.model');
const SuppliesWallet = require('../models/suppliesWallet.model');
const AdminNotification = require('../models/adminNotification.model');
const WarehouseService = require('../services/warehouse.service');
const CSVProcessor  = require('../middlewares/fileProcessor');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const User = require('../models/user.model');
const Customer = require('../models/customer.model');


const createWarehouse = async (req, res) => {
    try {
        const { 
            name, 
            initialBalance, 
            initialSuppliesBalance, 
            initialInventoryBalance, 
            corporateManager, 
            districtManager
        } = req.body;

        // 1️⃣ Validation
        if (!name) {
            return res.status(400).json({ message: 'Warehouse name is required' });
        }
        const existingWarehouse = await Warehouse.findOne({ name });
        if (existingWarehouse) {
            return res.status(400).json({ message: 'Warehouse with this name already exists' });
        }

        // 2️⃣ Create warehouse
        const warehouse = new Warehouse({
            name,
            corporateManager,
            districtManager,
            ...req.body
        });
        await warehouse.save();

        // 3️⃣ Create wallets
        const warehouseWallet = new WarehouseWallet({
            warehouse: warehouse._id,
            balance: initialBalance || 0
        });
        await warehouseWallet.save();

        const inventoryWallet = new InventoryWallet({
            warehouse: warehouse._id,
            balance: initialInventoryBalance || 0
        });
        await inventoryWallet.save();

        const suppliesWallet = new SuppliesWallet({
            warehouse: warehouse._id,
            balance: initialSuppliesBalance || 0
        });
        await suppliesWallet.save();

        // 4️⃣ Add warehouse ID to managers’ profile
        const updateOps = [];
        if (districtManager) {
            updateOps.push(
                Customer.findByIdAndUpdate(
                    districtManager,
                    { $addToSet: { warehouse: warehouse._id } },
                    { new: true }
                )
            );
        }
        if (corporateManager) {
            updateOps.push(
                Customer.findByIdAndUpdate(
                    corporateManager,
                    { $addToSet: { warehouse: warehouse._id } },
                    { new: true }
                )
            );
        }
        await Promise.all(updateOps);

        // 5️⃣ Create admin notification
        const adminNotification = new AdminNotification({
            user: req.user.id, // user creating the warehouse (admin)
            type: 'WAREHOUSE',
            content: `New warehouse "${warehouse.name}" has been created.`,
            resourceId: warehouse._id,
            resourceModel: 'Warehouse',
            priority: 'medium'
        });
        await adminNotification.save();

        // 6️⃣ (Optional) Send notifications to managers
        if (districtManager || corporateManager) {
            const notifications = [];

            if (districtManager) {
                notifications.push(
                    new AdminNotification({
                        user: districtManager,
                        type: 'INFO',
                        content: `You have been assigned as District Manager for warehouse "${warehouse.name}".`,
                        resourceId: warehouse._id,
                        resourceModel: 'Warehouse',
                        priority: 'medium'
                    }).save()
                );
            }

            if (corporateManager) {
                notifications.push(
                    new AdminNotification({
                        user: corporateManager,
                        type: 'INFO',
                        content: `You have been assigned as Corporate Manager for warehouse "${warehouse.name}".`,
                        resourceId: warehouse._id,
                        resourceModel: 'Warehouse',
                        priority: 'medium'
                    }).save()
                );
            }

            await Promise.all(notifications);
        }

        // ✅ Final response
        res.status(201).json({
            message: 'Warehouse created successfully',
            warehouse
        });

    } catch (error) {
        console.error("Error creating warehouse:", error);
        res.status(500).json({ message: error.message });
    }
};


// const getAllWarehouses = async (req, res) => {
//     try {
//         const warehouses = await Warehouse.find().sort({ updatedAt: -1 });
//         res.status(200).json(warehouses);
//     } catch (error) {
//         res.status(400).json({ message: error.message });
//     }
// };

const getAllWarehouses = async (req, res) => {
    try {
        const warehouses = await Warehouse.find()
            .sort({ updatedAt: -1 })
            .lean(); // Using lean for better performance

        // Get wallet info for all warehouses in a single query
        // const wallets = await WarehouseWallet.find({
        //     warehouse: { $in: warehouses.map(w => w._id) }
        // }).lean();

        // Create a map of wallet data by warehouse ID
        // const walletMap = wallets.reduce((map, wallet) => {
        //     map[wallet.warehouse.toString()] = wallet;
        //     return map;
        // }, {});

        // Combine warehouse and wallet data
        // const warehousesWithWallets = warehouses.map(warehouse => ({
        //     ...warehouse,
        //     wallet: walletMap[warehouse._id.toString()] || { balance: 0, lastTransaction: null }
        // }));

        const inventoryWallets = await InventoryWallet.find({
            warehouse: { $in: warehouses.map(w => w._id) }
        }).lean();

        const suppliesWallets = await SuppliesWallet.find({
            warehouse: { $in: warehouses.map(w => w._id) }
        }).lean();

        const inventoryWalletMap = inventoryWallets.reduce((map, wallet) => {
            map[wallet.warehouse.toString()] = wallet;
            return map;
        }, {});
        
        const suppliesWalletMap = suppliesWallets.reduce((map, wallet) => {
            map[wallet.warehouse.toString()] = wallet;
            return map;
        }, {});

        const warehousesWithWallets = warehouses.map(warehouse => ({
            ...warehouse,
            // warehouseWallet: warehouseWalletMap[warehouse._id.toString()] || { balance: 0, lastTransaction: null },
            inventoryWallet: inventoryWalletMap[warehouse._id.toString()] || { balance: 0, lastTransaction: null },
            suppliesWallet: suppliesWalletMap[warehouse._id.toString()] || { balance: 0, lastTransaction: null }
        }));


        res.status(200).json(warehousesWithWallets);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


const getWarehouseById = async (req, res) => {
    try {
        const warehouse = await Warehouse.findById(req.params.id);
        if (!warehouse) return res.status(404).json({ message: 'Warehouse not found' });

        // Get all wallet types for this warehouse
        // const warehouseWallet = await WarehouseWallet.findOne({ warehouse: warehouse._id });
        const inventoryWallet = await InventoryWallet.findOne({ warehouse: warehouse._id });
        const suppliesWallet = await SuppliesWallet.findOne({ warehouse: warehouse._id });

        const result = {
            ...warehouse.toObject(),
            // warehouseWallet: warehouseWallet || { balance: 0 },
            inventoryWallet: inventoryWallet || { balance: 0 },
            suppliesWallet: suppliesWallet || { balance: 0 }
        };

        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const updateWarehouse = async (req, res) => {
  try {
    const {
      name,
      initialBalance,
      initialInventoryBalance,
      initialSuppliesBalance,
      districtManager,
      corporateManager,
    } = req.body;

    // 🔹 Check for duplicate name
    if (name) {
      const existingWarehouse = await Warehouse.findOne({
        name,
        _id: { $ne: req.params.id },
      });
      if (existingWarehouse) {
        return res
          .status(400)
          .json({ message: 'Warehouse with this name already exists' });
      }
    }

    // 🔹 Find current warehouse before updating
    const oldWarehouse = await Warehouse.findById(req.params.id);
    if (!oldWarehouse)
      return res.status(404).json({ message: 'Warehouse not found' });

    // 🔹 Update warehouse data
    const warehouse = await Warehouse.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    // 🔹 Update wallets if balances provided
    // if (initialBalance !== undefined) {
    //   await WarehouseWallet.findOneAndUpdate(
    //     { warehouse: warehouse._id },
    //     { balance: initialBalance },
    //     { new: true, upsert: true }
    //   );
    // }

    if (initialInventoryBalance !== undefined) {
      await InventoryWallet.findOneAndUpdate(
        { warehouse: warehouse._id },
        { balance: initialInventoryBalance },
        { new: true, upsert: true }
      );
    }

    if (initialSuppliesBalance !== undefined) {
      await SuppliesWallet.findOneAndUpdate(
        { warehouse: warehouse._id },
        { balance: initialSuppliesBalance },
        { new: true, upsert: true }
      );
    }

    // 🔹 Handle manager reassignment
    const updateOps = [];

    // 🟢 Remove warehouse from old district manager if changed
    if (
      oldWarehouse.districtManager &&
      oldWarehouse.districtManager.toString() !== districtManager
    ) {
      updateOps.push(
        Customer.findByIdAndUpdate(oldWarehouse.districtManager, {
          $pull: { warehouse: warehouse._id },
        })
      );
    }

    // 🟢 Remove warehouse from old corporate manager if changed
    if (
      oldWarehouse.corporateManager &&
      oldWarehouse.corporateManager.toString() !== corporateManager
    ) {
      updateOps.push(
        Customer.findByIdAndUpdate(oldWarehouse.corporateManager, {
          $pull: { warehouse: warehouse._id },
        })
      );
    }

    // 🟢 Add warehouse to new district manager
    if (districtManager) {
      updateOps.push(
        Customer.findByIdAndUpdate(
          districtManager,
          { $addToSet: { warehouse: warehouse._id } },
          { new: true }
        )
      );
    }

    // 🟢 Add warehouse to new corporate manager
    if (corporateManager) {
      updateOps.push(
        Customer.findByIdAndUpdate(
          corporateManager,
          { $addToSet: { warehouse: warehouse._id } },
          { new: true }
        )
      );
    }

    await Promise.all(updateOps);

    // ✅ Response
    res
      .status(200)
      .json({ message: 'Warehouse updated successfully', warehouse });
  } catch (error) {
    console.error('Update Warehouse Error:', error);
    res.status(400).json({ message: error.message });
  }
};


const deleteWarehouse = async (req, res) => {
    try {
        const warehouse = await Warehouse.findByIdAndDelete(req.params.id);
        if (!warehouse) return res.status(404).json({ message: 'Warehouse not found' });
        await InventoryWallet.deleteOne({ warehouse: req.params.id });
        await SuppliesWallet.deleteOne({ warehouse: req.params.id });
        res.status(200).json({ message: 'Warehouse deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const bulkDeleteWarehouses = async (req, res) => {
    try {
        const { ids } = req.body;

        // Check if IDs are provided
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: 'No IDs provided for deletion' });
        }

        // await WarehouseWallet.deleteMany({ warehouse: { $in: ids } });
        await InventoryWallet.deleteMany({ warehouse: { $in: ids } });
        await SuppliesWallet.deleteMany({ warehouse: { $in: ids } });


        // Perform the bulk delete operation
        const result = await Warehouse.deleteMany({ _id: { $in: ids } });

        // Check if any records were deleted
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'No warehouses found with the provided IDs' });
        }

        res.status(200).json({
            message: `${result.deletedCount} warehouse(s) deleted successfully`,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};



class WarehouseController{
    static async downloadTemplate(req, res) {
        try {
            const headers = [
                'warehouse_name', 
                'supplies_balance', 
                'inventory_balance', 
                'location', 
                'capacity', 
                'description'
            ];
            
            const sampleData = [
                {
                    warehouse_name: 'Main Warehouse',
                    supplies_balance: 5000,
                    inventory_balance: 3000,
                    location: 'Karachi',
                    capacity: 1000,
                    description: 'Main storage facility'
                },
                {
                    warehouse_name: 'Secondary Warehouse',
                    supplies_balance: 3000,
                    inventory_balance: 2000,
                    location: 'Lahore',
                    capacity: 500,
                    description: 'Secondary storage facility'
                }
            ];

            const format = req.query.format || 'csv';
            
            if (format === 'excel') {
                const buffer = CSVProcessor.generateExcel(sampleData, headers);
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', 'attachment; filename=warehouse_balance_template.xlsx');
                res.send(buffer);
            } else {
                const csvContent = CSVProcessor.generateCSV(sampleData, headers);
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', 'attachment; filename=warehouse_balance_template.csv');
                res.send(csvContent);
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error generating template',
                error: error.message
            });
        }
    }

    // Mass import warehouse balance (Dono wallets ke liye)
    static async massImport(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No file uploaded'
                });
            }

            const filePath = req.file.path;
            const data = await CSVProcessor.processFile(filePath);

            const results = {
                success: [],
                errors: [],
                created: 0,
                updated: 0
            };

            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                try {
                    const warehouseName = row.warehouse_name || row['Warehouse Name'] || row.name;
                    const suppliesBalance = parseFloat(row.supplies_balance || row['Supplies Balance'] || 0);
                    const inventoryBalance = parseFloat(row.inventory_balance || row['Inventory Balance'] || 0);
                    const location = row.location || row.Location || '';
                    const capacity = parseInt(row.capacity || row.Capacity || 0);
                    const description = row.description || row.Description || '';

                    if (!warehouseName) {
                        results.errors.push({
                            row: i + 1,
                            error: 'Warehouse name is required'
                        });
                        continue;
                    }

                    if (isNaN(suppliesBalance) || suppliesBalance < 0) {
                        results.errors.push({
                            row: i + 1,
                            error: 'Invalid supplies balance amount'
                        });
                        continue;
                    }

                    if (isNaN(inventoryBalance) || inventoryBalance < 0) {
                        results.errors.push({
                            row: i + 1,
                            error: 'Invalid inventory balance amount'
                        });
                        continue;
                    }

                    // Find or create warehouse
                    let warehouse = await Warehouse.findOne({ name: warehouseName });
                    let isNewWarehouse = false;

                    if (!warehouse) {
                        warehouse = new Warehouse({
                            name: warehouseName,
                            location: location,
                            capacity: capacity,
                            description: description,
                            isActive: true
                        });
                        await warehouse.save();
                        isNewWarehouse = true;
                        results.created++;
                    } else {
                        // Update warehouse details if provided
                        if (location) warehouse.location = location;
                        if (capacity) warehouse.capacity = capacity;
                        if (description) warehouse.description = description;
                        await warehouse.save();
                        results.updated++;
                    }

                    // Update or create supplies wallet
                    let suppliesWallet = await SuppliesWallet.findOne({ warehouse: warehouse._id });
                    
                    if (!suppliesWallet) {
                        suppliesWallet = new SuppliesWallet({
                            warehouse: warehouse._id,
                            balance: suppliesBalance,
                            lastTransaction: new Date()
                        });
                    } else {
                        // Set exact balance (not add to existing)
                        suppliesWallet.balance = suppliesBalance;
                        suppliesWallet.lastTransaction = new Date();
                    }
                    
                    await suppliesWallet.save();

                    // Update or create inventory wallet
                    let inventoryWallet = await InventoryWallet.findOne({ warehouse: warehouse._id });
                    
                    if (!inventoryWallet) {
                        inventoryWallet = new InventoryWallet({
                            warehouse: warehouse._id,
                            balance: inventoryBalance,
                            lastTransaction: new Date()
                        });
                    } else {
                        // Set exact balance (not add to existing)
                        inventoryWallet.balance = inventoryBalance;
                        inventoryWallet.lastTransaction = new Date();
                    }
                    
                    await inventoryWallet.save();

                    results.success.push({
                        row: i + 1,
                        warehouse: warehouseName,
                        supplies_balance: suppliesBalance,
                        inventory_balance: inventoryBalance,
                        action: isNewWarehouse ? 'created' : 'updated'
                    });

                } catch (error) {
                    results.errors.push({
                        row: i + 1,
                        error: error.message
                    });
                }
            }

            // Clean up uploaded file
            fs.unlinkSync(filePath);

            res.status(200).json({
                success: true,
                message: 'Import completed',
                results: results
            });

        } catch (error) {
            // Clean up uploaded file in case of error
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            res.status(500).json({
                success: false,
                message: 'Error during import',
                error: error.message
            });
        }
    }

    // Export warehouse balance (Dono wallets ke saath)
    static async exportBalance(req, res) {
        try {
            const format = req.query.format || 'csv';
            
            // Get all warehouses with their both wallet balances
            const warehouses = await Warehouse.aggregate([
                {
                    $lookup: {
                        from: 'supplieswallets',
                        localField: '_id',
                        foreignField: 'warehouse',
                        as: 'suppliesWallet'
                    }
                },
                {
                    $lookup: {
                        from: 'inventorywallets',
                        localField: '_id',
                        foreignField: 'warehouse',
                        as: 'inventoryWallet'
                    }
                },
                {
                    $project: {
                        warehouse_name: '$name',
                        location: '$location',
                        capacity: '$capacity',
                        description: '$description',
                        supplies_balance: {
                            $ifNull: [{ $arrayElemAt: ['$suppliesWallet.balance', 0] }, 0]
                        },
                        inventory_balance: {
                            $ifNull: [{ $arrayElemAt: ['$inventoryWallet.balance', 0] }, 0]
                        },
                        isActive: '$isActive',
                        createdAt: '$createdAt',
                        updatedAt: '$updatedAt'
                    }
                }
            ]);

            const headers = [
                'warehouse_name', 
                'supplies_balance', 
                'inventory_balance', 
                'location', 
                'capacity', 
                'description', 
                'isActive'
            ];

            if (format === 'excel') {
                const buffer = CSVProcessor.generateExcel(warehouses, headers);
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', 'attachment; filename=warehouse_balance_export.xlsx');
                res.send(buffer);
            } else {
                const csvContent = CSVProcessor.generateCSV(warehouses, headers);
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', 'attachment; filename=warehouse_balance_export.csv');
                res.send(csvContent);
            }

        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error during export',
                error: error.message
            });
        }
    }

    // Get all warehouse balances (Dono wallets ke saath)
    static async getAllBalances(req, res) {
        try {
            const warehouses = await Warehouse.aggregate([
                {
                    $lookup: {
                        from: 'supplieswallets',
                        localField: '_id',
                        foreignField: 'warehouse',
                        as: 'suppliesWallet'
                    }
                },
                {
                    $lookup: {
                        from: 'inventorywallets',
                        localField: '_id',
                        foreignField: 'warehouse',
                        as: 'inventoryWallet'
                    }
                },
                {
                    $project: {
                        name: 1,
                        location: 1,
                        capacity: 1,
                        description: 1,
                        isActive: 1,
                        supplies_balance: {
                            $ifNull: [{ $arrayElemAt: ['$suppliesWallet.balance', 0] }, 0]
                        },
                        inventory_balance: {
                            $ifNull: [{ $arrayElemAt: ['$inventoryWallet.balance', 0] }, 0]
                        },
                        supplies_lastTransaction: {
                            $arrayElemAt: ['$suppliesWallet.lastTransaction', 0]
                        },
                        inventory_lastTransaction: {
                            $arrayElemAt: ['$inventoryWallet.lastTransaction', 0]
                        },
                        createdAt: 1,
                        updatedAt: 1
                    }
                }
            ]);

            res.status(200).json({
                success: true,
                data: warehouses
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error fetching warehouse balances',
                error: error.message
            });
        }
    }
}


module.exports = {
    createWarehouse,
    getAllWarehouses,
    getWarehouseById,
    updateWarehouse,
    deleteWarehouse,
    bulkDeleteWarehouses,
    WarehouseController
};
