const Course = require('../models/course.model.js');
const Quiz = require('../models/quiz.model.js');
const Customer = require('../models/customer.model.js');
const UserRole = require('../models/userRole.model.js');
const Warehouse = require('../models/warehouse.model.js');

const calculateQuizStats = (enrollment) => {
    let totalScore = 0;
    let totalQuizzes = 0;
    let passedQuizzes = 0;

    if (enrollment.chapterProgress && enrollment.chapterProgress.length > 0) {
        enrollment.chapterProgress.forEach(chapter => {
            if (chapter.sectionProgress && chapter.sectionProgress.length > 0) {
                chapter.sectionProgress.forEach(section => {
                    if (section.quizProgress && 
                        section.quizProgress.attempts > 0) {
                        
                        totalQuizzes++;
                        
                        // Use best score if available
                        if (section.quizProgress.bestScore && section.quizProgress.bestScore > 0) {
                            totalScore += section.quizProgress.bestScore;
                            
                            // Check if passed (assuming 70% is passing)
                            if (section.quizProgress.passed || section.quizProgress.bestScore >= 70) {
                                passedQuizzes++;
                            }
                        }
                    }
                });
            }
        });
    }

    return {
        totalScore,
        totalQuizzes,
        passedQuizzes
    };
};

// Calculate hours spent on course content
const calculateHoursSpent = (enrollment) => {
    let totalMinutes = 0;

    if (enrollment.chapterProgress) {
        enrollment.chapterProgress.forEach(chapter => {
            if (chapter.sectionProgress) {
                chapter.sectionProgress.forEach(section => {
                    if (section.contentProgress) {
                        section.contentProgress.forEach(content => {
                            totalMinutes += content.watchedDuration || 0;
                        });
                    }
                });
            }
        });
    }

    return Math.round(totalMinutes / 60 * 100) / 100;
};

// Calculate comprehensive dashboard statistics
const calculateDashboardStats = async (enrollments, dateRanges, period) => {
    const stats = {
        totalHoursSpent: 0,
        completedCourses: 0,
        averageScore: 0,
        totalQuizzesTaken: 0,
        totalQuizzesPassed: 0,
        currentlyInProgress: 0,
        graphData: [],
        courseProgress: [],
        recentActivity: []
    };

    let totalScores = 0;
    let totalQuizzes = 0;
    let totalCourseGrades = 0;
    let totalGradedCourses = 0;

    // Process each enrollment
    for (const courseData of enrollments) {
        const { enrollment, courseName, courseType, level } = courseData;
        
        if (!enrollment) continue;

        // Calculate hours spent
        const hoursSpent = calculateHoursSpent(enrollment);
        stats.totalHoursSpent += hoursSpent;

        // Check if course is completed
        if (enrollment.progress === 100) {
            stats.completedCourses++;
        } else if (enrollment.progress > 0) {
            stats.currentlyInProgress++;
        }

        // Calculate quiz statistics using the function
        const quizStats = calculateQuizStats(enrollment);
        stats.totalQuizzesTaken += quizStats.totalQuizzes;
        stats.totalQuizzesPassed += quizStats.passedQuizzes;
        
        // Add quiz scores to total
        if (quizStats.totalQuizzes > 0) {
            totalScores += quizStats.totalScore;
            totalQuizzes += quizStats.totalQuizzes;
        }

        // If no quiz data, use course grade as fallback
        if (quizStats.totalQuizzes === 0 && enrollment.gradePercentage && enrollment.gradePercentage > 0) {
            totalCourseGrades += enrollment.gradePercentage;
            totalGradedCourses++;
        }

        // Add to course progress array
        stats.courseProgress.push({
            courseName,
            courseType,
            level,
            progress: enrollment.progress,
            grade: enrollment.gradeLabel,
            gradePercentage: enrollment.gradePercentage,
            certificateEarned: enrollment.certificateEarned,
            enrollmentDate: enrollment.enrollmentDate,
            quizAverage: quizStats.totalQuizzes > 0 ? 
                Math.round(quizStats.totalScore / quizStats.totalQuizzes) : 0
        });
    }

    // Calculate average score
    if (totalQuizzes > 0) {
        stats.averageScore = Math.round(totalScores / totalQuizzes);
    } else if (totalGradedCourses > 0) {
        stats.averageScore = Math.round(totalCourseGrades / totalGradedCourses);
    } else {
        stats.averageScore = 0;
    }

    return stats;
};

// Helper function to check if date is in range
const isDateInRange = (date, start, end) => {
    const checkDate = new Date(date);
    return checkDate >= start && checkDate <= end;
};

// Helper function to get date ranges
const getDateRanges = (period) => {
    const now = new Date();
    const ranges = [];

    switch (period) {
        case 'daily':
            for (let i = 6; i >= 0; i--) {
                const date = new Date(now);
                date.setDate(date.getDate() - i);
                const start = new Date(date.setHours(0, 0, 0, 0));
                const end = new Date(date.setHours(23, 59, 59, 999));
                
                ranges.push({
                    label: start.toLocaleDateString('en-US', { weekday: 'short' }),
                    start,
                    end
                });
            }
            break;

        case 'weekly':
            for (let i = 7; i >= 0; i--) {
                const startOfWeek = new Date(now);
                startOfWeek.setDate(startOfWeek.getDate() - (startOfWeek.getDay() + 7 * i));
                startOfWeek.setHours(0, 0, 0, 0);
                
                const endOfWeek = new Date(startOfWeek);
                endOfWeek.setDate(endOfWeek.getDate() + 6);
                endOfWeek.setHours(23, 59, 59, 999);

                ranges.push({
                    label: `Week ${8 - i}`,
                    start: startOfWeek,
                    end: endOfWeek
                });
            }
            break;

        case 'monthly':
            for (let i = 5; i >= 0; i--) {
                const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const start = new Date(date.setHours(0, 0, 0, 0));
                const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

                ranges.push({
                    label: start.toLocaleDateString('en-US', { month: 'short' }),
                    start,
                    end
                });
            }
            break;
    }

    return ranges;
};

// Generate graph data for different periods
const generateGraphData = async (enrollments, dateRanges, period) => {
    const graphData = [];

    for (const range of dateRanges) {
        let hoursForPeriod = 0;
        let activitiesForPeriod = 0;
        let quizzesForPeriod = 0;

        enrollments.forEach(courseData => {
            const { enrollment } = courseData;
            if (!enrollment) return;

            if (enrollment.chapterProgress) {
                enrollment.chapterProgress.forEach(chapter => {
                    if (chapter.sectionProgress) {
                        chapter.sectionProgress.forEach(section => {
                            if (section.contentProgress) {
                                section.contentProgress.forEach(content => {
                                    if (content.lastAccessedAt && 
                                        isDateInRange(content.lastAccessedAt, range.start, range.end)) {
                                        hoursForPeriod += (content.watchedDuration || 0) / 60;
                                        activitiesForPeriod++;
                                    }
                                });
                            }

                            if (section.quizProgress && 
                                section.quizProgress.lastAttemptDate &&
                                isDateInRange(section.quizProgress.lastAttemptDate, range.start, range.end)) {
                                quizzesForPeriod++;
                            }
                        });
                    }
                });
            }
        });

        graphData.push({
            period: range.label,
            date: range.start,
            hours: Math.round(hoursForPeriod * 100) / 100,
            activities: activitiesForPeriod,
            quizzes: quizzesForPeriod
        });
    }

    return graphData;
};

// Main dashboard function
const getCustomerDashboard = async (req, res) => {
    try {
        const customerId = req.user.id.toString();
        const { period = 'weekly' } = req.query;

        const dateRanges = getDateRanges(period);

        const customerCourses = await Course.find({
            'enrolledUsers.user': customerId
        }).populate('enrolledUsers.user', 'username email');

        console.log('Customer Courses:', customerCourses);

      const customerEnrollments = customerCourses.map(course => {
    const enrollment = course.enrolledUsers.find(enr => {
        if (!enr.user) return false;

        if (enr.user._id) {
            return enr.user._id.toString() === customerId;
        }

        return enr.user.toString() === customerId;
    });

    return {
        courseId: course._id,
        courseName: course.name,
        courseType: course.courseType,
        level: course.level,
        thumbnail: course.thumbnail,
        enrollment: enrollment ?? null
    };
});


        console.log('Customer Enrollments:', customerEnrollments);
 
        const stats = await calculateDashboardStats(customerEnrollments, dateRanges, period);
        stats.graphData = await generateGraphData(customerEnrollments, dateRanges, period);

        res.json({
            success: true,
            data: {
                period: period,
                totalCourses: customerEnrollments.length,
                ...stats
            }
        });

    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching dashboard data',
            error: error.message
        });
    }
};



// Generate graph data for different periods


// const updateContentProgress = async (req, res) => {
//   try {
//     const { courseId, chapterIndex, sectionIndex, contentIndex } = req.params;
//     const userId = req.user.id;
//     const { watchedDuration, completed } = req.body;
    
//     const course = await Course.findById(courseId);
    
//     if (!course) {
//       return res.status(404).json({
//         success: false,
//         message: 'Course not found'
//       });
//     }
    
//     // Find user's enrollment
//     const enrollmentIndex = course.enrolledUsers.findIndex(
//       enrollment => enrollment.user.toString() === userId
//     );
    
//     if (enrollmentIndex === -1) {
//       return res.status(404).json({
//         success: false,
//         message: 'User not enrolled in this course'
//       });
//     }
    
//     // Get the chapter, section, and content
//     const chapter = course.chapters[chapterIndex];
//     if (!chapter) {
//       return res.status(404).json({
//         success: false,
//         message: 'Chapter not found'
//       });
//     }
    
//     const section = chapter.sections[sectionIndex];
//     if (!section) {
//       return res.status(404).json({
//         success: false,
//         message: 'Section not found'
//       });
//     }
    
//     const content = section.content[contentIndex];
//     if (!content) {
//       return res.status(404).json({
//         success: false,
//         message: 'Content not found'
//       });
//     }
    
//     // Check if minimum watch time is met for videos
//     if (content.contentType === 'video' && completed) {
//       if (watchedDuration < content.minimumWatchTime) {
//         return res.status(400).json({
//           success: false,
//           message: 'Minimum watch time not met. Please watch more of the video before proceeding.',
//           requiredTime: content.minimumWatchTime,
//           currentTime: watchedDuration
//         });
//       }
//     }
    
//     // Update content progress
//     const chapterProgressIndex = course.enrolledUsers[enrollmentIndex].chapterProgress.findIndex(
//       cp => cp.sequence === chapter.sequence
//     );
    
//     const sectionProgressIndex = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex].sectionProgress.findIndex(
//       sp => sp.sequence === section.sequence
//     );
    
//     const contentProgressIndex = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex].sectionProgress[sectionProgressIndex].contentProgress.findIndex(
//       cp => cp.sequence === content.sequence
//     );
    
//     // Update content progress
//     course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex].sectionProgress[sectionProgressIndex].contentProgress[contentProgressIndex].watchedDuration = watchedDuration;
//     course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex].sectionProgress[sectionProgressIndex].contentProgress[contentProgressIndex].completed = completed;
//     course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex].sectionProgress[sectionProgressIndex].contentProgress[contentProgressIndex].lastAccessedAt = Date.now();
    
//     await course.save();
    
//     res.status(200).json({
//       success: true,
//       message: 'Progress updated successfully',
//       data: {
//         contentCompleted: completed
//       }
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Failed to update content progress',
//       error: error.message
//     });
//   }
// };



// const getNextContent = async (req, res) => {
//   try {
//     const { courseId } = req.params;
//     const { currentChapterIndex, currentSectionIndex, currentContentIndex } = req.query;
//     const userId = req.user.id;
    
//     // Convert string indices to numbers
//     const chapterIndex = parseInt(currentChapterIndex);
//     const sectionIndex = parseInt(currentSectionIndex);
//     const contentIndex = parseInt(currentContentIndex);
    
//     // Find the course
//     const course = await Course.findById(courseId)
//       .populate('chapters.sections.quiz', 'title description timeLimit passingScore');
    
//     if (!course) {
//       return res.status(404).json({
//         success: false,
//         message: 'Course not found'
//       });
//     }
    
//     // Check if user is enrolled
//     const enrollment = course.enrolledUsers.find(
//       e => e.user.toString() === userId
//     );
    
//     if (!enrollment) {
//       return res.status(403).json({
//         success: false,
//         message: 'User not enrolled in this course'
//       });
//     }
    
//     // Get current chapter, section, and content
//     const currentChapter = course.chapters[chapterIndex];
//     if (!currentChapter) {
//       return res.status(404).json({
//         success: false,
//         message: 'Chapter not found'
//       });
//     }
    
//     const currentSection = currentChapter.sections[sectionIndex];
//     if (!currentSection) {
//       return res.status(404).json({
//         success: false,
//         message: 'Section not found'
//       });
//     }
    
//     // Check if there's a next content item in the current section
//     if (contentIndex + 1 < currentSection.content.length) {
//       // Next content in the same section
//       return res.status(200).json({
//         success: true,
//         data: {
//           navigationType: 'content',
//           chapterIndex: chapterIndex,
//           sectionIndex: sectionIndex,
//           contentIndex: contentIndex + 1,
//           content: currentSection.content[contentIndex + 1]
//         }
//       });
//     }
    
