const ShowcasedProduct = require('../models/showcasedProduct.model');
const { deleteFile } = require('../config/fileOperations');
const Product = require('../models/product.model'); 

const createShowcasedProduct = async (req, res) => {
    let image; // Declare image variable outside the try block
    try {
        const { product, description } = req.body;

        // Check if an image is uploaded
        if (req.files && req.files.image) {
            image = req.files.image[0].path;
        }

        // Check if the product exists
        const existingProduct = await Product.findById(product);
        if (!existingProduct) {
            if (image) {
                deleteFile(image); // Delete the uploaded image if product not found
            }
            return res.status(404).json({ message: 'Product not found' });
        }

        // Validate input data
        if (!description || !description.trim()) {
            if (image) {
                deleteFile(image); // Delete the uploaded image if description is missing
            }
            return res.status(400).json({ message: 'Description is required' });
        }
        if (!image) {
            return res.status(400).json({ message: 'Image is required' });
        }

        const showcasedProduct = new ShowcasedProduct({ product, description, image });
        await showcasedProduct.save();

        res.status(201).json({ message: 'Showcased product created successfully', showcasedProduct });
    } catch (error) {
        if (image) {
            deleteFile(image); // Delete the image if an error occurs during the operation
        }
        res.status(400).json({ message: error.message });
    }
};


const updateShowcasedProduct = async (req, res) => {
    let newImage; // Variable to hold the new image path
    try {
        const { id } = req.params;
        const { product, description } = req.body;

        const showcasedProduct = await ShowcasedProduct.findById(id);
        if (!showcasedProduct) {
            // Delete new image if it was uploaded before the error
            if (req.files && req.files.image) {
                newImage = req.files.image[0].path;
                deleteFile(newImage);
            }
            return res.status(404).json({ message: 'Showcased product not found' });
        }

        // Only validate product ID if it’s provided
        if (product) {
            const existingProduct = await Product.findById(product);
            if (!existingProduct) {
                // Delete new image if it was uploaded before the error
                if (req.files && req.files.image) {
                    newImage = req.files.image[0].path;
                    deleteFile(newImage);
                }
                return res.status(404).json({ message: 'Product not found' });
            }
            showcasedProduct.product = product; // Update the product ID
        }

        // Update description if provided
        if (description) {
            showcasedProduct.description = description.trim();
        }

        // Handle image upload if a new image is provided
        if (req.files && req.files.image) {
            newImage = req.files.image[0].path; // Save the new image path

            // Delete the old image only if the new image is valid
            if (showcasedProduct.image) {
                deleteFile(showcasedProduct.image);
            }
            showcasedProduct.image = newImage; // Update to the new image
        }

        await showcasedProduct.save(); // Save the updated showcased product

        res.status(200).json({ message: 'Showcased product updated successfully', showcasedProduct });
    } catch (error) {
        // If any error occurs, delete the new image if it was uploaded
        if (newImage) {
            deleteFile(newImage);
        }
        res.status(400).json({ message: error.message });
    }
};





const getShowcasedProducts = async (req, res) => {
    try {
        const showcasedProducts = await ShowcasedProduct.find();
        res.status(200).json(showcasedProducts);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const deleteShowcasedProduct = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Find the product first
        const showcasedProduct = await ShowcasedProduct.findById(id);

        if (!showcasedProduct) {
            return res.status(404).json({ message: 'Showcased product not found' });
        }

        // Delete the associated image if it exists
        if (showcasedProduct.image) {
            deleteFile(showcasedProduct.image);
        }

        // Delete the showcased product
        await ShowcasedProduct.findByIdAndDelete(id);

        res.status(200).json({ message: 'Showcased product deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


module.exports = {
    createShowcasedProduct,
    updateShowcasedProduct,
    getShowcasedProducts,
    deleteShowcasedProduct
};
