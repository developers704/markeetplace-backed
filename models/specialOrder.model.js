const mongoose = require('mongoose');
const CounterModel = require('./Counter.model');

const TYPE_OF_REQUEST = [
  'WATCH',
  'WATCH_PART',
  'STULLER_ITEM',
  'QG_ITEM',
  'CUSTOM_JEWELRY_PIECE',
  'TRITON',
  'TUNGSTEN',
  'BENCHMARK',
  'AGI_CERTIFICATE',
  'REPAIR_diamond_replacement_under_warranty',
  'REPAIR_ROLEX',
  'OTHERS',
];

const METAL_QUALITY = [
  '10KT_WHITE_GOLD',
  '10KT_YELLOW_GOLD',
  '10KT_ROSE_GOLD',
  '14KT_WHITE_GOLD',
  '14KT_YELLOW_GOLD',
  '14KT_ROSE_GOLD',
  '18KT_WHITE_GOLD',
  '18KT_YELLOW_GOLD',
  '18KT_ROSE_GOLD',
  '22KT_YELLOW_GOLD',
  'PLATINUM',
  'SILVER',
  'SILVER_VERMEIL_YELLOW',
  'Tri_Color',
];

const DIAMOND_TYPE = ['NATURAL', 'LAB_GROWN', 'NA'];

const ASSIGNED_TO = [
  'QG_STULLER',
  'BENCHMARK',
  'TRITON',
  'TUNGSTEN',
  'WATCH_PARTS_FREE_LINKS',
  'CUSTOM_JEWELRY_PIECE',
  'REPAIR_DIAMONDS_REPLACEMENT',
  'REPAIR_ROLEX',
  'OTHERS'
];

const STATUS = [
  'REJECTED',
  'SUBMITTED',
  'RECEIVED_BY_SPO_TEAM',
  'WIP',
  'COMPLETED',
  'CLOSED',
  'FINALIZED',
];

const spoUpdateHistorySchema = new mongoose.Schema(
  {
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'updateHistory.updatedByModel',
    },
    updatedByModel: {
      type: String,
      enum: ['Customer', 'User'],
      required: true,
    },
    updatedByName: {
      type: String,
      default: '',
    },
    updatedFields: {
      type: [String],
      default: [],
    },
    changes: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const spoChatSeenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userModel: { type: String, enum: ['Customer', 'User'], required: true },
    seenAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const spoChatMessageSchema = new mongoose.Schema(
  {
    text: { type: String, default: '', maxlength: 4000 },
    attachments: { type: [String], default: [] },
    role: { type: String, enum: ['user', 'admin'], required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, default: null },
    senderName: { type: String, default: '' },
    replyToMessageId: { type: mongoose.Schema.Types.ObjectId, default: null },
    replyToText: { type: String, default: '' },
    replyToSenderName: { type: String, default: '' },
    seenBy: { type: [spoChatSeenSchema], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const specialOrderSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, unique: true, index: true },
    trackingId: { type: String, unique: true, index: true },
    trackingProvider: {
    type: String,
    enum: ['UPS', 'FEDEX', ''],
    default: '',
    },
    trackingUrl: {
      type: String,
      default: '',
    },
    receiptNumber: { type: String, default: '' },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true, index: true },
    assignedTo: { type: String, enum: ASSIGNED_TO, default: null },
    customerNumber: { type: String, default: '' },
    typeOfRequest: { type: String, enum: TYPE_OF_REQUEST, required: true },
    referenceSkuNumber: { type: String, default: '' },
    metalQuality: { type: String, enum: METAL_QUALITY, required: true },
    diamondType: { type: String, enum: DIAMOND_TYPE, required: true },
    diamondColor: { type: String, default: '' },
    diamondClarity: { type: String, default: '' },
    diamondDetails: { type: String, default: '' },
    customization: { type: String, default: '' },
    attachments: [{ type: String }],
    canvasDrawing: { type: String, default: '' },
    status: { type: String, enum: STATUS, default: 'SUBMITTED', index: true },
    notes: { type: String, default: '' },
    eta: { type: Date, default: null },
    chatMessages: { type: [spoChatMessageSchema], default: [] },
    updateHistory: { type: [spoUpdateHistorySchema], default: [] },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, refPath: 'requestedByModel', },
    requestedByModel: { type: String, enum: ['Customer', 'User'], required: true },
  },
  { timestamps: true }
);

specialOrderSchema.index({ createdAt: -1 });
specialOrderSchema.index({ storeId: 1, status: 1 });

// specialOrderSchema.pre('save', async function (next) {
//   try {
//     if (this.isNew && !this.ticketNumber) {
//       const year = new Date().getFullYear();
//       const counterKey = `specialOrder-${year}`;

//       const counter = await CounterModel.findOneAndUpdate(
//         { _id: counterKey },
//         { $inc: { seq: 1 } },
//         { new: true, upsert: true }
//       );

//       this.ticketNumber = `SPO-${year}-${String(counter.seq).padStart(5, '0')}`;
//     }

//     next();
//   } catch (error) {
//     next(error);
//   }
// });
specialOrderSchema.pre('save', async function (next) {
  try {
    if (this.isNew && !this.ticketNumber) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');

      const counter = await CounterModel.findOneAndUpdate(
        { _id: 'SPO-ORDER' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );

      this.ticketNumber = `SPO-${year}-${month}-${String(counter.seq).padStart(7, '0')}`;
    }

    next();
  } catch (error) {
    next(error);
  }
});

const SpecialOrder = mongoose.model('SpecialOrder', specialOrderSchema);
module.exports = SpecialOrder;
module.exports.TYPE_OF_REQUEST = TYPE_OF_REQUEST;
module.exports.METAL_QUALITY = METAL_QUALITY;
module.exports.DIAMOND_TYPE = DIAMOND_TYPE;
module.exports.ASSIGNED_TO = ASSIGNED_TO;
module.exports.STATUS = STATUS;
