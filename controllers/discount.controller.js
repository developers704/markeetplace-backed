const Discount = require('../models/discount.model');
const Product = require('../models/product.model');
const { Category, SubCategory } = require('../models/productCategory.model');
const cron = require('node-cron');
const City = require('../models/city.model');


const createDiscount = async (req, res) => {
    try {
        const { code, ...discountData } = req.body;

        // Check if discount code already exists
        const existingDiscount = await Discount.findOne({ code });
        if (existingDiscount) {
            return res.status(400).json({ message: 'Discount code already exists' });
        }

        const discount = new Discount({ ...discountData, code });
        await discount.save();
        res.status(201).json({
            message: 'Discount created successfully',
            discount
        });
    } catch (error) {
        res.status(400).json({ message: 'Error creating discount', error: error.message });
    }
};


const getAllDiscounts = async (req, res) => {
    try {
        const discounts = await Discount.find(); // Include city name
        res.json(discounts);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching discounts', error: error.message });
    }
};

const getDiscountById = async (req, res) => {
    try {
        const discount = await Discount.findById(req.params.id);
        if (!discount) {
            return res.status(404).json({ message: 'Discount not found' });
        }
        res.json(discount);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching discount', error: error.message });
    }
};

const updateDiscount = async (req, res) => {
    try {
        const { code, ...updateData } = req.body;

        // If code is provided, check for its uniqueness
        if (code) {
            const existingDiscount = await Discount.findOne({ code });
            if (existingDiscount && existingDiscount._id.toString() !== req.params.id) {
                return res.status(400).json({ message: 'Discount code already exists' });
            }
            updateData.code = code; // Update the code
        }

        // Update the discount with the provided fields only (No city update here)
        const discount = await Discount.findByIdAndUpdate(
            req.params.id,
            { $set: updateData }, // Only update the fields that are provided in the request
            { new: true, runValidators: true }
        );

        if (!discount) {
            return res.status(404).json({ message: 'Discount not found' });
        }

        res.json({
            message: 'Discount updated successfully',
            discount
        });
    } catch (error) {
        res.status(400).json({ message: 'Error updating discount', error: error.message });
    }
};





const deleteDiscount = async (req, res) => {
    const session = await Discount.startSession();
    session.startTransaction();

    try {
        const discount = await Discount.findByIdAndDelete(req.params.id).session(session);
        if (!discount) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Discount not found' });
        }

        // Remove the discount reference from products, considering both discountId and cityIds
        const productsUpdated = await Product.updateMany(
            { "discounts.discountId": discount._id },
            { $pull: { discounts: { discountId: discount._id } } },
            { session }
        );

        await session.commitTransaction();
        session.endSession();

        res.json({
            message: 'Discount deleted successfully and references removed from products',
            affectedProducts: productsUpdated.nModified
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ message: 'Error deleting discount', error: error.message });
    }
};



const applyDiscount = async (req, res) => {
    const session = await Discount.startSession();
    session.startTransaction();

    try {
        const { discountId, productId, categoryId, subcategoryId, cityIds } = req.body;

        if (!discountId || !cityIds || cityIds.length === 0) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Invalid request. Provide discountId and cityIds.' });
        }

        const discount = await Discount.findById(discountId).session(session);
        if (!discount) {
            await session.abortTransaction();
            return res.status(404).json({ message: 'Discount not found.' });
        }

        const filter = productId
            ? { _id: productId }
            : categoryId
            ? { category: categoryId }
            : subcategoryId
            ? { subcategory: subcategoryId }
            : null;

        if (!filter) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Invalid request. Provide productId, categoryId, or subcategoryId.' });
        }

        const products = await Product.find(filter).session(session);
        if (!products.length) {
            await session.abortTransaction();
            return res.status(404).json({ message: 'No products found for the provided filter.' });
        }

        let appliedCount = 0;
        for (const product of products) {
            // Determine which cities can actually be added for this product
            const applicableCities = cityIds.filter((cityId) => {
                return !product.discounts.some((d) => d.cityIds.includes(cityId));
            });

            if (applicableCities.length > 0) {
                const existingDiscount = product.discounts.find(
                    (d) => d.discountId.toString() === discountId
                );

                if (existingDiscount) {
                    // Add new cities to the existing discount
                    existingDiscount.cityIds = [...new Set([...existingDiscount.cityIds, ...applicableCities])];
                } else {
                    // Create a new discount entry
                    product.discounts.push({ discountId, cityIds: applicableCities });
                }

                await product.save({ session });
                appliedCount++;
            }
        }

        await session.commitTransaction();
        res.json({ message: `Discount applied to ${appliedCount} products successfully.` });
    } catch (error) {
        await session.abortTransaction();
        res.status(500).json({ message: 'Error applying discount', error: error.message });
    } finally {
        session.endSession();
    }
};


