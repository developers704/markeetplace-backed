const mongoose = require('mongoose');

const TYPE_OF_REQUEST = [
  'WATCH',
  'WATCH_PART',
  'STULLER_ITEM',
  'QG_ITEM',
  'CUSTOM_JEWELRY_PIECE',
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
  'NA',
];

const DIAMOND_TYPE = ['NATURAL', 'LAB_GROWN', 'NA'];

const ASSIGNED_TO = [
  'TRANSFER',
  'NON_STOCK_QG_STULLER',
  'NON_STOCK_BENCHMARK',
  'NON_STOCK_TRITON',
  'NON_STOCK_TUNGSTEN',
  'NON_STOCK_WATCH_PARTS_FREE_LINKS',
  'NON_STOCK_CUSTOM',
  'REPAIR_DIAMONDS_REPLACEMENT',
  'REPAIR_ROLEX',
];

const STATUS = [
  'SUBMITTED',
  'RECEIVED_BY_SPO_TEAM',
  'WIP',
  'COMPLETED',
  'CLOSED',
];

const specialOrderSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, unique: true, index: true },
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
    requestedBy: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    requestedByModel: { type: String, enum: ['Customer', 'User'], required: true },
  },
  { timestamps: true }
);

specialOrderSchema.index({ createdAt: -1 });
specialOrderSchema.index({ storeId: 1, status: 1 });

specialOrderSchema.pre('save', async function (next) {
  if (this.isNew && !this.ticketNumber) {
    const count = await mongoose.model('SpecialOrder').countDocuments();
    const year = new Date().getFullYear();
    this.ticketNumber = `SPO-${year}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

const SpecialOrder = mongoose.model('SpecialOrder', specialOrderSchema);
module.exports = SpecialOrder;
module.exports.TYPE_OF_REQUEST = TYPE_OF_REQUEST;
module.exports.METAL_QUALITY = METAL_QUALITY;
module.exports.DIAMOND_TYPE = DIAMOND_TYPE;
module.exports.ASSIGNED_TO = ASSIGNED_TO;
module.exports.STATUS = STATUS;
