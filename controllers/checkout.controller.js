const mongoose = require('mongoose');
const Cart = require('../models/cart.model');
const ShippingMethod = require('../models/shippingMethod.model');
const Inventory = require('../models/inventory.model');
const Address = require('../models/address.model');
const Order = require('../models/order.model');
const Product = require('../models/product.model');
const OrderStatus = require('../models/orderStatus.model');
const { getOrCreateCart, getCart } = require('../controllers/cart.controller');
const Coupon = require('../models/coupon.model');
const Bundle = require('../models/bundle.model');
const Customer = require('../models/customer.model');
const crypto = require('crypto');
const Wallet = require('../models/wallet.model');
const SpecialProduct = require('../models/specialProduct.model');
const AdminNotification = require('../models/adminNotification.model');
const WarehouseWallet = require('../models/warehouseWallet.model');
const { Parser } = require('json2csv');
const Notification = require('../models/notification.model');
const Warehouse = require('../models/warehouse.model');
const SuppliesWallet = require('../models/suppliesWallet.model');
const InventoryWallet = require('../models/inventoryWallet.model');
const User = require('../models/user.model');
const UserRole = require('../models/userRole.model');


// Helper function to generate a random order number
const generateOrderNumber = () => {
    const date = new Date().toISOString().replace(/[-T:\.Z]/g, '').slice(0, 12);  // Format: YYYYMMDDHHMM
    const randomStr = crypto.randomBytes(3).toString('hex');  // Random 6 characters
    return `ORD-${date}-${randomStr}`;  // Example: ORD-20240930-abc123
};


// previous code  calculateOrderTotalsHelper:
// const calculateOrderTotalsHelper = async (cartId, shippingMethodId, couponCode) => {
//   // Fetch the cart and shipping method
//   const cart = await Cart.findById(cartId);
//   const shippingMethod = await ShippingMethod.findById(shippingMethodId);

//   if (!cart) throw new Error('Cart not found');
//   if (cart.items.length === 0) throw new Error('Cart is empty');
//   if (!shippingMethod) throw new Error('Invalid shipping method');

//   // Use the total directly from the cart
//   const subtotal = cart.total; // Pre-calculated subtotal stored in the database

//   // Determine shipping cost based on free shipping threshold
//   const shippingCost =
//       subtotal >= shippingMethod.freeShippingThreshold
//           ? 0
//           : shippingMethod.price;

//   let coupon = null;
//   let grandTotal = subtotal + shippingCost;
//   let discountAmount = 0; // Initialize discount amount to zero

//   // Handle coupon logic (if applicable)
//   if (couponCode) {
//       coupon = await Coupon.findOne({ code: couponCode, isActive: true });

//       if (!coupon) {
//           throw new Error('Invalid or inactive coupon');
//       }

//       // Validate coupon expiration
//       const currentDate = new Date();
//       if (coupon.expiryDate && coupon.expiryDate < currentDate) {
//           throw new Error('Coupon has expired');
//       }

//       // Validate minimum purchase requirement
//       if (subtotal < coupon.minPurchase) {
//           throw new Error(
//               'Cart total does not meet the minimum purchase requirement for this coupon'
//           );
//       }

//       // Apply coupon discount and calculate the discount amount
//       if (coupon.discountType === 'percentage') {
//           discountAmount = grandTotal * (coupon.value / 100); // Percentage discount
//       } else if (coupon.discountType === 'fixed') {
//           discountAmount = coupon.value; // Fixed discount
//       }

//       // Ensure the discount does not exceed the grand total
//       discountAmount = Math.min(discountAmount, grandTotal);

//       // Update grand total after applying the discount
//       grandTotal -= discountAmount;
//   }

//   return {
//       subtotal,
//       shippingCost,
//       grandTotal, // Final total after applying any discounts
//       coupon,
//       discountAmount, // Explicitly return the discount amount
//   };
// };


// const calculateOrderTotalsHelper = async (cartId, couponCode) => {
//   // Fetch the cart and shipping method
//   const cart = await Cart.findById(cartId);
//   // const shippingMethod = await ShippingMethod.findById(shippingMethodId);

//   if (!cart) throw new Error('Cart not found');
//   if (cart.items.length === 0) throw new Error('Cart is empty');
//   // if (!shippingMethod) throw new Error('Invalid shipping method');

//   // Calculate subtotal for both product types
//   const productTotal = cart.items
//     .filter(item => item.itemType === 'Product')
//     .reduce((sum, item) => sum + (item.price * item.quantity), 0);

//   const specialProductTotal = cart.items
//     .filter(item => item.itemType === 'SpecialProduct')
//     .reduce((sum, item) => sum + (item.price * item.quantity), 0);

//   const subtotal = productTotal + specialProductTotal;

//   // Determine shipping cost based on free shipping threshold
//   // const shippingCost = subtotal >= shippingMethod.freeShippingThreshold ? 0 : shippingMethod.price;

//   let coupon = null;
//   let grandTotal = subtotal + shippingCost;
//   let discountAmount = 0;

//   // Handle coupon logic
//   if (couponCode) {
//     coupon = await Coupon.findOne({ code: couponCode, isActive: true });
//     if (!coupon) throw new Error('Invalid or inactive coupon');

//     const currentDate = new Date();
//     if (coupon.expiryDate && coupon.expiryDate < currentDate) {
//       throw new Error('Coupon has expired');
//     }

//     if (subtotal < coupon.minPurchase) {
//       throw new Error('Cart total does not meet the minimum purchase requirement for this coupon');
//     }

//     discountAmount = coupon.discountType === 'percentage' 
//       ? grandTotal * (coupon.value / 100) 
//       : coupon.value;

//     discountAmount = Math.min(discountAmount, grandTotal);
//     grandTotal -= discountAmount;
//   }

//   return {
//     subtotal,
//     // shippingCost,
//     grandTotal,
//     coupon,
//     discountAmount,
//   };
// };


const calculateOrderTotalsHelper = async (cartId, couponCode) => {
  const cart = await Cart.findById(cartId);

  if (!cart) throw new Error('Cart not found');
  if (cart.items.length === 0) throw new Error('Cart is empty');

  const productTotal = cart.items
    .filter(item => item.itemType === 'Product')
    .reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const specialProductTotal = cart.items
    .filter(item => item.itemType === 'SpecialProduct')
    .reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const subtotal = productTotal + specialProductTotal;

  let coupon = null;
  let grandTotal = subtotal;
  let discountAmount = 0;

  if (couponCode) {
    coupon = await Coupon.findOne({ code: couponCode, isActive: true });
    if (!coupon) throw new Error('Invalid or inactive coupon');

    const currentDate = new Date();
    if (coupon.expiryDate && coupon.expiryDate < currentDate) {
      throw new Error('Coupon has expired');
    }

    if (subtotal < coupon.minPurchase) {
      throw new Error('Cart total does not meet the minimum purchase requirement for this coupon');
    }

    discountAmount = coupon.discountType === 'percentage' 
      ? grandTotal * (coupon.value / 100) 
      : coupon.value;

    discountAmount = Math.min(discountAmount, grandTotal);
    grandTotal -= discountAmount;
  }

  return {
    subtotal,
    grandTotal,
    coupon,
    discountAmount,
  };
};



const calculateOrderTotals = async (req, res) => {
    try {
        const { cartId, shippingMethodId, couponCode } = req.body;

        const totals = await calculateOrderTotalsHelper(
            cartId,
            shippingMethodId,
            couponCode
        );

        res.status(200).json(totals);
    } catch (error) {
        //console.error('Error in calculateOrderTotals:', error);
        res.status(400).json({ message: error.message });
    }
};


const handleCODPayment = (order) => {
    // If payment method is COD, update payment status and order status
    order.paymentMethod = 'COD';
    order.paymentStatus = 'Pending'; // Default status for COD
    order.orderStatus = 'Confirm'; // Default order status for COD
  };
  
  const handleWalletPayment = async (order, session) => {
    // If payment method is Wallet, check balance and deduct
    const wallet = await Wallet.findOne({ customer: order.customer }).session(session);
    if (!wallet || wallet.balance < order.grandTotal) {
      throw new Error('Insufficient wallet balance');
    }
  
    wallet.balance -= order.grandTotal; // Deduct from wallet
    await wallet.save({ session });
  
    // Update payment and order status
    order.paymentMethod = 'Wallet';
    order.paymentStatus = 'Paid'; // Mark as paid
    order.orderStatus = 'Confirm';
  };
  
  const handlePaymentMethod = async (order, paymentMethod, session) => {
    if (paymentMethod === 'COD') {
      handleCODPayment(order); // Handle COD logic
    } else if (paymentMethod === 'Wallet') {
      await handleWalletPayment(order, session); // Handle Wallet logic
    } else {
      throw new Error('Invalid payment method');
    }
  };


// previous code  place order controller:
  // const placeOrder = async (req, res) => {
  //   const session = await mongoose.startSession();
  //   session.startTransaction();
  
  //   try {
  //     const {
  //       cartId,
  //       shippingMethodId,
  //       addressId,
  //       paymentMethod,
  //       guestInfo,
  //       guestAddress,
  //       specialInstructions,
  //       couponCode,
  //       cityId,
  //     } = req.body;
  
  //     // Fetch the cart and shipping method
  //     const cart = await Cart.findById(cartId);
  //     const shippingMethod = await ShippingMethod.findById(shippingMethodId);
  
  //     if (!cart || !shippingMethod) throw new Error('Cart or shipping method not found');
  //     if (cart.items.length === 0) throw new Error('Cart is empty');
  
  //     // Calculate order totals (subtotal, shipping, and grand total)
  //     const totals = await calculateOrderTotalsHelper(cartId, shippingMethodId, couponCode);
  
  //     // Prepare the order items and validate inventory
  //     const inventoryUpdates = [];
  //     const orderItems = await Promise.all(
  //       cart.items.map(async (item) => {
  //         const inventory = await Inventory.findOne({ product: item.item._id, city: cityId });
  
  //         if (!inventory || inventory.quantity < item.quantity) {
  //           throw new Error(`Not enough stock for product ${item.item.name}`);
  //         }
  
  //         // Decrement the inventory
  //         await Inventory.findOneAndUpdate(
  //           { product: item.item._id, city: cityId },
  //           { $inc: { quantity: -item.quantity } },
  //           { session, new: true }
  //         );
  
  //         return {
  //           product: item.item,
  //           quantity: item.quantity,
  //           price: item.price,
  //         };
  //       })
  //     );
  
  //     // Create the order object
  //     const order = new Order({
  //       orderId: generateOrderNumber(),
  //       customer: req.user ? req.user._id : null,
  //       guestInfo: req.user ? null : guestInfo,
  //       sessionId: req.session ? req.session.id : null,
  //       items: orderItems,
  //       shippingAddress: req.user ? addressId : null,
  //       guestAddress: req.user ? null : guestAddress,
  //       shippingMethod: shippingMethodId,
  //       city: cityId,
  //       subtotal: totals.subtotal,
  //       shippingCost: totals.shippingCost,
  //       grandTotal: totals.grandTotal,
  //       couponUsed: couponCode || null,
  //       paymentMethod: paymentMethod, // Use the selected payment method
  //       paymentStatus: 'Incomplete', // Default payment status
  //       orderStatus: 'Pending', // Default order status
  //       specialInstructions,
  //     });
  
  //     // Handle payment method logic
  //     await handlePaymentMethod(order, paymentMethod, session);
  
  //     // Save the order and empty the cart
  //     await order.save({ session });
  
  //     // Clear the cart after successful order creation
  //     cart.items = [];
  //     cart.total = 0;
  //     await cart.save({ session });
  
  //     // Commit the transaction to ensure data consistency
  //     await session.commitTransaction();
  //     session.endSession();
  
  //     res.status(201).json({ message: 'Order placed successfully', order });
  //   } catch (error) {
  //     // Abort the transaction if any error occurs
  //     await session.abortTransaction();
  //     session.endSession();
  //     res.status(400).json({ message: error.message });
  //   }
  // };
  

//this is for if we want to make two step order order and payment method separate
// const placeOrder = async (req, res) => {
//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//       const {
//         cartId,
//         shippingMethodId,
//         addressId,
//         paymentMethod,
//         guestInfo,
//         guestAddress,
//         specialInstructions,
//         couponCode,
//         cityId, // City ID provided for the order
//         paymentStatus, // Optional from request
//         orderStatus, // Optional from request
//       } = req.body;

//       // Fetch the cart
//       const cart = await Cart.findById(cartId).populate({
//         path: "items.item",
//         select: "name price",
//         model: "Product",
//       });

//       if (!cart) throw new Error("Cart not found");
//       if (cart.items.length === 0) throw new Error("Cart is empty");

//       // Fetch the shipping method
//       const shippingMethod = await ShippingMethod.findById(shippingMethodId);
//       if (!shippingMethod) throw new Error("Invalid shipping method");

//       // Calculate order totals (subtotal, shipping cost, grand total, etc.)
//       const totals = await calculateOrderTotalsHelper(
//         cartId,
//         shippingMethodId,
//         couponCode
//       );

//       // Fetch default order status
//       const defaultStatus = await OrderStatus.findOne({ isDefault: true });
//       if (!defaultStatus) throw new Error("Default order status not found");

//       // Prepare order items and validate inventory
//     const inventoryUpdates = [];
//     const orderItems = await Promise.all(
//       cart.items.map(async (item) => {
//         // Ensure product and city match in inventory
//         const inventory = await Inventory.findOne({
//           product: item.item._id,
//           city: cityId,
//         });

//        // console.log(`Fetched inventory for product ${item.item._id} in city ${cityId}:`, inventory);

//         if (!inventory || inventory.quantity < item.quantity) {
//           throw new Error(
//             `Not enough stock for product ${item.item.name} in city ${cityId}`
//           );
//         }

//         // Decrement inventory quantity for the specific product and city
//       //  console.log(`Decrementing quantity for product ${item.item._id} in city ${cityId} by ${item.quantity}`);
//         const inventoryUpdate = await Inventory.findOneAndUpdate(
//           { product: item.item._id, city: cityId },
//           { $inc: { quantity: -item.quantity } },
//           { session, new: true } // Return the updated inventory
//         );

//         if (!inventoryUpdate) {
//           throw new Error(`Inventory update failed for product ${item.item.name} in city ${cityId}`);
//         }

//       //  console.log('Inventory after update:', inventoryUpdate);

//         return {
//           product: item.item,
//           quantity: item.quantity,
//           price: item.price,
//         };
//       })
//     );

