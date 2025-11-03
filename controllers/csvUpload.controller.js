const csv = require('csv-parser');
const fs = require('fs');
const SpecialProduct = require('../models/specialProduct.model');
const SpecialCategory = require('../models/specialCategory.model');
const Inventory = require('../models/inventory.model');
const VariantName = require('../models/variantName.model');
const ProductVariant = require('../models/productVarriant.model');
const Product = require('../models/product.model');
const { Parser } = require('json2csv');

// const uploadCSV = async (req, res) => {
//     if (!req.file) {
//         return res.status(400).json({ message: 'No file uploaded' });
//     }

//     const results = [];
//     fs.createReadStream(req.file.path)
//         .pipe(csv())
//         .on('data', (data) => results.push(data))
//         .on('end', async () => {
//             try {
//                 for (const row of results) {
//                     console.log('Processing row:', row);

//                     // Trim all field names to remove extra spaces
//                     const trimmedRow = Object.fromEntries(
//                         Object.entries(row).map(([key, value]) => [key.trim(), value])
//                     );

//                     // Find or create the category
//                     let category = await SpecialCategory.findOne({ name: trimmedRow.specialCategory });
//                     if (!category) {
//                         if (!trimmedRow.specialCategory || !trimmedRow.type) {
//                             throw new Error('Special Category name and type are required for new categories');
//                         }
//                         category = await SpecialCategory.create({
//                             name: trimmedRow.specialCategory,
//                             type: trimmedRow.type,
//                             description: trimmedRow.categoryDescription || ''
//                         });
//                     }

//                     // Create the product with the category ID
//                     await SpecialProduct.create({
//                         name: trimmedRow.name,
//                         type: trimmedRow.type,
//                         unitSize: trimmedRow.unitSize || '',
//                         description: trimmedRow.description,
//                         sku: trimmedRow.sku,
//                         link: trimmedRow.link || '',
//                         stock: parseInt(trimmedRow.stock) || 0,
//                         specialCategory: category._id,
//                         specialSubcategory: trimmedRow.specialSubcategory,
//                         level: trimmedRow.level,
//                         status: trimmedRow.status,
//                         isActive: trimmedRow.isActive === 'true'
//                     });
//                 }

//                 fs.unlinkSync(req.file.path);

//                 res.status(200).json({ message: 'CSV data uploaded successfully' });
//             } catch (error) {
//                 console.error('Error processing CSV:', error);
//                 res.status(500).json({ message: error.message });
//             }
//         });
// };


// const exportSpecialProducts = async (req, res) => {
//     try {
//         const products = await SpecialProduct.find()
//             .populate('specialCategory', 'name')
//             .populate('productVariants')
//             .lean();

//         const fields = [
//             'name',
//             'sku',
//             'type',
//             // 'unitSize',
//             'description',
//             'image',
//             'gallery',
//             // 'stock',
//             'category',
//             'level',
//             'status',
//             'prices',
//             'createdAt'
//         ];

//         const json2csvParser = new Parser({ fields });

//         const csvData = products.map(product => ({
//             name: product.name,
//             sku: product.sku,
//             type: product.type,
//             // unitSize: product.unitSize || '',
//             description: product.description || '',
//             // stock: product.stock,
//             category: product.specialCategory?.name || '',
//             image: product.image || '',
//             gallery: product.gallery || '',
//             // level: product.level || '',
//             status: product.status,
//             prices: product.prices.map(p => `${p.city}: ${p.amount}`).join(' | '),
//             createdAt: new Date(product.createdAt).toLocaleDateString()
//         }));

//         const csv = json2csvParser.parse(csvData);

//         res.header('Content-Type', 'text/csv');
//         res.attachment('special_products.csv');
//         res.send(csv);

//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };



