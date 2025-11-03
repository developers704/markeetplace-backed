const AboutUs = require('../models/aboutUs.model');


const createAboutUs = async (req, res) => {
  const { title, description } = req.body;

  try {
    const newAboutUs = new AboutUs({
      title,
      description
    });

    const savedAboutUs = await newAboutUs.save();
    res.status(201).json(savedAboutUs); // 201 Created status
  } catch (err) {
    res.status(400).json({ message: err.message }); // 400 Bad Request for validation errors
  }
};

// Get all About Us entries
const getAllAboutUs = async (req, res) => {
  try {
    const aboutUsEntries = await AboutUs.find();
    res.json(aboutUsEntries);
  } catch (err) {
    res.status(500).json({ message: err.message }); // 500 Internal Server Error
  }
};

// Get a single About Us entry by ID
const getAboutUsById = async (req, res) => {
  try {
    const aboutUs = await AboutUs.findById(req.params.id);
    if (!aboutUs) {
      return res.status(404).json({ message: 'About Us entry not found' }); // 404 Not Found
    }
    res.json(aboutUs);
  } catch (err) {
    // Check if the error is a CastError (invalid ID format)
    if (err.kind === 'ObjectId') {
        return res.status(400).json({ message: 'Invalid ID format' });
    }
    res.status(500).json({ message: err.message }); // 500 Internal Server Error
  }
};

// Update an About Us entry by ID
const updateAboutUs = async (req, res) => {
  const { title, description } = req.body;

  try {
    const updatedAboutUs = await AboutUs.findByIdAndUpdate(
      req.params.id,
      { title, description },
      { new: true, runValidators: true } // new: true returns the updated document, runValidators: true runs schema validators
    );

    if (!updatedAboutUs) {
      return res.status(404).json({ message: 'About Us entry not found' }); // 404 Not Found
    }

    res.json(updatedAboutUs);
  } catch (err) {
     // Check if the error is a CastError (invalid ID format)
    if (err.kind === 'ObjectId') {
        return res.status(400).json({ message: 'Invalid ID format' });
    }
    res.status(400).json({ message: err.message }); // 400 Bad Request for validation errors
  }
};

// Delete an About Us entry by ID
const deleteAboutUs = async (req, res) => {
  try {
    const deletedAboutUs = await AboutUs.findByIdAndDelete(req.params.id);

    if (!deletedAboutUs) {
      return res.status(404).json({ message: 'About Us entry not found' }); // 404 Not Found
    }

    res.json({ message: 'About Us entry deleted successfully' });
  } catch (err) {
     // Check if the error is a CastError (invalid ID format)
    if (err.kind === 'ObjectId') {
        return res.status(400).json({ message: 'Invalid ID format' });
    }
    res.status(500).json({ message: err.message }); // 500 Internal Server Error
  }
};



module.exports = {
    createAboutUs,
    getAllAboutUs,
    getAboutUsById,
    updateAboutUs,
    deleteAboutUs
}