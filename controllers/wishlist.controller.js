const Wishlist = require('../models/wishlist.model');
const Product = require('../models/product.model');
const Cart = require('../models/cart.model');
const Inventory = require('../models/inventory.model');
const SpecialProduct = require('../models/specialProduct.model.js');

const addToWishlist = async (req, res) => {
    try {
      const { productId, productType } = req.body;
      const customerId = req.user._id;
  
      // Check if the product exists
      // const product = await Product.findById(productId);
      let product;
      if (productType === 'regular') {
        product = await Product.findById(productId);
      } else if (productType === 'special') {
        product = await SpecialProduct.findById(productId);
      }
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }
  
      // Use $addToSet to avoid duplicate product entries
      let wishlist = await Wishlist.findOneAndUpdate(
        { customer: customerId },
        { $addToSet: { products: { productType, product: productId } } }, // $addToSet prevents duplicates
        { new: true, upsert: true } // new returns the updated document, upsert creates a new wishlist if it doesn't exist
      );
  
      res.status(200).json({ message: 'Product added to wishlist', wishlist });
    } catch (error) {
      console.error(error); // Log the error for debugging
      res.status(500).json({ message: 'Internal server error' });
    }
  };


const removeFromWishlist = async (req, res) => {
  try {
    const { productId, productType } = req.params;
    const customerId = req.user._id;

    // const wishlist = await Wishlist.findOne({ customer: customerId });

    const wishlist = await Wishlist.findOneAndUpdate(
      { customer: customerId },
      { $pull: { products: { product: productId, productType } } },
      { new: true }
    );

    if (!wishlist) {
      return res.status(404).json({ message: 'Wishlist not found' });
    }


    // wishlist.products = wishlist.products.filter(id => id.toString() !== productId);
    // await wishlist.save();

    res.status(200).json({ message: 'Product removed from wishlist', wishlist });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// const toggleWishlistProduct = async (req, res) => {
//   try {
//     const { productId } = req.body;
//     const customerId = req.user._id;

//     // Check if the product exists
//     const product = await Product.findById(productId);
//     if (!product) {
//       return res.status(404).json({ message: 'Product not found' });
//     }

//     // Find the customer's wishlist
//     let wishlist = await Wishlist.findOne({ customer: customerId });

//     if (!wishlist) {
//       // Create a new wishlist if none exists and add the product
//       wishlist = new Wishlist({ customer: customerId, products: [productId] });
//       await wishlist.save();

//       // Populate the products field in the newly created wishlist
//       wishlist = await Wishlist.findById(wishlist._id).populate('products');
//       return res.status(200).json({ message: 'Product added to wishlist', wishlist });
//     }

//     // Check if the product is already in the wishlist
//     const productIndex = wishlist.products.findIndex(id => id.toString() === productId);

//     if (productIndex > -1) {
//       // Remove the product if it exists
//       wishlist.products.splice(productIndex, 1);
//       await wishlist.save();
//     } else {
//       // Add the product if it doesn't exist
//       wishlist.products.push(productId);
//       await wishlist.save();
//     }

//     // Populate the products field after updating the wishlist
//     wishlist = await Wishlist.findOne({ customer: customerId }).populate('products');

//     res.status(200).json({
//       message: productIndex > -1 ? 'Product removed from wishlist' : 'Product added to wishlist',
//       wishlist,
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// };


// const getWishlist = async (req, res) => {
//   try {
//     const customerId = req.user._id;
//     const { city } = req.query;

//     let wishlist = await Wishlist.findOne({ customer: customerId })
//       .populate({
//         path: 'products',
//         populate: [
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
//           "variants",
//           { path: "prices.city", model: "City" },
//         ]
//       })
//       .lean();

//     if (!wishlist) {
//       return res.status(404).json({ message: 'Wishlist not found' });
//     }

//     if (city && wishlist.products) {
//       wishlist.products = wishlist.products
//         .map((product) => {
//           // Filter prices by city
//           if (product.prices && Array.isArray(product.prices)) {
//             product.prices = product.prices.filter(
//               (price) => price.city && price.city._id.toString() === city
//             );
//           } else {
//             product.prices = [];
//           }

//           // Filter discounts based on city
//           if (product.discounts && Array.isArray(product.discounts)) {
//             product.discounts = product.discounts.filter(
//               (discount) =>
//                 discount.cityIds && discount.cityIds.some(
//                   (cityId) => cityId.toString() === city
//                 )
//             );
//           } else {
//             product.discounts = [];
//           }

//           // Filter deal of the day based on city
//           if (product.dealOfTheDay && Array.isArray(product.dealOfTheDay)) {
//             product.dealOfTheDay = product.dealOfTheDay.filter((deal) =>
//               deal.cities.some((dealCityId) => dealCityId.toString() === city)
//             );
//           } else {
//             product.dealOfTheDay = [];
//           }

//           return product;
//         })
//         .filter((product) => product.prices.length > 0);

//       // Fetch inventory data for the filtered products
//       const productsWithInventory = await Promise.all(
//         wishlist.products.map(async (product) => {
//           const inventory = await Inventory.findOne(
//             { product: product._id, city }
//           ).select("city quantity vat");

//           product.inventory = inventory || null;
//           product.isOutOfStock = !inventory || inventory.quantity === 0;
//           return product;
//         })
//       );

//       wishlist.products = productsWithInventory;
//     }

//     res.status(200).json(wishlist);
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };


const toggleWishlistProduct = async (req, res) => {
  try {
    const { productId, productType } = req.body;
    const customerId = req.user._id;

    let product;
    if (productType === 'regular') {
      product = await Product.findById(productId);
    } else if (productType === 'special') {
      product = await SpecialProduct.findById(productId);
    }

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    let wishlist = await Wishlist.findOne({ customer: customerId });

    if (!wishlist) {
      wishlist = new Wishlist({ customer: customerId, products: [{ productType, product: productId }] });
      await wishlist.save();
      return res.status(200).json({ message: 'Product added to wishlist', wishlist });
    }

    const productIndex = wishlist.products.findIndex(
      item => item.product.toString() === productId && item.productType === productType
    );

    if (productIndex > -1) {
      wishlist.products.splice(productIndex, 1);
    } else {
      wishlist.products.push({ productType, product: productId });
    }

    await wishlist.save();

    res.status(200).json({
      message: productIndex > -1 ? 'Product removed from wishlist' : 'Product added to wishlist',
      wishlist,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};


// const getWishlist = async (req, res) => {
//   try {
//     const customerId = req.user._id;
//     const { city } = req.query;

//     let wishlist = await Wishlist.findOne({ customer: customerId })
//       .populate({
//         path: 'products.product',
//         populate: [
//           { path: "category", select: "name" },
//           { path: "subcategory", select: "name" },
//           { path: "brand", select: "name" },
//           { path: "tags", select: "name" },
//           { path: "prices.city", model: "City" },
//         ]
//       })
//       .lean();

//     if (!wishlist) {
//       return res.status(404).json({ message: 'Wishlist not found' });
//     }

//     wishlist.products = await Promise.all(wishlist.products.map(async (item) => {
//       if (item.productType === 'regular') {
//         item.product = await Product.findById(item.product)
//           .populate("category", "name")
//           .populate("subcategory", "name")
//           .populate("brand", "name")
//           .populate("tags", "name")
//           .populate("prices.city")
//           .lean();
//       } else if (item.productType === 'special') {
//         item.product = await SpecialProduct.findById(item.product)
//           .populate("specialCategory", "name")
//           .populate("specialSubcategory", "name")
//           .populate("prices.city")
//           .lean();
//       }

//       if (city && item.product.prices && Array.isArray(item.product.prices)) {
//         item.product.prices = item.product.prices.filter(
//           (price) => price.city && price.city._id.toString() === city
//         );
//       }

//       return item;
//     }));

//     wishlist.products = wishlist.products.filter((item) => item.product && item.product.prices && item.product.prices.length > 0);

//     res.status(200).json(wishlist);
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };


// const getWishlist = async (req, res) => {
//   try {
//     const customerId = req.user._id;
//     const { city } = req.query;

//     let wishlist = await Wishlist.findOne({ customer: customerId })
//       .populate({
//         path: 'products.product',
//         populate: [
//           { path: "category", select: "name" },
//           { path: "subcategory", select: "name" },
//           { path: "brand", select: "name" },
//           { path: "tags", select: "name" },
//           { path: "prices.city", model: "City" },
//         ]
//       })
//       .lean();

//     if (!wishlist) {
//       return res.status(404).json({ message: 'Wishlist not found' });
//     }

//     wishlist.products = await Promise.all(wishlist.products.map(async (item) => {
//       if (item.productType === 'regular') {
//         item.product = await Product.findById(item.product)
//           .populate("category", "name")
//           .populate("subcategory", "name")
//           .populate("brand", "name")
//           .populate("tags", "name")
//           .populate("prices.city")
//           .lean();
//       } else if (item.productType === 'special') {
//         item.product = await SpecialProduct.findById(item.product)
//           .populate("specialCategory", "name")
//           .populate("prices.city")
//           .lean();
//       }

//       if (city && item.product && item.product.prices && Array.isArray(item.product.prices)) {
//         item.product.prices = item.product.prices.filter(
//           (price) => price.city && price.city._id.toString() === city
//         );
//       }

//       return item;
//     }));

//     wishlist.products = wishlist.products.filter((item) => item.product && item.product.prices && item.product.prices.length > 0);

//     res.status(200).json(wishlist);
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };


const getWishlist = async (req, res) => {
  try {
    const customerId = req.user._id;
    const { city } = req.query;

    let wishlist = await Wishlist.findOne({ customer: customerId }).lean();

    if (!wishlist) {
      return res.status(404).json({ message: 'Wishlist not found' });
    }

    wishlist.products = await Promise.all(wishlist.products.map(async (item) => {
      let populatedProduct;
      if (item.productType === 'regular') {
        populatedProduct = await Product.findById(item.product)
          .populate("category", "name")
          .populate("subcategory", "name")
          .populate("brand", "name")
          .populate("tags", "name")
          .populate("prices.city")
          .lean();
      } else if (item.productType === 'special') {
        populatedProduct = await SpecialProduct.findById(item.product)
          .populate("specialCategory", "name")
          .populate("specialSubcategory", "name")
          .populate("prices.city")
          .lean();
      }

      if (populatedProduct && city && populatedProduct.prices && Array.isArray(populatedProduct.prices)) {
        populatedProduct.prices = populatedProduct.prices.filter(
          (price) => price.city && price.city._id.toString() === city
        );
      }

      return { ...item, product: populatedProduct };
    }));

    wishlist.products = wishlist.products.filter((item) => item.product && item.product.prices && item.product.prices.length > 0);

    res.status(200).json(wishlist);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};


const clearWishlist = async (req, res) => {
  try {
      const customerId = req.user._id;

      // Find the wishlist by customer ID
      // const wishlist = await Wishlist.findOne({ customer: customerId });

      const wishlist = await Wishlist.findOneAndUpdate(
        { customer: customerId },
        { $set: { products: [] } },
        { new: true }
      )

      if (!wishlist) {
          return res.status(404).json({ message: 'Wishlist not found' });
      }

      // Clear all products from the wishlist
      // wishlist.products = []; // Set products to an empty array

      // Save the updated wishlist
      // const updatedWishlist = await wishlist.save();

      res.status(200).json({ message: 'All products removed from wishlist', wishlist });
  } catch (error) {
      res.status(400).json({ message: error.message });
  }
};





module.exports = {
  addToWishlist,
  removeFromWishlist,
  getWishlist,
  clearWishlist,
  toggleWishlistProduct
};