//       // Create the order object
//       const order = new Order({
//         orderId: generateOrderNumber(),
//         customer: req.user ? req.user._id : null,
//         guestInfo: req.user ? null : guestInfo,
//         sessionId: req.session ? req.session.id : null,
//         items: orderItems,
//         shippingAddress: req.user ? addressId : null,
//         guestAddress: req.user ? null : guestAddress,
//         shippingMethod: shippingMethodId,
//         city: cityId, // Save cityId in the order
//         subtotal: totals.subtotal,
//         shippingCost: totals.shippingCost,
//         grandTotal: totals.grandTotal,
//         couponUsed: couponCode || null,
//         paymentMethod: paymentMethod || null, // Optional, defaulting to null
//         paymentStatus: paymentStatus || "Incomplete", // Default to "Incomplete" if not provided
//         orderStatus: orderStatus || "Pending", // Default to requested status or database default
//         specialInstructions,
//       });

//       await order.save({ session });

//       // Empty the cart items and reset the total
//       cart.items = [];
//       cart.total = 0;
//       await cart.save({ session });

//       // Commit the transaction
//       await session.commitTransaction();
//       session.endSession();

//       res.status(201).json({ message: "Order placed successfully", order });
//     } catch (error) {
//         // Abort the transaction if any error occurs
//         await session.abortTransaction();
//         session.endSession();
//         console.error('Error in placeOrder:', error);
//         res.status(400).json({ message: error.message });
//     }
// };


// const placeOrder = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const {
//       cartId,
//       shippingMethodId,
//       addressId,
//       paymentMethod,
//       guestInfo,
//       guestAddress,
//       specialInstructions,
//       couponCode,
//       cityId,
//     } = req.body;

//     const cart = await Cart.findById(cartId).populate('items.item');
//     if (!cart) throw new Error('Cart not found');
//     const shippingMethod = await ShippingMethod.findById(shippingMethodId);

//     if (!cart || !shippingMethod) throw new Error('Cart or shipping method not found');
//     if (cart.items.length === 0) throw new Error('Cart is empty');

//     const totals = await calculateOrderTotalsHelper(cartId, shippingMethodId, couponCode);

//     // Prepare the order items and validate inventory
//     const orderItems = await Promise.all(
//       cart.items.map(async (item) => {
//         if (item.itemType === 'Product') {
//           const inventory = await Inventory.findOne({ 
//             product: item.item._id, 
//             city: cityId 
//           });

//           if (!inventory || inventory.quantity < item.quantity) {
//             throw new Error(`Not enough stock for product ${item.item.name}`);
//           }

//           await Inventory.findOneAndUpdate(
//             { product: item.item._id, city: cityId },
//             { $inc: { quantity: -item.quantity } },
//             { session }
//           );
//         } else {
//           // Handle SpecialProduct inventory
//           const specialProduct = await SpecialProduct.findById(item.item._id);
//           if (!specialProduct || specialProduct.stock < item.quantity) {
//             throw new Error(`Not enough stock for special product ${item.item.name}`);
//           }

//           await SpecialProduct.findByIdAndUpdate(
//             item.item._id,
//             { $inc: { stock: -item.quantity } },
//             { session }
//           );
//         }

//         return {
//           itemType: item.itemType,
//           product: item.item._id,
//           quantity: item.quantity,
//           price: item.price,
//         };
//       })
//     );

//     const order = new Order({
//       orderId: generateOrderNumber(),
//       customer: req.user ? req.user._id : null,
//       guestInfo: req.user ? null : guestInfo,
//       // sessionId: req.user ? req.session.id : null,
//       sessionId: req.user ? null : req.session.id,
//       items: orderItems,
//       shippingAddress: req.user ? addressId : null,
//       guestAddress: req.user ? null : guestAddress,
//       shippingMethod: shippingMethodId,
//       city: cityId,
//       subtotal: totals.subtotal,
//       shippingCost: totals.shippingCost,
//       grandTotal: totals.grandTotal,
//       couponUsed: couponCode || null,
//       paymentMethod,
//       paymentStatus: 'Incomplete',
//       orderStatus: 'Pending',
//       specialInstructions,
//     });

//     await handlePaymentMethod(order, paymentMethod, session);
//     await order.save({ session });

//     cart.items = [];
//     cart.total = 0;
//     await cart.save({ session });

//     await session.commitTransaction();
//     session.endSession();

//     res.status(201).json({ message: 'Order placed successfully', order });
//   } catch (error) {
//     await session.abortTransaction();
//     session.endSession();
//     res.status(400).json({ message: error.message });
//   }
// };



// const placeOrder = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const { cartId, shippingMethodId, addressId, paymentMethod, guestInfo, guestAddress, specialInstructions, couponCode, cityId } = req.body;

//     const cart = await Cart.findById(cartId).populate('items.item');
//     if (!cart) throw new Error('Cart not found');

//     const customer = await Customer.findById(req.user.id).populate('warehouse');
//     if (!customer) throw new Error('Customer not found');

//     const normalProducts = [];
//     const specialProducts = [];

//     cart.items.forEach(item => {
//       if (item.itemType === 'Product') {
//         normalProducts.push(item);
//       } else if (item.itemType === 'SpecialProduct') {
//         specialProducts.push(item);
//       }
//     });

//     if (normalProducts.length > 0 && specialProducts.length > 0) {
//       throw new Error('You can only order either normal products or special products in a single order');
//     }

//     const orderItems = cart.items.map(item => ({
//       itemType: item.itemType,
//       product: item.item._id,
//       quantity: item.quantity,
//       price: item.price
//     }));

//     const totals = await calculateOrderTotalsHelper(cartId, shippingMethodId, couponCode);

//     const order = new Order({
//       orderId: generateOrderNumber(),
//       customer: customer._id,
//       items: orderItems,
//       shippingAddress: addressId || null,
//       guestAddress: guestAddress || null,
//       shippingMethod: shippingMethodId,
//       city: cityId,
//       subtotal: totals.subtotal,
//       shippingCost: totals.shippingCost,
//       grandTotal: totals.grandTotal,
//       couponUsed: couponCode || null,
//       paymentMethod,
//       paymentStatus: 'Incomplete',
//       orderStatus: 'Pending',
//       specialInstructions
//     });

//     // Handle payment method
//     await handlePaymentMethod(order, paymentMethod, session);

//     if (specialProducts.length > 0) {
//       // Handle special product order
//       const warehouseWallet = await WarehouseWallet.findOne({ warehouse: customer.warehouse._id });
//       if (!warehouseWallet || warehouseWallet.balance < order.grandTotal) {
//         throw new Error('Insufficient warehouse wallet balance');
//       }
//       warehouseWallet.balance -= order.grandTotal;
//       await warehouseWallet.save({ session });
//     } else {
//       // Handle normal product inventory
//       for (const item of order.items) {
//         const inventory = await Inventory.findOne({ product: item.product, city: cityId });
//         if (!inventory || inventory.quantity < item.quantity) {
//           throw new Error(`Not enough stock for product ${item.product}`);
//         }
//         await Inventory.findOneAndUpdate(
//           { product: item.product, city: cityId },
//           { $inc: { quantity: -item.quantity } },
//           { session }
//         );
//       }
//     }

//     await order.save({ session });

//     // Clear cart
//     cart.items = [];
//     cart.total = 0;
//     await cart.save({ session });

//     await session.commitTransaction();
//     res.status(201).json({ message: 'Order placed successfully', order });
//   } catch (error) {
//     await session.abortTransaction();
//     res.status(400).json({ message: error.message });
//   } finally {
//     session.endSession();
//   }
// };


// commeted code previously
// const placeOrder = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const { cartId, shippingMethodId, paymentMethod, specialInstructions, couponCode, cityId } = req.body;
//     const mainWarehouseId = '67b6c7b68958be48910ed415';
//     const cart = await Cart.findById(cartId).populate('items.item');
//     if (!cart) throw new Error('Cart not found');

//     const customer = await Customer.findById(req.user.id).populate('warehouse');
//     if (!customer) throw new Error('Customer not found');

//     const normalProducts = cart.items.filter(item => item.itemType === 'Product');
//     const specialProducts = cart.items.filter(item => item.itemType === 'SpecialProduct');

//     if (normalProducts.length > 0 && specialProducts.length > 0) {
//       throw new Error('Normal and special products cannot be ordered together');
//     }

//     const totals = await calculateOrderTotalsHelper(cartId, couponCode);

//     const order = new Order({
//       orderId: generateOrderNumber(),
//       customer: customer._id,
//       items: cart.items.map(item => ({
//         itemType: item.itemType,
//         product: item.item._id,
//         quantity: item.quantity,
//         price: item.price
//       })),
//       shippingMethod: shippingMethodId || null,
//       city: cityId || null,
//       subtotal: totals.subtotal,
//       shippingCost: totals.shippingCost || null,
//       grandTotal: totals.grandTotal,
//       couponUsed: couponCode || null,
//       paymentMethod,
//       paymentStatus: 'Pending',
//       orderStatus: 'Pending',
//       specialInstructions
//     });

//     if (normalProducts.length > 0) {
//       // Handle normal product order
//       const wallet = await Wallet.findOne({ customer: customer._id });
//       if (!wallet || wallet.balance < order.grandTotal) {
//         throw new Error('Insufficient wallet balance');
//       }

//       wallet.balance -= order.grandTotal;
//       await wallet.save({ session });

//       for (const item of normalProducts) {
//         const inventory = await Inventory.findOne({ product: item.item._id, warehouse: mainWarehouseId });
//         if (!inventory || inventory.quantity < item.quantity) {
//           throw new Error(`Insufficient quantity for product ${item.item.name} in main warehouse`);
//         }
//         // inventory.quantity -= item.quantity;
//         // await inventory.save({ session });

//         const updatedInventory = await Inventory.findOneAndUpdate(
//           { product: item.item._id, warehouse: mainWarehouseId },
//           { $inc: { quantity: -item.quantity } },
//           { new: true, session }
//         );
      
//         if (updatedInventory.quantity <= updatedInventory.stockAlertThreshold) {
//           await AdminNotification.create([{
//             user: '66c5bc4b3c1526016eeac109',
//             type: 'LOW_STOCK',
//             content: `Low stock alert for ${item.item.name} in main warehouse - Current quantity: ${updatedInventory.quantity}`,
//             resourceId: updatedInventory._id,
//             resourceModel: 'Inventory',
//             priority: 'high'
//           }], { session });
//         }

//       }

//       order.paymentStatus = 'Paid';
//       order.orderStatus = 'Confirmed';

//       const customerNotification = new Notification({
//         user: customer._id,
//         content: `Your order #${order.orderId} has been placed successfully.`,
//         url: `/orders/${order._id}`
//       });
//       await customerNotification.save({ session });

//       // Send notification to admin
//       const adminNotification = new AdminNotification({
//         user: '66c5bc4b3c1526016eeac109',
//         type: 'ORDER',
//         content: `New order #${order.orderId} has been placed.`,
//         resourceId: order._id,
//         resourceModel: 'Order',
//         priority: 'medium'
//       });
//       await adminNotification.save({ session });
//     } else {

//       const totalSpecialAmount = order.grandTotal;

//         const customerWarehouse = await Warehouse.findById(customer.warehouse);
//         if (!customerWarehouse) {
//           throw new Error('Customer warehouse not found');
//         }

//         const populatedSpecialProducts = await SpecialProduct.find({
//           _id: { $in: specialProducts.map(item => item.item) }
//         });
      
//         // Create a map for quick lookup
//         const productMap = populatedSpecialProducts.reduce((map, product) => {
//           map[product._id.toString()] = product;
//           return map;
//         }, {});

//         for (const item of specialProducts) {
//           const mainInventory = await Inventory.findOne({ 
//             product: item.item._id, 
//             warehouse: mainWarehouseId 
//           });

//           const productName = productMap[item.item.toString()].name;

//           console.log("Item name", productName);
          
//           if (!mainInventory || mainInventory.quantity < item.quantity) {
//             throw new Error(`Insufficient quantity for special product : ${productName} in main warehouse`);
//           }
//         }

        

//         const warehouseWallet = await WarehouseWallet.findOne({ warehouse: customerWarehouse._id });
//         if (!warehouseWallet) {
//           throw new Error('Warehouse wallet not found');
//         }
//         if (!warehouseWallet || warehouseWallet.balance < totalSpecialAmount) {
//           throw new Error('Insufficient warehouse wallet balance');
//         }


//       // Handle special product order
//       order.orderStatus = 'Pending Approval';
//       const adminNotification = new AdminNotification({
//         user: '66c5bc4b3c1526016eeac109',
//         type: 'ORDER',
//         content: `New special order #${order.orderId} requires approval.`,
//         resourceId: order._id,
//         resourceModel: 'Order',
//         priority: 'high'
//       });
//       await adminNotification.save({ session });

//       const customerNotification = new Notification({
//         user: customer._id,
//         content: `Your special order #${order.orderId} has been placed and is pending approval.`,
//         url: `/orders/${order._id}`
//       });
//       await customerNotification.save({ session });
      
//     }

//     await order.save({ session });

//     // Clear cart
//     cart.items = [];
//     cart.total = 0;
//     await cart.save({ session });

//     await session.commitTransaction();
//     res.status(201).json({ message: 'Order placed successfully', order });
//   } catch (error) {
//     await session.abortTransaction();
//     res.status(400).json({ message: error.message });
//   } finally {
//     session.endSession();
//   }
// };


// second commeted code
// const placeOrder = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const { cartId, shippingMethodId, paymentMethod, specialInstructions, couponCode, cityId } = req.body;
//     const mainWarehouseId = '67b6c7b68958be48910ed415';
//     const cart = await Cart.findById(cartId).populate('items.item');
//     if (!cart) throw new Error('Cart not found');

//     const customer = await Customer.findById(req.user.id).populate('warehouse');
//     if (!customer) throw new Error('Customer not found');

//     // Separate items by type
//     const normalProducts = cart.items.filter(item => item.itemType === 'Product');
//     const specialProducts = cart.items.filter(item => item.itemType === 'SpecialProduct');

//     // if (normalProducts.length > 0 && specialProducts.length > 0) {
//     //   throw new Error('Normal and special products cannot be ordered together');
//     // }

//     const totals = await calculateOrderTotalsHelper(cartId, couponCode);

//     const order = new Order({
//       orderId: generateOrderNumber(),
//       customer: customer._id,
//       items: cart.items.map(item => ({
//         itemType: item.itemType,
//         product: item.item._id,
//         quantity: item.quantity,
//         price: item.price
//       })),
//       shippingMethod: shippingMethodId || null,
//       city: cityId || null,
//       subtotal: totals.subtotal,
//       shippingCost: totals.shippingCost || null,
//       grandTotal: totals.grandTotal,
//       couponUsed: couponCode || null,
//       paymentMethod,
//       paymentStatus: 'Pending',
//       orderStatus: 'Pending',
//       specialInstructions
//     });

