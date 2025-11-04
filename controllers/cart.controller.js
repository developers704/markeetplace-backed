const Cart = require('../models/cart.model');
const Product = require('../models/product.model');
const Coupon = require('../models/coupon.model');
const cron = require('node-cron');
const SpecialProduct = require('../models/specialProduct.model')
const mongoose = require('mongoose')

const generateGuestSession = async (req, res) => {
  try {
      // Session is already created by express-session middleware
      res.status(200).json({ 
          sessionId: req.session.id,
          message: 'Guest session created successfully'
      });
  } catch (error) {
      res.status(400).json({ message: error.message });
  }
};

// previous controller: 
// const getOrCreateCart = async (req) => {
//   const customerId = req.user ? req.user._id : null;
//   const sessionId = req.sessionId || null; // Use the sessionId we stored in middleware
//   //console.log('Session ID:', sessionId);
//   const { city } = req.query; // Assume city comes from query params for city-specific data.

//   if (!customerId && !sessionId) {
//     throw new Error("No session or user ID available");
//   }

//   const query = customerId ? { customer: customerId } : { sessionId: sessionId };

//   let cart = await Cart.findOne(query).populate({
//     path: "items.item",
//     select: "name price image lifecycleStage category subcategory brand tags discounts dealOfTheDay variants prices inventory",
//     populate: [
//       { path: "category", select: "name" },
//       { path: "subcategory", select: "name" },
//       { path: "brand", select: "name" },
//       { path: "tags", select: "name" },
//       {
//         path: "discounts",
//         populate: {
//           path: "discountId",
//           select: "discountType value code",
//         },
//       },
//       { path: "dealOfTheDay", select: "startDateTime endDateTime discountType discountValue cities" },
//       { path: "prices.city", model: "City" },
//       { 
//         path: "inventory", // Populate inventory
//         populate: { path: "city", select: "name" }, // Populate city within inventory
//         select: "city quantity vat", // Select required inventory fields
//       },
//     ],
//   });

//   if (!cart) {
//     cart = new Cart({
//       customer: customerId || null,
//       sessionId: customerId ? null : sessionId,
//       items: [],
//       total: 0,
//     });
//     return cart;
//   }

//   // Process each item's product data to filter city-specific information
//   cart.items = await Promise.all(
//     cart.items.map(async (cartItem) => {
//       const product = cartItem.item;

//       if (product) {
//         // Filter prices based on city
//         if (product.prices && Array.isArray(product.prices)) {
//           product.prices = product.prices.filter(
//             (price) => price.city && price.city._id.toString() === city
//           );
//           if (product.prices.length > 0) {
//             product.price = product.prices[0]; // Set the first matching price
//           }
//         }

//         // Filter inventory based on city
//         if (product.inventory && Array.isArray(product.inventory)) {
//           product.inventory = product.inventory.filter(
//             (inv) => inv.city && inv.city._id.toString() === city
//           );
//           product.isOutOfStock = product.inventory.length === 0;
//         } else {
//           product.inventory = [];
//           product.isOutOfStock = true;
//         }

//         // Filter discounts based on city
//         if (product.discounts && Array.isArray(product.discounts)) {
//           product.discounts = product.discounts.filter((discount) =>
//             discount.cityIds.some((cityId) => cityId.toString() === city)
//           );
//         } else {
//           product.discounts = [];
//         }

//         // Filter deal of the day based on city
//         if (product.dealOfTheDay && Array.isArray(product.dealOfTheDay)) {
//           product.dealOfTheDay = product.dealOfTheDay.filter((deal) =>
//             deal.cities.some((dealCityId) => dealCityId.toString() === city)
//           );
//         } else {
//           product.dealOfTheDay = [];
//         }
//       }

//       return { ...cartItem.toObject(), item: product };
//     })
//   );

//   return cart;
// };


