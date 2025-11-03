const OrderStatus = require('../models/orderStatus.model');

// Create a new order status
const createOrderStatus = async (req, res) => {
    try {
        const { name, color, isDefault = false, sortOrder = 0 } = req.body;

         // Check for duplicate order status name
         const existingOrderStatus = await OrderStatus.findOne({ name });
         if (existingOrderStatus) {
             return res.status(400).json({ message: 'Order status with this name already exists' });
         }

        // If the new status is marked as default, unset the previous default status
        if (isDefault) {
            await OrderStatus.updateMany({ isDefault: true }, { isDefault: false });
        }

        const orderStatus = new OrderStatus({
            name,
            color,
            isDefault,
            sortOrder
        });

        await orderStatus.save();
        res.status(201).json({ message: 'Order status created successfully', orderStatus });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Get all order statuses with sorting by sortOrder
const getAllOrderStatuses = async (req, res) => {
    try {
        const orderStatuses = await OrderStatus.find().sort({ sortOrder: 1 });
        res.status(200).json(orderStatuses);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// Update an order status by ID
const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, color, isDefault, sortOrder } = req.body;

        // Check if the new name already exists and is not the current status
        const existingOrderStatus = await OrderStatus.findOne({ name });
        if (existingOrderStatus && existingOrderStatus._id.toString() !== id) {
            return res.status(400).json({ message: 'Order status with this name already exists' });
        }

        // If the new status is marked as default, unset the previous default status
        if (isDefault) {
            await OrderStatus.updateMany({ isDefault: true }, { isDefault: false });
        }

        const orderStatus = await OrderStatus.findByIdAndUpdate(id, { name, color, isDefault, sortOrder }, { new: true });
        if (!orderStatus) {
            return res.status(404).json({ message: 'Order status not found' });
        }

        res.status(200).json({ message: 'Order status updated successfully', orderStatus });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Delete an order status by ID
const deleteOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const orderStatus = await OrderStatus.findByIdAndDelete(id);
        if (!orderStatus) {
            return res.status(404).json({ message: 'Order status not found' });
        }
        res.status(200).json({ message: 'Order status deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


module.exports = {
    createOrderStatus,
    getAllOrderStatuses,
    updateOrderStatus,
    deleteOrderStatus
};