//     if (normalProducts.length > 0) {
//       // Handle normal product order
//       // const wallet = await Wallet.findOne({ customer: customer._id });
//       // if (!wallet || wallet.balance < order.grandTotal) {
//       //   throw new Error('Insufficient wallet balance');
//       // }

//       // wallet.balance -= order.grandTotal;
//       // await wallet.save({ session });

//       const customerWarehouse = await Warehouse.findById(customer.warehouse);
//       if (!customerWarehouse) {
//         throw new Error('Customer warehouse not found');
//       }

//       const inventoryWallet = await InventoryWallet.findOne({ warehouse: customerWarehouse._id });
//       if (!inventoryWallet || inventoryWallet.balance < order.grandTotal) {
//         throw new Error('Insufficient inventory wallet balance');
//       }

//       inventoryWallet.balance -= order.grandTotal;
//       await inventoryWallet.save({ session });

//       for (const item of normalProducts) {
//         const inventory = await Inventory.findOne({ product: item.item._id, warehouse: mainWarehouseId });
//         if (!inventory || inventory.quantity < item.quantity) {
//           throw new Error(`Insufficient quantity for product ${item.item.name} in main warehouse`);
//         }

//         const updatedInventory = await Inventory.findOneAndUpdate(
//           { product: item.item._id, warehouse: mainWarehouseId },
//           { $inc: { quantity: -item.quantity } },
//           { new: true, session }
//         );
      
//         if (updatedInventory.quantity <= updatedInventory.stockAlertThreshold) {
//           await AdminNotification.create([{
//             user: '66c5bc4b3c1526016eeac109',
//             type: 'LOW_STOCK',
//             content: `Low stock alert for ${item.item.name} in main warehouse - Current quantity: ${updatedInventory.quantity}`,
//             resourceId: updatedInventory._id,
//             resourceModel: 'Inventory',
//             priority: 'high'
//           }], { session });
//         }
//       }

//       order.paymentStatus = 'Paid';
//       order.orderStatus = 'Confirmed';

//       const customerNotification = new Notification({
//         user: customer._id,
//         content: `Your order #${order.orderId} has been placed successfully.`,
//         url: `/orders/${order._id}`
//       });
//       await customerNotification.save({ session });

//       // Send notification to admin
//       const adminNotification = new AdminNotification({
//         user: '66c5bc4b3c1526016eeac109',
//         type: 'ORDER',
//         content: `New order #${order.orderId} has been placed.`,
//         resourceId: order._id,
//         resourceModel: 'Order',
//         priority: 'medium'
//       });
//       await adminNotification.save({ session });
//     } else if (specialProducts.length > 0) {
//       // Get all special products with their details
//       const populatedSpecialProducts = await SpecialProduct.find({
//         _id: { $in: specialProducts.map(item => item.item._id) }
//       });
    
//       // Create a map for quick lookup
//       const productMap = populatedSpecialProducts.reduce((map, product) => {
//         map[product._id.toString()] = product;
//         return map;
//       }, {});

//       // Separate GWP products from other special products
//       const gwpProducts = specialProducts.filter(item => 
//         productMap[item.item._id.toString()]?.type === 'GWP'
//       );
      
//       const otherSpecialProducts = specialProducts.filter(item => 
//         productMap[item.item._id.toString()]?.type !== 'GWP'
//       );

//       // Calculate totals for each type
//       const gwpTotal = gwpProducts.reduce((sum, item) => sum + (item.price * item.quantity), 0);
//       const otherSpecialTotal = otherSpecialProducts.reduce((sum, item) => sum + (item.price * item.quantity), 0);

//       // Check if customer has a warehouse
//       const customerWarehouse = await Warehouse.findById(customer.warehouse);
//       if (!customerWarehouse) {
//         throw new Error('Customer warehouse not found');
//       }

//       // Check inventory wallet balance for GWP products
//       if (gwpProducts.length > 0) {
//         const inventoryWallet = await InventoryWallet.findOne({ warehouse: customerWarehouse._id });
//         if (!inventoryWallet || inventoryWallet.balance < gwpTotal) {
//           throw new Error('Insufficient inventory wallet balance for GWP products');
//         }

//         // Check inventory for GWP products and update inventory immediately
//         for (const item of gwpProducts) {
//           const mainInventory = await Inventory.findOne({ 
//             product: item.item._id, 
//             warehouse: mainWarehouseId 
//           });
          
//           const productName = productMap[item.item._id.toString()].name;
          
//           if (!mainInventory || mainInventory.quantity < item.quantity) {
//             throw new Error(`Insufficient quantity for GWP product: ${productName} in main warehouse`);
//           }
          
//           // Immediately update inventory for GWP products
//           const updatedMainInventory = await Inventory.findOneAndUpdate(
//             { product: item.item._id, warehouse: mainWarehouseId },
//             { $inc: { quantity: -item.quantity } },
//             { new: true, session }
//           );

//           if (updatedMainInventory.quantity <= updatedMainInventory.stockAlertThreshold) {
//             await AdminNotification.create([{
//               user: '66c5bc4b3c1526016eeac109',
//               type: 'LOW_STOCK',
//               content: `Low stock alert for ${productName} in main warehouse - Current quantity: ${updatedMainInventory.quantity}`,
//               resourceId: updatedMainInventory._id,
//               resourceModel: 'Inventory',
//               priority: 'high'
//             }], { session });
//           }
          
//           // Add to customer's warehouse inventory
//           const updatedCustomerInventory = await Inventory.findOneAndUpdate(
//             { product: item.item._id, warehouse: customerWarehouse._id },
//             { 
//               $inc: { quantity: item.quantity },
//               $setOnInsert: {
//                 productType: 'SpecialProduct',
//                 city: '67400e8a7b963a1282d218b5',
//                 stockAlertThreshold: 5,
//                 lastRestocked: new Date()
//               }
//             },
//             { upsert: true, new: true, session }
//           );

//           if (updatedCustomerInventory.quantity <= updatedCustomerInventory.stockAlertThreshold) {
//             await AdminNotification.create([{
//               user: '66c5bc4b3c1526016eeac109',
//               type: 'LOW_STOCK',
//               content: `Low stock alert for ${productName} in ${customerWarehouse.name} warehouse - Current quantity: ${updatedCustomerInventory.quantity}`,
//               resourceId: updatedCustomerInventory._id,
//               resourceModel: 'Inventory',
//               priority: 'high'
//             }], { session });
//           }
//         }
        
//         // Deduct from inventory wallet for GWP products
//         inventoryWallet.balance -= gwpTotal;
//         await inventoryWallet.save({ session });
//       }

//       // Check supplies wallet balance for other special products
//       if (otherSpecialProducts.length > 0) {
//         const suppliesWallet = await SuppliesWallet.findOne({ warehouse: customerWarehouse._id });
//         if (!suppliesWallet || suppliesWallet.balance < otherSpecialTotal) {
//           throw new Error('Insufficient supplies wallet balance for special products');
//         }

//         // Check inventory for other special products (but don't update yet)
//         for (const item of otherSpecialProducts) {
//           const mainInventory = await Inventory.findOne({ 
//             product: item.item._id, 
//             warehouse: mainWarehouseId 
//           });
          
//           const productName = productMap[item.item._id.toString()].name;
          
//           if (!mainInventory || mainInventory.quantity < item.quantity) {
//             throw new Error(`Insufficient quantity for special product: ${productName} in main warehouse`);
//           }
//         }
        
//         // Deduct from supplies wallet for other special products
//         suppliesWallet.balance -= otherSpecialTotal;
//         await suppliesWallet.save({ session });
//       }

//       // Set order status based on what's in the cart
//       if (gwpProducts.length > 0 && otherSpecialProducts.length === 0) {
//         // If only GWP products, mark as confirmed since inventory is already updated
//         order.orderStatus = 'Confirmed';
//         order.paymentStatus = 'Paid';
//       } else {
//         // If there are non-GWP special products, set to pending approval
//         order.orderStatus = 'Pending Approval';
//       }
      
//       // Create notifications
//       const adminNotification = new AdminNotification({
//         user: '66c5bc4b3c1526016eeac109',
//         type: 'ORDER',
//         content: `New special order #${order.orderId} ${order.orderStatus === 'Confirmed' ? 'has been placed' : 'requires approval'}.`,
//         resourceId: order._id,
//         resourceModel: 'Order',
//         priority: order.orderStatus === 'Confirmed' ? 'medium' : 'high'
//       });
//       await adminNotification.save({ session });

//       const customerNotification = new Notification({
//         user: customer._id,
//         content: `Your special order #${order.orderId} has been placed ${order.orderStatus === 'Confirmed' ? 'successfully' : 'and is pending approval'}.`,
//         url: `/orders/${order._id}`
//       });
//       await customerNotification.save({ session });
//     }

//     await order.save({ session });

//     // Clear cart
//     cart.items = [];
//     cart.total = 0;
//     await cart.save({ session });

//     await session.commitTransaction();
//     res.status(201).json({ message: 'Order placed successfully', order });
//   } catch (error) {
//     await session.abortTransaction();
//     res.status(400).json({ message: error.message });
//   } finally {
//     session.endSession();
//   }
// };











// const getUserOrders = async (req, res) => {
//     try {
//         const userId = req.user._id;
//         const orders = await Order.find({ customer: userId })
//             .sort({ createdAt: -1 })

//         res.status(200).json(orders);
//     } catch (error) {
//         res.status(500).json({ message: 'Error fetching order history', error: error.message });
//     }
// };


// const getUserOrders = async (req, res) => {
//   try {
//       const userId = req.user._id;
//       const orders = await Order.find({ customer: userId })
//           .populate({
//               path: 'items.product',
//               refPath: 'items.itemType'
//           })
//           .populate('shippingAddress')
//           .populate('shippingMethod')
//           .populate('city')
//           .sort({ createdAt: -1 });

//       // Transform and structure the response
//       const transformedOrders = orders.map(order => {
//           const orderObj = order.toObject();
//           orderObj.items = orderObj.items.map(item => ({
//               ...item,
//               productType: item.itemType.toLowerCase()
//           }));
//           return orderObj;
//       });

//       res.status(200).json(transformedOrders);
//   } catch (error) {
//       res.status(500).json({ message: 'Error fetching order history', error: error.message });
//   }
// };


// const placeOrder = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const { cartId, shippingMethodId, paymentMethod, specialInstructions, couponCode, cityId, warehouse  } = req.body;
//     const warehouseId = warehouse?._id || warehouse;
//     const mainWarehouseId = '67b6c7b68958be48910ed415';
//     const cart = await Cart.findById(cartId).populate('items.item');
//     if (!cart) throw new Error('Cart not found');

//     const customer = await Customer.findById(req.user.id).populate('warehouse');
//     if (!customer) throw new Error('Customer not found');

//     // Separate items by type
//     const normalProducts = cart.items.filter(item => item.itemType === 'Product');
//     const specialProducts = cart.items.filter(item => item.itemType === 'SpecialProduct');

//     // Remove this error check to allow both types in the same order
//     // if (normalProducts.length > 0 && specialProducts.length > 0) {
//     //   throw new Error('Normal and special products cannot be ordered together');
//     // }

//     const totals = await calculateOrderTotalsHelper(cartId, couponCode);

//     const order = new Order({
//       orderId: generateOrderNumber(),
//       customer: customer._id,
//       warehouse: warehouseId || (customer.warehouse ? customer.warehouse._id : null),
//       items: cart.items.map(item => ({
//         itemType: item.itemType,
//         product: item.item._id,
//         quantity: item.quantity,
//         price: item.price,
//         color: item.color || null
//       })),
//       shippingMethod: shippingMethodId || null,
//       city: cityId || null,
//       subtotal: totals.subtotal,
//       shippingCost: totals.shippingCost || null,
//       grandTotal: totals.grandTotal,
//       couponUsed: couponCode || null,
//       paymentMethod,
//       paymentStatus: 'Pending',
//       orderStatus: 'Pending',
//       specialInstructions
//     });
//     const orders = await Order.find().populate('warehouse').populate('customer');
//     let customerWarehouse = null;
//     if (warehouseId) {
//       customerWarehouse = await Warehouse.findById(warehouseId);
//       if (!customerWarehouse) {
//         throw new Error('Customer warehouse not found');
//       }
//     } 
//     console.log(customerWarehouse);
    

//     // Get all special products with their details if there are any
//     let productMap = {};
//     if (specialProducts.length > 0) {
//       const populatedSpecialProducts = await SpecialProduct.find({
//         _id: { $in: specialProducts.map(item => item.item._id) }
//       });
      
//       // Create a map for quick lookup
//       productMap = populatedSpecialProducts.reduce((map, product) => {
//         map[product._id.toString()] = product;
//         return map;
//       }, {});
//     }

//     // Separate GWP products from other special products
//     const gwpProducts = specialProducts.filter(item => 
//       productMap[item.item._id.toString()]?.type === 'GWP'
//     );
    
//     const otherSpecialProducts = specialProducts.filter(item => 
//       productMap[item.item._id.toString()]?.type !== 'GWP'
//     );

//     // Calculate totals for each type
//     const normalProductTotal = normalProducts.reduce((sum, item) => sum + (item.price * item.quantity), 0);
//     const gwpTotal = gwpProducts.reduce((sum, item) => sum + (item.price * item.quantity), 0);
//     const otherSpecialTotal = otherSpecialProducts.reduce((sum, item) => sum + (item.price * item.quantity), 0);

//     // Check inventory wallet balance for normal products and GWP products
//     const inventoryWalletTotal = normalProductTotal + gwpTotal;
//     if (inventoryWalletTotal > 0) {
//       const inventoryWallet = await InventoryWallet.findOne({ warehouse: customerWarehouse._id });
//       if (!inventoryWallet || inventoryWallet.balance < inventoryWalletTotal) {
//         throw new Error('Insufficient inventory wallet balance');
//       }

//       // Process normal products
//       for (const item of normalProducts) {
//         const inventory = await Inventory.findOne({ product: item.item._id, warehouse: mainWarehouseId });
//         if (!inventory || inventory.quantity < item.quantity) {
//           throw new Error(`Insufficient quantity for product ${item.item.name} in main warehouse`);
//         }

//         const updatedInventory = await Inventory.findOneAndUpdate(
//           { product: item.item._id, warehouse: mainWarehouseId },
//           { $inc: { quantity: -item.quantity } },
//           { new: true, session }
//         );
      
//         if (updatedInventory.quantity <= updatedInventory.stockAlertThreshold) {
//           await AdminNotification.create([{
//             user: '66c5bc4b3c1526016eeac109',
//             type: 'LOW_STOCK',
//             content: `Low stock alert for ${item.item.name} in main warehouse - Current quantity: ${updatedInventory.quantity}`,
//             resourceId: updatedInventory._id,
//             resourceModel: 'Inventory',
//             priority: 'high'
//           }], { session });
//         }
        
