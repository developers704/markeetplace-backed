const Inventory = require('../models/inventory.model');
const Product = require('../models/product.model');
const Warehouse = require('../models/warehouse.model');
const City = require('../models/city.model');
const { deleteFile } = require('../config/fileOperations');
const fsSync = require('fs');
const csv = require('csv-parser');
const cron = require('node-cron');
const SpecialProduct = require('../models/specialProduct.model');
const { createAdminNotification } = require('../controllers/adminNotification.controller');







// const addInventory = async (req, res) => {
//     try {
//         const { product, warehouse, city, quantity, locationWithinWarehouse, batchId, expiryDate, barcode, vat, stockAlertThreshold, expiryDateThreshold } = req.body;

//         const productExists = await Product.findById(product);
//         if (!productExists) {
//             return res.status(404).json({ message: 'Product not found' });
//         }

//         // Validate Warehouse (if provided)
//         if (warehouse) {
//             const warehouseExists = await Warehouse.findById(warehouse);
//             if (!warehouseExists) {
//                 return res.status(404).json({ message: 'Warehouse not found' });
//             }
//         }

//         const cityExists = await City.findById(city);
//         if (!cityExists) {
//             return res.status(404).json({ message: 'City not found' });
//         }

//         // Check if batchId is unique
//         if (batchId) {
//             const batchExists = await Inventory.findOne({ batchId });
//             if (batchExists) return res.status(400).json({ message: 'Batch ID must be unique' });
//         }

//         const inventory = new Inventory({ 
//             product, 
//             warehouse: warehouse || null, // Save null if no warehouse provided
//             city, 
//             quantity, 
//             locationWithinWarehouse,
//             batchId,
//             expiryDate,
//             barcode,
//             vat,
//             stockAlertThreshold: stockAlertThreshold || 10,
//             expiryDateThreshold: expiryDateThreshold || 30, 
//             lastRestocked: new Date()
//         });
//         await inventory.save();

//         // Attach inventory reference to the product
//         productExists.inventory.push(inventory._id);
//         await productExists.save();

//         res.status(201).json({ message: 'Inventory added successfully', inventory });
//     } catch (error) {
//         res.status(400).json({ message: error.message });
//     }
// };



