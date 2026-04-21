const mongoose = require('mongoose');

const importJobSchema = new mongoose.Schema(
  {
    /** Public id for clients / Socket.IO rooms */
    jobId: { type: String, required: true, unique: true, index: true },
    /** BullMQ job id (stringified) */
    bullJobId: { type: String, default: null, index: true },
    type: { type: String, default: 'vendor-csv-import' },
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed'],
      default: 'queued',
      index: true,
    },
    csvPath: { type: String, required: true },
    originalFilename: { type: String, default: '' },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    totalRows: { type: Number, default: 0 },
    validRows: { type: Number, default: 0 },
    processedRows: { type: Number, default: 0 },
    failedRows: { type: Number, default: 0 },
    progressPercent: { type: Number, default: 0 },
    errorMessage: { type: String, default: '' },
    /** Relative path e.g. uploads/csv/error-reports/... */
    errorReportPath: { type: String, default: '' },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ImportJob', importJobSchema);
