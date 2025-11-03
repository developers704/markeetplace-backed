const Course = require('../models/course.model');
const Quiz = require('../models/quiz.model');
const User = require('../models/user.model');
const Warehouse = require('../models/warehouse.model');
const Policy = require('../models/policy.model'); // Assuming you have a policy model

// Get overall course progress statistics
const getOverallProgress = async (req, res) => {
  try {
    // Get total counts
    const totalUsers = await User.countDocuments({ is_superuser: false });
    const totalCourses = await Course.countDocuments({ isActive: true });
    
    // Get course enrollment and completion stats
    const courses = await Course.find({ isActive: true })
      .select('name enrolledUsers');
    
    let totalEnrollments = 0;
    let totalCompletions = 0;
    
    courses.forEach(course => {
      totalEnrollments += course.enrolledUsers.length;
      totalCompletions += course.enrolledUsers.filter(user => 
        user.certificateEarned === true
      ).length;
    });
    
    // Calculate completion rate
    const completionRate = totalEnrollments > 0 
      ? (totalCompletions / totalEnrollments * 100).toFixed(2) 
      : 0;
    
    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalCourses,
        totalEnrollments,
        totalCompletions,
        completionRate: `${completionRate}%`
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch overall progress',
      error: error.message
    });
  }
};

// Get top performing employees
const getTopPerformers = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    // Aggregate user performance across all courses
    const users = await User.find({ is_superuser: false })
      .select('_id username email');
    
    const userPerformance = [];
    
    // For each user, get their course performance
    for (const user of users) {
      const courses = await Course.find({ 
        'enrolledUsers.user': user._id 
      });
      
      let totalCourses = 0;
      let completedCourses = 0;
      let averageGrade = 0;
      let totalGrades = 0;
      
      courses.forEach(course => {
        const enrollment = course.enrolledUsers.find(
          e => e.user.toString() === user._id.toString()
        );
        
        if (enrollment) {
          totalCourses++;
          if (enrollment.certificateEarned) {
            completedCourses++;
          }
          
          if (enrollment.gradePercentage) {
            totalGrades += enrollment.gradePercentage;
          }
        }
      });
      
      averageGrade = totalCourses > 0 ? totalGrades / totalCourses : 0;
      
      userPerformance.push({
        user: {
          _id: user._id,
          username: user.username,
          email: user.email
        },
        totalCourses,
        completedCourses,
        completionRate: totalCourses > 0 
          ? (completedCourses / totalCourses * 100).toFixed(2) 
          : 0,
        averageGrade: averageGrade.toFixed(2)
      });
    }
    
    // Sort by completion rate and average grade
    userPerformance.sort((a, b) => {
      if (b.completionRate === a.completionRate) {
        return b.averageGrade - a.averageGrade;
      }
      return b.completionRate - a.completionRate;
    });
    
    // Return top performers
    res.status(200).json({
      success: true,
      count: userPerformance.length,
      data: userPerformance.slice(0, limit)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch top performers',
      error: error.message
    });
  }
};

// Get store performance
const getStorePerformance = async (req, res) => {
  try {
    // Get all warehouses/stores
    const stores = await Warehouse.find().select('_id name');
    
    const storePerformance = [];
    
    // For each store, get employee performance
    for (const store of stores) {
      // Get users in this store
      const users = await User.find({ warehouse: store._id })
        .select('_id username');
      
      let totalUsers = users.length;
      let totalCourses = 0;
      let completedCourses = 0;
      
      // For each user, get course completions
      for (const user of users) {
        const courses = await Course.find({ 
          'enrolledUsers.user': user._id 
        });
        
        courses.forEach(course => {
          const enrollment = course.enrolledUsers.find(
            e => e.user.toString() === user._id.toString()
          );
          
          if (enrollment) {
            totalCourses++;
            if (enrollment.certificateEarned) {
              completedCourses++;
            }
          }
        });
      }
      
      storePerformance.push({
        store: {
          _id: store._id,
          name: store.name
        },
        totalUsers,
        totalCourses,
        completedCourses,
        completionRate: totalCourses > 0 
          ? (completedCourses / totalCourses * 100).toFixed(2) 
          : 0
      });
    }
    
    // Sort by completion rate
    storePerformance.sort((a, b) => 
      b.completionRate - a.completionRate
    );
    
    res.status(200).json({
      success: true,
      count: storePerformance.length,
      data: storePerformance
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch store performance',
      error: error.message
    });
  }
};

// Get policy signatures
const getPolicySignatures = async (req, res) => {
  try {
    // Get all policies
    const policies = await Policy.find()
      .select('_id title version signatures');
    
    const policyData = [];
    
    for (const policy of policies) {
      // Get users who signed this policy
      const signedUsers = [];
      
      for (const signature of policy.signatures) {
        const user = await User.findById(signature.user)
          .select('_id username email');
        
        if (user) {
          signedUsers.push({
            user: {
              _id: user._id,
              username: user.username,
              email: user.email
            },
            signedAt: signature.signedAt
          });
        }
      }
      
      policyData.push({
        policy: {
          _id: policy._id,
          title: policy.title,
          version: policy.version
        },
        totalSignatures: signedUsers.length,
        signatures: signedUsers
      });
    }
    
    res.status(200).json({
      success: true,
      count: policyData.length,
      data: policyData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch policy signatures',
      error: error.message
    });
  }
};

