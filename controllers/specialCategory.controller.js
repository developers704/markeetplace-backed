const SpecialCategory = require("../models/specialCategory.model");

const createCategory = async (req, res) => {
    try {
        const { name, type, description } = req.body;
        const image = req.file ? `/uploads/special-categories/${req.file.filename}` : null;

        const category = new SpecialCategory({
            name,
            type,
            description,
            image
        });

        await category.save();
        res.status(201).json(category);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


const getAllCategories = async (req, res) => {
    try {
        const categories = await SpecialCategory.find();
        res.status(200).json(categories);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


const getCategoryById = async (req, res) => {
    try {
        const category = await SpecialCategory.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }
        res.status(200).json(category);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


const updateCategory = async (req, res) => {
    try {
        const updates = { ...req.body };
        if (req.file) {
            updates.image = `/uploads/special-categories/${req.file.filename}`;
        }

        const category = await SpecialCategory.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true }
        );

        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }
        res.status(200).json(category);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


const deleteCategory = async (req, res) => {
    try {
        const category = await SpecialCategory.findByIdAndDelete(req.params.id);
        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }
        res.status(200).json({ message: 'Category deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const bulkDeleteCategories = async (req, res) => {
    try {
        const { ids } = req.body;
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: 'Please provide an array of category IDs' });
        }

        const result = await SpecialCategory.deleteMany({ _id: { $in: ids } });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'No categories found to delete' });
        }

        res.status(200).json({ 
            message: `Successfully deleted ${result.deletedCount} categories`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


module.exports = {
    createCategory,
    getAllCategories,
    getCategoryById,
    updateCategory,
    deleteCategory,
    bulkDeleteCategories
};
