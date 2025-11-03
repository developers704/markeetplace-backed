const SecuritySettings = require('../models/securitySettings.model');
const Customer = require('../models/customer.model');

// Get all security settings (Admin only)
const getGlobalSecuritySettings = async (req, res) => {
  try {
    const globalSettings = await SecuritySettings.findOne({ type: 'global' });
    
    if (!globalSettings) {
      return res.status(200).json({
        success: true,
        message: 'No global security settings found, using defaults',
        settings: {
          type: 'global',
          autoLogout: {
            enabled: false,
            timeLimit: 30
          }
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Global security settings retrieved successfully',
      settings: {
        id: globalSettings._id,
        type: globalSettings.type,
        autoLogout: globalSettings.autoLogout,
        createdAt: globalSettings.createdAt,
        updatedAt: globalSettings.updatedAt
      }
    });

  } catch (error) {
    console.error('Error getting global security settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get global security settings',
      error: error.message
    });
  }
};


// Unified Create/Update Security Settings (Admin only)
const createOrUpdateGlobalSecuritySettings = async (req, res) => {
  try {
    const { autoLogout } = req.body;
    
    // Validate autoLogout object
    if (!autoLogout || typeof autoLogout !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'autoLogout object is required with enabled and timeLimit properties'
      });
    }

    if (typeof autoLogout.enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'autoLogout.enabled must be a boolean value'
      });
    }

    if (typeof autoLogout.timeLimit !== 'number' || autoLogout.timeLimit < 1) {
      return res.status(400).json({
        success: false,
        message: 'autoLogout.timeLimit must be a positive number (minutes)'
      });
    }
    
    let settings = await SecuritySettings.findOne({ type: 'global' });
    let isNewRecord = false;
    
    if (!settings) {
      // Create new global settings
      settings = new SecuritySettings({
        type: 'global',
        autoLogout: {
          enabled: autoLogout.enabled,
          timeLimit: autoLogout.timeLimit
        }
      });
      isNewRecord = true;
    } else {
      // Update existing global settings
      settings.autoLogout.enabled = autoLogout.enabled;
      settings.autoLogout.timeLimit = autoLogout.timeLimit;
      settings.updatedAt = new Date();
    }
    
    await settings.save();
    
    res.status(isNewRecord ? 201 : 200).json({
      success: true,
      message: isNewRecord 
        ? 'Global security settings created successfully' 
        : 'Global security settings updated successfully',
      settings: {
        id: settings._id,
        type: settings.type,
        autoLogout: settings.autoLogout,
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt
      }
    });
    
  } catch (error) {
    console.error('Error creating/updating global security settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create/update global security settings',
      error: error.message
    });
  }
};

// Delete Security Settings (Admin only)
const deleteSecuritySettings = async (req, res) => {
    try {
        const { id } = req.params;
        await SecuritySettings.findByIdAndDelete(id);
        res.status(200).json({ message: 'Security settings deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getGlobalSecuritySettings,
    createOrUpdateGlobalSecuritySettings,
    deleteSecuritySettings
};