//         // Add normal products to customer's warehouse inventory
//         const updatedCustomerInventory = await Inventory.findOneAndUpdate(
//           { product: item.item._id, warehouse: customerWarehouse._id },
//           { 
//             $inc: { quantity: item.quantity },
//             $setOnInsert: {
//               productType: 'Product',
//               city: '67400e8a7b963a1282d218b5',
//               stockAlertThreshold: 5,
//               lastRestocked: new Date()
//             }
//           },
//           { upsert: true, new: true, session }
//         );

//         await Product.findByIdAndUpdate(
//           item.item._id,
//           { $addToSet: { inventory: updatedCustomerInventory._id } },
//           { session }
//         );

//         if (updatedCustomerInventory.quantity <= updatedCustomerInventory.stockAlertThreshold) {
//           await AdminNotification.create([{
//             user: '66c5bc4b3c1526016eeac109',
//             type: 'LOW_STOCK',
//             content: `Low stock alert for ${item.item.name} in ${customerWarehouse.name} warehouse - Current quantity: ${updatedCustomerInventory.quantity}`,
//             resourceId: updatedCustomerInventory._id,
//             resourceModel: 'Inventory',
//             priority: 'high'
//           }], { session });
//         }
//       }

//       // Process GWP products
//       for (const item of gwpProducts) {
//         const mainInventory = await Inventory.findOne({ 
//           product: item.item._id, 
//           warehouse: mainWarehouseId 
//         });
        
//         const productName = productMap[item.item._id.toString()].name;
        
//         if (!mainInventory || mainInventory.quantity < item.quantity) {
//           throw new Error(`Insufficient quantity for GWP product: ${productName} in main warehouse`);
//         }
        
//         // Immediately update inventory for GWP products
//         const updatedMainInventory = await Inventory.findOneAndUpdate(
//           { product: item.item._id, warehouse: mainWarehouseId },
//           { $inc: { quantity: -item.quantity } },
//           { new: true, session }
//         );

//         if (updatedMainInventory.quantity <= updatedMainInventory.stockAlertThreshold) {
//           await AdminNotification.create([{
//             user: '66c5bc4b3c1526016eeac109',
//             type: 'LOW_STOCK',
//             content: `Low stock alert for ${productName} in main warehouse - Current quantity: ${updatedMainInventory.quantity}`,
//             resourceId: updatedMainInventory._id,
//             resourceModel: 'Inventory',
//             priority: 'high'
//           }], { session });
//         }
        
//         // Add to customer's warehouse inventory
//         const updatedCustomerInventory = await Inventory.findOneAndUpdate(
//           { product: item.item._id, warehouse: customerWarehouse._id },
//           { 
//             $inc: { quantity: item.quantity },
//             $setOnInsert: {
//               productType: 'SpecialProduct',
//               city: '67400e8a7b963a1282d218b5',
//               stockAlertThreshold: 5,
//               lastRestocked: new Date()
//             }
//           },
//           { upsert: true, new: true, session }
//         );

//         await SpecialProduct.findByIdAndUpdate(
//           item.item._id,
//           { $addToSet: { inventory: updatedCustomerInventory._id } },
//           { session }
//         );

//         if (updatedCustomerInventory.quantity <= updatedCustomerInventory.stockAlertThreshold) {
//           await AdminNotification.create([{
//             user: '66c5bc4b3c1526016eeac109',
//             type: 'LOW_STOCK',
//             content: `Low stock alert for ${productName} in ${customerWarehouse.name} warehouse - Current quantity: ${updatedCustomerInventory.quantity}`,
//             resourceId: updatedCustomerInventory._id,
//             resourceModel: 'Inventory',
//             priority: 'high'
//           }], { session });
//         }
//       }
      
//       // Deduct from inventory wallet
//       if (inventoryWalletTotal > 0) {
//         const inventoryWallet = await InventoryWallet.findOne({ warehouse: customerWarehouse._id });
//         inventoryWallet.balance -= inventoryWalletTotal;
//         await inventoryWallet.save({ session });
//       }
//     }

//     // Check supplies wallet balance for other special products
//     if (otherSpecialTotal > 0) {
//       const suppliesWallet = await SuppliesWallet.findOne({ warehouse: customerWarehouse._id });
//       if (!suppliesWallet || suppliesWallet.balance < otherSpecialTotal) {
//         throw new Error('Insufficient supplies wallet balance for special products');
//       }

//       // Check inventory for other special products (but don't update yet)
//       for (const item of otherSpecialProducts) {
//         const mainInventory = await Inventory.findOne({ 
//           product: item.item._id, 
//           warehouse: mainWarehouseId 
//         });
        
//         const productName = productMap[item.item._id.toString()].name;
        
//         if (!mainInventory || mainInventory.quantity < item.quantity) {
//           throw new Error(`Insufficient quantity for special product: ${productName} in main warehouse`);
//         }
//       }
      
//       // Deduct from supplies wallet for other special products
//       suppliesWallet.balance -= otherSpecialTotal;
//       await suppliesWallet.save({ session });
//     }

//     // Set order status based on what's in the cart
//     if (otherSpecialProducts.length === 0) {
//       // If no non-GWP special products, mark as confirmed
//       order.orderStatus = 'Confirmed';
//       order.paymentStatus = 'Paid';
//     } else {
//       // If there are non-GWP special products, set to pending approval
//       order.orderStatus = 'Pending Approval';
//     }
    
//     // Create notifications
//     const adminNotification = new AdminNotification({
//       user: '66c5bc4b3c1526016eeac109',
//       type: 'ORDER',
//       content: `New order #${order.orderId} ${order.orderStatus === 'Confirmed' ? 'has been placed' : 'requires approval'}.`,
//       resourceId: order._id,
//       resourceModel: 'Order',
//       priority: order.orderStatus === 'Confirmed' ? 'medium' : 'high'
//     });
//     await adminNotification.save({ session });

//     const customerNotification = new Notification({
//       user: customer._id,
//       content: `Your order #${order.orderId} has been placed ${order.orderStatus === 'Confirmed' ? 'successfully' : 'and is pending approval'}.`,
//       url: `/orders/${order._id}`
//     });
//     await customerNotification.save({ session });


//     // Clear cart
//     cart.items = [];
//     cart.total = 0;
//     await cart.save({ session });

//     // ensure order has proper warehouse id saved (in case it was set after creation)
//     if (customerWarehouse && customerWarehouse._id) {
//       order.warehouse = customerWarehouse._id;
//       await order.save({ session });
//     }

//     await session.commitTransaction();
//     // return order plus warehouse details for frontend
//     res.status(201).json({ message: 'Order placed successfully', order, warehouse: customerWarehouse });
//   } catch (error) {
//     await session.abortTransaction();
//     res.status(400).json({ message: error.message });
//   } finally {
//     session.endSession();
//   }
// };

const placeOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      cartId,
      shippingMethodId,
      paymentMethod,
      specialInstructions,
      couponCode,
      cityId,
      warehouse,
    } = req.body;

    const warehouseId = warehouse?._id || warehouse;
    const mainWarehouseId = "67b6c7b68958be48910ed415"; // main stock warehouse ID

    const cart = await Cart.findById(cartId).populate("items.item");
    if (!cart) throw new Error("Cart not found");

    const customer = await Customer.findById(req.user.id).populate("warehouse");
    if (!customer) throw new Error("Customer not found");

    // find warehouse selected by customer
    // NOTE: districtManager and corporateManager are already IDs, don't populate
    const customerWarehouse = await Warehouse.findById(warehouseId);
    if (!customerWarehouse) throw new Error("Warehouse not found");

    // calculate totals
    const totals = await calculateOrderTotalsHelper(cartId, couponCode);

    // 🟩 Create base order
    const order = new Order({
      orderId: generateOrderNumber(),
      customer: customer._id,
      warehouse: warehouseId,
      createdBy: req.user.id,
      approvalStatus: "PENDING",
      items: cart.items.map((item) => ({
        itemType: item.itemType,
        product: item.item._id,
        quantity: item.quantity,
        price: item.price,
        color: item.color || null,
      })),
      shippingMethod: shippingMethodId || null,
      city: cityId || null,
      subtotal: totals.subtotal,
      shippingCost: totals.shippingCost || null,
      grandTotal: totals.grandTotal,
      couponUsed: couponCode || null,
      paymentMethod,
      paymentStatus: "Pending",
      orderStatus: "Pending",
      specialInstructions,
    });

    // 🟦 Process inventory and wallet deduction from MAIN warehouse
    const normalProducts = cart.items.filter((i) => i.itemType === "Product");
    const specialProducts = cart.items.filter(
      (i) => i.itemType === "SpecialProduct"
    );

    let productMap = {};
    if (specialProducts.length > 0) {
      const populatedSpecialProducts = await SpecialProduct.find({
        _id: { $in: specialProducts.map((i) => i.item._id) },
      });
      productMap = populatedSpecialProducts.reduce((map, p) => {
        map[p._id.toString()] = p;
        return map;
      }, {});
    }

    const gwpProducts = specialProducts.filter(
      (i) => productMap[i.item._id.toString()]?.type === "GWP"
    );
    const otherSpecialProducts = specialProducts.filter(
      (i) => productMap[i.item._id.toString()]?.type !== "GWP"
    );

    const normalProductTotal = normalProducts.reduce(
      (s, i) => s + i.price * i.quantity,
      0
    );
    const gwpTotal = gwpProducts.reduce((s, i) => s + i.price * i.quantity, 0);
    const otherSpecialTotal = otherSpecialProducts.reduce(
      (s, i) => s + i.price * i.quantity,
      0
    );

    // main warehouse stock deduction (for all product types)
    for (const item of [...normalProducts, ...gwpProducts, ...otherSpecialProducts]) {
      const mainInventory = await Inventory.findOne({
        product: item.item._id,
        warehouse: mainWarehouseId,
      });

      if (!mainInventory || mainInventory.quantity < item.quantity) {
        throw new Error(`Insufficient quantity for product ${item.item.name} in main warehouse`);
      }

      const updatedInventory = await Inventory.findOneAndUpdate(
        { product: item.item._id, warehouse: mainWarehouseId },
        { $inc: { quantity: -item.quantity } },
        { new: true, session }
      );

      if (updatedInventory.quantity <= updatedInventory.stockAlertThreshold) {
        await AdminNotification.create(
          [
            {
              user: "66c5bc4b3c1526016eeac109",
              type: "LOW_STOCK",
              content: `Low stock alert for ${item.item.name} in main warehouse - Current quantity: ${updatedInventory.quantity}`,
              resourceId: updatedInventory._id,
              resourceModel: "Inventory",
              priority: "high",
            },
          ],
          { session }
        );
      }
    }

    // 🟧 Wallet deductions
    const inventoryWalletTotal = normalProductTotal + gwpTotal;
    if (inventoryWalletTotal > 0) {
      const inventoryWallet = await InventoryWallet.findOne({ warehouse: warehouseId });
      if (!inventoryWallet || inventoryWallet.balance < inventoryWalletTotal) {
        throw new Error("Insufficient inventory wallet balance");
      }
      inventoryWallet.balance -= inventoryWalletTotal;
      await inventoryWallet.save({ session });
    }

    if (otherSpecialTotal > 0) {
      const suppliesWallet = await SuppliesWallet.findOne({ warehouse: warehouseId });
      if (!suppliesWallet || suppliesWallet.balance < otherSpecialTotal) {
        throw new Error("Insufficient supplies wallet balance");
      }
      suppliesWallet.balance -= otherSpecialTotal;
      await suppliesWallet.save({ session });
    }

    // 🟨 Set order status
    order.orderStatus = "Pending";
    order.paymentStatus = "Pending";
    await order.save({ session });

    // 🟦 Notification chain (DM -> CM -> Admin)
    const notifications = [];
    let nextApprover = null;

    if (customerWarehouse.districtManager) {
      nextApprover = customerWarehouse.districtManager;
      order.approvalStatus = "PENDING";
      notifications.push(
        new Notification({
          user: nextApprover,
          type: "ORDER",
          content: `Order #${order.orderId} awaiting your approval as District Manager for warehouse ${customerWarehouse.name}.`,
          resourceId: order._id,
          resourceModel: "Order",
          priority: "high",
        })
      );
    } else if (customerWarehouse.corporateManager) {
      nextApprover = customerWarehouse.corporateManager;
      order.approvalStatus = "PENDING";
      notifications.push(
        new Notification({
          user: nextApprover,
          type: "ORDER",
          content: `Order #${order.orderId} awaiting your approval as Corporate Manager for warehouse ${customerWarehouse.name}.`,
          resourceId: order._id,
          resourceModel: "Order",
          priority: "high",
        })
      );
    } else {
      nextApprover = "66c5bc4b3c1526016eeac109"; // Admin fallback
      order.approvalStatus = "PENDING";
      notifications.push(
        new AdminNotification({
          user: nextApprover,
          type: "ORDER",
          content: `New order #${order.orderId} placed directly for admin approval (no manager linked).`,
          resourceId: order._id,
          resourceModel: "Order",
          priority: "high",
        })
      );
    }

    // 🟪 Save all notifications
    await Promise.all(notifications.map((n) => n.save({ session })));

    // 🟩 Customer notification
    await new Notification({
      user: customer._id,
      content: `Your order #${order.orderId} has been submitted for approval.`,
      url: `/orders/${order._id}`,
    }).save({ session });

    // 🟫 Clear cart
    cart.items = [];
    cart.total = 0;
    await cart.save({ session });

    await order.save({ session });
    await session.commitTransaction();

    res.status(201).json({
      message: "Order placed successfully and awaiting approval",
      order,
      nextApprover,
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};


const approveOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, remarks } = req.body; // "APPROVE" or "DISAPPROVE"
    
    // ✅ FIX: Use fallback for userId
    const userId = req.user?._id || req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false,
        message: "User ID not found in request" 
      });
    }

    // 1️⃣ Fetch order with all related data (warehouse IDs only, don't populate DM/CM)
    const order = await Order.findById(id)
      .populate("warehouse customer createdBy");
    
    if (!order) throw new Error("Order not found");
    if (!order.warehouse) throw new Error("Warehouse not found");

    // 2️⃣ Get user role
    let user = await Customer.findById(userId).populate("role");
    
    if (!user) {
        user = await User.findById(userId).populate("role");
        }
    const roleName = user.role?.role_name || "user";

    // 3️⃣ Add approval history entry
    order.approvalHistory.push({
      role: roleName,
      approvedBy: userId,
      status: action === "APPROVE" ? "APPROVED" : "DISAPPROVED",
      remarks: remarks || "",
      date: new Date()
    });

    // 4️⃣ DISAPPROVAL FLOW (any role can reject at any stage)
    if (action === "DISAPPROVE") {
      order.approvalStatus = "DISAPPROVED";
      order.orderStatus = "Cancelled";
      order.approvedBy = userId;

      // 📧 Notify customer of rejection
      if (order.customer) {
        await new Notification({
          user: order.customer._id,
          type: "ORDER",
          content: `Your order #${order.orderId} was rejected by ${roleName}.`,
          resourceId: order._id,
          resourceModel: "Order"
        }).save();
      }

      await order.save();
      return res.status(200).json({ 
        message: `Order disapproved by ${roleName}`, 
        order 
      });
    }

    // 5️⃣ APPROVAL FLOW (role-based transitions)
    
    // ✅ DISTRICT MANAGER APPROVAL
    if (roleName === "district manager") {
      // Keep approval pending, next level is Corporate Manager
      order.approvalStatus = "PENDING"; // Still awaiting next approval
      order.approvedBy = userId;

      // 📧 Notify Corporate Manager (if assigned)
      // ✅ FIX: corporateManager is already an ID, not an object
      if (order.warehouse.corporateManager) {
        await new Notification({
          user: order.warehouse.corporateManager,
          type: "ORDER",
          content: `Order #${order.orderId} approved by District Manager. Awaiting your approval.`,
          resourceId: order._id,
          resourceModel: "Order",
          priority: "high"
        }).save();
      } else {
        // ⚠️ No CM assigned, escalate to Admin
        const admin = await User.findOne({ "role.role_name": "Super User" }).select("_id");
        if (admin) {
          await new AdminNotification({
            user: admin._id,
            type: "ORDER",
            content: `Order #${order.orderId} approved by District Manager (no CM assigned). Awaiting your approval.`,
            resourceId: order._id,
            resourceModel: "Order",
            priority: "high"
          }).save();
        }
      }
    }

    // ✅ CORPORATE MANAGER APPROVAL
    else if (roleName === "corporate manager") {
      // Check if DM has already approved
      const dmApproved = order.approvalHistory.some(
        h => h.role === "district manager" && h.status === "APPROVED"
      );

      if (!dmApproved) {
        throw new Error("District Manager must approve before Corporate Manager");
      }

      order.approvalStatus = "PENDING"; // Still awaiting Admin
      order.approvedBy = userId;

      // 📧 Notify Admin
      const admin = await User.findOne({ "role.role_name": "Super User" }).select("_id");
      if (admin) {
        await new AdminNotification({
          user: admin._id,
          type: "ORDER",
          content: `Order #${order.orderId} approved by Corporate Manager. Awaiting your approval.`,
          resourceId: order._id,
          resourceModel: "Order",
          priority: "high"
        }).save();
      }
    }

    // ✅ ADMIN FINAL APPROVAL
    else if (roleName === "Super User") {
      // Verify all prior approvals exist
      const dmApproved = order.approvalHistory.some(
        h => h.role === "district manager" && h.status === "APPROVED"
      );
      const cmApproved = order.approvalHistory.some(
        h => h.role === "corporate manager" && h.status === "APPROVED"
      );

      // ✅ FIX: Compare IDs directly (both are strings)
      // If DM exists but didn't approve, reject
      if (order.warehouse.districtManager && !dmApproved) {
        throw new Error("District Manager must approve before Admin approval");
      }

      // If both DM and CM exist but CM didn't approve, reject
      if (order.warehouse.corporateManager && !cmApproved) {
        throw new Error("Corporate Manager must approve before Admin approval");
      }

      // ✅ FINAL APPROVAL: Set to APPROVED and update order status
      order.approvalStatus = "APPROVED";
      order.orderStatus = "Processing";
      order.approvedBy = userId;

      // 📧 Notify customer of final approval
      if (order.customer) {
        await new Notification({
          user: order.customer._id,
          type: "ORDER",
          content: `Your order #${order.orderId} has been approved and is now processing.`,
          resourceId: order._id,
          resourceModel: "Order"
        }).save();
      }
    }

    else {
      throw new Error(`Approval by role '${roleName}' is not authorized`);
    }

    // 6️⃣ Save order with all updates
    await order.save();

    res.status(200).json({ 
      message: `Order ${action === "APPROVE" ? "approved" : "disapproved"} by ${roleName}`, 
      order 
    });

  } catch (error) {
    console.error("Approval error:", error);
    res.status(400).json({ message: error.message });
  }
};