const removeDiscount = async (req, res) => {
    try {
        const { productId, categoryId, subcategoryId, discountId, cityIds } = req.body;

        if (!discountId) {
            return res.status(400).json({ message: 'Invalid request. Provide discountId.' });
        }

        const filter = productId
            ? { _id: productId }
            : categoryId
            ? { category: categoryId }
            : subcategoryId
            ? { subcategory: subcategoryId }
            : null;

        if (!filter) {
            return res.status(400).json({ message: 'Invalid request. Provide productId, categoryId, or subcategoryId.' });
        }

        const products = await Product.find(filter);
        if (!products.length) {
            return res.status(404).json({ message: 'No products found for the provided filter.' });
        }

        let updatedCount = 0;
        for (const product of products) {
            const discountIndex = product.discounts.findIndex(
                (d) => d.discountId.toString() === discountId
            );

            if (discountIndex !== -1) {
                if (cityIds && cityIds.length > 0) {
                    // Remove specific cities from the discount
                    product.discounts[discountIndex].cityIds = product.discounts[discountIndex].cityIds.filter(
                        (cityId) => !cityIds.includes(cityId.toString())
                    );

                    // If no cities remain, remove the entire discount
                    if (product.discounts[discountIndex].cityIds.length === 0) {
                        product.discounts.splice(discountIndex, 1);
                    }
                } else {
                    // Remove the entire discount
                    product.discounts.splice(discountIndex, 1);
                }

                await product.save();
                updatedCount++;
            }
        }

        res.json({ message: `Discount removed from ${updatedCount} products successfully.` });
    } catch (error) {
        res.status(500).json({ message: 'Error removing discount', error: error.message });
    }
};



const deactivateExpiredDiscounts = async () => {
    const now = new Date();
    try {
        // Find expired discounts
        const expiredDiscounts = await Discount.find({ endDate: { $lt: now }, isActive: true });
        const discountIds = expiredDiscounts.map((discount) => discount._id);

        // Deactivate discounts
        await Discount.updateMany(
            { _id: { $in: discountIds } },
            { $set: { isActive: false } }
        );

        // Remove discounts from products
        await Product.updateMany(
            { "discounts.discountId": { $in: discountIds } },
            { $pull: { discounts: { discountId: { $in: discountIds } } } }
        );

        console.log(`Deactivated and removed ${expiredDiscounts.length} expired discounts`);
    } catch (error) {
        console.error('Error deactivating expired discounts:', error);
    }
};


  

// Schedule the job to run every day at midnight
cron.schedule('0 0 * * *', () => {
    deactivateExpiredDiscounts();
  });


  //2 sec checking
// cron.schedule('*/2 * * * * *', () => {
//     deactivateExpiredDiscounts();
//   });


module.exports = {
    createDiscount,
    getAllDiscounts,
    getDiscountById,
    updateDiscount,
    deleteDiscount,
    applyDiscount,
    deactivateExpiredDiscounts,
    removeDiscount
};
