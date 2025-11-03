const mongoose = require('mongoose');

const ticketStatusSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String },
  isDefault: { type: Boolean, default: false }
});

const TicketStatus = mongoose.model('TicketStatus', ticketStatusSchema);

module.exports = TicketStatus;
