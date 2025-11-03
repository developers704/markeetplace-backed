const CertificateRequest = require('../models/certificateRequest.model.js');
const Course = require('../models/course.model.js');
const Customer = require('../models/customer.model.js'); // Assuming this is your user model
const mongoose = require('mongoose');
const PresidentSignature = require('../models/presidentSignature.model');
const AdminNotification = require('../models/adminNotification.model.js');
const Notification = require('../models/notification.model.js');
const User = require('../models/user.model.js');

// Request certificate (by user)
// const requestCertificate = async (req, res) => {
//   try {
//     console.log('Certificate request received:', req.body);
//     console.log('Files received:', req.files);

//     const { courseId } = req.body;
//     const userId = req.user.id; // Assuming user is authenticated
//     console.log('User ID:', userId);

//     // Validate required fields
//     if (!courseId) {
//       return res.status(400).json({
//         success: false,
//         message: 'Course ID is required'
//       });
//     }

//     // Check if user signature is uploaded
//     if (!req.files || !req.files.userSignature || req.files.userSignature.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: 'User signature image is required'
//       });
//     }

//     // Validate course ID
//     if (!mongoose.Types.ObjectId.isValid(courseId)) {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid course ID'
//       });
//     }

//     // Get user details
//     const user = await Customer.findById(userId).select('username');
//     console.log('User:', user.username);
//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: 'User not found'
//       });
//     }

//     // Find the course and user's enrollment
//     const course = await Course.findById(courseId);
//     if (!course) {
//       return res.status(404).json({
//         success: false,
//         message: 'Course not found'
//       });
//     }

//     // Find user's enrollment in the course
//     const userEnrollment = course.enrolledUsers.find(
//       enrollment => enrollment.user.toString() === userId
//     );

//     if (!userEnrollment) {
//       return res.status(400).json({
//         success: false,
//         message: 'You are not enrolled in this course'
//       });
//     }

//     // Check if course is completed
//     if (!userEnrollment.certificateEarned) {
//       return res.status(400).json({
//         success: false,
//         message: 'Course not completed yet. Complete all chapters and quizzes first.',
//         currentProgress: {
//           progress: userEnrollment.progress,
//           gradePercentage: userEnrollment.gradePercentage,
//           gradeLabel: userEnrollment.gradeLabel,
//           certificateEarned: userEnrollment.certificateEarned
//         }
//       });
//     }

//     // Check if certificate request already exists
//     const existingRequest = await CertificateRequest.findOne({
//       user: userId,
//       course: courseId
//     });

//     if (existingRequest) {
//       return res.status(400).json({
//         success: false,
//         message: `Certificate request already exists with status: ${existingRequest.status}`,
//         existingRequest: {
//           id: existingRequest._id,
//           status: existingRequest.status,
//           certificateId: existingRequest.certificateId,
//           createdAt: existingRequest.createdAt,
//           userSignaturePath: existingRequest.userSignaturePath,
//           presidentSignaturePath: existingRequest.presidentSignaturePath,
//           certificateImagePath: existingRequest.certificateImagePath
//         }
//       });
//     }

//     // Process user signature - STORE PATH
//     const userSignaturePath = req.files.userSignature[0].path.replace(/\\/g, '/');
//     console.log('User signature stored at:', userSignaturePath);

//     // Calculate completion data
//     const completedChapters = userEnrollment.chapterProgress.filter(cp => cp.completed).length;
//     const totalQuizzes = userEnrollment.chapterProgress.reduce((total, cp) => {
//       return total + cp.sectionProgress.filter(sp => sp.quizProgress && sp.quizProgress.quizId).length;
//     }, 0);
//     const passedQuizzes = userEnrollment.chapterProgress.reduce((total, cp) => {
//       return total + cp.sectionProgress.filter(sp => sp.quizProgress && sp.quizProgress.passed).length;
//     }, 0);

//     // Create certificate request with all paths
//     const certificateRequest = new CertificateRequest({
//       user: userId,
//       course: courseId,
//       userName: user.username, // Store user name for certificate
//       userSignaturePath: userSignaturePath, // Store user signature path
//       presidentSignaturePath: null, // Will be set when admin approves
//       certificateImagePath: null, // Will be set when certificate is generated
//       completionData: {
//         completionDate: userEnrollment.completionDate || new Date(),
//         finalGrade: userEnrollment.overallGrade,
//         gradePercentage: userEnrollment.gradePercentage,
//         gradeLabel: userEnrollment.gradeLabel,
//         totalChapters: course.chapters.length,
//         completedChapters: completedChapters,
//         totalQuizzes: totalQuizzes,
//         passedQuizzes: passedQuizzes
//       }
//     });

//     await certificateRequest.save();

