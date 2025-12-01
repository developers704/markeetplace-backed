const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      unique: true,
      required: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
    },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
    },
    sellerWarehouseId: {
      type: String,
    },
    isMain:{
      type: String 
    },
    guestInfo: {
      name: String,
      email: String,
      phoneNumber: String,
    },
    sessionId: {
      type: String, // For guest checkout sessions
    },
    items: [
      {
        itemType: {
          type: String,
          enum: ["Product", "SpecialProduct"],
          required: true,
        },
        product: {
          type: mongoose.Schema.Types.ObjectId,
          refPath: "items.itemType",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
        },
        price: {
          type: Number,
          required: true,
        },
        color: {
          type: String,
          default: null,
        },
        sellerWarehouseId:{
          type: String,
        },
        isMain: {
        type: Boolean,
        default: false
      },
      },
    ],
    shippingAddress: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Address",
    },
    shippingStatus: {
      type: String,
      default: "Pending",
    },
    guestAddress: {
      street: String,
      city: String,
      postalCode: String,
    },
    shippingMethod: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShippingMethod",
    },
    subtotal: {
      type: Number,
      required: true,
    },
    shippingCost: {
      type: Number,
      // required: true,
    },
    grandTotal: {
      type: Number,
      required: true,
    },
    paymentMethod: {
      type: String,
    },
    paymentStatus: {
      type: String,
      default: "Incomplete", 
    },
    approvalStatus: {
      type: String,
      enum: [
        "PENDING",
        "APPROVED_BY_DISTRICT",
        "APPROVED_BY_CORPORATE",
        "APPROVED_BY_ADMIN",
        "DISAPPROVED",
        "APPROVED"

      ],
      default: "PENDING",
    },
    
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    approvalHistory: [
      {
        role: String, 
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        status: { type: String, enum: ["APPROVED", "DISAPPROVED"] },
        date: { type: Date, default: Date.now },
        remarks: String,
      },
    ],
    isFinalized:{
      type: Boolean,
      default: false
    },

    orderStatus: {
      type: String,
      default: "Pending", 
    },
    specialInstructions: {
      type: String,
      trim: true,
    },
    couponUsed: {
      type: String,
    },
    city: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "City",
      required: true,
    },
    adminNotes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
