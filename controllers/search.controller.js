const Product = require('../models/product.model');
const Bundle = require('../models/bundle.model');
const { Category, SubCategory } = require('../models/productCategory.model');

const performSearch = async (req, res) => {
    const { query } = req.query;
    try {
        let searchResults = [];
        
        // Base queries
        let categoryQuery = {};
        let subcategoryQuery = {};
        let productQuery = {};

        if (query) {
            categoryQuery = {
                $or: [
                    { name: { $regex: query, $options: 'i' } },
                    { description: { $regex: query, $options: 'i' } }
                ]
            };
            subcategoryQuery = categoryQuery;
            productQuery = {
                $or: [
                    { name: { $regex: query, $options: 'i' } },
                    { description: { $regex: query, $options: 'i' } },
                    { sku: { $regex: query, $options: 'i' } }
                ]
            };
        }

        // Get categories
        const categories = await Category.find(categoryQuery)
            .select('_id name image description')
            .lean();

        // Get subcategories
        const subcategories = await SubCategory.find(subcategoryQuery)
        .select('_id name image description parentCategory')
        .populate('parentCategory', 'name')
        .lean();

        // Get products
        const products = await Product.find(productQuery)
        .select('_id name tags')
        .populate('tags', 'name') // Populate tags with their names
        .lean();

        // Transform categories
        const categoryResults = categories.map(cat => ({
            id: cat._id,
            name: cat.name,
            image: cat.image,
            description: cat.description,
            type: 'category'
        }));

        // Transform subcategories
        const subcategoryResults = subcategories.map(subcat => ({
            id: subcat._id,
            name: subcat.name,
            image: subcat.image,
            description: subcat.description,
            parentCategory: {
                id: subcat.parentCategory?._id,
                name: subcat.parentCategory?.name
            },
            type: 'subcategory'
        }));

        // Transform products
        const productResults = products.map(product => ({
            id: product._id,
            name: product.name,
            tags: product.tags.map(tag => tag.name), // Extract tag names
            type: 'product'
        }));

        // Combine all results into a single array
        searchResults = [
            ...categoryResults,
            ...subcategoryResults,
            ...productResults
        ];

        res.json(searchResults);
    } catch (error) {
        res.status(500).json({ message: 'Error performing search', error: error.message });
    }
};



module.exports = {
    performSearch
};
