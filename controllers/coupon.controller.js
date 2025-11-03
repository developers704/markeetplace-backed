const Coupon = require('../models/coupon.model');

const createCoupon = async (req, res) => {
    try {
      const { code, discountType, value, minPurchase, expiryDate } = req.body;
  
      // Validation: Check if all required fields are provided
      if (!code || !discountType || value == null) {
        return res.status(400).json({ message: 'Code, Discount Type, and Value are required.' });
      }
  
      // Validation: Check if the value is a positive number
      if (value <= 0) {
        return res.status(400).json({ message: 'Discount value must be greater than zero.' });
      }
  
      // Validation: Check if discountType is either 'percentage' or 'fixed'
      const validDiscountTypes = ['percentage', 'fixed'];
      if (!validDiscountTypes.includes(discountType)) {
        return res.status(400).json({ message: 'Invalid discount type. It must be "percentage" or "fixed".' });
      }
  
      // Validation: Check if coupon code is unique
      const existingCoupon = await Coupon.findOne({ code });
      if (existingCoupon) {
        return res.status(400).json({ message: 'Coupon code already exists. Please use a different code.' });
      }
  
      // Create and save the coupon
      const coupon = new Coupon({
        code,
        discountType,
        value,
        minPurchase,
        expiryDate
      });
      await coupon.save();
      res.status(201).json({ message: 'Coupon created successfully', coupon });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getAllCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find();
    res.status(200).json(coupons);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getCouponById = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }
    res.status(200).json(coupon);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateCoupon = async (req, res) => {
  try {
    const { code, discountType, value } = req.body;

    // Validation: Check if value is provided and is a positive number
    if (value !== undefined && value <= 0) {
      return res.status(400).json({ message: 'Discount value must be greater than zero.' });
    }

    // Validation: Check if discountType is either 'percentage' or 'fixed', if provided
    const validDiscountTypes = ['percentage', 'fixed'];
    if (discountType && !validDiscountTypes.includes(discountType)) {
      return res.status(400).json({ message: 'Invalid discount type. It must be "percentage" or "fixed".' });
    }

    // Validation: Check if the code is unique (if updating the code)
    if (code) {
      const existingCoupon = await Coupon.findOne({ code, _id: { $ne: req.params.id } });
      if (existingCoupon) {
        return res.status(400).json({ message: 'Coupon code already exists. Please use a different code.' });
      }
    }

    // Update the coupon
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }

    // Respond with a success message and the updated coupon
    res.status(200).json({ message: 'Coupon updated successfully', coupon });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};


const deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }
    res.status(200).json({ message: 'Coupon deleted successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  createCoupon,
  getAllCoupons,
  getCouponById,
  updateCoupon,
  deleteCoupon
};
