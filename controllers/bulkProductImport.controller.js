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
const { Parser } = require('json2csv');

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


// const importBulkProducts = async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ message: 'No CSV file uploaded' });
//     }

//     const csvFilePath = req.file.path;
//     const results = [];
//     const errors = [];
//     let successCount = 0;
//     let skippedCount = 0;

//     // Read and parse CSV file
//     await new Promise((resolve, reject) => {
//       fs.createReadStream(csvFilePath)
//         .pipe(csv())
//         .on('data', (data) => results.push(data))
//         .on('end', resolve)
//         .on('error', reject);
//     });

//     // Process each row
//     for (let i = 0; i < results.length; i++) {
//       const row = results[i];
//       const rowNumber = i + 2; // +2 because CSV header is row 1, and array is 0-indexed

//       try {
//         // Validate required fields
//         if (!row.name || !row.sku) {
//           errors.push({
//             row: rowNumber,
//             error: 'Name and SKU are required fields',
//             data: row
//           });
//           errorCount++;
//           continue;
//         }

//         // Check if product with this SKU already exists - skip if duplicate
//         const existingProduct = await Product.findOne({ sku: row.sku });
//         if (existingProduct) {
//           // Skip duplicate product silently
//           skippedCount++;
//           continue;
//         }

//         // Process brand
//         let brandId = null;
//         if (row.brand) {
//           brandId = await findOrCreateBrand(row.brand);
//         }

//         // Process categories
//         const categories = [];
//         if (row.category) {
//           const categoryNames = row.category.split(',').map(cat => cat.trim());
//           for (const categoryName of categoryNames) {
//             if (categoryName) {
//               const categoryId = await findOrCreateCategory(categoryName);
//               if (categoryId) {
//                 categories.push(categoryId);
//               }
//               // If categoryId is null, skip silently (duplicate category)
//             }
//           }
//         }

//         // Process subcategories
//         const subcategories = [];
//         if (row.subcategory) {
//           const subCategoryNames = row.subcategory.split(',').map(sub => sub.trim());
//           for (const subCategoryName of subCategoryNames) {
//             if (subCategoryName && categories.length > 0) {
//               const subCategoryId = await findOrCreateSubCategory(subCategoryName, categories[0]);
//               if (subCategoryId) {
//                 subcategories.push(subCategoryId);
//               }
//               // If subCategoryId is null, skip silently (duplicate subcategory)
//             }
//           }
//         }

//         // Process subsubcategories
//         const subsubcategories = [];
//         if (row.subsubcategory) {
//           const subSubCategoryNames = row.subsubcategory.split(',').map(sub => sub.trim());
//           for (const subSubCategoryName of subSubCategoryNames) {
//             if (subSubCategoryName && subcategories.length > 0) {
//               const subSubCategoryId = await findOrCreateSubSubCategory(subSubCategoryName, subcategories[0]);
//               if (subSubCategoryId) {
//                 subsubcategories.push(subSubCategoryId);
//               }
//               // If subSubCategoryId is null, skip silently (duplicate subsubcategory)
//             }
//           }
//         }

//         // Process prices - simple format: "Amount:SalePrice" (using fixed city ID)
//         const prices = [];
//         if (row.prices) {
//           const [amount, salePrice] = row.prices.split(':');
//           if (amount) {
//             prices.push({
//               city: '67400e8a7b963a1282d218b5', // Fixed city ID
//               amount: parseFloat(amount.trim()),
//               salePrice: salePrice ? parseFloat(salePrice.trim()) : null
//             });
//           }
//         }

//         // Process variants - simple format: "VariantName:Value"
//         const variants = [];
//         if (row.variants) {
//           const [variantName, variantValue] = row.variants.split(':');
//           if (variantName && variantValue) {
//             const variantId = await findOrCreateVariant(variantName.trim(), variantValue.trim());
//             if (variantId) {
//               variants.push(variantId);
//             }
//             // If variantId is null, skip silently (duplicate variant)
//           }
//         }

//         // Process tags
//         const tags = [];
//         if (row.tags) {
//           const tagNames = row.tags.split(',').map(tag => tag.trim());
//           for (const tagName of tagNames) {
//             if (tagName) {
//               const tagId = await findOrCreateTag(tagName);
//               if (tagId) {
//                 tags.push(tagId);
//               }
//               // If tagId is null, skip silently (duplicate tag)
//             }
//           }
//         }

//         // Generate variation ID if not provided
//         const variationId = row.variationId || `VAR-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

//         // Generate product URL from name if not provided
//         const productUrl = row.product_url || row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

