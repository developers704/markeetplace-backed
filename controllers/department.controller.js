const Department = require('../models/department.model');

// Create new department
const createDepartment = async (req, res) => {
    try {
        const { name, code, description } = req.body;
        const department = new Department({
            name,
            code,
            description
        });
        await department.save();
        res.status(201).json({ message: 'Department created successfully', department });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Get all departments
const getAllDepartments = async (req, res) => {
    try {
        const departments = await Department.find()
        .sort({ createdAt: -1 , updatedAt: -1 });
        res.status(200).json(departments);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Get department by ID
const getDepartmentById = async (req, res) => {
    try {
        const department = await Department.findById(req.params.id);
        if (!department) {
            return res.status(404).json({ message: 'Department not found' });
        }
        res.status(200).json(department);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Update department
const updateDepartment = async (req, res) => {
    try {
        const { name, code, description, isActive } = req.body;
        const department = await Department.findByIdAndUpdate(
            req.params.id,
            { name, code, description, isActive },
            { new: true }
        );
        if (!department) {
            return res.status(404).json({ message: 'Department not found' });
        }
        res.status(200).json({ message: 'Department updated successfully', department });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Delete department
const deleteDepartment = async (req, res) => {
    try {
        const department = await Department.findByIdAndDelete(req.params.id);
        if (!department) {
            return res.status(404).json({ message: 'Department not found' });
        }
        res.status(200).json({ message: 'Department deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// Bulk delete departments
const bulkDeleteDepartments = async (req, res) => {
    try {
        const { ids } = req.body;

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: 'Please provide an array of department IDs' });
        }

        const result = await Department.deleteMany({ _id: { $in: ids } });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'No departments found to delete' });
        }

        res.status(200).json({ 
            message: `Successfully deleted ${result.deletedCount} departments`,
            deletedCount: result.deletedCount 
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


module.exports = {
    createDepartment,
    getAllDepartments,
    getDepartmentById,
    updateDepartment,
    deleteDepartment,
    bulkDeleteDepartments
};