//     // If no more content in this section, check if there's a quiz
//     if (currentSection.quiz) {
//       // Get the quiz progress
//       const chapterProgress = enrollment.chapterProgress.find(
//          cp => cp.chapterId.toString() === currentChapter._id.toString()
//       );
      
//       const sectionProgress = chapterProgress?.sectionProgress.find(
//         sp => sp.sectionId.toString() === currentSection._id.toString()
//       );
      
//       const quizProgress = sectionProgress?.quizProgress;
      
//       // Check if quiz is already passed
//       const quizPassed = quizProgress?.passed || false;
      
//       return res.status(200).json({
//         success: true,
//         data: {
//           navigationType: 'quiz',
//           chapterIndex: chapterIndex,
//           sectionIndex: sectionIndex,
//           quizId: currentSection.quiz._id,
//           quizDetails: currentSection.quiz,
//           quizPassed: quizPassed
//         }
//       });
//     }
    
//     // If no quiz or already passed, check if there's a next section
//     if (sectionIndex + 1 < currentChapter.sections.length) {
//       // Next section in the same chapter
//       const nextSection = currentChapter.sections[sectionIndex + 1];
      
//       // If next section has content, go to first content
//       if (nextSection.content && nextSection.content.length > 0) {
//         return res.status(200).json({
//           success: true,
//           data: {
//             navigationType: 'content',
//             chapterIndex: chapterIndex,
//             sectionIndex: sectionIndex + 1,
//             contentIndex: 0,
//             content: nextSection.content[0]
//           }
//         });
//       } else {
//         // Empty section (rare case), just point to the section
//         return res.status(200).json({
//           success: true,
//           data: {
//             navigationType: 'section',
//             chapterIndex: chapterIndex,
//             sectionIndex: sectionIndex + 1,
//             section: nextSection
//           }
//         });
//       }
//     }
    
//     // If no next section, check if there's a next chapter
//     if (chapterIndex + 1 < course.chapters.length) {
//       // Next chapter
//       const nextChapter = course.chapters[chapterIndex + 1];
      
//       // If next chapter has sections and first section has content
//       if (nextChapter.sections && 
//           nextChapter.sections.length > 0 && 
//           nextChapter.sections[0].content && 
//           nextChapter.sections[0].content.length > 0) {
        
//         return res.status(200).json({
//           success: true,
//           data: {
//             navigationType: 'content',
//             chapterIndex: chapterIndex + 1,
//             sectionIndex: 0,
//             contentIndex: 0,
//             content: nextChapter.sections[0].content[0]
//           }
//         });
//       } else if (nextChapter.sections && nextChapter.sections.length > 0) {
//         // Next chapter has sections but first section has no content
//         return res.status(200).json({
//           success: true,
//           data: {
//             navigationType: 'section',
//             chapterIndex: chapterIndex + 1,
//             sectionIndex: 0,
//             section: nextChapter.sections[0]
//           }
//         });
//       } else {
//         // Next chapter has no sections (rare case)
//         return res.status(200).json({
//           success: true,
//           data: {
//             navigationType: 'chapter',
//             chapterIndex: chapterIndex + 1,
//             chapter: nextChapter
//           }
//         });
//       }
//     }
    
//     // If we've reached here, the course is completed
//     // Update the user's progress to 100% if all chapters are completed
//     enrollment.progress = 100;
    
//     // Check if all chapters are completed
//     const allChaptersCompleted = enrollment.chapterProgress.every(cp => cp.completed);
    
//     if (allChaptersCompleted) {
//       // Calculate final grade based on quiz scores
//       let totalScore = 0;
//       let totalQuizzes = 0;
      
//       enrollment.chapterProgress.forEach(cp => {
//         cp.sectionProgress.forEach(sp => {
//           if (sp.quizProgress && sp.quizProgress.bestScore > 0) {
//             totalScore += sp.quizProgress.bestScore;
//             totalQuizzes++;
//           }
//         });
//       });
      
//       const averageScore = totalQuizzes > 0 ? totalScore / totalQuizzes : 0;
//       enrollment.gradePercentage = Math.round(averageScore);
      
//       // Assign grade label based on percentage
//       if (averageScore >= 90) {
//         enrollment.gradeLabel = 'A';
//       } else if (averageScore >= 80) {
//         enrollment.gradeLabel = 'B';
//       } else if (averageScore >= 70) {
//         enrollment.gradeLabel = 'C';
//       } else if (averageScore >= 60) {
//         enrollment.gradeLabel = 'D';
//       } else {
//         enrollment.gradeLabel = 'F';
//       }
      
//       // Check if user has earned a certificate
//       if (averageScore >= course.passingGrade) {
//         enrollment.certificateEarned = true;
//         // Generate certificate URL (implementation depends on your certificate system)
//         enrollment.certificateUrl = `/certificates/${courseId}/${userId}`;
//       }
//     }
    
//     await course.save();
    
//     return res.status(200).json({
//       success: true,
//       data: {
//         navigationType: 'complete',
//         courseCompleted: true,
//         progress: enrollment.progress,
//         gradePercentage: enrollment.gradePercentage,
//         gradeLabel: enrollment.gradeLabel,
//         certificateEarned: enrollment.certificateEarned,
//         certificateUrl: enrollment.certificateUrl
//       }
//     });
    
//   } catch (error) {
//     console.error('Error getting next content:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Error getting next content',
//       error: error.message
//     });
//   }
// };


// const updateContentProgress = async (req, res) => {
//   try {
//     const { courseId, chapterIndex, sectionIndex, contentIndex } = req.params;
//     const userId = req.user.id;
//     const { watchedDuration, completed } = req.body;
    
//     console.log("Updating content progress:", { 
//       courseId, chapterIndex, sectionIndex, contentIndex, watchedDuration, completed 
//     });
    
//     const course = await Course.findById(courseId);
    
//     if (!course) {
//       return res.status(404).json({
//         success: false,
//         message: 'Course not found'
//       });
//     }
    
//     // Find user's enrollment
//     const enrollmentIndex = course.enrolledUsers.findIndex(
//       enrollment => enrollment.user.toString() === userId
//     );
    
//     if (enrollmentIndex === -1) {
//       return res.status(404).json({
//         success: false,
//         message: 'User not enrolled in this course'
//       });
//     }
    
//     // Get the chapter, section, and content
//     const chapter = course.chapters[chapterIndex];
//     if (!chapter) {
//       return res.status(404).json({
//         success: false,
//         message: 'Chapter not found'
//       });
//     }
    
//     const section = chapter.sections[sectionIndex];
//     if (!section) {
//       return res.status(404).json({
//         success: false,
//         message: 'Section not found'
//       });
//     }
    
//     const content = section.content[contentIndex];
//     if (!content) {
//       return res.status(404).json({
//         success: false,
//         message: 'Content not found'
//       });
//     }
    
//     // Check if previous content is completed (enforce sequential progress)
//     if (contentIndex > 0) {
//       const prevContentId = section.content[contentIndex - 1]._id;
      
//       // Find chapter progress
//       const chapterProgress = course.enrolledUsers[enrollmentIndex].chapterProgress.find(
//         cp => cp.chapterId.toString() === chapter._id.toString()
//       );
      
//       if (!chapterProgress) {
//         return res.status(400).json({
//           success: false,
//           message: 'Chapter progress not initialized'
//         });
//       }
      
//       // Find section progress
//       const sectionProgress = chapterProgress.sectionProgress.find(
//         sp => sp.sectionId.toString() === section._id.toString()
//       );
      
//       if (!sectionProgress) {
//         return res.status(400).json({
//           success: false,
//           message: 'Section progress not initialized'
//         });
//       }
      
//       // Find previous content progress
//       const prevContentProgress = sectionProgress.contentProgress.find(
//         cp => cp.contentId.toString() === prevContentId.toString()
//       );
      
//       if (!prevContentProgress || !prevContentProgress.completed) {
//         return res.status(400).json({
//           success: false,
//           message: 'Please complete the previous content before proceeding'
//         });
//       }
//     }
    
//     // Check if minimum watch time is met for videos
//     if (content.contentType === 'video' && completed) {
//       if (watchedDuration < content.minimumWatchTime) {
//         return res.status(400).json({
//           success: false,
//           message: 'Minimum watch time not met. Please watch more of the video before proceeding.',
//           requiredTime: content.minimumWatchTime,
//           currentTime: watchedDuration
//         });
//       }
//     }
    
//     // Find or create chapter progress
//     let chapterProgressIndex = course.enrolledUsers[enrollmentIndex].chapterProgress.findIndex(
//       cp => cp.chapterId.toString() === chapter._id.toString()
//     );
    
//     if (chapterProgressIndex === -1) {
//       // Initialize chapter progress
//       course.enrolledUsers[enrollmentIndex].chapterProgress.push({
//         chapterId: chapter._id,
//         sequence: chapter.sequence,
//         completed: false,
//         sectionProgress: []
//       });
//       chapterProgressIndex = course.enrolledUsers[enrollmentIndex].chapterProgress.length - 1;
//     }
    
//     // Find or create section progress
//     let sectionProgressIndex = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex].sectionProgress.findIndex(
//       sp => sp.sectionId.toString() === section._id.toString()
//     );
    
//     if (sectionProgressIndex === -1) {
//       // Initialize section progress
//       course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex].sectionProgress.push({
//         sectionId: section._id,
//         sequence: section.sequence,
//         completed: false,
//         contentProgress: [],
//         quizProgress: null
//       });
//       sectionProgressIndex = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex].sectionProgress.length - 1;
//     }
    
//     // Find or create content progress
//     let contentProgressIndex = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex].sectionProgress[sectionProgressIndex].contentProgress.findIndex(
//       cp => cp.contentId.toString() === content._id.toString()
//     );
    
//     if (contentProgressIndex === -1) {
//       // Initialize content progress
//       course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex].sectionProgress[sectionProgressIndex].contentProgress.push({
//         contentId: content._id,
//         sequence: content.sequence,
//         watchedDuration: 0,
//         completed: false
//       });
//       contentProgressIndex = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex].sectionProgress[sectionProgressIndex].contentProgress.length - 1;
//     }
    
//     // Update content progress
//     course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex].sectionProgress[sectionProgressIndex].contentProgress[contentProgressIndex].watchedDuration = watchedDuration;
//     course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex].sectionProgress[sectionProgressIndex].contentProgress[contentProgressIndex].completed = completed;
//     course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex].sectionProgress[sectionProgressIndex].contentProgress[contentProgressIndex].lastAccessedAt = new Date();
    
//     // Check if all content in section is completed
//     if (completed) {
//       const allContentCompleted = section.content.every((content, idx) => {
//         if (idx <= contentIndex) {
//           const contentProgress = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex].sectionProgress[sectionProgressIndex].contentProgress.find(
//             cp => cp.contentId.toString() === content._id.toString()
//           );
//           return contentProgress && contentProgress.completed;
//         }
//         return false;
//       });
      
//       // If all content up to this point is completed, update current position
//       if (allContentCompleted) {
//         course.enrolledUsers[enrollmentIndex].currentChapter = parseInt(chapterIndex);
//         course.enrolledUsers[enrollmentIndex].currentSection = parseInt(sectionIndex);
//         course.enrolledUsers[enrollmentIndex].currentContent = parseInt(contentIndex);
        
//         // If this is the last content in the section and there's no quiz, mark section as completed
//         if (contentIndex === section.content.length - 1 && !section.quiz) {
//           course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex].sectionProgress[sectionProgressIndex].completed = true;
          
//           // Check if all sections in chapter are completed
//           const allSectionsCompleted = chapter.sections.every((sec, idx) => {
//             if (idx <= sectionIndex) {
//               const secProgress = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex].sectionProgress.find(
//                 sp => sp.sectionId.toString() === sec._id.toString()
//               );
//               return secProgress && secProgress.completed;
//             }
//             return false;
//           });
          
//           // If all sections up to this point are completed and this is the last section, mark chapter as completed
//           if (allSectionsCompleted && sectionIndex === chapter.sections.length - 1) {
//             course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex].completed = true;

//             const totalChapters = course.chapters.length;
//             const completedChapters = course.enrolledUsers[enrollmentIndex].chapterProgress.filter(cp => cp.completed).length;
            
//             const newProgress = Math.round((completedChapters / totalChapters) * 100);
//             course.enrolledUsers[enrollmentIndex].progress = newProgress;
            
//             // Check if all chapters are completed
//             if (completedChapters === totalChapters) {
//               // Calculate final grade
//               let totalScore = 0;
//               let totalQuizzes = 0;
              
//               course.enrolledUsers[enrollmentIndex].chapterProgress.forEach(cp => {
//                 cp.sectionProgress.forEach(sp => {
//                   if (sp.quizProgress && sp.quizProgress.bestScore > 0) {
//                     totalScore += sp.quizProgress.bestScore;
//                     totalQuizzes++;
//                   }
//                 });
//               });
              
