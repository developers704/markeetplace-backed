const Tag = require('../models/tag.model');
const fss = require('fs');
const path = require('path');
const csvParser = require('csv-parser');
const { deleteFile } = require('../config/fileOperations');


// Create a tag
const createTag = async (req, res) => {
    try {
        // Helper function to capitalize the first letter of each word
        const capitalizeFirstLetter = (string) => {
            return string.split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
        };

        // Capitalize the tag name
        const name = capitalizeFirstLetter(req.body.name.trim());

        // Check for duplicates
        const existingTag = await Tag.findOne({ name });
        if (existingTag) {
            return res.status(400).json({ message: 'Tag already exists' });
        }

        // Create the new tag
        const tag = new Tag({ name });
        await tag.save();

        res.status(201).json({ message: 'Tag created successfully', tag });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// Get all tags
const getTags = async (req, res) => {
    try {
        const tags = await Tag.find({});
        res.status(200).json(tags);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Helper function to capitalize each word in a name
const capitalizeFirstLetter = (string) => {
    return string.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
};

// Bulk upload Tags
const bulkUploadTags = async (req, res) => {
    if (!req.file || path.extname(req.file.originalname) !== '.csv') {
        return res.status(400).json({ message: 'Please upload a valid CSV file.' });
    }

    const tagsToCreate = [];
    const existingTags = new Set();
    let totalProcessed = 0;

    // Fetch existing tag names to avoid duplicates
    const existingTagsData = await Tag.find({}, 'name');
    existingTagsData.forEach(tag => existingTags.add(tag.name.toLowerCase().trim()));

    await new Promise((resolve, reject) => {
        fss.createReadStream(req.file.path)
            .pipe(csvParser())
            .on('data', (row) => {
                const name = row.name ? row.name.trim().toLowerCase() : '';
                if (name) {
                    totalProcessed++;
                    if (!existingTags.has(name)) {
                        const capitalizedName = capitalizeFirstLetter(row.name.trim());
                        tagsToCreate.push({ name: capitalizedName });
                        existingTags.add(name);
                    }
                }
            })
            .on('end', resolve)
            .on('error', reject);
    });

    try {
        const createdTags = await Tag.insertMany(tagsToCreate, { ordered: false });
        
        deleteFile(req.file.path);

        res.status(200).json({
            message: 'Bulk upload of tags completed successfully.',
            created: createdTags.length,
            skipped: totalProcessed - createdTags.length
        });
    } catch (error) {
        deleteFile(req.file.path);
        res.status(500).json({ message: 'Bulk upload of tags failed.', error: error.message });
    }
};


// Bulk delete tags
const bulkDeleteTags = async (req, res) => {
    try {
        const { ids } = req.body;
        await Tag.deleteMany({ _id: { $in: ids } });
        res.status(200).json({ message: 'Bulk delete successful' });
    } catch (error) {
        res.status(500).json({ message: 'Bulk delete failed', error: error.message });
    }
};

module.exports = {
    createTag,
    getTags,
    bulkUploadTags,
    bulkDeleteTags
};
