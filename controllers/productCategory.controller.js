const { Category, SubCategory, SubSubCategory } = require('../models/productCategory.model.js');
const { deleteFile } = require('../config/fileOperations');
const fs = require('fs').promises;
const path = require('path');
const Product = require('../models/product.model.js');
const csvParser = require('csv-parser');
const fss = require('fs');
const { Parser } = require('json2csv');
const {
    cascadeDeleteForCategoryTree,
    cascadeDeleteBySubcategoryIds,
    cascadeDeleteBySubSubCategoryIds,
} = require('../services/catalogCascadeDelete.service');

// new category filter to exclude deleted categories and subcategories
const notDeletedFilter = { isDeleted: { $ne: true } };

const parseAllowedRoles = (value) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (Array.isArray(value)) return value.filter(Boolean);
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch (_) {}
    return String(value).split(',').map((v) => v.trim()).filter(Boolean);
};


const createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    const allowedRoles = parseAllowedRoles(req.body.allowedRoles);

    // Log the entire req.file object
    //console.log('Uploaded File:', req.file);

    const image = req.file ? path.basename(req.file.path) : null; // Extract only the filename

    // Check if the name is provided
    if (!name) {
      if (req.file) {
        // Delete the uploaded image if it exists
        await deleteFile(req.file.path);
      }
      return res.status(400).json({ message: "Name is required" });
    }

    // Log the extracted image filename to ensure it's correct
    //console.log('Image Filename:', image);

    const formattedName = name.trim().toUpperCase();

    // Check for existing category with the formatted name
    const existingCategory = await Category.findOne({ name: formattedName, ...notDeletedFilter });
    if (existingCategory) {
      if (image) {
        // Delete the uploaded image if duplicate category exists
        await deleteFile(req.file.path);
      }
      return res
        .status(400)
        .json({ message: "Category with this name already exists" });
    }

    // Create and save the new category
    const category = new Category({
      name: formattedName,
      description,
      image,
      allowedRoles: allowedRoles || [],
    });
    await category.save();

    res.status(201).json(category);
  } catch (error) {
    if (req.file) {
      // Delete the uploaded image if any error occurs
      await deleteFile(req.file.path);
    }
    res.status(400).json({ message: error.message });
  }
};


