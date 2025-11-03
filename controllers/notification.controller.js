const Notification = require('../models/notification.model');
const cron = require('node-cron');


const createNotification = async (customerId, content, reviewId) => {
  try {
    // Create and save the notification
    const notification = new Notification({
      user: customerId,          // Refers to 'Customer'
      content: content,          // Notification message
      url: reviewId ? `/reviews/${reviewId}` : null, // Include URL only if reviewId is provided
      read: false,               // Initially unread
      createdAt: new Date(),     // Timestamp of creation
    });

    // Save the notification to the database
    await notification.save();
   // console.log("Notification created successfully");
    
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
};


  const markNotificationAsRead = async (req, res) => {
    try {
      const { id } = req.params;
      const notification = await Notification.findByIdAndUpdate(
        id,
        { read: true },
        { new: true }
      );
      if (!notification) {
        return res.status(404).json({ message: 'Notification not found' });
      }
      res.json(notification);
    } catch (error) {
      res.status(500).json({ message: 'Error marking notification as read', error: error.message });
    }
  };
  
 // Fetch notifications for the logged-in user
const getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;

    // Fetch up to 20 most recent notifications for the user
    const notifications = await Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(20);

    // Respond with the notifications
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching notifications', error: error.message });
  }
};
  
// Run cron job every day at midnight
cron.schedule('0 0 * * *', async () => {
  try {
    const notifications = await Notification.find().sort({ createdAt: -1 }).skip(20);
    notifications.forEach(async (notification) => {
      await notification.deleteOne();
    });
    console.log('Old notifications cleaned up');
  } catch (error) {
    console.error('Error cleaning up notifications:', error.message);
  }
});

  module.exports = { createNotification, markNotificationAsRead, getNotifications };