const getUserOrders = async (req, res) => {
  try {
      const userId = req.user._id;
    const orders = await Order.find({ customer: userId })
          .populate({
              path: 'items.product',
              refPath: 'items.itemType'
          })
      .populate('warehouse')
          .populate('shippingAddress')
          .populate('shippingMethod')
          .populate('city')
          .sort({ createdAt: -1 });

      // First fetch all orders
      const populatedOrders = await Promise.all(orders.map(async (order) => {
          const orderObj = order.toObject();
          
          // Then populate variants for each item based on type
          orderObj.items = await Promise.all(orderObj.items.map(async (item) => {
              if (item.itemType === 'Product') {
                  const populatedProduct = await Product.findById(item.product._id)
                      .populate({
                          path: 'variants',
                          populate: 'variantName'
                      });
                  return {
                      ...item,
                      product: populatedProduct,
                      productType: 'product'
                  };
              } else {
                  const populatedSpecialProduct = await SpecialProduct.findById(item.product._id)
                      .populate({
                          path: 'productVariants',
                          populate: 'variantName'
                      });
                  return {
                      ...item,
                      product: populatedSpecialProduct,
                      productType: 'specialProduct'
                  };
              }
          }));
          return orderObj;
      }));

      res.status(200).json(populatedOrders);
  } catch (error) {
      res.status(500).json({ message: 'Error fetching order history', error: error.message });
  }
};






// previous get all orders controller:
// const getAllOrders = async (req, res) => {
//   try {
//       const orders = await Order.find()
//           .populate('customer')
//           .populate('shippingAddress')
//           .populate('shippingMethod')
//           .populate('city')
//           .populate({
//               path: 'items.product'
//           })
//           .populate('couponUsed')
//           .sort({ createdAt: -1 });

//       res.status(200).json(orders);
//   } catch (error) {
//       res.status(500).json({ message: 'Error fetching orders', error: error.message });
//   }
// };


// const getAllOrders = async (req, res) => {
//   try {
//       const orders = await Order.find()
//           .populate('customer')
//           .populate('shippingAddress')
//           .populate('shippingMethod')
//           .populate('city')
//           .populate({
//               path: 'items.product',
//               refPath: 'items.itemType',
//               select: function(doc) {
//                 if (doc.itemType === 'Product') {
//                   return 'name sku price image category subcategory brand';
//                 } else {
//                   return 'name sku type unitSize prices description specialCategory';
//                 }
//               },
//               populate: function(doc) {
//                 if (doc.itemType === 'Product') {
//                   return [
//                     { path: 'category', select: 'name' },
//                     { path: 'subcategory', select: 'name' },
//                     { path: 'brand', select: 'name' }
//                   ];
//                 } else {
//                   return [
//                     { path: 'specialCategory', select: 'name type' }
//                   ];
//                 }
//               }
//           })
//           .populate('couponUsed')
//           .sort({ createdAt: -1 });

//       res.status(200).json(orders);
//   } catch (error) {
//       res.status(500).json({ message: 'Error fetching orders', error: error.message });
//   }
// };

// const getAllOrders = async (req, res) => {
//   try {
//     const orders = await Order.find()
//     .populate({
//       path: 'customer',
//       populate: {
//         path: 'warehouse',
//         model: 'Warehouse'
//       }
//     })
//       .populate('shippingAddress')
//       .populate('shippingMethod')
//       .populate('city')
//       .populate({
//         path: 'items.product',
//         refPath: 'items.itemType'
//       })
//       .sort({ createdAt: -1 });

//     return res.status(200).json(orders);
//   } catch (error) {
//     return res.status(500).json({ message: 'Error fetching orders', error: error.message });
//   }
// };



const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('warehouse')
      .populate({
        path: 'customer',
        populate: {
          path: 'warehouse',
          model: 'Warehouse'
        }
      })
      .populate('shippingAddress')
      .populate('shippingMethod')
      .populate('city')
      .populate({
        path: 'items.product',
        refPath: 'items.itemType'
      }).sort({ createdAt: -1 , updatedAt: -1})
      .lean()
      .exec();

    // Now let's populate variants after getting the base data
    const populatedOrders = await Promise.all(orders.map(async (order) => {
      const populatedItems = await Promise.all(order.items.map(async (item) => {
        if (item.product) {
          if (item.itemType === 'Product') {
            const populatedProduct = await Product.findById(item.product._id)
              .populate({
                path: 'variants',
                populate: 'variantName'
              });
            item.product = populatedProduct;
          } else if (item.itemType === 'SpecialProduct') {
            const populatedProduct = await SpecialProduct.findById(item.product._id)
              .populate({
                path: 'productVariants',
                populate: 'variantName'
              });
            item.product = populatedProduct;
          }
        }
        return item;
      }));
      order.items = populatedItems;
      return order;
    }));

    return res.status(200).json(populatedOrders);
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching orders', error: error.message });
  }
};















// const updateOrderStatus = async (req, res) => {
//     try {
//         const { orderId } = req.params; // Now expecting ObjectId in the parameter
//         const { orderStatus, paymentStatus } = req.body; // Allow updating both statuses

//         // Find the order by ObjectId
//         const order = await Order.findById(orderId);
//         if (!order) {
//             return res.status(404).json({ message: 'Order not found' });
//         }

//         // Update the statuses if provided
//         if (orderStatus) {
//             order.orderStatus = orderStatus;
//         }
//         if (paymentStatus) {
//             order.paymentStatus = paymentStatus;
//         }

//         // Save the updated order
//         await order.save();

//         res.status(200).json({ message: 'Order updated successfully', order });
//     } catch (error) {
//         res.status(500).json({ message: 'Error updating order', error: error.message });
//     }
// };

// previous code :
// const cancelOrderForCustomer = async (req, res) => {
//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//         const { orderId } = req.params;
//         const order = await Order.findById(orderId).session(session);

//         if (!order) {
//             await session.abortTransaction();
//             session.endSession();
//             return res.status(404).json({ message: 'Order not found' });
//         }

//         // Check if the request is from a guest user and verify the sessionId matches
//         if (!req.user && order.customer === null) {
//             if (!order.sessionId || order.sessionId !== req.session.id) {
//                 await session.abortTransaction();
//                 session.endSession();
//                 return res.status(403).json({ message: 'Unauthorized to cancel this order' });
//             }
//         }

//         // Check if the order can be canceled by the customer/guest
//         const orderCreatedAt = order.createdAt;
//         const oneDay = 24 * 60 * 60 * 1000; // One day in milliseconds
//         const currentTime = new Date().getTime();
//         if (currentTime - orderCreatedAt.getTime() > oneDay) {
//             await session.abortTransaction();
//             session.endSession();
//             return res.status(400).json({ message: 'Order cannot be canceled after one day' });
//         }

//         // Restore inventory quantities for the associated city
//         if (!order.city) {
//             await session.abortTransaction();
//             session.endSession();
//             return res.status(400).json({ message: 'Order city information is missing' });
//         }

//         for (const item of order.items) {
//             const inventory = await Inventory.findOne({
//                 product: item.product,
//                 city: order.city,
//             }).session(session);

//             if (inventory) {
//                 await Inventory.findOneAndUpdate(
//                     { product: item.product, city: order.city },
//                     { $inc: { quantity: item.quantity } },
//                     { new: true, session }
//                 );
//             } else {
//                 console.log(`Inventory not found for product ${item.product} in city ${order.city}`);
//             }
//         }

//         // Update order status to "Canceled"
//         order.orderStatus = 'Canceled';

//         // Update payment status only if the payment method is "Wallet"
//         if (order.paymentMethod === 'Wallet') {
//             order.paymentStatus = 'Refund'; // Mark as refund pending
//         }

//         await order.save({ session });

//         await session.commitTransaction();
//         session.endSession();

//         res.status(200).json({
//             message: `Order canceled successfully${
//                 order.paymentMethod === 'Wallet' ? ' and marked for refund' : ''
//             }`,
//         });
//     } catch (error) {
//         await session.abortTransaction();
//         session.endSession();
//         res.status(500).json({ message: 'Error canceling order', error: error.message });
//     }
// };



// previous cancel order code:
// const cancelOrder = async (req, res) => {
//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//         const { orderId } = req.params;
//         const order = await Order.findById(orderId).session(session);

//         if (!order) {
//             await session.abortTransaction();
//             session.endSession();
//             return res.status(404).json({ message: 'Order not found' });
//         }

//         // Restore inventory quantities for the associated city
//         if (!order.city) {
//             await session.abortTransaction();
//             session.endSession();
//             return res.status(400).json({ message: 'Order city information is missing' });
//         }

//         for (const item of order.items) {
//             const inventory = await Inventory.findOne({
//                 product: item.product,
//                 city: order.city,
//             }).session(session);

//             if (inventory) {
//                 await Inventory.findOneAndUpdate(
//                     { product: item.product, city: order.city },
//                     { $inc: { quantity: item.quantity } },
//                     { new: true, session }
//                 );
//             } else {
//                 console.log(`Inventory not found for product ${item.product} in city ${order.city}`);
//             }
//         }

//         // Update order status to "Canceled"
//         order.orderStatus = 'Canceled';

//         // Update payment status only if the payment method is "Wallet"
//         if (order.paymentMethod === 'Wallet') {
//             order.paymentStatus = 'Refund'; // Mark as refund pending
//         }

//         await order.save({ session });

//         await session.commitTransaction();
//         session.endSession();

//         res.status(200).json({
//             message: `Order canceled successfully${
//                 order.paymentMethod === 'Wallet' ? ' and marked for refund' : ''
//             }`,
//         });
//     } catch (error) {
//         await session.abortTransaction();
//         session.endSession();
//         res.status(500).json({ message: 'Error canceling order', error: error.message });
//     }
// };

// previous code:
// const updateOrderStatus = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//       const { orderId } = req.params;
//       const { orderStatus, paymentStatus, shippingStatus } = req.body;
//       const mainWarehouseId = '67b6c7b68958be48910ed415';

//       const order = await Order.findById(orderId).populate('customer').populate('items.product');
//       if (!order) {
//           throw new Error('Order not found');
//       }

//       if (orderStatus) {
//           order.orderStatus = orderStatus;
//       }
//       if (paymentStatus) {
//           order.paymentStatus = paymentStatus;
//       }
//       if (shippingStatus) {
//           order.shippingStatus = shippingStatus;
//       }

//       if (order.orderStatus === 'Confirmed' && order.items[0].itemType === 'SpecialProduct') {
//           const customerWarehouse = await Warehouse.findById(order.customer.warehouse);
//           if (!customerWarehouse) {
//               throw new Error('Customer warehouse not found');
//           }

