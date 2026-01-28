const SpecialProduct = require('../models/specialProduct.model');
const SpecialSubCategory = require('../models/specialSubcategory.model');
const SpecialCategory = require('../models/specialCategory.model');
const ProductVariant = require('../models/productVarriant.model');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const csv = require('csv-parser');
const fs = require('fs');
const { stringify } = require('csv-stringify/sync');
const { deleteFile } = require('../config/fileOperations');
const BASE_CITY = process.env.BASE_CITY || '67400e8a7b963a1282d218b5';

const createProduct = async (req, res) => {
    try {
        const productData = { ...req.body };
        // console.log('Incoming product data:', productData);
        // console.log('Product variants:', productData.productVariants);

        // Handle single image
        if (req.files && req.files.image) {
            productData.image = `/uploads/special-products/${req.files.image[0].filename}`;
        }
        
        // Handle gallery images
        if (req.files && req.files.gallery) {
            productData.gallery = req.files.gallery.map(file => 
                `/uploads/special-products/${file.filename}`
            );
        }

        // Parse prices array if it's sent as string
        if (typeof productData.prices === 'string') {
            productData.prices = JSON.parse(productData.prices);
        }

        // Convert stock to number if provided
        if (productData.stock !== undefined && productData.stock !== null) {
            productData.stock = parseInt(productData.stock, 10) || 0;
        }

        // Generate or use provided variantGroupId
        if (!productData.variationId) {
            productData.variationId = uuidv4();
        }

        // Handle product variants
        
        // if (productData.productVariants && Array.isArray(productData.productVariants)) {
        //     // Convert string IDs to ObjectIds if needed
        //     productData.productVariants = productData.productVariants.map(id => 
        //         mongoose.Types.ObjectId(id)
        //     );
        // }

        const product = new SpecialProduct(productData);
        await product.save();

        await SpecialSubCategory.findByIdAndUpdate(
            product.specialCategory,
            { $inc: { productCount: 1 } }
        );

        res.status(201).json(product);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};



const getProductsByVariantGroup = async (req, res) => {
    try {
        const { variationId } = req.params;
        const { variantValue } = req.query;

        let query = { variationId };
        if (variantValue) {
            query['productVariants.value'] = variantValue;
        }

        const products = await SpecialProduct.find(query)
            .populate('specialCategory')
            .populate('specialSubcategory')
            .populate('prices.city')
            .populate({
                path: 'productVariants',
                populate: {
                    path: 'variantName'
                }
            }).populate({
                'path': 'inventory',
                populate: {
                    path: 'warehouse'
                }
            })

        res.status(200).json(products);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};



const specialProductController = {
    // Get products by type
    getProductsByType: async (req, res) => {
        try {
            const { type } = req.params;
            
            // Exact match query for type
            const products = await SpecialProduct.find({ 
                type: type // Convert to lowercase for consistency
            })
                .populate('specialCategory')
                .populate('specialSubcategory')
                .populate('prices.city')
                .populate({
                    path: 'productVariants',
                    populate: {
                        path: 'variantName'
                    }
                }).populate({
                    path: 'inventory',
                    populate: {
                        path: 'warehouse'
                    }
                });
            
            res.status(200).json(products);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    // Get products by category
    getProductsByCategory: async (req, res) => {
        try {
            const { categoryId } = req.params;
            const products = await SpecialProduct.find({ specialCategory: categoryId })
                .populate('specialCategory')
                .populate('specialSubcategory')
                .populate('prices.city')
                .populate({
                    path: 'productVariants',
                    populate: {
                        path: 'variantName'
                    }
                }).populate({
                    path: 'inventory',
                    populate: {
                        path: 'warehouse'
                    }
                });
            
            res.status(200).json(products);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }
};

const getCategoryFiltersAndProducts = async (req, res) => {
    try {
        const { categoryId } = req.params;
        const { minPrice, maxPrice, ...variantFilters } = req.query;

        let query = { specialCategory: categoryId };
        
        // Dynamic variant filters
        Object.entries(variantFilters).forEach(([key, value]) => {
            query[`productVariants`] = {
                $elemMatch: {
                    'variantName.name': key,
                    'value': value
                }
            };
        });

        // Price filter
        if (minPrice || maxPrice) {
            query['prices.amount'] = {};
            if (minPrice) query['prices.amount'].$gte = Number(minPrice);
            if (maxPrice) query['prices.amount'].$lte = Number(maxPrice);
        }

        const products = await SpecialProduct.find(query)
            .populate('specialCategory')
            .populate('specialSubcategory')
            .populate('prices.city')
            .populate({
                path: 'productVariants',
                populate: { path: 'variantName' }
            }).populate({
                path: 'inventory',
                populate: {
                    path: 'warehouse',
                }
            })

        // Get all unique filter values
        const allProducts = await SpecialProduct.find({ specialCategory: categoryId });
        const filters = {
            priceRange: { min: Infinity, max: -Infinity }
        };

        allProducts.forEach(product => {
            product.productVariants.forEach(variant => {
                const variantName = variant.variantName.name;
                if (!filters[variantName]) {
                    filters[variantName] = [];
                }
                if (!filters[variantName].includes(variant.value)) {
                    filters[variantName].push(variant.value);
                }
            });

            product.prices.forEach(price => {
                filters.priceRange.min = Math.min(filters.priceRange.min, price.amount);
                filters.priceRange.max = Math.max(filters.priceRange.max, price.amount);
            });
        });

        res.status(200).json({ filters, products });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


const getAllProducts = async (req, res) => {
    try {
        const products = await SpecialProduct.find()
            .populate('specialCategory')
            .populate('specialSubcategory')
            .populate('prices.city')
            .populate({
                path: 'productVariants',
                populate: {
                    path: 'variantName'
                }
            })
            .populate({
                path: 'inventory',
                populate: [
                    { path: 'warehouse' },
                    { path: 'product' },
                    { path: 'city' }
                ]
            });
        res.status(200).json(products);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/special-products/search?query=...
const searchSpecialProducts = async (req, res) => {
  try {
    let { query } = req.query;
    if (!query || query.trim() === "") return res.json([]);

    query = query.trim();

    // Search using MongoDB text index
    const products = await SpecialProduct.find(
      { $text: { $search: query } },
      { score: { $meta: "textScore" }, name: 1, sku: 1, image: 1 } 
    )
      .sort({ score: { $meta: "textScore" } })
      .limit(50);

    // Map to clean object
    const results = products.map((p) => ({
      _id: p._id,
      name: p.name,
      sku: p.sku,
      image: p.image,
    }));

    res.json(results);
  } catch (error) {
    // console.error("Search Special Products Error:", error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { searchSpecialProducts };



const getProductById = async (req, res) => {
    try {
        const product = await SpecialProduct.findById(req.params.id)
        .populate('specialCategory')
        .populate('specialSubcategory')
        .populate('prices.city')
        .populate({
            path: 'productVariants',
            populate: {
                path: 'variantName'
            }
        })
        .populate({
            path: 'inventory',
            populate: [
                { path: 'warehouse' },
                { path: 'product' },
                { path: 'city' }
            ]
        });
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        res.status(200).json(product);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};




const updateProduct = async (req, res) => {
    try {
        const updates = { ...req.body };
        
        // Handle single image update
        if (req.files && req.files.image) {
            updates.image = `/uploads/special-products/${req.files.image[0].filename}`;
        }
        
        // Handle gallery images update
        if (req.files && req.files.gallery) {
            updates.gallery = req.files.gallery.map(file => 
                `/uploads/special-products/${file.filename}`
            );
        }

        // Parse prices array if it's sent as string
        if (typeof updates.prices === 'string') {
            updates.prices = JSON.parse(updates.prices);
        }

        // Convert stock to number if provided
        if (updates.stock !== undefined && updates.stock !== null) {
            updates.stock = parseInt(updates.stock, 10) || 0;
        }

        const product = await SpecialProduct.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true, runValidators: true }
        );

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        res.status(200).json(product);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const deleteProduct = async (req, res) => {
    try {
        const product = await SpecialProduct.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // await SpecialSubCategory.findByIdAndUpdate(
        //     product.specialCategory,
        //     { $inc: { productCount: -1 } }
        // );

        await SpecialProduct.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Product deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const bulkDeleteProducts = async (req, res) => {
    try {
        const { productIds } = req.body;
        
        // Get all products to update category counts
        const products = await SpecialProduct.find({ _id: { $in: productIds } });
        
        // Update product counts for each category
        // for (const product of products) {
        //     await SpecialSubCategory.findByIdAndUpdate(
        //         product.specialCategory,
        //         { $inc: { productCount: -1 } }
        //     );
        // }
        
        // Delete all products
        await SpecialProduct.deleteMany({ _id: { $in: productIds } });
        
        res.status(200).json({ 
            message: 'Products deleted successfully',
            deletedCount: products.length
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Helper function to find or create special category
const findOrCreateSpecialCategory = async (categoryName, categoryType = 'supplies') => {
    try {
        let category = await SpecialCategory.findOne({ name: categoryName });
        if (!category) {
            category = await SpecialCategory.create({ 
                name: categoryName,
                type: categoryType
            });
        }
        return category._id;
    } catch (error) {
        console.log(`Skipping special category creation: ${error.message}`);
        return null;
    }
};

// Helper function to find or create special subcategory
const findOrCreateSpecialSubCategory = async (subCategoryName, parentCategoryId) => {
    try {
        if (!subCategoryName || !parentCategoryId) return null;
        let subCategory = await SpecialSubCategory.findOne({ 
            name: subCategoryName,
            parentCategory: parentCategoryId
        });
        if (!subCategory) {
            subCategory = await SpecialSubCategory.create({ 
                name: subCategoryName,
                parentCategory: parentCategoryId
            });
        }
        return subCategory._id;
    } catch (error) {
        console.log(`Skipping special subcategory creation: ${error.message}`);
        return null;
    }
};

// Parse links from CSV format: "siteName1|link1|price1;siteName2|link2|price2"
const parseLinks = (linksString) => {
    if (!linksString || linksString.trim() === '') return [];
    
    try {
        // Try parsing as JSON first
        if (linksString.trim().startsWith('[') || linksString.trim().startsWith('{')) {
            const parsed = JSON.parse(linksString);
            if (Array.isArray(parsed)) {
                return parsed.map(link => ({
                    siteName: link.siteName || link.site_name || '',
                    link: link.link || link.url || '',
                    price: link.price ? parseFloat(link.price) : null
                }));
            }
        }
        
        // Parse pipe-separated format: "siteName|link|price;siteName2|link2|price2"
        const links = [];
        const linkGroups = linksString.split(';').filter(g => g.trim() !== '');
        
        linkGroups.forEach(group => {
            const parts = group.split('|').map(p => p.trim());
            if (parts.length >= 2) {
                links.push({
                    siteName: parts[0] || '',
                    link: parts[1] || '',
                    price: parts[2] ? parseFloat(parts[2]) : null
                });
            }
        });
        
        return links;
    } catch (error) {
        console.log(`Error parsing links: ${error.message}`);
        return [];
    }
};

// Get CSV template for special products bulk import
const getCSVTemplate = (req, res) => {
    try {
        // Create CSV headers
        const headers = [
            'name',
            'sku',
            'type',
            'specialCategory',
            'specialCategoryType', 
            'prices',
            'description',
            'image',
            'gallery',
            'links',
            'stock',
            'status',
            'isActive'
        ];

        // Create sample data row
        const sampleData = [
            'Sample Special Product',
            'SPECIAL-001',
            'supplies',
            'Electronics',
            'supplies',
            '100:80:90',
            'Sample special product description',
            '/uploads/special-products/sample-image.jpg',
            '/uploads/special-products/gallery1.jpg,/uploads/special-products/gallery2.jpg',
            'Amazon|https://amazon.com/product|99.99;eBay|https://ebay.com/product|89.99',
            '50',
            'active',
            'true'
        ];

        // Convert to proper CSV using csv-stringify
        const csvContent = stringify([headers, sampleData], {
            header: false,
            quoted: true
        });

        // Set response headers for CSV download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="special-product-import-template.csv"');
        res.setHeader('Content-Length', Buffer.byteLength(csvContent));

        // Send CSV content as a buffer
        res.end(Buffer.from(csvContent));

    } catch (error) {
        res.status(500).json({ 
            message: 'Error generating template', 
            error: error.message 
        });
    }
};

// Bulk import special products from CSV
const bulkImportSpecialProducts = async (req, res) => {
    try {
        if (!req.file || !req.file.path) {
            return res.status(400).json({ message: 'No CSV file uploaded (csvFile)' });
        }

        const csvFilePath = req.file.path;
        const results = [];
        const errors = [];
        let successCount = 0;
        let skippedCount = 0;

        // Read and parse CSV file
        await new Promise((resolve, reject) => {
            fs.createReadStream(csvFilePath)
                .pipe(csv())
                .on('data', (data) => results.push(data))
                .on('end', resolve)
                .on('error', reject);
        });

        // Process each row
        for (let i = 0; i < results.length; i++) {
            const row = results[i];
            const rowNumber = i + 2; // +2 because CSV header is row 1, and array is 0-indexed

            try {
                // Validate required fields
                if (!row.name || !row.sku || !row.type || !row.specialCategory) {
                    errors.push({
                        row: rowNumber,
                        error: 'Missing required fields: name, sku, type, or specialCategory',
                        data: row
                    });
                    skippedCount++;
                    continue;
                }

                // Check if SKU already exists
                const existingProduct = await SpecialProduct.findOne({ sku: row.sku });
                if (existingProduct) {
                    errors.push({
                        row: rowNumber,
                        error: `SKU already exists: ${row.sku}`,
                        data: row
                    });
                    skippedCount++;
                    continue;
                }

                // Find or create special category
                const categoryType = row.specialCategoryType || row.type || 'supplies';
                const specialCategoryId = await findOrCreateSpecialCategory(
                    row.specialCategory.trim(),
                    categoryType.trim()
                );

                if (!specialCategoryId) {
                    errors.push({
                        row: rowNumber,
                        error: `Failed to create/find category: ${row.specialCategory}`,
                        data: row
                    });
                    skippedCount++;
                    continue;
                }

                // Find or create special subcategory if provided
                let specialSubCategoryId = null;
                if (row.specialSubcategory) {
                    specialSubCategoryId = await findOrCreateSpecialSubCategory(
                        row.specialSubcategory.trim(),
                        specialCategoryId
                    );
                }

                // Parse prices: format "amount:buyPrice:salePrice" or just "amount"
                const prices = [];
                if (row.prices) {
                    const priceParts = row.prices.split(':').map(p => p.trim());
                    const amount = parseFloat(priceParts[0]) || 0;
                    const buyPrice = priceParts[1] ? parseFloat(priceParts[1]) : null;
                    const salePrice = priceParts[2] ? parseFloat(priceParts[2]) : null;

                    prices.push({
                        city: BASE_CITY,
                        amount: amount,
                        buyPrice: buyPrice,
                        salePrice: salePrice
                    });
                } else {
                    // Default price if not provided
                    prices.push({
                        city: BASE_CITY,
                        amount: 0
                    });
                }

                // Parse gallery images (comma-separated)
                const gallery = row.gallery 
                    ? row.gallery.split(',').map(img => img.trim()).filter(img => img !== '')
                    : [];

                // Parse links
                const links = parseLinks(row.links);

                // Generate variation ID if not provided
                const variationId = row.variationId || `VAR-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

                // Create special product
                const specialProduct = new SpecialProduct({
                    name: row.name.trim(),
                    sku: row.sku.trim(),
                    type: row.type.trim(),
                    unitSize: row.unitSize || null,
                    prices: prices,
                    description: row.description || '',
                    image: row.image || null,
                    gallery: gallery,
                    link: row.link || null,
                    links: links,
                    stock: row.stock ? parseInt(row.stock, 10) : 0,
                    specialCategory: specialCategoryId,
                    specialSubcategory: specialSubCategoryId,
                    level: row.level || null,
                    status: row.status || 'active',
                    isActive: row.isActive !== undefined ? row.isActive.toLowerCase() === 'true' : true,
                    variationId: variationId
                });

                await specialProduct.save();
                successCount++;

            } catch (error) {
                errors.push({
                    row: rowNumber,
                    error: error.message,
                    data: row
                });
                skippedCount++;
            }
        }

        // Clean up uploaded file
        if (fs.existsSync(csvFilePath)) {
            await deleteFile(csvFilePath);
        }

        res.status(200).json({
            message: 'Bulk import completed',
            success: successCount,
            skipped: skippedCount,
            total: results.length,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        // Clean up uploaded file if it exists
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            await deleteFile(req.file.path);
        }
        
        res.status(500).json({ 
            message: 'Error processing CSV file', 
            error: error.message 
        });
    }
};

module.exports = {
    createProduct,
    getAllProducts,
    searchSpecialProducts,
    getProductsByVariantGroup,
    getCategoryFiltersAndProducts,
    specialProductController,
    getProductById,
    updateProduct,
    deleteProduct,
    bulkDeleteProducts,
    getCSVTemplate,
    bulkImportSpecialProducts
};
