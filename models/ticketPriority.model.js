const mongoose = require('mongoose');

const ticketPrioritySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String },
  isDefault: { type: Boolean, default: false }
});

const TicketPriority = mongoose.model('TicketPriority', ticketPrioritySchema);

module.exports = TicketPriority;
