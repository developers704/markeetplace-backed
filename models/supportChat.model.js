const mongoose = require('mongoose');

const supportChatMessageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['user', 'assistant', 'admin', 'system'],
      required: true,
    },
    text: { type: String, default: '' },
    senderId: { type: mongoose.Schema.Types.ObjectId },
    senderName: { type: String, default: '' },
    attachments: [{ type: String }],
    imageAnalysis: { type: mongoose.Schema.Types.Mixed, default: null },
    products: [
      {
        productId: String,
        sku: String,
        title: String,
        imageUrl: String,
        price: Number,
        totalInventory: Number,
        similarityPercentage: Number,
        warehouses: [
          {
            name: String,
            quantity: Number,
            isMain: Boolean,
          },
        ],
      },
    ],
    productSearch: {
      searchParams: { type: mongoose.Schema.Types.Mixed, default: null },
      totalMatches: { type: Number, default: 0 },
      hasMore: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

const supportChatSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    customerName: { type: String, default: '' },
    customerEmail: { type: String, default: '' },
    warehouseId: { type: String, default: '' },
    mode: {
      type: String,
      enum: ['ai', 'human_pending', 'human_active', 'closed'],
      default: 'ai',
    },
    assignedAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedAdminName: { type: String, default: '' },
    messages: { type: [supportChatMessageSchema], default: [] },
    unreadByCustomer: { type: Number, default: 0 },
    unreadByAdmin: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
  },
  { timestamps: true },
);

supportChatSchema.index({ status: 1, mode: 1, lastMessageAt: -1 });
supportChatSchema.index({ customerId: 1, status: 1 });

module.exports = mongoose.model('SupportChat', supportChatSchema);
