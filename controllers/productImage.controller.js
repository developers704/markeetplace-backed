const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const ProductImage = require('../models/productImage.model');
const Product = require('../models/product.model');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/images/products/');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });

const bulkUploadImages = async (req, res) => {
    try {
        const uploadedFiles = req.files;
        const results = [];
        let skippedCount = 0;  // To track how many images were skipped due to duplication

        for (const file of uploadedFiles) {
            const sku = path.parse(file.originalname).name;
            const imageUrl = `/uploads/images/products/${file.filename}`;

            // Check for an existing ProductImage entry
            let productImage = await ProductImage.findOne({ sku });

            if (!productImage) {
                // Determine status based on whether the product exists
                const product = await Product.findOne({ sku });
                const status = product ? 'attached' : 'unattached';
                
                // Create a new ProductImage entry
                productImage = new ProductImage({ sku, imageUrl, status });
                await productImage.save();
                
                // Link image to product if found
                if (product) {
                    product.image = imageUrl;
                    await product.save();
                }
                results.push({ sku, status, imageUrl });
                
            } else {
                // If the image is already uploaded, increment skippedCount
                skippedCount++;
                results.push({ sku, status: 'duplicate', imageUrl: productImage.imageUrl });
            }
        }

        // Return the results with a skipped count
        res.status(200).json({
            message: 'Bulk upload completed',
            successfullyUploaded: results.filter(item => item.status !== 'duplicate').length,
            skipped: skippedCount,  // Number of skipped (duplicate) images
            results
        });
    } catch (error) {
        res.status(500).json({ message: 'Error uploading images', error: error.message });
    }
};



const getAllImages = async (req, res) => {
    try {
        const images = await ProductImage.find();
        res.status(200).json(images);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching images', error: error.message });
    }
};

const bulkDeleteImages = async (req, res) => {
    try {
        const { skus } = req.body;
        const results = [];

        for (const sku of skus) {
            const productImage = await ProductImage.findOne({ sku });
            if (productImage) {
                const filePath = path.join('uploads/images/products/', path.basename(productImage.imageUrl));
                await fs.unlink(filePath);
                await ProductImage.deleteOne({ sku });

                const product = await Product.findOne({ sku });
                if (product && product.image) {
                    product.image = null;
                    await product.save();
                }
                results.push({ sku, status: 'deleted' });
            } else {
                results.push({ sku, status: 'not found' });
            }
        }

        res.status(200).json({ message: 'Bulk delete completed', results });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting images', error: error.message });
    }
};

const updateImage = async (req, res) => {
    try {
        const { sku } = req.params;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        let productImage = await ProductImage.findOne({ sku });
        if (!productImage) {
            return res.status(404).json({ message: 'Product image not found' });
        }

        // Determine the new image path and old image path
        const oldImagePath = path.join('uploads/images/products/', path.basename(productImage.imageUrl));
        const newImagePath = path.join('uploads/images/products/', `${sku}${path.extname(file.originalname)}`);

        // Rename the uploaded file to the new path
        await fs.rename(file.path, newImagePath);
        
        // Remove the old image if it is different from the new one
        if (oldImagePath !== newImagePath) {
            await fs.unlink(oldImagePath);
        }

        const newImageUrl = `/uploads/images/products/${sku}${path.extname(file.originalname)}`;
        productImage.imageUrl = newImageUrl;

        // Update the status: 'attached' if the product is linked
        const product = await Product.findOne({ sku });
        const status = product ? 'attached' : 'unattached';
        productImage.status = status;
        await productImage.save();

        // Update the product's image if found
        if (product) {
            product.image = newImageUrl;
            await product.save();
        }

        res.status(200).json({ message: 'Image updated successfully', productImage });
    } catch (error) {
        res.status(500).json({ message: 'Error updating image', error: error.message });
    }
};

const syncProductImages = async (req, res) => {
    try {
        const products = await Product.find();
        const results = [];

        for (const product of products) {
            // Check for a matching SKU in the ProductImage collection
            const productImage = await ProductImage.findOne({ sku: product.sku });

            if (productImage) {
                // If an image exists for this SKU, update the product's image URL
                product.image = productImage.imageUrl;
                await product.save();

                // Update the status of the productImage to 'attached'
                productImage.status = 'attached';
                await productImage.save();

                results.push({ sku: product.sku, status: 'image attached' });
            } else if (product.image) {
                // If no matching image exists, but the product has an image, clear it
                product.image = null;
                await product.save();
                results.push({ sku: product.sku, status: 'image removed' });
            }
        }

         // After syncing products, check each image to confirm if it's attached
         const allProductImages = await ProductImage.find();
         for (const productImage of allProductImages) {
             const matchingProduct = await Product.findOne({ sku: productImage.sku });
 
             if (!matchingProduct && productImage.status === 'attached') {
                 // If no product matches the SKU in productImage, set it to 'unattached'
                 productImage.status = 'unattached';
                 await productImage.save();
                 results.push({ sku: productImage.sku, status: 'image detached' });
             }
         }

        res.status(200).json({ message: 'Product images synchronized', results });
    } catch (error) {
        res.status(500).json({ message: 'Error synchronizing product images', error: error.message });
    }
};



module.exports = {
    bulkUploadImages: [upload.array('images'), bulkUploadImages],
    getAllImages,
    bulkDeleteImages,
    updateImage: [upload.single('image'), updateImage],
    syncProductImages
};
