const AdminNotification = require('../models/adminNotification.model');
const User = require('../models/user.model');

const createAdminNotification = async ({ type, content, resourceId, resourceModel, priority }) => {
  //console.log('Creating notifications for all users...');
  const allUsers = await User.find({});
  //console.log(`Found ${allUsers.length} users to notify`);
  
  const notifications = allUsers.map(user => ({
    user: user._id,
    type,
    content,
    resourceId,
    resourceModel,
    priority
  }));

  const created = await AdminNotification.insertMany(notifications);
  console.log(`Created ${created.length} notifications`);
};

  
const markNotificationAsRead = async (req, res) => {
  try {
      const { notificationId } = req.params;
      const userId = req.user._id;

      const notification = await AdminNotification.findOneAndUpdate(
          { _id: notificationId, user: userId },
          { 
              read: true,
              readAt: new Date()
          },
          { new: true }
      );

      if (!notification) {
          return res.status(404).json({ message: 'Notification not found' });
      }

      res.json({ message: 'Notification marked as read', notification });
  } catch (error) {
      res.status(500).json({ message: error.message });
  }
};

const bulkMarkAsRead = async (req, res) => {
  try {
      const { notificationIds } = req.body;
      const userId = req.user._id;

      const result = await AdminNotification.updateMany(
          { 
              _id: { $in: notificationIds },
              user: userId,
              read: false 
          },
          { 
              read: true,
              readAt: new Date()
          }
      );

      res.json({ 
          message: 'Notifications marked as read',
          modifiedCount: result.modifiedCount 
      });
  } catch (error) {
      res.status(500).json({ message: error.message });
  }
};

const getAdminNotifications = async (req, res) => {
  try {
    const notifications = await AdminNotification.find({
      user: req.user._id
    })
    .sort({ createdAt: -1 })
    .limit(50);
    
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const bulkDeleteAdminNotifications = async (req, res) => {
  try {
    const { notificationIds } = req.body;
    await AdminNotification.deleteMany({
      _id: { $in: notificationIds },
      user: req.user._id
    });
    res.json({ message: 'Notifications deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
  

  module.exports = {
    createAdminNotification,
    getAdminNotifications,
    bulkDeleteAdminNotifications,
    markNotificationAsRead,
    bulkMarkAsRead
};