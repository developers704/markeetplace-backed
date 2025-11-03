const SpecialProduct = require('../models/specialProduct.model');
const SpecialSubCategory = require('../models/specialSubcategory.model');
const specialCategory = require('../models/specialCategory.model');
const ProductVariant = require('../models/productVarriant.model');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

const createProduct = async (req, res) => {
    try {
        const productData = { ...req.body };
        console.log('Incoming product data:', productData);
        console.log('Product variants:', productData.productVariants);

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

// const getCategoryFiltersAndProducts = async (req, res) => {
//     try {
//         const { categoryId } = req.params;
//         const { size, gender, color, minPrice, maxPrice, offer } = req.query;

//         let query = { specialCategory: categoryId };
        
//         // Build variant filters
//         const variantFilters = [];
//         if (size) variantFilters.push({ 'productVariants': { $elemMatch: { variantName: 'Size', value: size } } });
//         if (gender) variantFilters.push({ 'productVariants': { $elemMatch: { variantName: 'Gender', value: gender } } });
//         if (color) variantFilters.push({ 'productVariants': { $elemMatch: { variantName: 'Color', value: color } } });
//         if (offer) variantFilters.push({ 'productVariants': { $elemMatch: { variantName: 'Offer', value: offer } } });

//         if (variantFilters.length > 0) {
//             query.$and = variantFilters;
//         }

//         // Price filter
//         if (minPrice || maxPrice) {
//             query['prices.amount'] = {};
//             if (minPrice) query['prices.amount'].$gte = Number(minPrice);
//             if (maxPrice) query['prices.amount'].$lte = Number(maxPrice);
//         }

//         const products = await SpecialProduct.find(query)
//             .populate('specialCategory')
//             .populate('specialSubcategory')
//             .populate('prices.city')
//             .populate({
//                 path: 'productVariants',
//                 populate: { path: 'variantName' }
//             });

//         // Get all unique filter values
//         const allProducts = await SpecialProduct.find({ specialCategory: categoryId });
//         const filters = {
//             size: [],
//             gender: [],
//             color: [],
//             offer: [],
//             priceRange: { min: Infinity, max: -Infinity }
//         };

//         allProducts.forEach(product => {
//             product.productVariants.forEach(variant => {
//                 if (!filters[variant.variantName.name.toLowerCase()].includes(variant.value)) {
//                     filters[variant.variantName.name.toLowerCase()].push(variant.value);
//                 }
//             });

//             product.prices.forEach(price => {
//                 filters.priceRange.min = Math.min(filters.priceRange.min, price.amount);
//                 filters.priceRange.max = Math.max(filters.priceRange.max, price.amount);
//             });
//         });

//         res.status(200).json({ filters, products });
//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };


// const getCategoryFiltersAndProducts = async (req, res) => {
//     try {
//         const { categoryId } = req.params;
//         const { minPrice, maxPrice, ...variantFilters } = req.query;

//         let query = { specialCategory: categoryId };
        
//         // Dynamic variant filters
//         Object.entries(variantFilters).forEach(([key, value]) => {
//             query[`productVariants`] = {
//                 $elemMatch: {
//                     'variantName.name': key,
//                     'value': value
//                 }
//             };
//         });

//         // Price filter
//         if (minPrice || maxPrice) {
//             query['prices.amount'] = {};
//             if (minPrice) query['prices.amount'].$gte = Number(minPrice);
//             if (maxPrice) query['prices.amount'].$lte = Number(maxPrice);
//         }

//         const products = await SpecialProduct.find(query)
//             .populate('specialCategory')
//             .populate('specialSubcategory')
//             .populate('prices.city')
//             .populate({
//                 path: 'productVariants',
//                 populate: { path: 'variantName' }
//             });

//         // Get all unique filter values
//         const allProducts = await SpecialProduct.find({ specialCategory: categoryId });
//         const filters = {
//             priceRange: { min: Infinity, max: -Infinity }
//         };

//         allProducts.forEach(product => {
//             product.productVariants.forEach(variant => {
//                 const variantName = variant.variantName.name;
//                 if (!filters[variantName]) {
//                     filters[variantName] = [];
//                 }
//                 if (!filters[variantName].includes(variant.value)) {
//                     filters[variantName].push(variant.value);
//                 }
//             });

//             product.prices.forEach(price => {
//                 filters.priceRange.min = Math.min(filters.priceRange.min, price.amount);
//                 filters.priceRange.max = Math.max(filters.priceRange.max, price.amount);
//             });
//         });

//         res.status(200).json({ filters, products });
//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };


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



// const getAllProducts = async (req, res) => {
//     try {
//         const products = await SpecialProduct.find()
//             .populate('specialCategory')
//             .populate('specialSubcategory')
//             .populate('prices.city')
//             .populate({
//                 path: 'productVariants',
//                 populate: {
//                     path: 'variantName'
//                 }
//             });
//         res.status(200).json(products);
//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };


// const getAllProducts = async (req, res) => {
//     try {
//         const products = await SpecialProduct.find()
//             .populate('specialCategory')
//             .populate('specialSubcategory')
//             .populate('prices.city')
//             .populate({
//                 path: 'productVariants',
//                 populate: {
//                     path: 'variantName'
//                 }
//             })
//             .populate({
//                 path: 'inventory',
//                 populate: {
//                     path: 'warehouse product'
//                 }
//             });
//         res.status(200).json(products);
//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };




// const getProductById = async (req, res) => {
//     try {
//         const product = await SpecialProduct.findById(req.params.id)
//             .populate('specialCategory')
//             .populate('specialSubcategory')
//             .populate('prices.city')
//             .populate({
//                 path: 'productVariants',
//                 populate: {
//                     path: 'variantName'
//                 }
//             });
//         if (!product) {
//             return res.status(404).json({ message: 'Product not found' });
//         }
//         res.status(200).json(product);
//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };


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

module.exports = {
    createProduct,
    getAllProducts,
    getProductsByVariantGroup,
    getCategoryFiltersAndProducts,
    specialProductController,
    getProductById,
    updateProduct,
    deleteProduct,
    bulkDeleteProducts
};
