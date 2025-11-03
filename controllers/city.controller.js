const City = require('../models/city.model');
const fss = require('fs');
const path = require('path');
const csvParser = require('csv-parser');
const { deleteFile } = require('../config/fileOperations');


// Create a city
const createCity = async (req, res) => {
    try {
        // Helper function to capitalize the first letter of each word
        const capitalizeFirstLetter = (string) => {
            return string.split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
        };

        // Capitalize the city name
        const name = capitalizeFirstLetter(req.body.name.trim());

        // Check for duplicates
        const existingCity = await City.findOne({ name });
        if (existingCity) {
            return res.status(400).json({ message: 'City already exists' });
        }

        // Create the new city
        const city = new City({ name });
        await city.save();

        res.status(201).json({ message: 'City created successfully', city });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// Get all cities
const getCities = async (req, res) => {
    try {
        const cities = await City.find({});
        res.status(200).json(cities);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Helper function to capitalize each word in a name
const capitalizeFirstLetter = (string) => {
    return string.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
};

// Bulk upload Cities
const bulkUploadCities = async (req, res) => {
    if (!req.file || path.extname(req.file.originalname) !== '.csv') {
        return res.status(400).json({ message: 'Please upload a valid CSV file.' });
    }

    const citiesToCreate = [];
    const existingCities = new Set();
    let totalProcessed = 0;

    // Fetch existing city names to avoid duplicates
    const existingCitiesData = await City.find({}, 'name');
    existingCitiesData.forEach(city => existingCities.add(city.name.toLowerCase().trim()));

    await new Promise((resolve, reject) => {
        fss.createReadStream(req.file.path)
            .pipe(csvParser())
            .on('data', (row) => {
                const name = row.name ? row.name.trim().toLowerCase() : '';
                if (name) {
                    totalProcessed++;
                    if (!existingCities.has(name)) {
                        const capitalizedName = capitalizeFirstLetter(row.name.trim());
                        citiesToCreate.push({ name: capitalizedName });
                        existingCities.add(name);
                    }
                }
            })
            .on('end', resolve)
            .on('error', reject);
    });

    try {
        const createdCities = await City.insertMany(citiesToCreate, { ordered: false });
        
        deleteFile(req.file.path);

        res.status(200).json({
            message: 'Bulk upload of cities completed successfully.',
            created: createdCities.length,
            skipped: totalProcessed - createdCities.length
        });
    } catch (error) {
        deleteFile(req.file.path);
        res.status(500).json({ message: 'Bulk upload of cities failed.', error: error.message });
    }
};

// Bulk delete cities
const bulkDeleteCities = async (req, res) => {
    try {
        const { ids } = req.body;
        await City.deleteMany({ _id: { $in: ids } });
        res.status(200).json({ message: 'Bulk delete successful' });
    } catch (error) {
        res.status(500).json({ message: 'Bulk delete failed', error: error.message });
    }
};

module.exports = {
    createCity,
    getCities,
    bulkUploadCities,
    bulkDeleteCities
};
