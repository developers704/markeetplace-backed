// models/category.model.js
const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    image: {
        type: String
    },
    productCount: {
        type: Number,
        default: 0
    },
    isNotShowed: {
        type: Boolean,
        default: false // Default to false, meaning the category is shown
    }
}, {
    timestamps: true
});

const subCategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    image: {
        type: String
    },
    productCount: {
        type: Number,
        default: 0
    },
    parentCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: true
    }
}, {
    timestamps: true
});


const subSubCategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    image: {
        type: String
    },
    productCount: {
        type: Number,
        default: 0
    },
    parentSubCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SubCategory',
        required: true
    }
}, {
    timestamps: true
});

const Category = mongoose.model('Category', categorySchema);
const SubCategory = mongoose.model('SubCategory', subCategorySchema);
const SubSubCategory = mongoose.model('SubSubCategory', subSubCategorySchema);

module.exports = { Category, SubCategory, SubSubCategory };

