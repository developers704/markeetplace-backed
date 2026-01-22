const Review = require('../models/review.model');
const Product = require('../models/product.model');
const VendorProduct = require('../models/vendorProduct.model');
const Sku = require('../models/sku.model');
const mongoose = require('mongoose');
const { deleteFile } = require('../config/fileOperations');
const fs = require('fs').promises; // To handle file saving
const path = require('path');
const { createNotification } = require('./notification.controller'); // Adjust the path as needed
const OrderStatus = require('../models/orderStatus.model');
const Order = require('../models/order.model');



// Helper function to save images from memory to disk
const saveImagesToDisk = async (files) => {
    const savedImages = [];
    for (const file of files) {
        const fileName = Date.now() + path.extname(file.originalname);
        const filePath = path.join('uploads/images/reviews', fileName);

        // Save the image buffer to the final location
        await fs.writeFile(filePath, file.buffer);
        savedImages.push({ filename: fileName, filePath }); // Save filename and full path
    }
    return savedImages;
};

const createReview = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    let savedImages = []; // Declare here for access in catch

    try {
        const { product, rating, content, productModel = 'Product', sku } = req.body;
        const customer = req.user._id;

        // Validate productModel
        if (!['Product', 'VendorProduct'].includes(productModel)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Invalid productModel. Must be "Product" or "VendorProduct"' });
        }

        // For VendorProduct, SKU is required
        if (productModel === 'VendorProduct' && !sku) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'SKU is required for VendorProduct reviews' });
        }

        // Validate: check if the product exists (either Product or VendorProduct)
        let productExists = null;
        if (productModel === 'Product') {
            productExists = await Product.findById(product).session(session);
        } else if (productModel === 'VendorProduct') {
            productExists = await VendorProduct.findById(product).session(session);
        }

        if (!productExists) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ 
                message: `${productModel} not found`,
                productId: product,
                productModel: productModel
            });
        }

        // Validate SKU if provided
        if (sku) {
            const skuExists = await Sku.findById(sku).session(session);
            if (!skuExists) {
                await session.abortTransaction();
                session.endSession();
                return res.status(404).json({ message: 'SKU not found' });
            }
            
            // Verify SKU belongs to the product
            if (productModel === 'VendorProduct' && String(skuExists.productId) !== String(product)) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ message: 'SKU does not belong to this VendorProduct' });
            }
        }

        // Validate: check if the user has already reviewed this SKU (for VendorProduct) or product
        const existingReviewQuery = sku 
            ? { sku, customer }
            : { product, customer, productModel };
            
        const existingReview = await Review.findOne(existingReviewQuery).session(session);
        
        if (existingReview) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: sku ? 'You have already reviewed this SKU' : 'You have already reviewed this product' });
        }

        // Check if the user has purchased the product with the "Delivered" status
        // For VendorProduct, we need to check B2B orders or regular orders
        let hasPurchased = false;
        if (productModel === 'Product') {
            hasPurchased = await Order.exists({
                customer,
                items: { $elemMatch: { product } },
                orderStatus: 'Delivered'
            }).session(session);
        } else if (productModel === 'VendorProduct') {
            // For vendor products, check B2B purchase requests or orders
            // You may need to adjust this based on your B2B order model
            hasPurchased = await Order.exists({
                customer,
                'items.vendorProductId': product,
                orderStatus: 'Delivered'
            }).session(session);
        }

        // Save images and get filenames and full paths
        savedImages = req.files ? await saveImagesToDisk(req.files) : [];

        // Create the review after validations
        const review = new Review({
            product,
            productModel,
            sku: sku || undefined, // Only include if provided
            customer,
            rating,
            content,
            images: savedImages.map(img => img.filename), // Store only filenames
            isVerifiedPurchase: !!hasPurchased,
            isApproved: false // Reviews need admin approval
        });

        await review.save({ session });

        // Note: VendorProduct model doesn't have totalReviews/totalRating fields
        // If you want to track reviews for VendorProducts, you'd need to add these fields
        // For now, we'll only update Product stats
        if (productModel === 'Product') {
            await Product.findByIdAndUpdate(product, {
                $inc: { totalReviews: 1, totalRating: rating }
            }, { session });
        }

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            message: 'Review created successfully',
            review: await Review.findById(review._id).populate('customer', 'username profileImage')
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();

        // Delete any images that were saved
        if (savedImages.length > 0) {
            await Promise.all(savedImages.map(image => deleteFile(image.filePath)));
        }

        res.status(500).json({ message: 'Error creating review', error: error.message });
    }
};

  