const exportSpecialProducts = async (req, res) => {
    try {
        const products = await SpecialProduct.find()
            .populate('specialCategory', 'name')
            .populate({
                path: 'productVariants',
                populate: {
                    path: 'variantName',
                    select: 'name'
                }
            })
            .lean();

        const fields = [
            'name',
            'sku',
            'type',
            'description',
            'image',
            'gallery',
            'category',
            'status',
            'regularPrice',
            'salePrice',
            'variantName',
            'variantValue',
            // 'createdAt'
        ];

        const json2csvParser = new Parser({ fields });

        let csvRows = [];

        products.forEach(product => {
            const baseProduct = {
                name: product.name,
                sku: product.sku,
                type: product.type,
                description: product.description || '',
                image: product.image || '',
                gallery: product.gallery ? product.gallery.join(', ') : '',
                category: product.specialCategory?.name || '',
                status: product.status,
                regularPrice: product.prices[0]?.amount || 0,
                salePrice: product.prices[0]?.salePrice || 0,
                // createdAt: new Date(product.createdAt).toLocaleDateString()
            };

            if (product.productVariants && product.productVariants.length > 0) {
                // Create a row for each variant
                product.productVariants.forEach(variant => {
                    csvRows.push({
                        ...baseProduct,
                        variantName: variant.variantName?.name || '',
                        variantValue: variant.value || '',
                        sku: baseProduct.sku || variant.sku // Unique SKU for each variant
                    });
                });
            } else {
                // Product without variants
                csvRows.push({
                    ...baseProduct,
                    variantName: '',
                    variantValue: ''
                });
            }
        });

        const csv = json2csvParser.parse(csvRows);

        res.header('Content-Type', 'text/csv');
        res.attachment('special_products.csv');
        res.send(csv);

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};



// const exportAllProductsInventory = async (req, res) => {
//     try {
//         // Get all inventory with populated fields
//         const inventory = await Inventory.find()
//             .populate({
//                 path: 'product',
//                 refPath: 'productType',
//                 populate: [
//                     { path: 'category', select: 'name' },
//                     { path: 'subcategory', select: 'name' },
//                     { path: 'subsubcategory', select: 'name' },
//                     { path: 'specialCategory', select: 'name' }
//                 ]
//             })
//             .populate('warehouse', 'name')
//             .populate('city', 'name')
//             .lean();

//         const fields = [
//             'productType',
//             'productName',
//             'sku',
//             'category',
//             'subcategory',
//             'subsubcategory', 
//             'specialCategory',
//             'productType',
//             'warehouseName',
//             'cityName',
//             'quantity',
//             'locationWithinWarehouse',
//             'lastRestocked',
//             'stockAlertThreshold'
//         ];

//         const json2csvParser = new Parser({ fields });

//         const csvData = inventory.map(item => {
//             const product = item.product;
//             return {
//                 productType: item.productType,
//                 productName: product.name,
//                 sku: product.sku,
//                 category: item.productType === 'Product' ? 
//                     product.category?.map(c => c.name).join(', ') : 
//                     product.specialCategory?.name,
//                 subcategory: item.productType === 'Product' ? 
//                     product.subcategory?.map(s => s.name).join(', ') : '',
//                 subsubcategory: item.productType === 'Product' ? 
//                     product.subsubcategory?.map(s => s.name).join(', ') : '',
//                 specialCategory: item.productType === 'SpecialProduct' ? 
//                     product.specialCategory?.name : '',
//                 productType: item.productType === 'SpecialProduct' ? 
//                     product.type : 'Regular',
//                 warehouseName: item.warehouse?.name || '',
//                 cityName: item.city?.name || '',
//                 quantity: item.quantity,
//                 locationWithinWarehouse: item.locationWithinWarehouse || '',
//                 lastRestocked: item.lastRestocked ? 
//                     new Date(item.lastRestocked).toLocaleDateString() : '',
//                 stockAlertThreshold: item.stockAlertThreshold
//             };
//         });

//         const csv = json2csvParser.parse(csvData);

//         res.header('Content-Type', 'text/csv');
//         res.attachment('products_inventory.csv');
//         res.send(csv);

//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };


// const exportAllProductsInventory = async (req, res) => {
//     try {
//         const inventory = await Inventory.find()
//             .populate({
//                 path: 'product',
//                 refPath: 'productType'
//             })
//             .populate('warehouse', 'name')
//             .populate('city', 'name')
//             .lean();

//         const fields = [
//             'productType',
//             'productName',
//             'sku',
//             'category',
//             'type',
//             'warehouseName',
//             'cityName',
//             'quantity',
//             'locationWithinWarehouse',
//             'lastRestocked',
//             'stockAlertThreshold'
//         ];

//         const json2csvParser = new Parser({ fields });

//         const csvData = inventory.map(item => {
//             const product = item.product;
//             return {
//                 productType: item.productType,
//                 productName: product?.name || '',
//                 sku: product?.sku || '',
//                 category: item.productType === 'Product' ? 
//                     'Regular Product' : 
//                     product?.specialCategory || '',
//                 type: item.productType === 'SpecialProduct' ? 
//                     product?.type : 'Regular',
//                 warehouseName: item.warehouse?.name || '',
//                 cityName: item.city?.name || '',
//                 quantity: item.quantity || 0,
//                 locationWithinWarehouse: item.locationWithinWarehouse || '',
//                 lastRestocked: item.lastRestocked ? 
//                     new Date(item.lastRestocked).toLocaleDateString() : '',
//                 stockAlertThreshold: item.stockAlertThreshold || 0
//             };
//         });

//         const csv = json2csvParser.parse(csvData);

//         res.header('Content-Type', 'text/csv');
//         res.attachment('products_inventory.csv');
//         res.send(csv);

//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };

// const exportAllProductsInventory = async (req, res) => {
//     try {
//         // Get Product inventory
//         const productInventory = await Inventory.find({ productType: 'Product' })
//             .populate({
//                 path: 'product',
//                 model: 'Product',
//                 populate: [
//                     { path: 'category', select: 'name' },
//                     { path: 'subcategory', select: 'name' },
//                     { path: 'subsubcategory', select: 'name' }
//                 ]
//             })
//             .populate('warehouse', 'name')
//             .populate('city', 'name')
//             .lean();

//         // Get SpecialProduct inventory
//         const specialProductInventory = await Inventory.find({ productType: 'SpecialProduct' })
//             .populate({
//                 path: 'product',
//                 model: 'SpecialProduct',
//                 populate: { path: 'specialCategory', select: 'name' }
//             })
//             .populate('warehouse', 'name')
//             .populate('city', 'name')
//             .lean();

//         const fields = [
//             'productType',
//             'productName',
//             'sku',
//             'mainCategory',
//             'subCategory',
//             'subSubCategory',
//             'specialCategory',
//             'type',
//             'warehouseName',
//             // 'cityName',
//             'quantity',
//             'locationWithinWarehouse',
//             'lastRestocked',
//             'stockAlertThreshold'
//         ];

//         const json2csvParser = new Parser({ fields });

//         const csvData = [...productInventory, ...specialProductInventory].map(item => ({
//             productType: item.productType,
//             productName: item.product?.name || '',
//             sku: item.product?.sku || '',
//             mainCategory: item.productType === 'Product' ? 
//                 (item.product?.category?.map(cat => cat.name).join(', ') || '') : '',
//             subCategory: item.productType === 'Product' ? 
//                 (item.product?.subcategory?.map(sub => sub.name).join(', ') || '') : '',
//             subSubCategory: item.productType === 'Product' ? 
//                 (item.product?.subsubcategory?.map(subsub => subsub.name).join(', ') || '') : '',
//             specialCategory: item.productType === 'SpecialProduct' ? 
//                 (item.product?.specialCategory?.name || '') : '',
//             type: item.productType === 'SpecialProduct' ? 
//                 item.product?.type : 'Regular',
//             warehouseName: item.warehouse?.name || '',
//             // cityName: item.city?.name || '',
//             quantity: item.quantity || 0,
//             locationWithinWarehouse: item.locationWithinWarehouse || '',
//             lastRestocked: item.lastRestocked ? 
//                 new Date(item.lastRestocked).toLocaleDateString() : '',
//             stockAlertThreshold: item.stockAlertThreshold || 0
//         }));

//         const csv = json2csvParser.parse(csvData);

//         res.header('Content-Type', 'text/csv');
//         res.attachment('products_inventory.csv');
//         res.send(csv);

//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };



const exportAllProductsInventory = async (req, res) => {
    try {
        // Get Product inventory with complete data
        const productInventory = await Inventory.find({ productType: 'Product' })
            .populate({
                path: 'product',
                model: 'Product',
                select: 'name sku category subcategory subsubcategory',
                populate: [
                    { path: 'category', select: 'name' },
                    { path: 'subcategory', select: 'name' },
                    { path: 'subsubcategory', select: 'name' }
                ]
            })
            .populate('warehouse', 'name')
            .populate('city', 'name')
            .lean();

        // Get SpecialProduct inventory with complete data
        const specialProductInventory = await Inventory.find({ productType: 'SpecialProduct' })
            .populate({
                path: 'product',
                model: 'SpecialProduct',
                select: 'name sku type specialCategory',
                populate: { 
                    path: 'specialCategory',
                    select: 'name'
                }
            })
            .populate('warehouse', 'name')
            .populate('city', 'name')
            .lean();

         // Filter out any inventory items that are not in the product's inventory array
const filteredProductInventory = productInventory.filter(inv => 
    inv.product && inv.product.inventory && inv.product.inventory.includes(inv._id)
);

const filteredSpecialProductInventory = specialProductInventory.filter(inv => 
    inv.product && inv.product.inventory && inv.product.inventory.includes(inv._id)
);

    

        const fields = [
            'productType',
            'productName',
            'sku',
            'mainCategory',
            'subCategory',
            'subSubCategory',
            'specialCategory',
            'type',
            'warehouseName',
            // 'city',
            'quantity',
            'vat',
            'locationWithinWarehouse',
            'lastRestocked',
            'stockAlertThreshold',
            'batchId',
            'expiryDate',
            'barcode',
            'expiryDateThreshold'
        ];

        const json2csvParser = new Parser({ fields });

        const csvData = [...productInventory, ...specialProductInventory].map(item => ({
            productType: item.productType,
            productName: item.product?.name || '',
            sku: item.product?.sku || '',
            mainCategory: item.productType === 'Product' ? 
                (item.product?.category?.map(cat => cat.name).join(', ') || '') : '',
            subCategory: item.productType === 'Product' ? 
                (item.product?.subcategory?.map(sub => sub.name).join(', ') || '') : '',
            subSubCategory: item.productType === 'Product' ? 
                (item.product?.subsubcategory?.map(subsub => subsub.name).join(', ') || '') : '',
            specialCategory: item.productType === 'SpecialProduct' ? 
                (item.product?.specialCategory?.name || '') : '',
            type: item.productType === 'SpecialProduct' ? 
                item.product?.type : 'Regular',
            warehouseName: item.warehouse?.name || '',
            // city: item.city?.name || '',
            quantity: item.quantity || 0,
            vat: item.vat || '',
            locationWithinWarehouse: item.locationWithinWarehouse || '',
            lastRestocked: item.lastRestocked ? 
                new Date(item.lastRestocked).toLocaleDateString() : '',
            stockAlertThreshold: item.stockAlertThreshold || 0,
            batchId: item.batchId || '',
            expiryDate: item.expiryDate ? 
                new Date(item.expiryDate).toLocaleDateString() : '',
            barcode: item.barcode || '',
            expiryDateThreshold: item.expiryDateThreshold || ''
        }));

        const csv = json2csvParser.parse(csvData);

        res.header('Content-Type', 'text/csv');
        res.attachment('products_inventory.csv');
        res.send(csv);

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};




// const exportProducts = async (req, res) => {
//     try {
//         const products = await Product.find()
//             .populate('category', 'name')
//             .populate('subcategory', 'name')
//             .populate('subsubcategory', 'name')
//             .populate('brand', 'name')
//             .populate('tags', 'name')
//             .lean();

//         const fields = [
//             'name',
//             'sku',
//             'brand',
//             'mainCategory',
//             'subCategory',
//             'subSubCategory',
//             'tags',
//             'isBestSeller',
//             'isNewArrival',
//             'isShopByPet',
//             'prices',
//             'lifecycleStage',
//             'description',
//             'createdAt'
//         ];

//         const json2csvParser = new Parser({ fields });

//         const csvData = products.map(product => {
//             const defaultCityPrice = product.prices?.find(p => 
//                 p.city.toString() === '6745bc8f9b0338a09d843eb5'
//             );
//             return {
//             name: product.name,
//             sku: product.sku,
//             brand: product.brand?.name || '',
//             mainCategory: product.category?.map(cat => cat.name).join(', ') || '',
//             subCategory: product.subcategory?.map(sub => sub.name).join(', ') || '',
//             subSubCategory: product.subsubcategory?.map(subsub => subsub.name).join(', ') || '',
//             tags: product.tags?.map(tag => tag.name).join(', ') || '',
//             isBestSeller: product.isBestSeller ? 'Yes' : 'No',
//             isNewArrival: product.isNewArrival ? 'Yes' : 'No',
//             isShopByPet: product.isShopByPet ? 'Yes' : 'No',
//             price: defaultCityPrice?.amount || '',
//             lifecycleStage: product.lifecycleStage,
//             description: product.description || '',
//             createdAt: new Date(product.createdAt).toLocaleDateString()
//         };
//         });

//         const csv = json2csvParser.parse(csvData);

//         res.header('Content-Type', 'text/csv');
//         res.attachment('products.csv');
//         res.send(csv);

//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };


// const exportProducts = async (req, res) => {
//     try {
//         const DEFAULT_CITY_ID = '6745bc8f9b0338a09d843eb5'; // Using the correct default city ID
        
//         const products = await Product.find()
//             .populate('category', 'name')
//             .populate('subcategory', 'name')
//             .populate('subsubcategory', 'name')
//             .populate('brand', 'name')
//             .populate('tags', 'name')
//             .lean();

//         const fields = [
//             'name',
//             'sku',
//             'brand',
//             'mainCategory',
//             'subCategory',
//             'subSubCategory',
//             'tags',
//             'isBestSeller',
//             'isNewArrival',
//             'isShopByPet',
//             // 'price',
//             'regularPrice',
//             'salePrice',
//             'lifecycleStage',
//             'description',
//             'createdAt'
//         ];

//         const json2csvParser = new Parser({ fields });

//         const csvData = products.map(product => {
//             const defaultCityPrice = product.prices?.find(p => 
//                 p.city.toString() === DEFAULT_CITY_ID
//             );

//             return {
//                 name: product.name,
//                 sku: product.sku,
//                 brand: product.brand?.name || '',
//                 mainCategory: product.category?.map(cat => cat.name).join(', ') || '',
//                 subCategory: product.subcategory?.map(sub => sub.name).join(', ') || '',
//                 subSubCategory: product.subsubcategory?.map(subsub => subsub.name).join(', ') || '',
//                 tags: product.tags?.map(tag => tag.name).join(', ') || '',
//                 isBestSeller: product.isBestSeller ? 'Yes' : 'No',
//                 isNewArrival: product.isNewArrival ? 'Yes' : 'No',
//                 isShopByPet: product.isShopByPet ? 'Yes' : 'No',
//                 // price: defaultPrice?.amount || 0, // Using amount directly from the found price
//                 regularPrice: defaultCityPrice?.amount || 0,
//                 salePrice: defaultCityPrice?.salePrice || 0,
//                 lifecycleStage: product.lifecycleStage,
//                 description: product.description || '',
//                 createdAt: new Date(product.createdAt).toLocaleDateString()
//             };
//         });

//         const csv = json2csvParser.parse(csvData);

//         res.header('Content-Type', 'text/csv');
//         res.attachment('products.csv');
//         res.send(csv);

//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };

const exportProducts = async (req, res) => {
    try {
        const DEFAULT_CITY_ID = '6745bc8f9b0338a09d843eb5';
        
        const products = await Product.find()
            .populate('category', 'name')
            .populate('subcategory', 'name')
            .populate('subsubcategory', 'name')
            .populate('brand', 'name')
            .populate('tags', 'name')
            .populate({
                path: 'variants',
                populate: {
                    path: 'variantName',
                    select: 'name'
                }
            })
            .lean();

        const fields = [
            'name',
            'sku',
            'brand',
            'mainCategory',
            'subCategory',
            'subSubCategory',
            'tags',
            'variantName',
            'variantValue',
            'isBestSeller',
            'isNewArrival',
            'isShopByPet',
            'regularPrice',
            'salePrice',
            'lifecycleStage',
            'description',
            'createdAt'
        ];

        const json2csvParser = new Parser({ fields });
        let csvRows = [];

        products.forEach(product => {
            const baseProduct = {
                name: product.name,
                sku: product.sku,
                brand: product.brand?.name || '',
                mainCategory: product.category?.map(cat => cat.name).join(', ') || '',
                subCategory: product.subcategory?.map(sub => sub.name).join(', ') || '',
                subSubCategory: product.subsubcategory?.map(subsub => subsub.name).join(', ') || '',
                tags: product.tags?.map(tag => tag.name).join(', ') || '',
                isBestSeller: product.isBestSeller ? 'Yes' : 'No',
                isNewArrival: product.isNewArrival ? 'Yes' : 'No',
                isShopByPet: product.isShopByPet ? 'Yes' : 'No',
                lifecycleStage: product.lifecycleStage,
                description: product.description || '',
                createdAt: new Date(product.createdAt).toLocaleDateString()
            };

            const defaultCityPrice = product.prices?.find(p => 
                p.city.toString() === DEFAULT_CITY_ID
            );
            baseProduct.regularPrice = defaultCityPrice?.amount || 0;
            baseProduct.salePrice = defaultCityPrice?.salePrice || 0;

            if (product.variants && product.variants.length > 0) {
                // Create a row for each variant
                product.variants.forEach(variant => {
                    csvRows.push({
                        ...baseProduct,
                        variantName: variant.variantName?.name || '',
                        variantValue: variant.value || ''
                    });
                });
            } else {
                // Product without variants
                csvRows.push({
                    ...baseProduct,
                    variantName: '',
                    variantValue: ''
                });
            }
        });

        const csv = json2csvParser.parse(csvRows);

        res.header('Content-Type', 'text/csv');
        res.attachment('products.csv');
        res.send(csv);

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};




// const uploadCSV = async (req, res) => {
//     if (!req.file) {
//         return res.status(400).json({ message: 'No file uploaded' });
//     }

//     const results = [];
//     const skippedRows = [];

//     fs.createReadStream(req.file.path)
//         .pipe(csv())
//         .on('data', (data) => results.push(data))
//         .on('end', async () => {
//             try {
//                 for (const row of results) {
//                     const trimmedRow = Object.fromEntries(
//                         Object.entries(row).map(([key, value]) => [key.trim(), value])
//                     );

//                     if (!trimmedRow.specialCategory || !trimmedRow.type) {
//                         skippedRows.push(trimmedRow);
//                         continue;
//                     }

//                     let category = await SpecialCategory.findOne({ name: trimmedRow.specialCategory });
//                     if (!category) {
//                         category = await SpecialCategory.create({
//                             name: trimmedRow.specialCategory,
//                             type: trimmedRow.type,
//                             description: trimmedRow.categoryDescription || ''
//                         });
//                     }

//                     await SpecialProduct.create({
//                         name: trimmedRow.name,
//                         type: trimmedRow.type,
//                         unitSize: trimmedRow.unitSize || '',
//                         description: trimmedRow.description,
//                         sku: trimmedRow.sku,
//                         link: trimmedRow.link || '',
//                         stock: parseInt(trimmedRow.stock) || 0,
//                         specialCategory: category._id,
//                         specialSubcategory: trimmedRow.specialSubcategory,
//                         level: trimmedRow.level,
//                         status: trimmedRow.status,
//                         isActive: trimmedRow.isActive === 'true'
//                     });
//                 }

//                 fs.unlinkSync(req.file.path);

//                 res.status(200).json({ 
//                     message: 'CSV data uploaded successfully',
//                     skippedRows: skippedRows.length > 0 ? skippedRows : 'No rows skipped'
//                 });
//             } catch (error) {
//                 console.error('Error processing CSV:', error);
//                 res.status(500).json({ message: error.message });
//             }
//         });
// };


const uploadCSV = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    const results = [];
    const skippedRows = [];

    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            try {
                for (const row of results) {
                    const trimmedRow = Object.fromEntries(
                        Object.entries(row).map(([key, value]) => [key.trim(), value])
                    );

                    if (!trimmedRow.category || !trimmedRow.type || !trimmedRow.sku) {
                        skippedRows.push(trimmedRow);
                        continue;
                    }

                    let category = await SpecialCategory.findOneAndUpdate(
                        { name: trimmedRow.category },
                        { name: trimmedRow.category, type: trimmedRow.type },
                        { upsert: true, new: true }
                    );

                    let variantName;
                    if (trimmedRow.variantName) {
                        variantName = await VariantName.findOneAndUpdate(
                            { name: trimmedRow.variantName },
                            { name: trimmedRow.variantName },
                            { upsert: true, new: true }
                        );
                    }

                    let productVariant;
                    if (variantName && trimmedRow.variantValue) {
                        productVariant = await ProductVariant.findOneAndUpdate(
                            { variantName: variantName._id, value: trimmedRow.variantValue },
                            { variantName: variantName._id, value: trimmedRow.variantValue },
                            { upsert: true, new: true }
                        );
                    }

                    // function processSkuForVariant(sku) {
                    // //     const parts = sku.split('-');
                    // //     return parts.length > 1 ? parts.slice(0, -1).join('-') : sku;
                    // // }
                    
                    // Main function mein yeh changes karein
                    // const baseSku = processSkuForVariant(trimmedRow.sku);
                    // let product = await SpecialProduct.findOne({ sku: baseSku });
                    // const baseSku = trimmedRow.sku.split('-')[0];
                    // let product = await SpecialProduct.findOne({ sku: baseSku });

                    const skuToMatch = trimmedRow.sku.trim();
                    let product = await SpecialProduct.findOne({ sku: { $regex: new RegExp(`^${skuToMatch}$`, 'i') } });

                    console.log('Found product', product.sku)
                    if (product) {
                        // product.name = trimmedRow.name;
                        // product.type = trimmedRow.type;
                        // product.description = trimmedRow.description || product.description;
                        // product.image = trimmedRow.image || product.image;
                        // product.gallery = trimmedRow.gallery ? trimmedRow.gallery.split(',').map(img => img.trim()) : product.gallery;
                        // product.specialCategory = category._id;
                        // product.status = trimmedRow.status || product.status;
                        // product.prices = [{
                        //     city: '6745bc8f9b0338a09d843eb5',
                        //     amount: parseFloat(trimmedRow.regularPrice) || product.prices[0]?.amount,
                        //     salePrice: parseFloat(trimmedRow.salePrice) || product.prices[0]?.salePrice
                        // }];
                        
                        // // Update inventory if provided in the CSV
                        // if (trimmedRow.stock) {
                        //     product.stock = parseInt(trimmedRow.stock);
                        // }
                    
                        // // Handle product variants
                        // if (productVariant) {
                        //     await SpecialProduct.findByIdAndUpdate(
                        //         product._id,
                        //         { $addToSet: { productVariants: productVariant._id } },
                        //         { new: true }
                        //     );
                        // }
                    
                        // await product.save();

                    product.name = trimmedRow.name;
                    product.type = trimmedRow.type;
                    product.description = trimmedRow.description;
                    product.image = trimmedRow.image;
                    product.gallery = trimmedRow.gallery ? trimmedRow.gallery.split(',').map(img => img.trim()) : product.gallery;
                    product.specialCategory = category._id;
                    product.status = trimmedRow.status;
                    product.stock = parseInt(trimmedRow.stock) || product.stock;
                    product.prices = [{
                        city: '6745bc8f9b0338a09d843eb5',
                        amount: parseFloat(trimmedRow.regularPrice) || product.prices[0]?.amount,
                        salePrice: parseFloat(trimmedRow.salePrice) || product.prices[0]?.salePrice
                    }];

                    if (productVariant) {
                        await SpecialProduct.findByIdAndUpdate(
                            product._id,
                            { $addToSet: { productVariants: productVariant._id } },
                            { new: true }
                        );
                    }

                    await product.save();
                    console.log('Updated product:', product);

                        
                    } else {
                        product = new SpecialProduct({
                            name: trimmedRow.name,
                            sku: baseSku,
                            type: trimmedRow.type,
                            description: trimmedRow.description,
                            image: trimmedRow.image,
                            gallery: trimmedRow.gallery.split(',').map(img => img.trim()),
                            specialCategory: category._id,
                            status: trimmedRow.status,
                            prices: [{
                                city: '6745bc8f9b0338a09d843eb5',
                                amount: parseFloat(trimmedRow.regularPrice),
                                salePrice: parseFloat(trimmedRow.salePrice)
                            }],
                            productVariants: productVariant ? [productVariant._id] : []
                        });
                    }

                    await product.save();
                }
                // console.log('updated product', updatedProduct)

                fs.unlinkSync(req.file.path);

                res.status(200).json({ 
                    message: 'CSV data uploaded and processed successfully',
                    skippedRows: skippedRows.length > 0 ? skippedRows : 'No rows skipped'
                });
            } catch (error) {
                console.error('Error processing CSV:', error);
                res.status(500).json({ message: error.message });
            }
        });
};






const uploadCategoryCSV = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    const results = [];
    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            try {
                for (const row of results) {
                    await SpecialCategory.findOneAndUpdate(
                        { name: row.name },
                        {
                            name: row.name,
                            type: row.type,
                            description: row.description,
                            image: row.image
                        },
                        { upsert: true, new: true, setDefaultsOnInsert: true }
                    );
                }

                fs.unlinkSync(req.file.path); // Remove the temporary file

                res.status(200).json({ message: 'Category CSV data uploaded successfully' });
            } catch (error) {
                res.status(500).json({ message: error.message });
            }
        });
};


module.exports = {
    // ... other exports
    uploadCSV,
    uploadCategoryCSV,
    exportSpecialProducts,
    exportAllProductsInventory,
    exportProducts
};
