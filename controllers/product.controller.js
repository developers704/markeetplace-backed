const Product = require('../models/product.model');
const { deleteFile } = require('../config/fileOperations');
const path = require('path');
const csv = require('csv-parser');
const fs = require('fs').promises;
const fsSync = require('fs');
const { Category, SubCategory, SubSubCategory } = require('../models/productCategory.model.js');
const cron = require('node-cron');
const Inventory = require('../models/inventory.model');
const Brand = require('../models/brand.model');
const DealOfTheDay = require('../models/DealOfTheDay.model');
const City = require('../models/city.model');
const Discount = require('../models/discount.model');
const Tag = require('../models/tag.model');
const mongoose = require('mongoose');
const ProductVariant = require('../models/productVarriant.model.js');
const VariantName = require('../models/variantName.model.js');
const ScrollingMessage = require('../models/scrollingMessage.model');
const Cart = require('../models/cart.model');
const Wishlist = require('../models/wishlist.model');
const Order = require('../models/order.model');
const { Parser } = require('json2csv');
const SpecialProduct = require('../models/specialProduct.model');
const Customer = require('../models/customer.model');
const Warehouse = require('../models/warehouse.model');



// const searchProducts = async (req, res) => {
//   try {
//     let { query } = req.query;
//     if (!query || query.trim() === "") {
//       return res.json([]);
//     }

//     query = query.trim();

//     // 1️⃣ Regular products search
//     const regularProducts = await Product.find(
//       { $text: { $search: query } },
//       { score: { $meta: "textScore" } }
//     )
//       .sort({ score: { $meta: "textScore" } })
//       .limit(50)
//       .populate("category subcategory subsubcategory brand");

//     // 2️⃣ Special products search
//     const specialProducts = await SpecialProduct.find(
//       { $text: { $search: query } },
//       { score: { $meta: "textScore" } }
//     )
//       .sort({ score: { $meta: "textScore" } })
//       .limit(50)
//       .populate("specialCategory specialSubcategory");

//     // 3️⃣ Merge results + type tagging
//     const results = [
//       ...regularProducts.map((p) => ({
//         ...p.toObject(),
//         productType: "Regular",
//       })),
//       ...specialProducts.map((p) => ({
//         ...p.toObject(),
//         productType: "Special",
//       })),
//     ];

//     res.json(results);
//   } catch (error) {
//     console.error("Search Error:", error);
//     res.status(500).json({
//       message: "Error searching products",
//       error: error.message,
//     });
//   }
// };

