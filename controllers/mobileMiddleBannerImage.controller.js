const fs = require('fs');
const MobileMiddleBannerImage = require('../models/mobileMiddleBannerImage.model');
const path = require('path'); 

const deleteFile = (filePath) => {
    fs.unlink(filePath, (err) => {
        if (err) {
            console.error(`Failed to delete file: ${filePath}`, err);
        }
    });
};

const uploadMobileMiddleBannerImages = async (req, res) => {
    const imageFile = req.files && req.files.length > 0 ? req.files[0] : null;

    if (!imageFile) {
        return res.status(400).json({ message: 'Image is required' });
    }

    try {
        const { sortOrder, linkOne, linkTwo } = req.body;
        const bannerImage = new MobileMiddleBannerImage({
            imageUrl: `uploads/images/slider/${imageFile.filename}`,
            sortOrder: sortOrder || null,
            linkOne: linkOne || null,
            linkTwo: linkTwo || null
        });

        const savedBannerImage = await bannerImage.save();
        res.status(201).json({ message: 'Mobile middle banner image uploaded successfully', bannerImage: savedBannerImage });
    } catch (error) {
        if (imageFile) {
            deleteFile(`uploads/images/slider/${imageFile.filename}`);
        }
        res.status(500).json({ error: error.message });
    }
};

const getMobileMiddleBannerImages = async (req, res) => {
    try {
        const bannerImages = await MobileMiddleBannerImage.find().sort({ sortOrder: 1, uploadedAt: -1 });
        res.status(200).json(bannerImages);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

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

        const updatedImage = await MobileMiddleBannerImage.findByIdAndUpdate(
            id,
            updateData,
            { new: true }
        );

        if (!updatedImage) {
            return res.status(404).json({ message: 'Mobile middle banner image not found' });
        }

        res.status(200).json({
            message: 'Mobile middle banner image updated successfully',
            mobileMiddleBannerImage: updatedImage
        });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};

const deleteMobileMiddleBannerImage = async (req, res) => {
    try {
        const bannerImage = await MobileMiddleBannerImage.findById(req.params.id);
        if (!bannerImage) {
            return res.status(404).json({ error: 'Mobile middle banner image not found' });
        }

        if (bannerImage.imageUrl) {
            deleteFile(`uploads/images/slider/${path.basename(bannerImage.imageUrl)}`);
        }

        await MobileMiddleBannerImage.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Mobile middle banner image successfully deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    uploadMobileMiddleBannerImages,
    getMobileMiddleBannerImages,
    deleteMobileMiddleBannerImage,
    updateSortOrder
};
