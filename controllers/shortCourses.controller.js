const Course = require('../models/course.model');
const Customer = require('../models/customer.model');
const Quiz = require('../models/quiz.model');


// Get Short Courses with unlock logic based on main course performance
const getShortCourses = async (req, res) => {
  try {
    const customerId = req.user.id;
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

    /* ======================================================
       GET ASSIGNED MAIN COURSES (BASED ON ROLE/WAREHOUSE)
    ====================================================== */
    // Handle warehouse - it can be an array or single value
    const warehouseID =  req?.user?.selectedWarehouse;
      console.log('Using Warehouse ID:', warehouseID);
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

    // Get assigned main courses (same logic as getUserCourseProgress)
    const assignedMainCourses = await Course.find({
      isActive: true,
      courseType: 'Course',
      $and: [
        {
          $or: [
            { 'accessControl.roles': user.role._id },
            { 'accessControl.roles': { $size: 0 } }
          ]
        },
        {
          $or: [
            { 'accessControl.stores': warehouseID },
            { 'accessControl.stores': { $size: 0 } }
          ]
        }
      ]
    })
      .select('_id name sequence chapters enrolledUsers weightage')
      .sort({ sequence: 1 });

    console.log(`Found ${assignedMainCourses.length} assigned main courses for short course check`);

    // Get enrolled courses for progress calculation
    const enrolledCourses = await Course.find({
      courseType: 'Course',
      'enrolledUsers.user': customerId,
      isActive: true
    })
      .select('_id name sequence chapters enrolledUsers weightage');

    // Create a map of enrolled courses by ID for quick lookup
    const enrolledCoursesMap = new Map(
      enrolledCourses.map(c => [c._id.toString(), c])
    );

    /* ======================================================
       CALCULATE COMPLETION OF ASSIGNED MAIN COURSES
       (Same logic as getUserCourseProgress and certificate controller)
    ====================================================== */
    const allAssignedMainCoursesCompleted = assignedMainCourses.length > 0 && assignedMainCourses.every((course) => {
      const enrolledCourse = enrolledCoursesMap.get(course._id.toString());
      if (!enrolledCourse) {
        console.log(`Assigned course ${course._id} is not enrolled`);
        return false;
      }

      const enrollment = enrolledCourse.enrolledUsers.find(
        e => e && e.user && e.user.toString() === customerId.toString()
      );

      if (!enrollment) {
        return false;
      }

      // Calculate completion the same way as getUserCourseProgress
      if (!enrolledCourse.chapters || !Array.isArray(enrolledCourse.chapters)) {
        // No chapters = auto-complete
        return true;
      }

      let totalSections = 0;
      let completedSections = 0;

      for (const chapter of enrolledCourse.chapters) {
        if (!chapter.sections || !Array.isArray(chapter.sections)) {
          continue;
        }

        const chapterProgress = enrollment.chapterProgress?.find(
          cp => cp && cp.chapterId && cp.chapterId.toString() === chapter._id.toString()
        );

        for (const section of chapter.sections) {
          totalSections++;

          // Auto-complete empty sections (no content, no quiz)
          if ((!section.content || section.content.length === 0) && !section.quiz) {
            completedSections++;
            continue;
          }

          const sectionProgress = chapterProgress?.sectionProgress?.find(
            sp => sp && sp.sectionId && sp.sectionId.toString() === section._id.toString()
          );

          // Check content completion
          let sectionCompleted = true;
          if (section.content && section.content.length > 0) {
            const sectionContentCount = section.content.length;
            const sectionCompletedContent = section.content.filter(content => {
              const contentProgress = sectionProgress?.contentProgress?.find(
                cp => cp && cp.contentId && cp.contentId.toString() === content._id.toString()
              );

              if (!contentProgress) return false;

              if (content.contentType === 'video') {
                return contentProgress.watchedDuration >= content.minimumWatchTime;
              } else if (content.contentType === 'text') {
                return contentProgress.completed;
              }
              return false;
            }).length;

            if (sectionCompletedContent < sectionContentCount) {
              sectionCompleted = false;
            }
          }

          // Quiz results do NOT lock progression. Section completion is content-only.
          if (sectionCompleted) {
            completedSections++;
          }
        }
      }

      // Course is completed if all sections are completed (or no sections)
      const overallProgress = totalSections > 0 ? (completedSections / totalSections) * 100 : 100;
      return overallProgress === 100;
    });

    /* ======================================================
       CALCULATE PROGRAM PERCENTAGE FROM ASSIGNED COURSES
    ====================================================== */
    const passingThreshold = 70;
    let programPercentage = 0;
    
    // Get all quiz results for assigned courses
    const assignedCourseIds = assignedMainCourses.map(c => c._id);
    const allQuizResults = await Quiz.find({
      courseId: { $in: assignedCourseIds },
      'attempts.userId': customerId
    });

    let totalWeight = 0;
    let weightedScore = 0;
    let totalQuizzes = 0;

    for (const course of assignedMainCourses) {
      const enrolledCourse = enrolledCoursesMap.get(course._id.toString());
      if (!enrolledCourse) continue;

      const enrollment = enrolledCourse.enrolledUsers.find(
        e => e && e.user && e.user.toString() === customerId.toString()
      );

      if (enrollment) {
        // Use enrollment.gradePercentage if available (calculated by quiz controller)
        const courseGrade = enrollment.gradePercentage || 0;
        const weight = course.weightage || 100;
        
        if (courseGrade > 0) {
          totalWeight += weight;
          weightedScore += courseGrade * weight;
        }
      }

      // Count quizzes for this course
      const courseQuizzes = allQuizResults.filter(q => 
        q.courseId.toString() === course._id.toString()
      );
      totalQuizzes += courseQuizzes.length;
    }

    programPercentage = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;

    // If there are no quizzes at all but courses are completed, treat program as 100%
    if (totalQuizzes === 0 && allAssignedMainCoursesCompleted) {
      programPercentage = 100;
    }

    // If no assigned courses, calculate from enrolled courses (fallback)
    if (assignedMainCourses.length === 0 && enrolledCourses.length > 0) {
      const totalGrade = enrolledCourses.reduce((sum, mc) => {
        const enrollment = mc.enrolledUsers.find(e => e.user.toString() === customerId);
        return sum + (enrollment?.gradePercentage || 0);
      }, 0);
      programPercentage = Math.round(totalGrade / enrolledCourses.length);
    }

    const programStats = { percentage: programPercentage, passingThreshold };
    
    // ✅ REMEDIATION REQUIRED: Only when all assigned courses completed AND program percentage < 70
    const remediationRequired = allAssignedMainCoursesCompleted && programPercentage < passingThreshold;
    const redirectToTasks = remediationRequired;

    // Force needsImprovement based purely on program completion + low average
    // const enrichedNeeds = {
    //   ...needsShortCourses,
    //   needsImprovement: remediationRequired,
    //   allMainCoursesCompleted,
    //   programStats,
    //   reason: remediationRequired
    //     ? `Overall program score ${programPercentage}% is below passing threshold ${passingThreshold}%.`
    //     : needsShortCourses.reason
    // };
      const enrichedNeeds = {
      needsImprovement: remediationRequired,
      remediationRequired,
      allAssignedMainCoursesCompleted: allAssignedMainCoursesCompleted,
      allMainCoursesCompleted: allAssignedMainCoursesCompleted,
      programStats,
      reason: remediationRequired
        ? `Overall program score ${programPercentage}% is below passing threshold ${passingThreshold}%.`
        : 'No remediation required'
    };
    // Process short courses with unlock logic
    const processedShortCourses = await processShortCoursesWithUnlockLogic(
      shortCourses,
      customerId,
      enrichedNeeds
    );

    // Calculate overall short course progress
    const overallProgress = calculateOverallShortCourseProgress(processedShortCourses);

    res.status(200).json({
      success: true,
      data: {
        shortCourses: processedShortCourses,
        overallProgress,
        needsImprovement: enrichedNeeds.needsImprovement,
        reasonForAccess: enrichedNeeds.reason,
        totalShortCourses: shortCourses.length,
        unlockedCourses: processedShortCourses.filter(sc => sc.canAccess).length,
        redirectToTasks
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

  // Check all main courses completion
let allMainCoursesCompleted = true;

for (const mc of mainCourses) {
  const enrollment = mc.enrolledUsers.find(e => e.user.toString() === customerId);

  // 🔹 Auto-complete empty main courses
  const hasContent = mc.totalVideos > 0 || mc.chapters?.some(ch => ch.quiz || ch.sections?.some(sec => sec.content?.length > 0));
  if (!hasContent) {
    if (enrollment) {
      enrollment.progress = 100;
      enrollment.gradePercentage = 100;
      enrollment.gradeLabel = 'Completed';
      enrollment.status = 'Completed';
      mc.markModified('enrolledUsers');
      await mc.save(); // ✅ allowed now because we are inside async function
    }
    continue; 
  }

  if (!enrollment || (enrollment.status !== 'Completed' && enrollment.status !== 'Done' && enrollment.progress < 100)) {
    allMainCoursesCompleted = false;
  }
}

  

  // Get all quizzes for main courses
  const courseIds = mainCourses.map(course => course._id);
  const allQuizzes = await Quiz.find({
    courseId: { $in: courseIds }
  });

  for (const course of mainCourses) {
    const userEnrollment = course.enrolledUsers.find(
      enrollment => enrollment.user.toString() === customerId
    );

    if (userEnrollment) {
      if (userEnrollment.gradePercentage < 70 && userEnrollment.gradePercentage > 0) {
        needsImprovement = true;
        reasons.push(`Low grade in ${course.name} (${userEnrollment.gradePercentage}%)`);
      }

      // Quiz failures
      const courseQuizzes = allQuizzes.filter(q => q.courseId.toString() === course._id.toString());
      const totalFailedAttempts = countActualFailedQuizzes(courseQuizzes, customerId);
      if (totalFailedAttempts > 0) {
        needsImprovement = true;
        reasons.push(`Multiple failed quizzes in ${course.name}`);
      }

      // Stuck check
      const lastActivity = getLastActivityDate(userEnrollment);
      const daysSinceLastActivity = Math.floor((new Date() - lastActivity) / (1000 * 60 * 60 * 24));
      if (daysSinceLastActivity > 7 && userEnrollment.progress < 100) {
        needsImprovement = true;
        reasons.push(`Stuck in ${course.name} for ${daysSinceLastActivity} days`);
      }
    }
  }

  return {
    needsImprovement,
    allMainCoursesCompleted, // ✅ Add this
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

    const remediationRequired =
      needsShortCourses.allAssignedMainCoursesCompleted &&
      (needsShortCourses.programStats?.percentage || 0) < (needsShortCourses.programStats?.passingThreshold || 70);

    // First short course unlock logic
 if (i === 0) {
  // ✅ First short course unlocks ONLY when remediation is required
  // (All assigned courses completed AND program percentage < 70)
  if (remediationRequired) {
    canAccess = true;

    // 🔹 Auto-enroll if not already enrolled
    if (!userEnrollment) {
      course.enrolledUsers.push({
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
      });
      await course.save();

      // Update userEnrollment after auto-enroll
      userEnrollment = course.enrolledUsers.find(
        enrollment => enrollment.user.toString() === customerId
      );
    }

    status = getEnrollmentStatus(userEnrollment || { progress: 0, gradePercentage: 0 });
  } else {
    status = 'Locked';
    if (!needsShortCourses.allAssignedMainCoursesCompleted) {
      lockReason = 'Complete all assigned main courses first.';
    } else {
      lockReason = `Program score (${needsShortCourses.programStats?.percentage || 0}%) is above the passing threshold (${needsShortCourses.programStats?.passingThreshold || 70}%). Short courses are not required.`;
    }
  }
} else {
  // 🔹 Subsequent short courses unlock sequentially
  const previousCourse = processedCourses[i - 1]; // use processedCourses for accurate state

  if (previousCourse.progress === 100) {
    canAccess = true;

    // Auto-enroll if not enrolled
    if (!userEnrollment) {
      course.enrolledUsers.push({
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
      });
      await course.save();

      userEnrollment = course.enrolledUsers.find(
        enrollment => enrollment.user.toString() === customerId
      );
    }

    status = getEnrollmentStatus(userEnrollment || { progress: 0, gradePercentage: 0 });
  } else {
    status = 'Locked';
    lockReason = `Complete previous course "${previousCourse.name}" first (Progress: ${previousCourse.progress}%)`;
  }
}


    // Detect if this course has any quizzes
    const hasAnyVideo = course.chapters?.some(ch =>
      ch.sections?.some(sec =>
        sec.content?.some(c => c.contentType === 'video')
      )
    );

    const hasAnyQuiz = course.chapters?.some(ch =>
      ch.quiz || ch.sections?.some(sec => sec.quiz)
    );

    let hasAttemptedQuiz = false;
    
    if (hasAnyQuiz && userEnrollment) {
      const quizIds = [];
      course.chapters.forEach(ch => {
        if (ch.quiz) quizIds.push(ch.quiz.toString());
       
      });

      hasAttemptedQuiz = userEnrollment?.chapterProgress?.some(cp =>
  cp.quizProgress?.attempts > 0 
);
      console.log(`Course ${course.name} - Has Attempted Quiz:`, hasAttemptedQuiz);
    }
    if (userEnrollment) {
    userEnrollment.hasAttemptedQuiz = hasAttemptedQuiz;
    course.markModified('enrolledUsers');
    await course.save();
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


      if (!hasAnyVideo && hasAnyQuiz && gradePercentage >= 70) {
        progress = 100;
        gradeLabel = 'Completed';

        userEnrollment.progress = 100;
        userEnrollment.status = 'Completed';
        course.markModified('enrolledUsers');
        await course.save();
      }
  
     /**
 * CASE 1: No video + NO quiz
 * → Auto complete
 */
        if (!hasAnyVideo && !hasAnyQuiz) {
          progress = 100;
          gradePercentage = 100;
          gradeLabel = 'Completed';

          userEnrollment.progress = 100;
          userEnrollment.status = 'Completed';
          userEnrollment.gradePercentage = 100;
          userEnrollment.gradeLabel = 'Completed';
        }

        /**
         * CASE 2: No video + HAS quiz
         * → Complete ONLY if quiz attempted
         */
        else if (!hasAnyVideo && hasAnyQuiz) {
          if (hasAttemptedQuiz) {
            progress = 100;
            userEnrollment.progress = 100;
            userEnrollment.status = 'Completed';
          } else {
            progress = 0;
            userEnrollment.progress = 0;
            userEnrollment.status = 'Enrolled';
          }
        }


      // Keep failed short courses available for retake; do not block next course
      if (progress === 100 && gradePercentage < 70) {
        status = 'Failed';
        lockReason = '';
        canAccess = true;
      }
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
      hasQuiz: hasAnyQuiz,
      hasVideo: hasAnyVideo,
      hasAttemptedQuiz,
      // Add debug info
      debugInfo: {
        needsImprovement: needsShortCourses.needsImprovement,
        reason: needsShortCourses.reason
      }
    });
  }

  // After processing, if all ENROLLED short courses are completed but overall short-course average < 70,
  // force repeat: reset progress/grades and keep first unlocked.
  const enrolledShorts = processedCourses.filter(sc => sc.isEnrolled);

  console.log('Enrolled Shorts:', enrolledShorts);


let allShortsCompleted =
  enrolledShorts.length > 0 &&
  enrolledShorts.every(sc => 
    sc.progress === 100 && 
    (
      !sc.hasQuiz ||       // No quiz → OK
      (sc.hasQuiz && sc.hasAttemptedQuiz) // Quiz exists → attempted
    )
  );
  const evaluatedShorts = enrolledShorts.filter(sc =>
    sc.progress === 100 && (!sc.hasQuiz || sc.hasAttemptedQuiz)
  );

  const avgShortGrade =
    evaluatedShorts.length > 0
      ? Math.round(evaluatedShorts.reduce((sum, sc) => sum + sc.gradePercentage, 0) / evaluatedShorts.length)
      : 0;


  
  if (allShortsCompleted && avgShortGrade < 70) {
  for (let i = 0; i < shortCourses.length; i++) {
    const courseDoc = await Course.findById(shortCourses[i]._id); // latest
    await resetShortCourseEnrollmentProgress(courseDoc, customerId);
  }

  // Reflect reset state in processed payload
  processedCourses.forEach((sc, idx) => {
    sc.status = 'Failed';
    sc.progress = 0;
    sc.gradePercentage = 0;
    sc.gradeLabel = 'Incomplete';
    sc.canAccess = idx === 0; // first course unlocked
    sc.lockReason = idx === 0 ? '' : `Complete previous course "${processedCourses[idx - 1].name}" first`;
  });
}


  return processedCourses;
};

// Reset a user's short-course enrollment (progress + quiz attempts)
const resetShortCourseEnrollmentProgress = async (course, customerId) => {
  const enrollmentIndex = course.enrolledUsers.findIndex(
    (enr) => enr.user.toString() === customerId.toString()
  );
  if (enrollmentIndex === -1) {
  course.enrolledUsers.push({
    user: customerId,
    progress: 0,
    gradePercentage: 0,
    gradeLabel: 'Incomplete',
    status: 'In Progress',
    currentChapter: 0,
    currentSection: 0,
    currentContent: 0,
    chapterProgress: [],
    certificateEarned: false,
    enrollmentDate: new Date()
  });
  await course.save();
  return; // Already reset as new enrollment
}

  const enrollment = course.enrolledUsers[enrollmentIndex];
  enrollment.progress = 0;
  enrollment.gradePercentage = 0;
  enrollment.gradeLabel = 'Incomplete';
  enrollment.status = 'In Progress';
  enrollment.currentChapter = 0;
  enrollment.currentSection = 0;
  enrollment.currentContent = 0;
  enrollment.certificateEarned = false;

  // Collect all quiz IDs in this short course to wipe attempts for this user
  const quizIds = [];
  if (Array.isArray(course.chapters)) {
    course.chapters.forEach((ch) => {
      if (ch.quiz) quizIds.push(ch.quiz);
      if (Array.isArray(ch.sections)) {
        ch.sections.forEach((sec) => {
          if (sec.quiz) quizIds.push(sec.quiz);
        });
      }
    });
  }

  if (Array.isArray(enrollment.chapterProgress)) {
    enrollment.chapterProgress.forEach((cp) => {
      cp.completed = false;
      if (cp.quizProgress) {
        cp.quizProgress.attempts = 0;
        cp.quizProgress.bestScore = 0;
        cp.quizProgress.passed = false;
        cp.quizProgress.lastAttemptDate = null;
      }
      if (Array.isArray(cp.sectionProgress)) {
        cp.sectionProgress.forEach((sp) => {
          sp.completed = false;
          if (Array.isArray(sp.contentProgress)) {
            sp.contentProgress.forEach((contentProg) => {
              contentProg.watchedDuration = 0;
              contentProg.completed = false;
              contentProg.lastAccessedAt = null;
            });
          }
          if (sp.quizProgress) {
            sp.quizProgress.attempts = 0;
            sp.quizProgress.bestScore = 0;
            sp.quizProgress.passed = false;
            sp.quizProgress.lastAttemptDate = null;
          }
        });
      }
    });
  }

  // Remove quiz attempts for this user across all quizzes in this short course
  if (quizIds.length > 0) {
    await Quiz.updateMany(
      { _id: { $in: quizIds } },
      { $pull: { attempts: { userId: customerId } } }
    );
  }

  course.markModified('enrolledUsers');
  await course.save();
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
