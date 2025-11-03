const Customer = require('../models/customer.model');
const Notification = require('../models/notification.model');
const AdminNotification = require('../models/adminNotification.model');
const UserRole = require('../models/userRole.model');
const mongoose = require('mongoose');


const sendNotifications = async (req, res) => {
    // Start a session for the transaction
    const session = await mongoose.startSession();
    
    try {
      // Start transaction
      session.startTransaction();
      
      const { 
        roles, // Array of role IDs
        customers, // Array of customer IDs (optional)
        subject, 
        message, 
        url, // Optional URL for the notification
        sendToAllUsersInRoles, // Boolean to determine if we should send to all users in selected roles
        adminId // ID of the admin sending the notification
      } = req.body;
  
      if (!roles || roles.length === 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: 'At least one role must be selected' });
      }
  
      if (!subject || !message) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: 'Subject and message are required' });
      }
  
      let targetCustomers = [];
  
      // If sendToAllUsersInRoles is true, send to all users in the selected roles
      if (sendToAllUsersInRoles) {
        targetCustomers = await Customer.find({
          role: { $in: roles },
          isDeactivated: false
        }).session(session);
      } 
      // Otherwise, send to specific customers
      else if (customers && customers.length > 0) {
        targetCustomers = await Customer.find({
          _id: { $in: customers },
          isDeactivated: false
        }).session(session);
      } else {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          success: false, 
          message: 'Either select specific customers or choose to send to all users in selected roles' 
        });
      }
  
      if (targetCustomers.length === 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ success: false, message: 'No active customers found with the selected criteria' });
      }
  
      // Create notifications for each customer
      const notificationPromises = targetCustomers.map(customer => {
        const notification = new Notification({
          user: customer._id,
          content: `${subject}: ${message}`,
          url: url || null,
          read: false
        });
        return notification.save({ session });
      });
  
      // Save all customer notifications
      const savedNotifications = await Promise.all(notificationPromises);
  
      // Create admin notification about the bulk send
      const roleNames = await UserRole.find({ _id: { $in: roles } })
        .select('role_name')
        .session(session);
        
      const roleNamesString = roleNames.map(r => r.role_name).join(', ');
      
      const adminNotification = new AdminNotification({
        user: adminId,
        type: 'NOTIFICATION',
        content: `Notification "${subject}" sent to ${targetCustomers.length} users from roles: ${roleNamesString}`,
        priority: 'medium',
        read: false
      });
  
      await adminNotification.save({ session });
      
      // Commit the transaction
      await session.commitTransaction();
      session.endSession();
  
      return res.status(200).json({
        success: true,
        message: `Notifications sent successfully to ${targetCustomers.length} users`,
        notificationsSent: savedNotifications.length
      });
    } catch (error) {
      // Abort transaction on error
      await session.abortTransaction();
      session.endSession();
      
      console.error('Error sending notifications:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to send notifications',
        error: error.message
      });
    }
}






const getCustomersByRole = async (req, res) => {
    try {
      const { roleId } = req.params;
  
      if (!roleId) {
        return res.status(400).json({ success: false, message: 'Role ID is required' });
      }
  
      const customers = await Customer.find({
        role: roleId,
        isDeactivated: false
      }).select('username email phone_number');
  
      return res.status(200).json({
        success: true,
        data: customers
      });
    } catch (error) {
      console.error('Error fetching customers by role:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch customers',
        error: error.message
      });
    }
  };



module.exports = {
    sendNotifications,
    getCustomersByRole
};