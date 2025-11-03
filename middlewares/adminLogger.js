const AdminLog = require('../models/adminLog.model');
const mongoose = require('mongoose');

const getModelName = (resourceType, path) => {
    if (resourceType === 'checkout') {
        if (path.includes('/wallet/update') ||
            path.includes('/refund')) {
            return 'Wallet';
        }
        return 'Order';
    }

    if (resourceType === 'contact') {
        if (path.includes('/dropdown')) {
            return 'Dropdown';
        }
        return 'Contact';
    }

    if (resourceType === 'policies') {
        if (path.includes('/terms')) return 'TermsAndConditions';
        if (path.includes('/privacy')) return 'PrivacyPolicy';
        if (path.includes('/refund')) return 'RefundPolicy';
        return 'TermsAndConditions'; // default case
    }

    if (resourceType === 'categories') {
        if (path.includes('/subcategory') || 
            path.includes('/subcategories')) {
            return 'SubCategory';
        }
        return 'Category';
    }    

    if (resourceType === 'variants') {
        if (path.includes('/variant-names')) return 'VariantName';
        if (path.includes('/product-variants')) return 'ProductVariant';
        return 'VariantName'; // default case
    }

    if (resourceType === 'users') {
        if (path.includes('/role')) return 'UserRole';
        return 'User';
    }
    
    

    const modelMappings = {
        'faqs': 'FAQ',
        'addresses': 'Address',
        'slider': 'BannerImage',
        'bestsellerconfigs': 'BestSellerConfig',
        'brands': 'Brand',
        'cities': 'City',
        'coupons': 'Coupon',
        'customers': 'Customer',
        'daycare': 'Daycare',
        'deal-of-the-day': 'DealOfTheDay',
        'discounts': 'Discount',
        'exclusive-offers': 'ExclusiveOffer',
        'features': 'Feature',
        'grooming-services': 'Grooming',
        'inventory': 'Inventory',
        'locations': 'Location',
        'loyaltyBanners': 'LoyaltyBannerImage',
        'middleBanners': 'MiddleBannerImage',
        'mobileSlider': 'MobileSlider',
        'order-statuses': 'OrderStatus',
        'package': 'Package',
        'paymentStatus': 'PaymentStatus',
        'petname': 'PetName',
        'products': 'Product',
        'reviews': 'Review',
        'scrollingMessages': 'ScrollingMessage',
        'shipping-methods': 'ShippingMethod',
        'showcased-products': 'ShowcasedProduct',
        'stores': 'StoreLocator',
        'tags': 'Tag',
        'warehouses': 'Warehouse',
        'website-titles': 'WebsiteTitle',
        'mobilemiddlebanner': 'MobileMiddleBannerImage',
        'topPageSection': 'TopPageSection',
        'keepingYouInTheKnow': 'KeepingYouInTheKnow',
        'footer': 'Footer'
    };
    return modelMappings[resourceType] || resourceType;
};

const displayMappings = {
    'FAQ': 'Frequently Asked Questions',
    'Address': 'Customer Address',
    'BannerImage': 'Banner Image',
    'BestSellerConfig': 'Best Seller Configuration',
    'Brand': 'Brand',
    'Order': 'Customer Order',
    'Wallet': 'Customer Wallet',
    'City': 'City',
    'Dropdown': 'Contact Form Dropdown',
    'Contact': 'Contact',
    'Coupon': 'Coupon',
    'Customer': 'Customer',
    'Daycare': 'Daycare',
    'DealOfTheDay': 'Deal Of The Day',
    'Discount': 'Discount',
    'ExclusiveOffer': 'Brand Exclusive Offer',
    'Feature': 'Feature',
    'Grooming': 'Grooming',
    'Inventory': 'Inventory',
    'Location': 'Location',
    'LoyaltyBannerImage': 'Loyalty Banner',
    'MiddleBannerImage': 'Last Banner',
    'MobileSlider': 'Mobile Slider',
    'OrderStatus': 'Order Status',
    'Package': 'Package',
    'PaymentStatus': 'Payment Status',
    'PetName': 'Pet Name',
    'TermsAndConditions': 'Terms And Conditions',
    'PrivacyPolicy': 'Privacy Policy',
    'RefundPolicy': 'Refund Policy',
    'Product': 'Product',
    'Category': 'Category',
    'SubCategory': 'SubCategory',
    'VariantName': 'Variant Name',
    'ProductVariant': 'Product Variant',
    'Review': 'Review',
    'ScrollingMessage': 'Scrolling Message',
    'ShippingMethod': 'Shipping Method',
    'ShowcasedProduct': 'Showcased Product',
    'StoreLocator': 'Store Locator',
    'Tag': 'Tag',
    'UserRole': 'UserRole',
    'User': 'User',
    'Warehouse': 'Warehouse',
    'WebsiteTitle': 'Website Title',
    'MobileMiddleBannerImage': 'Mobile Last Banner',
    'TopPageSection': 'Top Page Section',
    'KeepingYouInTheKnow': 'Keeping You In The Know',
    'Footer': 'Footer Need Help'
};

const adminLogger = () => {
    return async (req, res, next) => {
        try {
            // Extract and normalize the base model path
            const baseModelPath = req.baseUrl.split('/').pop();
            const modelName = getModelName(baseModelPath, req.path);

            // Capture the previous data before any modifications
            if (['PUT', 'PATCH', 'DELETE'].includes(req.method)) {
                const Model = mongoose.model(modelName);
                req.previousData = await Model.findById(req.params.id).lean();
            }

            // Override res.json to log the action
            const originalJson = res.json;
            res.json = async function(data) {
                try {
                    const method = req.method;
                    let action, details = {};

                    switch (method) {
                        case 'POST':
                            action = 'CREATE';
                            details.newData = data;
                            break;
                        case 'PUT':
                        case 'PATCH':
                            action = 'UPDATE';
                            details.previousData = req.previousData;
                            details.updatedData = data;
                            break;
                        case 'DELETE':
                            action = 'DELETE';
                            details.deletedData = req.previousData;
                            break;
                        default:
                            return originalJson.call(this, data);
                    }

                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        await AdminLog.create({
                            userId: req.user.id,
                            action,
                            resourceType: displayMappings[modelName] || modelName,
                            details,
                        });
                    }
                } catch (error) {
                    console.error('Logging error:', error);
                }

                return originalJson.call(this, data);
            };

            next();
        } catch (error) {
            console.error('Middleware error:', error);
            next(error);
        }
    };
};

module.exports = adminLogger;
