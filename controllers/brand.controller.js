const Brand = require('../models/brand.model');
const { deleteFile } = require('../config/fileOperations');
const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');
const { Parser } = require('json2csv');






// Create a new brand
const createBrand = async (req, res) => {
    try {
        const { name } = req.body;
        const logo = req.file ? `uploads/images/${req.file.filename}` : null; // Save original path

        // Check if the brand name is unique
        const existingBrand = await Brand.findOne({ name });
        if (existingBrand) {
            if (req.file) {
                deleteFile(path.join('uploads', 'images', req.file.filename)); // Adjust deletion path
            }
            return res.status(400).json({ message: 'Brand name already exists' });
        }

        // Check if the name is provided
        if (!name) {
            if (req.file) {
                deleteFile(path.join('uploads', 'images', req.file.filename)); // Adjust deletion path
            }
            return res.status(400).json({ message: 'Brand name is required' });
        }

        const brand = new Brand({ name, logo });
        await brand.save();

        res.status(201).json({ message: 'Brand created successfully', brand });
    } catch (error) {
        if (req.file) {
            deleteFile(path.join('uploads', 'images', req.file.filename)); // Adjust deletion path
        }
        res.status(400).json({ message: error.message });
    }
};

const downloadBrandsCsvTemplate = (req, res) => {
    const headers = 'name\n'; // Define the headers with just the 'name' column

    res.header('Content-Type', 'text/csv');
    res.attachment('brands_template.csv');
    res.send(headers); // Only send headers, no data rows
};


// Bulk upload brands
const bulkUploadBrands = async (req, res) => {
    // Validate file and type
    if (!req.file || path.extname(req.file.originalname) !== '.csv') {
        return res.status(400).json({ message: 'Please upload a valid CSV file.' });
    }

    const brandsToCreate = [];
    const existingBrands = new Set();
    let totalProcessed = 0;

    // Capitalize each word in brand name
    const capitalizeFirstLetter = (string) => {
        return string.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    };

    const generateUrlname = (content) => {
        return content
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '') // Remove special characters
            .replace(/\s+/g, '-')       // Replace spaces with hyphens
            .trim();
    };

    // Fetch all existing brand names
    const existingBrandDocs = await Brand.find({}, 'name');
    existingBrandDocs.forEach(brand => existingBrands.add(brand.name.toLowerCase().trim()));

    // Read CSV file and process data
    await new Promise((resolve, reject) => {
        fs.createReadStream(req.file.path)
            .pipe(csvParser())
            .on('data', (row) => {
                const name = row.name ? row.name.trim().toLowerCase() : '';

                if (name) {
                    totalProcessed++;
                    if (!existingBrands.has(name)) {
                        const capitalizedName = capitalizeFirstLetter(row.name.trim());
                        brandsToCreate.push({
                            name: capitalizedName,
                            urlName: generateUrlname(capitalizedName), // <--- Add URL name generation here
                        });
                        existingBrands.add(name);
                    }
                }
            })
            .on('end', resolve)
            .on('error', reject);
    });

    try {
        // Insert new brands
        const createdBrands = await Brand.insertMany(brandsToCreate, { ordered: false });

        // Delete the uploaded CSV file
        deleteFile(req.file.path);

        res.status(200).json({ 
            message: 'Bulk upload completed successfully.', 
            created: createdBrands.length,
            skipped: totalProcessed - createdBrands.length
        });
    } catch (error) {
        console.error('Bulk upload error:', error);
        deleteFile(req.file.path);
        res.status(500).json({ message: 'Bulk upload failed.', error: error.message });
    }
};