const searchProducts = async (req, res) => {
  try {
    let { search } = req.query;
    if (!search || search.trim() === "") return res.json([]);

    search = search.trim();

    // 1) Fast prefix search (autocomplete feel)
    const prefixResults = await Product.find({
      name: { $regex: `^${search}`, $options: "i" }
    })
      .select('_id name sku image')
      .limit(20)
      // .populate("category subcategory subsubcategory brand");

    // 2) Fallback full text search
    const textResults = await Product.find(
      { $text: { $search: search } },
      { score: { $meta: "textScore" } }
    )
      .select('_id name sku image')
      .sort({ score: { $meta: "textScore" } })
      .limit(30);

    const results = [...prefixResults, ...textResults];

    res.json(results);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



const getAllProductsForSearch = async (req, res) => {
  try {
    const regularProducts = await Product.find({})
      .select('name sku category subcategory subsubcategory brand')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('subsubcategory', 'name')
      .populate('brand', 'name');

    const specialProducts = await SpecialProduct.find({})
      .select('name sku specialCategory specialSubcategory')
      .populate('specialCategory', 'name')
      .populate('specialSubcategory', 'name');

    const allProducts = [
      ...regularProducts.map(p => ({ ...p.toObject(), productType: 'Regular' })),
      ...specialProducts.map(p => ({ ...p.toObject(), productType: 'Special' }))
    ];

    res.json(allProducts);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching products for search', error: error.message });
  }
};



// const getNewProducts = async (req, res) => {
//   try {
//     const user = await Customer.findById(req.user.id);
//     const lastLoginDate = user.lastLoginDate || new Date(0); // If never logged in, use epoch time

//     const newRegularProducts = await Product.find({
//       createdAt: { $gt: lastLoginDate }
//     }).populate('category subcategory subsubcategory brand')
//       .populate({
//         path: 'variants',
//         populate: { path: 'variantName', model: 'VariantName' }
//       })
//       .sort('-createdAt');

//     const newSpecialProducts = await SpecialProduct.find({
//       createdAt: { $gt: lastLoginDate }
//     }).populate('specialCategory specialSubcategory')
//       .populate({
//         path: 'productVariants',
//         populate: { path: 'variantName', model: 'VariantName' }
//       })
//       .sort('-createdAt');

//     res.json({
//       regularProducts: newRegularProducts,
//       specialProducts: newSpecialProducts
//     });
//   } catch (error) {
//     res.status(500).json({ message: 'Error fetching new products', error: error.message });
//   }
// };

// const getNewProducts = async (req, res) => {
//   try {
//     const user = await Customer.findById(req.user.id);
//     const previousLoginDate = user.previousLoginDate || new Date(0);

//     const newRegularProducts = await Product.find({
//       createdAt: { $gt: previousLoginDate }
//     }).populate('category subcategory subsubcategory brand')
//       .populate({
//         path: 'variants',
//         populate: { path: 'variantName', model: 'VariantName' }
//       })
//       .sort('-createdAt');

//     const newSpecialProducts = await SpecialProduct.find({
//       createdAt: { $gt: previousLoginDate }
//     }).populate('specialCategory specialSubcategory')
//       .populate({
//         path: 'productVariants',
//         populate: { path: 'variantName', model: 'VariantName' }
//       })
//       .sort('-createdAt');

//     res.json({
//       regularProducts: newRegularProducts,
//       specialProducts: newSpecialProducts
//     });
//   } catch (error) {
//     res.status(500).json({ message: 'Error fetching new products', error: error.message });
//   }
// };


// const getNewProducts = async (req, res) => {
//   try {
//     const user = await Customer.findById(req.user.id);
    
//     // Get last login date, if first time login use account creation date
//     // const lastLoginDate = user.lastLoginDate || user.createdAt;
//     // const lastCheckDate = user.lastProductCheckDate || user.createdAt;
//     // const currentTime = new Date();
//     // Store current login time before fetching products
//     // const currentLoginTime = new Date();

//     const lastLoginDate = user.lastLoginDate || user.createdAt;
//     const currentTime = new Date();
//     // Fetch regular products added between last login and current login
//     const newRegularProducts = await Product.find({
//       createdAt: { 
//         $gt: lastLoginDate,
//         $lte: currentLoginTime 
//         // $gt: lastCheckDate,
//         // $lte: currentTime 
//       }
//     })
//     .populate('category subcategory subsubcategory brand')
//     .populate({
//       path: 'variants',
//       populate: { path: 'variantName', model: 'VariantName' }
//     })
//     .sort('-createdAt');

//     // Fetch special products added between last login and current login
//     const newSpecialProducts = await SpecialProduct.find({
//       createdAt: { 
//         $gt: lastLoginDate,
//         // $lte: currentLoginTime 
//         // $gt: lastCheckDate,
//         $lte: currentTime 
//       }
//     })
//     .populate('specialCategory specialSubcategory')
//     .populate({
//       path: 'productVariants',
//       populate: { path: 'variantName', model: 'VariantName' }
//     })
//     .sort('-createdAt');

//     // Update user's last login time after fetching products
//     // user.lastLoginDate = currentLoginTime;
//     user.lastProductCheckDate = currentTime;
//     await user.save();

//     res.json({
//       // lastLogin: lastLoginDate,
//       // currentLogin: currentLoginTime,
//       lastCheck: lastCheckDate,
//       currentTime: currentTime,
//       regularProducts: newRegularProducts,
//       specialProducts: newSpecialProducts
//     });

//   } catch (error) {
//     res.status(500).json({ message: 'Error fetching new products', error: error.message });
//   }
// };


const getNewProducts = async (req, res) => {
  try {
    const user = await Customer.findById(req.user.id);
    
    const lastCheckDate = user.lastProductCheckDate || user.createdAt;
    const currentTime = new Date();

    // Fetch all products and mark new ones
    const allRegularProducts = await Product.find()
      .populate('category subcategory subsubcategory brand')
      .populate({
        path: 'variants',
        populate: { path: 'variantName', model: 'VariantName' }
      })
      .lean()
      .sort('-createdAt')
      .limit(10);

    const allSpecialProducts = await SpecialProduct.find()
      .populate('specialCategory specialSubcategory')
      .populate({
        path: 'productVariants',
        populate: { path: 'variantName', model: 'VariantName' }
      })
      .lean()
      .sort('-createdAt')
      .limit(10);

    // Mark new products and sort
    const markedRegularProducts = allRegularProducts.map(product => ({
      ...product,
      isNewProduct: product.createdAt > lastCheckDate
    }))

    const markedSpecialProducts = allSpecialProducts.map(product => ({
      ...product,
      isNewProduct: product.createdAt > lastCheckDate
    }))

    // Update last login date
    user.lastProductCheckDate = currentTime;
    await user.save();

    res.json({
      lastCheck: lastCheckDate,
      currentTime: currentTime,
      regularProducts: markedRegularProducts,
      specialProducts: markedSpecialProducts
    });

  } catch (error) {
    res.status(500).json({ message: 'Error fetching products', error: error.message });
  }
};












const createProduct = async (req, res) => {
  try {
    const {
      name,
      brandId,
      description,
      isBestSeller,
      isShopByPet,
      isNewArrival,
      prices,
      currency,
      category,
      subcategory,
      subsubcategory,
      videoLink,
      variants,
      lifecycleStage,
      releaseDate,
      sku,
      tags,
      variationId,
      meta_title,
      meta_description,
      image_alt_text,
      product_url
    } = req.body;

    const uploadedImage = req.files?.image
      ? req.files.image[0].filename
      : null;

    const finalImageUrl = uploadedImage
      ? `/uploads/images/products/${uploadedImage}`
      : null;

    const gallery = req.files?.gallery
      ? req.files.gallery.map((file) => `/uploads/images/products/${file.filename}`)
      : [];

    if (!name) {
      if (req.files?.gallery) {
        await Promise.all(
          req.files.gallery.map((file) => deleteFile(path.join("uploads", "images", "products", file.filename)))
        );
      }
      if (uploadedImage) {
        await deleteFile(path.join("uploads", "images", "products", uploadedImage));
      }
      return res.status(400).json({ message: "Name is required" });
    }

    if (sku) {
      const existingProduct = await Product.findOne({ sku });
      if (existingProduct) {
        if (gallery.length) {
          await Promise.all(
            gallery.map((img) => deleteFile(path.join("uploads", "images", "products", path.basename(img))))
          );
        }
        if (uploadedImage) {
          await deleteFile(path.join("uploads", "images", "products", uploadedImage));
        }
        return res.status(400).json({ message: "A product with this SKU already exists" });
      }
    }

    const finalVariationId =
      variationId || `VAR-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const cityIds = prices.map((price) => price.city);
    const uniqueCityIds = new Set(cityIds);

    if (uniqueCityIds.size !== cityIds.length) {
      if (req.files?.gallery) {
        await Promise.all(
          req.files.gallery.map((file) => deleteFile(path.join("uploads", "images", "products", file.filename)))
        );
      }
      if (uploadedImage) {
        await deleteFile(path.join("uploads", "images", "products", uploadedImage));
      }
      return res.status(400).json({ message: "Each city should be included only once in prices." });
    }

    // Generate product URL from name if not provided
    const finalProductUrl = product_url || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const product = new Product({
      name,
      brand: brandId,
      description,
      isBestSeller: isBestSeller || false,
      isShopByPet: isShopByPet || false,
      isNewArrival: isNewArrival || false,
      prices,
      currency,
      category: Array.isArray(category) ? category : category ? [category] : [],
      subcategory: Array.isArray(subcategory)
        ? subcategory
        : subcategory
        ? [subcategory]
        : [],
      subsubcategory: Array.isArray(subsubcategory)
        ? subsubcategory
        : subsubcategory
        ? [subsubcategory]
        : [],
      image: finalImageUrl,
      gallery,
      videoLink,
      variants,
      lifecycleStage,
      releaseDate,
      sku,
      tags,
      variationId: finalVariationId,
      meta_title: meta_title,
      meta_description: meta_description,
      image_alt_text: image_alt_text,
      product_url: finalProductUrl,
    });

    await product.save();

    res.status(201).json({
      message: "Product created successfully",
      product: product.toObject(),
    });
  } catch (error) {
    if (req.files) {
      const fileArrays = Object.values(req.files);
      await Promise.all(fileArrays.flat().map((file) => deleteFile(path.join("uploads", "images", "products", file.filename))));
    }
    res.status(400).json({ message: error.message });
  }
};


const getProductFiltersAndProducts = async (req, res) => {
  try {
      const { categoryId, subcategoryId } = req.params;
      const { minPrice, maxPrice, discount, ...variantFilters } = req.query;

      let query = {};
      if (categoryId) query.category = categoryId;
      if (subcategoryId) query.subcategory = subcategoryId;

      // Dynamic variant filters
      Object.entries(variantFilters).forEach(([key, value]) => {
          query[`variants`] = {
              $elemMatch: {
                  'variantName.name': key,
                  'value': value
              }
          };
      });

      // Price filter
      if (minPrice || maxPrice) {
          query['prices.amount'] = {};
          if (minPrice) query['prices.amount'].$gte = Number(minPrice);
          if (maxPrice) query['prices.amount'].$lte = Number(maxPrice);
      }

      // Discount filter
      if (discount) {
          query['discounts.value'] = { $gte: Number(discount) };
      }

      const products = await Product.find(query)
          .populate('category')
          .populate('subcategory')
          .populate('brand')
          .populate('prices.city')
          .populate('variants')
          .populate('discounts.discountId');

      // Get all unique filter values
      const allProducts = await Product.find(categoryId ? { category: categoryId } : {});
      const filters = {
          priceRange: { min: Infinity, max: -Infinity },
          discountRange: { min: 0, max: 0 },
          brands: [],
          variants: {}
      };

      allProducts.forEach(product => {
          product.variants.forEach(variant => {
              const variantName = variant.variantName.name;
              if (!filters.variants[variantName]) {
                  filters.variants[variantName] = [];
              }
              if (!filters.variants[variantName].includes(variant.value)) {
                  filters.variants[variantName].push(variant.value);
              }
          });

          product.prices.forEach(price => {
              filters.priceRange.min = Math.min(filters.priceRange.min, price.amount);
              filters.priceRange.max = Math.max(filters.priceRange.max, price.amount);
          });

          if (product.brand && !filters.brands.includes(product.brand.name)) {
              filters.brands.push(product.brand.name);
          }

          product.discounts.forEach(discount => {
              filters.discountRange.max = Math.max(filters.discountRange.max, discount.value);
          });
      });

      res.status(200).json({ filters, products });
  } catch (error) {
      res.status(500).json({ message: error.message });
  }
};


const getProductsByCategoryId = async (req, res) => {
  try {
      const categoryId = req.params.categoryId;
      const products = await Product.find({ category: categoryId })
          .populate('brand')
          .populate('category')
          .populate('subcategory');
      res.status(200).json(products);
  } catch (error) {
      res.status(500).json({ message: error.message });
  }
};


const getProductsByCategory = async (req, res) => {
  try {
      const { categoryId, subCategoryId } = req.params;
      
      let query = {};
      
      if (categoryId) {
          query.category = categoryId;
      }
      
      if (subCategoryId) {
          query.subcategory = subCategoryId;
      }

      const products = await Product.find(query)
          .populate('brand')
          .populate('category')
          .populate('subcategory')
          .populate('prices.city')
          .populate('tags')
          .populate({
            path: 'variants',
              populate: {
                  path: 'variantName',
                  model: 'VariantName'
              }
          })
          .select('name description image prices isBestSeller isNewArrival sku gallery');

      res.status(200).json({
          success: true,
          count: products.length,
          data: products
      });

  } catch (error) {
      res.status(500).json({
          success: false,
          message: error.message
      });
  }
};

const bulkUploadProducts = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No CSV file uploaded" });
  }

  let successCount = 0;
  let updateCount = 0;
  let skippedCount = 0;
  const skus = new Set();

  const capitalizeAndTrim = (str) =>
    str.charAt(0).toUpperCase() + str.slice(1).trim();

  const processRow = async (data) => {
    if (!data.name || !data.sku) {
      skippedCount++;
      return;
    }

    if (skus.has(data.sku)) {
      skippedCount++;
      return;
    }

    skus.add(data.sku);

    try {
      const brand = data.brand
        ? await Brand.findOne({ name: capitalizeAndTrim(data.brand) })
        : null;

      // Handle multiple categories
      const categories = data.category ? await Promise.all(
        data.category.split('|').map(async (catName) => {
          const category = await Category.findOne({ name: capitalizeAndTrim(catName) });
          return category ? category._id : null;
        })
      ).then(cats => cats.filter(cat => cat)) : [];

      // Handle multiple subcategories
      const subcategories = data.subcategory ? await Promise.all(
        data.subcategory.split('|').map(async (subName) => {
          const subcategory = await SubCategory.findOne({ name: capitalizeAndTrim(subName) });
          return subcategory ? subcategory._id : null;
        })
      ).then(subs => subs.filter(sub => sub)) : [];

      // Handle multiple subsubcategories
      const subsubcategories = data.subsubcategory ? await Promise.all(
        data.subsubcategory.split('|').map(async (subsubName) => {
          const subsubcategory = await SubSubCategory.findOne({ name: capitalizeAndTrim(subsubName) });
          return subsubcategory ? subsubcategory._id : null;
        })
      ).then(subsubs => subsubs.filter(subsub => subsub)) : [];

      // Handle variants
      const variants = data.variants ? await Promise.all(
        data.variants.split('|').map(async (variantData) => {
          const [variantName, value] = variantData.split(':');
          let variantNameDoc = await VariantName.findOne({ name: capitalizeAndTrim(variantName) });
          if (!variantNameDoc) {
            variantNameDoc = await VariantName.create({ name: capitalizeAndTrim(variantName) });
          }
          let variant = await ProductVariant.findOne({
            variantName: variantNameDoc._id,
            value: value.trim()
          });
          if (!variant) {
            variant = await ProductVariant.create({
              variantName: variantNameDoc._id,
              value: value.trim()
            });
          }
          return variant._id;
        })
      ).then(vars => vars.filter(v => v)) : [];

      const tags = data.tags
        ? await Promise.all(
            data.tags.split("|").map(async (tagName) => {
              const trimmedName = capitalizeAndTrim(tagName);
              if (!trimmedName) return null;
              let tag = await Tag.findOne({ name: trimmedName });
              if (!tag) {
                tag = await Tag.create({ name: trimmedName });
              }
              return tag._id;
            })
          ).then((tags) => tags.filter((tag) => tag))
        : [];

      const prices = data.prices
        ? await Promise.all(
            data.prices.split("|").map(async (priceData) => {
              const [cityName, amount, salePrice] = priceData.split(":");
              if (!cityName || !amount) return null;
              const city = await City.findOne({
                name: capitalizeAndTrim(cityName),
              });
              return {
                city: city ? city._id : null,
                amount: parseFloat(amount) || 0,
                salePrice: parseFloat(salePrice) || null,
              };
            })
          ).then((prices) => prices.filter((price) => price))
        : [];

      const existingProduct = await Product.findOne({ sku: data.sku });

      if (existingProduct) {
        const updates = {
          ...(data.name && { name: data.name }),
          ...(brand && { brand: brand._id }),
          ...(categories.length && { category: categories }),
          ...(subcategories.length && { subcategory: subcategories }),
          ...(subsubcategories.length && { subsubcategory: subsubcategories }),
          ...(variants.length && { variants }),
          ...(tags.length && { tags }),
          ...(prices.length && { prices }),
          ...(data.description && { description: data.description }),
          ...(data.currency && { currency: data.currency }),
          ...(data.variation_id && { variationId: data.variation_id }),
          ...(data.isBestSeller !== undefined && {
            isBestSeller: data.isBestSeller.toLowerCase() === "true",
          }),
          ...(data.isShopByPet !== undefined && {
            isShopByPet: data.isShopByPet.toLowerCase() === "true",
          }),
          ...(data.isNewArrival !== undefined && {
            isNewArrival: data.isNewArrival.toLowerCase() === "true",
          }),
          ...(data.meta_title && { meta_title: data.meta_title }),
          ...(data.meta_description && {
            meta_description: data.meta_description,
          }),
          ...(data.image_alt_text && { image_alt_text: data.image_alt_text }),
        };

        await Product.findByIdAndUpdate(existingProduct._id, updates);

        if (data.quantity) {
          const quantities = data.quantity.split("|");
          const cities = prices.map((price) => price.city);

          const inventoryIds = await Promise.all(
            cities.map(async (cityId, index) => {
              const quantity = parseInt(quantities[index]);
              if (!isNaN(quantity)) {
                const existingInventory = await Inventory.findOne({
                  product: existingProduct._id,
                  city: cityId,
                });

                if (existingInventory) {
                  existingInventory.quantity = quantity;
                  await existingInventory.save();
                  return existingInventory._id;
                } else {
                  const inventory = await Inventory.create({
                    product: existingProduct._id,
                    city: cityId,
                    quantity: quantity,
                  });
                  return inventory._id;
                }
              }
              return null;
            })
          );

          const validInventoryIds = inventoryIds.filter((id) => id);
          if (validInventoryIds.length > 0) {
            await Product.findByIdAndUpdate(existingProduct._id, {
              inventory: validInventoryIds,
            });
          }
        }
        updateCount++;
      } else {
        const product = new Product({
          name: data.name,
          sku: data.sku,
          brand: brand ? brand._id : null,
          category: categories,
          subcategory: subcategories,
          subsubcategory: subsubcategories,
          variants,
          tags,
          prices,
          isBestSeller: data.isBestSeller
            ? data.isBestSeller.toLowerCase() === "true"
            : false,
          isShopByPet: data.isShopByPet
            ? data.isShopByPet.toLowerCase() === "true"
            : false,
          isNewArrival: data.isNewArrival
            ? data.isNewArrival.toLowerCase() === "true"
            : false,
          description: data.description || null,
          currency: data.currency || null,
          variationId: data.variation_id || `VAR-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          meta_title: data.meta_title || null,
          meta_description: data.meta_description || null,
          image_alt_text: data.image_alt_text || null,
        });

        await product.save();

        if (data.quantity) {
          const quantities = data.quantity.split("|");
          const cities = prices.map((price) => price.city);

          const inventoryIds = await Promise.all(
            cities.map(async (cityId, index) => {
              const quantity = parseInt(quantities[index]);
              if (!isNaN(quantity)) {
                const inventory = await Inventory.create({
                  product: product._id,
                  city: cityId,
                  quantity: quantity,
                });
                return inventory._id;
              }
              return null;
            })
          );

          const validInventoryIds = inventoryIds.filter((id) => id);
          if (validInventoryIds.length > 0) {
            product.inventory = validInventoryIds;
            await product.save();
          }
        }
        successCount++;
      }
    } catch (error) {
      skippedCount++;
    }
  };

  try {
    const stream = fsSync.createReadStream(req.file.path).pipe(csv());
    for await (const data of stream) {
      await processRow(data);
    }
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error processing CSV file", error: error.message });
  } finally {
    await deleteFile(req.file.path);
  }

  res.status(200).json({
    message: `Bulk upload completed. ${successCount} products created, ${updateCount} products updated, and ${skippedCount} products skipped.`,
  });
};





