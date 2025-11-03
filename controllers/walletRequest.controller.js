const WalletRequest = require('../models/walletRequest.model');
const Wallet = require('../models/wallet.model');
const AdminNotification = require('../models/adminNotification.model');
const Notification = require('../models/notification.model');
const WarehouseWallet = require('../models/warehouseWallet.model');
const InventoryWallet = require('../models/inventoryWallet.model');
const SuppliesWallet = require('../models/suppliesWallet.model');
const Customer = require('../models/customer.model');
// Customer creates wallet request
const createWalletRequest = async (req, res) => {
  try {
    const { amount, reason, targetWallet } = req.body;
    const customerId = req.user.id;

    const customer = await Customer.findById(customerId).populate('warehouse');
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const walletRequest = await WalletRequest.create({
      customer: customerId,
      targetWallet,
      amount,
      reason
    });

    // Create notification for admin
    await AdminNotification.create({
      user: "66c5bc4b3c1526016eeac109", // Admin ID
      type: 'WALLET_REQUEST',
      // content: `New ${targetWallet} request of ${amount} from customer`,
      content: `${customer.warehouse.name} request ${amount} Loan for ${targetWallet}`,
      resourceId: walletRequest._id,
      resourceModel: 'WalletRequest',
      priority: 'medium'
    });

    res.status(201).json(walletRequest);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Admin handles wallet request
const handleWalletRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status, comment } = req.body;
    const adminId = req.user.id;

    const walletRequest = await WalletRequest.findById(requestId)
    .populate({
      path: 'customer',
      populate: { path: 'warehouse' }
    });
    if (!walletRequest) {
      return res.status(404).json({ message: 'Request not found' });
    }

    walletRequest.status = status;
    walletRequest.adminResponse = {
      admin: adminId,
      responseDate: new Date(),
      comment
    };

    // if (status === 'approved') {
    //   if (walletRequest.targetWallet === 'personal') {
    //     const wallet = await Wallet.findOne({ customer: walletRequest.customer._id });
    //     wallet.balance += walletRequest.amount;
    //     await wallet.save();
    //   } else if (walletRequest.targetWallet === 'warehouse') {
    //     const warehouseWallet = await WarehouseWallet.findOne({ warehouse: walletRequest.customer.warehouse });
    //     warehouseWallet.balance += walletRequest.amount;
    //     await warehouseWallet.save();
    //   }
    // }

    if (status === 'approved') {
      if (walletRequest.targetWallet === 'personal') {
        let wallet = await Wallet.findOne({ customer: walletRequest.customer._id });
        if (!wallet) {
          wallet = new Wallet({ customer: walletRequest.customer._id, balance: 0 });
        }
        wallet.balance += walletRequest.amount;
        await wallet.save();
      } else if (walletRequest.targetWallet === 'warehouse') {
        if (!walletRequest.customer.warehouse) {
          throw new Error('Customer does not have an associated warehouse');
        }
        let warehouseWallet = await WarehouseWallet.findOne({ warehouse: walletRequest.customer.warehouse });
        if (!warehouseWallet) {
          warehouseWallet = new WarehouseWallet({ warehouse: walletRequest.customer.warehouse, balance: 0 });
        }
        warehouseWallet.balance += walletRequest.amount;
        await warehouseWallet.save();
      }else if (walletRequest.targetWallet === 'inventory') {
        if (!walletRequest.customer.warehouse) {
          throw new Error('Customer does not have an associated warehouse');
        }
        let inventoryWallet = await InventoryWallet.findOne({ warehouse: walletRequest.customer.warehouse });
        if (!inventoryWallet) {
          inventoryWallet = new InventoryWallet({ warehouse: walletRequest.customer.warehouse, balance: 0 });
        }
        inventoryWallet.balance += walletRequest.amount;
        await inventoryWallet.save();
      } else if (walletRequest.targetWallet === 'supplies') {
        if (!walletRequest.customer.warehouse) {
          throw new Error('Customer does not have an associated warehouse');
        }
        let suppliesWallet = await SuppliesWallet.findOne({ warehouse: walletRequest.customer.warehouse });
        if (!suppliesWallet) {
          suppliesWallet = new SuppliesWallet({ warehouse: walletRequest.customer.warehouse, balance: 0 });
        }
        suppliesWallet.balance += walletRequest.amount;
        await suppliesWallet.save();
      }
    }

    await walletRequest.save();

    // Create notification for customer
    await Notification.create({
      user: walletRequest.customer,
      content: `Your ${walletRequest.targetWallet} wallet request for ${walletRequest.amount} has been ${status}`,
      url: `/wallet/requests/${walletRequest._id}`
    });

    res.status(200).json(walletRequest);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get wallet requests for customer
const getCustomerWalletRequests = async (req, res) => {
  try {
    const requests = await WalletRequest.find({ customer: req.user._id })
      .sort({ createdAt: -1 });
    res.status(200).json(requests);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// const getCustomerWalletDetails = async (req, res) => {
//   try {
//       const customerId = req.user.id;
//       const customer = await Customer.findById(customerId).populate('warehouse');
      
//       const personalWallet = await Wallet.findOne({ customer: customerId });
//       const warehouseWallet = customer.warehouse ? 
//           await WarehouseWallet.findOne({ warehouse: customer.warehouse._id }) : null;

//       const walletRequests = await WalletRequest.find({ customer: customerId })
//           .sort('-createdAt')
//           .limit(5);  // Get the last 5 requests

//       const walletDetails = {
//           personalBalance: personalWallet ? personalWallet.balance : 0,
//           warehouseBalance: warehouseWallet ? warehouseWallet.balance : 0,
//           recentRequests: walletRequests.map(request => ({
//               id: request._id,
//               amount: request.amount,
//               status: request.status,
//               targetWallet: request.targetWallet,
//               createdAt: request.createdAt,
//               approvedAt: request.adminResponse ? request.adminResponse.responseDate : null
//           }))
//       };

//       res.status(200).json(walletDetails);
//   } catch (error) {
//       res.status(500).json({ message: error.message });
//   }
// };


// Get all wallet requests for admin
// const getAllWalletRequests = async (req, res) => {
//   try {
//     const requests = await WalletRequest.find()
//       .populate('customer', 'username email phone_number')
//       .sort({ createdAt: -1 });
//     res.status(200).json(requests);
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };


const getCustomerWalletDetails = async (req, res) => {
  try {
      const customerId = req.user.id;
      const customer = await Customer.findById(customerId).populate('warehouse');
      
      const personalWallet = await Wallet.findOne({ customer: customerId });
      
      // let warehouseWallet = null;
      let inventoryWallet = null;
      let suppliesWallet = null;
      
      if (customer.warehouse) {
          // warehouseWallet = await WarehouseWallet.findOne({ warehouse: customer.warehouse._id });
          inventoryWallet = await InventoryWallet.findOne({ warehouse: customer.warehouse._id });
          suppliesWallet = await SuppliesWallet.findOne({ warehouse: customer.warehouse._id });
      }

      const walletRequests = await WalletRequest.find({ customer: customerId })
          .sort('-createdAt')
          .limit(5);  // Get the last 5 requests

      const walletDetails = {
          personalBalance: personalWallet ? personalWallet.balance : 0,
          // warehouseBalance: warehouseWallet ? warehouseWallet.balance : 0,
          inventoryBalance: inventoryWallet ? inventoryWallet.balance : 0,
          suppliesBalance: suppliesWallet ? suppliesWallet.balance : 0,
          recentRequests: walletRequests.map(request => ({
              id: request._id,
              amount: request.amount,
              status: request.status,
              targetWallet: request.targetWallet,
              createdAt: request.createdAt,
              approvedAt: request.adminResponse ? request.adminResponse.responseDate : null
          }))
      };

      res.status(200).json(walletDetails);
  } catch (error) {
      res.status(500).json({ message: error.message });
  }
};


const getAllWalletRequests = async (req, res) => {
  try {
    const requests = await WalletRequest.find()
      .populate({
        path: 'customer',
        select: 'username email phone_number warehouse',
        populate: {
          path: 'warehouse',
          select: 'name'
        }
      })
      .sort({ createdAt: -1 });
    res.status(200).json(requests);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};


const bulkUpdateWalletRequests = async (req, res) => {
  try {
      const { requests } = req.body;

      if (!Array.isArray(requests) || requests.length === 0) {
          return res.status(400).json({ message: 'Valid requests array is required' });
      }

      const updatedRequests = await Promise.all(
          requests.map(async ({ requestId, amount }) => {
              const walletRequest = await WalletRequest.findByIdAndUpdate(
                  requestId,
                  { $set: { amount: amount } },
                  { new: true, runValidators: true }
              );
              
              if (!walletRequest) {
                  return {
                      requestId,
                      success: false,
                      message: 'Request not found'
                  };
              }

              if (walletRequest.status === 'approved') {
                  return {
                      requestId,
                      success: false,
                      message: 'Cannot update approved requests'
                  };
              }

              if (!amount || amount <= 0) {
                  return {
                      requestId,
                      success: false,
                      message: 'Invalid amount'
                  };
              }

              await AdminNotification.create({
                  user: "66c5bc4b3c1526016eeac109",
                  type: 'WALLET_REQUEST_UPDATE',
                  content: `Wallet request amount updated to ${amount}`,
                  resourceId: walletRequest._id,
                  resourceModel: 'WalletRequest',
                  priority: 'medium'
              });

              return {
                  requestId,
                  success: true,
                  updatedRequest: walletRequest
              };
          })
      );

      const successCount = updatedRequests.filter(result => result.success).length;

      res.status(200).json({
          message: `Successfully updated ${successCount} wallet requests`,
          results: updatedRequests
      });
  } catch (error) {
      res.status(400).json({ message: error.message });
  }
};





module.exports = {
  createWalletRequest,
  handleWalletRequest,
  getCustomerWalletRequests,
  getAllWalletRequests,
  getCustomerWalletDetails,
  bulkUpdateWalletRequests
};
