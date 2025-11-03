const Warehouse = require('../models/warehouse.model');
const WarehouseWallet = require('../models/warehouseWallet.model');
const mongoose = require('mongoose');

class WarehouseService {
    static async massImportWarehouses(warehouseData) {
        const session = await mongoose.startSession();
        session.startTransaction();
        
        try {
            const results = {
                created: 0,
                updated: 0,
                errors: []
            };
            
            for (const data of warehouseData) {
                try {
                    // Check if warehouse exists
                    let warehouse = await Warehouse.findOne({ name: data.name }).session(session);
                    
                    if (warehouse) {
                        // Update existing warehouse
                        warehouse.location = data.location || warehouse.location;
                        warehouse.capacity = data.capacity || warehouse.capacity;
                        warehouse.description = data.description || warehouse.description;
                        await warehouse.save({ session });
                        
                        // Update wallet balance (replace, not add)
                        await WarehouseWallet.findOneAndUpdate(
                            { warehouse: warehouse._id },
                            { 
                                balance: data.balance,
                                lastTransaction: new Date()
                            },
                            { 
                                upsert: true,
                                session 
                            }
                        );
                        
                        results.updated++;
                    } else {
                        // Create new warehouse
                        warehouse = new Warehouse({
                            name: data.name,
                            location: data.location,
                            capacity: data.capacity,
                            description: data.description
                        });
                        await warehouse.save({ session });
                        
                        // Create wallet for new warehouse
                        const wallet = new WarehouseWallet({
                            warehouse: warehouse._id,
                            balance: data.balance
                        });
                        await wallet.save({ session });
                        
                        results.created++;
                    }
                } catch (error) {
                    results.errors.push({
                        warehouse: data.name,
                        error: error.message
                    });
                }
            }
            
            await session.commitTransaction();
            return results;
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    static async exportWarehouses() {
        try {
            const warehouses = await Warehouse.aggregate([
                {
                    $lookup: {
                        from: 'warehousewallets',
                        localField: '_id',
                        foreignField: 'warehouse',
                        as: 'wallet'
                    }
                },
                {
                    $unwind: {
                        path: '$wallet',
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $project: {
                        name: 1,
                        location: 1,
                        capacity: 1,
                        description: 1,
                        balance: { $ifNull: ['$wallet.balance', 0] },
                        isActive: 1,
                        createdAt: 1,
                        updatedAt: 1
                    }
                }
            ]);
            
            return warehouses;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = WarehouseService;