//     // Update course enrollment status
//     await Course.findOneAndUpdate(
//       { 
//         _id: courseId,
//         'enrolledUsers.user': userId
//       },
//       {
//         $set: {
//           'enrolledUsers.$.certificateRequestStatus': 'Pending'
//         }
//       }
//     );

//     // Populate course and user data for response
//     await certificateRequest.populate([
//       { path: 'course', select: 'name description level courseType' },
//       { path: 'user', select: 'name email' }
//     ]);

//     res.status(201).json({
//       success: true,
//       message: 'Certificate request submitted successfully',
//       certificateRequest: {
//         id: certificateRequest._id,
//         status: certificateRequest.status,
//         userName: certificateRequest.userName,
//         userSignaturePath: certificateRequest.userSignaturePath,
//         presidentSignaturePath: certificateRequest.presidentSignaturePath,
//         certificateImagePath: certificateRequest.certificateImagePath,
//         course: certificateRequest.course,
//         completionData: certificateRequest.completionData,
//         createdAt: certificateRequest.createdAt
//       }
//     });

//   } catch (error) {
//     console.error('Error requesting certificate:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to submit certificate request',
//       error: error.message
//     });
//   }
// };


// Fixed helper function to send notifications
const sendCertificateRequestNotifications = async (certificateRequest) => {
  try {
    // 🆕 Make sure course is populated
    if (!certificateRequest.course || !certificateRequest.course.name) {
      await certificateRequest.populate('course', 'name description');
    }

    // 🆕 Make sure user is populated  
    if (!certificateRequest.user || !certificateRequest.user.username) {
      await certificateRequest.populate('user', 'username email');
    }

    console.log('Sending notifications for certificate request:', {
      courseId: certificateRequest.course._id,
      courseName: certificateRequest.course.name,
      userName: certificateRequest.userName || certificateRequest.user.username,
      requestId: certificateRequest._id
    });

    // 1. Send notification to customer (success notification)
    const customerNotification = new Notification({
      user: certificateRequest.user._id || certificateRequest.user,
      content: `Your certificate request for "${certificateRequest.course.name}" has been submitted successfully and is under review.`,
      url: `/courses/certificate-status/${certificateRequest.course._id}`
    });
    await customerNotification.save();
    console.log('✅ Customer notification created');

    // 2. Send notification to all super users (admins)
    const superUsers = await User.find({ is_superuser: true }).select('_id username');
    console.log('Found super users:', superUsers.length);
    
    if (superUsers.length > 0) {
      const adminNotifications = superUsers.map(admin => ({
        user: admin._id,
        type: 'CERTIFICATE',
        content: `New certificate request from ${certificateRequest.userName || certificateRequest.user.username} for course "${certificateRequest.course.name}"`,
        resourceId: certificateRequest._id,
        resourceModel: 'CertificateRequest',
        priority: 'medium'
      }));

      const result = await AdminNotification.insertMany(adminNotifications);
      console.log('✅ Admin notifications created:', result.length);
    } else {
      console.log('⚠️ No super users found');
    }

    console.log('Certificate request notifications sent successfully');
  } catch (error) {
    console.error('❌ Error sending certificate request notifications:', error);
    // Log more details for debugging
    console.error('Certificate request data:', {
      id: certificateRequest._id,
      course: certificateRequest.course,
      user: certificateRequest.user,
      userName: certificateRequest.userName
    });
  }
};


