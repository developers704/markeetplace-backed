const IPAccess = require("../models/IPAccess.model");
const User = require("../models/user.model");
const bcrypt = require("bcryptjs");

// Create new IP Access
const create = async (req, res) => {
  try {
    const existingIP = await IPAccess.findOne({
      address: req.body.address
    });

    if (existingIP) {
      return res.status(409).json({ 
        message: "This IP address is already registered in the system",
        existing: existingIP 
      });
    }

    const newIPAccess = new IPAccess({
      address: req.body.address,
      description: req.body.description,
      access: req.body.access,
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString()
    });

    const savedIPAccess = await newIPAccess.save();
    res.status(201).json(savedIPAccess);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all IP Access entries
const findAll = async (req, res) => {
  try {
    const ipAccesses = await IPAccess.find()
    .sort({ created_date: -1 })
    res.status(200).json(ipAccesses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single IP Access by ID
const findOne = async (req, res) => {
  try {
    const ipAccess = await IPAccess.findById(req.params.id);
    if (!ipAccess) {
      return res.status(404).json({ message: "IP Access not found" });
    }
    res.status(200).json(ipAccess);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update IP Access
const update = async (req, res) => {
  try {
    const updatedIPAccess = await IPAccess.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        updated_date: new Date().toISOString()
      },
      { new: true }
    );
    
    if (!updatedIPAccess) {
      return res.status(404).json({ message: "IP Access not found" });
    }
    res.status(200).json(updatedIPAccess);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete IP Access (with admin password)
const Delete = async (req, res) => {
  const adminEmail = 'admin@admin.com'; // Replace with actual admin password or get from env

  try {
    // Find admin user by static email
    const adminUser = await User.findOne({ 
      email: adminEmail,
      is_superuser: true 
    });

    const isPasswordValid = await bcrypt.compare(req.body.adminPassword, adminUser.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid admin password" });
    }

    const deletedIPAccess = await IPAccess.findByIdAndDelete(req.params.id);
    if (!deletedIPAccess) {
      return res.status(404).json({ message: "IP Access not found" });
    }
    res.status(200).json({ message: "IP Access deleted successfully" });
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
