// config/emailTemplates.js
const courseAssignmentTemplate = (courseData, actionType, recipientName) => {
  const isUpdate = actionType === 'update';
  const actionText = isUpdate ? 'Updated' : 'New Course Available';
  const actionColor = isUpdate ? '#f39c12' : '#27ae60';
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Course ${actionText}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden;">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, ${actionColor} 0%, ${actionColor}dd 100%); padding: 30px; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">
                    📚 ${actionText}
                  </h1>
                  <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">
                    ${isUpdate ? 'Course has been updated with new content' : 'A new course has been assigned to you'}
                  </p>
                </td>
              </tr>
              
              <!-- Content -->
              <tr>
                <td style="padding: 40px 30px;">
                  <div style="margin-bottom: 30px;">
                    <h2 style="color: #2c3e50; margin: 0 0 10px 0; font-size: 24px; font-weight: 600;">
                      Hello ${recipientName}! 👋
                    </h2>
                    <p style="color: #7f8c8d; margin: 0; font-size: 16px; line-height: 1.6;">
                      ${isUpdate ? 'Great news! One of your assigned courses has been updated with new content.' : 'Exciting news! A new course has been assigned to you.'}
                    </p>
                  </div>
                  
                  <!-- Course Card -->
                  <div style="background: #f8f9fa; border-radius: 8px; padding: 25px; margin: 30px 0; border-left: 4px solid ${actionColor};">
                    <div style="display: flex; align-items: center; margin-bottom: 15px;">
                      <div style="background: ${actionColor}; width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 15px;">
                        <span style="color: white; font-size: 20px; font-weight: bold;">📖</span>
                      </div>
                      <div>
                        <h3 style="color: #2c3e50; margin: 0; font-size: 20px; font-weight: 600;">
                          ${courseData.name}
                        </h3>
                        <p style="color: #7f8c8d; margin: 5px 0 0 0; font-size: 14px;">
                          ${courseData.courseType} • ${courseData.level} Level
                        </p>
                      </div>
                    </div>
                    
                    <p style="color: #555; margin: 15px 0; font-size: 15px; line-height: 1.6;">
                      ${courseData.description}
                    </p>
                    
                    <!-- Course Details -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0;">
                      <div style="background: white; padding: 15px; border-radius: 6px; text-align: center;">
                        <div style="color: ${actionColor}; font-size: 24px; font-weight: bold; margin-bottom: 5px;">
                          ⏱️ ${courseData.approximateHours}h
                        </div>
                        <div style="color: #7f8c8d; font-size: 12px;">Duration</div>
                      </div>
                      <div style="background: white; padding: 15px; border-radius: 6px; text-align: center;">
                        <div style="color: ${actionColor}; font-size: 24px; font-weight: bold; margin-bottom: 5px;">
                          📹 ${courseData.totalVideos || 0}
                        </div>
                        <div style="color: #7f8c8d; font-size: 12px;">Videos</div>
                      </div>
                    </div>
                    
                    ${courseData.chapters && courseData.chapters.length > 0 ? `
                    <div style="margin: 20px 0;">
                      <h4 style="color: #2c3e50; margin: 0 0 15px 0; font-size: 16px;">📚 Course Chapters:</h4>
                      <ul style="margin: 0; padding-left: 20px; color: #555;">
                        ${courseData.chapters.slice(0, 3).map(chapter => `
                          <li style="margin: 8px 0; font-size: 14px;">${chapter.title}</li>
                        `).join('')}
                        ${courseData.chapters.length > 3 ? `<li style="margin: 8px 0; font-size: 14px; color: #7f8c8d;">... and ${courseData.chapters.length - 3} more chapters</li>` : ''}
                      </ul>
                    </div>
                    ` : ''}
                  </div>
                  
                  <!-- CTA Button -->
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${process.env.BASE_URL}/courses/${courseData._id}" 
                       style="background: linear-gradient(135deg, ${actionColor} 0%, ${actionColor}dd 100%); 
                              color: white; 
                              text-decoration: none; 
                              padding: 15px 30px; 
                              border-radius: 25px; 
                              font-size: 16px; 
                              font-weight: 600; 
                              display: inline-block;
                              box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                              transition: all 0.3s ease;">
                      ${isUpdate ? '🔄 View Updates' : '🚀 Start Learning'}
                    </a>
                  </div>
                  
                  <!-- Additional Info -->
                  <div style="background: #e8f4fd; border-radius: 8px; padding: 20px; margin: 30px 0;">
                    <h4 style="color: #2980b9; margin: 0 0 10px 0; font-size: 16px;">
                      💡 What's Next?
                    </h4>
                    <ul style="color: #34495e; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.6;">
                      <li>Access the course from your dashboard</li>
                      <li>Complete all chapters to earn your certificate</li>
                      <li>Passing grade required: ${courseData.passingGrade || 70}%</li>
                      ${isUpdate ? '<li>Check out the new content and updates</li>' : '<li>Start with the first chapter when ready</li>'}
                    </ul>
                  </div>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background: #2c3e50; padding: 25px; text-align: center;">
                  <p style="color: #bdc3c7; margin: 0 0 10px 0; font-size: 14px;">
                    Best regards,<br>
                    <strong style="color: #ecf0f1;">${process.env.FROM_NAME || 'Learning Team'}</strong>
                  </p>
                  <p style="color: #95a5a6; margin: 0; font-size: 12px;">
                    This email was sent because a course was ${isUpdate ? 'updated' : 'assigned'} to your role or warehouse.
                    <br>
                    If you have any questions, contact us at ${process.env.FROM_EMAIL}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

module.exports = {
  courseAssignmentTemplate
};