//               if (totalQuizzes > 0) {
//                 const averageScore = totalScore / totalQuizzes;
//                 course.enrolledUsers[enrollmentIndex].gradePercentage = Math.round(averageScore);
                
//                 // Assign grade label
//                 const gradePercentage = course.enrolledUsers[enrollmentIndex].gradePercentage;
                
//                 if (gradePercentage >= 90) {
//                   course.enrolledUsers[enrollmentIndex].gradeLabel = 'A';
//                 } else if (gradePercentage >= 80) {
//                   course.enrolledUsers[enrollmentIndex].gradeLabel = 'B';
//                 } else if (gradePercentage >= 70) {
//                   course.enrolledUsers[enrollmentIndex].gradeLabel = 'C';
//                 } else if (gradePercentage >= 60) {
//                   course.enrolledUsers[enrollmentIndex].gradeLabel = 'D';
//                 } else {
//                   course.enrolledUsers[enrollmentIndex].gradeLabel = 'F';
//                 }
                
//                 // Check if user has earned a certificate
//                 if (gradePercentage >= course.passingGrade) {
//                   course.enrolledUsers[enrollmentIndex].certificateEarned = true;
//                   course.enrolledUsers[enrollmentIndex].certificateUrl = `/certificates/${courseId}/${userId}`;
//                 }
//               }
//             }
//           }
//         }
//       }
//     }
    
//     await course.save();
    
//     res.status(200).json({
//       success: true,
//       message: 'Progress updated successfully',
//       data: {
//         contentCompleted: completed,
//         progress: course.enrolledUsers[enrollmentIndex].progress,
//         currentChapter: course.enrolledUsers[enrollmentIndex].currentChapter,
//         currentSection: course.enrolledUsers[enrollmentIndex].currentSection,
//         currentContent: course.enrolledUsers[enrollmentIndex].currentContent
//       }
//     });
//   } catch (error) {
//     console.error('Error updating content progress:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to update content progress',
//       error: error.message
//     });
//   }
// };



// const updateContentProgress = async (req, res) => {
//   try {
//     const { courseId, chapterIndex, sectionIndex, contentIndex } = req.params;
//     const userId = req.user.id;
//     const { watchedDuration, completed } = req.body;
    
//     console.log("Updating content progress:", { 
//       courseId, chapterIndex, sectionIndex, contentIndex, watchedDuration, completed 
//     });
    
//     const course = await Course.findById(courseId)
//       .populate('chapters.sections.quiz', 'title description timeLimit passingScore');
    
//     if (!course) {
//       return res.status(404).json({
//         success: false,
//         message: 'Course not found'
//       });
//     }
    
//     // Find user's enrollment
//     const enrollmentIndex = course.enrolledUsers.findIndex(
//       enrollment => enrollment.user.toString() === userId
//     );
    
//     if (enrollmentIndex === -1) {
//       return res.status(404).json({
//         success: false,
//         message: 'User not enrolled in this course'
//       });
//     }
    
//     // Get the chapter, section, and content
//     const chapter = course.chapters[chapterIndex];
//     if (!chapter) {
//       return res.status(404).json({
//         success: false,
//         message: 'Chapter not found'
//       });
//     }
    
//     const section = chapter.sections[sectionIndex];
//     if (!section) {
//       return res.status(404).json({
//         success: false,
//         message: 'Section not found'
//       });
//     }
    
//     const content = section.content[contentIndex];
//     if (!content) {
//       return res.status(404).json({
//         success: false,
//         message: 'Content not found'
//       });
//     }
    
//     // Check if minimum watch time is met for videos
//     if (content.contentType === 'video' && completed) {
//       if (watchedDuration < content.minimumWatchTime) {
//         return res.status(400).json({
//           success: false,
//           message: 'Minimum watch time not met. Please watch more of the video before proceeding.',
//           requiredTime: content.minimumWatchTime,
//           currentTime: watchedDuration
//         });
//       }
//     }
    
//     // Update content progress
//     const chapterProgressIndex = course.enrolledUsers[enrollmentIndex].chapterProgress.findIndex(
//       cp => cp.chapterId.toString() === chapter._id.toString()
//     );
    
//     if (chapterProgressIndex === -1) {
//       return res.status(400).json({
//         success: false,
//         message: 'Chapter progress not initialized'
//       });
//     }
    
//     const sectionProgressIndex = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//       .sectionProgress.findIndex(
//         sp => sp.sectionId.toString() === section._id.toString()
//       );
    
//     if (sectionProgressIndex === -1) {
//       return res.status(400).json({
//         success: false,
//         message: 'Section progress not initialized'
//       });
//     }
    
//     const contentProgressIndex = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//       .sectionProgress[sectionProgressIndex].contentProgress.findIndex(
//         cp => cp.contentId.toString() === content._id.toString()
//       );
    
//     if (contentProgressIndex === -1) {
//       return res.status(400).json({
//         success: false,
//         message: 'Content progress not initialized'
//       });
//     }
    
//     // Update content progress
//     course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//       .sectionProgress[sectionProgressIndex].contentProgress[contentProgressIndex].watchedDuration = watchedDuration;
//     course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//       .sectionProgress[sectionProgressIndex].contentProgress[contentProgressIndex].completed = completed;
//     course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//       .sectionProgress[sectionProgressIndex].contentProgress[contentProgressIndex].lastAccessedAt = new Date();
    
//     await course.save();
    
//     // Determine next content if current content is completed
//     let nextContent = null;
    
//     if (completed) {
//       // Check if there's a next content item in the current section
//       if (parseInt(contentIndex) + 1 < section.content.length) {
//         // Next content in the same section
//         nextContent = {
//           navigationType: 'content',
//           chapterIndex: parseInt(chapterIndex),
//           sectionIndex: parseInt(sectionIndex),
//           contentIndex: parseInt(contentIndex) + 1,
//           content: section.content[parseInt(contentIndex) + 1]
//         };
//       } 
//       // If no more content in this section, check if there's a quiz
//       else if (section.quiz) {
//         // Get the quiz progress
//         const quizProgress = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//           .sectionProgress[sectionProgressIndex].quizProgress;
        
//         // Check if quiz is already passed
//         const quizPassed = quizProgress?.passed || false;
        
//         nextContent = {
//           navigationType: 'quiz',
//           chapterIndex: parseInt(chapterIndex),
//           sectionIndex: parseInt(sectionIndex),
//           quizId: section.quiz._id,
//           quizDetails: section.quiz,
//           quizPassed: quizPassed
//         };
//       }
//       // If no quiz or already passed, check if there's a next section
//       else if (parseInt(sectionIndex) + 1 < chapter.sections.length) {
//         // Next section in the same chapter
//         const nextSection = chapter.sections[parseInt(sectionIndex) + 1];
        
//         // If next section has content, go to first content
//         if (nextSection.content && nextSection.content.length > 0) {
//           nextContent = {
//             navigationType: 'content',
//             chapterIndex: parseInt(chapterIndex),
//             sectionIndex: parseInt(sectionIndex) + 1,
//             contentIndex: 0,
//             content: nextSection.content[0]
//           };
//         } else {
//           // Empty section (rare case), just point to the section
//           nextContent = {
//             navigationType: 'section',
//             chapterIndex: parseInt(chapterIndex),
//             sectionIndex: parseInt(sectionIndex) + 1,
//             section: nextSection
//           };
//         }
//       }
//       // If no next section, check if there's a next chapter
//       else if (parseInt(chapterIndex) + 1 < course.chapters.length) {
//         // Next chapter
//         const nextChapter = course.chapters[parseInt(chapterIndex) + 1];
        
//         // If next chapter has sections and first section has content
//         if (nextChapter.sections && 
//             nextChapter.sections.length > 0 && 
//             nextChapter.sections[0].content && 
//             nextChapter.sections[0].content.length > 0) {
          
//           nextContent = {
//             navigationType: 'content',
//             chapterIndex: parseInt(chapterIndex) + 1,
//             sectionIndex: 0,
//             contentIndex: 0,
//             content: nextChapter.sections[0].content[0]
//           };
//         } else if (nextChapter.sections && nextChapter.sections.length > 0) {
//           // Next chapter has sections but first section has no content
//           nextContent = {
//             navigationType: 'section',
//             chapterIndex: parseInt(chapterIndex) + 1,
//             sectionIndex: 0,
//             section: nextChapter.sections[0]
//           };
//         } else {
//           // Next chapter has no sections (rare case)
//           nextContent = {
//             navigationType: 'chapter',
//             chapterIndex: parseInt(chapterIndex) + 1,
//             chapter: nextChapter
//           };
//         }
//       }
//       // If we've reached here, the course is completed
//       else {
//         // Calculate final grade based on quiz scores
//         let totalScore = 0;
//         let totalQuizzes = 0;
        
//         course.enrolledUsers[enrollmentIndex].chapterProgress.forEach(cp => {
//           cp.sectionProgress.forEach(sp => {
//             if (sp.quizProgress && sp.quizProgress.bestScore > 0) {
//               totalScore += sp.quizProgress.bestScore;
//               totalQuizzes++;
//             }
//           });
//         });
        
//         const averageScore = totalQuizzes > 0 ? totalScore / totalQuizzes : 0;
//         course.enrolledUsers[enrollmentIndex].gradePercentage = Math.round(averageScore);
        
//         // Assign grade label based on percentage
//         if (averageScore >= 90) {
//           course.enrolledUsers[enrollmentIndex].gradeLabel = 'A';
//         } else if (averageScore >= 80) {
//           course.enrolledUsers[enrollmentIndex].gradeLabel = 'B';
//         } else if (averageScore >= 70) {
//           course.enrolledUsers[enrollmentIndex].gradeLabel = 'C';
//         } else if (averageScore >= 60) {
//           course.enrolledUsers[enrollmentIndex].gradeLabel = 'D';
//         } else {
//           course.enrolledUsers[enrollmentIndex].gradeLabel = 'F';
//         }
        
//         // Update progress to 100% since all content has been viewed
//         course.enrolledUsers[enrollmentIndex].progress = 100;
        
//         // Check if course is passed (grade >= passing grade)
//         const coursePassed = course.enrolledUsers[enrollmentIndex].gradePercentage >= course.passingGrade;
        
//         // If course is passed, award certificate
//         if (coursePassed) {
//           course.enrolledUsers[enrollmentIndex].certificateEarned = true;
//           course.enrolledUsers[enrollmentIndex].certificateUrl = `/certificates/${courseId}/${userId}`;
//         } else {
//           course.enrolledUsers[enrollmentIndex].certificateEarned = false;
//           course.enrolledUsers[enrollmentIndex].certificateUrl = null;
//         }
        
//         await course.save();
        
//         // If course is failed, find recommended short courses
//         let recommendedCourses = [];
//         if (!coursePassed) {
//           // Find short courses for the user's role and store
//           recommendedCourses = await Course.find({
//             courseType: "Short Course",
//             isActive: true,
//             $or: [
//               { 'accessControl.roles': req.user.role },
//               { 'accessControl.stores': req.user.warehouse }
//             ]
//           }).select('_id name description thumbnail level approximateHours');
//         }
        
//         nextContent = {
//           navigationType: 'complete',
//           courseCompleted: true,
//           progress: course.enrolledUsers[enrollmentIndex].progress,
//           gradePercentage: course.enrolledUsers[enrollmentIndex].gradePercentage,
//           gradeLabel: course.enrolledUsers[enrollmentIndex].gradeLabel,
//           certificateEarned: course.enrolledUsers[enrollmentIndex].certificateEarned,
//           certificateUrl: course.enrolledUsers[enrollmentIndex].certificateUrl,
//           coursePassed: coursePassed,
//           message: coursePassed 
//             ? 'Congratulations! You have successfully completed this course.' 
//             : 'You have completed this course, but your overall grade is below the passing threshold. We recommend taking some short courses to improve your knowledge.',
//           recommendedCourses: !coursePassed ? recommendedCourses : []
//         };
//       }
//     }
    
//     res.status(200).json({
//       success: true,
//       message: 'Progress updated successfully',
//       data: {
//         contentCompleted: completed,
//         progress: course.enrolledUsers[enrollmentIndex].progress,
//         currentChapter: course.enrolledUsers[enrollmentIndex].currentChapter,
//         currentSection: course.enrolledUsers[enrollmentIndex].currentSection,
//         currentContent: course.enrolledUsers[enrollmentIndex].currentContent,
//         nextContent: nextContent // Include information about the next content
//       }
//     });
//   } catch (error) {
//     console.error('Error updating content progress:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to update content progress',
//       error: error.message
//     });
//   }
// };



// comment routes





// const updateContentProgress = async (req, res) => {
//   try {
//     const { courseId, chapterId, sectionId, contentId } = req.params;
//     const userId = req.user.id;
//     const { watchedDuration, completed } = req.body;
    
//     console.log("Updating content progress:", { 
//       courseId, chapterId, sectionId, contentId, watchedDuration, completed 
//     });
    
//     const course = await Course.findById(courseId)
//       .populate('chapters.sections.quiz', 'title description timeLimit passingScore');
    
