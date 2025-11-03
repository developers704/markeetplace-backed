const mongoose = require('mongoose');

// Function to generate a URL-friendly name
const generateUrlname = (content) => {
  return content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .trim();
};

const brandSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  logo: {
    type: String,
  },
  urlName: {
    type: String,
    unique: true, // Keep unique constraint
    trim: true,
  },
}, {
  timestamps: true,
});

// Middleware to generate urlName before saving
brandSchema.pre('save', function (next) {
  if (this.isModified('name') || !this.urlName) {
    this.urlName = generateUrlname(this.name);
  }
  next();
});

const Brand = mongoose.model('Brand', brandSchema);

module.exports = Brand;
