const fs = require('fs');
const BannerImage = require('../models/bannerImage.model');
const path = require('path'); 

// Utility function to delete a file
const deleteFile = (filePath) => {
    fs.unlink(filePath, (err) => {
        if (err) {
            console.error(`Failed to delete file: ${filePath}`, err);
        }
    });
};

// Upload banner images
const uploadBannerImages = async (req, res) => {
    const imageFile = req.files && req.files.length > 0 ? req.files[0] : null;

    if (!imageFile) {
        return res.status(400).json({ message: 'Image is required' });
    }

    try {
        const { sortOrder, link } = req.body;
        const bannerImage = new BannerImage({
            imageUrl: `uploads/images/slider/${imageFile.filename}`,
            sortOrder: sortOrder || null,
            link: link || null
        });

        const savedBannerImage = await bannerImage.save();
        res.status(201).json({ message: 'Banner image uploaded successfully', bannerImage: savedBannerImage });
    } catch (error) {
        if (imageFile) {
            deleteFile(`uploads/images/slider/${imageFile.filename}`); // Update the file path for deletion
        }
        res.status(500).json({ error: error.message });
    }
};


// Get all banner images
const getBannerImages = async (req, res) => {
    try {
        const bannerImages = await BannerImage.find().sort({ sortOrder: 1, uploadedAt: -1 });
        res.status(200).json(bannerImages);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Update sortOrder of a specific banner image
const updateSortOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { sortOrder, link } = req.body;

        if (typeof sortOrder !== 'number') {
            return res.status(400).json({ message: 'sortOrder must be a number' });
        }

        const updateData = {
            sortOrder,
            ...(link !== undefined && { link })
        };

        const updatedImage = await BannerImage.findByIdAndUpdate(
            id,
            updateData,
            { new: true }
        );

        if (!updatedImage) {
            return res.status(404).json({ message: 'Banner image not found' });
        }

        res.status(200).json({
            message: 'Banner image updated successfully',
            bannerImage: updatedImage
        });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};


// Delete a banner image
const deleteBannerImage = async (req, res) => {
    try {
        const bannerImage = await BannerImage.findById(req.params.id);
        if (!bannerImage) {
            return res.status(404).json({ error: 'Banner image not found' });
        }

        // Delete the associated image file
        if (bannerImage.imageUrl) {
            deleteFile(`uploads/images/slider/${path.basename(bannerImage.imageUrl)}`); // Update the file path
        }

        await BannerImage.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Banner image successfully deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


module.exports = {
    uploadBannerImages,
    getBannerImages,
    deleteBannerImage,
    updateSortOrder
};
