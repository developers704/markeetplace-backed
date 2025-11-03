const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const SpecialProduct = require('../models/specialProduct.model');
const ProductVariant = require('../models/productVarriant.model');
const VariantName = require('../models/variantName.model');
const SpecialCategory = require('../models/specialCategory.model');
const SpecialSubCategory = require('../models/specialSubcategory.model');
const { deleteFile } = require('../config/fileOperations');
const { stringify } = require('csv-stringify/sync'); // Add this import at top

// Helper function to find or create variant
const findOrCreateVariant = async (variantName, variantValue) => {
  try {
    // First, find or create the variant name
    let variantNameDoc = await VariantName.findOne({ name: variantName });
    if (!variantNameDoc) {
      variantNameDoc = await VariantName.create({ name: variantName });
    }

    // Then, find or create the variant value
    let variant = await ProductVariant.findOne({ 
      variantName: variantNameDoc._id, 
      value: variantValue 
    });
    
    if (!variant) {
      variant = await ProductVariant.create({
        variantName: variantNameDoc._id,
        value: variantValue
      });
    }

    return variant._id;
  } catch (error) {
    // If variant creation fails (e.g., duplicate), return null to skip
    console.log(`Skipping variant creation: ${error.message}`);
    return null;
  }
};

// Helper function to find or create special category
const findOrCreateSpecialCategory = async (categoryName, categoryType = 'inventory') => {
  try {
    let category = await SpecialCategory.findOne({ name: categoryName });
    if (!category) {
      category = await SpecialCategory.create({ 
        name: categoryName,
        type: categoryType
      });
    }
    return category._id;
  } catch (error) {
    // If category creation fails (e.g., duplicate), return null to skip
    console.log(`Skipping special category creation: ${error.message}`);
    return null;
  }
};

// Helper function to find or create special subcategory
const findOrCreateSpecialSubCategory = async (subCategoryName, parentCategoryId) => {
  try {
    let subCategory = await SpecialSubCategory.findOne({ 
      name: subCategoryName,
      parentCategory: parentCategoryId
    });
    if (!subCategory) {
      subCategory = await SpecialSubCategory.create({ 
        name: subCategoryName,
        parentCategory: parentCategoryId
      });
    }
    return subCategory._id;
  } catch (error) {
    // If subcategory creation fails (e.g., duplicate), return null to skip
    console.log(`Skipping special subcategory creation: ${error.message}`);
    return null;
  }
};