const getProductReviews = async (req, res) => {
    try {
        const { productId } = req.params;
        const { sort = 'createdAt', productModel, skuId, includeUnapproved = false } = req.query;
        const sortOptions = {
            createdAt: { createdAt: -1 },
            rating: { rating: -1 },
            helpful: { 'votes.isHelpful': -1 }
        };

        // Build query - for SKU-based reviews or product-based
        let query = {};
        
        // If SKU ID is provided, get reviews for that SKU
        if (skuId) {
            query.sku = new mongoose.Types.ObjectId(skuId);
            // Also verify the SKU belongs to the product
            const sku = await Sku.findById(skuId).lean();
            if (!sku) {
                return res.status(404).json({ message: 'SKU not found' });
            }
            query.product = new mongoose.Types.ObjectId(productId);
            query.productModel = productModel || 'VendorProduct';
        } else {
            // Product-based reviews
            query.product = new mongoose.Types.ObjectId(productId);
            
            // If productModel is specified, filter by it
            if (productModel && ['Product', 'VendorProduct'].includes(productModel)) {
                query.productModel = productModel;
            } else {
                // If not specified, try to auto-detect by checking which exists
                const [productExists, vendorProductExists] = await Promise.all([
                    Product.findById(productId).lean(),
                    VendorProduct.findById(productId).lean()
                ]);
                
                if (vendorProductExists && !productExists) {
                    query.productModel = 'VendorProduct';
                } else if (productExists && !vendorProductExists) {
                    query.productModel = 'Product';
                }
            }
        }

        // Only show approved reviews by default (unless admin requests all)
        if (includeUnapproved !== 'true') {
            query.isApproved = true;
        }

        const reviews = await Review.find(query)
            .populate({
                path: 'customer',
                select: 'username profileImage' // Add any other customer fields you need
            })
            .sort(sortOptions[sort] || sortOptions.createdAt)
            .lean();

        const reviewsWithVotes = reviews.map(review => ({
            ...review,
            totalHelpfulVotes: review.votes ? review.votes.filter(vote => vote.isHelpful).length : 0,
            totalNonHelpfulVotes: review.votes ? review.votes.filter(vote => !vote.isHelpful).length : 0
        }));

        const averageRating = reviews.length > 0
            ? reviews.reduce((acc, review) => acc + review.rating, 0) / reviews.length
            : 0;

        const ratingDistribution = [1, 2, 3, 4, 5].map(rating =>
            reviews.filter(review => review.rating === rating).length
        );

        res.json({
            reviews: reviewsWithVotes,
            totalReviews: reviews.length,
            summary: {
                averageRating,
                ratingDistribution
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching reviews', error: error.message });
    }
};



const updateReview = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    let oldImages = [];
    let newImages = [];
    
    try {
        const { id } = req.params;
        const { rating, content } = req.body;
        const customerId = req.user._id;

        // Find the review by ID and customer
        const review = await Review.findOne({ _id: id, customer: customerId }).session(session);

        if (!review) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Review not found or you are not authorized to update it' });
        }

        oldImages = review.images;  // Save old images to delete them later

        // Update review details
        review.rating = rating || review.rating;
        review.content = content || review.content;

        // If there are new files, save them to disk after validation
        if (req.files && req.files.length > 0) {
            const savedNewImages = await saveImagesToDisk(req.files);  // Save new images
            newImages = savedNewImages.map(img => img.filename);  // Extract filenames for storage
            review.images = newImages;  // Assign new images to review
        }

        await review.save({ session });  // Save updated review to the database

        await session.commitTransaction();  // Commit the transaction
        session.endSession();

        // If new images are saved, delete the old ones after successful update
        if (newImages.length > 0) {
            await Promise.all(oldImages.map(image => deleteFile(path.join('uploads/images/reviews', image))));
        }

        res.json(review);
    } catch (error) {
        await session.abortTransaction();  // Rollback the transaction
        session.endSession();

        // If an error occurs, delete the new images from disk (if any were saved)
        if (req.files) {
            await Promise.all(req.files.map(file => deleteFile(path.join('uploads/images/reviews', file.filename))));
        }

        res.status(500).json({ message: 'Error updating review', error: error.message });
    }
};


const deleteReview = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;
        const userId = req.user._id; // User ID of the person making the request

        // Find the review by ID
        const review = await Review.findById(id).session(session);

        if (!review) {
            return res.status(404).json({ message: 'Review not found' });
        }

        // Check if the user is the owner of the review
        if (review.customer.toString() !== userId.toString()) {
            return res.status(403).json({ message: 'You are not authorized to delete this review' });
        }

        // Delete associated images if they exist
        if (review.images && review.images.length > 0) {
            await Promise.all(review.images.map(image => {
                const filePath = path.join('uploads/images/reviews', image);
                return deleteFile(filePath);
            }));
        }

        // Delete the review
        await Review.findByIdAndDelete(id, { session });

        // Update product's review stats (only for Product model, not VendorProduct)
        if (review.productModel === 'Product') {
            await Product.findByIdAndUpdate(review.product, {
                $inc: { totalReviews: -1, totalRating: -review.rating }
            }, { session });
        }

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({ message: 'Review deleted successfully' });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();

        res.status(500).json({ message: 'Error deleting review', error: error.message });
    }
};