// new pi sub category to get sub sub category:
const getSubSubCategoriesBySubCategoryId = async (req, res) => {
    try {
        const subCategoryId = req.params.subCategoryId;
    const subSubCategories = await SubSubCategory.find({ parentSubCategory: subCategoryId, ...notDeletedFilter })
            .populate('parentSubCategory');

        const subSubCategoriesWithCount = await Promise.all(subSubCategories.map(async (subSubCategory) => {
            const productCount = await Product.countDocuments({ subSubCategory: subSubCategory._id });
            return {
                ...subSubCategory.toObject(),
                productCount
            };
        }));

        res.status(200).json(subSubCategoriesWithCount);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


const bulkUploadCategories = async (req, res) => {
    if (!req.file || path.extname(req.file.originalname) !== '.csv') {
        return res.status(400).json({ message: 'Please upload a valid CSV file.' });
    }

    const categoriesToCreate = [];
    const existingCategories = new Set();
    let totalProcessed = 0;

    const capitalizeFirstLetter = (string) => {
        return string.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    };

    // First, get all existing category names
    const existingCats = await Category.find(notDeletedFilter, 'name');
    existingCats.forEach(cat => existingCategories.add(cat.name.toLowerCase().trim()));

    await new Promise((resolve, reject) => {
        fss.createReadStream(req.file.path)
            .pipe(csvParser())
            .on('data', (row) => {
                const name = row.name ? row.name.trim().toLowerCase() : '';
                const description = row.description ? row.description.trim() : '';

                if (name) {
                    totalProcessed++;
                    if (!existingCategories.has(name)) {
                        const capitalizedName = capitalizeFirstLetter(row.name.trim());
                        categoriesToCreate.push({ name: capitalizedName, description });
                        existingCategories.add(name);
                    }
                }
            })
            .on('end', resolve)
            .on('error', reject);
    });

    try {
        const createdCategories = await Category.insertMany(categoriesToCreate, { ordered: false });
        
        fss.unlink(req.file.path, (err) => {
            if (err) console.error('Error deleting CSV file:', err);
        });

        res.status(200).json({ 
            message: 'Bulk upload completed successfully.', 
            created: createdCategories.length,
            skipped: totalProcessed - createdCategories.length
        });
    } catch (error) {
        console.error('Bulk upload error:', error);
        fss.unlink(req.file.path, (err) => {
            if (err) console.error('Error deleting CSV file:', err);
        });
        res.status(500).json({ message: 'Bulk upload failed.', error: error.message });
    }
};


const downloadCategoriesCsvTemplate = (req, res) => {
    const headers = 'name,description\n'; // Define the headers without quotes and with a newline at the end

    res.header('Content-Type', 'text/csv');
    res.attachment('categories_template.csv');
    res.send(headers); // Only send headers, no data rows
};




const createSubcategory = async (req, res) => {
    try {
        const { parentCategory, name, description } = req.body;
        // Validate required fields
        if (!name || !parentCategory) {
            if (req.file) {
                // Delete the uploaded image if it exists
                await deleteFile(req.file.path);
            }
            return res.status(400).json({ message: 'Name and Parent Category are required' });
        }
        const image = req.file ? path.basename(req.file.path) : null; // Extract only the filename

       // Check if the parent category exists (optional)
        const parentCategoryExists = await Category.findOne({ _id: parentCategory, ...notDeletedFilter });
        if (!parentCategoryExists) {
            if (req.file) await deleteFile(req.file.path);
            return res.status(400).json({ message: 'Parent Category does not exist' });
        }

        const subcategory = new SubCategory({ name, description, image, parentCategory });
        await subcategory.save();

        res.status(201).json(subcategory);
    } catch (error) {
        if (req.file) {
            await deleteFile(req.file.path);
        }
        res.status(400).json({ message: error.message });
    }
};

const downloadSubCategoriesCsvTemplate = (req, res) => {
    const headers = 'name,parentCategory,description\n'; // Define the headers without quotes and with a newline at the end

    res.header('Content-Type', 'text/csv');
    res.attachment('subcategories_template.csv');
    res.send(headers); // Only send headers, no data rows
};


const bulkUploadSubCategories = async (req, res) => {
    if (!req.file || path.extname(req.file.originalname) !== '.csv') {
        return res.status(400).json({ message: 'Please upload a valid CSV file.' });
    }

    const subCategoriesToCreate = [];
    const existingSubCategories = new Set();
    const existingCategoriesMap = new Map();
    let totalProcessed = 0;

    const capitalizeFirstLetter = (string) => {
        return string.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    };

    // Fetch existing subcategory names and all categories with their IDs
    const [existingSubs, categories] = await Promise.all([
        SubCategory.find(notDeletedFilter, 'name').lean(),
        Category.find(notDeletedFilter, 'name').lean()
    ]);

    existingSubs.forEach(sub => existingSubCategories.add(sub.name.toLowerCase().trim()));
    categories.forEach(cat => existingCategoriesMap.set(cat.name.toLowerCase().trim(), cat._id));

    await new Promise((resolve, reject) => {
        fss.createReadStream(req.file.path)
            .pipe(csvParser())
            .on('data', (row) => {
                const name = row.name ? row.name.trim().toLowerCase() : '';
                const description = row.description ? row.description.trim() : '';
                const parentCategoryName = row.parentCategory ? row.parentCategory.trim().toLowerCase() : '';

                // Only process if name and parentCategory are provided
                if (name && parentCategoryName) {
                    totalProcessed++;

                    // Check if the subcategory already exists or if parent category is valid
                    if (!existingSubCategories.has(name) && existingCategoriesMap.has(parentCategoryName)) {
                        const capitalizedName = capitalizeFirstLetter(row.name.trim());
                        const parentCategoryId = existingCategoriesMap.get(parentCategoryName);

                        subCategoriesToCreate.push({
                            name: capitalizedName,
                            description,
                            parentCategory: parentCategoryId
                        });

                        existingSubCategories.add(name); // Prevent duplication in this bulk upload
                    }
                }
            })
            .on('end', resolve)
            .on('error', reject);
    });

    try {
        const createdSubCategories = await SubCategory.insertMany(subCategoriesToCreate, { ordered: false });

        fss.unlink(req.file.path, (err) => {
            if (err) console.error('Error deleting CSV file:', err);
        });

        res.status(200).json({
            message: 'Bulk upload completed successfully.',
            created: createdSubCategories.length,
            skipped: totalProcessed - createdSubCategories.length
        });
    } catch (error) {
        console.error('Bulk upload error:', error);
        fss.unlink(req.file.path, (err) => {
            if (err) console.error('Error deleting CSV file:', err);
        });
        res.status(500).json({ message: 'Bulk upload failed.', error: error.message });
    }
};

const getAllCategories = async (req, res) => {
    try {
        const categories = await Category.find(notDeletedFilter).populate('allowedRoles', 'role_name');
        const categoriesWithCount = await Promise.all(categories.map(async (category) => {
            const productCount = await Product.countDocuments({ category: category._id });
            return {
                ...category.toObject(),
                productCount
            };
        }));
        res.status(200).json(categoriesWithCount);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const getSubcategoriesByCategoryId = async (req, res) => {
    try {
        const categoryId = req.params.categoryId;
        const subcategories = await SubCategory.find({ parentCategory: categoryId, ...notDeletedFilter });
        res.status(200).json(subcategories);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};




const getPublicCategories = async (req, res) => {
    try {
        // Find only the categories with `isNotShowed: false`
        const categories = await Category.find({ isNotShowed: false, ...notDeletedFilter }).populate('allowedRoles', 'role_name');
        
        // Calculate the product count for each public category
        const categoriesWithCount = await Promise.all(categories.map(async (category) => {
            const productCount = await Product.countDocuments({ category: category._id });
            return {
                ...category.toObject(),
                productCount
            };
        }));
        
        res.status(200).json(categoriesWithCount);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const getAllSubcategories = async (req, res) => {
    try {
        const subcategories = await SubCategory.find(notDeletedFilter).populate('parentCategory');
        const subcategoriesWithCount = await Promise.all(subcategories.map(async (subcategory) => {
            const productCount = await Product.countDocuments({ subcategory: subcategory._id });
            return {
                ...subcategory.toObject(),
                productCount
            };
        }));
        res.status(200).json(subcategoriesWithCount);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const getCategoriesWithSubcategories = async (req, res) => {
    try {
        const categories = await Category.find({ isNotShowed: false, ...notDeletedFilter }); // Only get categories that are not hidden
        const categoriesWithSubs = await Promise.all(categories.map(async (category) => {
            const subcategories = await SubCategory.find({ parentCategory: category._id, ...notDeletedFilter });
            const productCount = await Product.find({ category: category._id }).countDocuments();
            return {
                ...category.toObject(),
                productCount,
                subcategories: await Promise.all(subcategories.map(async (sub) => ({
                    ...sub.toObject(),
                    productCount: await Product.find({ subcategory: sub._id }).countDocuments()
                })))
            };
        }));
        res.status(200).json(categoriesWithSubs);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const toggleCategoryVisibility = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        // Toggle the visibility
        category.isNotShowed = !category.isNotShowed;
        await category.save();

        res.status(200).json({ message: 'Category visibility updated', category });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


const updateCategory = async (req, res) => {
    let oldImagePath;
    try {
        const { id } = req.params;
        const { name, description } = req.body;
        const allowedRoles = parseAllowedRoles(req.body.allowedRoles);
        const newImagePath = req.file ? path.basename(req.file.path) : undefined;

        // Find the category by ID
        const category = await Category.findById(id);
        if (!category) {
            if (newImagePath) await deleteFile(req.file.path); // Delete new image if category is not found
            return res.status(404).json({ message: 'Category not found' });
        }

        // Validate and format the name if provided
        if (name && name !== category.name) {
            const formattedName = name.trim().toUpperCase();

            const existingCategory = await Category.findOne({ name: formattedName, _id: { $ne: id }, ...notDeletedFilter });
            if (existingCategory) {
                if (newImagePath) await deleteFile(req.file.path); // Delete new image if name is duplicate
                return res.status(400).json({ message: 'Category with this name already exists' });
            }

            category.name = formattedName;
        }

        // Update description if provided
        if (description) category.description = description;
        if (allowedRoles !== undefined) category.allowedRoles = allowedRoles;

        // Update the image if a new one is uploaded
        if (newImagePath) {
            oldImagePath = category.image; // Store the old image path
            category.image = newImagePath; // Update to the new image path
        }

        // Save the updated category
        await category.save();

        // Delete the old image if a new one is set
        if (oldImagePath) {
            await deleteFile(path.join('uploads', 'images', oldImagePath));
        }

        res.status(200).json(category);
    } catch (error) {
        if (req.file) {
            // Delete the uploaded image if any error occurs
            await deleteFile(req.file.path);
        }
        res.status(400).json({ message: error.message });
    }
};



const updateSubcategory = async (req, res) => {
    let oldImagePath;
    try {
        const { id } = req.params;
        const { name, description, parentCategory } = req.body;
        const newImagePath = req.file ? path.basename(req.file.path) : undefined;

        const subcategory = await SubCategory.findById(id);
        if (!subcategory) {
            if (newImagePath) await deleteFile(req.file.path);
            return res.status(404).json({ message: 'Subcategory not found' });
        }

        if (name && name !== subcategory.name) {
            const existingSubcategory = await SubCategory.findOne({ name, parentCategory: subcategory.parentCategory, _id: { $ne: id }, ...notDeletedFilter });
            if (existingSubcategory) {
                if (newImagePath) await deleteFile(req.file.path);
                return res.status(400).json({ message: 'Subcategory with this name already exists in the parent category' });
            }
            subcategory.name = name;
        }

        if (description) subcategory.description = description;
        if (parentCategory) {
            const parentCategoryExists = await Category.findOne({ _id: parentCategory, ...notDeletedFilter });
            if (!parentCategoryExists) {
                if (newImagePath) await deleteFile(req.file.path);
                return res.status(400).json({ message: 'Parent Category does not exist' });
            }
            subcategory.parentCategory = parentCategory;
        }
        if (newImagePath) {
            oldImagePath = subcategory.image;
            subcategory.image = newImagePath;
        }

        await subcategory.save();

        if (oldImagePath) await deleteFile(path.join('uploads', 'images', oldImagePath));

        res.status(200).json(subcategory);
    } catch (error) {
        if (req.file) {
            await deleteFile(req.file.path);
        }
        res.status(400).json({ message: error.message });
    }
};


const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await Category.findOne({ _id: id, ...notDeletedFilter });
        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        const subcategoryIds = await SubCategory.find({ parentCategory: id, ...notDeletedFilter }).distinct('_id');
        const subSubCategoryIds = subcategoryIds.length
            ? await SubSubCategory.find({ parentSubCategory: { $in: subcategoryIds }, ...notDeletedFilter }).distinct('_id')
            : [];

        const cascade = await cascadeDeleteForCategoryTree({
            categoryIds: [id],
            subcategoryIds,
            subSubCategoryIds,
        });

        await Category.updateOne({ _id: id }, { $set: { isDeleted: true } });
        await SubCategory.updateMany({ parentCategory: id }, { $set: { isDeleted: true } });
        if (subcategoryIds.length) {
            await SubSubCategory.updateMany({ parentSubCategory: { $in: subcategoryIds } }, { $set: { isDeleted: true } });
        }

        res.status(200).json({
            message: 'Category and associated catalog data deleted successfully',
            cascade,
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const deleteSubcategory = async (req, res) => {
    try {
        const { id } = req.params;
        const subcategory = await SubCategory.findOne({ _id: id, ...notDeletedFilter });
        if (!subcategory) {
            return res.status(404).json({ message: 'Subcategory not found' });
        }

        const subSubCategoryIds = await SubSubCategory.find({
            parentSubCategory: id,
            ...notDeletedFilter,
        }).distinct('_id');

        const cascade = await cascadeDeleteBySubcategoryIds([id], subSubCategoryIds);

        await SubCategory.updateOne({ _id: id }, { $set: { isDeleted: true } });
        await SubSubCategory.updateMany({ parentSubCategory: id }, { $set: { isDeleted: true } });

        res.status(200).json({
            message: 'Subcategory and associated catalog data deleted successfully',
            cascade,
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const deleteCategoriesBulk = async (req, res) => {
    try {
        const { ids } = req.body; // Expecting an array of IDs
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: 'Invalid IDs provided' });
        }

        const categories = await Category.find({ _id: { $in: ids }, ...notDeletedFilter });
        if (categories.length === 0) {
            return res.status(404).json({ message: 'No categories found' });
        }

        const categoryIds = categories.map((category) => category._id);
        const subcategoryIds = await SubCategory.find({ parentCategory: { $in: categoryIds }, ...notDeletedFilter }).distinct('_id');
        const subSubCategoryIds = subcategoryIds.length
            ? await SubSubCategory.find({ parentSubCategory: { $in: subcategoryIds }, ...notDeletedFilter }).distinct('_id')
            : [];

        const cascade = await cascadeDeleteForCategoryTree({
            categoryIds,
            subcategoryIds,
            subSubCategoryIds,
        });

        await Category.updateMany({ _id: { $in: categoryIds } }, { $set: { isDeleted: true } });
        await SubCategory.updateMany({ parentCategory: { $in: categoryIds } }, { $set: { isDeleted: true } });
        if (subcategoryIds.length) {
            await SubSubCategory.updateMany({ parentSubCategory: { $in: subcategoryIds } }, { $set: { isDeleted: true } });
        }

        res.status(200).json({
            message: 'Categories and associated catalog data deleted successfully',
            cascade,
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const deleteSubcategoriesBulk = async (req, res) => {
    try {
        const { ids } = req.body; // Expecting an array of IDs
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: 'Invalid IDs provided' });
        }

        const subcategories = await SubCategory.find({ _id: { $in: ids }, ...notDeletedFilter });
        if (subcategories.length === 0) {
            return res.status(404).json({ message: 'No subcategories found' });
        }

        const subcategoryIds = subcategories.map((subcategory) => subcategory._id);
        const subSubCategoryIds = await SubSubCategory.find({
            parentSubCategory: { $in: subcategoryIds },
            ...notDeletedFilter,
        }).distinct('_id');

        const cascade = await cascadeDeleteBySubcategoryIds(subcategoryIds, subSubCategoryIds);

        await SubCategory.updateMany({ _id: { $in: subcategoryIds } }, { $set: { isDeleted: true } });
        await SubSubCategory.updateMany({ parentSubCategory: { $in: subcategoryIds } }, { $set: { isDeleted: true } });

        res.status(200).json({
            message: 'Subcategories and associated catalog data deleted successfully',
            cascade,
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const createSubSubCategory = async (req, res) => {
    try {
        const { parentSubCategory, name, description } = req.body;
        if (!name || !parentSubCategory) {
            if (req.file) {
                await deleteFile(req.file.path);
            }
            return res.status(400).json({ message: 'Name and Parent SubCategory are required' });
        }
        
        const image = req.file ? path.basename(req.file.path) : null;
        
        const parentSubCategoryExists = await SubCategory.findOne({ _id: parentSubCategory, ...notDeletedFilter });
        if (!parentSubCategoryExists) {
            if (req.file) await deleteFile(req.file.path);
            return res.status(400).json({ message: 'Parent SubCategory does not exist' });
        }

        const subSubCategory = new SubSubCategory({ name, description, image, parentSubCategory });
        await subSubCategory.save();

        res.status(201).json(subSubCategory);
    } catch (error) {
        if (req.file) {
            await deleteFile(req.file.path);
        }
        res.status(400).json({ message: error.message });
    }
};



const deleteSubSubCategoriesBulk = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: 'Invalid IDs provided' });
        }

        const subSubCategories = await SubSubCategory.find({ _id: { $in: ids }, ...notDeletedFilter });
        if (subSubCategories.length === 0) {
            return res.status(404).json({ message: 'No sub-sub-categories found' });
        }

        const subSubIds = subSubCategories.map((subSubCategory) => subSubCategory._id);
        const cascade = await cascadeDeleteBySubSubCategoryIds(subSubIds);

        await SubSubCategory.updateMany(
            { _id: { $in: subSubIds } },
            { $set: { isDeleted: true } }
        );

        res.status(200).json({
            message: 'Sub-sub-categories and associated catalog data deleted successfully',
            cascade,
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const updateSubSubCategory = async (req, res) => {
    let oldImagePath;
    try {
        const { id } = req.params;
        const { name, description, parentSubCategory } = req.body;
        const newImagePath = req.file ? path.basename(req.file.path) : undefined;

        const subSubCategory = await SubSubCategory.findById(id);
        if (!subSubCategory) {
            if (newImagePath) await deleteFile(req.file.path);
            return res.status(404).json({ message: 'Sub-sub-category not found' });
        }

        if (name) subSubCategory.name = name;
        if (description) subSubCategory.description = description;
        
        if (parentSubCategory) {
            const parentSubCategoryExists = await SubCategory.findOne({ _id: parentSubCategory, ...notDeletedFilter });
            if (!parentSubCategoryExists) {
                if (newImagePath) await deleteFile(req.file.path);
                return res.status(400).json({ message: 'Parent SubCategory does not exist' });
            }
            subSubCategory.parentSubCategory = parentSubCategory;
        }

        if (newImagePath) {
            oldImagePath = subSubCategory.image;
            subSubCategory.image = newImagePath;
        }

        await subSubCategory.save();

        if (oldImagePath) {
            await deleteFile(path.join('uploads', 'images', oldImagePath));
        }

        res.status(200).json(subSubCategory);
    } catch (error) {
        if (req.file) {
            await deleteFile(req.file.path);
        }
        res.status(400).json({ message: error.message });
    }
};

// const getAllSubSubCategories = async (req, res) => {
//     try {
//         const subSubCategories = await SubSubCategory.find().populate('parentSubCategory');
//         const subSubCategoriesWithCount = await Promise.all(subSubCategories.map(async (subSubCategory) => {
//             const productCount = await Product.countDocuments({ subSubCategory: subSubCategory._id });
//             return {
//                 ...subSubCategory.toObject(),
//                 productCount
//             };
//         }));
//         res.status(200).json(subSubCategoriesWithCount);
//     } catch (error) {
//         res.status(400).json({ message: error.message });
//     }
// };



const getAllSubSubCategories = async (req, res) => {
    try {
        const subSubCategories = await SubSubCategory.find(notDeletedFilter)
            .populate({
                path: 'parentSubCategory',
                select: 'name',
                populate: {
                    path: 'parentCategory',
                    select: 'name'
                }
            });
            
        const subSubCategoriesWithCount = await Promise.all(subSubCategories.map(async (subSubCategory) => {
            const productCount = await Product.countDocuments({ subSubCategory: subSubCategory._id });
            return {
                ...subSubCategory.toObject(),
                productCount
            };
        }));
        res.status(200).json(subSubCategoriesWithCount);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};




const bulkUploadSubSubCategories = async (req, res) => {
    if (!req.file || path.extname(req.file.originalname) !== '.csv') {
        return res.status(400).json({ message: 'Please upload a valid CSV file.' });
    }

    const subSubCategoriesToCreate = [];
    const existingSubSubCategories = new Set();
    const existingSubCategoriesMap = new Map();
    let totalProcessed = 0;

    const [existingSubSubs, subCategories] = await Promise.all([
        SubSubCategory.find(notDeletedFilter, 'name').lean(),
        SubCategory.find(notDeletedFilter, 'name').lean()
    ]);

    existingSubSubs.forEach(sub => existingSubSubCategories.add(sub.name.toLowerCase().trim()));
    subCategories.forEach(sub => existingSubCategoriesMap.set(sub.name.toLowerCase().trim(), sub._id));

    await new Promise((resolve, reject) => {
        fss.createReadStream(req.file.path)
            .pipe(csvParser())
            .on('data', (row) => {
                const name = row.name ? row.name.trim() : '';
                const description = row.description ? row.description.trim() : '';
                const parentSubCategoryName = row.parentSubCategory ? row.parentSubCategory.trim().toLowerCase() : '';

                if (name && parentSubCategoryName) {
                    totalProcessed++;
                    if (!existingSubSubCategories.has(name.toLowerCase()) && existingSubCategoriesMap.has(parentSubCategoryName)) {
                        subSubCategoriesToCreate.push({
                            name,
                            description,
                            parentSubCategory: existingSubCategoriesMap.get(parentSubCategoryName)
                        });
                        existingSubSubCategories.add(name.toLowerCase());
                    }
                }
            })
            .on('end', resolve)
            .on('error', reject);
    });

    try {
        const createdSubSubCategories = await SubSubCategory.insertMany(subSubCategoriesToCreate, { ordered: false });
        
        fss.unlink(req.file.path, (err) => {
            if (err) console.error('Error deleting CSV file:', err);
        });

        res.status(200).json({
            message: 'Bulk upload completed successfully.',
            created: createdSubSubCategories.length,
            skipped: totalProcessed - createdSubSubCategories.length
        });
    } catch (error) {
        fss.unlink(req.file.path, (err) => {
            if (err) console.error('Error deleting CSV file:', err);
        });
        res.status(500).json({ message: 'Bulk upload failed.', error: error.message });
    }
};

const downloadSubSubCategoriesTemplate = (req, res) => {
    const headers = 'name,parentSubCategory,description\n';
    res.header('Content-Type', 'text/csv');
    res.attachment('subsubcategories_template.csv');
    res.send(headers);
};






module.exports = {
    createCategory,
    createSubcategory,
    getAllCategories,
    getAllSubcategories,
    updateCategory,
    updateSubcategory,
    deleteCategory,
    deleteSubcategory,
    getCategoriesWithSubcategories,
    toggleCategoryVisibility,
    deleteCategoriesBulk,
    deleteSubcategoriesBulk,
    bulkUploadCategories,
    bulkUploadSubCategories,
    downloadCategoriesCsvTemplate,
    downloadSubCategoriesCsvTemplate,
    getPublicCategories,
    createSubSubCategory,
    deleteSubSubCategoriesBulk,
    getAllSubSubCategories,
    getSubcategoriesByCategoryId,
    updateSubSubCategory,
    bulkUploadSubSubCategories,
    downloadSubSubCategoriesTemplate,
    getSubSubCategoriesBySubCategoryId
};