// Parse CSV and import other products
const importBulkOtherProducts = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No CSV file uploaded' });
    }

    const csvFilePath = req.file.path;
    const results = [];
    const errors = [];
    let successCount = 0;
    let skippedCount = 0;

    // Read and parse CSV file
    await new Promise((resolve, reject) => {
      fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    // Process each row
    for (let i = 0; i < results.length; i++) {
      const row = results[i];
      const rowNumber = i + 2; // +2 because CSV header is row 1, and array is 0-indexed

      try {
        // Validate required fields
        if (!row.name || !row.sku || !row.type || !row.specialCategory) {
          errors.push({
            row: rowNumber,
            error: 'Name, SKU, type, and specialCategory are required fields',
            data: row
          });
          continue;
        }

        // Check if product with this SKU already exists - skip if duplicate
        const existingProduct = await SpecialProduct.findOne({ sku: row.sku });
        if (existingProduct) {
          // Skip duplicate product silently
          skippedCount++;
          continue;
        }

        // Process special category
        const specialCategoryId = await findOrCreateSpecialCategory(row.specialCategory, row.specialCategoryType || 'inventory');
        if (!specialCategoryId) {
          errors.push({
            row: rowNumber,
            error: 'Failed to create or find special category',
            data: row
          });
          continue;
        }

        // Process special subcategory
        let specialSubCategoryId = null;
        if (row.specialSubcategory) {
          specialSubCategoryId = await findOrCreateSpecialSubCategory(row.specialSubcategory, specialCategoryId);
        }

        // Process prices - simple format: "Amount:BuyPrice:SalePrice" (using fixed city ID)
        const prices = [];
        if (row.prices) {
          const [amount, buyPrice, salePrice] = row.prices.split(':');
          if (amount) {
            prices.push({
              city: '67400e8a7b963a1282d218b5', // Fixed city ID
              amount: parseFloat(amount.trim()),
              buyPrice: buyPrice ? parseFloat(buyPrice.trim()) : null,
              salePrice: salePrice ? parseFloat(salePrice.trim()) : null
            });
          }
        }

        // Process variants - simple format: "VariantName:Value"
        const variants = [];
        if (row.productVariants) {
          const [variantName, variantValue] = row.productVariants.split(':');
          if (variantName && variantValue) {
            const variantId = await findOrCreateVariant(variantName.trim(), variantValue.trim());
            if (variantId) {
              variants.push(variantId);
            }
            // If variantId is null, skip silently (duplicate variant)
          }
        }

        // Generate variation ID if not provided
        const variationId = row.variationId || `VAR-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

        // Create other product
        const otherProduct = new SpecialProduct({
          name: row.name,
          productVariants: variants,
          variationId: variationId,
          type: row.type,
          unitSize: row.unitSize || null,
          prices: prices,
          description: row.description || '',
          image: row.image || null,
          gallery: row.gallery ? row.gallery.split(',').map(img => img.trim()) : [],
          sku: row.sku,
          link: row.link || null,
          stock: row.stock ? parseInt(row.stock) : 0,
          specialCategory: specialCategoryId,
          specialSubcategory: specialSubCategoryId,
          level: row.level || null,
          status: row.status || 'active',
          isActive: row.isActive !== undefined ? row.isActive === 'true' : true
        });

        await otherProduct.save();
        successCount++;

      } catch (error) {
        errors.push({
          row: rowNumber,
          error: error.message,
          data: row
        });
      }
    }

    // Clean up uploaded file
    await deleteFile(csvFilePath);

    res.status(200).json({
      message: 'Bulk import completed',
      summary: {
        totalRows: results.length,
        successCount,
        skippedCount,
        errorCount: errors.length,
        successRate: `${((successCount / results.length) * 100).toFixed(2)}%`
      },
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    // Clean up uploaded file if it exists
    if (req.file && req.file.path) {
      await deleteFile(req.file.path);
    }
    
    res.status(500).json({ 
      message: 'Error processing CSV file', 
      error: error.message 
    });
  }
};

// Get CSV template
const getCSVTemplate = (req, res) => {
  try {
    // Create CSV headers
    const headers = [
      'name',
      'sku',
      'type',
      'specialCategory',
      'specialCategoryType', 
      'specialSubcategory',
      'unitSize',
      'prices',
      'description',
      'image',
      'gallery',
      'link',
      'stock',
      'level',
      'productVariants',
      'status',
      'isActive'
    ];

    // Create sample data row
    const sampleData = [
      'Sample Other Product',
      'OTHER-001',
      'supplies',
      'Electronics',
      'inventory',
      'Mobile Accessories',
      'Large',
      '100:80:90',
      'Sample other product description',
      'https://example.com/image.jpg',
      'image1.jpg,image2.jpg,image3.jpg',
      'https://example.com/product',
      '50',
      'Beginner',
      'Color:Red',
      'active',
      'true'
    ];

    // Convert to proper CSV using csv-stringify
    const csvContent = stringify([headers, sampleData], {
      header: false,
      quoted: true
    });

    // Set response headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="other-product-import-template.csv"');
    res.setHeader('Content-Length', Buffer.byteLength(csvContent));

    // Send CSV content as a buffer
    res.end(Buffer.from(csvContent));

  } catch (error) {
    res.status(500).json({ 
      message: 'Error generating template', 
      error: error.message 
    });
  }
};

module.exports = {
  importBulkOtherProducts,
  getCSVTemplate
};
