const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const Product = require('../models/product.model');
const Brand = require('../models/brand.model');
const { Category, SubCategory, SubSubCategory } = require('../models/productCategory.model');
const City = require('../models/city.model');
const ProductVariant = require('../models/productVarriant.model');
const VariantName = require('../models/variantName.model');
const Tag = require('../models/tag.model');
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

// Helper function to find or create tag
const findOrCreateTag = async (tagName) => {
  try {
    let tag = await Tag.findOne({ name: tagName });
    if (!tag) {
      tag = await Tag.create({ name: tagName });
    }
    return tag._id;
  } catch (error) {
    // If tag creation fails (e.g., duplicate), return null to skip
    console.log(`Skipping tag creation: ${error.message}`);
    return null;
  }
};

// Helper function to find or create brand
const findOrCreateBrand = async (brandName) => {
  try {
    let brand = await Brand.findOne({ name: brandName });
    if (!brand) {
      brand = await Brand.create({ name: brandName });
    }
    return brand._id;
  } catch (error) {
    // If brand creation fails (e.g., duplicate), return null to skip
    console.log(`Skipping brand creation: ${error.message}`);
    return null;
  }
};

// Helper function to find or create category
const findOrCreateCategory = async (categoryName) => {
  try {
    let category = await Category.findOne({ name: categoryName });
    if (!category) {
      category = await Category.create({ name: categoryName });
    }
    return category._id;
  } catch (error) {
    // If category creation fails (e.g., duplicate), return null to skip
    console.log(`Skipping category creation: ${error.message}`);
    return null;
  }
};

// Helper function to find or create subcategory
const findOrCreateSubCategory = async (subCategoryName, parentCategoryId) => {
  try {
    let subCategory = await SubCategory.findOne({ 
      name: subCategoryName,
      parentCategory: parentCategoryId
    });
    if (!subCategory) {
      subCategory = await SubCategory.create({ 
        name: subCategoryName,
        parentCategory: parentCategoryId
      });
    }
    return subCategory._id;
  } catch (error) {
    // If subcategory creation fails (e.g., duplicate), return null to skip
    console.log(`Skipping subcategory creation: ${error.message}`);
    return null;
  }
};

// Helper function to find or create subsubcategory
const findOrCreateSubSubCategory = async (subSubCategoryName, parentSubCategoryId) => {
  try {
    let subSubCategory = await SubSubCategory.findOne({ 
      name: subSubCategoryName,
      parentSubCategory: parentSubCategoryId
    });
    if (!subSubCategory) {
      subSubCategory = await SubSubCategory.create({ 
        name: subSubCategoryName,
        parentSubCategory: parentSubCategoryId
      });
    }
    return subSubCategory._id;
  } catch (error) {
    // If subsubcategory creation fails (e.g., duplicate), return null to skip
    console.log(`Skipping subsubcategory creation: ${error.message}`);
    return null;
  }
};

// Helper function to find city
const findCity = async (cityName) => {
  try {
    const city = await City.findOne({ name: cityName });
    if (!city) {
      throw new Error(`City '${cityName}' not found`);
    }
    return city._id;
  } catch (error) {
    throw new Error(`Error finding city: ${error.message}`);
  }
};