// Admin delete review (no ownership check required)
const deleteReviewByAdmin = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;

        // Find the review by ID
        const review = await Review.findById(id).session(session);

        if (!review) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Review not found' });
        }

        // Delete associated images if they exist
        if (review.images && review.images.length > 0) {
            await Promise.all(review.images.map(image => {
                const filePath = path.join('uploads/images/reviews', image);
                return deleteFile(filePath);
            }));
        }

        // Delete the review
        await Review.findByIdAndDelete(id, { session });

        // Update product's review stats (only for Product model, not VendorProduct)
        if (review.productModel === 'Product') {
            await Product.findByIdAndUpdate(review.product, {
                $inc: { totalReviews: -1, totalRating: -review.rating }
            }, { session });
        }

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({ message: 'Review deleted successfully' });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();

        res.status(500).json({ message: 'Error deleting review', error: error.message });
    }
};



const voteReview = async (req, res) => {
    try {
        const { id } = req.params;
        const { isHelpful } = req.body;
        const customerId = req.user._id;

        const review = await Review.findById(id);
        if (!review) {
            return res.status(404).json({ message: 'Review not found' });
        }

        const voteIndex = review.votes.findIndex(vote => vote.customer.toString() === customerId.toString());

        if (voteIndex > -1) {
            review.votes[voteIndex].isHelpful = isHelpful;
        } else {
            review.votes.push({ customer: customerId, isHelpful });
        }

        await review.save();
        await createNotification(review.customer, `Your review received a new vote`);
        res.json({ message: 'Vote recorded successfully' });
      } catch (error) {
        res.status(500).json({ message: 'Error voting on review', error: error.message });
    }
};

