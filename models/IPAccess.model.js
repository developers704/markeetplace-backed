const mongoose = require("mongoose");

const IPAccess = mongoose.Schema(
  {
    address: {
      type: String,
    },
    description: {
      type: String,
    },
    created_date: {
      type: String,
    },
    updated_date: {
      type: String,
    },
    access: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("IPAccess", IPAccess);