const requestCertificate = async (req, res) => {
  try {
    console.log('Certificate request received:', req.body);
    console.log('Files received:', req.files);

    const { courseId } = req.body;
    const userId = req.user.id;
    console.log('User ID:', userId);

    // Validate required fields
    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: 'Course ID is required'
      });
    }

    // Check if user signature is uploaded
    if (!req.files || !req.files.userSignature || req.files.userSignature.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'User signature image is required'
      });
    }

    // Validate course ID
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid course ID'
      });
    }

    // Get user details
    const user = await Customer.findById(userId).select('username');
    console.log('User:', user.username);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Find the course and user's enrollment
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Find user's enrollment in the course
    const userEnrollment = course.enrolledUsers.find(
      enrollment => enrollment.user.toString() === userId
    );

    if (!userEnrollment) {
      return res.status(400).json({
        success: false,
        message: 'You are not enrolled in this course'
      });
    }

    // 🆕 CHECK IF COURSE IS COMPLETED AND ELIGIBLE FOR CERTIFICATE
    if (userEnrollment.status !== 'Completed') {
      return res.status(400).json({
        success: false,
        message: 'Course not completed yet. Complete all chapters and quizzes first.',
        currentProgress: {
          status: userEnrollment.status,
          progress: userEnrollment.progress,
          gradePercentage: userEnrollment.gradePercentage,
          gradeLabel: userEnrollment.gradeLabel,
          certificateEligible: false
        }
      });
    }

    // 🆕 CHECK CERTIFICATE REQUEST STATUS
    if (userEnrollment.certificateRequestStatus === 'Requested') {
      return res.status(400).json({
        success: false,
        message: 'Certificate request already submitted and pending approval'
      });
    }

    if (userEnrollment.certificateRequestStatus === 'Approved') {
      return res.status(400).json({
        success: false,
        message: 'Certificate has already been approved'
      });
    }

    // Check if certificate request already exists in CertificateRequest collection
    const existingRequest = await CertificateRequest.findOne({
      user: userId,
      course: courseId
    });

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: `Certificate request already exists with status: ${existingRequest.status}`,
        existingRequest: {
          id: existingRequest._id,
          status: existingRequest.status,
          certificateId: existingRequest.certificateId,
          createdAt: existingRequest.createdAt
        }
      });
    }

    // Process user signature
    const userSignaturePath = req.files.userSignature[0].path.replace(/\\/g, '/');
    console.log('User signature stored at:', userSignaturePath);

    // Calculate completion data
    const completedChapters = userEnrollment.chapterProgress.filter(cp => cp.completed).length;
    const totalQuizzes = userEnrollment.chapterProgress.reduce((total, cp) => {
      return total + cp.sectionProgress.filter(sp => sp.quizProgress && sp.quizProgress.quizId).length;
    }, 0);
    const passedQuizzes = userEnrollment.chapterProgress.reduce((total, cp) => {
      return total + cp.sectionProgress.filter(sp => sp.quizProgress && sp.quizProgress.passed).length;
    }, 0);

    // Create certificate request
    const certificateRequest = new CertificateRequest({
      user: userId,
      course: courseId,
      userName: user.username,
      userSignaturePath: userSignaturePath,
      presidentSignaturePath: null,
      certificateImagePath: null,
      completionData: {
        completionDate: userEnrollment.completionDate || new Date(),
        finalGrade: userEnrollment.overallGrade,
        gradePercentage: userEnrollment.gradePercentage,
        gradeLabel: userEnrollment.gradeLabel,
        totalChapters: course.chapters.length,
        completedChapters: completedChapters,
        totalQuizzes: totalQuizzes,
        passedQuizzes: passedQuizzes
      }
    });

    await certificateRequest.save();

    // 🆕 UPDATE COURSE ENROLLMENT STATUS
   const enrollmentIndex = course.enrolledUsers.findIndex(
      enrollment => enrollment.user.toString() === userId
    );

    if (enrollmentIndex !== -1) {
      // course.enrolledUsers[enrollmentIndex].status = 'Requested'; // 🆕 CHANGE STATUS
      course.enrolledUsers[enrollmentIndex].certificateRequestStatus = 'Requested';
      course.enrolledUsers[enrollmentIndex].certificateRequestId = certificateRequest._id;
      await course.save();
    }

    // Populate course and user data for response
    await certificateRequest.populate([
      { path: 'course', select: 'name description level courseType' },
      { path: 'user', select: 'name email' }
    ]);

    await sendCertificateRequestNotifications(certificateRequest);

    res.status(201).json({
      success: true,
      message: 'Certificate request submitted successfully',
      certificateRequest: {
        id: certificateRequest._id,
        status: certificateRequest.status,
        userName: certificateRequest.userName,
        userSignaturePath: certificateRequest.userSignaturePath,
        course: certificateRequest.course,
        completionData: certificateRequest.completionData,
        createdAt: certificateRequest.createdAt
      }
    });

  } catch (error) {
    console.error('Error requesting certificate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit certificate request',
      error: error.message
    });
  }
};


// Get user's certificate requests
const getUserCertificateRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    const requests = await CertificateRequest.find({ user: userId })
      .populate('course', 'name description level courseType thumbnail')
      .sort({ createdAt: -1 });

    // Format response with all paths
    const formattedRequests = requests.map(request => ({
      id: request._id,
      status: request.status,
      certificateId: request.certificateId,
      userName: request.userName,
      userSignaturePath: request.userSignaturePath,
      presidentSignaturePath: request.presidentSignaturePath,
      certificateImagePath: request.certificateImagePath,
      course: request.course,
      completionData: request.completionData,
      reviewComments: request.reviewComments,
      createdAt: request.createdAt,
      reviewedAt: request.reviewedAt
    }));

    res.status(200).json({
      success: true,
      message: 'Certificate requests retrieved successfully',
      requests: formattedRequests
    });

  } catch (error) {
    console.error('Error getting certificate requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get certificate requests',
      error: error.message
    });
  }
};