//         // Create product
//         const product = new Product({
//           name: row.name,
//           brand: brandId,
//           description: row.description || '',
//           sku: row.sku,
//           prices: prices,
//           currency: row.currency || 'USD',
//           category: categories,
//           subcategory: subcategories,
//           subsubcategory: subsubcategories,
//           videoLink: row.videoLink || null,
//           variants: variants,
//           lifecycleStage: row.lifecycleStage || 'active',
//           sku: row.sku,
//           tags: tags,
//           variationId: variationId,
//           meta_title: row.meta_title || null,
//           meta_description: row.meta_description || null,
//           image_alt_text: row.image_alt_text || null,
//           product_url: productUrl,
//         });

//         await product.save();
//         successCount++;

//       } catch (error) {
//         errors.push({
//           row: rowNumber,
//           error: error.message,
//           data: row
//         });
//       }
//     }

//     // Clean up uploaded file
//     await deleteFile(csvFilePath);

//     res.status(200).json({
//       message: 'Bulk import completed',
//       summary: {
//         totalRows: results.length,
//         successCount,
//         skippedCount,
//         errorCount: errors.length,
//         successRate: `${((successCount / results.length) * 100).toFixed(2)}%`
//       },
//       errors: errors.length > 0 ? errors : undefined
//     });

//   } catch (error) {
//     // Clean up uploaded file if it exists
//     if (req.file && req.file.path) {
//       await deleteFile(req.file.path);
//     }
    
//     res.status(500).json({ 
//       message: 'Error processing CSV file', 
//       error: error.message 
//     });
//   }
// };
function transformJewelmanteCSV(rows) {
  const grouped = {};

  for (const r of rows) {
    const sku = r.sku?.trim();
    if (!sku) continue;

    if (!grouped[sku]) {
      grouped[sku] = {
        name: r.name || "",
        sku: r.sku,
        brand: r.brand || "",
        image: r.image || "",
        product_url: r.product_url || "",
        gallery: r.gallery || "",
        category: r.category || "",
        subcategory: r.subcategory || "",
        subsubcategory: r.subsubcategory || "",
        tags: r.tags || "",
        prices: r.prices || "",
        lifecycleStage: r.lifecycleStage || "",
        description: r.description || "",
        meta_title: r.meta_title || "",
        meta_description: r.meta_description || "",
        videoLink: r.videoLink || "",
        variantsCombined: []
      };
    }

    // Add variant name:value
    if (r.variants && r.variantvalue) {
      grouped[sku].variantsCombined.push(`${r.variants}:${r.variantvalue}`);
    }
  }

  return Object.values(grouped).map((p) => {
    return {
      ...p,
      variants: p.variantsCombined.join(","),
    };
  });
}

