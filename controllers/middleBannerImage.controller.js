const fs = require('fs');
const MiddleBannerImage = require('../models/middleBannerImage.model'); // Change model as per your structure
const path = require('path'); 

// Utility function to delete a file
const deleteFile = (filePath) => {
    fs.unlink(filePath, (err) => {
        if (err) {
            console.error(`Failed to delete file: ${filePath}`, err);
        }
    });
};

// Upload middle banner images
const uploadMiddleBannerImages = async (req, res) => {
    const imageFile = req.files && req.files.length > 0 ? req.files[0] : null;

    if (!imageFile) {
        return res.status(400).json({ message: 'Image is required' });
    }

    try {
        const { sortOrder, linkOne, linkTwo } = req.body;
        const bannerImage = new MiddleBannerImage({
            imageUrl: `uploads/images/slider/${imageFile.filename}`, // Adjust path as needed
            sortOrder: sortOrder || null,
            linkOne: linkOne || null,
            linkTwo: linkTwo || null
        });

        const savedBannerImage = await bannerImage.save();
        res.status(201).json({ message: 'Middle banner image uploaded successfully', bannerImage: savedBannerImage });
    } catch (error) {
        if (imageFile) {
            deleteFile(`uploads/images/slider/${imageFile.filename}`); // Update the file path for deletion
        }
        res.status(500).json({ error: error.message });
    }
};

// Get all middle banner images
const getMiddleBannerImages = async (req, res) => {
    try {
        const bannerImages = await MiddleBannerImage.find().sort({ sortOrder: 1, uploadedAt: -1 });
        res.status(200).json(bannerImages);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Update sortOrder of a specific middle banner image
const updateSortOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { sortOrder, linkOne, linkTwo } = req.body;

        if (typeof sortOrder !== 'number') {
            return res.status(400).json({ message: 'sortOrder must be a number' });
        }

        const updateData = {
            sortOrder,
            ...(linkOne !== undefined && { linkOne }),
            ...(linkTwo !== undefined && { linkTwo })
        };

        const updatedImage = await MiddleBannerImage.findByIdAndUpdate(
            id,
            updateData,
            { new: true }
        );

        if (!updatedImage) {
            return res.status(404).json({ message: 'Middle banner image not found' });
        }

        res.status(200).json({
            message: 'Middle banner image updated successfully',
            middleBannerImage: updatedImage
        });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};


// Delete a middle banner image
const deleteMiddleBannerImage = async (req, res) => {
    try {
        const bannerImage = await MiddleBannerImage.findById(req.params.id);
        if (!bannerImage) {
            return res.status(404).json({ error: 'Middle banner image not found' });
        }

        // Delete the associated image file
        if (bannerImage.imageUrl) {
            deleteFile(`uploads/images/slider/${path.basename(bannerImage.imageUrl)}`); // Update the file path
        }

        await MiddleBannerImage.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Middle banner image successfully deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    uploadMiddleBannerImages,
    getMiddleBannerImages,
    deleteMiddleBannerImage,
    updateSortOrder
};