//     if (!course) {
//       return res.status(404).json({
//         success: false,
//         message: 'Course not found'
//       });
//     }
    
//     // Find user's enrollment
//     const enrollmentIndex = course.enrolledUsers.findIndex(
//       enrollment => enrollment.user.toString() === userId
//     );
    
//     if (enrollmentIndex === -1) {
//       return res.status(404).json({
//         success: false,
//         message: 'User not enrolled in this course'
//       });
//     }
    
//     // 🆕 UPDATE STATUS TO "IN PROGRESS" ON FIRST CONTENT ACCESS
//     if (course.enrolledUsers[enrollmentIndex].status === 'Not Started') {
//       course.enrolledUsers[enrollmentIndex].status = 'In Progress';
//       console.log(`User ${userId} started course - status updated to In Progress`);
//     }
    
//     // Find chapter, section, content indices
//     const chapterIndex = course.chapters.findIndex(chapter => chapter._id.toString() === chapterId);
//     const chapter = course.chapters[chapterIndex];
//     const sectionIndex = chapter.sections.findIndex(section => section._id.toString() === sectionId);
//     const section = chapter.sections[sectionIndex];
//     const contentIndex = section.content.findIndex(content => content._id.toString() === contentId);
//     const content = section.content[contentIndex];
    
//     // Find progress indices
//     const chapterProgressIndex = course.enrolledUsers[enrollmentIndex].chapterProgress.findIndex(
//       cp => cp.chapterId.toString() === chapter._id.toString()
//     );
    
//     const sectionProgressIndex = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//       .sectionProgress.findIndex(
//         sp => sp.sectionId.toString() === section._id.toString()
//       );
    
//     const contentProgressIndex = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//       .sectionProgress[sectionProgressIndex].contentProgress.findIndex(
//         cp => cp.contentId.toString() === content._id.toString()
//       );

//     // Get existing progress
//     const existingProgress = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//       .sectionProgress[sectionProgressIndex].contentProgress[contentProgressIndex];
    
//     const wasAlreadyCompleted = existingProgress.completed;
    
//     // Check minimum watch time for videos
//     if (content.contentType === 'video' && completed && !wasAlreadyCompleted) {
//       if (watchedDuration < content.minimumWatchTime) {
//         return res.status(400).json({
//           success: false,
//           message: 'Minimum watch time not met.',
//           requiredTime: content.minimumWatchTime,
//           currentTime: watchedDuration
//         });
//       }
//     }
    
//     // Update content progress
//     const finalWatchedDuration = wasAlreadyCompleted ? 
//       Math.max(existingProgress.watchedDuration, watchedDuration) : watchedDuration;
    
//     course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//       .sectionProgress[sectionProgressIndex].contentProgress[contentProgressIndex].watchedDuration = finalWatchedDuration;
    
//     const canMarkCompleted = wasAlreadyCompleted || 
//       (content.contentType === 'video' ? watchedDuration >= content.minimumWatchTime : true) ||
//       (content.contentType === 'text' ? completed : false);
    
//     course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//       .sectionProgress[sectionProgressIndex].contentProgress[contentProgressIndex].completed = 
//       completed && canMarkCompleted ? true : existingProgress.completed;
    
//     course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//       .sectionProgress[sectionProgressIndex].contentProgress[contentProgressIndex].lastAccessedAt = new Date();
    
//     // 🆕 UPDATE CURRENT POSITION
//     course.enrolledUsers[enrollmentIndex].currentChapter = chapterIndex;
//     course.enrolledUsers[enrollmentIndex].currentSection = sectionIndex;
//     course.enrolledUsers[enrollmentIndex].currentContent = contentIndex;
    
//     // 🆕 CALCULATE OVERALL PROGRESS (NOT GRADE YET)
//     const overallProgress = calculateOverallProgress(course, enrollmentIndex);
//     course.enrolledUsers[enrollmentIndex].progress = overallProgress;
    
//     // 🆕 CHECK IF ENTIRE COURSE IS COMPLETED
//     const courseCompleted = checkCourseCompletion(course, enrollmentIndex);
    
//     if (courseCompleted.allCompleted) {
//       // Calculate final grade only when everything is done
//      const finalGrade = calculateFinalGrade(course, enrollmentIndex);
  
//       course.enrolledUsers[enrollmentIndex].gradePercentage = finalGrade.percentage;
//       course.enrolledUsers[enrollmentIndex].gradeLabel = finalGrade.label;
//       course.enrolledUsers[enrollmentIndex].allChaptersCompleted = true;
//       course.enrolledUsers[enrollmentIndex].allQuizzesPassed = courseCompleted.allQuizzesPassed;
//       course.enrolledUsers[enrollmentIndex].completionDate = new Date();
      
//       // Determine final status
//       if (finalGrade.percentage >= course.passingGrade && courseCompleted.allQuizzesPassed) {
//         course.enrolledUsers[enrollmentIndex].status = 'Completed';
//         course.enrolledUsers[enrollmentIndex].certificateRequestStatus = 'Eligible';
//         course.enrolledUsers[enrollmentIndex].certificateEarned = true;
//       } else {
//         course.enrolledUsers[enrollmentIndex].status = 'Failed';
//         course.enrolledUsers[enrollmentIndex].certificateRequestStatus = 'Not Eligible';
//         course.enrolledUsers[enrollmentIndex].certificateEarned = false;
        
//         console.log(`User ${userId} failed course due to low overall grade`);
//       }
//     }
    
//     await course.save();
    
//     // Determine next content
//     let nextContent = null;
//     const isContentCompleted = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//       .sectionProgress[sectionProgressIndex].contentProgress[contentProgressIndex].completed;
    
//     if (isContentCompleted) {
//       nextContent = findNextContent(course, chapterIndex, sectionIndex, contentIndex, enrollmentIndex);
//     }
    
//     res.status(200).json({
//       success: true,
//       message: 'Progress updated successfully',
//       data: {
//         contentCompleted: isContentCompleted,
//         progress: course.enrolledUsers[enrollmentIndex].progress,
//         status: course.enrolledUsers[enrollmentIndex].status,
//         currentChapter: course.enrolledUsers[enrollmentIndex].currentChapter,
//         currentSection: course.enrolledUsers[enrollmentIndex].currentSection,
//         currentContent: course.enrolledUsers[enrollmentIndex].currentContent,
//         gradePercentage: course.enrolledUsers[enrollmentIndex].gradePercentage,
//         gradeLabel: course.enrolledUsers[enrollmentIndex].gradeLabel,
//         nextContent: nextContent,
//         courseCompleted: course.enrolledUsers[enrollmentIndex].status === 'Completed' || course.enrolledUsers[enrollmentIndex].status === 'Failed'
//       }
//     });
//   } catch (error) {
//     console.error('Error updating content progress:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to update content progress',
//       error: error.message
//     });
//   }
// };

// // 🆕 HELPER FUNCTION: Calculate Overall Progress
// function calculateOverallProgress(course, enrollmentIndex) {
//   const userEnrollment = course.enrolledUsers[enrollmentIndex];
//   let totalItems = 0;
//   let completedItems = 0;
  
//   // Count all content items and quizzes
//   course.chapters.forEach((chapter, chapterIdx) => {
//     chapter.sections.forEach((section, sectionIdx) => {
//       // Count content items
//       section.content.forEach((content, contentIdx) => {
//         totalItems++;
        
//         // Check if content is completed
//         const chapterProgress = userEnrollment.chapterProgress.find(
//           cp => cp.chapterId.toString() === chapter._id.toString()
//         );
        
//         if (chapterProgress) {
//           const sectionProgress = chapterProgress.sectionProgress.find(
//             sp => sp.sectionId.toString() === section._id.toString()
//           );
          
//           if (sectionProgress) {
//             const contentProgress = sectionProgress.contentProgress.find(
//               cp => cp.contentId.toString() === content._id.toString()
//             );
            
//             if (contentProgress && contentProgress.completed) {
//               completedItems++;
//             }
//           }
//         }
//       });
      
//       // Count quiz if exists
//       if (section.quiz) {
//         totalItems++;
        
//         const chapterProgress = userEnrollment.chapterProgress.find(
//           cp => cp.chapterId.toString() === chapter._id.toString()
//         );
        
//         if (chapterProgress) {
//           const sectionProgress = chapterProgress.sectionProgress.find(
//             sp => sp.sectionId.toString() === section._id.toString()
//           );
          
//           if (sectionProgress && sectionProgress.quizProgress && sectionProgress.quizProgress.passed) {
//             completedItems++;
//           }
//         }
//       }
//     });
//   });
  
//   return totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
// }

// // 🆕 HELPER FUNCTION: Check Course Completion
// function checkCourseCompletion(course, enrollmentIndex) {
//   const userEnrollment = course.enrolledUsers[enrollmentIndex];
//   let allContentCompleted = true;
//   let allQuizzesPassed = true;
  
//   // Check all chapters
//   for (const chapter of course.chapters) {
//     for (const section of chapter.sections) {
//       // Check all content in section
//       for (const content of section.content) {
//         const chapterProgress = userEnrollment.chapterProgress.find(
//           cp => cp.chapterId.toString() === chapter._id.toString()
//         );
        
//         if (!chapterProgress) {
//           allContentCompleted = false;
//           break;
//         }
        
//         const sectionProgress = chapterProgress.sectionProgress.find(
//           sp => sp.sectionId.toString() === section._id.toString()
//         );
        
//         if (!sectionProgress) {
//           allContentCompleted = false;
//           break;
//         }
        
//         const contentProgress = sectionProgress.contentProgress.find(
//           cp => cp.contentId.toString() === content._id.toString()
//         );
        
//         if (!contentProgress || !contentProgress.completed) {
//           allContentCompleted = false;
//           break;
//         }
//       }
      
//       // Check quiz if exists
//       if (section.quiz) {
//         const chapterProgress = userEnrollment.chapterProgress.find(
//           cp => cp.chapterId.toString() === chapter._id.toString()
//         );
        
//         if (chapterProgress) {
//           const sectionProgress = chapterProgress.sectionProgress.find(
//             sp => sp.sectionId.toString() === section._id.toString()
//           );
          
//           if (!sectionProgress || !sectionProgress.quizProgress || !sectionProgress.quizProgress.passed) {
//             allQuizzesPassed = false;
//           }
//         } else {
//           allQuizzesPassed = false;
//         }
//       }
      
//       if (!allContentCompleted) break;
//     }
//     if (!allContentCompleted) break;
//   }
  
//   return {
//     allCompleted: allContentCompleted && allQuizzesPassed,
//     allContentCompleted,
//     allQuizzesPassed
//   };
// }

// // 🆕 HELPER FUNCTION: Calculate Final Grade
// function calculateFinalGrade(course, enrollmentIndex) {
//   const userEnrollment = course.enrolledUsers[enrollmentIndex];
//   let totalScore = 0;
//   let totalQuizzes = 0;
  
//   // Calculate average of all quiz scores
//   userEnrollment.chapterProgress.forEach(cp => {
//     cp.sectionProgress.forEach(sp => {
//       if (sp.quizProgress && sp.quizProgress.bestScore > 0) {
//         totalScore += sp.quizProgress.bestScore;
//         totalQuizzes++;
//       }
//     });
//   });
  
//   const averageScore = totalQuizzes > 0 ? totalScore / totalQuizzes : 0;
//   const percentage = Math.round(averageScore);
  
//   let label = 'F';
//   if (percentage >= 90) label = 'A';
//   else if (percentage >= 80) label = 'B';
//   else if (percentage >= 70) label = 'C';
//   else if (percentage >= 60) label = 'D';
  
//   return { percentage, label };
// }

// // 🆕 HELPER FUNCTION: Find Next Content
// function findNextContent(course, chapterIndex, sectionIndex, contentIndex, enrollmentIndex) {
//   const chapter = course.chapters[chapterIndex];
//   const section = chapter.sections[sectionIndex];
  
//   // Check if there's a next content item in the current section
//   if (contentIndex + 1 < section.content.length) {
//     const nextContentItem = section.content[contentIndex + 1];
//     return {
//       navigationType: 'content',
//       chapterId: chapter._id,
//       sectionId: section._id,
//       contentId: nextContentItem._id,
//       content: nextContentItem
//     };
//   } 
//   // If no more content, check if there's a quiz
//   else if (section.quiz) {
//     const userEnrollment = course.enrolledUsers[enrollmentIndex];
//     const chapterProgress = userEnrollment.chapterProgress.find(
//       cp => cp.chapterId.toString() === chapter._id.toString()
//     );
    
//     const sectionProgress = chapterProgress.sectionProgress.find(
//       sp => sp.sectionId.toString() === section._id.toString()
//     );
    
//     const quizPassed = sectionProgress?.quizProgress?.passed || false;
    
//     return {
//       navigationType: 'quiz',
//       chapterId: chapter._id,
//       sectionId: section._id,
//       quizId: section.quiz._id,
//       quizPassed: quizPassed
//     };
//   }
//   // Check next section
//   else if (sectionIndex + 1 < chapter.sections.length) {
//     const nextSection = chapter.sections[sectionIndex + 1];
    
