const Customer = require('../models/customer.model');

const checkAccountStatus = async (req, res, next) => {
  if (req.user) {  // Only check for logged-in users
    const customerId = req.user.id;
    const customer = await Customer.findById(customerId);

    if (customer && customer.isDeactivated) {
      return res.status(403).json({ message: 'Your account is deactivated. Please contact support to reactivate.' });
    }
  }
  
  next(); // Proceed for guest users or non-deactivated users
};


module.exports = checkAccountStatus;