// Get quiz attempts
const getQuizAttempts = async (req, res) => {
  try {
    const { courseId, quizId, userId } = req.query;
    
    // Build query
    const query = {};
    
    if (courseId) {
      query.courseId = courseId;
    }
    
    if (quizId) {
      query._id = quizId;
    }
    
    // Get quizzes
    const quizzes = await Quiz.find(query)
      .populate('courseId', 'name')
      .select('_id title attempts');
    
    const quizData = [];
    
    for (const quiz of quizzes) {
      // Filter attempts by user if specified
      let filteredAttempts = quiz.attempts;
      
      if (userId) {
        filteredAttempts = filteredAttempts.filter(
          attempt => attempt.userId.toString() === userId
        );
      }
      
      // Get user details for each attempt
      const attemptDetails = [];
      
      for (const attempt of filteredAttempts) {
        const user = await User.findById(attempt.userId)
          .select('_id username email');
        
        if (user) {
          attemptDetails.push({
            user: {
              _id: user._id,
              username: user.username,
              email: user.email
            },
            score: attempt.score,
            percentage: attempt.percentage,
            passed: attempt.passed,
            attemptDate: attempt.attemptDate
          });
        }
      }
      
      quizData.push({
        quiz: {
          _id: quiz._id,
          title: quiz.title,
          course: quiz.courseId
        },
        totalAttempts: attemptDetails.length,
        attempts: attemptDetails
      });
    }
    
    res.status(200).json({
      success: true,
      count: quizData.length,
      data: quizData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quiz attempts',
      error: error.message
    });
  }
};

// Get course enrollments and progress
const getCourseProgress = async (req, res) => {
  try {
    const { courseId, userId } = req.query;
    
    // Build query
    const query = { isActive: true };
    
    if (courseId) {
      query._id = courseId;
    }
    
    // Get courses
    const courses = await Course.find(query)
      .select('_id name enrolledUsers');
    
    const courseData = [];
    
    for (const course of courses) {
      // Filter enrolled users if userId specified
      let filteredUsers = course.enrolledUsers;
      
      if (userId) {
        filteredUsers = filteredUsers.filter(
          enrollment => enrollment.user.toString() === userId
        );
      }
      
      // Get user details for each enrollment
      const enrollmentDetails = [];
      
      for (const enrollment of filteredUsers) {
        const user = await User.findById(enrollment.user)
          .select('_id username email');
        
        if (user) {
          enrollmentDetails.push({
            user: {
              _id: user._id,
              username: user.username,
              email: user.email
            },
            progress: enrollment.progress,
            currentChapter: enrollment.currentChapter,
            currentSection: enrollment.currentSection,
            gradePercentage: enrollment.gradePercentage,
            gradeLabel: enrollment.gradeLabel,
            certificateEarned: enrollment.certificateEarned,
            enrollmentDate: enrollment.enrollmentDate
          });
        }
      }
      
      courseData.push({
        course: {
          _id: course._id,
          name: course.name
        },
        totalEnrollments: enrollmentDetails.length,
        enrollments: enrollmentDetails
      });
    }
    
    res.status(200).json({
      success: true,
      count: courseData.length,
      data: courseData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch course progress',
      error: error.message
    });
  }
};

// Get detailed user progress
const getUserProgress = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get user
    const user = await User.findById(userId)
      .select('_id username email');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Get all courses this user is enrolled in
    const courses = await Course.find({
      'enrolledUsers.user': userId
    }).select('_id name chapters enrolledUsers');
    
    const userProgress = {
      user: {
        _id: user._id,
        username: user.username,
        email: user.email
      },
      courses: []
    };
    
    // Get detailed progress for each course
    for (const course of courses) {
      const enrollment = course.enrolledUsers.find(
        e => e.user.toString() === userId
      );
      
      if (enrollment) {
        // Get quiz attempts for this user in this course
        const quizzes = await Quiz.find({ courseId: course._id })
          .select('_id title attempts');
        
        const quizAttempts = [];
        
        for (const quiz of quizzes) {
          const userAttempts = quiz.attempts.filter(
            attempt => attempt.userId.toString() === userId
          );
          
          if (userAttempts.length > 0) {
            quizAttempts.push({
              quiz: {
                _id: quiz._id,
                title: quiz.title
              },
              attempts: userAttempts.map(attempt => ({
                score: attempt.score,
                percentage: attempt.percentage,
                passed: attempt.passed,
                attemptDate: attempt.attemptDate
              }))
            });
          }
        }
        
        userProgress.courses.push({
          course: {
            _id: course._id,
            name: course.name
          },
          progress: enrollment.progress,
          currentChapter: enrollment.currentChapter,
          currentSection: enrollment.currentSection,
          gradePercentage: enrollment.gradePercentage,
          gradeLabel: enrollment.gradeLabel,
          certificateEarned: enrollment.certificateEarned,
          enrollmentDate: enrollment.enrollmentDate,
          quizAttempts
        });
      }
    }
    
    res.status(200).json({
      success: true,
      data: userProgress
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user progress',
      error: error.message
    });
  }
};

module.exports = {
  getOverallProgress,
  getTopPerformers,
  getStorePerformance,
  getPolicySignatures,
  getQuizAttempts,
  getCourseProgress,
  getUserProgress
};
