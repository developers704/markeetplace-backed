const Inventory = require('../models/inventory.model');
const Product = require('../models/product.model');
const ProductVariant = require('../models/productVarriant.model');
const VariantName = require('../models/variantName.model');

// Create a variant name with unique validation
const createVariantName = async (req, res) => {
    try {
        const { name, parentVariant} = req.body;

        // Check if the name already exists
        const existingVariant = await VariantName.findOne({ name });
        if (existingVariant) {
            return res.status(400).json({ message: 'Variant name already exists' });
        }

        const variantName = new VariantName({ name, parentVariant  });
        await variantName.save();

        res.status(201).json({ 
            message: 'Variant name created successfully', 
            variantName 
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Get all variant names
const getAllVariantNames = async (req, res) => {
    try {
        const variantNames = await VariantName.find().populate('parentVariant', 'name');
        res.status(200).json(variantNames);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Update a variant name with unique validation
const updateVariantName = async (req, res) => {
    try {
        const { id } = req.params;
        const { name , parentVariant} = req.body;

        // Check if the new name is already used by another variant
        const existingVariant = await VariantName.findOne({ name, _id: { $ne: id } });
        if (existingVariant) {
            return res.status(400).json({ message: 'Variant name already exists' });
        }

        const variantName = await VariantName.findByIdAndUpdate(id, { name,parentVariant}, { new: true });
        if (!variantName) {
            return res.status(404).json({ message: 'Variant name not found' });
        }

        res.status(200).json(variantName);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Bulk delete variant names and related product variants
const bulkDeleteVariantNames = async (req, res) => {
    try {
        const { ids } = req.body; // Array of variant name IDs

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: 'No variant name IDs provided' });
        }

        // Delete related product variants using the variantName field
        const deletedProductVariantsResult = await ProductVariant.deleteMany({ variantName: { $in: ids } });

        // Now delete the variant names
        const result = await VariantName.deleteMany({ _id: { $in: ids } });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'No variant names found to delete' });
        }

        res.status(200).json({
            message: `${result.deletedCount} variant names deleted successfully, along with ${deletedProductVariantsResult.deletedCount} related product variants deleted.`
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};



const createProductVariant = async (req, res) => {
    try {
        const { variantName, values } = req.body;

        // Check if the variantName exists
        const existingVariantName = await VariantName.findById(variantName);
        if (!existingVariantName) {
            return res.status(404).json({ message: 'Variant name not found' });
        }

        if (!Array.isArray(values) || values.length === 0) {
            return res.status(400).json({ message: 'Enter value and click '+' button to add multiple values' });
        }

        // Find existing product variants with the same variantName and values
        const existingValues = await ProductVariant.find({
            variantName,
            value: { $in: values }
        }).select('value');

        // Get a set of existing values to easily check for duplicates
        const existingValuesSet = new Set(existingValues.map(variant => variant.value.toLowerCase()));

        // Filter out values that are already in the database
        const newVariants = values
            .filter(value => !existingValuesSet.has(value.toLowerCase()))
            .map(value => ({ variantName, value }));

        if (newVariants.length === 0) {
            return res.status(400).json({ message: 'All provided values already exist.' });
        }

        // Insert new variants using insertMany
        const createdVariants = await ProductVariant.insertMany(newVariants, { ordered: false });

        res.status(201).json({
            message: 'Product variants created successfully',
            createdVariants,
            skipped: values.length - createdVariants.length // Count of duplicates
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};






// const getAllProductVariants = async (req, res) => {
//     try {
//         const {productId} = req.params;

//         const productVariants = await ProductVariant.find()
//             .populate({
//                 path: 'variantName',
//                 select: 'name parentVariant',
//                 populate: {
//                     path: 'parentVariant',
//                     select: 'name'
//                 }
//             });
//         res.status(200).json(productVariants);
//     } catch (error) {
//         res.status(400).json({ message: error.message });
//     }
// };
// const getAllProductVariants = async (req, res) => {
//   try {
//     const { categoryId, subCategoryId } = req.params;

//     // Step 1: Get products by category & subcategory
//     const products = await Product.find(
//       {
//         category: categoryId,
//         subcategory: subCategoryId
//       },
//       { variants: 1 } // sirf variants chahiye
//     ).lean();

//     // Step 2: Collect unique variant IDs
//     const variantIds = [
//       ...new Set(
//         products.flatMap(p => p.variants || [])
//       )
//     ];

//     if (!variantIds.length) {
//       return res.status(200).json({
//         success: true,
//         data: []
//       });
//     }

//     // Step 3: Get variants using those IDs
//     const variants = await ProductVariant.find({
//       _id: { $in: variantIds }
//     })
//     .populate({
//       path: 'variantName',
//       select: 'name parentVariant',
//       populate: {
//         path: 'parentVariant',
//         select: 'name'
//       }
//     });

//     res.status(200).json({
//       success: true,
//       count: variants.length,
//       data: variants
//     });

//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: error.message
//     });
//   }
// };
const getAllProductVariants = async (req, res) => {
  try {
    const { categoryId, subCategoryId } = req.params;

    // Step 1: Find products in the category/subcategory that have available inventory
    const inventories = await Inventory.find({
      quantity: { $gt: 0 }
    })
    .populate({
      path: 'product',
      match: {
        category: categoryId,
        subcategory: subCategoryId
      },
      select: 'variants'
    })
    .lean();

    // Step 2: Collect all variant IDs from available products
    const variantIds = [
      ...new Set(
        inventories
          .map(inv => inv.product)       // take product from inventory
          .filter(Boolean)               // remove nulls
          .flatMap(p => p.variants || []) // collect variant IDs
      )
    ];

    if (!variantIds.length) {
      return res.status(200).json({
        success: true,
        data: []
      });
    }

    // Step 3: Get variant details
    const variants = await ProductVariant.find({
      _id: { $in: variantIds }
    })
    .populate({
      path: 'variantName',
      select: 'name parentVariant',
      populate: { path: 'parentVariant', select: 'name' }
    });

    res.status(200).json({
      success: true,
      count: variants.length,
      data: variants
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};




const updateProductVariant = async (req, res) => {
    try {
        const { id } = req.params;
        const { variantName, value } = req.body;

        // Check if the variantName exists if provided
        if (variantName) {
            const existingVariantName = await VariantName.findById(variantName);
            if (!existingVariantName) {
                return res.status(404).json({ message: 'Variant name not found' });
            }
        }

        // Check for duplicate before updating
        const duplicateVariant = await ProductVariant.findOne({
            variantName,
            value,
            _id: { $ne: id } // Exclude the current document from the duplicate check
        });

        if (duplicateVariant) {
            return res.status(400).json({ 
                message: `The value "${value}" already exists for this variant name.` 
            });
        }

        // Update the product variant
        const productVariant = await ProductVariant.findByIdAndUpdate(
            id,
            { variantName, value },
            { new: true }
        );

        if (!productVariant) {
            return res.status(404).json({ message: 'Product variant not found' });
        }

        res.status(200).json(productVariant);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


const bulkDeleteProductVariants = async (req, res) => {
    try {
        const { ids } = req.body; // Array of product variant IDs

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: 'No product variant IDs provided' });
        }

        const result = await ProductVariant.deleteMany({ _id: { $in: ids } });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'No product variants found to delete' });
        }

        res.status(200).json({ message: `${result.deletedCount} product variants deleted successfully` });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const deleteProductVariant = async (req, res) => {
    try {
        const { id } = req.params;
        const productVariant = await ProductVariant.findByIdAndDelete(id);
        if (!productVariant) {
            return res.status(404).json({ message: 'Product variant not found' });
        }
        res.status(200).json({ message: 'Product variant deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

module.exports = {
    createVariantName,
    getAllVariantNames,
    updateVariantName,
    bulkDeleteVariantNames,
    createProductVariant,
    getAllProductVariants,
    updateProductVariant,
    deleteProductVariant,
    bulkDeleteProductVariants
};
