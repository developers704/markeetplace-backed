const fs = require('fs');
const LoyaltyBannerImage = require('../models/loyaltyBannerImage.model'); // Change model as per your structure
const path = require('path'); 

// Utility function to delete a file
const deleteFile = (filePath) => {
    fs.unlink(filePath, (err) => {
        if (err) {
            console.error(`Failed to delete file: ${filePath}`, err);
        }
    });
};

// Upload loyalty banner images
const uploadLoyaltyBannerImages = async (req, res) => {
    const imageFile = req.files && req.files.length > 0 ? req.files[0] : null;

    if (!imageFile) {
        return res.status(400).json({ message: 'Image is required' });
    }

    try {
        const { sortOrder, link } = req.body;
        const bannerImage = new LoyaltyBannerImage({
            imageUrl: `uploads/images/slider/${imageFile.filename}`, // Adjust path as needed
            sortOrder: sortOrder || null,
            link: link || null
        });

        const savedBannerImage = await bannerImage.save();
        res.status(201).json({ message: 'Loyalty banner image uploaded successfully', bannerImage: savedBannerImage });
    } catch (error) {
        if (imageFile) {
            deleteFile(`uploads/images/slider/${imageFile.filename}`); // Update the file path for deletion
        }
        res.status(500).json({ error: error.message });
    }
};

// Get all loyalty banner images
const getLoyaltyBannerImages = async (req, res) => {
    try {
        const bannerImages = await LoyaltyBannerImage.find().sort({ sortOrder: 1, uploadedAt: -1 });
        res.status(200).json(bannerImages);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Update sortOrder of a specific loyalty banner image
const updateSortOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { sortOrder, link } = req.body;
        
        const updateData = {};
        if (typeof sortOrder === 'number') updateData.sortOrder = sortOrder;
        if (link !== undefined) updateData.link = link;

        const updatedImage = await LoyaltyBannerImage.findByIdAndUpdate(
            id,
            updateData,
            { new: true }
        );

        if (!updatedImage) {
            return res.status(404).json({ message: 'Loyalty banner image not found' });
        }

        res.status(200).json({
            message: 'Banner updated successfully',
            loyaltyBannerImage: updatedImage
        });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};


// Delete a loyalty banner image
const deleteLoyaltyBannerImage = async (req, res) => {
    try {
        const bannerImage = await LoyaltyBannerImage.findById(req.params.id);
        if (!bannerImage) {
            return res.status(404).json({ error: 'Loyalty banner image not found' });
        }

        // Delete the associated image file
        if (bannerImage.imageUrl) {
            deleteFile(`uploads/images/slider/${path.basename(bannerImage.imageUrl)}`); // Update the file path
        }

        await LoyaltyBannerImage.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Loyalty banner image successfully deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    uploadLoyaltyBannerImages,
    getLoyaltyBannerImages,
    deleteLoyaltyBannerImage,
    updateSortOrder
};