// const getOrCreateCart = async (req) => {
//   const customerId = req.user ? req.user._id : null;
//   const sessionId = req.sessionId || null;
//   const { city } = req.query;

//   if (!customerId && !sessionId) {
//     throw new Error("No session or user ID available");
//   }

//   const query = customerId ? { customer: customerId } : { sessionId: sessionId };

//   let cart = await Cart.findOne(query).populate({
//     path: "items.item",
//     refPath: 'items.itemType',
//     select: function(doc) {
//       if (doc.itemType === 'Product') {
//         return "name price image lifecycleStage category subcategory brand tags discounts dealOfTheDay variants prices inventory";
//       } else {
//         return "name type unitSize prices description image gallery sku stock specialCategory specialSubcategory isActive";
//       }
//     },
//     populate: function(doc) {
//       if (doc.itemType === 'Product') {
//         return [
//           { path: "category", select: "name" },
//           { path: "subcategory", select: "name" },
//           { path: "brand", select: "name" },
//           { path: "tags", select: "name" },
//           {
//             path: "discounts",
//             populate: {
//               path: "discountId",
//               select: "discountType value code",
//             },
//           },
//           { path: "dealOfTheDay", select: "startDateTime endDateTime discountType discountValue cities" },
//           { path: "prices.city", model: "City" },
//           { 
//             path: "inventory",
//             populate: { path: "city", select: "name" },
//             select: "city quantity vat",
//           },
//         ];
//       } else {
//         return [
//           { path: "specialCategory", select: "name type" },
//           { path: "specialSubcategory", select: "name type" },
//           { path: "prices.city", model: "City" }
//         ];
//       }
//     }
//   });

//   if (!cart) {
//     cart = new Cart({
//       customer: customerId || null,
//       sessionId: customerId ? null : sessionId,
//       items: [],
//       total: 0,
//     });
//     return cart;
//   }

//   cart.items = await Promise.all(
//     cart.items.map(async (cartItem) => {
//       const product = cartItem.item;

//       if (product) {
//         if (cartItem.itemType === 'Product') {
//           // Handle regular product
//           if (product.prices && Array.isArray(product.prices)) {
//             product.prices = product.prices.filter(
//               (price) => price.city && price.city._id.toString() === city
//             );
//             if (product.prices.length > 0) {
//               product.price = product.prices[0];
//             }
//           }

//           if (product.inventory && Array.isArray(product.inventory)) {
//             product.inventory = product.inventory.filter(
//               (inv) => inv.city && inv.city._id.toString() === city
//             );
//             product.isOutOfStock = product.inventory.length === 0;
//           }

//           if (product.discounts && Array.isArray(product.discounts)) {
//             product.discounts = product.discounts.filter((discount) =>
//               discount.cityIds.some((cityId) => cityId.toString() === city)
//             );
//           }

//           if (product.dealOfTheDay && Array.isArray(product.dealOfTheDay)) {
//             product.dealOfTheDay = product.dealOfTheDay.filter((deal) =>
//               deal.cities.some((dealCityId) => dealCityId.toString() === city)
//             );
//           }
//         } else {
//           // Handle special product
//           if (product.prices && Array.isArray(product.prices)) {
//             product.prices = product.prices.filter(
//               (price) => price.city && price.city._id.toString() === city
//             );
//             if (product.prices.length > 0) {
//               product.price = product.prices[0];
//             }
//           }
//           product.isOutOfStock = product.stock <= 0;
//         }
//       }

//       return { ...cartItem.toObject(), item: product };
//     })
//   );

//   return cart;
// };


const getOrCreateCart = async (req) => {
  let cart;
  if (req.user) {
    cart = await Cart.findOne({ customer: req.user._id });
  } else if (req.sessionID) {
    cart = await Cart.findOne({ sessionId: req.sessionID });
  }

  if (!cart) {
    cart = new Cart({
      customer: req.user ? req.user._id : null,
      sessionId: req.sessionID || null,
      items: []
    });
  }
  return cart;
};