//     if (nextSection.content && nextSection.content.length > 0) {
//       return {
//         navigationType: 'content',
//         chapterId: chapter._id,
//         sectionId: nextSection._id,
//         contentId: nextSection.content[0]._id,
//         content: nextSection.content[0]
//       };
//     }
//   }
//   // Check next chapter
//   else if (chapterIndex + 1 < course.chapters.length) {
//     const nextChapter = course.chapters[chapterIndex + 1];
    
//     if (nextChapter.sections && 
//         nextChapter.sections.length > 0 && 
//         nextChapter.sections[0].content && 
//         nextChapter.sections[0].content.length > 0) {
      
//       return {
//         navigationType: 'content',
//         chapterId: nextChapter._id,
//         sectionId: nextChapter.sections[0]._id,
//         contentId: nextChapter.sections[0].content[0]._id,
//         content: nextChapter.sections[0].content[0]
//       };
//     }
//   }
  
//   // Course completed
//   const userEnrollment = course.enrolledUsers[enrollmentIndex];
//   return {
//     navigationType: 'complete',
//     courseCompleted: true,
//     status: userEnrollment.status,
//     progress: userEnrollment.progress,
//     gradePercentage: userEnrollment.gradePercentage,
//     gradeLabel: userEnrollment.gradeLabel,
//     certificateEarned: userEnrollment.certificateEarned,
//     certificateUrl: userEnrollment.certificateUrl
//   };
// }







// new duplicate
// const updateContentProgress = async (req, res) => {
//   try {
//     const { courseId, chapterId, sectionId, contentId } = req.params;
//     const userId = req.user.id;
//     const { watchedDuration, completed } = req.body;
    
//     console.log("Updating content progress:", { 
//       courseId, chapterId, sectionId, contentId, watchedDuration, completed 
//     });
    
//     const course = await Course.findById(courseId)
//       .populate('chapters.sections.quiz', 'title description timeLimit passingScore maxAttempts enableSuffling enableTimer questionTimeLimit weightage questions isActive createdAt updatedAt');
    
//     if (!course) {
//       return res.status(404).json({
//         success: false,
//         message: 'Course not found'
//       });
//     }
    
//     // Find user's enrollment
//     const enrollmentIndex = course.enrolledUsers.findIndex(
//       enrollment => enrollment.user.toString() === userId
//     );
    
//     if (enrollmentIndex === -1) {
//       return res.status(404).json({
//         success: false,
//         message: 'User not enrolled in this course'
//       });
//     }
    
//     // 🆕 UPDATE STATUS TO "IN PROGRESS" ON FIRST CONTENT ACCESS
//     if (course.enrolledUsers[enrollmentIndex].status === 'Not Started') {
//       course.enrolledUsers[enrollmentIndex].status = 'In Progress';
//       console.log(`User ${userId} started course - status updated to In Progress`);
//     }
    
//     // Find chapter, section, content indices
//     const chapterIndex = course.chapters.findIndex(chapter => chapter._id.toString() === chapterId);
//     const chapter = course.chapters[chapterIndex];
//     const sectionIndex = chapter.sections.findIndex(section => section._id.toString() === sectionId);
//     const section = chapter.sections[sectionIndex];
//     const contentIndex = section.content.findIndex(content => content._id.toString() === contentId);
//     const content = section.content[contentIndex];
    
//     // Find progress indices
//     const chapterProgressIndex = course.enrolledUsers[enrollmentIndex].chapterProgress.findIndex(
//       cp => cp.chapterId.toString() === chapter._id.toString()
//     );
    
//     const sectionProgressIndex = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//       .sectionProgress.findIndex(
//         sp => sp.sectionId.toString() === section._id.toString()
//       );
    
//     const contentProgressIndex = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//       .sectionProgress[sectionProgressIndex].contentProgress.findIndex(
//         cp => cp.contentId.toString() === content._id.toString()
//       );

//     // Get existing progress
//     const existingProgress = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//       .sectionProgress[sectionProgressIndex].contentProgress[contentProgressIndex];
    
//     const wasAlreadyCompleted = existingProgress.completed;
    
//     // Check minimum watch time for videos
//     if (content.contentType === 'video' && completed && !wasAlreadyCompleted) {
//       if (watchedDuration < content.minimumWatchTime) {
//         return res.status(400).json({
//           success: false,
//           message: 'Minimum watch time not met.',
//           requiredTime: content.minimumWatchTime,
//           currentTime: watchedDuration
//         });
//       }
//     }
    
//     // Update content progress
//     const finalWatchedDuration = wasAlreadyCompleted ? 
//       Math.max(existingProgress.watchedDuration, watchedDuration) : watchedDuration;
    
//     course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//       .sectionProgress[sectionProgressIndex].contentProgress[contentProgressIndex].watchedDuration = finalWatchedDuration;
    
//     const canMarkCompleted = wasAlreadyCompleted || 
//       (content.contentType === 'video' ? watchedDuration >= content.minimumWatchTime : true) ||
//       (content.contentType === 'text' ? completed : false);
    
//     course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//       .sectionProgress[sectionProgressIndex].contentProgress[contentProgressIndex].completed = 
//       completed && canMarkCompleted ? true : existingProgress.completed;
    
//     course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//       .sectionProgress[sectionProgressIndex].contentProgress[contentProgressIndex].lastAccessedAt = new Date();
    
//     // 🆕 UPDATE CURRENT POSITION
//     course.enrolledUsers[enrollmentIndex].currentChapter = chapterIndex;
//     course.enrolledUsers[enrollmentIndex].currentSection = sectionIndex;
//     course.enrolledUsers[enrollmentIndex].currentContent = contentIndex;
    
//     const statusUpdated = updateCompletionStatus(course, enrollmentIndex);
//     console.log('Completion status updated:', statusUpdated);

//     // 🆕 CALCULATE OVERALL PROGRESS (NOT GRADE YET)
// const overallProgress = calculateOverallProgress(course, enrollmentIndex);
//     course.enrolledUsers[enrollmentIndex].progress = overallProgress;
    
//     // 🆕 CHECK IF ENTIRE COURSE IS COMPLETED
//     const courseCompleted = checkCourseCompletion(course, enrollmentIndex);
    
//     if (courseCompleted.allCompleted) {
//       // Calculate final grade only when everything is done
//      const finalGrade = calculateFinalGrade(course, enrollmentIndex);
  
//       course.enrolledUsers[enrollmentIndex].gradePercentage = finalGrade.percentage;
//       course.enrolledUsers[enrollmentIndex].gradeLabel = finalGrade.label;
//       course.enrolledUsers[enrollmentIndex].allChaptersCompleted = true;
//       course.enrolledUsers[enrollmentIndex].allQuizzesPassed = courseCompleted.allQuizzesPassed;
//       course.enrolledUsers[enrollmentIndex].completionDate = new Date();
//       course.enrolledUsers[enrollmentIndex].progress = 100; // 🆕 FORCE 100%
      
//       // Determine final status
//       if (finalGrade.percentage >= course.passingGrade && courseCompleted.allQuizzesPassed) {
//         course.enrolledUsers[enrollmentIndex].status = 'Completed';
//         course.enrolledUsers[enrollmentIndex].certificateRequestStatus = 'Eligible';
//         course.enrolledUsers[enrollmentIndex].certificateEarned = true;
//       } else {
//         course.enrolledUsers[enrollmentIndex].status = 'Failed';
//         course.enrolledUsers[enrollmentIndex].certificateRequestStatus = 'Not Eligible';
//         course.enrolledUsers[enrollmentIndex].certificateEarned = false;
        
//         console.log(`User ${userId} failed course due to low overall grade`);
//       }
//     }
    
//     await course.save();
    
//     // Determine next content
//     let nextContent = null;
//     const isContentCompleted = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//       .sectionProgress[sectionProgressIndex].contentProgress[contentProgressIndex].completed;
    
//     if (isContentCompleted) {
//       nextContent = findNextContent(course, chapterIndex, sectionIndex, contentIndex, enrollmentIndex);
//     }
    
//     res.status(200).json({
//       success: true,
//       message: 'Progress updated successfully',
//       data: {
//         contentCompleted: isContentCompleted,
//         progress: course.enrolledUsers[enrollmentIndex].progress,
//         status: course.enrolledUsers[enrollmentIndex].status,
//         currentChapter: course.enrolledUsers[enrollmentIndex].currentChapter,
//         currentSection: course.enrolledUsers[enrollmentIndex].currentSection,
//         currentContent: course.enrolledUsers[enrollmentIndex].currentContent,
//         gradePercentage: course.enrolledUsers[enrollmentIndex].gradePercentage,
//         gradeLabel: course.enrolledUsers[enrollmentIndex].gradeLabel,
//         nextContent: nextContent,
//         courseCompleted: course.enrolledUsers[enrollmentIndex].status === 'Completed' || course.enrolledUsers[enrollmentIndex].status === 'Failed'
//       }
//     });
//   } catch (error) {
//     console.error('Error updating content progress:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to update content progress',
//       error: error.message
//     });
//   }
// };