//           const warehouseWallet = await WarehouseWallet.findOne({ warehouse: customerWarehouse._id });
//           if (!warehouseWallet || warehouseWallet.balance < order.grandTotal) {
//               throw new Error('Insufficient warehouse wallet balance');
//           }

//           for (const item of order.items) {
//               const mainInventory = await Inventory.findOne({ product: item.product._id, warehouse: mainWarehouseId });
//               if (!mainInventory || mainInventory.quantity < item.quantity) {
//                   throw new Error(`Insufficient quantity for product ${item.product.name} in main warehouse`);
//               }

//               // await Inventory.findOneAndUpdate(
//               //     { product: item.product._id, warehouse: mainWarehouseId },
//               //     { $inc: { quantity: -item.quantity } },
//               //     { session }
//               // );

//               const updatedMainInventory = await Inventory.findOneAndUpdate(
//                 { product: item.product._id, warehouse: mainWarehouseId },
//                 { $inc: { quantity: -item.quantity } },
//                 { new: true, session }
//               );


//               if (updatedMainInventory.quantity <= updatedMainInventory.stockAlertThreshold) {
//                 await AdminNotification.create([{
//                   user: '66c5bc4b3c1526016eeac109',
//                   type: 'LOW_STOCK',
//                   content: `Low stock alert for ${item.product.name} in main warehouse - Current quantity: ${updatedMainInventory.quantity}`,
//                   resourceId: updatedMainInventory._id,
//                   resourceModel: 'Inventory',
//                   priority: 'high'
//                 }], { session });
//               }

//             //   await Inventory.findOneAndUpdate(
//             //     { product: item.product._id, warehouse: customerWarehouse._id },
//             //     { 
//             //         $inc: { quantity: item.quantity },
//             //         $setOnInsert: {
//             //             productType: 'SpecialProduct',
//             //             city: '67400e8a7b963a1282d218b5',
//             //             stockAlertThreshold: 5,
//             //             lastRestocked: new Date()
//             //         }
//             //     },
//             //     { upsert: true, new: true, session }
//             // );
//             const updatedCustomerInventory = await Inventory.findOneAndUpdate(
//               { product: item.product._id, warehouse: customerWarehouse._id },
//               { 
//                 $inc: { quantity: item.quantity },
//                 $setOnInsert: {
//                   productType: 'SpecialProduct',
//                   city: '67400e8a7b963a1282d218b5',
//                   stockAlertThreshold: 5,
//                   lastRestocked: new Date()
//                 }
//               },
//               { upsert: true, new: true, session }
//             );

//             if (updatedCustomerInventory.quantity <= updatedCustomerInventory.stockAlertThreshold) {
//               await AdminNotification.create([{
//                 user: '66c5bc4b3c1526016eeac109',
//                 type: 'LOW_STOCK',
//                 content: `Low stock alert for ${item.product.name} in ${customerWarehouse.name} warehouse - Current quantity: ${updatedCustomerInventory.quantity}`,
//                 resourceId: updatedCustomerInventory._id,
//                 resourceModel: 'Inventory',
//                 priority: 'high'
//               }], { session });
//             }
//           }

//           warehouseWallet.balance -= order.grandTotal;
//           await warehouseWallet.save({ session });

//           const customerNotification = new Notification({
//               user: order.customer._id,
//               content: `Your special order #${order.orderId} has been approved and processed.`,
//               url: `/orders/${order._id}`
//           });
//           await customerNotification.save({ session });

//           const adminNotification = new AdminNotification({
//               user: req.user._id,
//               type: 'ORDER',
//               content: `Special order #${order.orderId} has been approved and processed.`,
//               resourceId: order._id,
//               resourceModel: 'Order',
//               priority: 'medium'
//           });
//           await adminNotification.save({ session });
//       }

//       await order.save({ session });

//       await session.commitTransaction();
//       res.status(200).json({ message: 'Order updated successfully', order });
//   } catch (error) {
//       await session.abortTransaction();
//       res.status(500).json({ message: 'Error updating order', error: error.message });
//   } finally {
//       session.endSession();
//   }
// };


const updateOrderStatus = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
      const { orderId } = req.params;
      const { orderStatus, paymentStatus, shippingStatus } = req.body;
      const mainWarehouseId = '67b6c7b68958be48910ed415';

      
      const order = await Order.findById(orderId)
        .populate('customer')
        .populate({
          path: 'items.product',
          refPath: 'items.itemType'
        });
        
      if (!order) {
          throw new Error('Order not found');
      }

      if (orderStatus) {
          order.orderStatus = orderStatus;
      }
      if (paymentStatus) {
          order.paymentStatus = paymentStatus;
      }
      if (shippingStatus) {
          order.shippingStatus = shippingStatus;
      }

      const specialProductIds = order.items
  .filter(item => item.itemType === 'SpecialProduct')
  .map(item => item.product._id);

const specialProducts = await SpecialProduct.find({
  _id: { $in: specialProductIds }
});

// Create the productMap
const productMap = specialProducts.reduce((map, product) => {
  map[product._id.toString()] = product;
  return map;
}, {});


      

      if (order.orderStatus === 'Confirmed' && order.items.some(item => item.itemType === 'SpecialProduct')) {
          const customerWarehouse = await Warehouse.findById(order.customer.warehouse);
          if (!customerWarehouse) {
              throw new Error('Customer warehouse not found');
          }

          // Get all special products with their details
          const specialProductIds = order.items
            .filter(item => item.itemType === 'SpecialProduct')
            .map(item => item.product._id);
            
          const specialProducts = await SpecialProduct.find({
            _id: { $in: specialProductIds }
          });
          
          // Create a map for quick lookup
          const productMap = specialProducts.reduce((map, product) => {
            map[product._id.toString()] = product;
            return map;
          }, {});

          // Filter only non-GWP special products (since GWP products were already processed during order placement)
          const nonGwpSpecialItems = order.items.filter(item => 
            item.itemType === 'SpecialProduct' && 
            productMap[item.product._id.toString()]?.type !== 'GWP'
          );

          // Process only non-GWP special items - inventory update
          if (nonGwpSpecialItems.length > 0) {
            // Update inventory for non-GWP special items
            for (const item of nonGwpSpecialItems) {
              const mainInventory = await Inventory.findOne({ 
                product: item.product._id, 
                warehouse: mainWarehouseId 
              });
              
              if (!mainInventory || mainInventory.quantity < item.quantity) {
                throw new Error(`Insufficient quantity for special product ${item.product.name} in main warehouse`);
              }
              
              const updatedMainInventory = await Inventory.findOneAndUpdate(
                { product: item.product._id, warehouse: mainWarehouseId },
                { $inc: { quantity: -item.quantity } },
                { new: true, session }
              );
                if (updatedMainInventory.quantity <= updatedMainInventory.stockAlertThreshold) {
                  await AdminNotification.create([{
                    user: '66c5bc4b3c1526016eeac109',
                    type: 'LOW_STOCK',
                    content: `Low stock alert for ${item.product.name} in main warehouse - Current quantity: ${updatedMainInventory.quantity}`,
                    resourceId: updatedMainInventory._id,
                    resourceModel: 'Inventory',
                    priority: 'high'
                  }], { session });
                }
  
                // Add to customer's warehouse inventory
                const updatedCustomerInventory = await Inventory.findOneAndUpdate(
                  { product: item.product._id, warehouse: customerWarehouse._id },
                  { 
                    $inc: { quantity: item.quantity },
                    $setOnInsert: {
                      productType: 'SpecialProduct',
                      city: '67400e8a7b963a1282d218b5',
                      stockAlertThreshold: 5,
                      lastRestocked: new Date()
                    }
                  },
                  { upsert: true, new: true, session }
                );

                const updatedSpecialProduct = await SpecialProduct.findByIdAndUpdate(
                  item.product._id,
                  { $addToSet: { inventory: updatedCustomerInventory._id } },
                  {new:true,  session }
                );

                console.log('Updated Special Product:', updatedSpecialProduct);
  
                if (updatedCustomerInventory.quantity <= updatedCustomerInventory.stockAlertThreshold) {
                  await AdminNotification.create([{
                    user: '66c5bc4b3c1526016eeac109',
                    type: 'LOW_STOCK',
                    content: `Low stock alert for ${item.product.name} in ${customerWarehouse.name} warehouse - Current quantity: ${updatedCustomerInventory.quantity}`,
                    resourceId: updatedCustomerInventory._id,
                    resourceModel: 'Inventory',
                    priority: 'high'
                  }], { session });
                }
              }
            }
  
            const customerNotification = new Notification({
                user: order.customer._id,
                content: `Your order #${order.orderId} has been approved and processed.`,
                url: `/orders/${order._id}`
            });
            await customerNotification.save({ session });
  
            const adminNotification = new AdminNotification({
                user: req.user._id,
                type: 'ORDER',
                content: `order #${order.orderId} has been approved and processed.`,
                resourceId: order._id,
                resourceModel: 'Order',
                priority: 'medium'
            });
            await adminNotification.save({ session });
        }

        const customer = await Customer.findById(order.customer).populate('warehouse');
if (!customer || !customer.warehouse) {
  throw new Error('Customer or customer warehouse not found');
}
const customerWarehouse = customer.warehouse;
console.log('Customer Warehouse:', customerWarehouse);

        // if (orderStatus === 'Disapproved') {
        //   const nonGwpSpecialItems = order.items.filter(item => 
        //     item.itemType === 'SpecialProduct' && 
        //     productMap[item.product._id.toString()]?.type !== 'GWP'
        //   );
        
        //   if (nonGwpSpecialItems.length > 0) {
        //     const refundAmount = nonGwpSpecialItems.reduce((total, item) => total + (item.price * item.quantity), 0);
        
        //     const suppliesWallet = await SuppliesWallet.findOne({ warehouse: customerWarehouse._id });
        //     if (!suppliesWallet) {
        //       throw new Error('Supplies wallet not found for customer warehouse');
        //     }
        
        //     suppliesWallet.balance += refundAmount;
        //     await suppliesWallet.save({ session });


        //     for (const item of nonGwpSpecialItems) {
        //       // Main warehouse mein quantity wapas add karein
        //       await Inventory.findOneAndUpdate(
        //         { product: item.product._id, warehouse: mainWarehouseId },
        //         { $inc: { quantity: item.quantity } },
        //         { session }
        //       );
        //       // Customer warehouse se quantity minus karein
        //       await Inventory.findOneAndUpdate(
        //         { product: item.product._id, warehouse: customerWarehouse._id },
        //         { $inc: { quantity: -item.quantity } },
        //         { session }
        //       );
        //     }


        //     // const gwpItems = order.items.filter(item =>
        //     //   item.itemType === 'SpecialProduct' &&
        //     //   productMap[item.product._id.toString()]?.type === 'GWP'
        //     // );
        //     // const normalItems = order.items.filter(item => item.itemType === 'Product');
          
        //     // const inventoryWalletRefundItems = [...gwpItems, ...normalItems];
          
        //     // if (inventoryWalletRefundItems.length > 0) {
        //     //   const refundAmount = inventoryWalletRefundItems.reduce((total, item) => total + (item.price * item.quantity), 0);
        //     //   const inventoryWallet = await InventoryWallet.findOne({ warehouse: customerWarehouse._id });
        //     //   if (!inventoryWallet) throw new Error('Inventory wallet not found for customer warehouse');
          
        //     //   inventoryWallet.balance += refundAmount;
        //     //   await inventoryWallet.save({ session });
          
        //     //   for (const item of inventoryWalletRefundItems) {
        //     //     // Main warehouse me stock wapas
        //     //     await Inventory.findOneAndUpdate(
        //     //       { product: item.product._id, warehouse: mainWarehouseId },
        //     //       { $inc: { quantity: item.quantity } },
        //     //       { session }
        //     //     );
        //     //     // Customer warehouse se stock minus
        //     //     await Inventory.findOneAndUpdate(
        //     //       { product: item.product._id, warehouse: customerWarehouse._id },
        //     //       { $inc: { quantity: -item.quantity } },
        //     //       { session }
        //     //     );
        //     //   }
        //     // }
        
        //     const customerNotification = new Notification({
        //       user: order.customer._id,
        //       content: `Your special order #${order.orderId} has been disapproved. The amount has been refunded to your supplies wallet.`,
        //       url: `/orders/${order._id}`
        //     });
        //     await customerNotification.save({ session });
        
        //     const adminNotification = new AdminNotification({
        //       user: req.user._id,
        //       type: 'ORDER',
        //       content: `Special order #${order.orderId} has been disapproved and refunded.`,
        //       resourceId: order._id,
        //       resourceModel: 'Order',
        //       priority: 'medium'
        //     });
        //     await adminNotification.save({ session });
        //   }

        //   const gwpItems = order.items.filter(item =>
        //     item.itemType === 'SpecialProduct' &&
        //     productMap[item.product._id.toString()]?.type === 'GWP'
        //   );
        //   const normalItems = order.items.filter(item => item.itemType === 'Product');
        
        //   const inventoryWalletRefundItems = [...gwpItems, ...normalItems];
        
        //   if (inventoryWalletRefundItems.length > 0) {
        //     const refundAmount = inventoryWalletRefundItems.reduce((total, item) => total + (item.price * item.quantity), 0);
        //     const inventoryWallet = await InventoryWallet.findOne({ warehouse: customerWarehouse._id });
        //     if (!inventoryWallet) throw new Error('Inventory wallet not found for customer warehouse');
        
        //     inventoryWallet.balance += refundAmount;
        //     await inventoryWallet.save({ session });
        
        //     for (const item of inventoryWalletRefundItems) {
        //       // Main warehouse me stock wapas
        //       await Inventory.findOneAndUpdate(
        //         { product: item.product._id, warehouse: mainWarehouseId },
        //         { $inc: { quantity: item.quantity } },
        //         { session }
        //       );
        //       // Customer warehouse se stock minus
        //       await Inventory.findOneAndUpdate(
        //         { product: item.product._id, warehouse: customerWarehouse._id },
        //         { $inc: { quantity: -item.quantity } },
        //         { session }
        //       );
        //     }
        //   }
        // }

        if (orderStatus === 'Disapproved') {
          // --- 1) Non-GWP Special Products refund ---
          const nonGwpSpecialItems = order.items.filter(item => 
              item.itemType === 'SpecialProduct' && 
              productMap[item.product._id.toString()]?.type !== 'GWP'
          );
      
          if (nonGwpSpecialItems.length > 0) {
              const refundAmount = nonGwpSpecialItems.reduce((total, item) => total + (item.price * item.quantity), 0);
              const suppliesWallet = await SuppliesWallet.findOne({ warehouse: customerWarehouse._id });
              if (!suppliesWallet) throw new Error('Supplies wallet not found for customer warehouse');
      
              suppliesWallet.balance += refundAmount;
              await suppliesWallet.save({ session });
      
              for (const item of nonGwpSpecialItems) {
                  await Inventory.findOneAndUpdate(
                      { product: item.product._id, warehouse: mainWarehouseId },
                      { $inc: { quantity: item.quantity } },
                      { session }
                  );
                  await Inventory.findOneAndUpdate(
                      { product: item.product._id, warehouse: customerWarehouse._id },
                      { $inc: { quantity: -item.quantity } },
                      { session }
                  );
              }
          }
      
          // --- 2) GWP Special Products + Normal Products refund ---
          const gwpItems = order.items.filter(item =>
              item.itemType === 'SpecialProduct' &&
              productMap[item.product._id.toString()]?.type === 'GWP'
          );
          const normalItems = order.items.filter(item => item.itemType === 'Product');
      
          const inventoryWalletRefundItems = [...gwpItems, ...normalItems];
      
          if (inventoryWalletRefundItems.length > 0) {
              const refundAmount = inventoryWalletRefundItems.reduce((total, item) => total + (item.price * item.quantity), 0);
              const inventoryWallet = await InventoryWallet.findOne({ warehouse: customerWarehouse._id });
              if (!inventoryWallet) throw new Error('Inventory wallet not found for customer warehouse');
      
              inventoryWallet.balance += refundAmount;
              await inventoryWallet.save({ session });
      
              for (const item of inventoryWalletRefundItems) {
                  await Inventory.findOneAndUpdate(
                      { product: item.product._id, warehouse: mainWarehouseId },
                      { $inc: { quantity: item.quantity } },
                      { session }
                  );
                  await Inventory.findOneAndUpdate(
                      { product: item.product._id, warehouse: customerWarehouse._id },
                      { $inc: { quantity: -item.quantity } },
                      { session }
                  );
              }
          }
        }
        
  
        await order.save({ session });
  
        await session.commitTransaction();
        res.status(200).json({ message: 'Order updated successfully', order });
    } catch (error) {
        await session.abortTransaction();
        res.status(500).json({ message: 'Error updating order', error: error.message });
    } finally {
        session.endSession();
    }
  };

  




