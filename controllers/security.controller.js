const SecuritySettings = require('../models/securitySettings.model.js');
const SecurityLog = require('../models/securityLog.model.js');
const User = require('../models/user.model.js');

const getUserSecuritySettings = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // First check for user-specific settings
    let settings = await SecuritySettings.findOne({ 
      type: 'user', 
      user: userId 
    });

    // If no user-specific settings, check role-based settings
    if (!settings) {
      const user = await User.findById(userId);
      
      settings = await SecuritySettings.findOne({
        type: 'role',
        roles: { $in: [user.role] }
      });
    }

    // If no role-based settings, use global settings
    if (!settings) {
      settings = await SecuritySettings.findOne({ type: 'global' });
    }

    // If no settings found at all, return default settings
    if (!settings) {
      settings = {
        autoLogout: {
          enabled: false,
          timeLimit: 60000
        },
        presenceDetection: {
          enabled: false
        }
      };
    }

    res.status(200).json({
      success: true,
      data: settings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch security settings',
      error: error.message
    });
  }
};


// log security violations (inactivity or absence)
const logSecurityViolation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, details } = req.body;
    
    // Create security log entry
    const securityLog = new SecurityLog({
      user: userId,
      type, // 'inactivity' or 'absence'
      details
    });
    
    await securityLog.save();
    
    // If this is an inactivity violation and auto-logout is enabled,
    // we'll handle the logout on the frontend
    
    res.status(200).json({
      success: true,
      message: 'Security violation logged',
      action: type === 'inactivity' ? 'logout' : 'warning'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to log security violation',
      error: error.message
    });
  }
};



// Admin apis for Enable / Disable features
const getSecuritySettings = async (req, res) => {
  try {
    const { type, roleId, userId } = req.query;
    
    const query = {};
    
    if (type) {
      query.type = type;
    }
    
    if (roleId) {
      query.roles = { $in: [roleId] };
    }
    
    if (userId) {
      query.user = userId;
    }
    
    const settings = await SecuritySettings.find(query)
      .populate('roles', 'role_name')
      .populate('user', 'username email');
    
    res.status(200).json({
      success: true,
      count: settings.length,
      data: settings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch security settings',
      error: error.message
    });
  }
};

const updateSecuritySettings = async (req, res) => {
  try {
    const { id, type, roles, user, autoLogout, presenceDetection } = req.body;
    
    let settings;
    
    if (id) {
      // Update existing settings
      settings = await SecuritySettings.findByIdAndUpdate(
        id,
        {
          type,
          roles,
          user,
          autoLogout,
          presenceDetection
        },
        { new: true }
      );
    } else {
      // Create new settings
      settings = await SecuritySettings.create({
        type,
        roles,
        user,
        autoLogout,
        presenceDetection
      });
    }
    
    res.status(200).json({
      success: true,
      data: settings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update security settings',
      error: error.message
    });
  }
};


const deleteSecuritySettings = async (req, res) => {
  try {
    const { id } = req.params;
    
    await SecuritySettings.findByIdAndDelete(id);
    
    res.status(200).json({
      success: true,
      message: 'Security settings deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete security settings',
      error: error.message
    });
  }
};


module.exports = {
  getUserSecuritySettings,
  logSecurityViolation,
  getSecuritySettings,
  updateSecuritySettings,
  deleteSecuritySettings
};


