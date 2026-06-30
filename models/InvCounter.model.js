// models/InventoryCounter.js
const mongoose = require("mongoose");

const inventoryCounter = new mongoose.Schema({
  _id: { type: String },
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model("InventoryCounter", inventoryCounter);