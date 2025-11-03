// helpers/courseAssignmentHelper.js
const { sendEmail } = require('../config/sendMails.js');
const { courseAssignmentTemplate } = require('../config/emailTemplates.js');
const { createBulkNotifications } = require('./notificationHelper.js');

const sendCourseAssignmentEmails = async (courseData, actionType = 'create') => {
  try {
    console.log(`📧 Starting ${actionType} email process for course: ${courseData.name}`);
    
    if (!courseData.accessControl || (!courseData.accessControl.roles?.length && !courseData.accessControl.stores?.length)) {
      console.log('⚠️ No roles or stores assigned to this course');
      return { success: true, message: 'No recipients to notify' };
    }

    // Get users from assigned roles and stores
    const recipients = await getUsersFromAccessControl(courseData.accessControl);
    
    if (recipients.length === 0) {
      console.log('⚠️ No users found for assigned roles/stores');
      return { success: true, message: 'No users found to notify' };
    }

    console.log(`📬 Found ${recipients.length} recipients`);

    // Send emails and create notifications
    const emailPromises = [];
    const notificationContent = actionType === 'update' 
      ? `Course "${courseData.name}" has been updated with new content. Check it out!`
      : `New course "${courseData.name}" has been assigned to you. Start learning now!`;
    
    const courseUrl = `/courses/${courseData._id}`;

    // Create notifications for all users
    const userIds = recipients.map(user => user._id);
    await createBulkNotifications(userIds, notificationContent, courseUrl);

    // Send emails
    for (const user of recipients) {
      const emailHtml = courseAssignmentTemplate(courseData, actionType, user.name || user.email);
      
      const mailOptions = {
        to: user.email,
        subject: actionType === 'update' 
          ? `📚 Course Updated: ${courseData.name}`
          : `🎓 New Course Assigned: ${courseData.name}`,
        html: emailHtml,
        text: `${actionType === 'update' ? 'Course Updated' : 'New Course Assigned'}: ${courseData.name}. ${notificationContent}`
      };

      emailPromises.push(
        sendEmail(mailOptions).catch(error => {
          console.error(`❌ Failed to send email to ${user.email}:`, error.message);
          return { error: error.message, email: user.email };
        })
      );
    }

    // Wait for all emails to be sent
    const emailResults = await Promise.all(emailPromises);
    const successCount = emailResults.filter(result => !result.error).length;
    const failCount = emailResults.filter(result => result.error).length;

    console.log(`✅ Email process completed: ${successCount} sent, ${failCount} failed`);
    
    return {
      success: true,
      message: `Notifications sent to ${recipients.length} users`,
      emailResults: {
        sent: successCount,
        failed: failCount,
        total: recipients.length
      }
    };

  } catch (error) {
    console.error('❌ Error in course assignment email process:', error);
    throw error;
  }
};




const getUsersFromAccessControl = async (accessControl) => {
  try {
    const User = require('../models/user.model.js'); // Adjust path as needed
    const users = [];

    // Get users by roles
    if (accessControl.roles && accessControl.roles.length > 0) {
      const roleUsers = await User.find({
        role: { $in: accessControl.roles },
        email: { $exists: true, $ne: null }
      }).select('_id name email role');
      
      users.push(...roleUsers);
    }

    // Get users by stores/warehouses
    if (accessControl.stores && accessControl.stores.length > 0) {
      const storeUsers = await User.find({
        warehouse: { $in: accessControl.stores },
        email: { $exists: true, $ne: null }
      }).select('_id name email warehouse');
      
      users.push(...storeUsers);
    }

    // Remove duplicates based on email
    const uniqueUsers = users.filter((user, index, self) => 
      index === self.findIndex(u => u.email === user.email)
    );

    return uniqueUsers;
  } catch (error) {
    console.error('❌ Error getting users from access control:', error);
    return [];
  }
};


module.exports = {
  sendCourseAssignmentEmails,
  getUsersFromAccessControl
};