const getReviewSummary = async (req, res) => {
    try {
        const { productId } = req.params;
        const reviews = await Review.find({ product: productId });

        // Handle no reviews case
        if (reviews.length === 0) {
            return res.json({ averageRating: 0, ratingDistribution: [0, 0, 0, 0, 0] });
        }

        // Calculate average rating
        const averageRating = reviews.reduce((acc, review) => acc + review.rating, 0) / reviews.length;

        // Calculate rating distribution
        const ratingDistribution = [1, 2, 3, 4, 5].map(rating =>
            reviews.filter(review => review.rating === rating).length
        );

        res.json({ averageRating, ratingDistribution });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching review summary', error: error.message });
    }
};

  
const getUserReviews = async (req, res) => {
    try {
        const userId = req.user._id;
        const { sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        
        const sort = sortOrder === 'asc' ? 1 : -1;

        const reviews = await Review.find({ customer: userId })
            .populate('product', 'name')
            .sort({ [sortBy]: sort })
            .lean();

        const modifiedReviews = reviews.map(review => {
            const totalVotes = review.votes.length;
            return {
                ...review,
                votes: totalVotes
            };
        });

        res.json(modifiedReviews);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching user reviews', error: error.message });
    }
};



// Respond to a customer's review
const respondToReview = async (req, res) => {
    try {
      const { reviewId } = req.params;
      const { content } = req.body;

         // Basic validation
   if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ message: 'Response content is required and must be a non-empty string.' });
}
  
      // Update the review with seller's response
      const review = await Review.findByIdAndUpdate(reviewId, 
        { sellerResponse: { content, respondedAt: new Date() } },
        { new: true }
      );
  
      if (!review) {
        return res.status(404).json({ message: 'Review not found' });
      }
  
      // Create a notification for the customer
      await createNotification(review.customer, 'Your review received a response', review._id);
  
      res.json(review);
    } catch (error) {
      res.status(500).json({ message: 'Error responding to review', error: error.message });
    }
  };

  const getTopProductReviews = async (req, res) => {
    try {
        const reviews = await Review.find({
            rating: { $gte: 4 },  // Get reviews with rating 4 or 5
            isApproved: true // Only show approved reviews
        })
        .populate('product', 'name images urlName')
        .populate('customer', 'username profileImage')
        .sort({ rating: -1, createdAt: -1 }) // Sort by rating (highest first) and then by date
        .limit(20)
        .select('rating content images createdAt');

        res.status(200).json(reviews);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAllReviews = async (req, res) => {
    try {
        const { 
            sort = 'createdAt', 
            order = 'desc',
            rating,
            productId,
            customerId,
            isApproved // Admin can filter by approval status
        } = req.query;

        const query = {};
        if (rating) query.rating = rating;
        if (productId) query.product = productId;
        if (customerId) query.customer = customerId;
        if (isApproved !== undefined) query.isApproved = isApproved === 'true';

        const reviews = await Review.find(query)
            .populate('product', 'name image sku vendorModel')
            .populate('sku', 'sku metalColor metalType size attributes')
            .populate('customer', 'username profileImage email')
            .sort({ [sort]: order === 'desc' ? -1 : 1 });

        res.status(200).json({ reviews });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


const bulkDeleteReviews = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { reviewIds } = req.body;

        if (!Array.isArray(reviewIds) || reviewIds.length === 0) {
            return res.status(400).json({ message: 'Please provide an array of review IDs' });
        }

        // Get all reviews to be deleted
        const reviews = await Review.find({ _id: { $in: reviewIds } });

        // Collect all image paths
        const imagesToDelete = reviews.reduce((acc, review) => {
            if (review.images && review.images.length > 0) {
                return [...acc, ...review.images.map(image => 
                    path.join('uploads/images/reviews', image)
                )];
            }
            return acc;
        }, []);

        // Delete reviews from database
        await Review.deleteMany({ _id: { $in: reviewIds } }, { session });

        // Update product stats for each affected product (only for Product model)
        const productUpdates = reviews
            .filter(review => review.productModel === 'Product')
            .map(review => 
                Product.findByIdAndUpdate(review.product, {
                    $inc: { 
                        totalReviews: -1,
                        totalRating: -review.rating 
                    }
                }, { session })
            );

        await Promise.all(productUpdates);
        await session.commitTransaction();

        // Delete images from server after successful database operations
        await Promise.all(imagesToDelete.map(imagePath => deleteFile(imagePath)));

        res.status(200).json({ 
            message: `Successfully deleted ${reviewIds.length} reviews`,
            deletedCount: reviewIds.length
        });
    } catch (error) {
        await session.abortTransaction();
        res.status(500).json({ message: error.message });
    } finally {
        session.endSession();
    }
};

const approveReview = async (req, res) => {
    try {
        const { id } = req.params;
        const { isApproved } = req.body;

        const review = await Review.findById(id);
        if (!review) {
            return res.status(404).json({ message: 'Review not found' });
        }

        review.isApproved = isApproved !== undefined ? isApproved : true;
        await review.save();

        // Create notification for customer
        if (isApproved) {
            await createNotification(review.customer, 'Your review has been approved and is now visible to others', review._id);
        }

        res.json({
            message: `Review ${isApproved ? 'approved' : 'rejected'} successfully`,
            review: await Review.findById(id).populate('customer', 'username profileImage')
        });
    } catch (error) {
        res.status(500).json({ message: 'Error approving review', error: error.message });
    }
};

const updateReviewByAdmin = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;
        const { rating, content } = req.body;

        // Prepare the update fields object
        let updateFields = {};
        if (rating !== undefined) updateFields.rating = rating;
        if (content !== undefined) updateFields.content = content;

        // Find the review by ID
        const review = await Review.findById(id).session(session);
        if (!review) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Review not found' });
        }

        // Update the review with new fields
        review.rating = updateFields.rating || review.rating;
        review.content = updateFields.content || review.content;

        // If new images are uploaded, handle them
        let oldImages = [];
        if (req.files && req.files.length > 0) {
            const savedNewImages = await saveImagesToDisk(req.files);
            const newImages = savedNewImages.map(img => img.filename);
            
            oldImages = review.images;  // Save old images to delete them later
            review.images = newImages;  // Assign new images to review
        }

        // Save the updated review
        await review.save({ session });

        // Commit the transaction
        await session.commitTransaction();
        session.endSession();

        // Delete old images if necessary
        if (oldImages.length > 0) {
            await Promise.all(
                oldImages.map(image => 
                    deleteFile(path.join('uploads/images/reviews', image))
                )
            );
        }

        res.json(review);  // Send the updated review back as a response

    } catch (error) {
        // Rollback the transaction if error occurs
        await session.abortTransaction();
        session.endSession();

        // Delete uploaded images if there was an error
        if (req.files) {
            await Promise.all(req.files.map(file => deleteFile(path.join('uploads/images/reviews', file.filename)))); 
        }

        console.error('Error updating review:', error); // Debugging log
        res.status(500).json({ message: 'Error updating review', error: error.message });
    }
};










module.exports = {
    createReview,
    getProductReviews,
    updateReview,
    deleteReview,
    deleteReviewByAdmin,
    voteReview,
    getReviewSummary,
    getUserReviews ,
    respondToReview,
    getTopProductReviews,
    getAllReviews,
    bulkDeleteReviews,
    updateReviewByAdmin,
    approveReview
};
