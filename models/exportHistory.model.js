const mongoose = require('mongoose');

const exportHistorySchema = new mongoose.Schema(
  {
    /** Public id returned to clients (UUID) */
    exportId: { type: String, required: true, unique: true, index: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed'],
      default: 'queued',
      index: true,
    },
    fileName: { type: String, default: '' },
    /** Relative path e.g. uploads/exports/vendor-products-....csv */
    filePath: { type: String, default: '' },
    totalRecords: { type: Number, default: 0 },
    error: { type: String, default: '' },
    filters: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    bullJobId: { type: String, default: null, index: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model('ExportHistory', exportHistorySchema);