const calculateCartTotal = (cart) => {
  cart.total = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
};




// const addToCart = async (req, res) => { 
//   try {
//     const { itemId, quantity, price, itemType } = req.body; // Accept price directly from the frontend
//     const cart = await getOrCreateCart(req);

//     // Use ObjectId.equals for a reliable comparison
//     // const cartItemIndex = cart.items.findIndex(
//     //   (item) => item.item.equals(itemId)
//     // );

//     // if (cartItemIndex > -1) {
//     //   // Item already exists, update quantity and price
//     //   cart.items[cartItemIndex].quantity += quantity; 
//     //   cart.items[cartItemIndex].price = price; 
//     // } else {
//     //   // Add new item to cart
//     //   cart.items.push({
//     //     item: itemId,
//     //     quantity,
//     //     price, 
//     //   });
//     // }

//     // await calculateCartTotal(cart); // Recalculate total
//     // await cart.save();

//     let item;
//     if (itemType === 'Product') {
//       item = await Product.findById(itemId);
//     } else {
//       item = await SpecialProduct.findById(itemId);
//     }

//     if (!item) {
//       return res.status(404).json({ message: 'Item not found' });
//     }

//     const cartItemIndex = cart.items.findIndex(
//       item => item.item.equals(itemId) && item.itemType === itemType
//     );

//     if (cartItemIndex > -1) {
//       cart.items[cartItemIndex].quantity += quantity;
//       cart.items[cartItemIndex].price = price;
//     } else {
//       cart.items.push({
//         item: itemId,
//         itemType,
//         quantity,
//         price
//       });
//     }

//     await calculateCartTotal(cart);
//     await cart.save();


//     res.status(200).json(cart);
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };



// previous code:
// const calculateCartTotal = async (cart) => {
//   cart.total = cart.items.reduce(
//     (total, item) => total + item.price * item.quantity,
//     0
//   ); // Calculate total based on price and quantity
// };

// const getCart = async (req, res) => {
//   try {
//       const customerId = req.user.id;

//       const cart = await Cart.findOne({ customer: customerId }).lean(); // Use lean() for better performance

//       if (!cart) {
//           return res.status(404).json({ message: "Cart not found" });
//       }

//       // Manually populate items based on itemType
//       for (let item of cart.items) {
//           if (item.itemType === 'Product') {
//               item.item = await Product.findById(item.item).lean();
//           } else if (item.itemType === 'SpecialProduct') {
//               item.item = await SpecialProduct.findById(item.item).lean();
//           }
//       }

//       res.json(cart);
//   } catch (error) {
//       console.error("Error in getCart:", error);
//       res.status(500).json({ message: "Internal server error" });
//   }
// };

const getCart = async (req, res) => {
  try {
      const customerId = req.user.id;

      const cart = await Cart.findOne({ customer: customerId }).lean();

      if (!cart) {
          return res.status(404).json({ message: "Cart not found" });
      }

      // Enhanced population for items based on itemType
      for (let item of cart.items) {
          if (item.itemType === 'Product') {
              item.item = await Product.findById(item.item)
                  .populate('category')
                  .populate('subcategory')
                  .populate('subsubcategory')
                  .lean();
          } else if (item.itemType === 'SpecialProduct') {
              item.item = await SpecialProduct.findById(item.item)
                  .populate('specialCategory')
                  .populate('specialSubcategory')
                  .lean();
          }
      }

      res.json(cart);
  } catch (error) {
      console.error("Error in getCart:", error);
      res.status(500).json({ message: "Internal server error" });
  }
};




