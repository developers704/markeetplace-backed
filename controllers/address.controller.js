const Address = require('../models/address.model');
const Customer = require('../models/customer.model');

const getAllAddresses = async (req, res) => {
    try {
        const addresses = await Address.find({ customer: req.user.id });
        res.status(200).json(addresses);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const addAddress = async (req, res) => {
    try {
        const { address, title } = req.body;
        const newAddress = new Address({
            customer: req.user.id,
            address,
            title
        });
        await newAddress.save();

        const customer = await Customer.findById(req.user.id);
        customer.addresses.push(newAddress._id);
        await customer.save();

        res.status(201).json(newAddress);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const updateAddress = async (req, res) => {
    try {
        const { id } = req.params;
        const { address, title } = req.body;
        const updatedAddress = await Address.findOneAndUpdate(
            { _id: id, customer: req.user.id },
            { address, title },
            { new: true }
        );
        if (!updatedAddress) {
            return res.status(404).json({ message: 'Address not found' });
        }
        res.status(200).json(updatedAddress);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const deleteAddress = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedAddress = await Address.findOneAndDelete({ _id: id, customer: req.user.id });
        if (!deletedAddress) {
            return res.status(404).json({ message: 'Address not found' });
        }
        await Customer.findByIdAndUpdate(req.user.id, { $pull: { addresses: id } });
        res.status(200).json({ message: 'Address deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const setDefaultAddress = async (req, res) => {
    try {
        const { id } = req.params;
        await Address.updateMany({ customer: req.user.id }, { isDefault: false });
        const defaultAddress = await Address.findOneAndUpdate(
            { _id: id, customer: req.user.id },
            { isDefault: true },
            { new: true }
        );
        if (!defaultAddress) {
            return res.status(404).json({ message: 'Address not found' });
        }
        res.status(200).json(defaultAddress);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const getAllCustomerAddresses = async (req, res) => {
    try {
        const { customerId } = req.params;
        const addresses = await Address.find({ customer: customerId });
        res.status(200).json(addresses);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const adminUpdateAddress = async (req, res) => {
    try {
        const { id } = req.params;
        const { address, title, isDefault } = req.body;
        
        const addressToUpdate = await Address.findById(id);
        if (!addressToUpdate) {
            return res.status(404).json({ message: 'Address not found' });
        }

        // If isDefault is true, set all other addresses of this customer to false
        if (isDefault) {
            await Address.updateMany(
                { customer: addressToUpdate.customer },
                { isDefault: false }
            );
        }

        const updatedAddress = await Address.findByIdAndUpdate(
            id,
            { address, title, isDefault },
            { new: true }
        );
        
        res.status(200).json(updatedAddress);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};



module.exports = {
    getAllAddresses,
    addAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
    adminUpdateAddress,
    getAllCustomerAddresses
};