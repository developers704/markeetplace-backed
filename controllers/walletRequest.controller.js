const WalletRequest = require('../models/walletRequest.model');
const Wallet = require('../models/wallet.model');
const AdminNotification = require('../models/adminNotification.model');
const Notification = require('../models/notification.model');
const WarehouseWallet = require('../models/warehouseWallet.model');
const InventoryWallet = require('../models/inventoryWallet.model');
const SuppliesWallet = require('../models/suppliesWallet.model');
const Customer = require('../models/customer.model');

const createWalletRequest = async (req, res) => {
  try {
    const { amount, reason, targetWallet, selectedWarehouseId } = req.body;
    const customerId = req.user.id;

    const customer = await Customer.findById(customerId).populate('warehouse');
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    
    if (
      !selectedWarehouseId ||
      !customer.warehouse.some((w) => w._id.toString() === selectedWarehouseId)
    ) {
      return res.status(400).json({
        message: 'Invalid or unauthorized warehouse selection.',
      });
    }

    const selectedWarehouse = customer.warehouse.find(
      (w) => w._id.toString() === selectedWarehouseId
    );
    // ✅ Create wallet request
    const walletRequest = await WalletRequest.create({
      customer: customerId,
      targetWallet,
      amount,
      reason,
      selectedWarehouse: selectedWarehouseId,
    });

    // ✅ Notify Admin
    await AdminNotification.create({
      user: '66c5bc4b3c1526016eeac109', // static admin (can make dynamic later)
      type: 'WALLET_REQUEST',
      content: `${selectedWarehouse.name} requested ${amount} loan for ${targetWallet}`,
      resourceId: walletRequest._id,
      resourceModel: 'WalletRequest',
      priority: 'medium',
    });

    res.status(201).json(walletRequest);
  } catch (error) {
    console.error('Error creating wallet request:', error);
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
      .populate('customer', 'username email warehouse')
      .populate('selectedWarehouse', 'name');

    if (!walletRequest) {
      return res.status(404).json({ message: 'Wallet request not found' });
    }

    walletRequest.status = status;
    walletRequest.adminResponse = {
      admin: adminId,
      responseDate: new Date(),
      comment,
    };

 
    if (status === 'approved') {
      if (walletRequest.targetWallet === 'personal') {
        let wallet = await Wallet.findOne({ customer: walletRequest.customer._id });
        if (!wallet) {
          wallet = new Wallet({ customer: walletRequest.customer._id, balance: 0 });
        }
        wallet.balance += walletRequest.amount;
        await wallet.save();
      }

      if (walletRequest.targetWallet === 'warehouse') {
        let warehouseWallet = await WarehouseWallet.findOne({
          warehouse: walletRequest.selectedWarehouse,
        });
        if (!warehouseWallet) {
          warehouseWallet = new WarehouseWallet({
            warehouse: walletRequest.selectedWarehouse,
            balance: 0,
          });
        }
        warehouseWallet.balance += walletRequest.amount;
        await warehouseWallet.save();
      }

      if (walletRequest.targetWallet === 'inventory') {
        let inventoryWallet = await InventoryWallet.findOne({
          warehouse: walletRequest.selectedWarehouse,
        });
        if (!inventoryWallet) {
          inventoryWallet = new InventoryWallet({
            warehouse: walletRequest.selectedWarehouse,
            balance: 0,
          });
        }
        inventoryWallet.balance += walletRequest.amount;
        await inventoryWallet.save();
      }

      if (walletRequest.targetWallet === 'supplies') {
        let suppliesWallet = await SuppliesWallet.findOne({
          warehouse: walletRequest.selectedWarehouse,
        });
        if (!suppliesWallet) {
          suppliesWallet = new SuppliesWallet({
            warehouse: walletRequest.selectedWarehouse,
            balance: 0,
          });
        }
        suppliesWallet.balance += walletRequest.amount;
        await suppliesWallet.save();
      }
    }

    await walletRequest.save();

 
    await Notification.create({
      user: walletRequest.customer._id,
      content: `Your ${walletRequest.targetWallet} wallet request for ${walletRequest.amount} has been ${status}.`,
      url: `/wallet/requests/${walletRequest._id}`,
    });

    res.status(200).json(walletRequest);
  } catch (error) {
    console.error('Error handling wallet request:', error);
    res.status(400).json({ message: error.message });
  }
};


