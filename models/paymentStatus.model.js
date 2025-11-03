const mongoose = require('mongoose');

const PaymentStatusSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
});

module.exports = mongoose.model('PaymentStatus', PaymentStatusSchema);