const cancelOrderForCustomer = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
      const { orderId } = req.params;
      const order = await Order.findById(orderId).session(session);

      if (!order) {
          await session.abortTransaction();
          session.endSession();
          return res.status(404).json({ message: 'Order not found' });
      }

      // Check if the request is from a guest user and verify the sessionId matches
      if (!req.user && order.customer === null) {
          if (!order.sessionId || order.sessionId !== req.session.id) {
              await session.abortTransaction();
              session.endSession();
              return res.status(403).json({ message: 'Unauthorized to cancel this order' });
          }
      }

      // Check if the order can be canceled by the customer/guest
      const orderCreatedAt = order.createdAt;
      const oneDay = 24 * 60 * 60 * 1000; // One day in milliseconds
      const currentTime = new Date().getTime();
      if (currentTime - orderCreatedAt.getTime() > oneDay) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ message: 'Order cannot be canceled after one day' });
      }

      // Restore inventory quantities based on item type
      for (const item of order.items) {
          if (item.itemType === 'Product') {
              const inventory = await Inventory.findOne({
                  product: item.product,
                  city: order.city,
              }).session(session);

              if (inventory) {
                  await Inventory.findOneAndUpdate(
                      { product: item.product, city: order.city },
                      { $inc: { quantity: item.quantity } },
                      { new: true, session }
                  );
              }
          } else {
              // Handle SpecialProduct inventory
              await SpecialProduct.findByIdAndUpdate(
                  item.product,
                  { $inc: { stock: item.quantity } },
                  { new: true, session }
              );
          }
      }

      // Update order status to "Canceled"
      order.orderStatus = 'Canceled';

      // Update payment status only if the payment method is "Wallet"
      if (order.paymentMethod === 'Wallet') {
          order.paymentStatus = 'Refund';
      }

      await order.save({ session });
      await session.commitTransaction();
      session.endSession();

      res.status(200).json({
          message: `Order canceled successfully${
              order.paymentMethod === 'Wallet' ? ' and marked for refund' : ''
          }`,
      });
  } catch (error) {
      await session.abortTransaction();
      session.endSession();
      res.status(500).json({ message: error.message });
  }
};




const cancelOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId).session(session);

    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Order not found' });
    }

    // Restore inventory for both product types
    for (const item of order.items) {
      if (item.itemType === 'Product') {
        await Inventory.findOneAndUpdate(
          { product: item.product, city: order.city },
          { $inc: { quantity: item.quantity } },
          { new: true, session }
        );
      } else {
        await SpecialProduct.findByIdAndUpdate(
          item.product,
          { $inc: { stock: item.quantity } },
          { new: true, session }
        );
      }
    }

    order.orderStatus = 'Canceled';
    if (order.paymentMethod === 'Wallet') {
      order.paymentStatus = 'Refund';
    }

    await order.save({ session });
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: `Order canceled successfully${
        order.paymentMethod === 'Wallet' ? ' and marked for refund' : ''
      }`,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: error.message });
  }
};


const processRefund = async (req, res) => {
  try {
      const { orderId, amount } = req.body;

      // Find the order using the orderId field
      const order = await Order.findOne({ orderId: orderId });

      if (!order) {
          return res.status(404).json({ message: 'Order not found' });
      }

      // Validate refund applicability
      if (order.paymentStatus === 'Refunded') {
          return res.status(400).json({ message: 'Refund has already been processed' });
      }

      if (order.paymentStatus !== 'Refund') {
          return res.status(400).json({ message: 'Refund not applicable for this order' });
      }

      // Ensure amount is valid
      if (amount > order.grandTotal) {  // Make sure the refund amount does not exceed the grand total of the order
          return res.status(400).json({ message: 'Refund amount exceeds order total' });
      }

      // Update wallet balance if applicable
      if (order.paymentMethod === 'Wallet') {
          let wallet = await Wallet.findOne({ customer: order.customer });
          if (!wallet) {
              return res.status(404).json({ message: 'Wallet not found for customer' });
          }

          wallet.balance += amount;  // Credit the amount to the wallet
          await wallet.save();
      }

      // Update payment status to 'Refunded'
      order.paymentStatus = 'Refunded';
      await order.save();

      res.status(200).json({ message: 'Refund processed successfully' });
  } catch (error) {
      res.status(500).json({ message: 'Error processing refund', error: error.message });
  }
};




const updateWalletBalance = async (req, res) => {
    try {
      const { customerId, amount, type } = req.body;
  
      if (!customerId || !amount || !type) {
        return res.status(400).json({ message: 'Customer ID, amount, and type are required.' });
      }
  
      if (!['Credit', 'Debit'].includes(type)) {
        return res.status(400).json({ message: 'Invalid transaction type. Use "Credit" or "Debit".' });
      }
  
      let wallet = await Wallet.findOne({ customer: customerId });
  
      // If the wallet doesn't exist, create one
      if (!wallet) {
        if (type === 'Debit') {
          return res.status(400).json({ message: 'Cannot debit from a non-existent wallet.' });
        }
        // Create a new wallet for the customer
        wallet = new Wallet({
          customer: customerId,
          balance: amount, // Initialize with the credited amount
        });
      } else {
        // Update wallet balance
        if (type === 'Debit' && wallet.balance < amount) {
          return res.status(400).json({ message: 'Insufficient wallet balance.' });
        }
  
        wallet.balance =
          type === 'Credit' ? wallet.balance + amount : wallet.balance - amount;
      }
  
      await wallet.save();
  
      res.status(200).json({ message: 'Wallet updated successfully.', wallet });
    } catch (error) {
      console.error('Error updating wallet:', error);
      res.status(500).json({ message: 'Error updating wallet.', error: error.message });
    }
  };
  

  const getAllWallets = async (req, res) => {
    try {
      // Fetch all wallets with the associated customer details
      const wallets = await Wallet.find().populate('customer');
  
      if (!wallets || wallets.length === 0) {
        return res.status(404).json({ message: 'No wallet data found.' });
      }
  
      // Return all wallet data to the admin
      res.status(200).json({ message: 'All wallet data retrieved successfully', wallets });
    } catch (error) {
      console.error('Error retrieving wallet data:', error);
      res.status(500).json({ message: 'Error retrieving wallet data', error: error.message });
    }
  };



const getOwnWallet = async (req, res) => {
    try {
      const customerId = req.user._id; // Get the logged-in user's customer ID from the session or JWT
  
      // Find the wallet by the customer's ID
      const wallet = await Wallet.findOne({ customer: customerId }).populate('customer');
  
      if (!wallet) {
        return res.status(404).json({ message: 'Wallet not found for the user.' });
      }
  
      // Return the user's wallet data
      res.status(200).json({ message: 'Wallet data retrieved successfully', wallet });
    } catch (error) {
      console.error('Error retrieving wallet:', error);
      res.status(500).json({ message: 'Error retrieving wallet data', error: error.message });
    }
  };
  
  
// can be use if order and payment if separte
const updatePaymentMethod = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
  
    try {
      const { orderId, paymentMethod } = req.body;
  
      if (!orderId || !paymentMethod) {
        return res.status(400).json({ message: 'Order ID and payment method are required.' });
      }
  
      // Use findOne to query by orderId instead of _id
      const order = await Order.findOne({ orderId }).session(session);
      if (!order) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'Order not found.' });
      }
  
      // Update payment method to COD
      if (paymentMethod === 'COD') {
        order.paymentMethod = 'COD';
        order.paymentStatus = 'Pending'; // Default status for COD
        order.orderStatus = 'Confirm'; // Default order status
      }
  
      // Update payment method to Wallet
      if (paymentMethod === 'Wallet') {
        const wallet = await Wallet.findOne({ customer: order.customer }).session(session);
        if (!wallet) {
          await session.abortTransaction();
          session.endSession();
          return res.status(404).json({ message: 'Wallet not found for the customer.' });
        }
  
        if (wallet.balance < order.grandTotal) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ message: 'Insufficient wallet balance.' });
        }
  
        // Deduct amount from wallet
        wallet.balance -= order.grandTotal;
        await wallet.save({ session });
  
        order.paymentMethod = 'Wallet';
        order.paymentStatus = 'Paid'; // Mark as paid
        order.orderStatus = 'Confirm';
      }
  
      // Save the updated order
      await order.save({ session });
  
      await session.commitTransaction();
      session.endSession();
  
      res.status(200).json({ message: 'Payment method updated successfully.', order });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error('Error updating payment method:', error);
      res.status(500).json({ message: 'Error updating payment method.', error: error.message });
    }
  };


  // prevvious code update Order by admin 
// const updateOrderByAdmin = async (req, res) => {
//     try {
//         const { orderId } = req.params;
//         const { 
//             subtotal, 
//             grandTotal, 
//             shippingCost, 
//             specialInstructions,
//             couponUsed,
//             items,
//             adminNotes // Added this field 
//         } = req.body;

//         const order = await Order.findById(orderId);
//         if (!order) {
//             return res.status(404).json({ message: 'Order not found' });
//         }

//         // Update basic fields
//         if (subtotal !== undefined) order.subtotal = subtotal;
//         if (grandTotal !== undefined) order.grandTotal = grandTotal;
//         if (shippingCost !== undefined) order.shippingCost = shippingCost;
//         if (specialInstructions !== undefined) order.specialInstructions = specialInstructions;
//         if (couponUsed !== undefined) order.couponUsed = couponUsed;
//         if (adminNotes !== undefined) order.adminNotes = adminNotes; // Added this line


//         // Update items if provided
//         if (items && Array.isArray(items)) {
//             // Validate each item has required fields
//             const validItems = items.every(item => 
//                 item.product && item.quantity && item.price
//             );

//             if (!validItems) {
//                 return res.status(400).json({ 
//                     message: 'Each item must have product, quantity, and price' 
//                 });
//             }

//             order.items = items;
//         }

//         await order.save();

//         // Return populated order data
//         const updatedOrder = await Order.findById(orderId)
//             .populate('customer')
//             .populate('items.product')
//             .populate('shippingAddress')
//             .populate('shippingMethod');

//         res.status(200).json({
//             message: 'Order updated successfully',
//             order: updatedOrder
//         });

//     } catch (error) {
//         res.status(400).json({ message: error.message });
//     }
// };

const updateOrderByAdmin = async (req, res) => {
  try {
      const { orderId } = req.params;
      const { 
          subtotal, 
          grandTotal, 
          shippingCost, 
          specialInstructions,
          couponUsed,
          items,
          adminNotes 
      } = req.body;

      const order = await Order.findById(orderId);
      if (!order) {
          return res.status(404).json({ message: 'Order not found' });
      }

      // Update basic fields
      if (subtotal !== undefined) order.subtotal = subtotal;
      if (grandTotal !== undefined) order.grandTotal = grandTotal;
      if (shippingCost !== undefined) order.shippingCost = shippingCost;
      if (specialInstructions !== undefined) order.specialInstructions = specialInstructions;
      if (couponUsed !== undefined) order.couponUsed = couponUsed;
      if (adminNotes !== undefined) order.adminNotes = adminNotes;

      // Update items if provided
      if (items && Array.isArray(items)) {
          // Validate each item has required fields
          const validItems = items.every(item => 
              item.product && item.quantity && item.price && item.itemType
          );

          if (!validItems) {
              return res.status(400).json({ 
                  message: 'Each item must have product, quantity, price, and itemType' 
              });
          }

          order.items = items;
      }

      await order.save();

      // Return populated order data
      const updatedOrder = await Order.findById(orderId)
          .populate({
              path: 'items.product',
              refPath: 'items.itemType'
          })
          .populate('customer')
          .populate('shippingAddress')
          .populate('shippingMethod');

      res.status(200).json({
          message: 'Order updated successfully',
          order: updatedOrder
      });

  } catch (error) {
      res.status(400).json({ message: error.message });
  }
};


// previous code download orders data
// const downloadOrdersData = async (req, res) => {
//   try {
//       const orders = await Order.find()
//           .populate('customer', 'username email phone_number')
//           .populate({
//               path: 'items.product',
//               select: 'name sku'
//           })
//           .populate('shippingAddress')
//           .populate('shippingMethod', 'name description price estimatedDeliveryTime')
//           .lean();

//       const fields = [
//           'orderId',
//           'customerName',
//           'customerEmail',
//           'customerPhone',
//           'itemNames',
//           'itemQuantities',
//           'itemPrices',
//           'shippingAddress',
//           'shippingMethodName',
//           'shippingMethodDescription',
//           'shippingMethodPrice',
//           'estimatedDeliveryTime',
//           'subtotal',
//           'shippingCost',
//           'grandTotal',
//           'paymentMethod',
//           'paymentStatus',
//           'orderStatus',
//           'specialInstructions',
//           'adminNotes'
//       ];

//       const json2csvParser = new Parser({ fields });

