const mongoose = require('mongoose');

const sheetCategorySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    googleSheetUrl: { type: String, required: true, trim: true },
    allowedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Customer', index: true }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

sheetCategorySchema.index({ title: 1 });
sheetCategorySchema.index({ allowedUsers: 1, createdAt: -1 });

module.exports = mongoose.model('SheetCategory', sheetCategorySchema);
