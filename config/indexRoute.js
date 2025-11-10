const express = require('express');
const userRoutes = require('../routes/user.route');
const authRoutes = require('../routes/auth.route');
const customerRoutes = require('../routes/customer.route');
const checkBlacklistedToken = require('../middlewares/checkBlacklistedToken');
const authMiddleware = require('../middlewares/authMiddleware');
const addressRoutes = require('../routes/address.route');
const categoryRoutes = require('../routes/productCategory.route');
const productRoutes = require('../routes/product.route');
const discountRoutes = require('../routes/discount.route');
const cartRoutes = require('../routes/cart.route');
const productVariantRoutes = require('../routes/productVariant.route');
const warehouseRoutes = require('../routes/warehouse.route');
const inventoryRoutes = require('../routes/inventory.route');
const reviewRoutes = require('../routes/review.route');
const notificationRoutes = require('../routes/notification.routes');
const bundleRoutes = require('../routes/bundle.route');
const wishlistRoutes = require('../routes/wishlist.route');
const couponRoutes = require('../routes/coupon.route');
const shippingMethodRoutes = require('../routes/shipping.route');
const orderStatusRoutes = require('../routes/orderStatus.route');
const checkoutRoutes = require('../routes/checkout.route');
const sliderRoutes = require('../routes/bannerImage.route');
const contactRoutes = require('../routes/contact.route');
const searchRoutes = require('../routes/search.route');
const faqRoutes = require('../routes/faq.route');
const ticketRoutes = require('../routes/ticket.route');
const ticketStatusPriorityRoutes = require('../routes/ticketStatusPriority.route');
const middleBannerRoutes = require('../routes/middleBanner.routes');
const loyaltyBannerRoutes = require('../routes/loyaltyBanner.routes');
const brandRoutes = require('../routes/brand.route');
const policyRoutes = require('../routes/policy.route');
const bestSellerRoute = require('../routes/bestSellerConfig.route');
const showcasedProductRoutes = require('../routes/showcasedProduct.route');
const dealOfTheDayRoutes = require('../routes/dealOfTheDay.route');
const scrollingMessageRoutes = require('../routes/scrollingMessage.route');
const analyticsRoutes = require('../routes/analytics.route');
const mobileSliderRoutes = require('../routes/mobileSlider.routes');
const cityRoutes = require('../routes/city.routes');
const tagRoutes = require('../routes/tag.routes');
const paymentMethodRoutes = require('../routes/paymentStatus.routes');
const adminRoutes = require('../routes/adminLog.route');
const mobileMiddleBannerRoutes = require('../routes/mobileMiddleBannerImage.route');
const suscribeRoutes = require('../routes/subscriber.route');
const adminNotificationRoutes = require('../routes/adminNotification.route');
const specialProductRoutes = require('../routes/specialProduct.routes');
const specialCategoryRoutes = require('../routes/specialCategory.routes');
const specialSubCategoryRoutes = require('../routes/specialSubCategory.routes');
const courseRoutes = require('../routes/course.routes');
const QuizRoutes = require('../routes/quiz.routes');
const parentVariantRoutes = require('../routes/parentVariant.routes');
const WalletRequestRoutes = require('../routes/walletRequest.routes');
const ipAccessRoutes = require('../routes/IPAccess.routes');
const warehouseWalletRoutes = require('../routes/warehouseWallet.routes');
const csvUploadRoutes = require('../routes/csvUpload.routes');
const departmentRoutes = require('../routes/department.routes');
const NotificationCenterRoutes = require('../routes/notificationCenter.routes');
const policiesRoutes = require('../routes/policies.routes.js');
const getPolicyAcceptanceRoutes = require('../routes/policyAcceptance.routes.js');
const aboutUSRoutes = require('../routes/aboutUs.routes.js')
const securityRoutes = require('../routes/securitySetting.routes.js');
const navigationRoutes = require('../routes/navigation.routes');
const shortCoursesRoutes = require('../routes/shortCourses.routes.js');
const certificateRoutes = require('../routes/certificate.routes.js');
const adminProgressRoutes = require('../routes/adminProgress.routes.js');
const presedentroutes = require('../routes/presidentSignature.routes.js');
const bulkProductImportRoutes = require('../routes/bulkProductImport.route');
const bulkOtherProductImportRoutes = require('../routes/bulkOtherProductImport.route');












