const fs = require('fs');
const MobileSlider = require('../models/mobileSlider.model');
const path = require('path');

// Utility function to delete a file
const deleteFile = (filePath) => {
    fs.unlink(filePath, (err) => {
        if (err) {
            console.error(`Failed to delete file: ${filePath}`, err);
        }
    });
};

// Upload mobile slider images
const uploadMobileSliderImages = async (req, res) => {
    const imageFile = req.files && req.files.length > 0 ? req.files[0] : null;

    if (!imageFile) {
        return res.status(400).json({ message: 'Image is required' });
    }

    try {
        const { sortOrder, link } = req.body;
        const mobileSliderImage = new MobileSlider({
            imageUrl: `uploads/images/slider/${imageFile.filename}`,
            sortOrder: sortOrder || null,
            link: link || null
        });

        const savedMobileSliderImage = await mobileSliderImage.save();
        res.status(201).json({ message: 'Mobile slider image uploaded successfully', mobileSliderImage: savedMobileSliderImage });
    } catch (error) {
        if (imageFile) {
            deleteFile(`uploads/images/slider/${imageFile.filename}`); // Update the file path for deletion
        }
        res.status(500).json({ error: error.message });
    }
};

// Get all mobile slider images
const getMobileSliderImages = async (req, res) => {
    try {
        const mobileSliderImages = await MobileSlider.find().sort({ sortOrder: 1, uploadedAt: -1 });
        res.status(200).json(mobileSliderImages);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Update sortOrder of a specific mobile slider image
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

        const updatedImage = await MobileSlider.findByIdAndUpdate(
            id,
            updateData,
            { new: true }
        );

        if (!updatedImage) {
            return res.status(404).json({ message: 'Mobile slider image not found' });
        }

        res.status(200).json({
            message: 'Mobile slider image updated successfully',
            mobileSliderImage: updatedImage
        });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};


// Delete a mobile slider image
const deleteMobileSliderImage = async (req, res) => {
    try {
        const mobileSliderImage = await MobileSlider.findById(req.params.id);
        if (!mobileSliderImage) {
            return res.status(404).json({ error: 'Mobile slider image not found' });
        }

        // Delete the associated image file
        if (mobileSliderImage.imageUrl) {
            deleteFile(`uploads/images/slider/${path.basename(mobileSliderImage.imageUrl)}`); // Update the file path
        }

        await MobileSlider.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Mobile slider image successfully deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    uploadMobileSliderImages,
    getMobileSliderImages,
    deleteMobileSliderImage,
    updateSortOrder
};