const updateContentProgress = async (req, res) => {
  try {
    const { courseId, chapterId, sectionId, contentId } = req.params;
    const userId = req.user.id;
    const { watchedDuration = 0, completed = false } = req.body;

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // ✅ Enrollment check
    const enrollmentIndex = course.enrolledUsers.findIndex(
      e => e.user.toString() === userId
    );
    if (enrollmentIndex === -1) {
      return res.status(404).json({ success: false, message: 'User not enrolled' });
    }

    const enrollment = course.enrolledUsers[enrollmentIndex];

    // ✅ Update status on first access
    if (enrollment.status === 'Not Started') {
      enrollment.status = 'In Progress';
    }

    // =======================
    // FIND CHAPTER / SECTION / CONTENT
    // =======================

    const chapterIndex = course.chapters.findIndex(c => c._id.toString() === chapterId);
    if (chapterIndex === -1) return res.status(404).json({ success: false, message: 'Chapter not found' });
    const chapter = course.chapters[chapterIndex];

    const sectionIndex = chapter.sections.findIndex(s => s._id.toString() === sectionId);
    if (sectionIndex === -1) return res.status(404).json({ success: false, message: 'Section not found' });
    const section = chapter.sections[sectionIndex];

    const contentIndex = section.content.findIndex(c => c._id.toString() === contentId);
    if (contentIndex === -1) return res.status(404).json({ success: false, message: 'Content not found' });
    const content = section.content[contentIndex];

    // =======================
    // ENSURE CHAPTER PROGRESS
    // =======================

    let chapterProgress = enrollment.chapterProgress.find(
      cp => cp.chapterId.toString() === chapterId
    );

    if (!chapterProgress) {
      chapterProgress = {
        chapterId: chapter._id,
        sectionProgress: []
      };
      enrollment.chapterProgress.push(chapterProgress);
    }

    // =======================
    // ENSURE SECTION PROGRESS
    // =======================

    let sectionProgress = chapterProgress.sectionProgress.find(
      sp => sp.sectionId.toString() === sectionId
    );

    if (!sectionProgress) {
      sectionProgress = {
        sectionId: section._id,
        contentProgress: []
      };
      chapterProgress.sectionProgress.push(sectionProgress);
    }

    // =======================
    // ENSURE CONTENT PROGRESS
    // =======================

    let contentProgress = sectionProgress.contentProgress.find(
      cp => cp.contentId.toString() === contentId
    );

    if (!contentProgress) {
      contentProgress = {
        contentId: content._id,
        watchedDuration: 0,
        completed: false,
        lastAccessedAt: new Date()
      };
      sectionProgress.contentProgress.push(contentProgress);
    }

    // =======================
    // VALIDATION (VIDEO)
    // =======================

    if (
      content.contentType === 'video' &&
      completed &&
      !contentProgress.completed &&
      watchedDuration < content.minimumWatchTime
    ) {
      return res.status(400).json({
        success: false,
        message: 'Minimum watch time not met',
        required: content.minimumWatchTime,
        watched: watchedDuration
      });
    }

    // =======================
    // UPDATE CONTENT PROGRESS
    // =======================

    contentProgress.watchedDuration = Math.max(
      contentProgress.watchedDuration,
      watchedDuration
    );

    if (completed) {
      contentProgress.completed = true;
    }

    contentProgress.lastAccessedAt = new Date();

    // =======================
    // UPDATE CURRENT POSITION
    // =======================

    enrollment.currentChapter = chapterIndex;
    enrollment.currentSection = sectionIndex;
    enrollment.currentContent = contentIndex;

    // =======================
    // CALCULATIONS
    // =======================

    enrollment.progress = calculateOverallProgress(course, enrollmentIndex);

    const courseCompleted = checkCourseCompletion(course, enrollmentIndex);

    if (courseCompleted.allCompleted) {
      const finalGrade = calculateFinalGrade(course, enrollmentIndex);

      enrollment.gradePercentage = finalGrade.percentage;
      enrollment.gradeLabel = finalGrade.label;
      enrollment.allChaptersCompleted = true;
      enrollment.allQuizzesPassed = courseCompleted.allQuizzesPassed;
      enrollment.completionDate = new Date();
      enrollment.progress = 100;

      if (
        finalGrade.percentage >= course.passingGrade &&
        courseCompleted.allQuizzesPassed
      ) {
        enrollment.status = 'Completed';
        enrollment.certificateEarned = true;
        enrollment.certificateRequestStatus = 'Eligible';
      } else {
        enrollment.status = 'Failed';
        enrollment.certificateEarned = false;
        enrollment.certificateRequestStatus = 'Not Eligible';
      }
    }

    await course.save();

    // =======================
    // NEXT CONTENT
    // =======================

    let nextContent = null;
    if (contentProgress.completed) {
      nextContent = findNextContent(
        course,
        chapterIndex,
        sectionIndex,
        contentIndex,
        enrollmentIndex
      );
    }

    res.status(200).json({
      success: true,
      message: 'Progress updated successfully',
      data: {
        progress: enrollment.progress,
        status: enrollment.status,
        currentChapter: enrollment.currentChapter,
        currentSection: enrollment.currentSection,
        currentContent: enrollment.currentContent,
        nextContent,
        courseCompleted:
          enrollment.status === 'Completed' || enrollment.status === 'Failed'
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Failed to update content progress',
      error: error.message
    });
  }
};

// 🆕 HELPER FUNCTION: Calculate Overall Progress
function calculateOverallProgress(course, enrollmentIndex) {
  const userEnrollment = course.enrolledUsers[enrollmentIndex];
  
  console.log('=== CALCULATING PROGRESS ===');
  
  // 🆕 FIRST CHECK: If already marked as completed, return 100%
  if (userEnrollment.status === 'Completed' && 
      userEnrollment.allChaptersCompleted && 
      userEnrollment.allQuizzesPassed) {
    console.log('Course marked as completed, returning 100%');
    return 100;
  }
  
  let totalItems = 0;
  let completedItems = 0;
  
  // Count all content items and quizzes
  course.chapters.forEach((chapter) => {
    chapter.sections.forEach((section) => {
      // Count content items
      section.content.forEach((content) => {
        totalItems++;
        
        // Check if content is completed
        const chapterProgress = userEnrollment.chapterProgress.find(
          cp => cp.chapterId.toString() === chapter._id.toString()
        );
        
        if (chapterProgress) {
          const sectionProgress = chapterProgress.sectionProgress.find(
            sp => sp.sectionId.toString() === section._id.toString()
          );
          
          if (sectionProgress) {
            const contentProgress = sectionProgress.contentProgress.find(
              cp => cp.contentId.toString() === content._id.toString()
            );
            
            if (contentProgress && contentProgress.completed) {
              completedItems++;
            }
          }
        }
      });
      
      // Count quiz if exists
      if (section.quiz) {
        totalItems++;
        
        const chapterProgress = userEnrollment.chapterProgress.find(
          cp => cp.chapterId.toString() === chapter._id.toString()
        );
        
        if (chapterProgress) {
          const sectionProgress = chapterProgress.sectionProgress.find(
            sp => sp.sectionId.toString() === section._id.toString()
          );
          
          if (sectionProgress && sectionProgress.quizProgress && sectionProgress.quizProgress.passed) {
            completedItems++;
          }
        }
      }
    });
  });
  
  const calculatedProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  
  console.log(`Progress calculation: ${completedItems}/${totalItems} = ${calculatedProgress}%`);
  
  // 🆕 FORCE 100% if everything is actually completed
  if (calculatedProgress === 100 || 
      (userEnrollment.allChaptersCompleted && userEnrollment.allQuizzesPassed)) {
    console.log('Forcing progress to 100%');
    return 100;
  }
  
  return calculatedProgress;
}

// 🆕 HELPER FUNCTION: Check Course Completion
function checkCourseCompletion(course, enrollmentIndex) {
  const userEnrollment = course.enrolledUsers[enrollmentIndex];
  let allContentCompleted = true;
  let allQuizzesPassed = true;
  
  // Check all chapters
  for (const chapter of course.chapters) {
    for (const section of chapter.sections) {
      // Check all content in section
      for (const content of section.content) {
        const chapterProgress = userEnrollment.chapterProgress.find(
          cp => cp.chapterId.toString() === chapter._id.toString()
        );
        
        if (!chapterProgress) {
          allContentCompleted = false;
          break;
        }
        
        const sectionProgress = chapterProgress.sectionProgress.find(
          sp => sp.sectionId.toString() === section._id.toString()
        );
        
        if (!sectionProgress) {
          allContentCompleted = false;
          break;
        }
        
        const contentProgress = sectionProgress.contentProgress.find(
          cp => cp.contentId.toString() === content._id.toString()
        );
        
        if (!contentProgress || !contentProgress.completed) {
          allContentCompleted = false;
          break;
        }
      }
      
      // Check quiz if exists
      if (section.quiz) {
        const chapterProgress = userEnrollment.chapterProgress.find(
          cp => cp.chapterId.toString() === chapter._id.toString()
        );
        
        if (chapterProgress) {
          const sectionProgress = chapterProgress.sectionProgress.find(
            sp => sp.sectionId.toString() === section._id.toString()
          );
          
          if (!sectionProgress || !sectionProgress.quizProgress || !sectionProgress.quizProgress.passed) {
            allQuizzesPassed = false;
          }
        } else {
          allQuizzesPassed = false;
        }
      }
      
      if (!allContentCompleted) break;
    }
    if (!allContentCompleted) break;
  }
  
  return {
    allCompleted: allContentCompleted && allQuizzesPassed,
    allContentCompleted,
    allQuizzesPassed
  };
}

// 🆕 HELPER FUNCTION: Calculate Final Grade
function calculateFinalGrade(course, enrollmentIndex) {
  const userEnrollment = course.enrolledUsers[enrollmentIndex];
  let totalScore = 0;
  let totalQuizzes = 0;
  
  // Calculate average of all quiz scores
  userEnrollment.chapterProgress.forEach(cp => {
    cp.sectionProgress.forEach(sp => {
      if (sp.quizProgress && sp.quizProgress.bestScore > 0) {
        totalScore += sp.quizProgress.bestScore;
        totalQuizzes++;
      }
    });
  });
  
  const averageScore = totalQuizzes > 0 ? totalScore / totalQuizzes : 0;
  const percentage = Math.round(averageScore);
  
  let label = 'F';
  if (percentage >= 90) label = 'A';
  else if (percentage >= 80) label = 'B';
  else if (percentage >= 70) label = 'C';
  else if (percentage >= 60) label = 'D';
  
  return { percentage, label };
}

// 🆕 HELPER FUNCTION: Find Next Content
function findNextContent(course, chapterIndex, sectionIndex, contentIndex, enrollmentIndex) {
  const chapter = course.chapters[chapterIndex];
  const section = chapter.sections[sectionIndex];
  
  // Check if there's a next content item in the current section
  if (contentIndex + 1 < section.content.length) {
    const nextContentItem = section.content[contentIndex + 1];
    return {
      navigationType: 'content',
      chapterId: chapter._id,
      sectionId: section._id,
      contentId: nextContentItem._id,
      content: nextContentItem
    };
  } 
  // If no more content, check if there's a quiz
  else if (section.quiz) {
    const userEnrollment = course.enrolledUsers[enrollmentIndex];
    const chapterProgress = userEnrollment.chapterProgress.find(
      cp => cp.chapterId.toString() === chapter._id.toString()
    );
    
    const sectionProgress = chapterProgress.sectionProgress.find(
      sp => sp.sectionId.toString() === section._id.toString()
    );
    
    const quizPassed = sectionProgress?.quizProgress?.passed || false;
    
    // return {
    //   navigationType: 'quiz',
    //   chapterId: chapter._id,
    //   sectionId: section._id,
    //   quizId: section.quiz._id,
    //   quizPassed: quizPassed,

      
    // };
     return {
    navigationType: 'quiz',
    chapterId: chapter._id,
    sectionId: section._id,
    quizId: section.quiz._id,
    quizPassed: quizPassed,
    quiz: {
      _id: section.quiz._id,
      courseId: section.quiz.courseId,
      chapterId: section.quiz.chapterId,
      sectionId: section.quiz.sectionId,
      title: section.quiz.title || '',
      description: section.quiz.description || '',
      timeLimit: section.quiz.timeLimit || 30,
      maxAttempts: section.quiz.maxAttempts || 3,
      weightage: section.quiz.weightage || 100,
      
      // 🆕 FIXED: Properly include these fields
      enableSuffling: section.quiz.enableSuffling !== undefined ? section.quiz.enableSuffling : true,
      enableTimer: section.quiz.enableTimer !== undefined ? section.quiz.enableTimer : false,
      
      questionTimeLimit: section.quiz.questionTimeLimit || 30,
      questions: section.quiz.questions && Array.isArray(section.quiz.questions) 
        ? section.quiz.questions.map(question => ({
            _id: question._id,
            question: question.question || '',
            options: question.options || [],
            correctAnswer: question.correctAnswer || 0,
            points: question.points || 1
          }))
        : [],
      passingScore: section.quiz.passingScore || 70,
      isActive: section.quiz.isActive !== undefined ? section.quiz.isActive : true,
      createdAt: section.quiz.createdAt,
      updatedAt: section.quiz.updatedAt,
      userProgress: {
        attempts: sectionProgress?.quizProgress?.attempts || 0,
        bestScore: sectionProgress?.quizProgress?.bestScore || 0,
        passed: quizPassed,
        lastAttemptDate: sectionProgress?.quizProgress?.lastAttemptDate || null
      }
    }
  };
  }
  // Check next section
  else if (sectionIndex + 1 < chapter.sections.length) {
    const nextSection = chapter.sections[sectionIndex + 1];
    
    if (nextSection.content && nextSection.content.length > 0) {
      return {
        navigationType: 'content',
        chapterId: chapter._id,
        sectionId: nextSection._id,
        contentId: nextSection.content[0]._id,
        content: nextSection.content[0]
      };
    }
  }
  // Check next chapter
  else if (chapterIndex + 1 < course.chapters.length) {
    const nextChapter = course.chapters[chapterIndex + 1];
    
    if (nextChapter.sections && 
        nextChapter.sections.length > 0 && 
        nextChapter.sections[0].content && 
        nextChapter.sections[0].content.length > 0) {
      
      return {
        navigationType: 'content',
        chapterId: nextChapter._id,
        sectionId: nextChapter.sections[0]._id,
        contentId: nextChapter.sections[0].content[0]._id,
        content: nextChapter.sections[0].content[0]
      };
    }
  }
  
  // Course completed
  const userEnrollment = course.enrolledUsers[enrollmentIndex];
  return {
    navigationType: 'complete',
    courseCompleted: true,
    status: userEnrollment.status,
    progress: userEnrollment.progress,
    gradePercentage: userEnrollment.gradePercentage,
    gradeLabel: userEnrollment.gradeLabel,
    certificateEarned: userEnrollment.certificateEarned,
    certificateUrl: userEnrollment.certificateUrl
  };
}


// 🆕 ADDITIONAL HELPER: Update Section and Chapter Completion Status
function updateCompletionStatus(course, enrollmentIndex) {
  const userEnrollment = course.enrolledUsers[enrollmentIndex];
  let statusUpdated = false;
  
  console.log('=== UPDATING COMPLETION STATUS ===');
  
  // Update section and chapter completion status
  course.chapters.forEach((chapter, chapterIdx) => {
    const chapterProgress = userEnrollment.chapterProgress.find(
      cp => cp.chapterId.toString() === chapter._id.toString()
    );
    
    if (chapterProgress) {
      console.log(`Checking Chapter: ${chapter.title}`);
      
      chapter.sections.forEach((section, sectionIdx) => {
        const sectionProgress = chapterProgress.sectionProgress.find(
          sp => sp.sectionId.toString() === section._id.toString()
        );
        
        if (sectionProgress) {
          console.log(`  Checking Section: ${section.title}`);
          
          // Check if all content in section is completed
          const allContentCompleted = section.content.every(content => {
            const contentProgress = sectionProgress.contentProgress.find(
              cp => cp.contentId.toString() === content._id.toString()
            );
            const isCompleted = contentProgress && contentProgress.completed;
            console.log(`    Content "${content.title}": ${isCompleted ? 'COMPLETED' : 'NOT COMPLETED'}`);
            return isCompleted;
          });
          
          // Check if quiz is passed (if exists)
          let quizPassed = true; // Default true if no quiz
          if (section.quiz) {
            quizPassed = sectionProgress.quizProgress && sectionProgress.quizProgress.passed;
            console.log(`    Quiz: ${quizPassed ? 'PASSED' : 'NOT PASSED'}`);
          } else {
            console.log(`    Quiz: NO QUIZ`);
          }
          
          // 🆕 UPDATE SECTION COMPLETION
          if (allContentCompleted && quizPassed && !sectionProgress.completed) {
            sectionProgress.completed = true;
            statusUpdated = true;
            console.log(`  ✅ Section "${section.title}" marked as COMPLETED`);
          } else if (allContentCompleted && quizPassed) {
            console.log(`  ✅ Section "${section.title}" already COMPLETED`);
          } else {
            console.log(`  ❌ Section "${section.title}" NOT COMPLETED (content: ${allContentCompleted}, quiz: ${quizPassed})`);
          }
        }
      });
      
      // 🆕 UPDATE CHAPTER COMPLETION
      const allSectionsCompleted = chapterProgress.sectionProgress.every(sp => {
        console.log(`    Section completed status: ${sp.completed}`);
        return sp.completed;
      });
      
      if (allSectionsCompleted && !chapterProgress.completed) {
        chapterProgress.completed = true;
        statusUpdated = true;
        console.log(`✅ Chapter "${chapter.title}" marked as COMPLETED`);
      } else if (allSectionsCompleted) {
        console.log(`✅ Chapter "${chapter.title}" already COMPLETED`);
      } else {
        console.log(`❌ Chapter "${chapter.title}" NOT COMPLETED`);
      }
    }
  });
  
  console.log('Status update result:', statusUpdated);
  return statusUpdated;
}







// 1. get reomended short courses for failed users:
const getRecommendedShortCourses = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRoleId = req.user.role;
    const userWarehouseId = req.user.warehouse;
    
    // Find courses where user has failed (grade < 70%)
    const failedCourses = await Course.find({
      'enrolledUsers.user': userId,
      'enrolledUsers.gradePercentage': { $lt: 70, $gt: 0 },
      isActive: true
    }).select('name enrolledUsers'); // Add enrolledUsers to select
    
    let recommendedCourses = [];
    
    if (failedCourses.length > 0) {
      recommendedCourses = await Course.find({
        courseType: "Short Course",
        isActive: true,
        $or: [
          { 'accessControl.roles': userRoleId },
          { 'accessControl.stores': userWarehouseId }
        ]
      })
      .populate('accessControl.roles', 'name')
      .populate('accessControl.stores', 'name')
      .select('_id name description thumbnail level approximateHours courseType language sequence')
      .sort({ sequence: 1 });
    }

    res.status(200).json({
      success: true,
      data: {
        hasFailedCourses: failedCourses.length > 0,
        failedCourses: failedCourses.map(course => ({
          name: course.name,
          grade: (course.enrolledUsers || []).find(e => e.user && e.user.toString() === userId)?.gradePercentage || 0
        })),
        recommendedShortCourses: recommendedCourses,
        message: failedCourses.length > 0 
          ? 'You have failed some courses. We recommend taking these short courses to improve your knowledge.'
          : 'Great! You have passed all your courses.'
      }
    });
    
  } catch (error) {
    console.error('Error getting recommended short courses:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting recommended short courses',
      error: error.message
    });
  }
};