// Get all brands
const getAllBrands = async (req, res) => {
  try {
    const brands = await Brand.find();
    res.status(200).json(brands);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get a brand by ID
const getBrandById = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) {
      return res.status(404).json({ message: 'Brand not found' });
    }
    res.status(200).json(brand);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getBrandsSorted = async (req, res) => {
    try {
        // Fetch all brands
        const brands = await Brand.find().sort({ name: 1 }); // Sort brands A-Z based on name

        // Group brands by their first letter
        const groupedBrands = [];
        
        brands.reduce((acc, brand) => {
            const firstLetter = brand.name.charAt(0).toUpperCase(); // Get first letter of brand name

            let group = acc.find(group => group.name === firstLetter);
            if (!group) {
                group = { name: firstLetter, brand: [] };
                acc.push(group);
            }

            group.brand.push({
                _id: brand._id,
                name: brand.name,
                img: brand.logo // Assuming logo is stored as the image URL
            });

            return acc;
        }, groupedBrands);

        res.status(200).json(groupedBrands);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// Update a brand
const updateBrand = async (req, res) => {
    let oldLogoPath; // To hold the old logo path
    try {
        const { name } = req.body;
        const logo = req.file ? `uploads/images/${req.file.filename}` : null; // Save new logo path

        const brand = await Brand.findById(req.params.id);
        if (!brand) {
            if (req.file) {
                await deleteFile(path.join('uploads', 'images', req.file.filename)); // Adjust deletion path
            }
            return res.status(404).json({ message: 'Brand not found' });
        }

        // Check if the brand name is unique (excluding the current brand)
        const existingBrand = await Brand.findOne({ name, _id: { $ne: req.params.id } });
        if (existingBrand) {
            if (req.file) {
                await deleteFile(path.join('uploads', 'images', req.file.filename)); // Adjust deletion path
            }
            return res.status(400).json({ message: 'Brand name already exists' });
        }

        // Update the brand fields
        if (name) brand.name = name;
        if (logo) {
            oldLogoPath = brand.logo; // Store the old logo path
            brand.logo = logo; // Assign new logo path
        }

        // Save the updated brand
        await brand.save();

        // Delete the old logo file if it exists
        if (oldLogoPath) {
            fs.unlink(path.join(__dirname, '..', oldLogoPath), (err) => {
                if (err) {
                    console.error(`Failed to delete old logo: ${oldLogoPath}`, err);
                } else {
                    //console.log(`Deleted old logo: ${oldLogoPath}`);
                }
            });
        }

        res.status(200).json({ message: 'Brand updated successfully', brand });
    } catch (error) {
        // Rollback: delete the newly uploaded logo if there's an error
        if (req.file) {
            await deleteFile(path.join('uploads', 'images', req.file.filename)); // Adjust deletion path
        }
        res.status(400).json({ message: error.message });
    }
};

// Delete a brand
const deleteBrand = async (req, res) => {
    try {
        const brand = await Brand.findById(req.params.id);
        if (!brand) {
            return res.status(404).json({ message: 'Brand not found' });
        }

        // Check if logo exists and delete it
        if (brand.logo) {
            const logoPath = path.join(__dirname, '..', brand.logo); // Ensure correct path
            await deleteFile(logoPath); // Await the deleteFile promise to handle errors
        }

        // Use deleteOne instead of remove
        await Brand.deleteOne({ _id: req.params.id });
        res.status(200).json({ message: 'Brand deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const bulkDeleteBrands = async (req, res) => {
    try {
        const { ids } = req.body; // Array of brand IDs

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: 'No brand IDs provided' });
        }

        // Find brands with the given IDs
        const brands = await Brand.find({ _id: { $in: ids } });

        if (brands.length === 0) {
            return res.status(404).json({ message: 'No brands found to delete' });
        }

        // Delete brand logos if they exist
        for (const brand of brands) {
            if (brand.logo) {
                const logoPath = path.join(__dirname, '..', brand.logo);
                try {
                    await deleteFile(logoPath);
                } catch (error) {
                    console.log(`Logo not found: ${logoPath}`);
                }
            }
        }

        // Delete the brands
        const result = await Brand.deleteMany({ _id: { $in: ids } });

        res.status(200).json({ message: `${result.deletedCount} brands deleted successfully` });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const downloadBrandsData = async (req, res) => {
    try {
        const brands = await Brand.find()
            .select('name')
            .lean();

        const fields = ['name'];
        const json2csvParser = new Parser({ fields });

        const csvData = brands.map(brand => ({
            name: brand.name
        }));

        const csv = json2csvParser.parse(csvData);

        res.header('Content-Type', 'text/csv');
        res.attachment('brands_data.csv');
        res.send(csv);

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


module.exports = {
  createBrand,
  getAllBrands,
  getBrandById,
  updateBrand,
  deleteBrand,
  bulkDeleteBrands,
  bulkUploadBrands,
  downloadBrandsCsvTemplate,
  getBrandsSorted,
  downloadBrandsData
};