const createSampleCsvTemplate = (req, res) => {
  const headers = [
      'name',
      'sku',
      'brand',
      'category',
      'subcategory',
      'subsubcategory',
      'variants',
      'variation_id',
      'tags',
      'prices',
      'isBestSeller',
      'isShopByPet',
      'isNewArrival',
      'description',
      'currency',
      'meta_title',
      'meta_description',
      'image_alt_text',
      'quantity'
  ];

  const sampleData = [
      'Sample Product',
      'SKU12345',
      'Sample Brand',
      'Category1|Category2|Category3',
      'SubCategory1|SubCategory2',
      'SubSubCategory1|SubSubCategory2',
      'Size:Large|Color:Red|Weight:10kg',
      'CUSTOM-VAR-001',
      'Tag1|Tag2|Tag3|Tag4',
      'CityA:100:80|CityB:200:150|CityC:300:250',
      'true',
      'true',
      'false',
      'This is a sample description.',
      'PKR',
      'Sample Meta Title',
      'Sample Meta Description for SEO',
      'Sample Product Image Alt Text',
      '10|20|30'
  ];

  const csvContent = headers.join(',') + '\n' + sampleData.join(',');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=sample_product_template.csv');
  res.send(csvContent);
};





const getAllProducts = async (req, res) => {
  try {
    const { city } = req.query;
    let products = await Product.find()
      .populate([
        { path: "category", select: "name" },
        { path: "subcategory", select: "name" },
        { path: "subsubcategory", select: "name" }, // Add this line
        { path: "brand", select: "name" },
        { path: "tags", select: "name" },
        {
          path: "discounts",
          populate: {
            path: "discountId", // Populate the discountId
            select: "discountType value code", // Include the required fields
          },
        },
        { path: "dealOfTheDay", select: "startDateTime endDateTime discountType discountValue cities" },
        { 
          path: "variants",
          populate: {
            path: "variantName",
            select: "name"
          }
        },
        { path: "prices.city", model: "City" }, // Populate city in prices
        {
          path: "inventory",
          populate: {
            path: "warehouse",
            select: "name location capacity isActive"
          },
          select: "city quantity vat warehouse locationWithinWarehouse lastRestocked batchId expiryDate barcode stockAlertThreshold expiryDateThreshold"
        }

      ])
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    if (city) {
      products = products
        .map((product) => {
          if (product.prices && Array.isArray(product.prices)) {
            // Filter prices for the specified city
            product.prices = product.prices.filter(
              (price) => price.city && price.city._id.toString() === city
            );
            if (product.prices.length > 0) {
              product.price = product.prices[0]; // Assign the first matching price
            }
          } else {
            product.prices = [];
          }

          // Handle city-specific inventory
          // if (product.inventory && Array.isArray(product.inventory)) {
          //   const cityInventory = product.inventory.find(
          //     (inv) => inv.city && inv.city.toString() === city
          //   );
          //   product.isOutOfStock =
          //     !cityInventory || cityInventory.quantity === 0;
          // } else {
          //   product.isOutOfStock = true;
          // }

          if (product.inventory && Array.isArray(product.inventory)) {
            product.inventory = product.inventory.filter(
              (inv) => inv.city && inv.city.toString() === city
            );
            product.isOutOfStock = product.inventory.length === 0 || 
              product.inventory.every(inv => inv.quantity === 0);
          } else {
            product.inventory = [];
            product.isOutOfStock = true;
          }

           // Filter discounts based on city
           if (product.discounts && Array.isArray(product.discounts)) {
            product.discounts = product.discounts.filter(
              (discount) =>
                discount.cityIds && discount.cityIds.some(
                  (cityId) => cityId.toString() === city
                )
            );
          } else {
            product.discounts = [];
          }

         // Filter deal of the day based on city
         if (product.dealOfTheDay && Array.isArray(product.dealOfTheDay)) {
          product.dealOfTheDay = product.dealOfTheDay.filter((deal) =>
            deal.cities.some((dealCityId) => dealCityId.toString() === city)
          );
        } else {
          product.dealOfTheDay = [];
        }

          // Remove the `price` field
          delete product.price;

          return product;
        })
        .filter((product) => product.prices.length > 0); // Filter out products without prices
    }else {
      // If no city specified, calculate isOutOfStock based on all inventory
      products = products.map((product) => {
        if (product.inventory && Array.isArray(product.inventory)) {
          product.isOutOfStock = product.inventory.length === 0 || 
            product.inventory.every(inv => inv.quantity === 0);
        } else {
          product.inventory = [];
          product.isOutOfStock = true;
        }
        return product;
      });
    }

    // Fetch inventory data for the filtered products
    // const productsWithInventory = await Promise.all(
    //   products.map(async (product) => {
    //     const inventory = await Inventory.findOne(
    //       { product: product._id, city } // Fetch inventory only for the specified city
    //     ).select("city quantity vat"); // Return only required fields

    //     product.inventory = inventory || null; // Attach city-specific inventory
    //     product.isOutOfStock = !inventory || inventory.quantity === 0; // Mark as out of stock if no inventory or zero quantity
    //     return product;
    //   })
    // );

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getPublicProducts = async (req, res) => {
  try {
    const { city } = req.query;
    let products = await Product.find({
      lifecycleStage: { $in: ["active"] },
    })
      .populate([
        { path: "category", select: "name" },
        { path: "subcategory", select: "name" },
        { path: "subsubcategory", select: "name" }, // Add this line
        { path: "brand", select: "name" },
        { path: "tags", select: "name" },
        {
          path: "discounts",
          populate: {
            path: "discountId",
            select: "discountType value code",
          },
        },
        { path: "dealOfTheDay", select: "startDateTime endDateTime discountType discountValue cities" },
        "variants",
        { path: "prices.city", model: "City" }, // Populate city in prices
      ])
      .sort({ updatedAt: -1 })
      .lean();

    if (city) {
      products = products
        .map((product) => {
          if (product.prices && Array.isArray(product.prices)) {
            // Filter prices by city
            product.prices = product.prices.filter(
              (price) => price.city && price.city._id.toString() === city
            );
            if (product.prices.length > 0) {
              product.price = product.prices[0]; // Set the first matching price
            }
          } else {
            product.prices = [];
          }

           // Filter discounts based on city
           if (product.discounts && Array.isArray(product.discounts)) {
            product.discounts = product.discounts.filter(
              (discount) =>
                discount.cityIds && discount.cityIds.some(
                  (cityId) => cityId.toString() === city
                )
            );
          } else {
            product.discounts = [];
          }

          // Filter deal of the day based on city
          if (product.dealOfTheDay && Array.isArray(product.dealOfTheDay)) {
            product.dealOfTheDay = product.dealOfTheDay.filter((deal) =>
              deal.cities.some((dealCityId) => dealCityId.toString() === city)
            );
          } else {
            product.dealOfTheDay = [];
          }

          // Remove the `price` field
          delete product.price;

          return product;
        })
        .filter((product) => product.prices.length > 0); // Keep products with valid prices
    }

    // Fetch inventory data for the filtered products
    const productsWithInventory = await Promise.all(
      products.map(async (product) => {
        const inventory = await Inventory.findOne(
          { product: product._id, city } // Fetch inventory only for the specified city
        ).select("city quantity vat"); // Return only required fields

        product.inventory = inventory || null; // Attach city-specific inventory
        product.isOutOfStock = !inventory || inventory.quantity === 0; // Mark as out of stock if no inventory or zero quantity
        return product;
      })
    );

    res.json(productsWithInventory);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



const getNewArrivalProducts = async (req, res) => {
  try {
    const { city } = req.query;

    // Fetch the 20 most recent products in "new arrival" lifecycle stage
    let products = await Product.find({
      lifecycleStage: { $in: ["active"] },
      isNewArrival: true  // Added this condition to filter new arrival products
    })
      .populate([
        { path: "category", select: "name" },
        { path: "subcategory", select: "name" },
        { path: "subsubcategory", select: "name" }, // Add this line
        { path: "brand", select: "name" },
        { path: "tags", select: "name" },
        {
          path: "discounts",
          populate: {
            path: "discountId",
            select: "discountType value code",
          },
        },
        { path: "dealOfTheDay", select: "startDateTime endDateTime discountType discountValue cities" },
        "variants",
        { path: "prices.city", model: "City" }, // Populate city in prices
      ])
      .sort({ createdAt: -1 }) // Sort by creation date, newest first
      .limit(20) // Limit to 20 products
      .lean();

    if (city) {
      products = products
        .map((product) => {
          if (product.prices && Array.isArray(product.prices)) {
            // Filter prices by city
            product.prices = product.prices.filter(
              (price) => price.city && price.city._id.toString() === city
            );
            if (product.prices.length > 0) {
              product.price = product.prices[0]; // Set the first matching price
            }
          } else {
            product.prices = [];
          }

          // Filter discounts based on city
          if (product.discounts && Array.isArray(product.discounts)) {
            product.discounts = product.discounts.filter(
              (discount) =>
                discount.cityIds && discount.cityIds.some(
                  (cityId) => cityId.toString() === city
                )
            );
          } else {
            product.discounts = [];
          }

          // Filter deal of the day based on city
          if (product.dealOfTheDay && Array.isArray(product.dealOfTheDay)) {
            product.dealOfTheDay = product.dealOfTheDay.filter((deal) =>
              deal.cities.some((dealCityId) => dealCityId.toString() === city)
            );
          } else {
            product.dealOfTheDay = [];
          }

          return product;
        })
        .filter((product) => product.prices.length > 0); // Keep products with valid prices
    // Group products by variationId and keep the one with lowest price
    const productMap = new Map();
    products.forEach(product => {
      const variationId = product.variationId?.toString();
      if (variationId) {
        const existingProduct = productMap.get(variationId);
        const currentPrice = product.prices[0]?.amount;
        
        if (!existingProduct || (currentPrice && currentPrice < existingProduct.prices[0]?.amount)) {
          productMap.set(variationId, product);
        }
      } else {
        productMap.set(product._id.toString(), product);
      }
    });
    
    products = Array.from(productMap.values());
  }


    // Fetch inventory data for the filtered products
    const productsWithInventory = await Promise.all(
      products.map(async (product) => {
        const inventory = await Inventory.findOne(
          { product: product._id, city } // Fetch inventory only for the specified city
        ).select("city quantity vat"); // Return only required fields

        product.inventory = inventory || null; // Attach city-specific inventory
        product.isOutOfStock = !inventory || inventory.quantity === 0; // Mark as out of stock if no inventory or zero quantity
        return product;
      })
    );

    res.json(productsWithInventory);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


const getBestSellerProducts = async (req, res) => {
  try {
    const { city } = req.query;

    // Fetch the 20 most recent products in "new arrival" lifecycle stage
    let products = await Product.find({
      lifecycleStage: { $in: ["active"] },
      isBestSeller: true  // Added this condition to filter new arrival products
    })
      .populate([
        { path: "category", select: "name" },
        { path: "subcategory", select: "name" },
        { path: "subsubcategory", select: "name" }, // Add this line
        { path: "brand", select: "name" },
        { path: "tags", select: "name" },
        {
          path: "discounts",
          populate: {
            path: "discountId",
            select: "discountType value code",
          },
        },
        { path: "dealOfTheDay", select: "startDateTime endDateTime discountType discountValue cities" },
        "variants",
        { path: "prices.city", model: "City" }, // Populate city in prices
      ])
      .sort({ createdAt: -1 }) // Sort by creation date, newest first
      .limit(20) // Limit to 20 products
      .lean();

    if (city) {
      products = products
        .map((product) => {
          if (product.prices && Array.isArray(product.prices)) {
            // Filter prices by city
            product.prices = product.prices.filter(
              (price) => price.city && price.city._id.toString() === city
            );
            if (product.prices.length > 0) {
              product.price = product.prices[0]; // Set the first matching price
            }
          } else {
            product.prices = [];
          }

          // Filter discounts based on city
          if (product.discounts && Array.isArray(product.discounts)) {
            product.discounts = product.discounts.filter(
              (discount) =>
                discount.cityIds && discount.cityIds.some(
                  (cityId) => cityId.toString() === city
                )
            );
          } else {
            product.discounts = [];
          }

          // Filter deal of the day based on city
          if (product.dealOfTheDay && Array.isArray(product.dealOfTheDay)) {
            product.dealOfTheDay = product.dealOfTheDay.filter((deal) =>
              deal.cities.some((dealCityId) => dealCityId.toString() === city)
            );
          } else {
            product.dealOfTheDay = [];
          }

          return product;
        })
        .filter((product) => product.prices.length > 0); // Keep products with valid prices
    // Group products by variationId and keep the one with lowest price
    const productMap = new Map();
    products.forEach(product => {
      const variationId = product.variationId?.toString();
      if (variationId) {
        const existingProduct = productMap.get(variationId);
        const currentPrice = product.prices[0]?.amount;
        
        if (!existingProduct || (currentPrice && currentPrice < existingProduct.prices[0]?.amount)) {
          productMap.set(variationId, product);
        }
      } else {
        productMap.set(product._id.toString(), product);
      }
    });
    
    products = Array.from(productMap.values());
  }


    // Fetch inventory data for the filtered products
    const productsWithInventory = await Promise.all(
      products.map(async (product) => {
        const inventory = await Inventory.findOne(
          { product: product._id, city } // Fetch inventory only for the specified city
        ).select("city quantity vat"); // Return only required fields

        product.inventory = inventory || null; // Attach city-specific inventory
        product.isOutOfStock = !inventory || inventory.quantity === 0; // Mark as out of stock if no inventory or zero quantity
        return product;
      })
    );

    res.json(productsWithInventory);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getShopByPetProducts = async (req, res) => {
  try {
    const { city } = req.query;

    // Fetch the 20 most recent products in "new arrival" lifecycle stage
    let products = await Product.find({
      lifecycleStage: { $in: ["active"] },
      isShopByPet: true  // Added this condition to filter new arrival products
    })
      .populate([
        { path: "category", select: "name" },
        { path: "subcategory", select: "name" },
        { path: "subsubcategory", select: "name" }, // Add this line
        { path: "brand", select: "name" },
        { path: "tags", select: "name" },
        {
          path: "discounts",
          populate: {
            path: "discountId",
            select: "discountType value code",
          },
        },
        { path: "dealOfTheDay", select: "startDateTime endDateTime discountType discountValue cities" },
        "variants",
        { path: "prices.city", model: "City" }, // Populate city in prices
      ])
      .sort({ createdAt: -1 }) // Sort by creation date, newest first
      .limit(20) // Limit to 20 products
      .lean();

    if (city) {
      products = products
        .map((product) => {
          if (product.prices && Array.isArray(product.prices)) {
            // Filter prices by city
            product.prices = product.prices.filter(
              (price) => price.city && price.city._id.toString() === city
            );
            if (product.prices.length > 0) {
              product.price = product.prices[0]; // Set the first matching price
            }
          } else {
            product.prices = [];
          }

          // Filter discounts based on city
          if (product.discounts && Array.isArray(product.discounts)) {
            product.discounts = product.discounts.filter(
              (discount) =>
                discount.cityIds && discount.cityIds.some(
                  (cityId) => cityId.toString() === city
                )
            );
          } else {
            product.discounts = [];
          }

          // Filter deal of the day based on city
          if (product.dealOfTheDay && Array.isArray(product.dealOfTheDay)) {
            product.dealOfTheDay = product.dealOfTheDay.filter((deal) =>
              deal.cities.some((dealCityId) => dealCityId.toString() === city)
            );
          } else {
            product.dealOfTheDay = [];
          }

          return product;
        })
        .filter((product) => product.prices.length > 0); // Keep products with valid prices
    // Group products by variationId and keep the one with lowest price
    const productMap = new Map();
    products.forEach(product => {
      const variationId = product.variationId?.toString();
      if (variationId) {
        const existingProduct = productMap.get(variationId);
        const currentPrice = product.prices[0]?.amount;
        
        if (!existingProduct || (currentPrice && currentPrice < existingProduct.prices[0]?.amount)) {
          productMap.set(variationId, product);
        }
      } else {
        productMap.set(product._id.toString(), product);
      }
    });
    
    products = Array.from(productMap.values());
  }


    // Fetch inventory data for the filtered products
    const productsWithInventory = await Promise.all(
      products.map(async (product) => {
        const inventory = await Inventory.findOne(
          { product: product._id, city } // Fetch inventory only for the specified city
        ).select("city quantity vat"); // Return only required fields

        product.inventory = inventory || null; // Attach city-specific inventory
        product.isOutOfStock = !inventory || inventory.quantity === 0; // Mark as out of stock if no inventory or zero quantity
        return product;
      })
    );

    res.json(productsWithInventory);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


const getProductById = async (req, res) => {
  try {
    const { city } = req.query;
    const productId = req.params.id;  // Use the productId from the URL path

    // Fetch the main product by ID first
    let product = await Product.findById(productId)
      .populate([
        { path: "category", select: "name" },
        { path: "subcategory", select: "name" },
        { path: "subsubcategory", select: "name" }, // Add this line
        { path: "brand", select: "name" },
        { path: "tags", select: "name" },
        {
          path: "discounts",
          populate: {
            path: "discountId",
            select: "discountType value code",
          },
        },
        { path: "dealOfTheDay", select: "startDateTime endDateTime discountType discountValue cities" },
        {
          path: "variants",
          populate: [{
            path: "variantName",
            select: "name parentVariant",
            populate: {
              path: "parentVariant",
              select: "name"
            }
          }]
        },
        { path: "prices.city", model: "City" },
      ])
      .lean();

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Fetch all products with the same variationId (including the main product and variations)
    const variationId = product.variationId;  // Get the variationId from the main product

    let products = await Product.find({ variationId })
      .populate([
        { path: "category", select: "name" },
        { path: "subcategory", select: "name" },
        { path: "subsubcategory", select: "name" }, // Add this line
        { path: "brand", select: "name" },
        { path: "tags", select: "name" },
        {
          path: "discounts",
          populate: {
            path: "discountId",
            select: "discountType value code",
          },
        },
        { path: "dealOfTheDay", select: "startDateTime endDateTime discountType discountValue cities" },
        {
          path: "variants",  // Populate the array of variants
          populate: {
            path: "variantName",  // Populate the variantName field within each variant
            select: "name"        // Only select the 'name' field of the VariantName
          }
        },
        { path: "prices.city", model: "City" },
      ])
      .lean();

      // Ensure the main product is the first in the array
    products = [product, ...products.filter(p => p._id.toString() !== product._id.toString())];

    // Filter the products based on city (for price, discounts, and dealOfTheDay)
    products = products.map(async (product) => {
      if (city) {
        // Filter prices by city
        if (product.prices && Array.isArray(product.prices)) {
          product.prices = product.prices.filter(
            (price) => price.city && price.city._id.toString() === city
          );
          if (product.prices.length > 0) {
            product.price = product.prices[0];
          }
        }

        // Filter discounts by city
        if (product.discounts && Array.isArray(product.discounts)) {
          product.discounts = product.discounts.filter(
            (discount) =>
              discount.cityIds && discount.cityIds.some(
                (cityId) => cityId.toString() === city
              )
          );
        } else {
          product.discounts = [];
        }

        // Filter deal of the day by city
        if (product.dealOfTheDay && Array.isArray(product.dealOfTheDay)) {
          product.dealOfTheDay = product.dealOfTheDay.filter((deal) =>
            deal.cities.some((dealCityId) => dealCityId.toString() === city)
          );
        } else {
          product.dealOfTheDay = [];
        }
      }

      // Fetch inventory for each product based on city
      const inventory = await Inventory.findOne({
        product: product._id
      }).populate("city warehouse");
      product.inventory = inventory || null;
      product.isOutOfStock = !inventory || inventory.quantity === 0;

      delete product.price;  // Remove the price field
      return product;
    });

    // Wait for all the products to be processed
    products = await Promise.all(products);

    // Return the main product and its variations
    res.json(products);

  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching product", error: error.message });
  }
};







const updateProduct = async (req, res) => {
  let oldGalleryPaths = [];
  try {
    const { id } = req.params;
    const {
      name,
      brandId,
      description,
      isBestSeller,
      isShopByPet,
      isNewArrival,
      prices,
      currency,
      category,
      subcategory,
      subsubcategory,
      videoLink,
      variants,
      lifecycleStage,
      releaseDate,
      sku,
      tags,
      variationId,
      meta_title,
      meta_description,
      image_alt_text,
      product_url,
    } = req.body;

    const uploadedImage = req.files?.image ? req.files.image[0].filename : null;

    const finalImageUrl = uploadedImage
      ? `/uploads/images/products/${uploadedImage}`
      : null;

    const gallery = req.files?.gallery
      ? req.files.gallery.map(
          (file) => `/uploads/images/products/${file.filename}`
        )
      : [];

    const product = await Product.findById(id);
    if (!product) {
      if (gallery.length) {
        await Promise.all(
          gallery.map((img) =>
            deleteFile(
              path.join("uploads", "images", "products", path.basename(img))
            )
          )
        );
      }
      if (uploadedImage) {
        await deleteFile(
          path.join("uploads", "images", "products", uploadedImage)
        );
      }
      return res.status(404).json({ message: "Product not found" });
    }

    if (sku && sku !== product.sku) {
      const skuExists = await Product.findOne({ sku, _id: { $ne: id } });
      if (skuExists) {
        if (gallery.length) {
          await Promise.all(
            gallery.map((img) =>
              deleteFile(
                path.join("uploads", "images", "products", path.basename(img))
              )
            )
          );
        }
        if (uploadedImage) {
          await deleteFile(
            path.join("uploads", "images", "products", uploadedImage)
          );
        }
        return res.status(400).json({ message: "SKU already exists" });
      }
    }

    if (category) {
      const categoryIds = Array.isArray(category) ? category : [category];
      const validCategories = await Category.find({
        _id: { $in: categoryIds },
      });

      if (validCategories.length !== categoryIds.length) {
        if (gallery.length) {
          await Promise.all(
            gallery.map((img) =>
              deleteFile(
                path.join("uploads", "images", "products", path.basename(img))
              )
            )
          );
        }
        if (uploadedImage) {
          await deleteFile(
            path.join("uploads", "images", "products", uploadedImage)
          );
        }
        return res
          .status(404)
          .json({ message: "One or more categories not found" });
      }
    }

    if (subcategory) {
      const subcategoryIds = Array.isArray(subcategory)
        ? subcategory
        : [subcategory];
      const validSubcategories = await SubCategory.find({
        _id: { $in: subcategoryIds },
      });

      if (validSubcategories.length !== subcategoryIds.length) {
        if (gallery.length) {
          await Promise.all(
            gallery.map((img) =>
              deleteFile(
                path.join("uploads", "images", "products", path.basename(img))
              )
            )
          );
        }
        if (uploadedImage) {
          await deleteFile(
            path.join("uploads", "images", "products", uploadedImage)
          );
        }
        return res
          .status(404)
          .json({ message: "One or more subcategories not found" });
      }
    }

    if (subsubcategory) {
      const subsubcategoryIds = Array.isArray(subsubcategory)
        ? subsubcategory
        : [subsubcategory];
      const validSubsubcategories = await SubSubCategory.find({
        _id: { $in: subsubcategoryIds },
      });

      if (validSubsubcategories.length !== subsubcategoryIds.length) {
        if (gallery.length) {
          await Promise.all(
            gallery.map((img) =>
              deleteFile(
                path.join("uploads", "images", "products", path.basename(img))
              )
            )
          );
        }
        if (uploadedImage) {
          await deleteFile(
            path.join("uploads", "images", "products", uploadedImage)
          );
        }
        return res
          .status(404)
          .json({ message: "One or more sub-subcategories not found" });
      }
    }

    if (prices && prices.length) {
      const cityIds = prices.map((price) => price.city);
      const uniqueCityIds = new Set(cityIds);

      if (uniqueCityIds.size !== cityIds.length) {
        if (gallery.length) {
          await Promise.all(
            gallery.map((img) =>
              deleteFile(
                path.join("uploads", "images", "products", path.basename(img))
              )
            )
          );
        }
        if (uploadedImage) {
          await deleteFile(
            path.join("uploads", "images", "products", uploadedImage)
          );
        }
        return res
          .status(400)
          .json({
            message: "Each city should be included only once in prices.",
          });
      }
    }

    if (name) {
      product.name = name;
      if (!product_url) {
        product.product_url = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      }
    }
    if (isShopByPet !== undefined) product.isShopByPet = isShopByPet;
    if (isNewArrival !== undefined) product.isNewArrival = isNewArrival;
    if (meta_title) product.meta_title = meta_title;
    if (meta_description) product.meta_description = meta_description;
    if (image_alt_text) product.image_alt_text = image_alt_text;
    if (product_url) product.product_url = product_url;
    if (brandId) {
      const brand = await Brand.findById(brandId);
      if (!brand) {
        if (gallery.length) {
          await Promise.all(
            gallery.map((img) =>
              deleteFile(
                path.join("uploads", "images", "products", path.basename(img))
              )
            )
          );
        }
        if (uploadedImage) {
          await deleteFile(
            path.join("uploads", "images", "products", uploadedImage)
          );
        }
        return res.status(400).json({ message: "Invalid brand ID" });
      }
      product.brand = brandId;
    }
    if (description) product.description = description;
    if (prices) product.prices = prices;
    if (currency) product.currency = currency;
    if (category)
      product.category = Array.isArray(category)
        ? category
        : category
        ? [category]
        : [];
    if (subcategory)
      product.subcategory = Array.isArray(subcategory)
        ? subcategory
        : subcategory
        ? [subcategory]
        : [];
    if (subsubcategory)
      product.subsubcategory = Array.isArray(subsubcategory)
        ? subsubcategory
        : subsubcategory
        ? [subsubcategory]
        : [];
    if (videoLink) product.videoLink = videoLink;
    if (variants) {
      product.variants =
        typeof variants === "string" ? JSON.parse(variants) : variants;
    }
    if (lifecycleStage) product.lifecycleStage = lifecycleStage;
    if (releaseDate) product.releaseDate = new Date(releaseDate);
    if (sku) product.sku = sku;
    if (tags) {
      product.tags = Array.isArray(tags) ? tags : JSON.parse(tags);
    }
    if (isBestSeller !== undefined) {
      product.isBestSeller = isBestSeller;
    }
    if (variationId) product.variationId = variationId;

    if (finalImageUrl) {
      if (product.image) {
        await deleteFile(
          path.join(
            "uploads",
            "images",
            "products",
            path.basename(product.image)
          )
        );
      }
      product.image = finalImageUrl;
    }
    if (gallery.length) {
      oldGalleryPaths = product.gallery;
      product.gallery = gallery;
    }

    await product.save();

    if (oldGalleryPaths.length) {
      await Promise.all(
        oldGalleryPaths.map((img) =>
          deleteFile(
            path.join("uploads", "images", "products", path.basename(img))
          )
        )
      );
    }

    res.status(200).json({
      message: "Product updated successfully",
      product: product.toObject(),
    });
  } catch (error) {
    if (req.files) {
      const fileArrays = Object.values(req.files);
      await Promise.all(fileArrays.flat().map((file) => deleteFile(path.join("uploads", "images", "products", file.filename))));
    }
    res.status(400).json({ message: error.message });
  }
};


// const deleteProducts = async (req, res) => {
//   try {
//     const { productIds } = req.body;

//     if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
//       return res.status(400).json({ message: "No product IDs provided or invalid format" });
//     }

//     const objectIdProductIds = productIds.map(id => mongoose.Types.ObjectId(id));

//     const products = await Product.find({ _id: { $in: objectIdProductIds } });

//     if (products.length === 0) {
//       return res.status(404).json({ message: "No products found with the provided IDs" });
//     }

//     // Collect image paths
//     const imagePaths = products
//       .filter(product => product.image)
//       .map(product => path.join('uploads', 'images', 'products', path.basename(product.image)));

//     const galleryPaths = products
//       .filter(product => product.gallery && product.gallery.length > 0)
//       .flatMap(product => product.gallery.map(img => path.join('uploads', 'images', 'products', path.basename(img))));

//     // Try to delete images but continue if some fail
//     await Promise.allSettled([...imagePaths, ...galleryPaths].map(deleteFile));

//      // Remove products from carts
//     //  await Cart.updateMany(
//     //   { "items.item": { $in: productIds } },
//     //   { $pull: { items: { item: { $in: productIds } } } }
//     // );

//     // // Remove products from wishlists
//     // await Wishlist.updateMany(
//     //   { products: { $in: productIds } },
//     //   { $pull: { products: { $in: productIds } } }
//     // );

//     // // Mark orders containing these products
//     // await Order.updateMany(
//     //   { "items.product": { $in: productIds } },
//     //   { $set: { "items.$[elem].product": null } },
//     //   { arrayFilters: [{ "elem.product": { $in: productIds } }] }
//     // );


//     await Cart.updateMany(
//       { "items.item": { $in: objectIdProductIds } },
//       { $pull: { items: { item: { $in: objectIdProductIds } } } }
//   );

//   await Wishlist.updateMany(
//       { products: { $in: objectIdProductIds } },
//       { $pull: { products: { $in: objectIdProductIds } } }
//   );

//   await Order.updateMany(
//       { "items.product": { $in: objectIdProductIds } },
//       { $set: { "items.$[elem].product": null } },
//       { arrayFilters: [{ "elem.product": { $in: objectIdProductIds } }] }
//   );

//     // Delete inventory and products
//     await Inventory.deleteMany({ product: { $in: objectIdProductIds  } });
//     await Product.deleteMany({ _id: { $in: objectIdProductIds  } });

//     res.status(200).json({
//       message: "Products deleted successfully",
//       deletedCount: products.length
//     });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };

const deleteProducts = async (req, res) => {
  try {
      const { productIds } = req.body;

      if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
          return res.status(400).json({ message: "No product IDs provided or invalid format" });
      }

      // Convert string IDs to ObjectIds correctly
      const objectIdProductIds = productIds.map(id => new mongoose.Types.ObjectId(id));

      const products = await Product.find({ _id: { $in: objectIdProductIds } });

      if (products.length === 0) {
          return res.status(404).json({ message: "No products found with the provided IDs" });
      }

      // Collect image paths
      const imagePaths = products
          .filter(product => product.image)
          .map(product => path.join('uploads', 'images', 'products', path.basename(product.image)));

      const galleryPaths = products
          .filter(product => product.gallery && product.gallery.length > 0)
          .flatMap(product => product.gallery.map(img => path.join('uploads', 'images', 'products', path.basename(img))));

      await Promise.allSettled([...imagePaths, ...galleryPaths].map(deleteFile));

      await Cart.updateMany(
          { "items.item": { $in: objectIdProductIds } },
          { $pull: { items: { item: { $in: objectIdProductIds } } } }
      );

      await Wishlist.updateMany(
          { products: { $in: objectIdProductIds } },
          { $pull: { products: { $in: objectIdProductIds } } }
      );

      await Order.updateMany(
          { "items.product": { $in: objectIdProductIds } },
          { $set: { "items.$[elem].product": null } },
          { arrayFilters: [{ "elem.product": { $in: objectIdProductIds } }] }
      );

      await Inventory.deleteMany({ product: { $in: objectIdProductIds } });
      await Product.deleteMany({ _id: { $in: objectIdProductIds } });

      res.status(200).json({
          message: "Products deleted successfully",
          deletedCount: products.length
      });
  } catch (error) {
      res.status(500).json({ message: error.message });
  }
};




  const updateProductLifecycleAutomated = async () => {
    try {
        const currentDate = new Date();
        await Product.updateMany(
            { 
                lifecycleStage: 'upcoming',
                releaseDate: { $lte: currentDate }
            },
            { $set: { lifecycleStage: 'active' } }
        );
        console.log('Updated upcoming products to active');
    } catch (error) {
        console.error('Error updating product lifecycle stages:', error);
    }
};

  // Run the job every day at midnight
cron.schedule('0 0 * * *', () => {
    updateProductLifecycleAutomated();
  });

//product life cycle management
  const updateProductLifecycle = async (req, res) => {
    try {
        const { id } = req.params;
        const { lifecycleStage } = req.body;

        const product = await Product.findByIdAndUpdate(
            id,
            { lifecycleStage },
            { new: true }
        );

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.json(product);
    } catch (error) {
        res.status(500).json({ message: 'Error updating product lifecycle', error: error.message });
    }
};


const getSidebarFilters = async (req, res) => {
  try {
    const { categoryId, brandId, city } = req.query;

    if (!mongoose.isValidObjectId(city)) {
      return res.status(400).json({ message: "Invalid city" });
    }

    let query = {
      lifecycleStage: { $in: ["active"] },
      "prices.city": city,
    };

    if (categoryId) {
      if (!mongoose.isValidObjectId(categoryId)) {
        return res.status(400).json({ message: "Invalid categoryId" });
      }
      query.category = categoryId;
    }

    if (brandId) {
      if (!mongoose.isValidObjectId(brandId)) {
        return res.status(400).json({ message: "Invalid brandId" });
      }
      query.brand = brandId;
    }

    const products = await Product.find(query).lean();

    if (!products.length) {
      return res.json({ filters: [] });
    }

    const subcategoryIds = new Set();
    const subsubcategoryIds = new Set();
    const brandIds = new Set();
    const variantIds = new Set();
    const discounts = new Set();

    products.forEach((product) => {
      if (product.subcategory) {
        if (Array.isArray(product.subcategory)) {
          product.subcategory.forEach(sub => subcategoryIds.add(sub.toString()));
        } else {
          subcategoryIds.add(product.subcategory.toString());
        }
      }
      if (product.subsubcategory) {
        if (Array.isArray(product.subsubcategory)) {
          product.subsubcategory.forEach(subsub => subsubcategoryIds.add(subsub.toString()));
        } else {
          subsubcategoryIds.add(product.subsubcategory.toString());
        }
      }
      if (product.brand) brandIds.add(product.brand.toString());
      if (product.variants && Array.isArray(product.variants)) {
        product.variants.forEach((variant) => variantIds.add(variant.toString()));
      }
      if (product.discounts && Array.isArray(product.discounts)) {
        product.discounts.forEach((discount) => discounts.add(discount.toString()));
      }
    });

    const [subcategories, subsubcategories, brands, variants] = await Promise.all([
      SubCategory.find({ _id: { $in: Array.from(subcategoryIds) } }).select("_id name"),
      SubSubCategory.find({ _id: { $in: Array.from(subsubcategoryIds) } }).select("_id name"),
      Brand.find({ _id: { $in: Array.from(brandIds) } }).select("_id name"),
      ProductVariant.find({ _id: { $in: Array.from(variantIds) } })
        .populate("variantName", "name")
        .select("_id value variantName"),
    ]);

    const filters = [
      {
        name: "subcategory",
        subcategory: subcategories.map((subcategory) => ({
          _id: subcategory._id,
          name: subcategory.name,
        })),
      },
      {
        name: "subsubcategory",
        subsubcategory: subsubcategories.map((subsubcategory) => ({
          _id: subsubcategory._id,
          name: subsubcategory.name,
        })),
      },
      {
        name: "brand",
        brand: brands.map((brand) => ({
          _id: brand._id,
          name: brand.name,
        })),
      },
      {
        name: "variant",
        variant: variants.map((variant) => ({
          _id: variant._id,
          name: variant.variantName.name,
          value: variant.value,
        })),
      },
      {
        name: "discount",
        discount: Array.from(discounts),
      },
    ];

    res.json({ filters });
  } catch (error) {
    res.status(500).json({ message: "Error fetching filters", error: error.message });
  }
};



const getFilteredProducts = async (req, res) => {
  try {
    const { city, category, subcategory, subsubcategory, brand, variants, scrollingMessageId } = req.body;

    // If only city is provided and no other filters, return empty array
    if (city && !category && !subcategory && !subsubcategory && !brand && !variants && !scrollingMessageId) {
      return res.json([]);
    }

    // Step 1: Fetch products
    let products = await Product.find({
      lifecycleStage: { $in: ["active"] },
    })
      .populate([
        { path: "category", select: "name urlName" },
        { path: "subcategory", select: "name urlName" },
        { path: "subsubcategory", select: "name" },
        { path: "brand", select: "name" },
        { path: "tags", select: "name" },
        {
          path: "discounts",
          populate: {
            path: "discountId",
            select: "discountType value code cityIds", // Include cityIds in discounts
          },
        },
        {
          path: "dealOfTheDay",
          select: "startDateTime endDateTime discountType discountValue cities",
        },
        { path: "variants", select: "name value" },
        { path: "prices.city", model: "City" },
      ])
      .sort({ updatedAt: -1 })
      .lean();

    // Step 2: Filter by city
    if (city) {
      products = products
        .map((product) => {
          if (product.prices && Array.isArray(product.prices)) {
            // Filter prices by city
            product.prices = product.prices.filter(
              (price) => price.city && price.city._id.toString() === city
            );
          } else {
            product.prices = [];
          }

          // Filter discounts by city
          if (product.discounts && Array.isArray(product.discounts)) {
            product.discounts = product.discounts.filter(
              (discount) =>
                discount.cityIds &&
                discount.cityIds.some((cityId) => cityId.toString() === city)
            );
          } else {
            product.discounts = [];
          }

          // Filter deal-of-the-day offers by city
          if (product.dealOfTheDay && Array.isArray(product.dealOfTheDay)) {
            product.dealOfTheDay = product.dealOfTheDay.filter((deal) =>
              deal.cities.some((dealCityId) => dealCityId.toString() === city)
            );
          } else {
            product.dealOfTheDay = [];
          }

          return product;
        })
        .filter((product) => product.prices.length > 0); // Keep products with valid prices
    }

    // Step 3: Filter by category (if multiple IDs are provided, filter by any of them)
    if (category) {
      let categoryIds = Array.isArray(category) ? category : [category];
      if (!mongoose.isValidObjectId(categoryIds[0])) {
        const foundCategories = await Category.find({ urlName: { $in: categoryIds } }).select("_id");
        if (!foundCategories.length) return res.status(404).json({ message: "Categories not found" });
        categoryIds = foundCategories.map((cat) => cat._id.toString());
      }
      products = products.filter((product) => 
        product.category && product.category.some(cat => categoryIds.includes(cat._id.toString()))
      );
    }

    // Step 4: Filter by subcategory (if multiple IDs are provided, filter by any of them)
    if (subcategory) {
      let subcategoryIds = Array.isArray(subcategory) ? subcategory : [subcategory];
      if (!mongoose.isValidObjectId(subcategoryIds[0])) {
        const foundSubCategories = await SubCategory.find({ urlName: { $in: subcategoryIds } }).select("_id");
        if (!foundSubCategories.length) return res.status(404).json({ message: "Subcategories not found" });
        subcategoryIds = foundSubCategories.map((sub) => sub._id.toString());
      }
      products = products.filter((product) => 
        product.subcategory && product.subcategory.some(sub => subcategoryIds.includes(sub._id.toString()))
      );
    }

     // Added subsubcategory filtering
     if (subsubcategory) {
      let subsubcategoryIds = Array.isArray(subsubcategory) ? subsubcategory : [subsubcategory];
      if (!mongoose.isValidObjectId(subsubcategoryIds[0])) {
        const foundSubSubCategories = await SubSubCategory.find({ _id: { $in: subsubcategoryIds } }).select("_id");
        if (!foundSubSubCategories.length) return res.status(404).json({ message: "Sub-subcategories not found" });
        subsubcategoryIds = foundSubSubCategories.map((subsub) => subsub._id.toString());
      }
      products = products.filter((product) => 
        product.subsubcategory && product.subsubcategory.some(subsub => subsubcategoryIds.includes(subsub._id.toString()))
      );
    }

    // Step 5: Filter by brand (if multiple IDs are provided, filter by any of them)
    if (brand) {
      let brandIds = Array.isArray(brand) ? brand : [brand];

      // If brand is a string (likely urlName), resolve its ID
      if (!mongoose.isValidObjectId(brandIds[0])) {
        const foundBrands = await Brand.find({ urlName: { $in: brandIds } }).select("_id");
        if (!foundBrands || foundBrands.length === 0) {
          return res.status(404).json({ message: "Brands not found" });
        }
        brandIds = foundBrands.map((br) => br._id.toString());
      }

      // Filter products by brand
      products = products.filter(
        (product) => product.brand && brandIds.includes(product.brand._id.toString())
      );
    }

   // Step 6: Filter by variants using IDs
if (variants) {
  // Expect variants to be an array of variant IDs
  const variantIds = Array.isArray(variants) ? variants : [variants];

  // Validate that all provided IDs are valid ObjectIds
  const validVariantIds = variantIds.filter(id => mongoose.isValidObjectId(id));

  if (validVariantIds.length > 0) {
    // Filter products that have any of the specified variants
    products = products.filter((product) =>
      product.variants.some((variant) =>
        validVariantIds.includes(variant._id.toString())
      )
    );
  } else {
    // No valid variant IDs provided
    products = [];
  }
}


    // Step 7: Filter products by `scrollingMessageId` and discounts
    if (scrollingMessageId) {
      // Ensure `scrollingMessageId` is valid
      if (!mongoose.isValidObjectId(scrollingMessageId)) {
        return res.status(400).json({ message: "Invalid scrollingMessageId" });
      }

      // Fetch the scrolling message to validate existence
      const scrollingMessage = await ScrollingMessage.findById(scrollingMessageId).lean();
      if (!scrollingMessage) {
        return res.status(404).json({ message: "Scrolling message not found" });
      }

      // Filter products to include only those with discounts
      products = products.filter(
        (product) => product.discounts && product.discounts.length > 0
      );
    }

    // Step 8: Attach inventory details (optional, if inventory model is used)
    const productsWithInventory = await Promise.all(
      products.map(async (product) => {
        const inventory = await Inventory.findOne({
          product: product._id,
          city,
        }).select("city quantity vat");

        product.inventory = inventory || null; // Attach inventory details
        product.isOutOfStock = !inventory || inventory.quantity === 0; // Mark as out of stock
        return product;
      })
    );

    // Return filtered products
    res.json(productsWithInventory);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



const getLandingPageData = async (req, res) => {
  try {
    const { city } = req.query; // Get the city filter from the query

    // Step 1: Fetch visible categories, sorted by `sortOrder`
    const categories = await Category.find({ isShowed: true })
      .sort({ sortOrder: 1 })
      .lean();

    if (categories.length === 0) {
      return res.status(404).json({ message: "No visible categories found" });
    }

    // Step 2: Prepare category-product mapping
    const landingPageData = await Promise.all(
      categories.map(async (category) => {
        // Fetch products associated with this category
        let products = await Product.find({
          category: category._id,
          lifecycleStage: { $in: ["active"] },
        })
          .populate([
            { path: "subcategory", select: "name" },
            { path: "subsubcategory", select: "name" },
            { path: "brand", select: "name" },
            { path: "tags", select: "name" },
            {
              path: "discounts",
              populate: {
                path: "discountId",
                select: "discountType value code",
              },
            },
            { path: "dealOfTheDay", select: "startDateTime endDateTime discountType discountValue cities" },
            "variants",
            { path: "prices.city", model: "City" },
          ])
          .lean();

        // Step 3: Apply city-specific filtering (if city is provided)
        if (city) {
          products = products
            .map((product) => {
              // Filter prices, discounts, and deals of the day by city
              product.prices = product.prices?.filter(
                (price) => price.city && price.city._id.toString() === city
              ) || [];
              product.discounts = product.discounts?.filter(
                (discount) =>
                  discount.cityIds?.some((cityId) => cityId.toString() === city)
              ) || [];
              product.dealOfTheDay = product.dealOfTheDay?.filter((deal) =>
                deal.cities.some((dealCityId) => dealCityId.toString() === city)
              ) || [];

              return product.prices.length > 0 ? product : null; // Keep only valid products
            })
            .filter(Boolean); // Remove null values
        }

        // Fetch inventory for each product
        const productsWithInventory = await Promise.all(
          products.map(async (product) => {
            const inventory = await Inventory.findOne({
              product: product._id,
              city,
            }).select("city quantity vat");

            return {
              ...product,
              inventory: inventory || null,
              isOutOfStock: !inventory || inventory.quantity === 0,
            };
          })
        );

        // Step 4: Structure the category with its products
        return {
          name: category.name,
          [category.name]: productsWithInventory.map((product) => ({
            name: product.name,
            img: product.img,
            ...product, // Include all product details
          })),
        };
      })
    );

    res.status(200).json(landingPageData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


const downloadProductsData = async (req, res) => {
  try {
    const products = await Product.find()
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('subsubcategory', 'name')
      .populate('tags', 'name')
      .populate('prices.city', 'name')
      .populate({
        path: 'inventory',
        populate: {
          path: 'city',
          select: 'name'
        }
      })
      .lean();

    const fields = [
      'name',
      'sku',
      'brand',
      'category',
      'subcategory',
      'subsubcategory',
      'tags',
      'prices',
      'isBestSeller',
      'isShopByPet',
      'isNewArrival',
      'description',
      'currency',
      'meta_title',
      'meta_description',
      'image_alt_text',
      'quantity'
    ];

    const json2csvParser = new Parser({ fields });

    const csvData = products.map(product => {
      const quantities = product.prices.map(price => {
        const inventoryItem = product.inventory?.find(inv =>
          inv.city._id.toString() === price.city._id.toString()
        );
        return inventoryItem ? inventoryItem.quantity : '0';
      });

      return {
        name: product.name,
        sku: product.sku,
        brand: product.brand ? product.brand.name : '',
        category: product.category ? product.category.map(cat => cat.name).join('|') : '',
        subcategory: product.subcategory ? product.subcategory.map(sub => sub.name).join('|') : '',
        subsubcategory: product.subsubcategory ? product.subsubcategory.map(subsub => subsub.name).join('|') : '',
        tags: product.tags ? product.tags.map(tag => tag.name).join('|') : '',
        prices: product.prices ? product.prices.map(price =>
          `${price.city.name}:${price.amount}:${price.salePrice || ''}`
        ).join('|') : '',
        isBestSeller: product.isBestSeller || false,
        isShopByPet: product.isShopByPet || false,
        isNewArrival: product.isNewArrival || false,
        description: product.description || '',
        currency: product.currency || '',
        meta_title: product.meta_title || '',
        meta_description: product.meta_description || '',
        image_alt_text: product.image_alt_text || '',
        quantity: quantities.join('|')
      };
    });

    const csv = json2csvParser.parse(csvData);

    res.header('Content-Type', 'text/csv');
    res.attachment('products_data.csv');
    res.send(csv);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


const bulkUpdateProducts = async (req, res) => {
  try {
    const { productIds, updates } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ message: "Product IDs array is required" });
    }

    // Validate all product IDs exist
    const existingProducts = await Product.find({ _id: { $in: productIds } });
    if (existingProducts.length !== productIds.length) {
      return res.status(400).json({ message: "Some product IDs are invalid" });
    }

    const updateData = {};

    // Handle category updates
    if (updates.category) {
      const categoryIds = Array.isArray(updates.category)
        ? updates.category
        : [updates.category];
      const validCategories = await Category.find({
        _id: { $in: categoryIds },
      });
      if (validCategories.length !== categoryIds.length) {
        return res.status(400).json({ message: "Invalid category IDs" });
      }
      updateData.category = categoryIds;
    }

    // Handle subcategory updates
    if (updates.subcategory) {
      const subcategoryIds = Array.isArray(updates.subcategory)
        ? updates.subcategory
        : [updates.subcategory];
      const validSubcategories = await SubCategory.find({
        _id: { $in: subcategoryIds },
      });
      if (validSubcategories.length !== subcategoryIds.length) {
        return res.status(400).json({ message: "Invalid subcategory IDs" });
      }
      updateData.subcategory = subcategoryIds;
    }

    // Handle subsubcategory updates
    if (updates.subsubcategory) {
      const subsubcategoryIds = Array.isArray(updates.subsubcategory)
        ? updates.subsubcategory
        : [updates.subsubcategory];
      const validSubsubcategories = await SubSubCategory.find({
        _id: { $in: subsubcategoryIds },
      });
      if (validSubsubcategories.length !== subsubcategoryIds.length) {
        return res.status(400).json({ message: "Invalid subsubcategory IDs" });
      }
      updateData.subsubcategory = subsubcategoryIds;
    }

    // Handle brand updates
    if (updates.brandId) {
      const brand = await Brand.findById(updates.brandId);
      if (!brand) {
        return res.status(400).json({ message: "Invalid brand ID" });
      }
      updateData.brand = updates.brandId;
    }

    // Handle boolean updates
    if (updates.isBestSeller !== undefined)
      updateData.isBestSeller = updates.isBestSeller;
    if (updates.isShopByPet !== undefined)
      updateData.isShopByPet = updates.isShopByPet;
    if (updates.isNewArrival !== undefined)
      updateData.isNewArrival = updates.isNewArrival;

    // Handle variationId updates
    if (updates.variationId) {
      updateData.variationId = updates.variationId;
    }

    // Handle variants updates
    if (updates.variants) {
      const variantIds = Array.isArray(updates.variants)
        ? updates.variants
        : [updates.variants];
      const validVariants = await ProductVariant.find({
        _id: { $in: variantIds },
      });
      if (validVariants.length !== variantIds.length) {
        return res.status(400).json({ message: "Invalid variant IDs" });
      }
      updateData.variants = variantIds;
    }

    // Handle tags updates
    if (updates.tags) {
      const tagIds = Array.isArray(updates.tags)
        ? updates.tags
        : [updates.tags];
      const validTags = await Tag.find({ _id: { $in: tagIds } });
      if (validTags.length !== tagIds.length) {
        return res.status(400).json({ message: "Invalid tag IDs" });
      }
      updateData.tags = tagIds;
    }

    // Handle lifecycle stage updates
    if (updates.lifecycleStage) {
      if (
        !["active", "discontinued", "upcoming", "archived"].includes(
          updates.lifecycleStage
        )
      ) {
        return res.status(400).json({ message: "Invalid lifecycle stage" });
      }
      updateData.lifecycleStage = updates.lifecycleStage;
    }

    // Add these sections inside the try block, before the final updateMany

    // Handle prices updates
    if (updates.prices) {
      const cityIds = updates.prices.map((price) => price.city);
      const uniqueCityIds = new Set(cityIds);

      if (uniqueCityIds.size !== cityIds.length) {
        return res.status(400).json({
          message: "Each city should be included only once in prices.",
        });
      }

      // Validate cities exist
      const validCities = await City.find({ _id: { $in: cityIds } });
      if (validCities.length !== cityIds.length) {
        return res.status(400).json({ message: "Invalid city IDs in prices" });
      }

      updateData.prices = updates.prices;
    }

    // Handle videoLink
    if (updates.videoLink) {
      updateData.videoLink = updates.videoLink;
    }

    // Handle releaseDate
    if (updates.releaseDate) {
      updateData.releaseDate = new Date(updates.releaseDate);
    }

    // Handle product_url
    if (updates.product_url) {
      updateData.product_url = updates.product_url;
    }

    // Handle sku (with validation)
    if (updates.sku) {
      const skuExists = await Product.findOne({
        sku: updates.sku,
        _id: { $nin: productIds },
      });
      if (skuExists) {
        return res.status(400).json({ message: "SKU already exists" });
      }
      updateData.sku = updates.sku;
    }

    // Handle other common fields
    if (updates.description) updateData.description = updates.description;
    if (updates.currency) updateData.currency = updates.currency;
    if (updates.meta_title) updateData.meta_title = updates.meta_title;
    if (updates.meta_description)
      updateData.meta_description = updates.meta_description;
    if (updates.image_alt_text)
      updateData.image_alt_text = updates.image_alt_text;

    // Perform bulk update
    const result = await Product.updateMany(
      { _id: { $in: productIds } },
      { $set: updateData },
      { new: true }
    );

    res.status(200).json({
      message: "Products updated successfully",
      updatedCount: result.modifiedCount,
      updates: updateData,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};





  
module.exports = {
    createProduct,
    getNewProducts,
    bulkUploadProducts,
    getAllProducts,
    getProductById,
    getProductFiltersAndProducts,
    updateProduct,
    deleteProducts,
    createSampleCsvTemplate,
    getPublicProducts,
    updateProductLifecycle,
    getFilteredProducts,
    getSidebarFilters,
    getLandingPageData,
    getNewArrivalProducts,
    getBestSellerProducts,
    getShopByPetProducts,
    downloadProductsData,
    bulkUpdateProducts,
    getProductsByCategory,
    getProductsByCategoryId,
    searchProducts,
    getAllProductsForSearch
};