// Get all certificate requests (admin only)
const getAllCertificateRequests = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const filter = {};
    if (status) {
      filter.status = status;
    }

    const skip = (page - 1) * limit;

    const requests = await CertificateRequest.find(filter)
      .populate({
        path: 'user',
        select: 'username email phone_number role warehouse department',
        populate: [
          { path: 'role', select: 'role_name' },
          { path: 'warehouse', select: 'name location' },
          { path: 'department', select: 'name code' }
        ]
      })
      .populate('course', 'name description level courseType')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Format response with all paths
    const formattedRequests = requests.map(request => ({
      id: request._id,
      status: request.status,
      certificateId: request.certificateId,
      userName: request.userName,
      userSignaturePath: request.userSignaturePath,
      presidentSignaturePath: request.presidentSignaturePath,
      certificateImagePath: request.certificateImagePath,
      user: request.user,
      course: request.course,
      completionData: request.completionData,
      reviewedBy: request.reviewedBy,
      reviewComments: request.reviewComments,
      createdAt: request.createdAt,
      reviewedAt: request.reviewedAt
    }));

    const total = await CertificateRequest.countDocuments(filter);

    res.status(200).json({
      success: true,
      message: 'Certificate requests retrieved successfully',
      requests: formattedRequests,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        count: requests.length,
        totalRequests: total
      }
    });

  } catch (error) {
    console.error('Error getting all certificate requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get certificate requests',
      error: error.message
    });
  }
};

// Approve certificate request (admin only)
// const approveCertificateRequest = async (req, res) => {
//   try {
//     console.log('Approve certificate request:', req.body);
//     console.log('Files received:', req.files);

//     const { requestId } = req.params;
//     const { comments } = req.body;
//     const adminId = req.user.id; // Assuming admin is authenticated

//     // Validate request ID
//     if (!mongoose.Types.ObjectId.isValid(requestId)) {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid request ID'
//       });
//     }

//     // Check if president signature is uploaded
//     if (!req.files || !req.files.presidentSignature || req.files.presidentSignature.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: 'President signature image is required for approval'
//       });
//     }

//     // Find the certificate request
//     const certificateRequest = await CertificateRequest.findById(requestId)
//       .populate('user', 'name email')
//       .populate('course', 'name description');

//     if (!certificateRequest) {
//       return res.status(404).json({
//         success: false,
//         message: 'Certificate request not found'
//       });
//     }

//     // Check if already processed
//     if (certificateRequest.status !== 'Pending') {
//       return res.status(400).json({
//         success: false,
//         message: `Certificate request already ${certificateRequest.status.toLowerCase()}`,
//         currentStatus: {
//           status: certificateRequest.status,
//           userSignaturePath: certificateRequest.userSignaturePath,
//           presidentSignaturePath: certificateRequest.presidentSignaturePath,
//           certificateImagePath: certificateRequest.certificateImagePath
//         }
//       });
//     }

//     // Process president signature - STORE PATH
//     const presidentSignaturePath = req.files.presidentSignature[0].path.replace(/\\/g, '/');
//     console.log('President signature stored at:', presidentSignaturePath);

//     // Update certificate request with president signature path
//     certificateRequest.status = 'Approved';
//     certificateRequest.presidentSignaturePath = presidentSignaturePath; // Store president signature path
//     certificateRequest.reviewedBy = adminId;
//     certificateRequest.reviewedAt = new Date();
//     certificateRequest.reviewComments = comments || 'Certificate approved';

//     await certificateRequest.save();

//     // Update course enrollment status
//     await Course.findOneAndUpdate(
//       { 
//         _id: certificateRequest.course._id,
//         'enrolledUsers.user': certificateRequest.user._id
//       },
//       {
//         $set: {
//           'enrolledUsers.$.certificateRequestStatus': 'Approved'
//         }
//       }
//     );

//     res.status(200).json({
//       success: true,
//       message: 'Certificate request approved successfully',
//       certificateRequest: {
//         id: certificateRequest._id,
//         certificateId: certificateRequest.certificateId,
//         status: certificateRequest.status,
//         userName: certificateRequest.userName,
//         userSignaturePath: certificateRequest.userSignaturePath,
//         presidentSignaturePath: certificateRequest.presidentSignaturePath, // Return president signature path
//         certificateImagePath: certificateRequest.certificateImagePath,
//         user: certificateRequest.user,
//         course: certificateRequest.course,
//         reviewedAt: certificateRequest.reviewedAt,
//         reviewComments: certificateRequest.reviewComments
//       }
//     });

//   } catch (error) {
//     console.error('Error approving certificate request:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to approve certificate request',
//       error: error.message
//     });
//   }
// };



const approveCertificateRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { action, comments } = req.body; // action: 'approve' or 'reject'
    const adminId = req.user.id;

    // Validate request ID
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID'
      });
    }

    // Find certificate request
    const certificateRequest = await CertificateRequest.findById(requestId)
      .populate('user', 'username email')
      .populate('course', 'name');

    if (!certificateRequest) {
      return res.status(404).json({
        success: false,
        message: 'Certificate request not found'
      });
    }

    // Check if already processed
    if (certificateRequest.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: `Certificate request already ${certificateRequest.status.toLowerCase()}`
      });
    }

    // Handle president signature for approval
    // let presidentSignaturePath = null;
    // if (action === 'approve') {
    //   if (!req.files || !req.files.presidentSignature || req.files.presidentSignature.length === 0) {
    //     return res.status(400).json({
    //       success: false,
    //       message: 'President signature is required for approval'
    //     });
    //   }
    //   presidentSignaturePath = req.files.presidentSignature[0].path.replace(/\\/g, '/');
    // }

    let presidentSignaturePath = null;
    if (action === 'approve') {
      // 🆕 GET PRESIDENT SIGNATURE FROM DATABASE
      const presidentSignature = await PresidentSignature.findOne({ 
        presidentId: adminId, 
        isActive: true 
      });

      if (!presidentSignature) {
        return res.status(400).json({
          success: false,
          message: 'President signature not found. Please upload your signature first.',
          action: 'upload_signature_required'
        });
      }

      presidentSignaturePath = presidentSignature.signaturePath;
    }


    // Update certificate request
    certificateRequest.status = action === 'approve' ? 'Approved' : 'Rejected';
    certificateRequest.reviewedBy = adminId;
    certificateRequest.reviewedAt = new Date();
    certificateRequest.reviewComments = comments || null;
    
    if (presidentSignaturePath) {
      certificateRequest.presidentSignaturePath = presidentSignaturePath;
    }

    await certificateRequest.save();

    // 🆕 UPDATE COURSE ENROLLMENT STATUS
    const course = await Course.findById(certificateRequest.course._id);
    const enrollmentIndex = course.enrolledUsers.findIndex(
      enrollment => enrollment.user.toString() === certificateRequest.user._id.toString()
    );

    if (enrollmentIndex !== -1) {
      if (action === 'approve') {
        // 🆕 SET STATUS TO DONE WHEN APPROVED
        course.enrolledUsers[enrollmentIndex].status = 'Done';
        course.enrolledUsers[enrollmentIndex].certificateRequestStatus = 'Approved';
      } else {
        // 🆕 BACK TO COMPLETED IF REJECTED (CAN REQUEST AGAIN)
        // course.enrolledUsers[enrollmentIndex].status = 'Completed';
        course.enrolledUsers[enrollmentIndex].certificateRequestStatus = 'Rejected';
      }
      await course.save();
    }

    await sendCertificateNotification(certificateRequest.user._id, action, certificateRequest);

    res.status(200).json({
      success: true,
      message: `Certificate request ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
      certificateRequest: {
        id: certificateRequest._id,
        status: certificateRequest.status,
        reviewedAt: certificateRequest.reviewedAt,
        reviewComments: certificateRequest.reviewComments,
        certificateId: certificateRequest.certificateId,
        presidentSignaturePath: presidentSignaturePath
      }
    });

  } catch (error) {
    console.error('Error processing certificate request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process certificate request',
      error: error.message
    });
  }
};




// get certificate by course id:
const getCertificateByUserAndCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id; // From auth middleware

    console.log('Getting certificate for user:', userId, 'course:', courseId);

    // Validate course ID
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid course ID'
      });
    }

    // Find certificate request for this user and course
    const certificateRequest = await CertificateRequest.findOne({
      user: userId,
      course: courseId
    })
    .populate('course', 'name description thumbnail level')
    .populate('user', 'username firstName lastName');

    // If no certificate request found
    if (!certificateRequest) {
      return res.status(404).json({
        success: false,
        message: 'No certificate request found for this course',
        data: {
          hasRequest: false,
          status: null
        }
      });
    }

    // If certificate is not approved yet
    if (certificateRequest.status !== 'Approved' && certificateRequest.status !== 'Certificate_Generated') {
      return res.status(200).json({
        success: false,
        message: `Certificate request is ${certificateRequest.status.toLowerCase()}. Please wait for approval.`,
        data: {
          hasRequest: true,
          status: certificateRequest.status,
          requestId: certificateRequest._id,
          requestedAt: certificateRequest.createdAt,
          statusMessage: getStatusMessage(certificateRequest.status)
        }
      });
    }

    // Certificate is approved - return signature paths
    res.status(200).json({
      success: true,
      message: 'Certificate approved! Signature paths retrieved successfully.',
      data: {
        hasRequest: true,
        status: certificateRequest.status,
        certificateId: certificateRequest.certificateId,
        
        // Signature Paths
        signatures: {
          userSignaturePath: certificateRequest.userSignaturePath,
          presidentSignaturePath: certificateRequest.presidentSignaturePath,
          certificateImagePath: certificateRequest.certificateImagePath
        },

        // Basic Info
        course: {
          _id: certificateRequest.course._id,
          name: certificateRequest.course.name,
          description: certificateRequest.course.description,
          thumbnail: certificateRequest.course.thumbnail,
          level: certificateRequest.course.level
        },

        user: {
          _id: certificateRequest.user._id,
          username: certificateRequest.user.username,
          fullName: `${certificateRequest.user.firstName || ''} ${certificateRequest.user.lastName || ''}`.trim()
        },

        // Completion Data
        completionData: {
          completionDate: certificateRequest.completionData.completionDate,
          gradePercentage: certificateRequest.completionData.gradePercentage,
          gradeLabel: certificateRequest.completionData.gradeLabel
        },

        // Timeline
        requestedAt: certificateRequest.createdAt,
        reviewedAt: certificateRequest.reviewedAt
      }
    });

  } catch (error) {
    console.error('Error getting certificate by course:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve certificate information',
      error: error.message
    });
  }
};

// Helper function for status messages
const getStatusMessage = (status) => {
  const messages = {
    'Pending': 'Your certificate request is under review by the administration.',
    'Rejected': 'Your certificate request has been rejected. Please check the feedback and resubmit.',
    'Approved': 'Your certificate has been approved and is being processed.',
    'Certificate_Generated': 'Your certificate is ready for download!'
  };
  
  return messages[status] || 'Unknown status';
};




// Updated sendCertificateNotification function
const sendCertificateNotification = async (userId, action, certificateRequest) => {
  try {
    const Notification = require('../models/notification.model');
    const AdminNotification = require('../models/adminNotification.model');
    const { sendEmail } = require('../config/sendMails');
    const Customer = require('../models/customer.model');
    const User = require('../models/user.model');

    // Get user details
    const user = await Customer.findById(userId).select('username email');
    if (!user) {
      console.log('❌ User not found:', userId);
      return;
    }

    // 🆕 Make sure certificateRequest has populated data
    if (!certificateRequest.course || !certificateRequest.course.name) {
      console.log('⚠️ Course not populated, populating now...');
      await certificateRequest.populate('course', 'name description');
    }

    console.log('📧 Sending certificate notification:', {
      action,
      userId,
      courseName: certificateRequest.course.name,
      userName: user.username,
      certificateId: certificateRequest.certificateId
    });

    let notificationContent = '';
    let adminNotificationContent = '';
    let emailSubject = '';
    let emailHtml = '';

    if (action === 'approve') {
      // Customer notification
      notificationContent = `Your certificate request for "${certificateRequest.course.name}" has been approved! 🎉`;
      
      // Admin notification
      adminNotificationContent = `Certificate request for "${certificateRequest.course.name}" by ${user.username} has been successfully approved.`;
      
      emailSubject = 'Certificate Approved - Congratulations!';
      emailHtml = `
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f8f9fa;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #28a745; text-align: center; margin-bottom: 30px;">🎉 Certificate Approved!</h2>
            <p style="font-size: 16px; line-height: 1.6;">Dear <strong>${user.username}</strong>,</p>
            <p style="font-size: 16px; line-height: 1.6;">Congratulations! Your certificate request for the course <strong>"${certificateRequest.course.name}"</strong> has been approved.</p>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Certificate ID:</strong> ${certificateRequest.certificateId}</p>
              <p style="margin: 5px 0;"><strong>Course:</strong> ${certificateRequest.course.name}</p>
              <p style="margin: 5px 0;"><strong>Approval Date:</strong> ${new Date().toLocaleDateString()}</p>
            </div>
            
            <p style="font-size: 16px; line-height: 1.6;">You can now download your certificate from your dashboard.</p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #666; font-size: 14px;">Best regards,<br><strong>Your Learning Team</strong></p>
          </div>
        </div>
      `;
    } else {
      // Customer notification
      notificationContent = `Your certificate request for "${certificateRequest.course.name}" has been rejected.`;
      
      // Admin notification
      adminNotificationContent = `Certificate request for "${certificateRequest.course.name}" by ${user.username} has been rejected.`;
      
      emailSubject = 'Certificate Request Update';
      emailHtml = `
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f8f9fa;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #dc3545; text-align: center; margin-bottom: 30px;">Certificate Request Update</h2>
            <p style="font-size: 16px; line-height: 1.6;">Dear <strong>${user.username}</strong>,</p>
            <p style="font-size: 16px; line-height: 1.6;">Your certificate request for the course <strong>"${certificateRequest.course.name}"</strong> has been rejected.</p>
            
            ${certificateRequest.reviewComments ? `
            <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Comments:</strong></p>
              <p style="margin: 10px 0 0 0;">${certificateRequest.reviewComments}</p>
            </div>
            ` : ''}
            
            <p style="font-size: 16px; line-height: 1.6;">You can submit a new request after addressing any issues mentioned.</p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #666; font-size: 14px;">Best regards,<br><strong>Your Learning Team</strong></p>
          </div>
        </div>
      `;
    }

    // 1. Create customer notification
    try {
      const customerNotification = new Notification({
        user: userId,
        content: notificationContent,
        url: `/courses/certificate-status/${certificateRequest.course._id}`
      });
      await customerNotification.save();
      console.log('✅ Customer notification created');
    } catch (customerNotifError) {
      console.error('❌ Error creating customer notification:', customerNotifError);
    }

    // 2. Send notification to all super users (admins)
    try {
      const superUsers = await User.find({ is_superuser: true }).select('_id username');
      console.log('👥 Found super users:', superUsers.length);
      
      if (superUsers.length > 0) {
        const adminNotifications = superUsers.map(admin => ({
          user: admin._id,
          type: 'CERTIFICATE',
          content: adminNotificationContent,
          resourceId: certificateRequest._id,
          resourceModel: 'CertificateRequest',
          priority: action === 'approve' ? 'high' : 'medium'
        }));

        const result = await AdminNotification.insertMany(adminNotifications);
        console.log('✅ Admin notifications created:', result.length);
        
        // Log each admin notification for debugging
        superUsers.forEach(admin => {
          console.log(`📢 Admin notification sent to: ${admin.username} (${admin._id})`);
        });
      } else {
        console.log('⚠️ No super users found in database');
      }
    } catch (adminNotifError) {
      console.error('❌ Error creating admin notifications:', adminNotifError);
    }

    // 3. Send email notification to customer
    if (user.email) {
      try {
        const mailOptions = {
          to: user.email,
          subject: emailSubject,
          html: emailHtml
        };

        const emailResult = await sendEmail(mailOptions);
        console.log('✅ Email sent successfully to:', user.email);
      } catch (emailError) {
        console.error('❌ Error sending email:', emailError);
        // Don't throw error, just log it - notifications should still work
      }
    } else {
      console.log('⚠️ No email address found for user:', user.username);
    }

    console.log(`🎉 Certificate ${action} notification process completed for user ${userId}`);

  } catch (error) {
    console.error('❌ Error in sendCertificateNotification:', error);
    console.error('Certificate request data:', {
      id: certificateRequest._id,
      course: certificateRequest.course,
      certificateId: certificateRequest.certificateId
    });
  }
};



// Generate final certificate with both signatures
const generateFinalCertificate = async (req, res) => {
  try {
    console.log('Generate final certificate:', req.body);
    console.log('Files received:', req.files);

    const { requestId } = req.params;
    const { certificateText } = req.body; // Optional custom text for certificate

    // Validate request ID
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID'
      });
    }

    // Check if final certificate image is uploaded
    if (!req.files || !req.files.certificateImage || req.files.certificateImage.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Final certificate image is required'
      });
    }

    // Find the certificate request
    const certificateRequest = await CertificateRequest.findById(requestId)
      .populate('user', 'name email')
      .populate('course', 'name description level courseType');

    if (!certificateRequest) {
      return res.status(404).json({
        success: false,
        message: 'Certificate request not found'
      });
    }

    // Check if request is approved
    if (certificateRequest.status !== 'Approved') {
      return res.status(400).json({
        success: false,
        message: 'Certificate request must be approved first',
        currentStatus: certificateRequest.status
      });
    }

    // Check if both signatures exist
    if (!certificateRequest.userSignaturePath || !certificateRequest.presidentSignaturePath) {
      return res.status(400).json({
        success: false,
        message: 'Both user and president signatures are required',
        signatures: {
          userSignature: !!certificateRequest.userSignaturePath,
          presidentSignature: !!certificateRequest.presidentSignaturePath
        }
      });
    }

    // Process final certificate image - STORE PATH
    const certificateImagePath = req.files.certificateImage[0].path.replace(/\\/g, '/');
    console.log('Final certificate image stored at:', certificateImagePath);

    // Update certificate request with final certificate path
    certificateRequest.status = 'Certificate_Generated';
    certificateRequest.certificateImagePath = certificateImagePath; // Store final certificate path

    await certificateRequest.save();

    // Update course enrollment with final certificate
    await Course.findOneAndUpdate(
      { 
        _id: certificateRequest.course._id,
        'enrolledUsers.user': certificateRequest.user._id
      },
      {
        $set: {
          'enrolledUsers.$.certificateRequestStatus': 'Certificate_Generated',
          'enrolledUsers.$.certificateUrl': certificateImagePath
        }
      }
    );

    res.status(200).json({
      success: true,
      message: 'Final certificate generated successfully',
      certificateRequest: {
        id: certificateRequest._id,
        certificateId: certificateRequest.certificateId,
        status: certificateRequest.status,
        userName: certificateRequest.userName,
        userSignaturePath: certificateRequest.userSignaturePath,
        presidentSignaturePath: certificateRequest.presidentSignaturePath,
        certificateImagePath: certificateRequest.certificateImagePath, // Final certificate path
        user: certificateRequest.user,
        course: certificateRequest.course,
        completionData: certificateRequest.completionData
      },
      downloadUrl: `/api/certificates/download/${certificateRequest.certificateId}`
    });

  } catch (error) {
    console.error('Error generating final certificate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate final certificate',
      error: error.message
    });
  }
};

// Reject certificate request (admin only)
const rejectCertificateRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { comments } = req.body;
    const adminId = req.user.id;

    // Validate request ID
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID'
      });
    }

    // Find the certificate request
    const certificateRequest = await CertificateRequest.findById(requestId)
      .populate('user', 'name email')
      .populate('course', 'name description');

    if (!certificateRequest) {
      return res.status(404).json({
        success: false,
        message: 'Certificate request not found'
      });
    }

    // Check if already processed
    if (certificateRequest.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: `Certificate request already ${certificateRequest.status.toLowerCase()}`
      });
    }

    // Update certificate request
    certificateRequest.status = 'Rejected';
    certificateRequest.reviewedBy = adminId;
    certificateRequest.reviewedAt = new Date();
    certificateRequest.reviewComments = comments || 'Certificate request rejected';

    await certificateRequest.save();

    // Update course enrollment status
    await Course.findOneAndUpdate(
      { 
        _id: certificateRequest.course._id,
        'enrolledUsers.user': certificateRequest.user._id
      },
      {
        $set: {
          'enrolledUsers.$.certificateRequestStatus': 'Rejected'
        }
      }
    );

    res.status(200).json({
      success: true,
      message: 'Certificate request rejected',
      certificateRequest: {
        id: certificateRequest._id,
        status: certificateRequest.status,
        userName: certificateRequest.userName,
        userSignaturePath: certificateRequest.userSignaturePath,
        user: certificateRequest.user,
        course: certificateRequest.course,
        reviewedAt: certificateRequest.reviewedAt,
        reviewComments: certificateRequest.reviewComments
      }
    });

  } catch (error) {
    console.error('Error rejecting certificate request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject certificate request',
      error: error.message
    });
  }
};

// Get single certificate request details
const getCertificateRequestDetails = async (req, res) => {
  try {
    const { requestId } = req.params;

    // Validate request ID
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID'
      });
    }

    const certificateRequest = await CertificateRequest.findById(requestId)
      .populate('user', 'name email')
      .populate('course', 'name description level courseType thumbnail')
      .populate('reviewedBy', 'name email');

    if (!certificateRequest) {
      return res.status(404).json({
        success: false,
        message: 'Certificate request not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Certificate request details retrieved successfully',
      certificateRequest: {
        id: certificateRequest._id,
        status: certificateRequest.status,
        certificateId: certificateRequest.certificateId,
        userName: certificateRequest.userName,
        userSignaturePath: certificateRequest.userSignaturePath,
        presidentSignaturePath: certificateRequest.presidentSignaturePath,
        certificateImagePath: certificateRequest.certificateImagePath,
        user: certificateRequest.user,
        course: certificateRequest.course,
        completionData: certificateRequest.completionData,
        reviewedBy: certificateRequest.reviewedBy,
        reviewComments: certificateRequest.reviewComments,
        createdAt: certificateRequest.createdAt,
         reviewedAt: certificateRequest.reviewedAt
      }
    });

  } catch (error) {
    console.error('Error getting certificate request details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get certificate request details',
      error: error.message
    });
  }
};

// Download certificate
const downloadCertificate = async (req, res) => {
  try {
    const { certificateId } = req.params;

    const certificateRequest = await CertificateRequest.findOne({ certificateId })
      .populate('user', 'name email')
      .populate('course', 'name description');

    if (!certificateRequest) {
      return res.status(404).json({
        success: false,
        message: 'Certificate not found'
      });
    }

    if (certificateRequest.status !== 'Certificate_Generated') {
      return res.status(400).json({
        success: false,
        message: 'Certificate not yet generated'
      });
    }

    // Return certificate image path for download
    res.status(200).json({
      success: true,
      message: 'Certificate ready for download',
      certificate: {
        id: certificateRequest.certificateId,
        userName: certificateRequest.userName,
        courseName: certificateRequest.course.name,
        certificateImagePath: certificateRequest.certificateImagePath,
        completionDate: certificateRequest.completionData.completionDate,
        grade: certificateRequest.completionData.gradeLabel
      }
    });

  } catch (error) {
    console.error('Error downloading certificate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download certificate',
      error: error.message
    });
  }
};

module.exports = {
  requestCertificate,
  getUserCertificateRequests,
  getAllCertificateRequests,
  approveCertificateRequest,
  generateFinalCertificate,
  rejectCertificateRequest,
  getCertificateRequestDetails,
  downloadCertificate,
  getCertificateByUserAndCourse
};
