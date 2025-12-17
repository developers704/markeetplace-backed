const Course = require('../models/course.model');
const Customer = require('../models/customer.model');
const Quiz = require('../models/quiz.model');


// Get Short Courses with unlock logic based on main course performance
const getShortCourses = async (req, res) => {
  try {
    const customerId = req.user.id;
    const warehouseID = req?.user?.selectedWarehouse;
    // console.log('complete request', req.user.selectedWarehouse );
    console.log('Customer ID:', customerId);

    // Get user details with role and warehouse
    const user = await Customer.findById(customerId)
      .populate('role')
      .populate('warehouse');

      console.log('User:', user);


    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

const shortCourses = await Course.find({
  courseType: "Short Course",
  isActive: true,
  $and: [
    { 'accessControl.roles': user.role._id },
    { 'accessControl.stores': warehouseID }
  ]
}).sort({ sequence: 1 });

    if (shortCourses.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: 'No short courses available for your role/store'
      });
    }

    // Get all main courses user is enrolled in
    const mainCourses = await Course.find({
      courseType: { $in: ["Course", "Task"] },
      'enrolledUsers.user': customerId,
      isActive: true
    });

    // Check if user needs short courses (stuck or failed in main courses)
    const needsShortCourses = await checkIfUserNeedsShortCourses(mainCourses, customerId);

    // Process short courses with unlock logic
    const processedShortCourses = await processShortCoursesWithUnlockLogic(
      shortCourses,
      customerId,
      needsShortCourses
    );

    // Calculate overall short course progress
    const overallProgress = calculateOverallShortCourseProgress(processedShortCourses);

    res.status(200).json({
      success: true,
      data: {
        shortCourses: processedShortCourses,
        overallProgress,
        needsImprovement: needsShortCourses.needsImprovement,
        reasonForAccess: needsShortCourses.reason,
        totalShortCourses: shortCourses.length,
        unlockedCourses: processedShortCourses.filter(sc => sc.canAccess).length
      },
      message: 'Short courses retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching short courses:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Check if user needs short courses based on main course performance
const checkIfUserNeedsShortCourses = async (mainCourses, customerId) => {
  let needsImprovement = false;
  let reasons = [];

  // Get all quizzes for the main courses to check actual quiz attempts
  const courseIds = mainCourses.map(course => course._id);
  const allQuizzes = await Quiz.find({
    courseId: { $in: courseIds }
  });

  for (const course of mainCourses) {
    const userEnrollment = course.enrolledUsers.find(
      enrollment => enrollment.user.toString() === customerId
    );

    if (userEnrollment) {
      // Check if overall course grade is below 70%
      if (userEnrollment.gradePercentage < 70 && userEnrollment.gradePercentage > 0) {
        needsImprovement = true;
        reasons.push(`Low grade in ${course.name} (${userEnrollment.gradePercentage}%)`);
      }

      // Check for quiz failures using actual Quiz model data
      const courseQuizzes = allQuizzes.filter(quiz => 
        quiz.courseId.toString() === course._id.toString()
      );

      for (const quiz of courseQuizzes) {
        const userQuizAttempts = quiz.attempts.filter(attempt => 
          attempt.userId.toString() === customerId
        );

        if (userQuizAttempts.length > 0) {
          // Check if user has failed (used all attempts without passing)
          if (userQuizAttempts.length >= quiz.maxAttempts) {
            const hasPassedAttempt = userQuizAttempts.some(attempt => attempt.passed);
            
            if (!hasPassedAttempt) {
              needsImprovement = true;
              reasons.push(`Failed quiz "${quiz.title}" in ${course.name} (${userQuizAttempts.length}/${quiz.maxAttempts} attempts used)`);
            }
          } else {
            // Check if latest attempt failed and score is below passing
            const latestAttempt = userQuizAttempts[userQuizAttempts.length - 1];
            if (!latestAttempt.passed && latestAttempt.percentage < quiz.passingScore) {
              needsImprovement = true;
              reasons.push(`Failed quiz "${quiz.title}" in ${course.name} (Score: ${latestAttempt.percentage}%, Required: ${quiz.passingScore}%)`);
            }
          }
        }
      }

      // Check if user is stuck (progress stopped for long time)
      const lastActivity = getLastActivityDate(userEnrollment);
      const daysSinceLastActivity = Math.floor((new Date() - lastActivity) / (1000 * 60 * 60 * 24));
      
      if (daysSinceLastActivity > 7 && userEnrollment.progress < 100 && userEnrollment.progress > 0) {
        needsImprovement = true;
        reasons.push(`Stuck in ${course.name} for ${daysSinceLastActivity} days`);
      }

      // Check if user has multiple failed quiz attempts across the course
      const totalFailedAttempts = countActualFailedQuizzes(courseQuizzes, customerId);
      if (totalFailedAttempts > 2) {
        needsImprovement = true;
        reasons.push(`Multiple quiz failures in ${course.name} (${totalFailedAttempts} failed attempts)`);
      }
    }
  }

  return {
    needsImprovement,
    reason: reasons.length > 0 ? reasons.join('; ') : 'Performance improvement needed'
  };
};

// Process short courses with sequential unlock logic
const processShortCoursesWithUnlockLogic = async (shortCourses, customerId, needsShortCourses) => {
  const processedCourses = [];

  for (let i = 0; i < shortCourses.length; i++) {
    const course = shortCourses[i];
    
    // Check if user is enrolled in this short course
    const userEnrollment = course.enrolledUsers.find(
      enrollment => enrollment.user.toString() === customerId
    );

    let canAccess = false;
    let status = 'Locked';
    let lockReason = '';

    // First short course unlock logic
    if (i === 0) {
      // First short course unlocks ONLY if user needs improvement (failed/struggling)
      if (needsShortCourses.needsImprovement) {
        canAccess = true;
        status = userEnrollment ? getEnrollmentStatus(userEnrollment) : 'Available';
      } else {
        status = 'Locked';
        lockReason = 'Short courses unlock when you need help with main courses (quiz failures, low grades, or being stuck)';
      }
    } else {
      // Subsequent short courses unlock based on previous course completion
      const previousCourse = shortCourses[i - 1];
      const previousEnrollment = previousCourse.enrolledUsers.find(
        enrollment => enrollment.user.toString() === customerId
      );

      if (previousEnrollment) {
        // Check if previous short course is completed with 70%+ grade
        if (previousEnrollment.progress === 100 && previousEnrollment.gradePercentage >= 70) {
          canAccess = true;
          status = userEnrollment ? getEnrollmentStatus(userEnrollment) : 'Available';
        } else if (previousEnrollment.progress === 100 && previousEnrollment.gradePercentage < 70) {
          status = 'Locked';
          lockReason = `Complete previous course "${previousCourse.name}" with 70%+ grade (Current: ${previousEnrollment.gradePercentage}%)`;
        } else {
          status = 'Locked';
          lockReason = `Complete previous course "${previousCourse.name}" first (Progress: ${previousEnrollment.progress}%)`;
        }
      } else {
        status = 'Locked';
        lockReason = `Enroll and complete previous course "${previousCourse.name}" first`;
      }
    }

    // Calculate course progress and grade
    let progress = 0;
    let gradePercentage = 0;
    let gradeLabel = 'Not Started';
    let certificateEarned = false;

    if (userEnrollment) {
      progress = userEnrollment.progress;
      gradePercentage = userEnrollment.gradePercentage;
      gradeLabel = userEnrollment.gradeLabel;
      certificateEarned = userEnrollment.certificateEarned;
    }

    processedCourses.push({
      _id: course._id,
      name: course.name,
      description: course.description,
      thumbnail: course.thumbnail,
      approximateHours: course.approximateHours,
      level: course.level,
      language: course.language,
      sequence: course.sequence,
      totalVideos: course.totalVideos,
      canAccess,
      status,
      lockReason,
      isEnrolled: !!userEnrollment,
      progress,
      gradePercentage,
      gradeLabel,
      certificateEarned,
      enrollmentDate: userEnrollment ? userEnrollment.enrollmentDate : null,
      chapters: canAccess ? course.chapters.length : 0,
      sections: canAccess ? course.chapters.reduce((total, ch) => total + ch.sections.length, 0) : 0,
      // Add debug info
      debugInfo: {
        needsImprovement: needsShortCourses.needsImprovement,
        reason: needsShortCourses.reason
      }
    });
  }

  return processedCourses;
};

// Get enrollment status
const getEnrollmentStatus = (enrollment) => {
  if (enrollment.progress === 100) {
    return enrollment.gradePercentage >= 70 ? 'Completed' : 'Failed';
  } else if (enrollment.progress > 0) {
    return 'In Progress';
  } else {
    return 'Enrolled';
  }
};

// Get last activity date from user enrollment
const getLastActivityDate = (userEnrollment) => {
  let lastDate = userEnrollment.enrollmentDate;

  // Check chapter progress for last accessed content
  userEnrollment.chapterProgress.forEach(cp => {
    cp.sectionProgress.forEach(sp => {
      sp.contentProgress.forEach(contentProg => {
        if (contentProg.lastAccessedAt && contentProg.lastAccessedAt > lastDate) {
          lastDate = contentProg.lastAccessedAt;
        }
      });
      
      // Check quiz attempt dates
      if (sp.quizProgress && sp.quizProgress.lastAttemptDate && sp.quizProgress.lastAttemptDate > lastDate) {
        lastDate = sp.quizProgress.lastAttemptDate;
      }
    });
  });

  return lastDate;
};

// Count failed quizzes
const countActualFailedQuizzes = (courseQuizzes, customerId) => {
  let failedCount = 0;

  courseQuizzes.forEach(quiz => {
    const userAttempts = quiz.attempts.filter(attempt => 
      attempt.userId.toString() === customerId
    );

    if (userAttempts.length > 0) {
      // Count as failed if:
      // 1. Used all attempts without passing, OR
      // 2. Latest attempt failed with score below passing
      if (userAttempts.length >= quiz.maxAttempts) {
        const hasPassedAttempt = userAttempts.some(attempt => attempt.passed);
        if (!hasPassedAttempt) {
          failedCount++;
        }
      } else {
        const latestAttempt = userAttempts[userAttempts.length - 1];
        if (!latestAttempt.passed && latestAttempt.percentage < quiz.passingScore) {
          failedCount++;
        }
      }
    }
  });

  return failedCount;
};

// Calculate overall short course progress
const calculateOverallShortCourseProgress = (shortCourses) => {
  const enrolledCourses = shortCourses.filter(sc => sc.isEnrolled);
  
  if (enrolledCourses.length === 0) {
    return {
      totalProgress: 0,
      completedCourses: 0,
      totalEnrolled: 0,
      averageGrade: 0
    };
  }

  const totalProgress = enrolledCourses.reduce((sum, course) => sum + course.progress, 0);
  const completedCourses = enrolledCourses.filter(course => course.progress === 100).length;
  const totalGrades = enrolledCourses.reduce((sum, course) => sum + course.gradePercentage, 0);

  return {
    totalProgress: Math.round(totalProgress / enrolledCourses.length),
    completedCourses,
    totalEnrolled: enrolledCourses.length,
    averageGrade: Math.round(totalGrades / enrolledCourses.length)
  };
};

// Enroll in short course
const enrollInShortCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const customerId = req.user.id;

    const course = await Course.findById(courseId);
    if (!course || course.courseType !== 'Short Course') {
      return res.status(404).json({
        success: false,
        message: 'Short course not found'
      });
    }

    // Check if already enrolled
    const existingEnrollment = course.enrolledUsers.find(
      enrollment => enrollment.user.toString() === customerId
    );

    if (existingEnrollment) {
      return res.status(400).json({
        success: false,
        message: 'Already enrolled in this course'
      });
    }

    // Check if can access (same logic as above)
    const user = await Customer.findById(customerId).populate('role').populate('warehouse');
    const shortCourses = await Course.find({
      courseType: "Short Course",
      isActive: true,
      $or: [
        { 'accessControl.roles': user.role._id },
        { 'accessControl.stores': user.warehouse._id }
      ]
    }).sort({ sequence: 1 });

    const courseIndex = shortCourses.findIndex(sc => sc._id.toString() === courseId);
    if (courseIndex === -1) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this course'
      });
    }

    // Check unlock logic (simplified version)
    const mainCourses = await Course.find({
      courseType: { $in: ["Course", "Task"] },
      'enrolledUsers.user': customerId,
      isActive: true
    });

    const needsShortCourses = await checkIfUserNeedsShortCourses(mainCourses, customerId);

    if (courseIndex === 0 && !needsShortCourses.needsImprovement) {
      return res.status(403).json({
        success: false,
        message: 'Complete main courses first to access short courses'
      });
    }

    // Initialize enrollment
    const newEnrollment = {
      user: customerId,
      enrollmentDate: new Date(),
      progress: 0,
      currentChapter: 0,
      currentSection: 0,
      currentContent: 0,
      chapterProgress: [],
      gradePercentage: 0,
      gradeLabel: 'Incomplete',
      certificateEarned: false
    };

    course.enrolledUsers.push(newEnrollment);
    await course.save();

    res.status(200).json({
      success: true,
      message: 'Successfully enrolled in short course',
      data: {
        courseId: course._id,
        courseName: course.name,
        enrollmentDate: newEnrollment.enrollmentDate
      }
    });

  } catch (error) {
    console.error('Error enrolling in short course:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

module.exports = {
  getShortCourses,
  enrollInShortCourse
};