// 2. Get available courses with unlock status based on prerequisites
const getAvailableCoursesWithStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRoleId = req.user.role;
    const userWarehouseId = req.user.warehouse;

    
    
    if (!userRoleId || !userWarehouseId) { 
      return res.status(400).json({
        success: false,
        message: 'User role or warehouse not found. Please contact administrator.',
        debug: {
          hasRole: !!userRoleId,
          hasWarehouse: !!userWarehouseId
        }
      });
    }


    const UserRole = await UserRole.findById(userRoleId)
    .select('role_name _id')
    .lean();
    const Warehouse = await Warehouse.findById(userWarehouseId)
    .select('name _id')
    .lean();

    
    // Get all courses for user's role and warehouse
    const allCourses = await Course.find({
      courseType: "Course", // Only main courses, not short courses
      isActive: true,
      $and: [
        { 'accessControl.roles': userRoleId },
        { 'accessControl.stores': Warehouse?._id }
      ]
    })
    .populate('accessControl.roles', 'name')
    .populate('accessControl.stores', 'name')
    .select('_id name description thumbnail level approximateHours courseType language sequence passingGrade enrolledUsers')
    .sort({ sequence: 1 });
    
    const coursesWithStatus = [];
    
    for (let i = 0; i < allCourses.length; i++) {
      const course = allCourses[i];
      const enrollment = course.enrolledUsers.find(e => e.user.toString() === userId);
      
      let status = 'locked';
      let canAccess = false;
      let progress = 0;
      let grade = null;
      let certificateEarned = false;
      
      // First course is always unlocked
      if (i === 0) {
        status = 'unlocked';
        canAccess = true;
      } else {
        // Check if previous course is completed with passing grade
        const prevCourse = allCourses[i - 1];
        const prevEnrollment = prevCourse.enrolledUsers.find(e => e.user.toString() === userId);
        
        if (prevEnrollment && 
            prevEnrollment.progress === 100 && 
            prevEnrollment.gradePercentage >= prevCourse.passingGrade) {
          status = 'unlocked';
          canAccess = true;
        }
      }
      
      // If user is enrolled, get their progress
      if (enrollment) {
        progress = enrollment.progress;
        grade = enrollment.gradePercentage;
        certificateEarned = enrollment.certificateEarned;
        
        if (progress === 100) {
          status = grade >= course.passingGrade ? 'completed_passed' : 'completed_failed';
        } else if (progress > 0) {
          status = 'in_progress';
        }
      }
      
      coursesWithStatus.push({
        _id: course._id,
        name: course.name,
        description: course.description,
        thumbnail: course.thumbnail,
        level: course.level,
        approximateHours: course.approximateHours,
        language: course.language,
        sequence: course.sequence,
        passingGrade: course.passingGrade,
        status: status,
        canAccess: canAccess,
        progress: progress,
        grade: grade,
        certificateEarned: certificateEarned,
        isEnrolled: !!enrollment
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        courses: coursesWithStatus,
        totalCourses: coursesWithStatus.length,
        unlockedCourses: coursesWithStatus.filter(c => c.canAccess).length,
        completedCourses: coursesWithStatus.filter(c => c.status.includes('completed')).length,
        passedCourses: coursesWithStatus.filter(c => c.status === 'completed_passed').length
      }
    });
    
  } catch (error) {
    console.error('Error getting available courses:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting available courses',
      error: error.message
    });
  }
};




// dashboard:
const getDashboardSidebar = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRoleId = req.user.role;
    const userWarehouseId = req.user.warehouse;
    
    console.log('User Info:', { userId, userRoleId, userWarehouseId });
    
    // ✅ Validation - Check if role and warehouse exist
    if (!userRoleId || !userWarehouseId) { 
      return res.status(400).json({
        success: false,
        message: 'User role or warehouse not found. Please contact administrator.',
        debug: {
          hasRole: !!userRoleId,
          hasWarehouse: !!userWarehouseId
        }
      });
    }
      const userRole = await UserRole.findById(userRoleId)
      .select('role_name _id')
      .lean();
      const userWarehouse = await Warehouse.findById(userWarehouseId)
      .select('name _id')
      .lean();

      console.log('Userrole and warehouse:', userRole , userWarehouse);
    
    // Object to store all sidebar information
    const sidebarInfo = {
      newCourses: [],
      newShortCourses: [],
      upcomingLessons: [],
      upcomingQuizzes: [],
      inProgressCourses: []
    };
    
    // ✅ FIXED QUERY - Both role AND warehouse must match
    const accessQuery = {
      isActive: true,
       $and: [
        { 'accessControl.roles': userRoleId },
        { 'accessControl.stores': userWarehouse?._id }
      ]
    };
    
    console.log('Access Query (Both Required):', JSON.stringify(accessQuery, null, 2));
    
    const accessibleCourses = await Course.find(accessQuery)
      .select('_id name description thumbnail level courseType language approximateHours createdAt sequence enrolledUsers chapters')
      .sort({ sequence: 1 })
      .lean();
    
    console.log(`Found ${accessibleCourses.length} accessible courses for user (role + warehouse match)`);
    
    if (accessibleCourses.length === 0) {
      console.log('No courses found for this role + warehouse combination');
      return res.status(200).json({
        success: true,
        message: 'No courses available for your role and warehouse',
        data: {
          ...sidebarInfo,
          summary: {
            userInfo: {
              id: userId,
              roleName: userRole.role_name,
              warehouseName: userWarehouse?.name
            },
            totalAccessibleCourses: 0,
            message: 'No courses assigned to your role and warehouse combination'
          }
        }
      });
    }
    
    // 2. Separate enrolled and new courses
    const enrolledCourseIds = [];
    const enrolledCoursesData = [];
    
    for (const course of accessibleCourses) {
      const enrollment = course.enrolledUsers.find(
        e => e.user.toString() === userId.toString()
      );
      
      if (enrollment) {
        enrolledCourseIds.push(course._id.toString());
        enrolledCoursesData.push({
          ...course,
          enrollment: enrollment
        });
      }
    }
    
    console.log(`User enrolled in ${enrolledCourseIds.length} courses`);
    
    // 3. Find NEW courses (not enrolled)
    const newRegularCourses = accessibleCourses
      .filter(course => 
        !enrolledCourseIds.includes(course._id.toString()) && 
        course.courseType === 'Course'
      )
      .sort((a, b) => a.sequence - b.sequence) // Sort by sequence
      .slice(0, 5);
    
    const newShortCourses = accessibleCourses
      .filter(course => 
        !enrolledCourseIds.includes(course._id.toString()) && 
        course.courseType === 'Short Course'
      )
      .sort((a, b) => a.sequence - b.sequence) // Sort by sequence
      .slice(0, 5);
    
    console.log(`New regular courses: ${newRegularCourses.length}, New short courses: ${newShortCourses.length}`);
    
    sidebarInfo.newCourses = newRegularCourses.map(course => ({
      courseId: course._id,
      courseName: course.name,
      description: course.description,
      thumbnail: course.thumbnail,
      level: course.level,
      courseType: course.courseType,
      language: course.language,
      approximateHours: course.approximateHours,
      sequence: course.sequence,
      createdAt: course.createdAt
    }));
    
    sidebarInfo.newShortCourses = newShortCourses.map(course => ({
      courseId: course._id,
      courseName: course.name,
      description: course.description,
      thumbnail: course.thumbnail,
      level: course.level,
      courseType: course.courseType,
      language: course.language,
      approximateHours: course.approximateHours,
      sequence: course.sequence,
      createdAt: course.createdAt
    }));
    
    // 4. Process enrolled courses for upcoming content and progress
    for (const courseData of enrolledCoursesData) {
      const course = courseData;
      const enrollment = courseData.enrollment;
      
      console.log(`Processing course: ${course.name}, Progress: ${enrollment.progress}%`);
      
      // Add to in-progress if between 1% and 99%
      if (enrollment.progress > 0 && enrollment.progress < 100) {
        sidebarInfo.inProgressCourses.push({
          courseId: course._id,
          courseName: course.name,
          thumbnail: course.thumbnail,
          level: course.level,
          courseType: course.courseType,
          progress: enrollment.progress,
          status: enrollment.status,
          currentChapter: enrollment.currentChapter,
          currentSection: enrollment.currentSection,
          currentContent: enrollment.currentContent
        });
      }
      
      // Find next upcoming lesson and quiz based on current position
      const currentChapterIndex = enrollment.currentChapter || 0;
      const currentSectionIndex = enrollment.currentSection || 0;
      const currentContentIndex = enrollment.currentContent || 0;
      
      console.log(`Current position - Chapter: ${currentChapterIndex}, Section: ${currentSectionIndex}, Content: ${currentContentIndex}`);
      
      // Find upcoming lesson
      let nextLesson = findNextLesson(course, enrollment, currentChapterIndex, currentSectionIndex, currentContentIndex);
      if (nextLesson) {
        sidebarInfo.upcomingLessons.push(nextLesson);
      }
      
      // Find upcoming quiz
      let nextQuiz = findNextQuiz(course, enrollment, currentChapterIndex, currentSectionIndex);
      if (nextQuiz) {
        sidebarInfo.upcomingQuizzes.push(nextQuiz);
      }
    }
    
    // Remove duplicates and limit results
    sidebarInfo.upcomingLessons = removeDuplicates(sidebarInfo.upcomingLessons, 'courseId').slice(0, 5);
    sidebarInfo.upcomingQuizzes = removeDuplicates(sidebarInfo.upcomingQuizzes, 'quizId').slice(0, 5);
    sidebarInfo.inProgressCourses = sidebarInfo.inProgressCourses.slice(0, 5);
    
    // Add summary
    const summary = {
      userInfo: {
       id: userId,
       roleName: userRole.role_name,
       warehouseName: userWarehouse?.name
      },
      totalAccessibleCourses: accessibleCourses.length,
      totalEnrolledCourses: enrolledCourseIds.length,
      totalNewCourses: sidebarInfo.newCourses.length,
      totalNewShortCourses: sidebarInfo.newShortCourses.length,
      totalInProgressCourses: sidebarInfo.inProgressCourses.length,
      totalUpcomingLessons: sidebarInfo.upcomingLessons.length,
      totalUpcomingQuizzes: sidebarInfo.upcomingQuizzes.length
    };
    
    console.log('Dashboard Summary:', summary);
    
    res.status(200).json({
      success: true,
      message: 'Dashboard sidebar data retrieved successfully',
      data: {
        ...sidebarInfo,
        summary
      }
    });
    
  } catch (error) {
    console.error('Error getting dashboard sidebar:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting dashboard sidebar information',
      error: error.message
    });
  }
};

