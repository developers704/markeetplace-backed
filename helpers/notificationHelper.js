// helpers/notificationHelper.js
const Notification = require('../models/notification.model.js');
const Customer = require('../models/customer.model.js');
const { sendEmail } = require('../config/sendMails.js');

const createNotification = async (userId, content, url = null) => {
  try {
    const notification = new Notification({
      user: userId,
      content: content,
      url: url,
      read: false
    });
    
    await notification.save();
    console.log(`✅ Notification created for user: ${userId}`);
    return notification;
  } catch (error) {
    console.error('❌ Error creating notification:', error);
    throw error;
  }
};

const createBulkNotifications = async (userIds, content, url = null) => {
  try {
    const notifications = userIds.map(userId => ({
      user: userId,
      content: content,
      url: url,
      read: false
    }));
    
    await Notification.insertMany(notifications);
    console.log(`✅ ${notifications.length} notifications created`);
    return notifications;
  } catch (error) {
    console.error('❌ Error creating bulk notifications:', error);
    throw error;
  }
};


// Policy update notification functionality
const sendPolicyUpdateNotifications = async (policy) => {
  try {
    console.log('📧 Starting policy update notifications...');
    
    // Find customers based on applicable roles and warehouses
    let customers = [];
    
    // Build query for customers
    const customerQuery = {
      isDeactivated: false,
      email: { $exists: true, $ne: null, $ne: '' }
    };
    
    // Add role filter if applicable roles exist
    if (policy.applicableRoles && policy.applicableRoles.length > 0) {
      customerQuery.role = { $in: policy.applicableRoles };
    }
    
    // Add warehouse filter if applicable warehouses exist
    if (policy.applicableWarehouses && policy.applicableWarehouses.length > 0) {
      customerQuery.warehouse = { $in: policy.applicableWarehouses };
    }
    
    customers = await Customer.find(customerQuery)
      .populate('role', 'role_name')
      .populate('warehouse', 'name')
      .select('_id email username role warehouse');
    
    console.log(`�� Found ${customers.length} customers to notify`);
    
    if (customers.length === 0) {
      console.log('⚠️ No customers found matching policy criteria');
      return { success: true, message: 'No customers to notify' };
    }
    
    // Create email template
    const emailTemplate = createPolicyUpdateEmailTemplate(policy);
    
    // Send emails and create notifications
    const emailPromises = [];
    const notificationPromises = [];
    
    for (const customer of customers) {
      // Send email
      if (customer.email) {
        const emailPromise = sendEmail({
          to: customer.email,
          subject: `Policy Update: ${policy.title}`,
          html: emailTemplate,
          text: `Policy Update: ${policy.title} - ${policy.content.substring(0, 200)}...`
        }).catch(error => {
          console.error(`❌ Error sending email to ${customer.email}:`, error.message);
          return { success: false, error: error.message };
        });
        emailPromises.push(emailPromise);
      }
      
      // Create in-app notification
      const notificationContent = `Policy "${policy.title}" has been updated. Please review the latest version.`;
      const notificationPromise = createNotification(
        customer._id,
        notificationContent,
        '/policies' // URL to policies page
      ).catch(error => {
        console.error(`❌ Error creating notification for customer ${customer._id}:`, error.message);
        return null;
      });
      notificationPromises.push(notificationPromise);
    }
    
    // Wait for all emails and notifications to complete
    const emailResults = await Promise.allSettled(emailPromises);
    const notificationResults = await Promise.allSettled(notificationPromises);
    
    // Count successful operations
    const successfulEmails = emailResults.filter(result => 
      result.status === 'fulfilled' && result.value?.success !== false
    ).length;
    
    const successfulNotifications = notificationResults.filter(result => 
      result.status === 'fulfilled' && result.value !== null
    ).length;
    
    console.log(`✅ Policy update notifications completed:`);
    console.log(`   - Emails sent: ${successfulEmails}/${customers.length}`);
    console.log(`   - Notifications created: ${successfulNotifications}/${customers.length}`);
    
    return {
      success: true,
      message: `Policy update notifications sent successfully`,
      stats: {
        totalCustomers: customers.length,
        emailsSent: successfulEmails,
        notificationsCreated: successfulNotifications
      }
    };
    
  } catch (error) {
    console.error('❌ Error sending policy update notifications:', error);
    throw error;
  }
};

// Create email template for policy updates
const createPolicyUpdateEmailTemplate = (policy) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Policy Update - Valliani's University</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f8f9fa;
            }
            .container {
                background-color: #ffffff;
                border-radius: 10px;
                padding: 30px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header {
                text-align: center;
                border-bottom: 3px solid #007bff;
                padding-bottom: 20px;
                margin-bottom: 30px;
            }
            .logo {
                font-size: 24px;
                font-weight: bold;
                color: #007bff;
                margin-bottom: 10px;
            }
            .subtitle {
                color: #666;
                font-size: 14px;
            }
            .policy-title {
                background-color: #f8f9fa;
                padding: 15px;
                border-left: 4px solid #007bff;
                margin: 20px 0;
                border-radius: 5px;
            }
            .policy-content {
                background-color: #f8f9fa;
                padding: 20px;
                border-radius: 8px;
                margin: 20px 0;
                white-space: pre-wrap;
                font-family: 'Courier New', monospace;
                font-size: 14px;
                line-height: 1.5;
            }
            .version-info {
                background-color: #e9ecef;
                padding: 10px;
                border-radius: 5px;
                margin: 15px 0;
                text-align: center;
                font-weight: bold;
                color: #495057;
            }
            .footer {
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #dee2e6;
                text-align: center;
                color: #666;
                font-size: 12px;
            }
            .button {
                display: inline-block;
                background-color: #007bff;
                color: white;
                padding: 12px 24px;
                text-decoration: none;
                border-radius: 5px;
                margin: 20px 0;
                font-weight: bold;
            }
            .button:hover {
                background-color: #0056b3;
            }
            .highlight {
                background-color: #fff3cd;
                border: 1px solid #ffeaa7;
                padding: 15px;
                border-radius: 5px;
                margin: 20px 0;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">��️ Valliani's University</div>
                <div class="subtitle">Policy Update Notification</div>
            </div>
            
            <h2>📋 Important Policy Update</h2>
            
            <p>Dear Valued Member,</p>
            
            <p>We are writing to inform you that an important policy has been updated in our system. Please take a moment to review the changes below.</p>
            
            <div class="policy-title">
                <strong>Policy Title:</strong> ${policy.title}
            </div>
            
            <div class="version-info">
                📄 Version: ${policy.version} | 📅 Updated: ${new Date().toLocaleDateString()}
            </div>
            
            <div class="highlight">
                <strong>⚠️ Action Required:</strong> Please review the updated policy content below to ensure you are aware of any changes that may affect you.
            </div>
            
            <h3>Policy Content:</h3>
            <div class="policy-content">${policy.content}</div>
            
          
            
            <p><strong>Why are you receiving this notification?</strong></p>
            <p>You are receiving this notification because this policy applies to your role or location within Valliani's University. It is important that you stay informed about policy changes that may affect your responsibilities and rights.</p>
            
            <p>If you have any questions about this policy update, please don't hesitate to contact our support team.</p>
            
            <div class="footer">
                <p>Best regards,<br>
                <strong>Valliani's University Team</strong></p>
                <p>This is an automated notification. Please do not reply to this email.</p>
                <p>© ${new Date().getFullYear()} Valliani's University. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
  `;
};

module.exports = {
  createNotification,
  createBulkNotifications,
  sendPolicyUpdateNotifications
};