const addInventory = async (req, res) => {
    try {
        const { product, productType,warehouse, city, quantity, locationWithinWarehouse, batchId, expiryDate, barcode, vat, stockAlertThreshold, expiryDateThreshold } = req.body;

        // const productExists = await Product.findById(product);
        // if (!productExists) {
        //     return res.status(404).json({ message: 'Product not found' });
        // }

        let productExists;
        if(productType === 'Product') {
            productExists = await Product.findById(product);
        } else {
            productExists = await SpecialProduct.findById(product);
        }

        if (!productExists) {
            return res.status(404).json({ message: 'Product not found' });
        }

        if (warehouse) {
            const warehouseExists = await Warehouse.findById(warehouse);
            if (!warehouseExists) {
                return res.status(404).json({ message: 'Warehouse not found' });
            }
        }
        //   if (warehouse && warehouse.length > 0) {
        //         const warehouses = await Warehouse.find({ _id: { $in: warehouse } });
          
        //         if (warehouses.length !== warehouse.length) {
        //         return res.status(400).json({ message: 'One or more warehouse IDs are invalid' });
        //         }
        //         }

        const cityExists = await City.findById(city);
        if (!cityExists) {
            return res.status(404).json({ message: 'City not found' });
        }

        // Check if inventory exists for same product and city
        const existingInventory = await Inventory.findOne({ 
            product: product,
            city: city 
        });

        let inventory;
        
        if (existingInventory) {
            // Update existing inventory
            existingInventory.quantity += parseInt(quantity);
            existingInventory.warehouse = warehouse || existingInventory.warehouse;
            existingInventory.locationWithinWarehouse = locationWithinWarehouse || existingInventory.locationWithinWarehouse;
            existingInventory.batchId = batchId || existingInventory.batchId;
            existingInventory.expiryDate = expiryDate || existingInventory.expiryDate;
            existingInventory.barcode = barcode || existingInventory.barcode;
            existingInventory.vat = vat || existingInventory.vat;
            existingInventory.stockAlertThreshold = stockAlertThreshold || existingInventory.stockAlertThreshold;
            existingInventory.expiryDateThreshold = expiryDateThreshold || existingInventory.expiryDateThreshold;
            existingInventory.lastRestocked = new Date();
            
            inventory = await existingInventory.save();
            
            res.status(200).json({ message: 'Inventory updated successfully', inventory });
        } else {
            // Create new inventory
            if (batchId) {
                const batchExists = await Inventory.findOne({ batchId });
                if (batchExists) return res.status(400).json({ message: 'Batch ID must be unique' });
            }

            inventory = new Inventory({ 
                product,
                productType,
                warehouse: warehouse || null,
                city, 
                quantity, 
                locationWithinWarehouse,
                batchId,
                expiryDate,
                barcode,
                vat,
                stockAlertThreshold: stockAlertThreshold || 10,
                expiryDateThreshold: expiryDateThreshold || 30, 
                lastRestocked: new Date()
            });
            await inventory.save();

            productExists.inventory.push(inventory._id);
            await productExists.save();

            res.status(201).json({ message: 'Inventory added successfully', inventory });
        }
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// const updateInventory = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const { city, quantity, warehouse, locationWithinWarehouse, batchId, expiryDate, barcode, vat, stockAlertThreshold, expiryDateThreshold } = req.body;

//         if (warehouse) {
//             const warehouseExists = await Warehouse.findById(warehouse);
//             if (!warehouseExists) {
//                 return res.status(404).json({ message: 'Warehouse not found' });
//             }
//         }

//         if (city) {
//             const cityExists = await City.findById(city);
//             if (!cityExists) {
//                 return res.status(404).json({ message: 'City not found' });
//             }
//         }

//         // Ensure batchId is unique if updated
//         if (batchId) {
//             const batchExists = await Inventory.findOne({ batchId, _id: { $ne: id } });
//             if (batchExists) return res.status(400).json({ message: 'Batch ID must be unique' });
//         }

//         const updateData = { 
//             city,
//             quantity, 
//             warehouse, 
//             locationWithinWarehouse,
//             batchId, 
//             expiryDate, 
//             barcode,
//             vat,  
//             stockAlertThreshold, 
//             expiryDateThreshold, // Add to update data
//             lastRestocked: new Date()
//         };
        
//         Object.keys(updateData).forEach((key) => updateData[key] === undefined && delete updateData[key]);

//         const inventory = await Inventory.findByIdAndUpdate(id, updateData, { new: true });
//         if (!inventory) {
//             return res.status(404).json({ message: 'Inventory not found' });
//         }

//         res.status(200).json({ message: 'Inventory updated successfully', inventory });
//     } catch (error) {
//         res.status(400).json({ message: error.message });
//     }
// };

// const getAllInventories = async (req, res) => {
//     try {
//         const inventories = await Inventory.find()
//             .populate('warehouse city')
//             .populate('product', 'name sku');

//         // Separate inventories based on stock threshold
//         const lowStockInventories = inventories.filter(inv => inv.quantity <= inv.stockAlertThreshold);
//         const otherInventories = inventories.filter(inv => inv.quantity > inv.stockAlertThreshold);

//         // Concatenate low-stock inventories first
//         const sortedInventories = [...lowStockInventories, ...otherInventories];

//         res.status(200).json(sortedInventories);
//     } catch (error) {
//         res.status(500).json({ message: 'Failed to fetch inventories', error: error.message });
//     }
// };

const updateInventory = async (req, res) => {
    try {
        const { id } = req.params;
        const { city, quantity, warehouse, locationWithinWarehouse, batchId, expiryDate, barcode, vat, stockAlertThreshold, expiryDateThreshold } = req.body;

        // Find existing inventory first to get productType
        const existingInventory = await Inventory.findById(id);
        if (!existingInventory) {
            return res.status(404).json({ message: 'Inventory not found' });
        }

        if (warehouse) {
            const warehouseExists = await Warehouse.findById(warehouse);
            if (!warehouseExists) {
                return res.status(404).json({ message: 'Warehouse not found' });
            }
        }

        if (city) {
            const cityExists = await City.findById(city);
            if (!cityExists) {
                return res.status(404).json({ message: 'City not found' });
            }
        }

        // Ensure batchId is unique if updated
        if (batchId) {
            const batchExists = await Inventory.findOne({ batchId, _id: { $ne: id } });
            if (batchExists) return res.status(400).json({ message: 'Batch ID must be unique' });
        }

        const updateData = { 
            city,
            quantity, 
            warehouse, 
            locationWithinWarehouse,
            batchId, 
            expiryDate, 
            barcode,
            vat,  
            stockAlertThreshold, 
            expiryDateThreshold,
            lastRestocked: new Date()
        };
        
        Object.keys(updateData).forEach((key) => updateData[key] === undefined && delete updateData[key]);

        const updatedInventory = await Inventory.findByIdAndUpdate(
            id, 
            updateData, 
            { new: true }
        ).populate({
            path: 'product',
            select: 'name sku',
            populate: existingInventory.productType === 'Product' 
                ? { path: 'category', select: 'name' }
                : { path: 'specialCategory', select: 'name' }
        });

        res.status(200).json({ 
            message: 'Inventory updated successfully', 
            inventory: updatedInventory 
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};



// const getAllInventories = async (req, res) => {
//     try {
//         const inventories = await Inventory.find()
//             .populate({
//                 path: 'warehouse city'
//             })
//             .populate({
//                 path: 'product',
//                 populate: [
//                     {
//                         path: 'category',
//                         select: 'name'
//                     }
//                 ],
//                 select: 'name sku'
//             })
//             .populate({
//                 path: 'product',
//                 populate: [
//                     {
//                         path: 'specialCategory',
//                         select: 'name'
//                     }
//                 ],
//                 select: 'name sku type'
//             });

//         // Transform the data to include proper category info based on product type
//         const transformedInventories = inventories.map(inv => {
//             const inventory = inv.toObject();
            
//             if (inventory.productType === 'Product') {
//                 inventory.productInfo = {
//                     name: inventory.product.name,
//                     sku: inventory.product.sku,
//                     category: inventory.product.category?.name
//                 };
//             } else {
//                 inventory.productInfo = {
//                     name: inventory.product.name,
//                     sku: inventory.product.sku,
//                     category: inventory.product.specialCategory?.name,
//                     type: inventory.product.type
//                 };
//             }

//             return inventory;
//         });

//         // Separate and sort inventories based on stock threshold
//         const lowStockInventories = transformedInventories.filter(inv => inv.quantity <= inv.stockAlertThreshold);
//         const otherInventories = transformedInventories.filter(inv => inv.quantity > inv.stockAlertThreshold);

//         const sortedInventories = [...lowStockInventories, ...otherInventories];

//         res.status(200).json(sortedInventories);
//     } catch (error) {
//         res.status(500).json({ message: 'Failed to fetch inventories', error: error.message });
//     }
// };



// const deleteInventory = async (req, res) => {
//     try {
//         const { id } = req.params;

//         // Find the inventory to delete
//         const inventory = await Inventory.findById(id);
//         if (!inventory) {
//             return res.status(404).json({ message: 'Inventory record not found' });
//         }

//         // Delete the inventory record
//         await Inventory.findByIdAndDelete(id);

//         // Remove the reference from the Product
//         const product = await Product.findById(inventory.product);
//         if (product && product.inventory) {
//             product.inventory = product.inventory.filter(invId => invId.toString() !== id);
//             await product.save();
//         }

//         res.status(200).json({ message: 'Inventory record deleted successfully' });
//     } catch (error) {
//         res.status(400).json({ message: error.message });
//     }
// };


const getAllInventories = async (req, res) => {
    try {
        const inventories = await Inventory.find()
            .populate('warehouse')
            .populate('city')
            .populate({
                path: 'product',
                select: 'name sku type'
            });

        const transformedInventories = inventories.map(inv => {
            const inventory = inv.toObject();
            const product = inventory?.product;

            if (!product) {
                inventory.productInfo = {
                    name: "Unknown Product",
                    sku: "N/A",
                    type: "N/A"
                };
                return inventory;
            }

            if (inventory.productType === 'Product') {
                inventory.productInfo = {
                    name: product?.name,
                    sku: product?.sku
                };
            } else {
                inventory.productInfo = {
                    name: product?.name,
                    sku: product?.sku,
                    type: product?.type
                };
            }

            return inventory;
        });

        const lowStock = transformedInventories.filter(inv => inv.quantity <= inv.stockAlertThreshold);
        const other = transformedInventories.filter(inv => inv.quantity > inv.stockAlertThreshold);

        const sortedInventories = [...lowStock, ...other];

        res.status(200).json(sortedInventories);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch inventories', error: error.message });
    }
};


// New endpoint: return only available inventories (quantity > 0) but with
// full product details (image, prices, brand, categories) so frontend can
// show product cards (price/image) without additional product lookups.
const getAvailableInventoriesDetailed = async (req, res) => {
    try {
        const { city, warehouse } = req.query;

        // Base query: only available inventories
        const query = { quantity: { $gt: 0 } };
        if (city) query.city = city;
        if (warehouse) query.warehouse = warehouse;

        const inventories = await Inventory.find(query)
            .populate('warehouse city')
            .populate({
                path: 'product',
                strictPopulate: false, // ignore missing paths for populate
                populate: [
                    // Only populate fields if exist in schema
                    { path: 'category', select: 'name', strictPopulate: false },
                    { path: 'subcategory', select: 'name', strictPopulate: false },
                    { path: 'subsubcategory', select: 'name', strictPopulate: false },
                    { path: 'brand', select: 'name', strictPopulate: false },
                    { path: 'prices.city', model: 'City', strictPopulate: false },
                    {
                        path: 'variants',
                        populate: {
                            path: 'variantName',
                            populate: { path: 'parentVariant', model: 'VariantName', strictPopulate: false },
                            strictPopulate: false
                        },
                        strictPopulate: false
                    },
                    { path: 'discounts.discountId', strictPopulate: false },
                    { path: 'dealOfTheDay', strictPopulate: false },
                    { path: 'specialCategory', select: 'name', strictPopulate: false },
                    { path: 'specialSubcategory', select: 'name', strictPopulate: false }
                ],
                select: 'name sku image gallery metal_color prices variationId tags brand type specialCategory specialSubcategory variants discounts dealOfTheDay'
            });

        // Transform inventories for frontend
        const transformed = inventories.map(inv => {
            const inventory = inv.toObject();

            if (inventory.product) {
                const product = inventory.product;
                const prices = Array.isArray(product.prices) ? product.prices : [];

                let chosenPrice = null;
                if (city && prices.length) {
                    chosenPrice = prices.find(p => p.city && String(p.city._id) === String(city)) || prices[0];
                } else if (prices.length) {
                    chosenPrice = prices[0];
                }

                inventory.productInfo = {
                    _id: product._id,
                    name: product.name,
                    sku: product.sku,
                    image: product.image || null,
                    gallery: product.gallery || [],
                    prices: prices,
                    price: chosenPrice,
                    variants: product.variants || [],
                    metal_color: product.metal_color || [],
                    discounts: product.discounts || [],
                    dealOfTheDay: product.dealOfTheDay || [],
                    brand: product.brand || null,
                    type: product.type || null,
                    specialCategory: product.specialCategory || null,
                    specialSubcategory: product.specialSubcategory || null
                };
            } else {
                inventory.productInfo = { name: '', sku: '' };
            }

            inventory.isOutOfStock = inventory.quantity <= 0;

            inventory.inventorySummary = {
                city: inventory.city ? inventory.city._id || inventory.city : null,
                quantity: inventory.quantity,
                vat: inventory.vat,
                expiryDate: inventory.expiryDate,
                warehouses: Array.isArray(inventory.warehouse)
                    ? inventory.warehouse.map(w => ({ _id: w._id, name: w.name, isMain: !!w.isMain }))
                    : []
            };

            return inventory;
        });

        // Low-stock sorting
        const lowStock = transformed.filter(inv => inv.quantity <= inv.stockAlertThreshold);
        const others = transformed.filter(inv => inv.quantity > inv.stockAlertThreshold);
        const sorted = [...lowStock, ...others];

        res.status(200).json(sorted);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch available inventories', error: error.message });
    }
};



const deleteInventory = async (req, res) => {
    try {
        const { id } = req.params;

        // Find the inventory to delete
        const inventory = await Inventory.findById(id);
        if (!inventory) {
            return res.status(404).json({ message: 'Inventory record not found' });
        }

        // Delete the inventory record
        await Inventory.findByIdAndDelete(id);

        // Remove the reference based on product type
        if (inventory.productType === 'Product') {
            const product = await Product.findById(inventory.product);
            if (product && product.inventory) {
                product.inventory = product.inventory.filter(invId => invId.toString() !== id);
                await product.save();
            }
        } else {
            const specialProduct = await SpecialProduct.findById(inventory.product);
            if (specialProduct && specialProduct.inventory) {
                specialProduct.inventory = specialProduct.inventory.filter(invId => invId.toString() !== id);
                await specialProduct.save();
            }
        }

        res.status(200).json({ message: 'Inventory record deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};



// const deleteInventories = async (req, res) => {
//     try {
//         const { ids } = req.body; // Expect an array of inventory IDs in the request body

//         if (!Array.isArray(ids) || ids.length === 0) {
//             return res.status(400).json({ message: 'Invalid input: Please provide an array of inventory IDs' });
//         }

//         // Find all inventories to delete
//         const inventories = await Inventory.find({ _id: { $in: ids } });

//         if (inventories.length === 0) {
//             return res.status(404).json({ message: 'No inventory records found' });
//         }

//         // Delete all matching inventory records
//         await Inventory.deleteMany({ _id: { $in: ids } });

//         // Update associated products
//         const productUpdates = inventories.map(async (inventory) => {
//             const product = await Product.findById(inventory.product);
//             if (product && product.inventory) {
//                 product.inventory = product.inventory.filter(
//                     invId => !ids.includes(invId.toString())
//                 );
//                 await product.save();
//             }
//         });

//         await Promise.all(productUpdates); // Wait for all product updates to complete

//         res.status(200).json({ message: 'Inventory records deleted successfully' });
//     } catch (error) {
//         res.status(400).json({ message: error.message });
//     }
// };


const deleteInventories = async (req, res) => {
    try {
        const { ids } = req.body;

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: 'Invalid input: Please provide an array of inventory IDs' });
        }

        // Find all inventories to delete
        const inventories = await Inventory.find({ _id: { $in: ids } });

        if (inventories.length === 0) {
            return res.status(404).json({ message: 'No inventory records found' });
        }

        // Delete all matching inventory records
        await Inventory.deleteMany({ _id: { $in: ids } });

        // Group inventories by product type
        const productInventories = inventories.filter(inv => inv.productType === 'Product');
        const specialProductInventories = inventories.filter(inv => inv.productType === 'SpecialProduct');

        // Update associated products
        const productUpdates = productInventories.map(async (inventory) => {
            const product = await Product.findById(inventory.product);
            if (product && product.inventory) {
                product.inventory = product.inventory.filter(
                    invId => !ids.includes(invId.toString())
                );
                await product.save();
            }
        });

        // Update associated special products
        const specialProductUpdates = specialProductInventories.map(async (inventory) => {
            const specialProduct = await SpecialProduct.findById(inventory.product);
            if (specialProduct && specialProduct.inventory) {
                specialProduct.inventory = specialProduct.inventory.filter(
                    invId => !ids.includes(invId.toString())
                );
                await specialProduct.save();
            }
        });

        // Wait for all updates to complete
        await Promise.all([...productUpdates, ...specialProductUpdates]);

        res.status(200).json({ message: 'Inventory records deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


const createSampleInventoryCsvTemplate = (req, res) => {
    // Define headers
    const headers = [
        'sku',      // Product SKU (required)
        'quantity', // Quantity (required)
        'city',     // City name (required)
        'vat',      // VAT (optional)
    ];

    // Sample row data for guidance
    const sampleData = [
        'SKU12345',    // sku
        '100',         // quantity
        'Sample City', // city
        '5',           // vat (optional)
    ];

    // Create CSV content
    const csvContent = headers.join(',') + '\n' + sampleData.join(',');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=sample_inventory_template.csv');
    res.send(csvContent);
};


// const bulkUploadInventory = async (req, res) => {
//     if (!req.file) {
//         return res.status(400).json({ message: 'No CSV file uploaded' });
//     }

//     let successCount = 0;
//     let skippedCount = 0;

//     const capitalizeAndTrim = (str) => str.charAt(0).toUpperCase() + str.slice(1).trim();

//     const processRow = async (data) => {
//         const { sku, quantity, city, vat } = data;
//         if (!sku || !quantity || !city) {
//             skippedCount++;
//             return;
//         }

//         try {
//             const product = await Product.findOne({ sku: sku.trim() });
//             if (!product) {
//                 console.log(`Product not found for SKU: ${sku.trim()}`);
//                 skippedCount++;
//                 return;
//             }

//             const cityName = capitalizeAndTrim(city);
//             const cityDoc = await City.findOne({ name: cityName });
//             if (!cityDoc) {
//                 console.log(`City not found: ${cityName}`);
//                 skippedCount++;
//                 return;
//             }

//             const existingInventory = await Inventory.findOne({
//                 product: product._id,
//                 city: cityDoc._id
//             });

//             if (existingInventory) {
//                 existingInventory.quantity += parseInt(quantity, 10);
//                 if (vat) existingInventory.vat = parseFloat(vat);
//                 await existingInventory.save();
//             } else {
//                 const inventoryData = {
//                     product: product._id,
//                     city: cityDoc._id,
//                     quantity: parseInt(quantity, 10),
//                     vat: vat ? parseFloat(vat) : undefined
//                 };

//                 const inventory = new Inventory(inventoryData);
//                 await inventory.save();

//                 await Product.findByIdAndUpdate(product._id, {
//                     $push: { inventory: inventory._id }
//                 });
//             }

//             successCount++;
//         } catch (error) {
//             console.error('Error processing row:', error);
//             skippedCount++;
//         }
//     };

//     try {
//         const stream = fsSync.createReadStream(req.file.path).pipe(csv());
//         for await (const data of stream) {
//             await processRow(data);
//         }
//     } catch (error) {
//         return res.status(500).json({ message: 'Error processing CSV file', error: error.message });
//     } finally {
//         await deleteFile(req.file.path);
//     }

//     res.status(200).json({
//         message: `Bulk upload completed. ${successCount} inventories created/updated successfully. ${skippedCount} rows skipped.`
//     });
// };


// const bulkUploadInventory = async (req, res) => {
//     if (!req.file) {
//         return res.status(400).json({ message: 'No CSV file uploaded' });
//     }

//     let successCount = 0;
//     let skippedCount = 0;

//     const capitalizeAndTrim = (str) => str.charAt(0).toUpperCase() + str.slice(1).trim();

//     const processRow = async (data) => {
//         const { sku, quantity, city, vat, productType = 'Product' } = data;
//         if (!sku || !quantity || !city) {
//             skippedCount++;
//             return;
//         }

//         try {
//             let product;
//             if (productType === 'Product') {
//                 product = await Product.findOne({ sku: sku.trim() });
//             } else {
//                 product = await SpecialProduct.findOne({ sku: sku.trim() });
//             }

//             if (!product) {
//                 console.log(`Product not found for SKU: ${sku.trim()} with type: ${productType}`);
//                 skippedCount++;
//                 return;
//             }

//             const cityName = capitalizeAndTrim(city);
//             const cityDoc = await City.findOne({ name: cityName });
//             if (!cityDoc) {
//                 console.log(`City not found: ${cityName}`);
//                 skippedCount++;
//                 return;
//             }

//             const existingInventory = await Inventory.findOne({
//                 product: product._id,
//                 productType,
//                 city: cityDoc._id
//             });

//             if (existingInventory) {
//                 existingInventory.quantity += parseInt(quantity, 10);
//                 if (vat) existingInventory.vat = parseFloat(vat);
//                 await existingInventory.save();
//             } else {
//                 const inventoryData = {
//                     product: product._id,
//                     productType,
//                     city: cityDoc._id,
//                     quantity: parseInt(quantity, 10),
//                     vat: vat ? parseFloat(vat) : undefined
//                 };

//                 const inventory = new Inventory(inventoryData);
//                 await inventory.save();

//                 product.inventory.push(inventory._id);
//                 await product.save();
//             }

//             successCount++;
//         } catch (error) {
//             console.error('Error processing row:', error);
//             skippedCount++;
//         }
//     };

//     try {
//         const stream = fsSync.createReadStream(req.file.path).pipe(csv());
//         for await (const data of stream) {
//             await processRow(data);
//         }
//     } catch (error) {
//         return res.status(500).json({ message: 'Error processing CSV file', error: error.message });
//     } finally {
//         await deleteFile(req.file.path);
//     }

//     res.status(200).json({
//         message: `Bulk upload completed. ${successCount} inventories created/updated successfully. ${skippedCount} rows skipped.`
//     });
// };


// const bulkUploadInventory = async (req, res) => {
//     if (!req.file) {
//         return res.status(400).json({ message: 'No CSV file uploaded' });
//     }

//     let successCount = 0;
//     let skippedCount = 0;

//     const capitalizeAndTrim = (str) => str.charAt(0).toUpperCase() + str.slice(1).trim();

//     const processRow = async (data) => {
//         const { productName, productType, warehouseName, quantity, city, vat,stockAlertThreshold, locationWithinWarehouse, lastRestocked,
//             batchId, expiryDate, barcode, expiryDateThreshold } = data;
//         if (!productName || !productType || !warehouseName || !quantity || !city) {
//             skippedCount++;
//             return;
//         }

//         try {
//             let product;
//             if (productType === 'Product') {
//                 product = await Product.findOne({ name: productName.trim() });
//             } else {
//                 product = await SpecialProduct.findOne({ name: productName.trim() });
//             }

//             if (!product) {
//                 console.log(`Product not found: ${productName.trim()} with type: ${productType}`);
//                 skippedCount++;
//                 return;
//             }

//             const cityName = capitalizeAndTrim(city);
//             const cityDoc = await City.findOne({ name: cityName });
//             if (!cityDoc) {
//                 console.log(`City not found: ${cityName}`);
//                 skippedCount++;
//                 return;
//             }

//             const warehouseDoc = await Warehouse.findOne({ name: warehouseName.trim() });
//             if (!warehouseDoc) {
//                 console.log(`Warehouse not found: ${warehouseName.trim()}`);
//                 skippedCount++;
//                 return;
//             }

//             const inventoryData = {
//                 product: product._id,
//                 productType,
//                 warehouse: warehouseDoc._id,
//                 city: cityDoc._id,
//                 quantity: parseInt(quantity, 10),
//                 vat: vat ? parseFloat(vat) : undefined,
//                 stockAlertThreshold: stockAlertThreshold ? parseInt(stockAlertThreshold, 10) : undefined,
//                 locationWithinWarehouse,
//                 lastRestocked: lastRestocked ? new Date(lastRestocked) : undefined,
//                 batchId,
//                 expiryDate: expiryDate ? new Date(expiryDate) : undefined,
//                 barcode,
//                 expiryDateThreshold: expiryDateThreshold ? parseInt(expiryDateThreshold, 10) : undefined
//             };


//             const existingInventory = await Inventory.findOne({
//                 product: product._id,
//                 productType,
//                 city: cityDoc._id,
//                 warehouse: warehouseDoc._id
//             });

//             if (existingInventory) {
//                 existingInventory.quantity += parseInt(quantity, 10);
//                 if (vat) existingInventory.vat = parseFloat(vat);
//                 // Update other fields as needed
//                 await existingInventory.save();
//             } else {
//                 const inventory = new Inventory(inventoryData);
//                 await inventory.save();

//                 product.inventory.push(inventory._id);
//                 await product.save();
//             }

//             successCount++;

//         } catch (error) {
//             console.error('Error processing row:', error);
//             skippedCount++;
//         }
//     }
    

    

//     try {
//         const stream = fsSync.createReadStream(req.file.path).pipe(csv());
//         for await (const data of stream) {
//             await processRow(data);
//         }
//     } catch (error) {
//         return res.status(500).json({ message: 'Error processing CSV file', error: error.message });
//     } finally {
//         await deleteFile(req.file.path);
//     }

//     res.status(200).json({
//         message: `Bulk upload completed. ${successCount} inventories created/updated successfully. ${skippedCount} rows skipped.`
//     });
// };



// const bulkUploadInventory = async (req, res) => {
//     if (!req.file) {
//         return res.status(400).json({ message: 'No CSV file uploaded' });
//     }

//     let successCount = 0;
//     let skippedCount = 0;

//     const capitalizeAndTrim = (str) => str.charAt(0).toUpperCase() + str.slice(1).trim();

//     const processRow = async (data) => {
//         const { 
//             productName, 
//             productType, 
//             sku, 
//             warehouseName, 
//             quantity, 
//             city,
//             vat,
//             stockAlertThreshold, 
//             locationWithinWarehouse, 
//             lastRestocked,
//             batchId, 
//             expiryDate, 
//             barcode, 
//             expiryDateThreshold 
//         } = data;

//         console.log('data', data);

//         if (!sku || !productType || !warehouseName || !quantity || !city) {
//             skippedCount++;
//             return;
//         }

//         try {
//             // Find product by SKU
//             let product;
//             if (productType === 'Product') {
//                 product = await Product.findOne({ sku: sku.trim() });
                
//                 // Create new product if SKU doesn't exist
//                 if (!product) {
//                     product = new Product({
//                         name: productName.trim(),
//                         sku: sku.trim(),
//                         productType: 'Product'
//                     });
//                     await product.save();
//                 } else if (product.name !== productName.trim()) {
//                     // Update product name if changed
//                     product.name = productName.trim();
//                     await product.save();
//                 }
//             } else {
//                 product = await SpecialProduct.findOne({ sku: sku.trim() });
                
//                 // Create new special product if SKU doesn't exist
//                 if (!product) {
//                     product = new SpecialProduct({
//                         name: productName.trim(),
//                         sku: sku.trim(),
//                         type: 'inventory'  // Default type for special products
//                     });
//                     await product.save();
//                 } else if (product.name !== productName.trim()) {
//                     // Update special product name if changed
//                     product.name = productName.trim();
//                     await product.save();
//                 }
//             }

//             const cityName = capitalizeAndTrim(city) || 'Norway';
//             const cityDoc = await City.findOne({ name: cityName });
//             if (!cityDoc) {
//                 console.log(`City not found: ${cityName}`);
//                 skippedCount++;
//                 return;
//             }

//             const warehouseDoc = await Warehouse.findOne({ name: warehouseName.trim() });
//             if (!warehouseDoc) {
//                 console.log(`Warehouse not found: ${warehouseName.trim()}`);
//                 skippedCount++;
//                 return;
//             }

//             // Find existing inventory
//             const existingInventory = await Inventory.findOne({
//                 product: product._id,
//                 productType,
//                 warehouse: warehouseDoc._id,
//                 city: cityDoc._id
//             });

//             const inventoryData = {
//                 product: product._id,
//                 productType,
//                 warehouse: warehouseDoc._id,
//                 city: '67400e8a7b963a1282d218b5',
//                 quantity: parseInt(quantity, 10),
//                 vat: vat ? parseFloat(vat) : undefined,
//                 stockAlertThreshold: stockAlertThreshold ? parseInt(stockAlertThreshold, 10) : undefined,
//                 locationWithinWarehouse,
//                 lastRestocked: lastRestocked ? new Date(lastRestocked) : undefined,
//                 batchId,
//                 expiryDate: expiryDate ? new Date(expiryDate) : undefined,
//                 barcode,
//                 expiryDateThreshold: expiryDateThreshold ? parseInt(expiryDateThreshold, 10) : undefined
//             };

//             if (existingInventory) {
//                 // Update existing inventory
//                 Object.assign(existingInventory, inventoryData);
//                 await existingInventory.save();
//             } else {
//                 // Create new inventory
//                 const inventory = new Inventory(inventoryData);
//                 await inventory.save();

//                 // Add inventory reference to product
//                 if (!product.inventory.includes(inventory._id)) {
//                     product.inventory.push(inventory._id);
//                     await product.save();
//                 }
//             }

//             successCount++;

//         } catch (error) {
//             console.error('Error processing row:', error);
//             skippedCount++;
//         }
//     };

//     try {
//         const stream = fsSync.createReadStream(req.file.path).pipe(csv());
//         for await (const data of stream) {
//             await processRow(data);
//         }
//     } catch (error) {
//         return res.status(500).json({ message: 'Error processing CSV file', error: error.message });
//     } finally {
//         await deleteFile(req.file.path);
//     }

//     res.status(200).json({
//         message: `Bulk upload completed. ${successCount} inventories created/updated successfully. ${skippedCount} rows skipped.`
//     });
// };



// const bulkUploadInventory = async (req, res) => {
//     if (!req.file) {
//         return res.status(400).json({ message: 'No CSV file uploaded' });
//     }

//     let successCount = 0;
//     let skippedCount = 0;

//     const processRow = async (data) => {
//         const { 
//             productName, 
//             productType, 
//             sku, 
//             warehouseName, 
//             quantity
//         } = data;

//         try {
//             // Find warehouse
//             const warehouseDoc = await Warehouse.findOne({ 
//                 name: { $regex: new RegExp(`^${warehouseName.trim()}$`, 'i') }
//             });

//             if (!warehouseDoc) {
//                 console.log(`Warehouse not found: ${warehouseName}`);
//                 skippedCount++;
//                 return;
//             }

//             // Find product
//             let product;
//             const normalizedSku = sku.toString().trim();
            
//             if (productType === 'SpecialProduct') {
//                 product = await SpecialProduct.findOne({ sku: normalizedSku });
//             } else {
//                 product = await Product.findOne({ sku: normalizedSku });
//             }

//             // Find existing inventory for this product and warehouse
//             const existingInventory = await Inventory.findOne({
//                 product: product?._id,
//                 productType: productType || 'Product',
//                 warehouse: warehouseDoc._id,
//                 city: '67400e8a7b963a1282d218b5'
//             });

//             const inventoryData = {
//                 product: product._id,
//                 productType: productType || 'Product',
//                 warehouse: warehouseDoc._id,
//                 city: '67400e8a7b963a1282d218b5',
//                 quantity: parseInt(quantity, 10),
//                 vat: data.vat ? parseFloat(data.vat) : 0,
//                 stockAlertThreshold: data.stockAlertThreshold ? parseInt(data.stockAlertThreshold, 10) : 10,
//                 locationWithinWarehouse: data.locationWithinWarehouse || '',
//                 lastRestocked: data.lastRestocked ? new Date(data.lastRestocked) : new Date(),
//                 batchId: data.batchId || '',
//                 expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
//                 barcode: data.barcode || '',
//                 expiryDateThreshold: data.expiryDateThreshold ? parseInt(data.expiryDateThreshold, 10) : 30
//             };

//             // If inventory exists in same warehouse, update it
//             if (existingInventory) {
//                 Object.assign(existingInventory, inventoryData);
//                 await existingInventory.save();
//             } else {
//                 // Create new inventory for new warehouse or new product
//                 const newInventory = new Inventory(inventoryData);
//                 await newInventory.save();

//                 // Add new inventory to product's inventory array
//                 if (product && !product.inventory.includes(newInventory._id)) {
//                     product.inventory.push(newInventory._id);
//                     await product.save();
//                 }
//             }

//             successCount++;

//         } catch (error) {
//             console.log('Row processing error:', error);
//             skippedCount++;
//         }
//     };

//     try {
//         const stream = fsSync.createReadStream(req.file.path).pipe(csv());
//         for await (const data of stream) {
//             await processRow(data);
//         }
//     } catch (error) {
//         return res.status(500).json({ message: 'Error processing CSV file', error: error.message });
//     } finally {
//         await deleteFile(req.file.path);
//     }

//     res.status(200).json({
//         message: `Bulk upload completed. ${successCount} inventories created/updated successfully. ${skippedCount} rows skipped.`
//     });
// };



const bulkUploadInventory = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No CSV file uploaded' });
    }

    let updatedCount = 0;
    let newCount = 0;
    let skippedCount = 0;
    let mergedCount = 0;

    const inventoryMap = new Map();

    const processRow = async (data) => {
        const { 
            productName, 
            productType, 
            sku, 
            warehouseName, 
            quantity,
            vat,
            stockAlertThreshold,
            locationWithinWarehouse,
            lastRestocked,
            batchId,
            expiryDate,
            barcode,
            expiryDateThreshold
        } = data;

        try {
            const warehouse = await Warehouse.findOne({ name: { $regex: new RegExp(`^${warehouseName.trim()}`, 'i') } });
            if (!warehouse) {
                skippedCount++;
                return;
            }

            let product;
    
            const normalizedSku = sku.toString().includes('E+') ? 
            sku.toString().replace('.', '').replace('E+', '').padEnd(13, '0') : 
            sku.toString().trim();
            if (productType === 'SpecialProduct') {
                product = await SpecialProduct.findOne({ sku: normalizedSku });
            } else {
                product = await Product.findOne({ sku: normalizedSku });
            }

            if (!product) {
      
                skippedCount++;
                return;
            }
            const parsedQuantity = quantity ? parseInt(quantity, 10) : 0;
            if (isNaN(parsedQuantity)) {
            skippedCount++;
            return; 
            }
            const key = `${product._id}-${warehouse._id}-${normalizedSku}`;
            const inventoryData = {
                product: product._id,
                productType,
                warehouse: warehouse._id,
                city: '67400e8a7b963a1282d218b5',
                quantity: parsedQuantity,
                vat: vat ? parseFloat(vat) : 0,
                stockAlertThreshold: stockAlertThreshold ? parseInt(stockAlertThreshold, 10) : 10,
                locationWithinWarehouse: locationWithinWarehouse || '',
                lastRestocked: new Date(),
                batchId: batchId || '',
                expiryDate: expiryDate ? new Date(expiryDate) : null,
                barcode: barcode || '',
                expiryDateThreshold: expiryDateThreshold ? parseInt(expiryDateThreshold, 10) : 30
            };

  

            if (inventoryMap.has(key)) {
            const existingData = inventoryMap.get(key);
            existingData.quantity += inventoryData.quantity;
            inventoryMap.set(key, existingData);
            mergedCount++;
            } else {

            inventoryMap.set(key, inventoryData);
        }
        } catch (error) {
           
            skippedCount++;
        }
    };

    try {
        const stream = fsSync.createReadStream(req.file.path).pipe(csv());
        for await (const data of stream) {
            await processRow(data);
        }

        // Process the merged data
        for (const [key, inventoryData] of inventoryMap) {
            const existingInventory = await Inventory.findOne({
                product: inventoryData.product,
                productType: inventoryData.productType,
                warehouse: inventoryData.warehouse,
                city: inventoryData.city
            });

            if (existingInventory) {
             
                const updated = await Inventory.findOneAndUpdate(
                    {
                        product: inventoryData.product,
                        productType: inventoryData.productType,
                        warehouse: inventoryData.warehouse,
                        city: inventoryData.city
                    },
                    {
                        $set: {
                            quantity: parseInt(inventoryData.quantity),
                            stockAlertThreshold: parseInt(inventoryData.stockAlertThreshold),
                            expiryDateThreshold: parseInt(inventoryData.expiryDateThreshold),
                            vat: parseFloat(inventoryData.vat),
                            locationWithinWarehouse: inventoryData.locationWithinWarehouse,
                            lastRestocked: inventoryData.lastRestocked,
                            batchId: inventoryData.batchId,
                            expiryDate: inventoryData.expiryDate,
                            barcode: inventoryData.barcode
                        }
                    },
                    { new: true, runValidators: true }
                );
                
               
                updatedCount++;
            } else {
                const newInventory = new Inventory(inventoryData);
                await newInventory.save();
                const product = await (inventoryData.productType === 'SpecialProduct' ? SpecialProduct : Product).findById(inventoryData.product);
                if (product && !product.inventory.includes(newInventory._id)) {
                    product.inventory.push(newInventory._id);
                    await product.save();
                }
                newCount++;
            }
        }


       
        const uniqueKeys = Array.from(inventoryMap.keys());
        for (const key of uniqueKeys) {
            const [productId, warehouseId, sku] = key.split('-');
            
            const duplicateInventories = await Inventory.find({
                product: productId,
                warehouse: warehouseId
            }).sort({ updatedAt: -1 });

            if (duplicateInventories.length > 1) {
                const [latestInventory, ...oldInventories] = duplicateInventories;
                const oldInventoryIds = oldInventories.map(inv => inv._id);
                
                await Inventory.deleteMany({ _id: { $in: oldInventoryIds } });
                
               
                await Product.updateOne(
                    { _id: productId },
                    { $pull: { inventory: { $in: oldInventoryIds } } }
                );
                
                await SpecialProduct.updateOne(
                    { _id: productId },
                    { $pull: { inventory: { $in: oldInventoryIds } } }
                );

                console.log(`Merged ${oldInventories.length} duplicate entries for product ${sku} in warehouse ${warehouseId}`);
            }
        }

        const currentInventoryKeys = Array.from(inventoryMap.keys()).map(key => {
            const [productId, warehouseId] = key.split('-');
            return `${productId}-${warehouseId}`;
        });

        // Find inventories not present in current CSV
        const obsoleteInventories = await Inventory.find({});
        const obsoleteOnes = obsoleteInventories.filter(inv => {
            const invKey = `${inv.product}-${inv.warehouse}`;
            return !currentInventoryKeys.includes(invKey);
        });

    

    } catch (error) {
        return res.status(500).json({ message: 'Error processing CSV file', error: error.message });
    } finally {
        await deleteFile(req.file.path);
    }

    res.status(200).json({
        message: `Bulk upload completed. ${newCount} new inventories created, ${updatedCount} inventories updated, ${mergedCount} inventories merged, ${skippedCount} rows skipped.`
    });
};


// old bulk uploader controller commit by naveed

// const bulkUploadInventory = async (req, res) => {
//     if (!req.file) {
//         return res.status(400).json({ message: 'No CSV file uploaded' });
//     }

//     let updatedCount = 0;
//     let newCount = 0;
//     let skippedCount = 0;
//     let mergedCount = 0;

//     const inventoryMap = new Map();

//     const processRow = async (data) => {
//         const { 
//             productName, 
//             productType, 
//             sku, 
//             warehouseName, 
//             quantity,
//             vat,
//             stockAlertThreshold,
//             locationWithinWarehouse,
//             lastRestocked,
//             batchId,
//             expiryDate,
//             barcode,
//             expiryDateThreshold
//         } = data;

//         try {
//             const warehouse = await Warehouse.findOne({ name: { $regex: new RegExp(`^${warehouseName.trim()}`, 'i') } });
//             if (!warehouse) {
//                 // console.log(`Warehouse not found: ${warehouseName}`);
//                 skippedCount++;
//                 return;
//             }

//             let product;
//             // const normalizedSku = sku.toString().trim();
//             // const normalizedSku = sku.toString().replace('E+', 'E');
//             const normalizedSku = sku.toString().includes('E+') ? 
//             sku.toString().replace('.', '').replace('E+', '').padEnd(13, '0') : 
//             sku.toString().trim();
//             // console.log('Original SKU:', sku);
//             // console.log('Normalized SKU:', normalizedSku);
//             if (productType === 'SpecialProduct') {
//                 product = await SpecialProduct.findOne({ sku: normalizedSku });
//             } else {
//                 product = await Product.findOne({ sku: normalizedSku });
//             }

//             if (!product) {
//                 // console.log(`Product not found: ${normalizedSku}`);
//                 skippedCount++;
//                 return;
//             }

//             const key = `${product._id}-${warehouse._id}-${normalizedSku}`;
//             const inventoryData = {
//                 product: product._id,
//                 productType,
//                 warehouse: warehouse._id,
//                 city: '67400e8a7b963a1282d218b5',
//                 quantity: parseInt(quantity, 10),
//                 vat: vat ? parseFloat(vat) : 0,
//                 stockAlertThreshold: stockAlertThreshold ? parseInt(stockAlertThreshold, 10) : 10,
//                 locationWithinWarehouse: locationWithinWarehouse || '',
//                 lastRestocked: new Date(),
//                 batchId: batchId || '',
//                 expiryDate: expiryDate ? new Date(expiryDate) : null,
//                 barcode: barcode || '',
//                 expiryDateThreshold: expiryDateThreshold ? parseInt(expiryDateThreshold, 10) : 30
//             };

//             // if (inventoryMap.has(key)) {
//             //     const existingData = inventoryMap.get(key);
//             //     existingData.quantity += parseInt(quantity, 10);
//             //     inventoryMap.set(key, existingData);
//             //     mergedCount++;
//             // } else {
//             //     inventoryMap.set(key, inventoryData);
//             // }

//             if (inventoryMap.has(key)) {
//     const existingData = inventoryMap.get(key);
//     // existingData.quantity += parseInt(quantity, 10);
//     existingData.quantity += inventoryData.quantity;
//     inventoryMap.set(key, existingData);
//     mergedCount++;
// } else {
//     // Check if inventory already exists in database
//     // const existingInventory = await Inventory.findOne({
//     //     product: product._id,
//     //     warehouse: warehouse._id,
//     //     productType: productType
//     // });

//     // if (existingInventory) {
//     //     // Update existing inventory
//     //     inventoryData.quantity = existingInventory.quantity + parseInt(quantity, 10);
//     // }
    
//     inventoryMap.set(key, inventoryData);
// }
//         } catch (error) {
//             // console.log('Row processing error:', error);
//             skippedCount++;
//         }
//     };

//     try {
//         const stream = fsSync.createReadStream(req.file.path).pipe(csv());
//         for await (const data of stream) {
//             await processRow(data);
//         }

//         // Process the merged data
//         for (const [key, inventoryData] of inventoryMap) {
//             const existingInventory = await Inventory.findOne({
//                 product: inventoryData.product,
//                 productType: inventoryData.productType,
//                 warehouse: inventoryData.warehouse,
//                 city: inventoryData.city
//             });

//             if (existingInventory) {
//                 // console.log('Updating existing inventory:', existingInventory);
//                 // Object.assign(existingInventory, inventoryData);
//                 // await existingInventory.save();
//                 // updatedCount++;

//                 // console.log('Before Update:', existingInventory.quantity);
//                 // console.log('New Quantity:', inventoryData.quantity);
                
//                 const updated = await Inventory.findOneAndUpdate(
//                     {
//                         product: inventoryData.product,
//                         productType: inventoryData.productType,
//                         warehouse: inventoryData.warehouse,
//                         city: inventoryData.city
//                     },
//                     {
//                         $set: {
//                             quantity: parseInt(inventoryData.quantity),
//                             stockAlertThreshold: parseInt(inventoryData.stockAlertThreshold),
//                             expiryDateThreshold: parseInt(inventoryData.expiryDateThreshold),
//                             vat: parseFloat(inventoryData.vat),
//                             locationWithinWarehouse: inventoryData.locationWithinWarehouse,
//                             lastRestocked: inventoryData.lastRestocked,
//                             batchId: inventoryData.batchId,
//                             expiryDate: inventoryData.expiryDate,
//                             barcode: inventoryData.barcode
//                         }
//                     },
//                     { new: true, runValidators: true }
//                 );
                
//                 // console.log('After Update:', updated.quantity);
//                 updatedCount++;
//             } else {
//                 const newInventory = new Inventory(inventoryData);
//                 await newInventory.save();
//                 const product = await (inventoryData.productType === 'SpecialProduct' ? SpecialProduct : Product).findById(inventoryData.product);
//                 if (product && !product.inventory.includes(newInventory._id)) {
//                     product.inventory.push(newInventory._id);
//                     await product.save();
//                 }
//                 newCount++;
//             }
//         }

// //         const uniqueKeys = Array.from(inventoryMap.keys());
// // for (const key of uniqueKeys) {
// //     const [productId, warehouseId, sku] = key.split('-');
    
// //     const duplicateInventories = await Inventory.find({
// //         product: productId,
// //         warehouse: warehouseId
// //     }).sort({ updatedAt: -1 });

// //     if (duplicateInventories.length > 1) {
// //         const [latestInventory, ...oldInventories] = duplicateInventories;
// //         const oldInventoryIds = oldInventories.map(inv => inv._id);
        
// //         await Inventory.deleteMany({ _id: { $in: oldInventoryIds } });
        
// //         // Remove old inventory IDs from the product's inventory array
// //         await Product.updateOne(
// //             { _id: productId },
// //             { $pull: { inventory: { $in: oldInventoryIds } } }
// //         );
        
// //         await SpecialProduct.updateOne(
// //             { _id: productId },
// //             { $pull: { inventory: { $in: oldInventoryIds } } }
// //         );

// //         console.log(`Removed ${oldInventories.length} duplicate entries for product ${sku} in warehouse ${warehouseId}`);
// //     }
// // }

//         // After all inventory updates are done, add this code
//         const uniqueKeys = Array.from(inventoryMap.keys());
//         for (const key of uniqueKeys) {
//             const [productId, warehouseId, sku] = key.split('-');
            
//             const duplicateInventories = await Inventory.find({
//                 product: productId,
//                 warehouse: warehouseId
//             }).sort({ updatedAt: -1 });

//             if (duplicateInventories.length > 1) {
//                 const [latestInventory, ...oldInventories] = duplicateInventories;
//                 const oldInventoryIds = oldInventories.map(inv => inv._id);
                
//                 await Inventory.deleteMany({ _id: { $in: oldInventoryIds } });
                
//                 // Remove old inventory IDs from both Product and SpecialProduct models
//                 await Product.updateOne(
//                     { _id: productId },
//                     { $pull: { inventory: { $in: oldInventoryIds } } }
//                 );
                
//                 await SpecialProduct.updateOne(
//                     { _id: productId },
//                     { $pull: { inventory: { $in: oldInventoryIds } } }
//                 );

//                 console.log(`Merged ${oldInventories.length} duplicate entries for product ${sku} in warehouse ${warehouseId}`);
//             }
//         }

//         const currentInventoryKeys = Array.from(inventoryMap.keys()).map(key => {
//             const [productId, warehouseId] = key.split('-');
//             return `${productId}-${warehouseId}`;
//         });

//         // Find inventories not present in current CSV
//         const obsoleteInventories = await Inventory.find({});
//         const obsoleteOnes = obsoleteInventories.filter(inv => {
//             const invKey = `${inv.product}-${inv.warehouse}`;
//             return !currentInventoryKeys.includes(invKey);
//         });

//         // Remove obsolete inventories and their references
//         for (const inv of obsoleteOnes) {
//             await Product.updateOne(
//                 { _id: inv.product },
//                 { $pull: { inventory: inv._id } }
//             );

//             await SpecialProduct.updateOne(
//                 { _id: inv.product },
//                 { $pull: { inventory: inv._id } }
//             );

//             await Inventory.deleteOne({ _id: inv._id });
//         }



//     } catch (error) {
//         return res.status(500).json({ message: 'Error processing CSV file', error: error.message });
//     } finally {
//         await deleteFile(req.file.path);
//     }

//     res.status(200).json({
//         message: `Bulk upload completed. ${newCount} new inventories created, ${updatedCount} inventories updated, ${mergedCount} inventories merged, ${skippedCount} rows skipped.`
//     });
// };









// const bulkUpdateInventories = async (req, res) => {
//     try {
//         const { inventoryIds, updateData } = req.body;

//         if (!Array.isArray(inventoryIds) || inventoryIds.length === 0) {
//             return res.status(400).json({ message: 'Please provide an array of inventory IDs' });
//         }

//         // Validate warehouse if provided
//         if (updateData.warehouse) {
//             const warehouseExists = await Warehouse.findById(updateData.warehouse);
//             if (!warehouseExists) {
//                 return res.status(404).json({ message: 'Warehouse not found' });
//             }
//         }

//         // Validate city if provided
//         if (updateData.city) {
//             const cityExists = await City.findById(updateData.city);
//             if (!cityExists) {
//                 return res.status(404).json({ message: 'City not found' });
//             }
//         }

//         // Remove any undefined fields from updateData
//         Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

//         // Add lastRestocked date if quantity is being updated
//         if (updateData.quantity !== undefined) {
//             updateData.lastRestocked = new Date();
//         }

//         const result = await Inventory.updateMany(
//             { _id: { $in: inventoryIds } },
//             { $set: updateData },
//             { new: true }
//         );

//         res.status(200).json({
//             message: 'Inventories updated successfully',
//             modifiedCount: result.modifiedCount
//         });
//     } catch (error) {
//         res.status(400).json({ message: error.message });
//     }
// };


const bulkUpdateInventories = async (req, res) => {
    try {
        const { inventoryIds, updateData } = req.body;

        if (!Array.isArray(inventoryIds) || inventoryIds.length === 0) {
            return res.status(400).json({ message: 'Please provide an array of inventory IDs' });
        }

        // Get existing inventories to check product types
        const existingInventories = await Inventory.find({ _id: { $in: inventoryIds } });

        // Validate warehouse if provided
        if (updateData.warehouse) {
            const warehouseExists = await Warehouse.findById(updateData.warehouse);
            if (!warehouseExists) {
                return res.status(404).json({ message: 'Warehouse not found' });
            }
        }

        // Validate city if provided
        if (updateData.city) {
            const cityExists = await City.findById(updateData.city);
            if (!cityExists) {
                return res.status(404).json({ message: 'City not found' });
            }
        }

        // Remove any undefined fields from updateData
        Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

        // Add lastRestocked date if quantity is being updated
        if (updateData.quantity !== undefined) {
            updateData.lastRestocked = new Date();
        }

        const result = await Inventory.updateMany(
            { _id: { $in: inventoryIds } },
            { $set: updateData },
            { new: true }
        );

        // Get updated inventories with populated data
        const updatedInventories = await Inventory.find({ _id: { $in: inventoryIds } })
            .populate({
                path: 'product',
                select: 'name sku',
                // populate: [
                //     // { path: 'category', select: 'name' },
                //     // { path: 'specialCategory', select: 'name' }
                // ]
            })
            .populate('warehouse city');

        res.status(200).json({
            message: 'Inventories updated successfully',
            modifiedCount: result.modifiedCount,
            inventories: updatedInventories
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};



// const checkInventoryThresholds = async () => {
//     //console.log('Checking inventory thresholds...');
//     const inventories = await Inventory.find()
//       .populate('product')
//       .populate('city');

//     //console.log(`Found ${inventories.length} inventories to check`);
//     let stockAlertCount = 0;
    
//     try {
//         for (let i = 0; i < inventories.length; i++) {
//             const inventory = inventories[i];
//        //      console.log(`Processing inventory ${i + 1} of ${inventories.length}`);
//        //     console.log(`Checking inventory: ${inventory.product.name}`);
//        //     console.log(`Quantity: ${inventory.quantity}, Threshold: ${inventory.stockAlertThreshold}`);

//             if (inventory.quantity <= inventory.stockAlertThreshold) {
//               //  console.log(`Low stock detected for ${inventory.product.name} in ${inventory.city.name}`);
//                 await createAdminNotification({
//                     type: 'LOW_STOCK',
//                     content: `Low stock alert for ${inventory.product.name} (SKU: ${inventory.product.sku}) in ${inventory.city.name}`,
//                     resourceId: inventory._id,
//                     resourceModel: 'Inventory',
//                     priority: 'high'
//                 });
//                 stockAlertCount++;
//                // console.log(`Stock alerts created so far: ${stockAlertCount}`);
//             }

//             if (inventory.expiryDate) {
//                 const daysToExpiry = Math.ceil((inventory.expiryDate - new Date()) / (1000 * 60 * 60 * 24));
//                 if (daysToExpiry <= inventory.expiryDateThreshold) {
//                     await createAdminNotification({
//                         type: 'INVENTORY_EXPIRY',
//                         content: `Product ${inventory.product.name} (SKU: ${inventory.product.sku}) in ${inventory.city.name} will expire in ${daysToExpiry} days`,
//                         resourceId: inventory._id,
//                         resourceModel: 'Inventory',
//                         priority: 'high'
//                     });
//                 }
//             }
//         }
//        // console.log(`Total stock alerts created: ${stockAlertCount}`);
//     } catch (error) {
//         console.error('Error in checkInventoryThresholds:', error);
//     }
// };


  // Add cron job to check thresholds daily

  const checkInventoryThresholds = async () => {
    const inventories = await Inventory.find()
        .populate({
            path: 'product',
            select: 'name sku',
            populate: [
                { path: 'category', select: 'name' },
                { path: 'specialCategory', select: 'name' }
            ]
        })
        .populate('city');

    let stockAlertCount = 0;
    
    try {
        for (let i = 0; i < inventories.length; i++) {
            const inventory = inventories[i];
            const productName = inventory.product.name;
            const productSku = inventory.product.sku;
            const categoryName = inventory.productType === 'Product' 
                ? inventory.product.category?.name 
                : inventory.product.specialCategory?.name;

            if (inventory.quantity <= inventory.stockAlertThreshold) {
                await createAdminNotification({
                    type: 'LOW_STOCK',
                    content: `Low stock alert for ${productName} (SKU: ${productSku}) in ${inventory.city.name} - Category: ${categoryName}`,
                    resourceId: inventory._id,
                    resourceModel: 'Inventory',
                    priority: 'high'
                });
                stockAlertCount++;
            }

            if (inventory.expiryDate) {
                const daysToExpiry = Math.ceil((inventory.expiryDate - new Date()) / (1000 * 60 * 60 * 24));
                if (daysToExpiry <= inventory.expiryDateThreshold) {
                    await createAdminNotification({
                        type: 'INVENTORY_EXPIRY',
                        content: `Product ${productName} (SKU: ${productSku}) in ${inventory.city.name} - Category: ${categoryName} will expire in ${daysToExpiry} days`,
                        resourceId: inventory._id,
                        resourceModel: 'Inventory',
                        priority: 'high'
                    });
                }
            }
        }
    } catch (error) {
        console.error('Error in checkInventoryThresholds:', error);
    }
};


  cron.schedule('0 0 * * *', checkInventoryThresholds);


module.exports = {
    addInventory,
    updateInventory,
    deleteInventory,
    getAllInventories,
    getAvailableInventoriesDetailed,
    createSampleInventoryCsvTemplate,
    bulkUploadInventory,
    deleteInventories,
    bulkUpdateInventories
};
