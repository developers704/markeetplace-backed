const ShippingMethod = require('../models/shippingMethod.model');

const createShippingMethod = async (req, res) => {
    try {
        const { name, description, price, estimatedDeliveryTime, freeShippingThreshold } = req.body;

        // Validate price
        if (!price || typeof price !== 'number' || price < 0) {
            return res.status(400).json({ message: 'Invalid shipping price. Price must be a positive number.' });
        }

        // Create a new shipping method
        const shippingMethod = new ShippingMethod({
            name,
            description,
            price,
            estimatedDeliveryTime,
            freeShippingThreshold
        });

        await shippingMethod.save();
        res.status(201).json({ message: 'Shipping method created successfully', shippingMethod });
    } catch (error) {
        res.status(400).json({ message: 'Error creating shipping method', error: error.message });
    }
};


const getAllShippingMethods = async (req, res) => {
    try {
        const { includeInactive } = req.query;
        
        // If includeInactive is true, return all shipping methods, otherwise only active ones
        const query = includeInactive === 'true' ? {} : { isActive: true };

        const shippingMethods = await ShippingMethod.find(query);
        res.status(200).json(shippingMethods);
    } catch (error) {
        res.status(400).json({ message: 'Error fetching shipping methods', error: error.message });
    }
};



const updateShippingMethod = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, price, estimatedDeliveryTime, isActive, freeShippingThreshold } = req.body;

        // Only allow valid fields to be updated
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (price !== undefined) updateData.price = price;
        if (estimatedDeliveryTime !== undefined) updateData.estimatedDeliveryTime = estimatedDeliveryTime;
        if (isActive !== undefined) updateData.isActive = isActive;  // Allow updating the isActive status
        if (freeShippingThreshold !== undefined) updateData.freeShippingThreshold = freeShippingThreshold;

        const shippingMethod = await ShippingMethod.findByIdAndUpdate(id, updateData, { new: true });

        if (!shippingMethod) {
            return res.status(404).json({ message: 'Shipping method not found' });
        }

        res.status(200).json({ message: 'Shipping method updated successfully', shippingMethod });
    } catch (error) {
        res.status(400).json({ message: 'Error updating shipping method', error: error.message });
    }
};



const deleteShippingMethod = async (req, res) => {
    try {
        const { id } = req.params;
        const shippingMethod = await ShippingMethod.findByIdAndDelete(id);
        if (!shippingMethod) {
            return res.status(404).json({ message: 'Shipping method not found' });
        }
        res.status(200).json({ message: 'Shipping method deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: 'Error deleting shipping method', error: error.message });
    }
};

module.exports = {
    createShippingMethod,
    getAllShippingMethods,
    updateShippingMethod,
    deleteShippingMethod
};