const getCustomerWalletRequests = async (req, res) => {
  try {
    const requests = await WalletRequest.find({ customer: req.user._id })
      .populate('selectedWarehouse', 'name')
      .sort({ createdAt: -1 });
    res.status(200).json(requests);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};


const getCustomerWalletDetails = async (req, res) => {
  try {
    const customerId = req.user.id;
    const customer = await Customer.findById(customerId).populate('warehouse');

    const personalWallet = await Wallet.findOne({ customer: customerId });
    let inventoryWallet = null;
    let suppliesWallet = null;

    if (customer.warehouse?.length) {
      const firstWarehouse = customer.warehouse[0]; // optional, pick one if needed
      inventoryWallet = await InventoryWallet.findOne({ warehouse: firstWarehouse._id });
      suppliesWallet = await SuppliesWallet.findOne({ warehouse: firstWarehouse._id });
    }

    const walletRequests = await WalletRequest.find({ customer: customerId })
      .sort('-createdAt')
      .limit(5)
      .populate('selectedWarehouse', 'name');

    const walletDetails = {
      personalBalance: personalWallet ? personalWallet.balance : 0,
      inventoryBalance: inventoryWallet ? inventoryWallet.balance : 0,
      suppliesBalance: suppliesWallet ? suppliesWallet.balance : 0,
      recentRequests: walletRequests.map((request) => ({
        id: request._id,
        amount: request.amount,
        status: request.status,
        targetWallet: request.targetWallet,
        selectedWarehouse: request.selectedWarehouse?.name || 'N/A',
        createdAt: request.createdAt,
        approvedAt: request.adminResponse?.responseDate || null,
      })),
    };

    res.status(200).json(walletDetails);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


const getAllWalletRequests = async (req, res) => {
  try {
    const requests = await WalletRequest.find()
      .populate('customer', 'username email phone_number')
      .populate('selectedWarehouse', 'name location')
      .sort({ createdAt: -1 });
    res.status(200).json(requests);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const bulkUpdateWalletRequests = async (req, res) => {
  try {
    const { requests } = req.body;
    if (!Array.isArray(requests) || !requests.length) {
      return res.status(400).json({ message: 'Valid requests array is required' });
    }

    const updatedRequests = await Promise.all(
      requests.map(async ({ requestId, amount }) => {
        const walletRequest = await WalletRequest.findById(requestId);
        if (!walletRequest)
          return { requestId, success: false, message: 'Request not found' };

        if (walletRequest.status === 'approved')
          return { requestId, success: false, message: 'Cannot update approved requests' };

        if (!amount || amount <= 0)
          return { requestId, success: false, message: 'Invalid amount' };

        walletRequest.amount = amount;
        await walletRequest.save();

        await AdminNotification.create({
          user: '66c5bc4b3c1526016eeac109',
          type: 'WALLET_REQUEST_UPDATE',
          content: `Wallet request amount updated to ${amount}`,
          resourceId: walletRequest._id,
          resourceModel: 'WalletRequest',
          priority: 'medium',
        });

        return { requestId, success: true, updatedRequest: walletRequest };
      })
    );

    const successCount = updatedRequests.filter((r) => r.success).length;
    res.status(200).json({
      message: `Successfully updated ${successCount} wallet requests`,
      results: updatedRequests,
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
  bulkUpdateWalletRequests,
};



// const createWalletRequest = async (req, res) => {
//   try {
//     const { amount, reason, targetWallet, selectedWarehouseId } = req.body; // 🟢 now warehouseId comes from frontend (localStorage)
//     const customerId = req.user.id;

//     userData = req.user;
//     console.log("requested user data", userData);
    

//     // 1️⃣ Customer fetch karo (saare warehouses ke saath)
//     const customer = await Customer.findById(customerId).populate('warehouse');
//     if (!customer) {
//       return res.status(404).json({ message: 'Customer not found' });
//     }

//     // 2️⃣ Check karo kya selectedWarehouseId valid hai
//     if (
//       !selectedWarehouseId ||
//       !customer.warehouse.some((w) => w._id.toString() === selectedWarehouseId)
//     ) {
//       return res.status(400).json({ message: 'Invalid or unauthorized warehouse selection.' });
//     }

//     // 3️⃣ Selected warehouse object nikaalo
//     const selectedWarehouse = customer.warehouse.find(
//       (w) => w._id.toString() === selectedWarehouseId
//     );

//     // 4️⃣ Wallet request create karo
//     const walletRequest = await WalletRequest.create({
//       customer: customerId,
//       targetWallet,
//       amount,
//       reason,
//       selectedWarehouse: selectedWarehouseId // 🟢 optional: agar WalletRequest schema me warehouse field ho
//     });

//     // 5️⃣ Admin notification create karo
//     await AdminNotification.create({
//       user: "66c5bc4b3c1526016eeac109", // Admin ID (you can make this dynamic later)
//       type: 'WALLET_REQUEST',
//       content: `${selectedWarehouse.name} requested ${amount} loan for ${targetWallet}`,
//       resourceId: walletRequest._id,
//       resourceModel: 'WalletRequest',
//       priority: 'medium'
//     });

//     // 6️⃣ Response send karo
//     res.status(201).json(walletRequest);
//   } catch (error) {
//     console.error("Error creating wallet request:", error);
//     res.status(400).json({ message: error.message });
//   }
// };


// // Admin handles wallet request
// const handleWalletRequest = async (req, res) => {
//   try {
//     const { requestId } = req.params;
//     const { status, comment } = req.body;
//     const adminId = req.user.id;

//     const walletRequest = await WalletRequest.findById(requestId)
//     .populate({
//       path: 'customer',
//       populate: { path: 'warehouse' }
//     });
//     if (!walletRequest) {
//       return res.status(404).json({ message: 'Request not found' });
//     }

//     walletRequest.status = status;
//     walletRequest.adminResponse = {
//       admin: adminId,
//       responseDate: new Date(),
//       comment
//     };

//     // if (status === 'approved') {
//     //   if (walletRequest.targetWallet === 'personal') {
//     //     const wallet = await Wallet.findOne({ customer: walletRequest.customer._id });
//     //     wallet.balance += walletRequest.amount;
//     //     await wallet.save();
//     //   } else if (walletRequest.targetWallet === 'warehouse') {
//     //     const warehouseWallet = await WarehouseWallet.findOne({ warehouse: walletRequest.customer.warehouse });
//     //     warehouseWallet.balance += walletRequest.amount;
//     //     await warehouseWallet.save();
//     //   }
//     // }

//     if (status === 'approved') {
//       if (walletRequest.targetWallet === 'personal') {
//         let wallet = await Wallet.findOne({ customer: walletRequest.customer._id });
//         if (!wallet) {
//           wallet = new Wallet({ customer: walletRequest.customer._id, balance: 0 });
//         }
//         wallet.balance += walletRequest.amount;
//         await wallet.save();
//       } else if (walletRequest.targetWallet === 'warehouse') {
//         if (!walletRequest.customer.warehouse) {
//           throw new Error('Customer does not have an associated warehouse');
//         }
//         let warehouseWallet = await WarehouseWallet.findOne({ warehouse: walletRequest.selectedWarehouse });
//         if (!warehouseWallet) {
//           warehouseWallet = new WarehouseWallet({ warehouse: walletRequest.selectedWarehouse, balance: 0 });
//         }
//         warehouseWallet.balance += walletRequest.amount;
//         await warehouseWallet.save();
//       }else if (walletRequest.targetWallet === 'inventory') {
//         if (!walletRequest.customer.warehouse) {
//           throw new Error('Customer does not have an associated warehouse');
//         }
//         let inventoryWallet = await InventoryWallet.findOne({ warehouse: walletRequest.customer.warehouse });
//         if (!inventoryWallet) {
//           inventoryWallet = new InventoryWallet({ warehouse: walletRequest.customer.warehouse, balance: 0 });
//         }
//         inventoryWallet.balance += walletRequest.amount;
//         await inventoryWallet.save();
//       } else if (walletRequest.targetWallet === 'supplies') {
//         if (!walletRequest.customer.warehouse) {
//           throw new Error('Customer does not have an associated warehouse');
//         }
//         let suppliesWallet = await SuppliesWallet.findOne({ warehouse: walletRequest.customer.warehouse });
//         if (!suppliesWallet) {
//           suppliesWallet = new SuppliesWallet({ warehouse: walletRequest.customer.warehouse, balance: 0 });
//         }
//         suppliesWallet.balance += walletRequest.amount;
//         await suppliesWallet.save();
//       }
//     }

//     await walletRequest.save();

//     // Create notification for customer
//     await Notification.create({
//       user: walletRequest.customer,
//       content: `Your ${walletRequest.targetWallet} wallet request for ${walletRequest.amount} has been ${status}`,
//       url: `/wallet/requests/${walletRequest._id}`
//     });

//     res.status(200).json(walletRequest);
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };

// // Get wallet requests for customer
// const getCustomerWalletRequests = async (req, res) => {
//   try {
//     const requests = await WalletRequest.find({ customer: req.user._id })
//       .sort({ createdAt: -1 });
//     res.status(200).json(requests);
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };

// // const getCustomerWalletDetails = async (req, res) => {
// //   try {
// //       const customerId = req.user.id;
// //       const customer = await Customer.findById(customerId).populate('warehouse');
      
// //       const personalWallet = await Wallet.findOne({ customer: customerId });
// //       const warehouseWallet = customer.warehouse ? 
// //           await WarehouseWallet.findOne({ warehouse: customer.warehouse._id }) : null;

// //       const walletRequests = await WalletRequest.find({ customer: customerId })
// //           .sort('-createdAt')
// //           .limit(5);  // Get the last 5 requests

// //       const walletDetails = {
// //           personalBalance: personalWallet ? personalWallet.balance : 0,
// //           warehouseBalance: warehouseWallet ? warehouseWallet.balance : 0,
// //           recentRequests: walletRequests.map(request => ({
// //               id: request._id,
// //               amount: request.amount,
// //               status: request.status,
// //               targetWallet: request.targetWallet,
// //               createdAt: request.createdAt,
// //               approvedAt: request.adminResponse ? request.adminResponse.responseDate : null
// //           }))
// //       };

// //       res.status(200).json(walletDetails);
// //   } catch (error) {
// //       res.status(500).json({ message: error.message });
// //   }
// // };


// // Get all wallet requests for admin
// // const getAllWalletRequests = async (req, res) => {
// //   try {
// //     const requests = await WalletRequest.find()
// //       .populate('customer', 'username email phone_number')
// //       .sort({ createdAt: -1 });
// //     res.status(200).json(requests);
// //   } catch (error) {
// //     res.status(400).json({ message: error.message });
// //   }
// // };


// const getCustomerWalletDetails = async (req, res) => {
//   try {
//       const customerId = req.user.id;
//       const customer = await Customer.findById(customerId).populate('warehouse');
      
//       const personalWallet = await Wallet.findOne({ customer: customerId });
      
//       // let warehouseWallet = null;
//       let inventoryWallet = null;
//       let suppliesWallet = null;
      
//       if (customer.warehouse) {
//           // warehouseWallet = await WarehouseWallet.findOne({ warehouse: customer.warehouse._id });
//           inventoryWallet = await InventoryWallet.findOne({ warehouse: customer.warehouse._id });
//           suppliesWallet = await SuppliesWallet.findOne({ warehouse: customer.warehouse._id });
//       }

//       const walletRequests = await WalletRequest.find({ customer: customerId })
//           .sort('-createdAt')
//           .limit(5);  // Get the last 5 requests

//       const walletDetails = {
//           personalBalance: personalWallet ? personalWallet.balance : 0,
//           // warehouseBalance: warehouseWallet ? warehouseWallet.balance : 0,
//           inventoryBalance: inventoryWallet ? inventoryWallet.balance : 0,
//           suppliesBalance: suppliesWallet ? suppliesWallet.balance : 0,
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


// const getAllWalletRequests = async (req, res) => {
//   try {
//     // const requests = await WalletRequest.find()
//     //   .populate({
//     //     path: 'customer',
//     //     select: 'username email phone_number warehouse',
//     //     populate: {
//     //       path: 'warehouse',
//     //       select: 'name'
//     //     }
//     //   })
//     //   .sort({ createdAt: -1 });
//     const requests = await WalletRequest.find()
//   .populate('customer', 'username email phone_number')
//   .populate('selectedWarehouse', 'name location') // ✅ new field
//   .sort({ createdAt: -1 });
//     res.status(200).json(requests);
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };


// const bulkUpdateWalletRequests = async (req, res) => {
//   try {
//       const { requests } = req.body;

//       if (!Array.isArray(requests) || requests.length === 0) {
//           return res.status(400).json({ message: 'Valid requests array is required' });
//       }

//       const updatedRequests = await Promise.all(
//           requests.map(async ({ requestId, amount }) => {
//               const walletRequest = await WalletRequest.findByIdAndUpdate(
//                   requestId,
//                   { $set: { amount: amount } },
//                   { new: true, runValidators: true }
//               );
              
//               if (!walletRequest) {
//                   return {
//                       requestId,
//                       success: false,
//                       message: 'Request not found'
//                   };
//               }

//               if (walletRequest.status === 'approved') {
//                   return {
//                       requestId,
//                       success: false,
//                       message: 'Cannot update approved requests'
//                   };
//               }

//               if (!amount || amount <= 0) {
//                   return {
//                       requestId,
//                       success: false,
//                       message: 'Invalid amount'
//                   };
//               }

//               await AdminNotification.create({
//                   user: "66c5bc4b3c1526016eeac109",
//                   type: 'WALLET_REQUEST_UPDATE',
//                   content: `Wallet request amount updated to ${amount}`,
//                   resourceId: walletRequest._id,
//                   resourceModel: 'WalletRequest',
//                   priority: 'medium'
//               });

//               return {
//                   requestId,
//                   success: true,
//                   updatedRequest: walletRequest
//               };
//           })
//       );

//       const successCount = updatedRequests.filter(result => result.success).length;

//       res.status(200).json({
//           message: `Successfully updated ${successCount} wallet requests`,
//           results: updatedRequests
//       });
//   } catch (error) {
//       res.status(400).json({ message: error.message });
//   }
// };





// module.exports = {
//   createWalletRequest,
//   handleWalletRequest,
//   getCustomerWalletRequests,
//   getAllWalletRequests,
//   getCustomerWalletDetails,
//   bulkUpdateWalletRequests
// };
