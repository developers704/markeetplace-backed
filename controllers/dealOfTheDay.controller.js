const DealOfTheDay = require('../models/DealOfTheDay.model');
const Product = require('../models/product.model');
const cron = require('node-cron');


// Create a new Deal of the Day
const createDealOfTheDay = async (req, res) => {
    try {
        const { product, startDateTime, endDateTime, discountType, discountValue, cities } = req.body;

        const existingProduct = await Product.findById(product).populate('dealOfTheDay');
        if (!existingProduct) {
            return res.status(404).json({ message: 'Product not found' });
        }

        const existingCities = existingProduct.dealOfTheDay.flatMap(deal => deal.cities.map(city => city.toString()));
        const newCities = cities.filter(city => !existingCities.includes(city));

        if (newCities.length === 0) {
            return res.status(400).json({ message: 'All specified cities already have a Deal of the Day for this product' });
        }

        const dealOfTheDay = new DealOfTheDay({ product, startDateTime, endDateTime, discountType, discountValue, cities: newCities });
        await dealOfTheDay.save();

        existingProduct.dealOfTheDay.push(dealOfTheDay._id);
        await existingProduct.save();

        res.status(201).json({ message: 'Deal of the Day created successfully', dealOfTheDay });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};



// Get all Deals of the Day
const getAllDealsOfTheDay = async (req, res) => {
    try {
        const { city } = req.query;
        let query = {};

        if (city) {
            query.cities = city;
        }

        const dealsOfTheDay = await DealOfTheDay.find(query)
            .populate('product', 'name , sku')
            .populate('cities', 'name');

        res.status(200).json(dealsOfTheDay);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// Get Active Deal of the Day
const getActiveDealsOfTheDay = async (req, res) => {
    try {
        const { city } = req.query;
        const now = new Date();
        let query = {
            startDateTime: { $lte: now },
            endDateTime: { $gte: now }
        };
        if (city) {
            query.cities = city;
        }
        const activeDeals = await DealOfTheDay.find(query);
        res.status(200).json(activeDeals);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// Update a Deal of the Day
const updateDealOfTheDay = async (req, res) => {
    try {
        const { id } = req.params;
        const { product, startDateTime, endDateTime, discountType, discountValue, cities } = req.body;

        const existingDeal = await DealOfTheDay.findById(id);
        if (!existingDeal) {
            return res.status(404).json({ message: 'Deal of the Day not found' });
        }

        const existingProduct = await Product.findById(existingDeal.product).populate('dealOfTheDay');
        const otherDeals = existingProduct.dealOfTheDay.filter(deal => deal._id.toString() !== id);
        const existingCities = otherDeals.flatMap(deal => deal.cities.map(city => city.toString()));
        const newCities = cities.filter(city => !existingCities.includes(city));

        if (newCities.length === 0) {
            return res.status(400).json({ message: 'All specified cities already have a Deal of the Day for this product' });
        }

        const updatedDealOfTheDay = await DealOfTheDay.findByIdAndUpdate(
            id,
            { product, startDateTime, endDateTime, discountType, discountValue, cities: newCities },
            { new: true }
        );

        res.status(200).json({ message: 'Deal of the Day updated successfully', updatedDealOfTheDay });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// Delete a Deal of the Day
const deleteDealOfTheDay = async (req, res) => {
    try {
        const { id } = req.params;
        
        const dealOfTheDay = await DealOfTheDay.findById(id);
        
        if (!dealOfTheDay) {
            return res.status(404).json({ message: 'Deal of the Day not found' });
        }

        await Product.updateMany(
            { dealOfTheDay: id },
            { $pull: { dealOfTheDay: id } }
        );

        await DealOfTheDay.findByIdAndDelete(id);

        res.status(200).json({ message: 'Deal of the Day deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Function to handle expired deals cleanup
const cleanExpiredDeals = async () => {
    try {
        console.log('Starting cleanup for expired deals...');
        const now = new Date();
        const expiredDeals = await DealOfTheDay.find({ endDateTime: { $lt: now } });

        for (const deal of expiredDeals) {
            // Remove deal reference from associated products
            await Product.updateMany(
                { dealOfTheDay: deal._id },
                { $pull: { dealOfTheDay: deal._id } }
            );
            // Delete the expired deal
            await DealOfTheDay.findByIdAndDelete(deal._id);

            console.log(`Expired deal ${deal._id} cleaned up.`);
        }

        if (expiredDeals.length === 0) {
            console.log('No expired deals to clean up.');
        }
    } catch (error) {
        console.error('Error during expired deals cleanup:', error);
    }
};

// Schedule the cleanup job to run at midnight
cron.schedule('0 0 * * *', () => {
    console.log('Running midnight cleanup job for expired deals...');
    cleanExpiredDeals(); // Call the function without awaiting
});

// Schedule the cleanup job to run every 2 seconds
// cron.schedule('*/2 * * * * *', () => {
//     console.log('Running cleanup job for expired deals...');
//     cleanExpiredDeals();
// });


module.exports = {
    createDealOfTheDay,
    getAllDealsOfTheDay,
    updateDealOfTheDay,
    deleteDealOfTheDay,
    getActiveDealsOfTheDay
};