// Parse CSV and import products
const importBulkProducts = async (req, res) => {
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
        if (!row.name || !row.sku) {
          errors.push({
            row: rowNumber,
            error: 'Name and SKU are required fields',
            data: row
          });
          errorCount++;
          continue;
        }

        // Check if product with this SKU already exists - skip if duplicate
        const existingProduct = await Product.findOne({ sku: row.sku });
        if (existingProduct) {
          // Skip duplicate product silently
          skippedCount++;
          continue;
        }

        // Process brand
        let brandId = null;
        if (row.brand) {
          brandId = await findOrCreateBrand(row.brand);
        }

        // Process categories
        const categories = [];
        if (row.category) {
          const categoryNames = row.category.split(',').map(cat => cat.trim());
          for (const categoryName of categoryNames) {
            if (categoryName) {
              const categoryId = await findOrCreateCategory(categoryName);
              if (categoryId) {
                categories.push(categoryId);
              }
              // If categoryId is null, skip silently (duplicate category)
            }
          }
        }

        // Process subcategories
        const subcategories = [];
        if (row.subcategory) {
          const subCategoryNames = row.subcategory.split(',').map(sub => sub.trim());
          for (const subCategoryName of subCategoryNames) {
            if (subCategoryName && categories.length > 0) {
              const subCategoryId = await findOrCreateSubCategory(subCategoryName, categories[0]);
              if (subCategoryId) {
                subcategories.push(subCategoryId);
              }
              // If subCategoryId is null, skip silently (duplicate subcategory)
            }
          }
        }

        // Process subsubcategories
        const subsubcategories = [];
        if (row.subsubcategory) {
          const subSubCategoryNames = row.subsubcategory.split(',').map(sub => sub.trim());
          for (const subSubCategoryName of subSubCategoryNames) {
            if (subSubCategoryName && subcategories.length > 0) {
              const subSubCategoryId = await findOrCreateSubSubCategory(subSubCategoryName, subcategories[0]);
              if (subSubCategoryId) {
                subsubcategories.push(subSubCategoryId);
              }
              // If subSubCategoryId is null, skip silently (duplicate subsubcategory)
            }
          }
        }

        // Process prices - simple format: "Amount:SalePrice" (using fixed city ID)
        const prices = [];
        if (row.prices) {
          const [amount, salePrice] = row.prices.split(':');
          if (amount) {
            prices.push({
              city: '67400e8a7b963a1282d218b5', // Fixed city ID
              amount: parseFloat(amount.trim()),
              salePrice: salePrice ? parseFloat(salePrice.trim()) : null
            });
          }
        }

        // Process variants - simple format: "VariantName:Value"
        const variants = [];
        if (row.variants) {
          const [variantName, variantValue] = row.variants.split(':');
          if (variantName && variantValue) {
            const variantId = await findOrCreateVariant(variantName.trim(), variantValue.trim());
            if (variantId) {
              variants.push(variantId);
            }
            // If variantId is null, skip silently (duplicate variant)
          }
        }

        // Process tags
        const tags = [];
        if (row.tags) {
          const tagNames = row.tags.split(',').map(tag => tag.trim());
          for (const tagName of tagNames) {
            if (tagName) {
              const tagId = await findOrCreateTag(tagName);
              if (tagId) {
                tags.push(tagId);
              }
              // If tagId is null, skip silently (duplicate tag)
            }
          }
        }

        // Generate variation ID if not provided
        const variationId = row.variationId || `VAR-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

        // Generate product URL from name if not provided
        const productUrl = row.product_url || row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        // Create product
        const product = new Product({
          name: row.name,
          brand: brandId,
          description: row.description || '',
          sku: row.sku,
          prices: prices,
          currency: row.currency || 'USD',
          category: categories,
          subcategory: subcategories,
          subsubcategory: subsubcategories,
          videoLink: row.videoLink || null,
          variants: variants,
          lifecycleStage: row.lifecycleStage || 'active',
          sku: row.sku,
          tags: tags,
          variationId: variationId,
          meta_title: row.meta_title || null,
          meta_description: row.meta_description || null,
          image_alt_text: row.image_alt_text || null,
          product_url: productUrl,
        });

        await product.save();
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
    // Create CSV content with proper handling of special characters
    const headers = [
      'name',
      'brand',
      'description',
      'sku',
      'prices',
      'currency',
      'category',
      'subcategory',
      'subsubcategory',
      'videoLink',
      'variants',
      'lifecycleStage',
      'tags',
      'variationId',
      'meta_title',
      'meta_description',
      'image_alt_text',
      'product_url'
    ];

    const sampleData = [
      ['Sample Product',
       'Sample Brand',
       'Sample product description',
       'SKU-001',
       '100:90',
       'USD',
       'Electronics,Accessories',
       'Mobile,Chargers',
       'iPhone,USB-C',
       'https://example.com/video.mp4',
       'Color:Red',
       'active',
       'electronics,mobile,premium',
       'VAR-001',
       'Sample Product - Best Quality',
       'High quality sample product',
       'Sample product image',
       'sample-product'
      ]
    ];

    // Convert to proper CSV using csv-stringify
    const csvContent = stringify([headers, ...sampleData], {
      header: false,
      quoted: true
    });

    // Set response headers for CSV download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="product-import-template.csv"');
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
  importBulkProducts,
  getCSVTemplate
};