const importBulkProducts = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No CSV file uploaded" });
    }

    const csvFilePath = req.file.path;
    const results = [];
    const errors = [];
    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // 🔥 Convert JOULEMATE format → our single-row format
    
    // Read & parse CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", resolve)
      .on("error", reject);
    });

    const cleanRows = transformJewelmanteCSV(results);
    
    for (let i = 0; i < cleanRows.length; i++) {
      const row = cleanRows[i];
      const rowNumber = i + 2;

      try {
        // CLEAN VALUES
        Object.keys(row).forEach((key) => {
          if (typeof row[key] === "string") {
            row[key] = row[key].trim();
          }
        });

        // Required fields
        if (!row.name || !row.sku) {
          errors.push({ row: rowNumber, error: "Name and SKU required", data: row });
          errorCount++;
          continue;
        }

        // Skip duplicates
        const existing = await Product.findOne({ sku: row.sku });
        if (existing) {
          skippedCount++;
          continue;
        }

        // Brand
        let brandId = null;
        if (row.brand) brandId = await findOrCreateBrand(row.brand);

        // Categories
        const categories = [];
        if (row.category) {
          for (const name of row.category.split(",").map((x) => x.trim())) {
            if (name) {
              const id = await findOrCreateCategory(name);
              if (id) categories.push(id);
            }
          }
        }

        // Subcategories (linked to all categories)
        const subcategories = [];
        if (row.subcategory) {
          const subs = row.subcategory.split(",").map((x) => x.trim());
          for (const sub of subs) {
            for (const cat of categories) {
              const id = await findOrCreateSubCategory(sub, cat);
              if (id) subcategories.push(id);
            }
          }
        }

        // Subsubcategories
        const subsubcategories = [];
        if (row.subsubcategory) {
          const subs = row.subsubcategory.split(",").map((x) => x.trim());
          for (const sub of subs) {
            for (const sc of subcategories) {
              const id = await findOrCreateSubSubCategory(sub, sc);
              if (id) subsubcategories.push(id);
            }
          }
        }

        let prices = [];
        if (row.prices) {
          const pricePairs = row.prices.split(",").map(p => p.trim());

          for (const p of pricePairs) {
            const [amount, salePrice] = p.split(":").map(x => parseFloat(x));
            if (amount) {
              prices.push({
                city: "67400e8a7b963a1282d218b5", // replace as needed
                amount,
                salePrice: salePrice || null,
              });
            }
          }
        }
   


        const variants = [];

        if (row.variants) {
          // Split multiple variants by comma
          const variantPairs = row.variants.split(",").map(v => v.trim());

          for (const pair of variantPairs) {
            if (!pair) continue;

            let name = null;
            let value = null;

            if (pair.includes(":")) {
              [name, value] = pair.split(":").map(x => x.trim());
            }

            if (name && value) {
              const id = await findOrCreateVariant(name, value);
              if (id) variants.push(id);
            }
          }
        }

        let gallery = [];
        if (row.gallery) {
          gallery = row.gallery.split(",").map(img => img.trim()).filter(Boolean);
        }
        let lifecycleStage = "active";

        if (row.lifecycleStage) {
          lifecycleStage = row.lifecycleStage.trim().toLowerCase();

          const allowedStages = ["active", "discontinued", "upcoming", "archived"];

          if (!allowedStages.includes(lifecycleStage)) {
            lifecycleStage = "active"; // fallback
          }
        }

        // Tags
        const tags = [];
        if (row.tags) {
          for (const t of row?.tags.split(",").map((x) => x.trim())) {
            const id = await findOrCreateTag(t);
            if (id) tags.push(id);
          }
        }

        // Product URL (slug)
        const image =
          row?.image ||
          row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") ||
          `product-${Date.now()}`;
        const finalProductUrl = row?.product_url || row?.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        const product = new Product({
          name: row?.name,
          brand: brandId,
          description: row?.description || "",
          sku: row?.sku,
          prices,
          currency: row?.currency || "USD",
          category: categories,
          subcategory: subcategories,
          subsubcategory: subsubcategories,
          videoLink: row?.videoLink || null,
          variants,
          lifecycleStage: lifecycleStage,
          tags,
          variationId:
            row.variationId ||
            `VAR-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          meta_title: row?.meta_title || null,
          meta_description: row?.meta_description || null,
          image_alt_text: row?.image_alt_text || null,
          image: image || null,
          gallery: gallery || [],
          product_url: finalProductUrl,
        });

        await product.save();
        successCount++;
      } catch (err) {
        errors.push({
          row: rowNumber,
          error: err.message,
          data: row,
        });
        errorCount++;
      }
    }

    await deleteFile(csvFilePath);

    res.status(200).json({
      message: "Bulk import completed",
      summary: {
        totalRows: results?.length,
        successCount,
        skippedCount,
        errorCount,
        successRate: `${((successCount / results?.length) * 100).toFixed(2)}%`,
      },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    if (req.file?.path) await deleteFile(req.file.path);
    res.status(500).json({ message: "Error processing CSV file", error: error.message });
  }
};
// const importBulkProducts = async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ message: "No CSV file uploaded" });
//     }

//     const csvFilePath = req.file.path;
//     const results = [];
//     const errors = [];
//     let successCount = 0;
//     let skippedCount = 0;
//     let errorCount = 0;

//     // Read & parse CSV
//     await new Promise((resolve, reject) => {
//       fs.createReadStream(csvFilePath)
//         .pipe(csv())
//         .on("data", (data) => results.push(data))
//         .on("end", resolve)
//         .on("error", reject);
//     });

//     for (let i = 0; i < results.length; i++) {
//       const row = results[i];
//       const rowNumber = i + 2;

//       try {
//         // CLEAN VALUES
//         Object.keys(row).forEach((key) => {
//           if (typeof row[key] === "string") {
//             row[key] = row[key].trim();
//           }
//         });

//         // Required fields
//         if (!row.name || !row.sku) {
//           errors.push({ row: rowNumber, error: "Name and SKU required", data: row });
//           errorCount++;
//           continue;
//         }

//         // Skip duplicates
//         const existing = await Product.findOne({ sku: row.sku });
//         if (existing) {
//           skippedCount++;
//           continue;
//         }

//         // Brand
//         let brandId = null;
//         if (row.brand) brandId = await findOrCreateBrand(row.brand);

//         // Categories
//         const categories = [];
//         if (row.category) {
//           for (const name of row.category.split(",").map((x) => x.trim())) {
//             if (name) {
//               const id = await findOrCreateCategory(name);
//               if (id) categories.push(id);
//             }
//           }
//         }

//         // Subcategories (linked to all categories)
//         const subcategories = [];
//         if (row.subcategory) {
//           const subs = row.subcategory.split(",").map((x) => x.trim());
//           for (const sub of subs) {
//             for (const cat of categories) {
//               const id = await findOrCreateSubCategory(sub, cat);
//               if (id) subcategories.push(id);
//             }
//           }
//         }

//         // Subsubcategories
//         const subsubcategories = [];
//         if (row.subsubcategory) {
//           const subs = row.subsubcategory.split(",").map((x) => x.trim());
//           for (const sub of subs) {
//             for (const sc of subcategories) {
//               const id = await findOrCreateSubSubCategory(sub, sc);
//               if (id) subsubcategories.push(id);
//             }
//           }
//         }

//         // Prices
//         // let prices = [];
//         // if (row.prices) {
//         //   const [amount, salePrice] = row.prices.split(":");
//         //   if (amount) {
//         //     prices.push({
//         //       city: "67400e8a7b963a1282d218b5",
//         //       amount: parseFloat(amount),
//         //       salePrice: salePrice ? parseFloat(salePrice) : null,
//         //     });
//         //   }
//         // }

//         let prices = [];
//         if (row.prices) {
//           const pricePairs = row.prices.split(",").map(p => p.trim());

//           for (const p of pricePairs) {
//             const [amount, salePrice] = p.split(":").map(x => parseFloat(x));
//             if (amount) {
//               prices.push({
//                 city: "67400e8a7b963a1282d218b5", // replace as needed
//                 amount,
//                 salePrice: salePrice || null,
//               });
//             }
//           }
//         }
//         // Variants
//         // const variants = [];

//         // if (row.variants) {
//         //   let name = null;
//         //   let value = null;

//         //   // Case 1: CSV format:  variants | variantvalue
//         //   if (row.variantvalue) {
//         //     name = row.variants.trim();
//         //     value = row.variantvalue.trim();
//         //   }

//         //   // Case 2: Single column format: "COLOR:Red"
//         //   if (row.variants.includes(":")) {
//         //     const parts = row.variants.split(":");
//         //     name = parts[0].trim();
//         //     value = parts[1]?.trim();
//         //   }

//         //   if (name && value) {
//         //     const id = await findOrCreateVariant(name, value);
//         //     if (id) variants.push(id);
//         //   }
//         // }


//         const variants = [];

//         if (row.variants) {
//           // Split multiple variants by comma
//           const variantPairs = row.variants.split(",").map(v => v.trim());

//           for (const pair of variantPairs) {
//             if (!pair) continue;

//             let name = null;
//             let value = null;

//             if (pair.includes(":")) {
//               [name, value] = pair.split(":").map(x => x.trim());
//             }

//             if (name && value) {
//               const id = await findOrCreateVariant(name, value);
//               if (id) variants.push(id);
//             }
//           }
//         }

//         let gallery = [];
//         if (row.gallery) {
//           gallery = row.gallery.split(",").map(img => img.trim()).filter(Boolean);
//         }
//         let lifecycleStage = "active";

//         if (row.lifecycleStage) {
//           lifecycleStage = row.lifecycleStage.trim().toLowerCase();

//           const allowedStages = ["active", "discontinued", "upcoming", "archived"];

//           if (!allowedStages.includes(lifecycleStage)) {
//             lifecycleStage = "active"; // fallback
//           }
//         }

//         // Tags
//         const tags = [];
//         if (row.tags) {
//           for (const t of row.tags.split(",").map((x) => x.trim())) {
//             const id = await findOrCreateTag(t);
//             if (id) tags.push(id);
//           }
//         }

//         // Product URL (slug)
//         const image =
//           row.image ||
//           row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") ||
//           `product-${Date.now()}`;

//           // Make SKU unique by combining SKU + first 2 letters of variantName (if exists)
//           // let uniqueSku = row.sku;
//           // if (row.variants) {
//           // uniqueSku += row.variants.substring(0, 3).toUpperCase(); // e.g., "199250METAL" -> "199250ME"
//           // }
//         const finalProductUrl = row?.product_url || row?.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

//         const product = new Product({
//           name: row.name,
//           brand: brandId,
//           description: row.description || "",
//           sku: row.sku,
//           prices,
//           currency: row.currency || "USD",
//           category: categories,
//           subcategory: subcategories,
//           subsubcategory: subsubcategories,
//           videoLink: row.videoLink || null,
//           variants,
//           lifecycleStage: lifecycleStage,
//           tags,
//           variationId:
//             row.variationId ||
//             `VAR-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
//           meta_title: row.meta_title || null,
//           meta_description: row.meta_description || null,
//           image_alt_text: row.image_alt_text || null,
//           image: image || null,
//           gallery: gallery || [],
//           product_url: finalProductUrl,
//         });

//         await product.save();
//         successCount++;
//       } catch (err) {
//         errors.push({
//           row: rowNumber,
//           error: err.message,
//           data: row,
//         });
//         errorCount++;
//       }
//     }

//     await deleteFile(csvFilePath);

//     res.status(200).json({
//       message: "Bulk import completed",
//       summary: {
//         totalRows: results.length,
//         successCount,
//         skippedCount,
//         errorCount,
//         successRate: `${((successCount / results.length) * 100).toFixed(2)}%`,
//       },
//       errors: errors.length > 0 ? errors : undefined,
//     });
//   } catch (error) {
//     if (req.file?.path) await deleteFile(req.file.path);
//     res.status(500).json({ message: "Error processing CSV file", error: error.message });
//   }
// };


// Get CSV template
const getCSVTemplate = (req, res) => {
  try {
    // Create CSV content with proper handling of special characters
    const headers = [
      'name',
      'sku',
      'brand',
      'product_url',
      'category',
      'subcategory',
      'subsubcategory',
      'tags',
      'variants',
      'variantvalue',
      'prices',
      'lifecycleStage',
      'description',
      'meta_title',
      'meta_description',
      'videoLink',
      'image',
      'gallery',
      'currency',
      'image_alt_text',
    ];

    const sampleData = [
      ['Sample Product',
       'SKU-001',
       'Sample Brand',
       'sample-product',
       'Electronics',
       'Mobile Chargers',
       'electronics',
       'Sample Product - Best Quality',
       'Color',
       'VAR-001',
       '100:90',
       'active',
       'Sample Product Description',
       'iPhone,USB-C',
       'Sample product description',
       'https://example.com/video.mp4',
       '/uploads/images/products/1765420918584-56hqpi.png',
       '/uploads/images/products/1765420918584-56hqpi.png,/uploads/images/products/1765420918584-56hqpi.png,/uploads/images/products/1765420918584-56hqpi.png',
       'USD',
       'High quality sample product',
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


// new controller functions here for csv setup


// POST /api/upload-csv
// router.post("/upload-csv", upload.single("file"), async 
const csvFormat = (req, res) => {
  if (!req.file) return res.status(400).json({ error: "CSV file required" });

  const inputFile = req.file.path;
  const products = {};

  fs.createReadStream(inputFile)
    .pipe(csv())
    .on("data", (row) => {
      const sku = row.sku;
      if (!products[sku]) {
        products[sku] = {
          name: row.name,
          sku: row.sku,
          brand: row.brand,
          image: row.image,
          product_url: row.product_url,
          gallery: new Set(),
          category: row.category,
          subcategory: row.subcategory,
          subsubcategory: row.subsubcategory,
          variants: {},
          tags: row.tags,
          prices: row.prices,
          lifecycleStage: row.lifecycleStage,
          description: row.description,
          meta_title: row.meta_title,
          meta_description: row.meta_description,
          videoLink: row.videoLink,
        };
      }

      // collect gallery images
      if (row.gallery) {
        row.gallery.split(",").forEach(img => products[sku].gallery.add(img.trim()));
      }

      // collect variant
      if (row.variants && row.variantvalue) {
        products[sku].variants[row.variants] = row.variantvalue;
      }
    })
    .on("end", () => {
      // convert to final format and sort by SKU
      const finalData = Object.values(products)
        .map(p => ({
          name: p.name,
          sku: p.sku,
          brand: p.brand,
          image: p.image,
          product_url: p.product_url,
          gallery: Array.from(p.gallery).join(","),
          category: p.category,
          subcategory: p.subcategory,
          subsubcategory: p.subsubcategory,
          variants: Object.entries(p.variants).map(([k, v]) => `${k}:${v}`).join(","),
          tags: p.tags,
          prices: p.prices,
          lifecycleStage: p.lifecycleStage,
          description: p.description,
          meta_title: p.meta_title,
          meta_description: p.meta_description,
          videoLink: p.videoLink,
        }))
        .sort((a, b) => a.sku.localeCompare(b.sku)); // sort by SKU

      // Convert to CSV
      const parser = new Parser();
      const csvOutput = parser.parse(finalData);

      // Send CSV as download
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="products_final.csv"'
      );
      res.send(csvOutput);

      // Cleanup uploaded file
      fs.unlinkSync(inputFile);
    });
};


module.exports = {
  importBulkProducts,
  getCSVTemplate,
  csvFormat
};
