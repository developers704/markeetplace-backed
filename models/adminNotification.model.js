const mongoose = require('mongoose');

const adminNotificationSchema = new mongoose.Schema({
    user: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User',
      required: true
    },
    read: {
      type: Boolean,
      default: false
    },
    readAt: {
      type: Date
    },
    type: {
      type: String,
      enum: ['INVENTORY_EXPIRY', 'NOTIFICATION','WALLET_REQUEST','LOW_STOCK', 'ORDER', 'REVIEW', 'PRODUCT', 'WAREHOUSE','ORDER', 'WALLET_REQUEST_UPDATE', 'CERTIFICATE','INFO'],
      required: true
    },
    content: { 
      type: String, 
      required: true 
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'resourceModel'
    },
    resourceModel: {
      type: String,
      enum: ['Inventory', 'Product', 'Order', 'Review', 'WalletRequest', 'Warehouse', 'Order', 'CertificateRequest']
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    createdAt: { 
      type: Date, 
      default: Date.now 
    }
});


const AdminNotification = mongoose.model('AdminNotification', adminNotificationSchema);

module.exports = AdminNotification;
