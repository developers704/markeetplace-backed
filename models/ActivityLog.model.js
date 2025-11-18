const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ["APPROVE", "DISAPPROVE", "UPDATE_STATUS"],
      required: true,
    },

    // Dynamic referencing (User or Customer)
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "actorModel"
    },

    actorModel: {
      type: String,
      required: true,
      enum: ["User", "Customer"] 
    },

    role: {
      type: String,
      required: true,
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },

    remarks: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ActivityLog", activityLogSchema);