//       const csvData = orders.map(order => ({
//           orderId: order.orderId,
//           customerName: order.customer ? order.customer.username : order.guestInfo?.name || '',
//           customerEmail: order.customer ? order.customer.email : order.guestInfo?.email || '',
//           customerPhone: order.customer ? order.customer.phone_number : order.guestInfo?.phoneNumber || '',
//           itemNames: order.items.map(item => `${item.product.name}(${item.product.sku})`).join('|'),
//           itemQuantities: order.items.map(item => item.quantity).join('|'),
//           itemPrices: order.items.map(item => item.price).join('|'),
//           shippingAddress: order.shippingAddress ? 
//               `${order.shippingAddress.address}${order.shippingAddress.title ? ` (${order.shippingAddress.title})` : ''}` : 
//               order.guestAddress ? 
//               `${order.guestAddress.street}, ${order.guestAddress.city}, ${order.guestAddress.postalCode}` : '',
//           shippingMethodName: order.shippingMethod?.name || '',
//           shippingMethodDescription: order.shippingMethod?.description || '',
//           shippingMethodPrice: order.shippingMethod?.price || '',
//           estimatedDeliveryTime: order.shippingMethod?.estimatedDeliveryTime || '',
//           subtotal: order.subtotal,
//           shippingCost: order.shippingCost,
//           grandTotal: order.grandTotal,
//           paymentMethod: order.paymentMethod || '',
//           paymentStatus: order.paymentStatus,
//           orderStatus: order.orderStatus,
//           specialInstructions: order.specialInstructions || '',
//           adminNotes: order.adminNotes || ''
//       }));

//       const csv = json2csvParser.parse(csvData);

//       res.header('Content-Type', 'text/csv');
//       res.attachment('orders_data.csv');
//       res.send(csv);

//   } catch (error) {
//       res.status(500).json({ message: error.message });
//   }
// };


// const downloadOrdersData = async (req, res) => {
//   try {
//       const orders = await Order.find()
//           .populate('customer', 'username email phone_number')
//           .populate({
//               path: 'items.product',
//               refPath: 'items.itemType',
//               select: 'name sku'
//           })
//           .populate('shippingAddress')
//           .populate('shippingMethod', 'name description price estimatedDeliveryTime')
//           .lean();

//       const fields = [
//           'orderId',
//           'customerName',
//           'customerEmail',
//           'customerPhone',
//           'itemNames',
//           'itemTypes',
//           'itemQuantities',
//           'itemPrices',
//           'shippingAddress',
//           'shippingMethodName',
//           'shippingMethodDescription',
//           'shippingMethodPrice',
//           'estimatedDeliveryTime',
//           'subtotal',
//           'shippingCost',
//           'grandTotal',
//           'paymentMethod',
//           'paymentStatus',
//           'orderStatus',
//           'specialInstructions',
//           'adminNotes'
//       ];

//       const json2csvParser = new Parser({ fields });

//       const csvData = orders.map(order => ({
//           orderId: order.orderId,
//           customerName: order.customer ? order.customer.username : order.guestInfo?.name || '',
//           customerEmail: order.customer ? order.customer.email : order.guestInfo?.email || '',
//           customerPhone: order.customer ? order.customer.phone_number : order.guestInfo?.phoneNumber || '',
//           itemNames: order.items.map(item => `${item.product.name}(${item.product.sku})`).join('|'),
//           itemTypes: order.items.map(item => item.itemType).join('|'),
//           itemQuantities: order.items.map(item => item.quantity).join('|'),
//           itemPrices: order.items.map(item => item.price).join('|'),
//           shippingAddress: order.shippingAddress ? 
//               `${order.shippingAddress.address}${order.shippingAddress.title ? ` (${order.shippingAddress.title})` : ''}` : 
//               order.guestAddress ? 
//               `${order.guestAddress.street}, ${order.guestAddress.city}, ${order.guestAddress.postalCode}` : '',
//           shippingMethodName: order.shippingMethod?.name || '',
//           shippingMethodDescription: order.shippingMethod?.description || '',
//           shippingMethodPrice: order.shippingMethod?.price || '',
//           estimatedDeliveryTime: order.shippingMethod?.estimatedDeliveryTime || '',
//           subtotal: order.subtotal,
//           shippingCost: order.shippingCost,
//           grandTotal: order.grandTotal,
//           paymentMethod: order.paymentMethod || '',
//           paymentStatus: order.paymentStatus,
//           orderStatus: order.orderStatus,
//           specialInstructions: order.specialInstructions || '',
//           adminNotes: order.adminNotes || ''
//       }));

//       const csv = json2csvParser.parse(csvData);

//       res.header('Content-Type', 'text/csv');
//       res.attachment('orders_data.csv');
//       res.send(csv);

//   } catch (error) {
//       res.status(500).json({ message: error.message });
//   }
// };

// const downloadOrdersData = async (req, res) => {
//   try {
//       const orders = await Order.find()
//           .populate('customer', 'username email phone_number')
//           .populate({
//               path: 'items.item',
//               refPath: 'items.itemType',
//               select: 'name sku'
//           })
//           .populate('shippingAddress')
//           .populate('shippingMethod', 'name description price estimatedDeliveryTime')
//           .lean();

//       const fields = [
//           'orderId',
//           'customerName',
//           'customerEmail',
//           'customerPhone',
//           'itemType',
//           'itemName',
//           'itemSku',
//           'itemQuantity',
//           'itemPrice',
//           'shippingAddress',
//           'shippingMethodName',
//           'shippingMethodDescription',
//           'shippingMethodPrice',
//           'estimatedDeliveryTime',
//           'subtotal',
//           'shippingCost',
//           'grandTotal',
//           'paymentMethod',
//           'paymentStatus',
//           'orderStatus',
//           'specialInstructions',
//           'adminNotes'
//       ];

//       const json2csvParser = new Parser({ fields });

//       const csvData = orders.flatMap(order => 
//           order.items.map(item => ({
//               orderId: order.orderId,
//               customerName: order.customer ? order.customer.username : order.guestInfo?.name || '',
//               customerEmail: order.customer ? order.customer.email : order.guestInfo?.email || '',
//               customerPhone: order.customer ? order.customer.phone_number : order.guestInfo?.phoneNumber || '',
//               itemType: item.itemType,
//               itemName: item.product?.name || '',
//               itemSku: item.product?.sku || '',
//               itemQuantity: item.quantity,
//               itemPrice: item.price,
//               shippingAddress: order.shippingAddress ? 
//                   `${order.shippingAddress.address}${order.shippingAddress.title ? ` (${order.shippingAddress.title})` : ''}` : 
//                   order.guestAddress ? 
//                   `${order.guestAddress.street}, ${order.guestAddress.city}, ${order.guestAddress.postalCode}` : '',
//               shippingMethodName: order.shippingMethod?.name || '',
//               shippingMethodDescription: order.shippingMethod?.description || '',
//               shippingMethodPrice: order.shippingMethod?.price || '',
//               estimatedDeliveryTime: order.shippingMethod?.estimatedDeliveryTime || '',
//               subtotal: order.subtotal,
//               shippingCost: order.shippingCost,
//               grandTotal: order.grandTotal,
//               paymentMethod: order.paymentMethod || '',
//               paymentStatus: order.paymentStatus,
//               orderStatus: order.orderStatus,
//               specialInstructions: order.specialInstructions || '',
//               adminNotes: order.adminNotes || ''
//           }))
//       );

//       const csv = json2csvParser.parse(csvData);
//       res.header('Content-Type', 'text/csv');
//       res.attachment('orders_data.csv');
//       res.send(csv);

//   } catch (error) {
//       res.status(500).json({ message: error.message });
//   }
// };


const downloadOrdersData = async (req, res) => {
  try {
      const orders = await Order.find()
          .populate('customer', 'username email phone_number')
          .populate({
              path: 'items.product',  // Changed from items.item to items.product
              refPath: 'items.itemType',
              select: 'name sku'
          })
          .populate('shippingAddress')
          .populate('shippingMethod', 'name description price estimatedDeliveryTime')
          .lean();

      const fields = [
          'orderId',
          'customerName',
          'customerEmail',
          'customerPhone',
          'itemType',
          'itemName',
          'itemSku',
          'itemQuantity',
          'itemPrice',
          'shippingAddress',
          'shippingMethodName',
          'shippingMethodDescription',
          'shippingMethodPrice',
          'estimatedDeliveryTime',
          'subtotal',
          'shippingCost',
          'grandTotal',
          'paymentMethod',
          'paymentStatus',
          'orderStatus',
          'specialInstructions',
          'adminNotes'
      ];

      const json2csvParser = new Parser({ fields });

      const csvData = orders.flatMap(order => 
          order.items.map(item => ({
              orderId: order.orderId,
              customerName: order.customer ? order.customer.username : order.guestInfo?.name || '',
              customerEmail: order.customer ? order.customer.email : order.guestInfo?.email || '',
              customerPhone: order.customer ? order.customer.phone_number : order.guestInfo?.phoneNumber || '',
              itemType: item.itemType,
              itemName: item.product?.name || '',  // Changed from item.item to item.product
              itemSku: item.product?.sku || '',    // Changed from item.item to item.product
              itemQuantity: item.quantity,
              itemPrice: item.price,
              shippingAddress: order.shippingAddress ? 
                  `${order.shippingAddress.address}${order.shippingAddress.title ? ` (${order.shippingAddress.title})` : ''}` : 
                  order.guestAddress ? 
                  `${order.guestAddress.street}, ${order.guestAddress.city}, ${order.guestAddress.postalCode}` : '',
              shippingMethodName: order.shippingMethod?.name || '',
              shippingMethodDescription: order.shippingMethod?.description || '',
              shippingMethodPrice: order.shippingMethod?.price || '',
              estimatedDeliveryTime: order.shippingMethod?.estimatedDeliveryTime || '',
              subtotal: order.subtotal,
              shippingCost: order.shippingCost,
              grandTotal: order.grandTotal,
              paymentMethod: order.paymentMethod || '',
              paymentStatus: order.paymentStatus,
              orderStatus: order.orderStatus,
              specialInstructions: order.specialInstructions || '',
              adminNotes: order.adminNotes || ''
          }))
      );

      const csv = json2csvParser.parse(csvData);
      res.header('Content-Type', 'text/csv');
      res.attachment('orders_data.csv');
      res.send(csv);

  } catch (error) {
      res.status(500).json({ message: error.message });
  }
};





 const getPendingApprovals = async (req, res) => {
  try {
    console.log("🧩 req.user full object:", req.user);

    // ✅ Get userId safely
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User ID not found in request",
      });
    }
    console.log("🧩 User ID:", userId.toString());

    // ✅ Step 1: Get Role ID from user object
    const roleId = req.user.role;
    console.log("🧩 Role ID:", roleId?.toString());

    // ✅ Step 2: Fetch role name manually (since populate not working)
    const roleData = await UserRole.findById(roleId);
    if (!roleData) {
      return res.status(404).json({ message: "Role not found" });
    }

    const roleName = roleData.role_name;
    console.log("✅ Role Name:", roleName);

    // ✅ Step 3: (Optional) Load user fully populated, only if needed
    let user = await Customer.findById(userId)
      .populate("role")
      .lean();
      
        if (!user) {
        user = await User.findById(userId).populate("role");
        }
      

    console.log("✅ Populated User:", user?.role?.role_name || "Not populated");

    // ✅ Step 4: Proceed with role logic
    let query = { approvalStatus: "PENDING" };

    // 🧩 DISTRICT MANAGER LOGIC
    if (roleName === "district manager") {
      const warehouses = await Warehouse.find({ districtManager: userId }).select("_id");
      const warehouseIds = warehouses.map((w) => w._id);

      console.log("Found warehouses for DM:", warehouseIds.length);

      if (warehouseIds.length === 0) {
        return res.status(200).json({
          success: true,
          count: 0,
          data: [],
          message: "No warehouses assigned to this District Manager",
        });
      }

      query.warehouse = { $in: warehouseIds };
      query.approvalHistory = {
        $not: {
          $elemMatch: {
            role: "district manager",
            approvedBy: userId,
          },
        },
      };
    }

    // 🧩 CORPORATE MANAGER LOGIC
    else if (roleName === "corporate manager") {
      const warehouses = await Warehouse.find({ corporateManager: userId }).select("_id");
      const warehouseIds = warehouses.map((w) => w._id);

      console.log("Found warehouses for CM:", warehouseIds.length);

      if (warehouseIds.length === 0) {
        return res.status(200).json({
          success: true,
          count: 0,
          data: [],
          message: "No warehouses assigned to this Corporate Manager",
        });
      }

      query.warehouse = { $in: warehouseIds };
      query.approvalHistory = {
        $elemMatch: {
          role: "district manager",
          status: "APPROVED",
        },
        $not: {
          $elemMatch: {
            role: "corporate manager",
            approvedBy: userId,
          },
        },
      };
    }
// 🧩 ADMIN (SUPER USER) LOGIC
    else if (roleName === "Super User") {
  query = {
    approvalStatus: "PENDING",
    $and: [
      { "approvalHistory": { $elemMatch: { role: "district manager", status: "APPROVED" } } },
      { "approvalHistory": { $elemMatch: { role: "corporate manager", status: "APPROVED" } } },
      { "approvalHistory": { $not: { $elemMatch: { role: "Super User", approvedBy: userId } } } }
    ]
  };
}
    // ❌ Unauthorized Role
    else {
      return res.status(403).json({
        success: false,
        message: `User role '${roleName}' is not authorized to view pending approvals`,
      });
    }

    console.log("✅ Final Query:", JSON.stringify(query, null, 2));

    // 🧾 FETCH ORDERS
    const orders = await Order.find(query)
      .populate({
        path: "warehouse",
        select: "name districtManager corporateManager location",
      })
      .populate({
        path: "customer",
        select: "username email phone_number warehouse",
        populate: {
          path: "warehouse",
          select: "name",
        },
      })
      .populate({
        path: "items.product",
        select: "name price",
        refPath: "items.itemType",
      })
      .populate({
        path: "approvalHistory.approvedBy",
        select: "username email role",
        populate: {
          path: "role",
          select: "role_name",
        },
      })
      .sort({ createdAt: -1 })
      .lean();

    // 🟢 SUCCESS RESPONSE
    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    console.error("❌ Error fetching pending approvals:", error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
 

  


module.exports = {
    calculateOrderTotals,
    placeOrder,
    approveOrder,
    getPendingApprovals,
    getUserOrders,
    getAllOrders,
    updateOrderStatus,
    cancelOrderForCustomer,
    cancelOrder,
    updatePaymentMethod,
    updateWalletBalance,
    getAllWallets,
    getOwnWallet,
    processRefund,
    updateOrderByAdmin,
    downloadOrdersData
};