const BestSellerConfig = require('../models/bestSellerConfig.model');
const cron = require('node-cron');
const Product = require('../models/product.model');
const Order = require('../models/order.model');

const getBestSellerConfig = async (req, res) => {
    try {
        const config = await BestSellerConfig.findOne();
        if (!config) {
            return res.status(404).json({ message: 'Best Seller configuration not found' });
        }
        res.status(200).json(config);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


const updateBestSellerConfig = async (req, res) => {
    try {
        const { quantityThreshold } = req.body;
        let config = await BestSellerConfig.findOne();

        if (!config) {
            config = new BestSellerConfig({ quantityThreshold });
        } else {
            config.quantityThreshold = quantityThreshold;
        }

        await config.save();
        res.status(200).json({ message: 'Best Seller configuration updated successfully', config });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};



const updateBestSellerProducts = async () => {
    try {
        const config = await BestSellerConfig.findOne();
        if (!config) {
           
            return;
        }

        const { quantityThreshold } = config;

        // Find products that have sold more than the quantityThreshold
        const bestSellerProducts = await Order.aggregate([
            { $unwind: '$items' },
            { $match: { 'items.product': { $exists: true } } },
            { $group: { _id: '$items.product', totalQuantity: { $sum: '$items.quantity' } } },
            { $match: { totalQuantity: { $gte: quantityThreshold } } },
            { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
            { $unwind: '$product' },
            { $project: { _id: 0, productId: '$product._id', isBestSeller: true } }
        ]);

        const productIds = bestSellerProducts.map(product => product.productId);

        // Update the isBestSeller field for the identified products
        await Product.updateMany({ _id: { $in: productIds } }, { isBestSeller: true });

        console.log('Best Seller products updated successfully');
    } catch (error) {
        console.error('Error updating Best Seller products:', error);
    }
};


// Schedule the task to run daily at midnight
cron.schedule('0 0 * * *', updateBestSellerProducts);

//2 sec checking
// cron.schedule('*/2 * * * * *', updateBestSellerProducts);


module.exports = {
    getBestSellerConfig,
    updateBestSellerConfig
};
