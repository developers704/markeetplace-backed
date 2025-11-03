// controllers/bundle.controller.js
const Bundle = require('../models/bundle.model');
const Product = require('../models/product.model');
const { deleteFile } = require('../config/fileOperations');
const path = require('path');
const fs = require('fs');
const Inventory = require('../models/inventory.model');

const calculateDiscountedPrice = (price, discountPercentage) => {
    if (discountPercentage > 0) {
        return price.amount - (price.amount * (discountPercentage / 100));
    }
    return null; // Return null if no discount
};

const calculateTotalPrice = async (products) => {
    let totalPrice = 0;
    for (const productItem of products) {
        const product = await Product.findById(productItem.product);
        if (product) {
            totalPrice += product.price.amount * productItem.quantity;
        }
    }
    return totalPrice;
};

const saveImageToDisk = async (file) => {
    const fileName = Date.now() + path.extname(file.originalname);
    const filePath = path.join('uploads/images/bundles', fileName);

    await fs.promises.writeFile(filePath, file.buffer);
    return { filename: fileName, filePath };
};

const createBundle = async (req, res) => {
    let savedImage = null;
    try {
        const { name, description, products, discountPercentage, currency } = req.body;

        if (!name || !products ) {
            return res.status(400).json({ message: 'Name and products are required' });
        }

        if (!Array.isArray(products) || products.length < 2) {
            return res.status(400).json({ message: 'At least two products are required for a bundle' });
        }

        // Validate products
        const validatedProducts = [];
        for (const productItem of products) {
            const product = await Product.findById(productItem.product);
            if (!product) {
                return res.status(400).json({ message: `One or more selected products are not available. Please check your selection and try again.` });
            }
            validatedProducts.push({
                product: product._id,
                quantity: productItem.quantity || 1
            });
        }

        if (discountPercentage && (discountPercentage < 0 || discountPercentage > 100)) {
            return res.status(400).json({ message: 'Discount percentage must be between 0 and 100' });
        }

        // Calculate the total price of the bundle
        let totalPrice = await calculateTotalPrice(validatedProducts);

        // Save image if available
        if (req.file) {
            const savedImageResult = await saveImageToDisk(req.file);
            savedImage = savedImageResult.filename;
        }

        // Use provided currency or default to USD
        const bundleCurrency = currency || 'PKR';

        const bundle = new Bundle({
            name,
            description,
            products: validatedProducts,
            price: { amount: totalPrice, currency: bundleCurrency },  // Automatically setting the total price with currency
            discountPercentage,
            image: savedImage
        });

        await bundle.save();
        res.status(201).json(bundle);
    } catch (error) {
        if (savedImage) {
            await deleteFile(path.join('uploads/images/bundles', savedImage));
        }
        res.status(400).json({ message: error.message });
    }
};

const getAllBundles = async (req, res) => {
    try {
        const bundles = await Bundle.find().populate('products.product');

        // Check inventory for each bundle
        const bundlesWithInventoryStatus = await Promise.all(
            bundles.map(async (bundle) => {
                let isOutOfStock = false;
                const bundleProducts = await Promise.all(
                    bundle.products.map(async (bundleProduct) => {
                        const inventory = await Inventory.findOne({ product: bundleProduct.product });
                        if (!inventory || inventory.quantity === 0) {
                            isOutOfStock = true;
                        }
                        return bundleProduct;
                    })
                );

                // Calculate discounted prices for each bundle
                const discountedPrice = bundle.discountPercentage > 0
                    ? calculateDiscountedPrice(bundle.price, bundle.discountPercentage)
                    : null;

                return {
                    ...bundle.toObject(),
                    products: bundleProducts,
                    discountedPrice,
                    isOutOfStock
                };
            })
        );

        res.status(200).json(bundlesWithInventoryStatus);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const getBundleById = async (req, res) => {
    try {
        const bundle = await Bundle.findById(req.params.id).populate('products.product');
        if (!bundle) {
            return res.status(404).json({ message: 'Bundle not found' });
        }

        // Check inventory for the bundle
        let isOutOfStock = false;
        const bundleProducts = await Promise.all(
            bundle.products.map(async (bundleProduct) => {
                const inventory = await Inventory.findOne({ product: bundleProduct.product });
                if (!inventory || inventory.quantity === 0) {
                    isOutOfStock = true;
                }
                return bundleProduct;
            })
        );

        // Calculate discounted price for the single bundle
        const discountedPrice = bundle.discountPercentage > 0
            ? calculateDiscountedPrice(bundle.price, bundle.discountPercentage)
            : null;

        const bundleWithInventoryStatus = {
            ...bundle.toObject(),
            products: bundleProducts,
            discountedPrice,
            isOutOfStock
        };

        res.status(200).json(bundleWithInventoryStatus);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const updateBundle = async (req, res) => {
    let savedImage = null;
    try {
        const { id } = req.params;
        const { name, description, products, discountPercentage, currency } = req.body;

        // Fetch the existing bundle
        const bundle = await Bundle.findById(id);
        if (!bundle) {
            return res.status(404).json({ message: 'Bundle not found' });
        }

        // Validate and update products
        if (products) {
            if (!Array.isArray(products) || products.length < 2) {
                return res.status(400).json({ message: 'At least two products are required for a bundle' });
            }
            const validatedProducts = [];
            for (const productItem of products) {
                const product = await Product.findById(productItem.product);
                if (!product) {
                    return res.status(400).json({ message: `One or more selected products are not available. Please check your selection and try again.` });
                }
                validatedProducts.push({
                    product: product._id,
                    quantity: productItem.quantity || 1
                });
            }
            bundle.products = validatedProducts;
        }

        // Update discountPercentage if provided
        if (discountPercentage !== undefined) {
            if (discountPercentage < 0 || discountPercentage > 100) {
                return res.status(400).json({ message: 'Discount percentage must be between 0 and 100' });
            }
            bundle.discountPercentage = discountPercentage;
        }

        // Handle image upload
        if (req.file) {
            // Save the new image
            const savedImageResult = await saveImageToDisk(req.file);
            savedImage = savedImageResult.filename;

            // Delete the old image if it exists
            if (bundle.image) {
                await deleteFile(path.join('uploads/images/bundles', bundle.image));
            }
            bundle.image = savedImage;
        }

        // Calculate the total price of the bundle
        const totalPrice = await calculateTotalPrice(bundle.products);

        // Use provided currency or default to USD
        const bundleCurrency = currency || 'PKR';
        
        bundle.price = { amount: totalPrice, currency: bundleCurrency };

        // Update other fields
        if (name) bundle.name = name;
        if (description) bundle.description = description;

        // Save the updated bundle
        await bundle.save();
        res.status(200).json(bundle);
    } catch (error) {
        // Handle any errors and clean up saved images if necessary
        if (savedImage) {
            await deleteFile(path.join('uploads/images/bundles', savedImage));
        }
        res.status(400).json({ message: error.message });
    }
};

const deleteBundle = async (req, res) => {
    try {
        const { id } = req.params;
        const bundle = await Bundle.findById(id);
        
        if (!bundle) {
            return res.status(404).json({ message: 'Bundle not found' });
        }

        // Check if the bundle has an image to delete
        if (bundle.image) {
            const imagePath = path.join('uploads', 'images', 'bundles', bundle.image);
            await deleteFile(imagePath); // Handle case where image file might not exist
        }

        await Bundle.findByIdAndDelete(id);
        res.status(200).json({ message: 'Bundle deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


module.exports = {
    createBundle,
    getAllBundles,
    getBundleById,
    updateBundle,
    deleteBundle
};