const addToCart = async (req, res) => {
  try {
    const { itemId, quantity, price, itemType, color} = req.body;

    if (!['Product', 'SpecialProduct'].includes(itemType)) {
      return res.status(400).json({ message: 'Invalid item type' });
    }

    const Model = itemType === 'Product' ? Product : SpecialProduct;
    const item = await Model.findById(itemId);
    
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    const cart = await getOrCreateCart(req);
     
    const validPrice = Number(price ?? item?.prices?.[0]?.amount ?? 0);
    if (isNaN(validPrice) || validPrice <= 0) {
      return res.status(400).json({ message: 'Invalid or missing price value' });
    }

    let existingItem = cart.items.find(i => i.item?.toString() === itemId && i.itemType === itemType && i.color === (color || null));

    if (existingItem) {
      existingItem.quantity += quantity;
      existingItem.price = price;
    } else {
      const itemObjectId = new mongoose.Types.ObjectId(itemId);  // ✅ Convert to ObjectId

      const newItem = {
        itemType,
        item: itemObjectId, // ✅ Ensure correct format
        quantity,
        price: validPrice,
        color: color || null
      };

      console.log('New Item:', newItem);
      cart.items.push(newItem);
    }

    console.log("Cart Items After Push:", JSON.stringify(cart.items, null, 2));  // ✅ Debug

    await calculateCartTotal(cart);
    await cart.save();

    const populatedCart = await Cart.findById(cart._id).populate('items.item');

    console.log('Cart after adding:', JSON.stringify(populatedCart, null, 2));

    res.status(200).json(populatedCart);
  } catch (error) {
    console.error('Error in addToCart:', error);
    res.status(400).json({ message: error.message });
  }
};










// const calculateCartTotal = async (cart) => {
//   const productTotal = cart.items
//     .filter(item => item.itemType === 'Product')
//     .reduce((total, item) => total + item.price * item.quantity, 0);

//   const specialProductTotal = cart.items
//     .filter(item => item.itemType === 'SpecialProduct')
//     .reduce((total, item) => total + item.price * item.quantity, 0);

//   cart.total = productTotal + specialProductTotal;
// };




// previous remove cart controller:
// const removeFromCart = async (req, res) => {
//   try {
//     const { itemId } = req.params;
//    // console.log('Item ID to remove:', itemId);

//     const cart = await getOrCreateCart(req);
//    // console.log('Cart before removal:', cart);

//     cart.items = cart.items.filter((item) => {
//      // console.log('Checking item:', item.item.toString());
//       return !item.item.equals(itemId);
//     });

//    // console.log('Cart after removal:', cart.items);

//     await calculateCartTotal(cart);
//     await cart.save();

//     res.status(200).json(cart);
//   } catch (error) {
//     console.error('Error:', error);
//     res.status(400).json({ message: error.message });
//   }
// };

// const removeFromCart = async (req, res) => {
//   try {
//     const { itemId } = req.params;
//     const { itemType } = req.query;

//     const cart = await getOrCreateCart(req);

//     cart.items = cart.items.filter(item => 
//       !(item.item.equals(itemId) && item.itemType === itemType)
//     );

//     await calculateCartTotal(cart);
//     await cart.save();

//     res.status(200).json(cart);
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };


const removeFromCart = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { itemType, color } = req.query;

    const cart = await getOrCreateCart(req);

    const initialLength = cart.items.length;

    // Remove only the matching item
    cart.items = cart.items.filter(item => {
      if (color) {
        // If color is provided, match all criteria
        return !(item.item.equals(itemId) && item.itemType === itemType && item.color === color);
      } else {
        // If color is not provided, match only itemId and itemType
        return !(item.item.equals(itemId) && item.itemType === itemType);
      }
    });

    if (cart.items.length === initialLength) {
      return res.status(404).json({ message: "Item not found in cart" });
    }



    // Recalculate total and save
    await calculateCartTotal(cart);
    await cart.save();

    res.status(200).json({ message: "Item removed successfully", cart });
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};







// previous updated controller:
// const updateCartItemQuantity = async (req, res) => {
//   try {
//     const { itemId } = req.params;
//     const { quantity } = req.body;

//     if (!quantity || isNaN(quantity) || quantity < 0) {
//       return res.status(400).json({ message: 'Invalid quantity provided' });
//     }