// ✅ Helper function to find next lesson
function findNextLesson(course, enrollment, currentChapterIndex, currentSectionIndex, currentContentIndex) {
  if (!course.chapters || !course.chapters[currentChapterIndex]) return null;
  
  const currentChapter = course.chapters[currentChapterIndex];
  if (!currentChapter.sections || !currentChapter.sections[currentSectionIndex]) return null;
  
  const currentSection = currentChapter.sections[currentSectionIndex];
  
  // 1. Check for next content in current section
  if (currentSection.content && currentSection.content[currentContentIndex + 1]) {
    const nextContent = currentSection.content[currentContentIndex + 1];
    return {
      courseId: course._id,
      courseName: course.name,
      chapterIndex: currentChapterIndex,
      chapterTitle: currentChapter.title,
      chapterSequence: currentChapter.sequence,
      sectionIndex: currentSectionIndex,
      sectionTitle: currentSection.title,
      sectionSequence: currentSection.sequence,
      contentIndex: currentContentIndex + 1,
      contentTitle: nextContent.title,
      contentType: nextContent.contentType,
      contentSequence: nextContent.sequence,
      thumbnail: course.thumbnail,
      type: 'next_content_in_section'
    };
  }
  
  // 2. Check next section in current chapter
  if (currentChapter.sections[currentSectionIndex + 1]) {
    const nextSection = currentChapter.sections[currentSectionIndex + 1];
    if (nextSection.content && nextSection.content[0]) {
      return {
        courseId: course._id,
        courseName: course.name,
        chapterIndex: currentChapterIndex,
        chapterTitle: currentChapter.title,
        chapterSequence: currentChapter.sequence,
        sectionIndex: currentSectionIndex + 1,
        sectionTitle: nextSection.title,
        sectionSequence: nextSection.sequence,
        contentIndex: 0,
        contentTitle: nextSection.content[0].title,
        contentType: nextSection.content[0].contentType,
        contentSequence: nextSection.content[0].sequence,
        thumbnail: course.thumbnail,
        type: 'next_section_first_content'
      };
    }
  }
  
  // 3. Check next chapter
  if (course.chapters[currentChapterIndex + 1]) {
    const nextChapter = course.chapters[currentChapterIndex + 1];
    if (nextChapter.sections && nextChapter.sections[0] && nextChapter.sections[0].content && nextChapter.sections[0].content[0]) {
      return {
        courseId: course._id,
        courseName: course.name,
        chapterIndex: currentChapterIndex + 1,
        chapterTitle: nextChapter.title,
        chapterSequence: nextChapter.sequence,
        sectionIndex: 0,
        sectionTitle: nextChapter.sections[0].title,
        sectionSequence: nextChapter.sections[0].sequence,
        contentIndex: 0,
        contentTitle: nextChapter.sections[0].content[0].title,
        contentType: nextChapter.sections[0].content[0].contentType,
        contentSequence: nextChapter.sections[0].content[0].sequence,
        thumbnail: course.thumbnail,
        type: 'next_chapter_first_content'
      };
    }
  }
  
  return null;
}

// ✅ Helper function to find next quiz
function findNextQuiz(course, enrollment, currentChapterIndex, currentSectionIndex) {
  if (!course.chapters || !course.chapters[currentChapterIndex]) return null;
  
  const currentChapter = course.chapters[currentChapterIndex];
  if (!currentChapter.sections || !currentChapter.sections[currentSectionIndex]) return null;
  
  const currentSection = currentChapter.sections[currentSectionIndex];
  
  // Check if current section has quiz and it's not passed yet
  if (currentSection.quiz) {
    const chapterProgress = enrollment.chapterProgress?.find(
      cp => cp.chapterId.toString() === currentChapter._id.toString()
    );
    
    const sectionProgress = chapterProgress?.sectionProgress?.find(
      sp => sp.sectionId.toString() === currentSection._id.toString()
    );
    
    if (!sectionProgress?.quizProgress?.passed) {
      return {
        courseId: course._id,
        courseName: course.name,
        chapterTitle: currentChapter.title,
        chapterSequence: currentChapter.sequence,
        sectionTitle: currentSection.title,
        sectionSequence: currentSection.sequence,
        quizId: currentSection.quiz,
        thumbnail: course.thumbnail,
        type: 'current_section_quiz'
      };
    }
  }
  
  return null;
}

// ✅ Helper function to remove duplicates
function removeDuplicates(array, key) {
  return array.filter((item, index, self) => 
    index === self.findIndex(i => i[key] && i[key].toString() === item[key].toString())
  );
}




const getNextContent = async (req, res) => {
 try {
    const { courseId } = req.params;
    const { currentChapterIndex, currentSectionIndex, currentContentIndex } = req.query;
    const userId = req.user.id;
    
    // Convert string indices to numbers
    const chapterIndex = parseInt(currentChapterIndex);
    const sectionIndex = parseInt(currentSectionIndex);
    const contentIndex = parseInt(currentContentIndex);
    
    console.log("Navigation request:", { chapterIndex, sectionIndex, contentIndex });
    
    // Find the course
    const course = await Course.findById(courseId)
      .populate('chapters.sections.quiz', 'title description timeLimit passingScore')
      .populate('accessControl.roles', 'name')
      .populate('accessControl.stores', 'name');
    
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Check if user is enrolled
    const enrollment = course.enrolledUsers.find(
      e => e.user.toString() === userId
    );
    
    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: 'User not enrolled in this course'
      });
    }
    
    // Get current chapter, section, and content
    const currentChapter = course.chapters[chapterIndex];
    if (!currentChapter) {
      return res.status(404).json({
        success: false,
        message: 'Chapter not found'
      });
    }
    
    const currentSection = currentChapter.sections[sectionIndex];
    if (!currentSection) {
      return res.status(404).json({
        success: false,
        message: 'Section not found'
      });
    }
    
    // Find chapter progress
    const chapterProgress = enrollment.chapterProgress.find(
      cp => cp.chapterId.toString() === currentChapter._id.toString()
    );
    
    if (!chapterProgress) {
      console.log("Chapter progress not found");
      return res.status(400).json({
        success: false,
        message: 'Chapter progress not initialized'
      });
    }
    
    // Find section progress
    const sectionProgress = chapterProgress.sectionProgress.find(
      sp => sp.sectionId.toString() === currentSection._id.toString()
    );
    
    if (!sectionProgress) {
      console.log("Section progress not found");
      return res.status(400).json({
        success: false,
        message: 'Section progress not initialized'
      });
    }
    
    // Check if there's a next content item in the current section
    if (contentIndex + 1 < currentSection.content.length) {
      // Next content in the same section
      const nextContent = currentSection.content[contentIndex + 1];
      
      // Check if previous content is completed
      const prevContentProgress = sectionProgress.contentProgress.find(
        cp => cp.sequence === currentSection.content[contentIndex].sequence
      );
      
      if (!prevContentProgress || !prevContentProgress.completed) {
        return res.status(400).json({
          success: false,
          message: 'Please complete the current content before proceeding'
        });
      }
      
      return res.status(200).json({
        success: true,
        data: {
          navigationType: 'content',
          chapterIndex: chapterIndex,
          sectionIndex: sectionIndex,
          contentIndex: contentIndex + 1,
          content: nextContent
        }
      });
    }
    
    // If no more content in this section, check if there's a quiz
    if (currentSection.quiz) {
      // Check if all content in this section is completed
      const allContentCompleted = sectionProgress.contentProgress.length === currentSection.content.length &&
        sectionProgress.contentProgress.every(cp => cp.completed);
      
      if (!allContentCompleted) {
        return res.status(400).json({
          success: false,
          message: 'Please complete all content in this section before taking the quiz'
        });
      }
      
      // Get the quiz progress
      const quizProgress = sectionProgress.quizProgress;
      
      // Check if quiz is already passed or has been attempted
      const quizPassed = quizProgress?.passed || false;
      const quizAttempted = quizProgress?.attempts > 0;
      
      // If quiz hasn't been attempted yet, direct to quiz
      if (!quizAttempted) {
        return res.status(200).json({
          success: true,
          data: {
            navigationType: 'quiz',
            chapterIndex: chapterIndex,
            sectionIndex: sectionIndex,
            quizId: currentSection.quiz._id,
            quizDetails: currentSection.quiz,
            quizPassed: quizPassed
          }
        });
      }
    }
    
    // If no quiz or quiz has been attempted (pass or fail), check if there's a next section
    if (sectionIndex + 1 < currentChapter.sections.length) {
      // Next section in the same chapter
      const nextSection = currentChapter.sections[sectionIndex + 1];
      
      // If next section has content, go to first content
      if (nextSection.content && nextSection.content.length > 0) {
        return res.status(200).json({
          success: true,
          data: {
            navigationType: 'content',
            chapterIndex: chapterIndex,
            sectionIndex: sectionIndex + 1,
            contentIndex: 0,
            content: nextSection.content[0]
          }
        });
      } else {
        // Empty section (rare case), just point to the section
        return res.status(200).json({
          success: true,
          data: {
            navigationType: 'section',
            chapterIndex: chapterIndex,
            sectionIndex: sectionIndex + 1,
            section: nextSection
          }
        });
      }
    }
    
    // If no next section, check if there's a next chapter
    if (chapterIndex + 1 < course.chapters.length) {
const nextChapter = course.chapters[chapterIndex + 1];
      
      // If next chapter has sections and first section has content
      if (nextChapter.sections && 
          nextChapter.sections.length > 0 && 
          nextChapter.sections[0].content && 
          nextChapter.sections[0].content.length > 0) {
        
        return res.status(200).json({
          success: true,
          data: {
            navigationType: 'content',
            chapterIndex: chapterIndex + 1,
            sectionIndex: 0,
            contentIndex: 0,
            content: nextChapter.sections[0].content[0]
          }
        });
      } else if (nextChapter.sections && nextChapter.sections.length > 0) {
        // Next chapter has sections but first section has no content
        return res.status(200).json({
          success: true,
          data: {
            navigationType: 'section',
            chapterIndex: chapterIndex + 1,
            sectionIndex: 0,
            section: nextChapter.sections[0]
          }
        });
      } else {
        // Next chapter has no sections (rare case)
        return res.status(200).json({
          success: true,
          data: {
            navigationType: 'chapter',
            chapterIndex: chapterIndex + 1,
            chapter: nextChapter
          }
        });
      }
    }
    
    // If we've reached here, the course is completed
    // Calculate final grade based on quiz scores
    let totalScore = 0;
    let totalQuizzes = 0;
    
    enrollment.chapterProgress.forEach(cp => {
      cp.sectionProgress.forEach(sp => {
        if (sp.quizProgress && sp.quizProgress.bestScore > 0) {
          totalScore += sp.quizProgress.bestScore;
          totalQuizzes++;
        }
      });
    });
    
    const averageScore = totalQuizzes > 0 ? totalScore / totalQuizzes : 0;
    enrollment.gradePercentage = Math.round(averageScore);
    
    // Assign grade label based on percentage
    if (averageScore >= 90) {
      enrollment.gradeLabel = 'A';
    } else if (averageScore >= 80) {
      enrollment.gradeLabel = 'B';
    } else if (averageScore >= 70) {
      enrollment.gradeLabel = 'C';
    } else if (averageScore >= 60) {
      enrollment.gradeLabel = 'D';
    } else {
      enrollment.gradeLabel = 'F';
    }
    
    // Update progress to 100% since all content has been viewed
    enrollment.progress = 100;
    
    // Check if course is passed (grade >= passing grade)
    const coursePassed = enrollment.gradePercentage >= course.passingGrade;
    
    // If course is passed, award certificate
    if (coursePassed) {
      enrollment.certificateEarned = true;
      enrollment.certificateUrl = `/certificates/${courseId}/${userId}`;
    }
    
    await course.save();
    
    // If course is failed, find recommended short courses
    let recommendedCourses = [];
    if (!coursePassed) {
      // Find short courses for the user's role and store
      recommendedCourses = await Course.find({
        courseType: "Short Course",
        isActive: true,
        $or: [
          { 'accessControl.roles': req.user.role },
          { 'accessControl.stores': req.user.warehouse }
        ]
      }).select('_id name description thumbnail level approximateHours');
    }
    
    return res.status(200).json({
      success: true,
      data: {
        navigationType: 'complete',
        courseCompleted: true,
        progress: enrollment.progress,
        gradePercentage: enrollment.gradePercentage,
        gradeLabel: enrollment.gradeLabel,
        certificateEarned: enrollment.certificateEarned,
        certificateUrl: enrollment.certificateUrl,
        coursePassed: coursePassed,
        message: coursePassed 
          ? 'Congratulations! You have successfully completed this course.' 
          : 'You have completed this course, but your overall grade is below the passing threshold. We recommend taking some short courses to improve your knowledge.',
        recommendedCourses: !coursePassed ? recommendedCourses : []
      }
    });
    
  } catch (error) {
    console.error('Error getting next content:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting next content',
      error: error.message
    });
  }
};



module.exports = {
  getNextContent,
  updateContentProgress,
  getDashboardSidebar,
  getRecommendedShortCourses,
  getCustomerDashboard,
  getAvailableCoursesWithStatus
  
};

