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
const ActivityLogModel = require('../models/ActivityLog.model');
const { sendEmail } = require('../config/sendMails');


// Helper function to generate a random order number
const generateOrderNumber = () => {
    const date = new Date().toISOString().replace(/[-T:\.Z]/g, '').slice(0, 12);  // Format: YYYYMMDDHHMM
    const randomStr = crypto.randomBytes(3).toString('hex');  // Random 6 characters
    return `ORD-${date}-${randomStr}`;  // Example: ORD-20240930-abc123
};

const calculateOrderTotalsHelper = async (items, couponCode) => {
  if (!items || items.length === 0) throw new Error('Cart is empty');

  const productTotal = items
    .filter(item => item.itemType === 'Product')
    .reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const specialProductTotal = items
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
      const items = Array.isArray(req.body) ? req.body : req.body.items || [];
    const warehouseId = warehouse?._id || warehouse;
    const mainWarehouseId = "67b6c7b68958be48910ed415"; 

    const cart = await Cart.findById(cartId).populate("items.item");
    if (!cart) throw new Error("Cart not found");

    const customer = await Customer.findById(req.user.id).populate("warehouse");
    if (!customer) throw new Error("Customer not found");

    // find warehouse selected by customer
    // NOTE: districtManager and corporateManager are already IDs, don't populate
    const customerWarehouse = await Warehouse.findById(warehouseId);
    if (!customerWarehouse) throw new Error("Warehouse not found");

    // calculate totals
    const totals = await calculateOrderTotalsHelper(items, couponCode);

    // 🟩 Create base order
    const order = new Order({
      orderId: generateOrderNumber(),
      customer: customer._id,
      warehouse: warehouseId,
      createdBy: req.user.id,
      approvalStatus: "PENDING",
      items: items.map((item) => ({
        itemType: item.itemType,
        product: item.item._id,
        quantity: item.quantity,
        price: item.price,
        color: item.color || null,
        sellerWarehouseId: item?.sellerWarehouseId,
        isMain: item?.isMain
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
    const normalProducts = items.filter((i) => i.itemType === "Product");
    const specialProducts = items.filter(
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
const mainWarehouseId = '67b6c7b68958be48910ed415'; 

async function allocateProducts(order, session) {
  const customerWarehouse = order.warehouse;
  if (!customerWarehouse || !customerWarehouse._id) throw new Error("Customer warehouse missing");

  const productItems = order.items.filter(i => i.itemType === 'Product');
  if (productItems.length === 0) return;

  for (const item of productItems) {
    // Ensure main warehouse inventory
    const mainInventory = await Inventory.findOne({ product: item.product._id || item.product, warehouse: mainWarehouseId }).session(session);
    if (!mainInventory || mainInventory.quantity < item.quantity) {
      throw new Error(`Insufficient quantity for product ${item.product.name || item.product} in main warehouse`);
    }

    // Deduct from main warehouse
    // await Inventory.findOneAndUpdate(
    //   { product: item.product._id || item.product, warehouse: mainWarehouseId },
    //   { $inc: { quantity: -item.quantity } },
    //   { new: true, session }
    // );

    // Add to customer warehouse (upsert)
    const updatedCustomerInventory = await Inventory.findOneAndUpdate(
      { product: item.product._id || item.product, warehouse: customerWarehouse._id },
      {
        $inc: { quantity: item.quantity },
        $setOnInsert: {
          productType: 'Product',
          city: order.city?._id || order.city || '67400e8a7b963a1282d218b5',
          stockAlertThreshold: 5,
          lastRestocked: new Date()
        }
      },
      { upsert: true, new: true, session }
    );

    // Add inventory reference to Product
    await Product.findByIdAndUpdate(
      item.product._id || item.product,
      { $addToSet: { inventory: updatedCustomerInventory._id } },
      { new: true, session }
    );
  }

   const inventoryWallet = await InventoryWallet.findOne({ warehouse: mainWarehouseId }).session(session);
        if (!inventoryWallet) throw new Error("Main warehouse inventory wallet missing");

        const totalAmount = productItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        inventoryWallet.balance += totalAmount;
        await inventoryWallet.save({ session });

  // Update main warehouse InventoryWallet

}

async function allocateSpecialProducts(order, session) {
  // allocate special (non-GWP) from main to customer warehouse (used on final approval)
  const customerWarehouse = order.warehouse;

  const specialProductIds = order.items
    .filter(i => i.itemType === 'SpecialProduct')
    .map(i => i.product._id ? i.product._id : i.product);

  if (specialProductIds.length === 0) return;

  const specialProducts = await SpecialProduct.find({ _id: { $in: specialProductIds } }).session(session);
  const productMap = specialProducts.reduce((m, p) => { m[p._id.toString()] = p; return m; }, {});

  const nonGwpSpecialItems = order.items.filter(item =>
    item.itemType === 'SpecialProduct' &&
    productMap[item.product._id?.toString() || item.product.toString()]?.type !== 'GWP'
  );

  if (nonGwpSpecialItems.length === 0) return;

  for (const item of nonGwpSpecialItems) {
    // ensure main inventory has enough
    const mainInventory = await Inventory.findOne({ product: item.product._id || item.product, warehouse: mainWarehouseId }).session(session);
    if (!mainInventory || mainInventory.quantity < item.quantity) {
      throw new Error(`Insufficient quantity for special product ${item.product.name || item.product} in main warehouse`);
    }

    // const updatedMainInventory = await Inventory.findOneAndUpdate(
    //   { product: item.product._id || item.product, warehouse: mainWarehouseId },
    //   { $inc: { quantity: -item.quantity } },
    //   { new: true, session }
    // );

    if (updatedMainInventory && updatedMainInventory.quantity <= updatedMainInventory.stockAlertThreshold) {
      await AdminNotification.create([{
        user: '66c5bc4b3c1526016eeac109',
        type: 'LOW_STOCK',
        content: `Low stock alert for ${item.product.name || item.product} in main warehouse - Current quantity: ${updatedMainInventory.quantity}`,
        resourceId: updatedMainInventory._id,
        resourceModel: 'Inventory',
        priority: 'high'
      }], { session });
    }

    // Add to customer's warehouse inventory (upsert)
    const updatedCustomerInventory = await Inventory.findOneAndUpdate(
      { product: item.product._id || item.product, warehouse: customerWarehouse._id },
      {
        $inc: { quantity: item.quantity },
        $setOnInsert: {
          productType: 'SpecialProduct',
          city: order.city?._id || order.city || '67400e8a7b963a1282d218b5',
          stockAlertThreshold: 5,
          lastRestocked: new Date()
        }
      },
      { upsert: true, new: true, session }
    );
      // console.log('Updated Customer Inventory:', updatedCustomerInventory);

    // add inventory ref to special product
    await SpecialProduct.findByIdAndUpdate(
      item.product._id || item.product,
      { $addToSet: { inventory: updatedCustomerInventory._id } },
      { new: true, session }
    );

    if (updatedCustomerInventory.quantity <= updatedCustomerInventory.stockAlertThreshold) {
      await AdminNotification.create([{
        user: '66c5bc4b3c1526016eeac109',
        type: 'LOW_STOCK',
        content: `Low stock alert for ${item.product.name || item.product} in ${customerWarehouse.name} warehouse - Current quantity: ${updatedCustomerInventory.quantity}`,
        resourceId: updatedCustomerInventory._id,
        resourceModel: 'Inventory',
        priority: 'high'
      }], { session });
    }
  }
}

async function handleOrderRejection(order, session) {
  // rollback / refund logic (run on DISAPPROVE by any role)
 
  const customerWarehouse = order.warehouse

if (!customerWarehouse || !customerWarehouse._id) {
    throw new Error("Customer warehouse not found");
}
  // Build productMap for specials
  const specialProductIds = order.items
    .filter(i => i.itemType === 'SpecialProduct')
    .map(i => i.product._id ? i.product._id : i.product);

  const specialProducts = await SpecialProduct.find({ _id: { $in: specialProductIds } }).session(session);
  const productMap = specialProducts.reduce((m, p) => { m[p._id.toString()] = p; return m; }, {});

  // 1) Non-GWP Special Products => SuppliesWallet refund + inventory restore
  const nonGwpSpecialItems = order.items.filter(item =>
    item.itemType === 'SpecialProduct' &&
    productMap[item.product._id?.toString() || item.product.toString()]?.type !== 'GWP'
  );

  if (nonGwpSpecialItems.length > 0) {
    const refundAmount = nonGwpSpecialItems.reduce((t, i) => t + (i.price * i.quantity), 0);
    const suppliesWallet = await SuppliesWallet.findOne({ warehouse: customerWarehouse._id }).session(session);
    if (!suppliesWallet) throw new Error('Supplies wallet not found for customer warehouse');

    suppliesWallet.balance += refundAmount;
    await suppliesWallet.save({ session });

    for (const item of nonGwpSpecialItems) {
      await Inventory.findOneAndUpdate(
        { product: item.product._id || item.product, warehouse: mainWarehouseId },
        { $inc: { quantity: item.quantity } },
        { session }
      );

      await Inventory.findOneAndUpdate(
        { product: item.product._id || item.product, warehouse: customerWarehouse._id },
        { $inc: { quantity: -item.quantity } },
        { session }
      );
    }
  }

  // 2) GWP + Normal products => InventoryWallet refund + inventory restore
  const gwpItems = order.items.filter(item =>
    item.itemType === 'SpecialProduct' &&
    productMap[item.product._id?.toString() || item.product.toString()]?.type === 'GWP'
  );

  const normalItems = order.items.filter(i => i.itemType === 'Product');

  const inventoryWalletRefundItems = [...gwpItems, ...normalItems];

  if (inventoryWalletRefundItems.length > 0) {
    const refundAmount = inventoryWalletRefundItems.reduce((t, i) => t + (i.price * i.quantity), 0);
    const inventoryWallet = await InventoryWallet.findOne({ warehouse: customerWarehouse._id }).session(session);
    if (!inventoryWallet) throw new Error('Inventory wallet not found for customer warehouse');

    inventoryWallet.balance += refundAmount;
    await inventoryWallet.save({ session });

    for (const item of inventoryWalletRefundItems) {
      await Inventory.findOneAndUpdate(
        { product: item.product._id || item.product, warehouse: mainWarehouseId },
        { $inc: { quantity: item.quantity } },
        { session }
      );

      await Inventory.findOneAndUpdate(
        { product: item.product._id || item.product, warehouse: customerWarehouse._id },
        { $inc: { quantity: -item.quantity } },
        { session }
      );
    }
  }
}

const approveOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let { orderStatus, paymentStatus, shippingStatus } = req.body; 
    const { id } = req.params;
    const { action, remarks } = req.body; // "APPROVE" or "DISAPPROVE"
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(401).json({ success: false, message: "User ID not found in request" });
    }

    // fetch order + relations (do not populate DM/CM, we only need warehouse/customer)
    const order = await Order.findById(id)
      .populate('warehouse customer createdBy')
      .populate({
        path: 'items.product',
        refPath: 'items.itemType'
      }).session(session);
  
    if (order.isFinalized && !(shippingStatus || paymentStatus)) {
       throw new Error("Order finalized, approval not allowed");
      }
    if (!order) throw new Error("Order not found");
    if (!order.warehouse) throw new Error("Warehouse not found on order");
    

     if (!shippingStatus) {
    shippingStatus = "Pending";
    }

    const allowedShippingStatuses = [
    "Pending",
    "Shipped",
    "OnTheWay",
    "Delivered",
    "Returned"
    ];

    if (!allowedShippingStatuses.includes(shippingStatus)) {
    return res.status(400).json({
        message: `Invalid shipping status: ${shippingStatus}`
    });
    }
    if (shippingStatus){
      order.shippingStatus = shippingStatus;
    }



    // get role of current user (check Customer then User)
    let user = await Customer.findById(userId).populate('role').session(session);
    let actorModel = "Customer";
    if (!user) {
      
      user = await User.findById(userId).populate('role').session(session)
      actorModel = "User";
    };
    const roleName = user?.role?.role_name?.toLowerCase()  || 'user';
    
    if (action === 'APPROVE' || action === 'DISAPPROVE') {
  // Only push to approvalHistory for actual approvals
    order.approvalHistory.push({
    role: roleName,
    approvedBy: userId,
    status: action === 'APPROVE' ? 'APPROVED' : 'DISAPPROVED',
    remarks: remarks || '',
    date: new Date()
    });

    await ActivityLogModel.create([{
    action,
    actor: userId,
    actorModel,
    role: roleName,
    order: order._id,
    remarks
    }], { session });
    } else if (shippingStatus || paymentStatus) {
    // Just update status, no approvalHistory push
    if (shippingStatus) order.shippingStatus = shippingStatus;
    if (paymentStatus) order.paymentStatus = paymentStatus;

    // Optional: log this update in ActivityLog
    await ActivityLogModel.create([{
    action: 'UPDATE_STATUS',
    actor: userId,
    actorModel,
    role: roleName,
    order: order._id,
    remarks: `Shipping/Payment status updated`
    }], { session });
    }

    // DISAPPROVAL flow
    if (action === 'DISAPPROVE') {
      order.approvalStatus = 'DISAPPROVED';
      order.orderStatus = 'Cancelled';
      order.approvedBy = userId;
      order.isFinalized = true;

      // Notify customer
      if (order.customer) {
        await new Notification({
          user: order.customer._id,
          type: 'ORDER',
          content: `Your order #${order.orderId} was rejected by ${roleName}.`,
          resourceId: order._id,
          resourceModel: 'Order'
        }).save({ session });
      }
      if (order.warehouse?.districtManager) {
       await new Notification({
        user: order.warehouse.districtManager,
        type: 'ORDER',
        content: `Order #${order.orderId} was disapproved by ${roleName}.`,
        resourceId: order._id,
        resourceModel: 'Order'
        }).save({ session });
        }
        if (order.warehouse?.corporateManager) {
        await new Notification({
        user: order.warehouse.corporateManager,
        type: 'ORDER',
        content: `Order #${order.orderId} was disapproved by ${roleName}.`,
        resourceId: order._id,
        resourceModel: 'Order'
        }).save({ session });
      }

      // perform refunds + inventory restore (transactional)
      await handleOrderRejection(order, session);
    
      await order.save({ session });
      await session.commitTransaction();
      session.endSession();

      return res.status(200).json({ message: `Order disapproved by ${roleName}`, order });
    }

    // APPROVAL flow
    if (roleName === 'district manager') {
      order.approvalStatus = 'PENDING';
      order.approvedBy = userId;

      // notify CM or admin
      const cmId = order.warehouse.corporateManager;
      if (cmId) {
        await new Notification({
          user: cmId,
          type: 'ORDER',
          content: `Order #${order.orderId} approved by District Manager. Awaiting your approval.`,
          resourceId: order._id,
          resourceModel: 'Order',
          priority: 'high'
        }).save({ session });
      } else {
        const admin = await User.findOne({ "role.role_name": "Super User" }).select('_id').session(session);
        if (admin) {
          await new AdminNotification({
            user: admin._id,
            type: 'ORDER',
            content: `Order #${order.orderId} approved by District Manager (no CM assigned). Awaiting your approval.`,
            resourceId: order._id,
            resourceModel: 'Order',
            priority: 'high'
          }).save({ session });
        }
      }
    } else if (roleName === 'corporate manager') {
      // ensure DM approved first
      const dmApproved = order.approvalHistory.some(h => h.role === 'district manager' && h.status === 'APPROVED');
      if (!dmApproved) throw new Error("District Manager must approve before Corporate Manager");

      order.approvalStatus = 'PENDING';
      order.approvedBy = userId;

      // notify admin
      const admin = await User.findOne({ "role.role_name": "Super User" }).select('_id').session(session);
      if (admin) {
        await new AdminNotification({
          user: admin._id,
          type: 'ORDER',
          content: `Order #${order.orderId} approved by Corporate Manager. Awaiting your approval.`,
          resourceId: order._id,
          resourceModel: 'Order',
          priority: 'high'
        }).save({ session });
      }
    } else if (roleName === 'super user') {
      // final approval checks
         order.isFinalized = true;

      const dmApproved = order.approvalHistory.some(h => h.role === 'district manager' && h.status === 'APPROVED');
      const cmApproved = order.approvalHistory.some(h => h.role === 'corporate manager' && h.status === 'APPROVED');

      if (order.warehouse.districtManager && !dmApproved) {
        throw new Error("District Manager must approve before Admin approval");
      }
      if (order.warehouse.corporateManager && !cmApproved) {
        throw new Error("Corporate Manager must approve before Admin approval");
      }

      // final approve -> allocate inventory for special products (like old controller)
      order.approvalStatus = 'APPROVED';
      order.orderStatus = 'Processing';
      order.approvedBy = userId;

      
      await allocateProducts(order, session);
      
      await allocateSpecialProducts(order, session);

       
      
      
      // const mainWallet = await SuppliesWallet.findOne({ warehouse: mainWarehouseId }).session(session);
      // if (!mainWallet) {
      // throw new Error("Main warehouse wallet not found");
      // }
      // const specialAmount = order.items
      // .filter(i => i.itemType === 'SpecialProduct')
      // .reduce((sum, item) => sum + (item.price * item.quantity), 0);

      // mainWallet.balance += specialAmount;
      // await mainWallet.save({ session });




      // notify customer of final approval
      if (order.customer) {
        await new Notification({
          user: order.customer._id,
          type: 'ORDER',
          content: `Your order #${order.orderId} has been approved and is now processing.`,
          resourceId: order._id,
          resourceModel: 'Order'
        }).save({ session });
      }
    } else {
      throw new Error(`Approval by role '${roleName}' is not authorized`);
    }

    await order.save({ session });
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: `Order ${action === 'APPROVE' ? 'approved' : 'disapproved'} by ${roleName}`,
      order
    });
  } catch (error) {
    // console.error("Approval error:", error);
    try { await session.abortTransaction(); } catch (e) {}
    session.endSession();
    return res.status(400).json({ message: error.message });
  }
};

// wahrehouses to warehouse transfer on order placed request 

const warehouseToWarehouseTransfer = async (req, res) => {

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
      sellerWarehouseId  
    } = req.body;
      const items = Array.isArray(req.body) ? req.body : req.body.items || [];
     if (!items || items.length === 0) throw new Error("No items to process");
    
    // --- 🟢 DYNAMIC WAREHOUSE SETUP ---
    const buyerWarehouseId  = warehouse?._id || warehouse;
 
  for (const item of items) {
  const sellerId = item.sellerWarehouseId?.toString();
  const buyerId = buyerWarehouseId?.toString();

  if (sellerId && buyerId && sellerId === buyerId) {
    throw new Error(
      `You cannot order product "${item?.item?.name}" from the same warehouse you belong to.`
    );
  }
  }
  

    // if (!sellerWarehouseId)
    //   throw new Error("Seller warehouse is missing");
    

    // buyer info
    const customer = await Customer.findById(req.user.id).populate("warehouse");
    if (!customer) throw new Error("Customer not found");

    // cart
    const cart = await Cart.findById(cartId).populate("items.item");
    if (!cart) throw new Error("Cart not found");

    // validate buyer warehouse
    const buyerWarehouse = await Warehouse.findById(buyerWarehouseId);
    if (!buyerWarehouse) throw new Error("Buyer warehouse not found");

    // --- Totals
    const totals = await calculateOrderTotalsHelper(items, couponCode);

    // --- Create Base Order ---
    const order = new Order({
      orderId: generateOrderNumber(),
      customer: customer._id,
      warehouse: buyerWarehouseId,      
      // sellerWarehouseId,
      createdBy: req.user.id,
      approvalStatus: "PENDING",

      items: items.map((item) => ({
        itemType: item.itemType,
        product: item.item._id,
        quantity: item.quantity,
        price: item.price,
        color: item.color ?? null,
        sellerWarehouseId: item?.sellerWarehouseId,
        isMain: item.isMain
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

    // PRODUCT GROUPING
    const normalProducts = items.filter(i => i.itemType === "Product");
    const specialProducts = items.filter(i => i.itemType === "SpecialProduct");

    let productMap = {};
    if (specialProducts.length > 0) {
      const populatedSpecial = await SpecialProduct.find({
        _id: { $in: specialProducts.map(i => i.item._id) }
      });

      productMap = populatedSpecial.reduce((map, p) => {
        map[p._id.toString()] = p;
        return map;
      }, {});
    }

    const gwpProducts = specialProducts.filter(
      i => productMap[i.item._id.toString()]?.type === "GWP"
    );
    const otherSpecialProducts = specialProducts.filter(
      i => productMap[i.item._id.toString()]?.type !== "GWP"
    );

    const normalTotal = normalProducts.reduce((s, i) => s + i.price * i.quantity, 0);
    const gwpTotal = gwpProducts.reduce((s, i) => s + i.price * i.quantity, 0);
    const otherSpecialTotal = otherSpecialProducts.reduce((s, i) => s + i.price * i.quantity, 0);

    // --------------------------------------
    // 🟥 STOCK DEDUCT → from sellerWarehouse
    // --------------------------------------
    for (const item of [...normalProducts, ...gwpProducts, ...otherSpecialProducts]) {
      const sellerWarehouseId = item.sellerWarehouseId;
      if (!sellerWarehouseId) {
      throw new Error("Missing sellerWarehouseId for item");
      }
      const inv = await Inventory.findOne({
        product: item.item._id,
        warehouse: sellerWarehouseId
      });

      if (!inv || inv.quantity < item.quantity) {
        throw new Error(
          `Insufficient stock for product ${item.item.name} in warehouse ${sellerWarehouseId}`
        );
      }

      // deduct stock
      const updatedInv = await Inventory.findOneAndUpdate(
        { product: item.item._id, warehouse: sellerWarehouseId},
        { $inc: { quantity: -item.quantity } },
        { new: true, session }
      );

      if (updatedInv.quantity <= updatedInv.stockAlertThreshold) {
        await AdminNotification.create(
          [{
            user: "66c5bc4b3c1526016eeac109",
            type: "LOW_STOCK",
            content: `Low stock alert for ${item.item.name} in warehouse ${sellerWarehouseId}`,
            resourceId: updatedInv._id,
            resourceModel: "Inventory",
            priority: "high",
          }],
          { session }
        );
      }
    }

    // --------------------------------------
    // 🟧 WALLET DEDUCTION → buyer warehouse
    // --------------------------------------
    const inventoryWalletTotal = normalTotal + gwpTotal;

    if (inventoryWalletTotal > 0) {
      const inventoryWallet = await InventoryWallet.findOne({ warehouse: buyerWarehouseId });

      if (!inventoryWallet || inventoryWallet.balance < inventoryWalletTotal) {
        throw new Error("Insufficient inventory wallet balance");
      }

      inventoryWallet.balance -= inventoryWalletTotal;
      await inventoryWallet.save({ session });
    }

    if (otherSpecialTotal > 0) {
      const suppliesWallet = await SuppliesWallet.findOne({ warehouse: buyerWarehouseId });

      if (!suppliesWallet || suppliesWallet.balance < otherSpecialTotal) {
        throw new Error("Insufficient supplies wallet balance");
      }

      suppliesWallet.balance -= otherSpecialTotal;
      await suppliesWallet.save({ session });
    }

    // ORDER STATUS
    order.orderStatus = "Pending";
    order.paymentStatus = "Pending";
    await order.save({ session });

    // NEXT APPROVER LOGIC (same as your logic)
    let nextApprover = null;
    const notifications = [];

    if (buyerWarehouse.districtManager) {
      nextApprover = buyerWarehouse.districtManager;
      notifications.push(
        new Notification({
          user: nextApprover,
          type: "ORDER",
          content: `Order #${order.orderId} awaiting District Manager approval.`,
          resourceId: order._id,
          resourceModel: "Order",
          priority: "high",
        })
      );
    } else if (buyerWarehouse.corporateManager) {
      nextApprover = buyerWarehouse.corporateManager;
      notifications.push(
        new Notification({
          user: nextApprover,
          type: "ORDER",
          content: `Order #${order.orderId} awaiting Corporate Manager approval.`,
          resourceId: order._id,
          resourceModel: "Order",
          priority: "high",
        })
      );
    } else {
      nextApprover = "66c5bc4b3c1526016eeac109";
      notifications.push(
        new AdminNotification({
          user: nextApprover,
          type: "ORDER",
          content: `Order #${order.orderId} requires Admin approval.`,
          resourceId: order._id,
          resourceModel: "Order",
          priority: "high",
        })
      );
    }

    await Promise.all(notifications.map(n => n.save({ session })));

    // CUSTOMER NOTIFICATION
    await new Notification({
      user: customer._id,
      content: `Your order #${order.orderId} is submitted for approval.`,
      url: `/orders/${order._id}`
    }).save({ session });

    const customerOrderEmail = (order) => `
    <table width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial, sans-serif; background:#f7f7f7; padding:20px;">
    <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:white; border-radius:8px; padding:20px;">
        <tr>
          <td style="text-align:center; padding-bottom:20px;">
            <h2 style="color:#333; margin:0;">Order Submitted Successfully</h2>
            <p style="color:#666; margin:0;">Thank you for your purchase!</p>
          </td>
        </tr>
        
        <tr>
          <td>
            <p style="color:#333; font-size:15px;">
              Hello <strong>${order?.customerName}</strong>,
            </p>
            <p style="color:#555;">
              Your order <strong>#${order?.orderId}</strong> has been submitted and is now 
              <strong>pending approval</strong>.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:15px; background:#fafafa; border-radius:6px;">
            <h3 style="margin:0 0 10px 0; color:#333;">Order Summary</h3>
            <p style="margin:0; color:#555;">
              <strong>Total Items:</strong> ${order?.items?.length} <br>
              <strong>Amount:</strong> PKR ${order?.totalAmount} <br>
              <strong>Warehouse:</strong> ${order?.warehouseName}
            </p>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:25px 0;">
            <a href="https://vallianimarketplace.com/en/profile-details?option=My%20Order" 
               style="padding:12px 22px; background:#4f46e5; color:white; 
               text-decoration:none; border-radius:6px;">
               View Order
            </a>
          </td>
        </tr>

        <tr>
          <td style="color:#999; font-size:12px; text-align:center;">
            This is an automated message — please do not reply.
          </td>
        </tr>
      </table>
    </td>
  </tr>
    </table>
    `;


  const adminOrderEmail = (order, nextApproverName) => `
    <table width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial, sans-serif; background:#f7f7f7; padding:20px;">
    <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:white; border-radius:8px; padding:20px;">
        <tr>
          <td style="text-align:center; padding-bottom:20px;">
            <h2 style="color:#333; margin:0;">New Order Requires Approval</h2>
            <p style="color:#666; margin:0;">Order #${order?.orderId}</p>
          </td>
        </tr>
        
        <tr>
          <td>
            <p style="color:#333; font-size:15px;">
              Hello <strong>Sir</strong>,
            </p>
            <p style="color:#555;">
              A new order has been submitted and is waiting for your approval.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:15px; background:#fafafa; border-radius:6px;">
            <h3 style="margin:0 0 10px 0; color:#333;">Order Details</h3>
            <p style="margin:0; color:#555;">
              <strong>Order ID:</strong> ${order?.orderId} <br>
              <strong>Customer:</strong> ${order?.customerName} <br>
              <strong>Total Items:</strong> ${order?.items.length} <br>
              <strong>Amount:</strong> PKR ${order?.totalAmount} <br>
              <strong>Warehouse:</strong> ${order?.warehouseName}<br>
              <strong>next Approver:</strong> ${nextApproverName}
            </p>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:25px 0;">
            <a href="https://portal.vallianimarketplace.com/#/orders/requested-orders" 
               style="padding:12px 22px; background:#16a34a; color:white; 
               text-decoration:none; border-radius:6px;">
               Review & Approve Order
            </a>
          </td>
        </tr>

        <tr>
          <td style="color:#999; font-size:12px; text-align:center;">
            This is an automated message — please do not reply.
          </td>
        </tr>
      </table>
    </td>
  </tr>
  </table>
  `;


   if (customer) {
  const mailOptions = {
    to: customer?.email,
    subject: `Order #${order?.orderId} Submitted`,
    html: customerOrderEmail({
      customerName: customer?.username,
      orderId: order?.orderId,
      items: order?.items,
      totalAmount: order?.grandTotal,
      warehouseName: buyerWarehouse?.name,
      warehouse: buyerWarehouse,
      _id: order?._id
    })
  };
  await sendEmail(mailOptions);
}
const mailOptionsAdmin = {
  to: nextApprover?.email || "developer@arrakconsulting.com",
  subject: `Order #${order?.orderId} Requires Approval`,
  html: adminOrderEmail({
      customerName: customer?.username,
      orderId: order?.orderId,
      items: order?.items,
      totalAmount: order?.grandTotal,
      warehouseName: buyerWarehouse?.name,
      _id: order?._id
    },
    nextApprover?.username || "Admin"
  )
};

await sendEmail(mailOptionsAdmin);


    // CLEAR CART
    cart.items = [];
    cart.total = 0;
    await cart.save({ session });

    await session.commitTransaction();

    res.status(201).json({
      message: "Requested Order placed successfully and awaiting approval",
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

// Special Products Checkout - Direct Admin Request (No Warehouse Stock Check)
// For supplies products that will be ordered from external platforms (Amazon, eBay, etc.)
const specialProductCheckout = async (req, res) => {
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

    const items = Array.isArray(req.body) ? req.body : req.body.items || [];
    if (!items || items.length === 0) throw new Error("No items to process");

    // Validate all items are SpecialProducts
    const nonSpecialProducts = items.filter(item => item.itemType !== 'SpecialProduct');
    if (nonSpecialProducts.length > 0) {
      throw new Error("This checkout is only for Special Products (Supplies). Please use regular checkout for other products.");
    }

    // Buyer info
    const customer = await Customer.findById(req.user.id).populate("warehouse");
    if (!customer) throw new Error("Customer not found");

    // Cart
    const cart = await Cart.findById(cartId).populate("items.item");
    if (!cart) throw new Error("Cart not found");

    // Validate buyer warehouse
    const buyerWarehouseId = warehouse?._id || warehouse;
    const buyerWarehouse = await Warehouse.findById(buyerWarehouseId);
    if (!buyerWarehouse) throw new Error("Buyer warehouse not found");

    // Calculate totals
    const totals = await calculateOrderTotalsHelper(items, couponCode);

    // Create Order for Admin Approval
    const order = new Order({
      orderId: generateOrderNumber(),
      customer: customer._id,
      warehouse: buyerWarehouseId,
      createdBy: req.user.id,
      approvalStatus: "PENDING",
      // Mark in specialInstructions that this is a special product order
      specialInstructions: (specialInstructions || "") + " [SPECIAL_PRODUCT_ORDER - To be fulfilled from external platforms: Amazon, eBay, etc.]",

      items: items.map((item) => ({
        itemType: item.itemType,
        product: item.item._id,
        quantity: item.quantity,
        price: item.price,
        color: item.color ?? null,
        // No sellerWarehouseId for special products - will be ordered externally
        isMain: false
      })),

      shippingMethod: shippingMethodId || null,
      city: cityId || null,
      subtotal: totals.subtotal,
      shippingCost: 0, // No shipping cost for special products (external fulfillment)
      grandTotal: totals.grandTotal,
      couponUsed: couponCode || null,
      paymentMethod: paymentMethod || "pending",
      paymentStatus: "Pending",
      orderStatus: "Pending",
    });

    // No stock deduction - these products are ordered externally
    // No wallet deduction - payment handled externally

    // Save order
    await order.save({ session });

    // Create Admin Notification for Approval
    const adminNotification = new AdminNotification({
      user: "66c5bc4b3c1526016eeac109", // Admin user ID
      type: "ORDER",
      content: `New Special Product Order #${order.orderId} from ${customer.username || customer.email}. Total: $${order.grandTotal}. These products will be ordered from external platforms (Amazon, eBay, etc.).`,
      resourceId: order._id,
      resourceModel: "Order",
      priority: "high",
    });

    await adminNotification.save({ session });

    // Customer Notification
    await new Notification({
      user: customer._id,
      content: `Your special product order #${order.orderId} has been submitted and is awaiting admin approval.`,
      url: `/orders/${order._id}`,
      type: "ORDER"
    }).save({ session });

    // Email Templates
    const customerOrderEmail = (order) => `
    <table width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial, sans-serif; background:#f7f7f7; padding:20px;">
    <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:white; border-radius:8px; padding:20px;">
        <tr>
          <td style="text-align:center; padding-bottom:20px;">
            <h2 style="color:#333; margin:0;">Special Product Order Submitted</h2>
            <p style="color:#666; margin:0;">Thank you for your order!</p>
          </td>
        </tr>
        
        <tr>
          <td>
            <p style="color:#333; font-size:15px;">
              Hello <strong>${order?.customerName}</strong>,
            </p>
            <p style="color:#555;">
              Your special product order <strong>#${order?.orderId}</strong> has been submitted and is now 
              <strong>pending admin approval</strong>. These products will be ordered from external platforms.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:15px; background:#fafafa; border-radius:6px;">
            <h3 style="margin:0 0 10px 0; color:#333;">Order Summary</h3>
            <p style="margin:0; color:#555;">
              <strong>Total Items:</strong> ${order?.items?.length} <br>
              <strong>Amount:</strong> $${order?.totalAmount} <br>
              <strong>Warehouse:</strong> ${order?.warehouseName}
            </p>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:25px 0;">
            <a href="https://vallianimarketplace.com/en/profile-details?option=My%20Order" 
               style="padding:12px 22px; background:#4f46e5; color:white; 
               text-decoration:none; border-radius:6px;">
               View Order
            </a>
          </td>
        </tr>

        <tr>
          <td style="color:#999; font-size:12px; text-align:center;">
            This is an automated message — please do not reply.
          </td>
        </tr>
      </table>
    </td>
  </tr>
    </table>
    `;

    const adminOrderEmail = (order) => `
    <table width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial, sans-serif; background:#f7f7f7; padding:20px;">
    <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:white; border-radius:8px; padding:20px;">
        <tr>
          <td style="text-align:center; padding-bottom:20px;">
            <h2 style="color:#333; margin:0;">New Special Product Order Requires Approval</h2>
            <p style="color:#666; margin:0;">Order #${order?.orderId}</p>
          </td>
        </tr>
        
        <tr>
          <td>
            <p style="color:#333; font-size:15px;">
              Hello <strong>Admin</strong>,
            </p>
            <p style="color:#555;">
              A new special product order has been submitted. These products need to be ordered from external platforms (Amazon, eBay, etc.).
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:15px; background:#fafafa; border-radius:6px;">
            <h3 style="margin:0 0 10px 0; color:#333;">Order Details</h3>
            <p style="margin:0; color:#555;">
              <strong>Order ID:</strong> ${order?.orderId} <br>
              <strong>Customer:</strong> ${order?.customerName} <br>
              <strong>Total Items:</strong> ${order?.items.length} <br>
              <strong>Amount:</strong> $${order?.totalAmount} <br>
              <strong>Warehouse:</strong> ${order?.warehouseName}
            </p>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:25px 0;">
            <a href="https://portal.vallianimarketplace.com/#/orders/requested-orders" 
               style="padding:12px 22px; background:#16a34a; color:white; 
               text-decoration:none; border-radius:6px;">
               Review & Approve Order
            </a>
          </td>
        </tr>

        <tr>
          <td style="color:#999; font-size:12px; text-align:center;">
            This is an automated message — please do not reply.
          </td>
        </tr>
      </table>
    </td>
  </tr>
  </table>
  `;

    // Send Customer Email
    if (customer?.email) {
      const mailOptions = {
        to: customer.email,
        subject: `Special Product Order #${order.orderId} Submitted`,
        html: customerOrderEmail({
          customerName: customer?.username || customer?.email,
          orderId: order.orderId,
          items: order.items,
          totalAmount: order.grandTotal,
          warehouseName: buyerWarehouse?.name,
          _id: order._id
        })
      };
      await sendEmail(mailOptions);
    }

    // Send Admin Email
    const mailOptionsAdmin = {
      to: "developer@arrakconsulting.com",
      subject: `Special Product Order #${order.orderId} Requires Approval`,
      html: adminOrderEmail({
        customerName: customer?.username || customer?.email,
        orderId: order.orderId,
        items: order.items,
        totalAmount: order.grandTotal,
        warehouseName: buyerWarehouse?.name,
        _id: order._id
      })
    };
    await sendEmail(mailOptionsAdmin);

    // Clear Cart
    cart.items = [];
    cart.total = 0;
    await cart.save({ session });

    await session.commitTransaction();

    res.status(201).json({
      message: "Special product order placed successfully and awaiting admin approval",
      order,
      note: "This order will be fulfilled from external platforms (Amazon, eBay, etc.)"
    });

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

async function handleOrderRejectionNormal(order, session) {
  const customerWarehouse = order.warehouse;
  if (!customerWarehouse || !customerWarehouse._id) {
    throw new Error("Customer warehouse not found");
  }

  // Build productMap for specials
  const specialProductIds = order.items
    .filter(i => i.itemType === 'SpecialProduct')
    .map(i => i.product._id ? i.product._id : i.product);

  const specialProducts = await SpecialProduct.find({ _id: { $in: specialProductIds } }).session(session);
  const productMap = specialProducts.reduce((m, p) => { m[p._id.toString()] = p; return m; }, {});

  // --- 1) Non-GWP Special Products => SuppliesWallet refund + inventory restore ---
  const nonGwpSpecialItems = order.items.filter(item =>
    item.itemType === 'SpecialProduct' &&
    productMap[item.product._id?.toString() || item.product.toString()]?.type !== 'GWP'
  );

  if (nonGwpSpecialItems.length > 0) {
    const refundAmount = nonGwpSpecialItems.reduce((t, i) => t + (i.price * i.quantity), 0);
    const suppliesWallet = await SuppliesWallet.findOne({ warehouse: customerWarehouse._id }).session(session);
    if (!suppliesWallet) throw new Error('Supplies wallet not found for customer warehouse');
    suppliesWallet.balance += refundAmount;
    await suppliesWallet.save({ session });

    for (const item of nonGwpSpecialItems) {
      const sellerWarehouse = item.sellerWarehouseId;
      if (!sellerWarehouse) throw new Error(`Seller warehouse missing for special product ${item.product._id || item.product}`);

      // Restore inventory to sellerWarehouse
      await Inventory.findOneAndUpdate(
        { product: item.product._id || item.product, warehouse: sellerWarehouse },
        { $inc: { quantity: item.quantity } },
        { session }
      );

      // Deduct inventory from customerWarehouse
      await Inventory.findOneAndUpdate(
        { product: item.product._id || item.product, warehouse: customerWarehouse._id },
        { $inc: { quantity: -item.quantity } },
        { session }
      );
    }
  }

  // --- 2) GWP + Normal products => InventoryWallet refund + inventory restore ---
  const gwpItems = order.items.filter(item =>
    item.itemType === 'SpecialProduct' &&
    productMap[item.product._id?.toString() || item.product.toString()]?.type === 'GWP'
  );

  const normalItems = order.items.filter(i => i.itemType === 'Product');
  const inventoryWalletRefundItems = [...gwpItems, ...normalItems];

  if (inventoryWalletRefundItems.length > 0) {
    const refundAmount = inventoryWalletRefundItems.reduce((t, i) => t + (i.price * i.quantity), 0);
    const inventoryWallet = await InventoryWallet.findOne({ warehouse: customerWarehouse._id }).session(session);
    if (!inventoryWallet) throw new Error('Inventory wallet not found for customer warehouse');
    inventoryWallet.balance += refundAmount;
    await inventoryWallet.save({ session });

    for (const item of inventoryWalletRefundItems) {
      const sellerWarehouse = item.itemType === 'Product' ? item.sellerWarehouseId : item.sellerWarehouseId;
      if (!sellerWarehouse) throw new Error(`Seller warehouse missing for product ${item.product._id || item.product}`);

      // Restore inventory to sellerWarehouse
      await Inventory.findOneAndUpdate(
        { product: item.product._id || item.product, warehouse: sellerWarehouse },
        { $inc: { quantity: item.quantity } },
        { session }
      );

      // Deduct inventory from customerWarehouse
      await Inventory.findOneAndUpdate(
        { product: item.product._id || item.product, warehouse: customerWarehouse._id },
        { $inc: { quantity: -item.quantity } },
        { session }
      );
    }
  }
}

async function allocateProductsNormal(order, mainWarehouseId, session) {
  const customerWarehouse = order.warehouse;
  if (!customerWarehouse || !customerWarehouse._id) 
    throw new Error("Customer warehouse missing");

  const productItems = order.items.filter(i => i.itemType === 'Product');
  if (productItems.length === 0) return;

  for (const item of productItems) {
    const sellerWarehouse = item.sellerWarehouseId; // <-- use item level sellerWarehouse
    if (!sellerWarehouse) throw new Error(`Seller warehouse missing for product ${item.product.name || item.product._id}`);

    // Check main sellerwarehouse inventory
    const mainInventory = await Inventory.findOne({ product: item.product._id || item.product, warehouse: sellerWarehouse }).session(session);
    if (!mainInventory || mainInventory.quantity < item.quantity) {
      throw new Error(`Insufficient quantity for product ${item.product.name || item.product} in this warehouse`);
    }

    // Deduct from seller warehouse warehouse
    // await Inventory.findOneAndUpdate(
    //   { product: item.product._id || item.product, warehouse: sellerWarehouse },
    //   { $inc: { quantity: -item.quantity } },
    //   { new: true, session }
    // );

    // Add to customer warehouse (upsert)
    const updatedCustomerInventory = await Inventory.findOneAndUpdate(
      { product: item.product._id || item.product, warehouse: customerWarehouse._id },
      {
        $inc: { quantity: item.quantity },
        $setOnInsert: {
          productType: 'Product',
          city: order.city?._id || order.city || null,
          stockAlertThreshold: 1,
          lastRestocked: new Date()

        }
      },
      { upsert: true, new: true, session }
    );

    // Add inventory reference to Product
    await Product.findByIdAndUpdate(
      item.product._id || item.product,
      { $addToSet: { inventory: updatedCustomerInventory._id } },
      { new: true, session }
    );

    
    const totalAmount = item.price * item.quantity;
    if (totalAmount > 0) {
      const inventoryWallet = await InventoryWallet.findOne({ warehouse: sellerWarehouse }).session(session);
      if (!inventoryWallet) throw new Error("inventory wallet not found for this warehouse");
      inventoryWallet.balance += totalAmount;
      await inventoryWallet.save({ session });
    }
  }
}

async function allocateSpecialProductsNormal(order, mainWarehouseId, session) {
  const customerWarehouse = order.warehouse;
  if (!customerWarehouse || !customerWarehouse._id) 
    throw new Error("Customer warehouse missing");

  const specialProductIds = order.items
    .filter(i => i.itemType === 'SpecialProduct')
    .map(i => i.product._id ? i.product._id : i.product);

  if (specialProductIds.length === 0) return;

  const specialProducts = await SpecialProduct.find({ _id: { $in: specialProductIds } }).session(session);
  const productMap = specialProducts.reduce((m, p) => { m[p._id.toString()] = p; return m; }, {});

  const nonGwpSpecialItems = order.items.filter(item =>
    item.itemType === 'SpecialProduct' &&
    productMap[item.product._id?.toString() || item.product.toString()]?.type !== 'GWP'
  );

  for (const item of nonGwpSpecialItems) {
    const sellerWarehouse = item.sellerWarehouseId; 
    if (!sellerWarehouse) throw new Error(`Seller warehouse missing for special product ${item.product._id || item.product}`);

    // Check main warehouse inventory
    const mainInventory = await Inventory.findOne({ product: item.product._id || item.product, warehouse: sellerWarehouse }).session(session);
    if (!mainInventory || mainInventory.quantity < item.quantity) {
      throw new Error(`Insufficient quantity for special product ${item.product.name || item.product} in this warehouse`);
    }

    // Deduct from main sellerwarehouse
    //   await Inventory.findOneAndUpdate(
    //   { product: item.product._id || item.product, warehouse: sellerWarehouse },
    //   { $inc: { quantity: -item.quantity } },
    //   { new: true, session }
    // );

    // Add to customer's warehouse inventory (upsert)
    const updatedCustomerInventory = await Inventory.findOneAndUpdate(
      { product: item.product._id || item.product, warehouse: customerWarehouse._id },
      {
        $inc: { quantity: item.quantity },
        $setOnInsert: {
          productType: 'SpecialProduct',
          city: order.city?._id || order.city || null,
          stockAlertThreshold: 5,
          lastRestocked: new Date()
        }
      },
      { upsert: true, new: true, session }
    );

    // Add inventory reference to SpecialProduct
    await SpecialProduct.findByIdAndUpdate(
      item.product._id || item.product,
      { $addToSet: { inventory: updatedCustomerInventory._id } },
      { new: true, session }
    );

    // Low stock notification
    if (updatedCustomerInventory.quantity <= updatedCustomerInventory.stockAlertThreshold) {
      await AdminNotification.create([{
        user: '66c5bc4b3c1526016eeac109', 
        type: 'LOW_STOCK',
        content: `Low stock alert for ${item.product.name || item.product} in ${customerWarehouse.name} warehouse - Current quantity: ${updatedCustomerInventory.quantity}`,
        resourceId: updatedCustomerInventory._id,
        resourceModel: 'Inventory',
        priority: 'high'
      }], { session });
    }

    // Update inventory wallet for this sellerWarehouse
    const totalAmount = item.price * item.quantity;
    if (totalAmount > 0) {
      const inventoryWallet = await InventoryWallet.findOne({ warehouse: sellerWarehouse }).session(session);
      if (!inventoryWallet) throw new Error(`Inventory wallet not found for warehouse ${sellerWarehouse}`);
      inventoryWallet.balance += totalAmount;
      await inventoryWallet.save({ session });
    }
  }
}

const approveNormalWarehouseOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { action, remarks, shippingStatus, paymentStatus , sellerWarehouse } = req.body;
    const { id } = req.params;
    const userId = req.user?._id || req.user?.id;
    if (!userId) throw new Error("User ID not found");

    // check if user is admin (super user)
    const user = await User.findById(userId).populate('role').session(session);
    if (!user || user.role.role_name.toLowerCase() !== 'super user') {
      throw new Error("Only admin can approve normal warehouse orders");
    }

    // fetch order
    const order = await Order.findById(id)
      .populate('warehouse customer')
      .populate({ path: 'items.product', refPath: 'items.itemType' })
      .session(session);

    if (!order) throw new Error("Order not found");
    if (!order.warehouse || order.warehouse.isMain) throw new Error("Invalid warehouse for this controller");

    
      
    // dynamic main warehouse
    const mainWarehouse = await Warehouse.findOne({ isMain: true }).session(session);
    if (!mainWarehouse) throw new Error("Main warehouse not found");

    // DISAPPROVE
    if (action === 'DISAPPROVE') {
      order.approvalStatus = 'DISAPPROVED';
      order.orderStatus = 'Cancelled';
      order.approvedBy = userId;
      order.isFinalized = true;

      await handleOrderRejectionNormal(order, session, mainWarehouse._id);

      if (order.customer) {
        await new Notification({
          user: order.customer._id,
          type: 'ORDER',
          content: `Your order #${order.orderId} was rejected by Admin.`,
          resourceId: order._id,
          resourceModel: 'Order'
        }).save({ session });
      }

      
    const customerOrderEmail = (order) => `
    <table width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial, sans-serif; background:#f7f7f7; padding:20px;">
    <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:white; border-radius:8px; padding:20px;">
        <tr>
          <td style="text-align:center; padding-bottom:20px;">
            <h2 style="color:#333; margin:0;">Order rejected </h2>
            
          </td>
        </tr>
        
        <tr>
          <td>
            <p style="color:#333; font-size:15px;">
              Hello <strong>${order?.customerName}</strong>,
            </p>
            <p style="color:#555;">
              Your order <strong>#${order?.orderId}</strong> has been
              <strong>rejected</strong>.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:15px; background:#fafafa; border-radius:6px;">
            <h3 style="margin:0 0 10px 0; color:#333;">Order Summary</h3>
            <p style="margin:0; color:#555;">
              <strong>Total Items:</strong> ${order?.items?.length} <br>
              <strong>Amount:</strong> PKR ${order?.totalAmount} <br>
              <strong>Warehouse:</strong> ${order?.warehouseName}
            </p>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:25px 0;">
            <a href="https://vallianimarketplace.com/en/profile-details?option=My%20Order" 
               style="padding:12px 22px; background:#4f46e5; color:white; 
               text-decoration:none; border-radius:6px;">
               View Order
            </a>
          </td>
        </tr>

        <tr>
          <td style="color:#999; font-size:12px; text-align:center;">
            This is an automated message — please do not reply.
          </td>
        </tr>
      </table>
    </td>
  </tr>
    </table>
    `;


 

      if (order.customer) {
      const mailOptions = {
      to: order?.customer?.email,
      subject: `Order #${order?.orderId} rejected`,
      html: customerOrderEmail({
      customerName: order?.customer?.username,
      orderId: order?.orderId,
      items: order?.items,
      totalAmount: order?.grandTotal,
      warehouseName: order?.warehouse?.name,
      _id: order?._id
      })
      };
      await sendEmail(mailOptions);
      }

      await order.save({ session });
      await session.commitTransaction();
      session.endSession();
      return res.status(200).json({ message: "Order disapproved by Admin", order });
    }

    // APPROVE
    if (action === 'APPROVE') {
      order.approvalStatus = 'APPROVED';
      order.orderStatus = 'Processing';
      order.isFinalized = true;
      order.approvedBy = userId;

      await allocateProductsNormal(order, mainWarehouse._id, session);
      await allocateSpecialProductsNormal(order, mainWarehouse._id, session);

      if (order.customer) {
        await new Notification({
          user: order.customer._id,
          type: 'ORDER',
          content: `Your order #${order.orderId} has been approved by Admin.`,
          resourceId: order._id,
          resourceModel: 'Order'
        }).save({ session });
      }

         const customerOrderEmail = (order) => `
    <table width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial, sans-serif; background:#f7f7f7; padding:20px;">
    <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:white; border-radius:8px; padding:20px;">
        <tr>
          <td style="text-align:center; padding-bottom:20px;">
            <h2 style="color:#333; margin:0;">Order approved Successfully</h2>
            <p style="color:#666; margin:0;">Thank you for your purchase!</p>
          </td>
        </tr>
        
        <tr>
          <td>
            <p style="color:#333; font-size:15px;">
              Hello <strong>${order?.customerName}</strong>,
            </p>
            <p style="color:#555;">
              Your order <strong>#${order?.orderId}</strong> has been  
              <strong>approved</strong>.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:15px; background:#fafafa; border-radius:6px;">
            <h3 style="margin:0 0 10px 0; color:#333;">Order Summary</h3>
            <p style="margin:0; color:#555;">
              <strong>Total Items:</strong> ${order?.items?.length} <br>
              <strong>Amount:</strong> PKR ${order?.totalAmount} <br>
              <strong>Warehouse:</strong> ${order?.warehouseName}
            </p>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:25px 0;">
            <a href="https://vallianimarketplace.com/en/profile-details?option=My%20Order" 
               style="padding:12px 22px; background:#4f46e5; color:white; 
               text-decoration:none; border-radius:6px;">
               View Order
            </a>
          </td>
        </tr>

        <tr>
          <td style="color:#999; font-size:12px; text-align:center;">
            This is an automated message — please do not reply.
          </td>
        </tr>
      </table>
    </td>
  </tr>
    </table>
    `;


 

      if (order.customer) {
      const mailOptions = {
      to: order?.customer?.email,
      subject: `Order #${order?.orderId} rejected`,
      html: customerOrderEmail({
      customerName: order?.customer?.username,
      orderId: order?.orderId,
      items: order?.items,
      totalAmount: order?.grandTotal,
      warehouseName: order?.warehouse?.name,
      _id: order?._id
      })
      };
      await sendEmail(mailOptions);
      }

      await order.save({ session });
      await session.commitTransaction();
      session.endSession();
      return res.status(200).json({ message: "Order approved by Admin", order });
    }

    throw new Error("Invalid action");

  } catch (error) {
    // console.error("Approval error:", error);
    try { await session.abortTransaction(); } catch (e) {}
    session.endSession();
    return res.status(400).json({ message: error.message });
  }
};

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

                // console.log('Updated Special Product:', updatedSpecialProduct);
  
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

        // const customer = await Customer.findById(order.customer).populate('warehouse');
        // if (!customer || !customer.warehouse) {
        // throw new Error('Customer or customer warehouse not found');
        // }
        // console.log('Customer complete:', customer);

        const customerWarehouse = order.warehouse;       
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

const getAllOrders = async (req, res) => {
  try {
    const { isMain } = req.query;
    const isMainBool = isMain === "true";

    // Step 1: Get orders with basic populate
    const orders = await Order.find()
      .populate({
       path: "warehouse", // populate order.warehouse field
       model: "Warehouse"
      })
      .populate({
        path: "customer",
        populate: { path: "warehouse" }
      })
      .populate("shippingAddress")
      .populate("shippingMethod")
      .populate("city")
      .populate({
        path: "items.product",
        refPath: "items.itemType"
      })
      .sort({ createdAt: -1 })
      .lean();

    // Step 2: Filter orders based on actual order.warehouse
    let filteredOrders = orders;
    if (isMain !== undefined) {
      filteredOrders = orders.filter(order =>
      order.items.some(item => item.isMain === isMainBool)
  );
}

    // Step 3: Populate product variants
    const populatedOrders = await Promise.all(
      filteredOrders.map(async order => {
        const populatedItems = await Promise.all(
          order.items.map(async item => {
            if (!item.product) return item;

            if (item.itemType === "Product") {
              const product = await Product.findById(item.product._id).populate({
                path: "variants",
                populate: "variantName"
              });
              item.product = product;
            } else if (item.itemType === "SpecialProduct") {
              const product = await SpecialProduct.findById(item.product._id).populate({
                path: "productVariants",
                populate: "variantName"
              });
              item.product = product;
            }

            return item;
          })
        );

        order.items = populatedItems;
        return order;
      })
    );

    return res.status(200).json(populatedOrders);

  } catch (error) {
    return res.status(500).json({
      message: "Error fetching orders",
      error: error.message
    });
  }
};

// const getAllOrders = async (req, res) => {
//   try {
//     const orders = await Order.find()
//       .populate({
//         path:'warehouse',
//        match: { isMain: true },
//       })
//       .populate({
//         path: 'customer',
//         populate: {
//           path: 'warehouse',
//           model: 'Warehouse'
//         }
//       })
//       .populate('shippingAddress')
//       .populate('shippingMethod')
//       .populate('city')
//       .populate({
//         path: 'items.product',
//         refPath: 'items.itemType'
//       }).sort({ createdAt: -1 , updatedAt: -1})
//       .lean()
//       .exec();

//     // Now let's populate variants after getting the base data
//     const populatedOrders = await Promise.all(orders.map(async (order) => {
//       const populatedItems = await Promise.all(order.items.map(async (item) => {
//         if (item.product) {
//           if (item.itemType === 'Product') {
//             const populatedProduct = await Product.findById(item.product._id)
//               .populate({
//                 path: 'variants',
//                 populate: 'variantName'
//               });
//             item.product = populatedProduct;
//           } else if (item.itemType === 'SpecialProduct') {
//             const populatedProduct = await SpecialProduct.findById(item.product._id)
//               .populate({
//                 path: 'productVariants',
//                 populate: 'variantName'
//               });
//             item.product = populatedProduct;
//           }
//         }
//         return item;
//       }));
//       order.items = populatedItems;
//       return order;
//     }));

//     return res.status(200).json(populatedOrders);
//   } catch (error) {
//     return res.status(500).json({ message: 'Error fetching orders', error: error.message });
//   }
// };

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
      // console.error('Error updating wallet:', error);
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
      // console.error('Error retrieving wallet data:', error);
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
      // console.error('Error retrieving wallet:', error);
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
      // console.error('Error updating payment method:', error);
      res.status(500).json({ message: 'Error updating payment method.', error: error.message });
    }
  };

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

const downloadOrdersData = async (req, res) => {
  try {
    const {isMain} = req.query;
      const warehouses = await Warehouse.find({ isMain: isMain === 'true' }).select('_id');
      const warehouseIds = warehouses.map(w => w._id);
      const orders = await Order.find({
      warehouse: { $in: warehouseIds }
      })
      //  .populate({
      //   path: 'warehouse',
      //   match: {isMain: isMain === 'true' } 
      // })
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
    // console.log("🧩 req.user full object:", req.user);

    // ✅ Get userId safely
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User ID not found in request",
      });
    }
    // console.log("🧩 User ID:", userId.toString());

    // ✅ Step 1: Get Role ID from user object
    const roleId = req.user.role;
    // console.log("🧩 Role ID:", roleId?.toString());

    // ✅ Step 2: Fetch role name manually (since populate not working)
    const roleData = await UserRole.findById(roleId);
    if (!roleData) {
      return res.status(404).json({ message: "Role not found" });
    }

    const roleName = roleData.role_name;
    // console.log("✅ Role Name:", roleName);

    // ✅ Step 3: (Optional) Load user fully populated, only if needed
    let user = await Customer.findById(userId)
      .populate("role")
      .lean();
      
        if (!user) {
        user = await User.findById(userId).populate("role");
        }
      

    // console.log("✅ Populated User:", user?.role?.role_name || "Not populated");

    // ✅ Step 4: Proceed with role logic
    let query = { approvalStatus: "PENDING" };

    // 🧩 DISTRICT MANAGER LOGIC
    if (roleName === "district manager") {
      const warehouses = await Warehouse.find({ districtManager: userId }).select("_id");
      const warehouseIds = warehouses.map((w) => w._id);

      // console.log("Found warehouses for DM:", warehouseIds.length);

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

      // console.log("Found warehouses for CM:", warehouseIds.length);

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

    // console.log("✅ Final Query:", JSON.stringify(query, null, 2));

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
    // console.error("❌ Error fetching pending approvals:", error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
 
module.exports = {
    calculateOrderTotals,
    placeOrder,
    warehouseToWarehouseTransfer,
    specialProductCheckout,
    approveNormalWarehouseOrder,
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