//     const cart = await getOrCreateCart(req);

//     // Use equals for ObjectId comparison
//     const cartItem = cart.items.find((item) => item.item.equals(itemId));

//     if (!cartItem) {
//       return res.status(404).json({ message: 'Item not found in cart' });
//     }

//     if (quantity === 0) {
//       // Remove the item if quantity is 0
//       cart.items = cart.items.filter((item) => !item.item.equals(itemId));
//     } else {
//       // Update the item quantity
//       cartItem.quantity = quantity;
//     }

//     await calculateCartTotal(cart);
//     await cart.save();

//     res.status(200).json(cart);
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };


const updateCartItemQuantity = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity, itemType, color} = req.body;

    if (!quantity || isNaN(quantity) || quantity < 0) {
      return res.status(400).json({ message: 'Invalid quantity provided' });
    }

    const cart = await getOrCreateCart(req);
    const cartItem = cart.items.find(item => 
      item.item.equals(itemId) && item.itemType === itemType && item.color === (color || null)
    );

    if (!cartItem) {
      return res.status(404).json({ message: 'Item not found in cart' });
    }

    if (quantity === 0) {
      cart.items = cart.items.filter(item => 
        !(item.item.equals(itemId) && item.itemType === itemType && item.color === (color || null))
      );
    } else {
      cartItem.quantity = quantity;
    }

    await calculateCartTotal(cart);
    await cart.save();

    res.status(200).json(cart);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};


// const getCart = async (req, res) => {
//   try {
//     const cart = await getOrCreateCart(req);
//     res.status(200).json(cart);
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };

const clearCart = async (req, res) => {
  try {
    const cart = await getOrCreateCart(req);

    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    // Empty the items array
    cart.items = [];

    // Recalculate the total to ensure it is zero
    await calculateCartTotal(cart);

    // Save the updated cart
    await cart.save();

    res.status(200).json({ message: 'Cart cleared successfully', cart });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};


// previous bulk update controller:
// const bulkUpdateCartItems = async (req, res) => {
//   try {
//     const updates = req.body; // Array of { itemId, quantity }
//     if (!Array.isArray(updates) || updates.length === 0) {
//       return res.status(400).json({ message: 'Invalid data format. Must provide an array of item updates.' });
//     }

//     // Ensure each item in the array has itemId and quantity
//     for (const update of updates) {
//       if (!update.itemId || isNaN(update.quantity) || update.quantity < 0) {
//         return res.status(400).json({ message: 'Invalid itemId or quantity in bulk update.' });
//       }
//     }

//     const cart = await getOrCreateCart(req);

//     // Iterate over the updates and apply them
//     for (const update of updates) {
//       const { itemId, quantity } = update;
//       const cartItem = cart.items.find((item) => item.item.equals(itemId));

//       if (cartItem) {
//         if (quantity === 0) {
//           // Remove the item if quantity is 0
//           cart.items = cart.items.filter((item) => !item.item.equals(itemId));
//         } else {
//           // Update the item quantity
//           cartItem.quantity = quantity;
//         }
//       } else if (quantity > 0) {
//         // If item doesn't exist, add it
//         cart.items.push({
//           item: itemId,
//           quantity,
//           price: 0, // You can set the price to 0, or fetch it from the product if needed
//         });
//       }
//     }

//     // Recalculate the cart total
//     await calculateCartTotal(cart);
//     await cart.save();

//     res.status(200).json(cart);
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };


const bulkUpdateCartItems = async (req, res) => {
  try {
    const updates = req.body; // Array of { itemId, quantity, itemType }
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ message: 'Invalid data format. Must provide an array of item updates.' });
    }

    // Validate each update item
    for (const update of updates) {
      if (!update.itemId || !update.itemType || isNaN(update.quantity) || update.quantity < 0) {
        return res.status(400).json({ message: 'Invalid itemId, itemType or quantity in bulk update.' });
      }
    }

    const cart = await getOrCreateCart(req);

    // Iterate over the updates and apply them
    for (const update of updates) {
      const { itemId, quantity, itemType, color} = update;
      const cartItem = cart.items.find(item => 
        item.item.equals(itemId) && item.itemType === itemType
        && item.color === (color || null)
      );

      if (cartItem) {
        if (quantity === 0) {
          cart.items = cart.items.filter(item => 
            !(item.item.equals(itemId) && item.itemType === itemType && item.color === (color || null))
          );
        } else {
          cartItem.quantity = quantity;
        }
      } else if (quantity > 0) {
        cart.items.push({
          item: itemId,
          itemType,
          quantity,
          price: update.price || 0,
          color: update.color || null
        });
      }
    }

    await calculateCartTotal(cart);
    await cart.save();

    res.status(200).json(cart);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// apply coupon to cart previous code:
// const applyCoupon = async (req, res) => {
//   try {
//     const { couponCode } = req.body;
//     const cart = await getOrCreateCart(req);

//     const coupon = await Coupon.findOne({ code: couponCode, isActive: true });
//     if (!coupon) {
//       return res.status(404).json({ message: 'Invalid or inactive coupon' });
//     }

//     const currentDate = new Date();
//     if (coupon.expiryDate && coupon.expiryDate < currentDate) {
//       return res.status(400).json({ message: 'Coupon has expired' });
//     }

//     if (coupon.minPurchase > cart.total) {
//       return res
//         .status(400)
//         .json({ message: 'Cart total does not meet the minimum purchase requirement for this coupon' });
//     }

//     if (coupon.discountType === 'percentage') {
//       cart.total *= 1 - coupon.value / 100;
//     } else if (coupon.discountType === 'fixed') {
//       cart.total -= coupon.value;
//     }

//     cart.coupon = coupon._id;
//     await cart.save();

//     res.status(200).json(cart);
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };


// Add this cleanup function



const applyCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    const cart = await getOrCreateCart(req);

    const coupon = await Coupon.findOne({ code: couponCode, isActive: true });
    if (!coupon) {
      return res.status(404).json({ message: 'Invalid or inactive coupon' });
    }

    const currentDate = new Date();
    if (coupon.expiryDate && coupon.expiryDate < currentDate) {
      return res.status(400).json({ message: 'Coupon has expired' });
    }

    // Calculate total separately for each product type
    const productTotal = cart.items
      .filter(item => item.itemType === 'Product')
      .reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const specialProductTotal = cart.items
      .filter(item => item.itemType === 'SpecialProduct')
      .reduce((sum, item) => sum + (item.price * item.quantity), 0);

    cart.total = productTotal + specialProductTotal;

    if (coupon.minPurchase > cart.total) {
      return res.status(400).json({ 
        message: 'Cart total does not meet the minimum purchase requirement for this coupon' 
      });
    }

    if (coupon.discountType === 'percentage') {
      cart.total *= 1 - coupon.value / 100;
    } else if (coupon.discountType === 'fixed') {
      cart.total -= coupon.value;
    }

    cart.coupon = coupon._id;
    await cart.save();

    res.status(200).json(cart);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};



const cleanupSessionCarts = async () => {
  try {
      const result = await Cart.deleteMany({ 
          sessionId: { $ne: null },
          customer: null 
      });
      console.log(`Cleaned up ${result.deletedCount} session-based carts`);
  } catch (error) {
      console.error('Cart cleanup error:', error);
  }
};


// Schedule the cron job to run at midnight (00:00)
cron.schedule('0 0 * * *', () => {
  cleanupSessionCarts();
});




module.exports = {
  addToCart,
  removeFromCart,
  updateCartItemQuantity,
  getCart,
  applyCoupon,
  clearCart,
  getOrCreateCart,
  bulkUpdateCartItems,
  generateGuestSession
};
