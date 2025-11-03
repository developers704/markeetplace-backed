const mongoose = require('mongoose');

const securitySettingsSchema = new mongoose.Schema({
  // Define if this is a global setting, role-based, or user-specific
  type: {
    type: String,
    enum: ['global', 'role', 'user'],
    required: true
  },
  
  // References (optional based on type)
  roles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserRole'
  }],
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  
  // Feature 1: Auto-logout on inactivity
  autoLogout: {
    enabled: {
      type: Boolean,
      default: false
    },
    timeLimit: {
      type: Number,
      default: 60000  // 1 minute in milliseconds
    }
  },
  
  // Feature 2: Presence detection
  presenceDetection: {
    enabled: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true
});

const SecuritySettings = mongoose.model('SecuritySettings', securitySettingsSchema);
module.exports = SecuritySettings;