const router = express.Router();

router.use('/president', presedentroutes);
router.use('/bulk-products', bulkProductImportRoutes);
router.use('/bulk-other-products', bulkOtherProductImportRoutes);
router.use('/adminProgress', adminProgressRoutes);
router.use('/certificate', certificateRoutes);
router.use('/short', shortCoursesRoutes);
router.use('/navigation', navigationRoutes )
router.use('/Security', securityRoutes);
router.use('/aboutus', aboutUSRoutes)
router.use('/policy-acceptance', getPolicyAcceptanceRoutes);
router.use('/policy', policiesRoutes);
router.use('/NotificationCenter', NotificationCenterRoutes);
router.use('/departments', departmentRoutes);
router.use('/csv-upload', csvUploadRoutes);
router.use('/warehouse-wallet', warehouseWalletRoutes);
router.use('/ip-access', ipAccessRoutes);
router.use('/wallet-request', WalletRequestRoutes);
router.use('/parent-variants', parentVariantRoutes);
router.use("/quiz",QuizRoutes);
router.use('/courses', courseRoutes);
router.use('/special-categories', specialCategoryRoutes);
router.use('/special-sub-categories', specialSubCategoryRoutes);
router.use('/special-products', specialProductRoutes);
router.use('/users', authMiddleware, checkBlacklistedToken, userRoutes);
router.use('/auth', authRoutes);
router.use('/customers', customerRoutes);
router.use('/addresses', authMiddleware, checkBlacklistedToken, addressRoutes);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/discounts', discountRoutes);
router.use('/variants', productVariantRoutes);
router.use('/warehouses', warehouseRoutes);
// router.use('/inventory', authMiddleware, checkBlacklistedToken, inventoryRoutes);
router.use('/inventory',inventoryRoutes);
router.use('/reviews', reviewRoutes);
router.use('/notifications', authMiddleware, notificationRoutes);
router.use('/bundles', bundleRoutes);
router.use('/wishlist', authMiddleware, checkBlacklistedToken, wishlistRoutes);
router.use('/coupons', authMiddleware, checkBlacklistedToken, couponRoutes);
router.use('/cart', cartRoutes);
router.use('/shipping-methods', shippingMethodRoutes);
router.use('/order-statuses', orderStatusRoutes);
router.use('/checkout', checkoutRoutes);
router.use('/slider', sliderRoutes);
router.use('/contact', contactRoutes);
router.use('/search', searchRoutes);
router.use('/faqs', faqRoutes);
router.use('/tickets', authMiddleware, checkBlacklistedToken, ticketRoutes);
router.use('/ticket', authMiddleware, checkBlacklistedToken, ticketStatusPriorityRoutes);
router.use('/middleBanners', middleBannerRoutes);
router.use('/loyaltyBanners', loyaltyBannerRoutes);
router.use('/brands', brandRoutes);
router.use('/policies', policyRoutes);
router.use('/best-seller', bestSellerRoute);
router.use('/showcased-products', showcasedProductRoutes);
router.use('/deal-of-the-day', dealOfTheDayRoutes);
router.use('/scrollingMessages', scrollingMessageRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/mobileSlider', mobileSliderRoutes);
router.use('/cities', cityRoutes);
router.use('/tags', tagRoutes);
router.use('/paymentStatus', paymentMethodRoutes);
router.use('/admin-logs', adminRoutes);
router.use('/mobilemiddlebanner', mobileMiddleBannerRoutes);
router.use('/subscribers', suscribeRoutes);
router.use('/admin-notifications', adminNotificationRoutes);









module.exports = router;
