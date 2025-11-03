const { Contact, Dropdown } = require('../models/Contact.model.js');



// Controller function to handle contact form submission
const submitContactForm = async (req, res) => {
    try {
        const { firstName, lastName, email, phone, subject, message, dropdownId } = req.body;

        // Check if the dropdown option exists
        const dropdown = await Dropdown.findById(dropdownId);
        if (!dropdown) {
            return res.status(400).json({ message: 'Invalid dropdown option' });
        }

        // Create a new contact form entry
        const newContact = new Contact({
            firstName,
            lastName,
            email,
            phone,
            subject,
            message,
            dropdown: dropdownId
        });

        // Save to database
        await newContact.save();

        res.status(201).json({ message: 'Contact form submitted successfully' });
    } catch (error) {
        console.error('Error submitting contact form:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Controller function to create a new dropdown option
const createDropdownOption = async (req, res) => {
    try {
        const { name } = req.body;

        // Create a new dropdown option
        const newDropdown = new Dropdown({ name });

        // Save to database
        await newDropdown.save();

        res.status(201).json({ message: 'Dropdown option created successfully', dropdown: newDropdown });
    } catch (error) {
        console.error('Error creating dropdown option:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Controller function to get all dropdown options
const getAllDropdownOptions = async (req, res) => {
    try {
        const dropdowns = await Dropdown.find();
        res.status(200).json(dropdowns);
    } catch (error) {
        console.error('Error fetching dropdown options:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Controller function to get all contact form submissions
const getAllContacts = async (req, res) => {
    try {
        const contacts = await Contact.find().populate('dropdown').sort({ createdAt: -1 });
        res.status(200).json(contacts);
    } catch (error) {
        console.error('Error getting contact forms:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Controller function to delete a contact form submission by ID
const deleteContact = async (req, res) => {
    try {
        const { id } = req.params;

        const contact = await Contact.findByIdAndDelete(id);

        if (!contact) {
            return res.status(404).json({ message: 'Contact form not found' });
        }

        res.status(200).json({ message: 'Contact form deleted successfully' });
    } catch (error) {
        console.error('Error deleting contact form:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Controller function to delete a dropdown option by ID
const deleteDropdownOption = async (req, res) => {
    try {
        const { id } = req.params;

        const dropdown = await Dropdown.findByIdAndDelete(id);

        if (!dropdown) {
            return res.status(404).json({ message: 'Dropdown option not found' });
        }

        res.status(200).json({ message: 'Dropdown option deleted successfully' });
    } catch (error) {
        console.error('Error deleting dropdown option:', error);
        res.status(500).json({ message: 'Server error' });
    }
};




module.exports = {
    submitContactForm,
    createDropdownOption,
    getAllContacts,
    deleteContact,
    deleteDropdownOption,
    getAllDropdownOptions
};
