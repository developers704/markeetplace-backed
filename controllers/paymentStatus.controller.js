const PaymentStatus = require('../models/paymentStatus.model');

// Create PaymentStatus
exports.createPaymentStatus = async (req, res) => {
    try {
      const { name } = req.body;
      const paymentStatus = new PaymentStatus({ name: name.charAt(0).toUpperCase() + name.slice(1) }); // Capitalize first letter
  
      await paymentStatus.save();
      res.status(201).json({ message: "Payment Status created successfully", paymentStatus });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };
  
  // Get all PaymentStatuses
  exports.getPaymentStatuses = async (req, res) => {
    try {
      const paymentStatuses = await PaymentStatus.find();
      res.status(200).json(paymentStatuses);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };
  
  // Update PaymentStatus
  exports.updatePaymentStatus = async (req, res) => {
    try {
      const { id } = req.params;
      const { name } = req.body;
  
      const paymentStatus = await PaymentStatus.findById(id);
      if (!paymentStatus) {
        return res.status(404).json({ message: "PaymentStatus not found." });
      }
  
      paymentStatus.name = name.charAt(0).toUpperCase() + name.slice(1); // Capitalize first letter
      await paymentStatus.save();
      res.status(200).json({ message: "PaymentStatus updated successfully", paymentStatus });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };
  
  // Bulk delete PaymentStatuses
  exports.bulkDeletePaymentStatuses = async (req, res) => {
    try {
      const { ids } = req.body;
      if (!ids || !ids.length) {
        return res.status(400).json({ message: "No IDs provided for deletion." });
      }
  
      const result = await PaymentStatus.deleteMany({ _id: { $in: ids } });
      res.status(200).json({ message: `${result.deletedCount} PaymentStatuses deleted successfully.` });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };
  