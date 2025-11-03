const SpecialSubCategory = require('../models/specialSubcategory.model');
const SpecialCategory = require('../models/specialCategory.model');

const createSubCategory = async (req, res) => {
    try {
        const { name, description, parentCategory, type } = req.body;
        const image = req.file ? `/uploads/special-categories/${req.file.filename}` : null;

        const subCategory = new SpecialSubCategory({
            name,
            description,
            parentCategory,
            type,
            image
        });

        await subCategory.save();

        // Update parent category's subCategories array
        await SpecialCategory.findByIdAndUpdate(
            parentCategory,
            { $push: { subCategories: subCategory._id } }
        );

        res.status(201).json(subCategory);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const getAllSubCategories = async (req, res) => {
    try {
        const subCategories = await SpecialSubCategory.find()
            .populate('parentCategory');
        res.status(200).json(subCategories);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getSubCategoryById = async (req, res) => {
    try {
        const subCategory = await SpecialSubCategory.findById(req.params.id)
            .populate('parentCategory');
        if (!subCategory) {
            return res.status(404).json({ message: 'SubCategory not found' });
        }
        res.status(200).json(subCategory);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateSubCategory = async (req, res) => {
    try {
        const updates = { ...req.body };
        if (req.file) {
            updates.image = `/uploads/special-categories/${req.file.filename}`;
        }

        const subCategory = await SpecialSubCategory.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true }
        );

        if (!subCategory) {
            return res.status(404).json({ message: 'SubCategory not found' });
        }
        res.status(200).json(subCategory);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const deleteSubCategory = async (req, res) => {
    try {
        const subCategory = await SpecialSubCategory.findById(req.params.id);
        if (!subCategory) {
            return res.status(404).json({ message: 'SubCategory not found' });
        }

        // Remove subcategory reference from parent category
        await SpecialCategory.findByIdAndUpdate(
            subCategory.parentCategory,
            { $pull: { subCategories: subCategory._id } }
        );

        await SpecialSubCategory.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'SubCategory deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


module.exports = {
    createSubCategory,
    getAllSubCategories,
    getSubCategoryById,
    updateSubCategory,
    deleteSubCategory
};
