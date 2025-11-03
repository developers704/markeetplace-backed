const ParentVariant = require('../models/parentVariant.model');

// Create
const create = async (req, res) => {
    try {
        const parentVariant = new ParentVariant({
            name: req.body.name
        });
        const savedParentVariant = await parentVariant.save();
        res.status(201).json(savedParentVariant);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Read All
const findAll = async (req, res) => {
    try {
        const parentVariants = await ParentVariant.find();
        res.status(200).json(parentVariants);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Read One
const findOne = async (req, res) => {
    try {
        const parentVariant = await ParentVariant.findById(req.params.id);
        if (!parentVariant) {
            return res.status(404).json({ message: "Parent Variant not found" });
        }
        res.status(200).json(parentVariant);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Update
const update = async (req, res) => {
    try {
        const updatedParentVariant = await ParentVariant.findByIdAndUpdate(
            req.params.id,
            { name: req.body.name },
            { new: true }
        );
        if (!updatedParentVariant) {
            return res.status(404).json({ message: "Parent Variant not found" });
        }
        res.status(200).json(updatedParentVariant);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Delete
const Delete = async (req, res) => {
    try {
        const deletedParentVariant = await ParentVariant.findByIdAndDelete(req.params.id);
        if (!deletedParentVariant) {
            return res.status(404).json({ message: "Parent Variant not found" });
        }
        res.status(200).json({ message: "Parent Variant deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    create,
    findAll,
    findOne,
    update,
    Delete
};
