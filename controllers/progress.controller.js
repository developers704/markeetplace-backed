const Course = require('../models/course.model');
const Quiz = require('../models/quiz.model');
const mongoose  = require('mongoose');

const checkContentAccess = async (req, res) => {
  try {
    const { courseId, chapterIndex, sectionIndex, contentIndex } = req.params;
    const userId = req.user._id; // Assuming user is authenticated

    // Find the course and user enrollment
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Find user enrollment
    const userEnrollment = course.enrolledUsers.find(
      enrollment => enrollment.user.toString() === userId.toString()
    );

    if (!userEnrollment) {
      return res.status(403).json({ message: 'User not enrolled in this course' });
    }

    // Convert indices to numbers
    const chIdx = parseInt(chapterIndex);
    const secIdx = parseInt(sectionIndex);
    const conIdx = parseInt(contentIndex);

    // Validate chapter exists
    if (!course.chapters[chIdx]) {
      return res.status(404).json({ message: 'Chapter not found' });
    }

    // Validate section exists
    if (!course.chapters[chIdx].sections[secIdx]) {
      return res.status(404).json({ message: 'Section not found' });
    }

    // Validate content exists
    if (!course.chapters[chIdx].sections[secIdx].content[conIdx]) {
      return res.status(404).json({ message: 'Content not found' });
    }

    // Check if user is trying to access content out of sequence
    const isSequential = await checkSequentialAccess(
      userEnrollment, 
      course, 
      chIdx, 
      secIdx, 
      conIdx
    );

    if (!isSequential.allowed) {
      return res.status(403).json({ 
        message: isSequential.message,
        previousContent: isSequential.previousContent
      });
    }

    // User can access the content
    res.status(200).json({ 
      allowed: true,
      message: 'Access granted to content',
      content: course.chapters[chIdx].sections[secIdx].content[conIdx]
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}




const getRecommendedShortCourses = async (req, res) => {
  try {
    const { quizId } = req.params;
    const userId = req.user._id; // Assuming user is authenticated

    // Find the quiz
    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    // Find user's attempt for this quiz
    const userAttempt = quiz.attempts.find(
      attempt => attempt.userId.toString() === userId.toString()
    );

    if (!userAttempt) {
      return res.status(404).json({ message: 'No attempts found for this quiz' });
    }

    // Check if user actually failed the quiz
    if (userAttempt.passed) {
      return res.status(400).json({ 
        message: 'User has already passed this quiz',
        passed: true
      });
    }

    // Find short courses related to this quiz's topic
    // Here we're assuming short courses have courseType = "Short Course"
    // and we're finding courses related to the same chapter/section
    const shortCourses = await Course.find({
      courseType: 'Short Course',
      // You might want to add more specific criteria here based on your data structure
      // For example, you could tag short courses with topics or skills
    }).select('_id name description thumbnail approximateHours level');

    // If no short courses found, return appropriate message
    if (shortCourses.length === 0) {
      return res.status(404).json({ 
        message: 'No short courses found for this topic',
        shortCourses: []
      });
    }

    res.status(200).json({
      message: 'Short courses recommended based on failed quiz',
      failedQuiz: {
        quizId: quiz._id,
        title: quiz.title,
        score: userAttempt.percentage,
        passingScore: quiz.passingScore
      },
      shortCourses
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



const checkShortCourseCompletion = async (req, res) => {
  try {
    const { quizId } = req.params;
    const userId = req.user._id; // Assuming user is authenticated

    // Find the quiz
    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    // Find user's attempt for this quiz
    const userAttempt = quiz.attempts.find(
      attempt => attempt.userId.toString() === userId.toString()
    );

    if (!userAttempt) {
      return res.status(404).json({ message: 'No attempts found for this quiz' });
    }

    // Check if user has already passed the quiz
    if (userAttempt.passed) {
      return res.status(200).json({ 
        message: 'User has already passed this quiz',
        passed: true,
        canProceed: true
      });
    }

    // Find short courses that user has completed
    // This assumes you have a way to track short course completion
    // You might need to adjust this based on your actual data structure
    const completedShortCourses = await Course.find({
      courseType: 'Short Course',
      'enrolledUsers.user': userId,
      'enrolledUsers.progress': 100 // Assuming 100% progress means completed
    }).select('_id name');

    // Check if user has completed at least one short course
    // You might want to make this more specific based on your requirements
    const canProceed = completedShortCourses.length > 0;

    res.status(200).json({
      message: canProceed 
        ? 'User has completed required short courses and can retake the quiz' 
        : 'User needs to complete at least one short course before retaking the quiz',
      canProceed,
      completedShortCourses
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};




const updateContentProgress = async (req, res) => {
  try {
    const { courseId, chapterIndex, sectionIndex, contentIndex } = req.params;
    const userId = req.user._id; // Assuming user is authenticated
    const { watchedDuration, completed } = req.body;

    // Find the course
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Convert indices to numbers
    const chIdx = parseInt(chapterIndex);
    const secIdx = parseInt(sectionIndex);
    const conIdx = parseInt(contentIndex);

    // Validate chapter, section, and content exist
    if (!course.chapters[chIdx] || 
        !course.chapters[chIdx].sections[secIdx] || 
        !course.chapters[chIdx].sections[secIdx].content[conIdx]) {
      return res.status(404).json({ message: 'Invalid chapter, section, or content' });
    }

    // Get the content
    const content = course.chapters[chIdx].sections[secIdx].content[conIdx];

    // Find user enrollment index
    const enrollmentIndex = course.enrolledUsers.findIndex(
      enrollment => enrollment.user.toString() === userId.toString()
    );

    if (enrollmentIndex === -1) {
      return res.status(403).json({ message: 'User not enrolled in this course' });
    }

    // Find or create chapter progress
    let chapterProgress = course.enrolledUsers[enrollmentIndex].chapterProgress.find(
      cp => cp.sequence === chIdx
    );

    if (!chapterProgress) {
      chapterProgress = {
        chapterId: course.chapters[chIdx]._id,
        sequence: chIdx,
        completed: false,
        sectionProgress: []
      };
      course.enrolledUsers[enrollmentIndex].chapterProgress.push(chapterProgress);
    }

    // Find chapter progress index
    const chapterProgressIndex = course.enrolledUsers[enrollmentIndex].chapterProgress.findIndex(
      cp => cp.sequence === chIdx
    );

    // Find or create section progress
    let sectionProgress = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
      .sectionProgress.find(sp => sp.sequence === secIdx);

    if (!sectionProgress) {
      sectionProgress = {
        sectionId: course.chapters[chIdx].sections[secIdx]._id,
        sequence: secIdx,
        completed: false,
        contentProgress: []
      };
      course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
        .sectionProgress.push(sectionProgress);
    }

    // Find section progress index
    const sectionProgressIndex = course.enrolledUsers[enrollmentIndex]
      .chapterProgress[chapterProgressIndex].sectionProgress.findIndex(
        sp => sp.sequence === secIdx
      );

    // Find or create content progress
    let contentProgress = course.enrolledUsers[enrollmentIndex]
      .chapterProgress[chapterProgressIndex].sectionProgress[sectionProgressIndex]
      .contentProgress.find(cp => cp.sequence === conIdx);

    // Validate completion requirements for video content
    let isValidCompletion = true;
    let message = '';

    if (content.contentType === 'video' && completed) {
      // For video content, check if minimum watch time is met
      const minimumWatchRequired = content.minimumWatchTime || 0;
      
      if (watchedDuration < minimumWatchRequired) {
        isValidCompletion = false;
        message = `You must watch at least ${minimumWatchRequired} seconds of this video to mark it as complete.`;
      }
    }

    if (!isValidCompletion) {
      return res.status(400).json({ message });
    }

    if (!contentProgress) {
      // Create new content progress
      contentProgress = {
        contentId: content._id,
        sequence: conIdx,
        watchedDuration: watchedDuration || 0,
        completed: completed || false,
        lastAccessedAt: new Date()
      };
      
      course.enrolledUsers[enrollmentIndex]
        .chapterProgress[chapterProgressIndex]
        .sectionProgress[sectionProgressIndex]
        .contentProgress.push(contentProgress);
    } else {
      // Update existing content progress
      const contentProgressIndex = course.enrolledUsers[enrollmentIndex]
        .chapterProgress[chapterProgressIndex]
        .sectionProgress[sectionProgressIndex]
        .contentProgress.findIndex(cp => cp.sequence === conIdx);
      
      course.enrolledUsers[enrollmentIndex]
        .chapterProgress[chapterProgressIndex]
        .sectionProgress[sectionProgressIndex]
        .contentProgress[contentProgressIndex] = {
          ...course.enrolledUsers[enrollmentIndex]
            .chapterProgress[chapterProgressIndex]
            .sectionProgress[sectionProgressIndex]
            .contentProgress[contentProgressIndex],
          watchedDuration: watchedDuration || 
            course.enrolledUsers[enrollmentIndex]
              .chapterProgress[chapterProgressIndex]
              .sectionProgress[sectionProgressIndex]
              .contentProgress[contentProgressIndex].watchedDuration,
          completed: completed || 
            course.enrolledUsers[enrollmentIndex]
              .chapterProgress[chapterProgressIndex]
              .sectionProgress[sectionProgressIndex]
              .contentProgress[contentProgressIndex].completed,
          lastAccessedAt: new Date()
        };
    }

    // Check if all content in section is completed
    const allContentCompleted = course.enrolledUsers[enrollmentIndex]
      .chapterProgress[chapterProgressIndex]
      .sectionProgress[sectionProgressIndex]
      .contentProgress.every(cp => cp.completed) &&
      course.enrolledUsers[enrollmentIndex]
        .chapterProgress[chapterProgressIndex]
        .sectionProgress[sectionProgressIndex]
        .contentProgress.length === course.chapters[chIdx].sections[secIdx].content.length;

    // Update section completion status
    course.enrolledUsers[enrollmentIndex]
      .chapterProgress[chapterProgressIndex]
      .sectionProgress[sectionProgressIndex].completed = allContentCompleted;

    // Check if all sections in chapter are completed
    const allSectionsCompleted = course.enrolledUsers[enrollmentIndex]
      .chapterProgress[chapterProgressIndex]
      .sectionProgress.every(sp => sp.completed) &&
      course.enrolledUsers[enrollmentIndex]
        .chapterProgress[chapterProgressIndex]
        .sectionProgress.length === course.chapters[chIdx].sections.length;

    // Update chapter completion status
    course.enrolledUsers[enrollmentIndex]
      .chapterProgress[chapterProgressIndex].completed = allSectionsCompleted;

    // Update overall course progress
    updateOverallProgress(course, enrollmentIndex);

    // Save the course
    await course.save();

    res.status(200).json({
      message: 'Progress updated successfully',
      completed,
      sectionCompleted: allContentCompleted,
      chapterCompleted: allSectionsCompleted
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// Helper function to check if user can access content in sequence
async function checkSequentialAccess(userEnrollment, course, chapterIndex, sectionIndex, contentIndex) {
  // If it's the first content of first section of first chapter, always allow
  if (chapterIndex === 0 && sectionIndex === 0 && contentIndex === 0) {
    return { allowed: true };
  }

  // Find the chapter progress
  const chapterProgress = userEnrollment.chapterProgress.find(
    cp => cp.sequence === chapterIndex
  );

  // Check if previous chapter's quiz is passed
  if (chapterIndex > 0) {
    const prevChapterProgress = userEnrollment.chapterProgress.find(
      cp => cp.sequence === chapterIndex - 1
    );

    // Agar previous chapter exist karta hai
    if (prevChapterProgress) {
      // Check if any section in previous chapter has a failed quiz
      const failedQuizSection = prevChapterProgress.sectionProgress.find(sp => {
        return sp.quizProgress && sp.quizProgress.attempts > 0 && !sp.quizProgress.passed;
      });

      if (failedQuizSection) {
        // User failed a quiz in previous chapter, recommend short course
        return { 
          allowed: false, 
          message: 'Aap pichle chapter ke quiz mein fail ho gaye hain. Kripya short course complete karein aage badhne ke liye.',
          requiresShortCourse: true,
          failedQuiz: {
            chapterIndex: chapterIndex - 1,
            sectionIndex: failedQuizSection.sequence,
            quizId: failedQuizSection.quizProgress.quizId
          }
        };
      }

      // Check if previous chapter is completed
      if (!prevChapterProgress.completed) {
        return { 
          allowed: false, 
          message: 'Kripya pehle previous chapter complete karein',
          previousContent: {
            chapterIndex: chapterIndex - 1,
            sectionIndex: 0,
            contentIndex: 0
          }
        };
      }
    } else {
      return { 
        allowed: false, 
        message: 'Kripya pehle previous chapter complete karein',
        previousContent: {
          chapterIndex: chapterIndex - 1,
          sectionIndex: 0,
          contentIndex: 0
        }
      };
    }
  }

  // If it's the first content of a section (not the first section)
  if (contentIndex === 0 && sectionIndex > 0) {
    // Check if previous section is completed and its quiz is passed
    if (chapterProgress) {
      const prevSectionProgress = chapterProgress.sectionProgress.find(
        sp => sp.sequence === sectionIndex - 1
      );

      if (prevSectionProgress) {
        // Check if previous section has a quiz and if it's passed
        if (prevSectionProgress.quizProgress && 
            prevSectionProgress.quizProgress.attempts > 0 && 
            !prevSectionProgress.quizProgress.passed) {
          // User failed the quiz in previous section
          return { 
            allowed: false, 
            message: 'Aap pichle section ke quiz mein fail ho gaye hain. Kripya short course complete karein aage badhne ke liye.',
            requiresShortCourse: true,
            failedQuiz: {
              chapterIndex: chapterIndex,
              sectionIndex: sectionIndex - 1,
              quizId: prevSectionProgress.quizProgress.quizId
            }
          };
        }

        // Check if previous section is completed
        if (!prevSectionProgress.completed) {
          return { 
            allowed: false, 
            message: 'Kripya pehle previous section complete karein',
            previousContent: {
              chapterIndex,
              sectionIndex: sectionIndex - 1,
              contentIndex: 0
            }
          };
        }
      } else {
        return { 
          allowed: false, 
          message: 'Kripya pehle previous section complete karein',
          previousContent: {
            chapterIndex,
            sectionIndex: sectionIndex - 1,
            contentIndex: 0
          }
        };
      }
    } else {
      return { 
        allowed: false, 
        message: 'Kripya pehle previous content complete karein',
        previousContent: {
          chapterIndex,
          sectionIndex: sectionIndex - 1,
          contentIndex: 0
        }
      };
    }
  }

  // If it's not the first content in a section
  if (contentIndex > 0) {
    // Check if previous content is completed
    if (chapterProgress) {
      const sectionProgress = chapterProgress.sectionProgress.find(
        sp => sp.sequence === sectionIndex
      );

      if (sectionProgress) {
        const prevContentProgress = sectionProgress.contentProgress.find(
          cp => cp.sequence === contentIndex - 1
        );

        if (!prevContentProgress || !prevContentProgress.completed) {
          return { 
            allowed: false, 
            message: 'Kripya pehle previous content complete karein',
            previousContent: {
              chapterIndex,
              sectionIndex,
              contentIndex: contentIndex - 1
            }
          };
        }
      } else {
        return { 
          allowed: false, 
          message: 'Kripya pehle previous content complete karein',
          previousContent: {
            chapterIndex,
            sectionIndex,
            contentIndex: contentIndex - 1
          }
        };
      }
    } else {
      return { 
        allowed: false, 
        message: 'Kripya pehle previous content complete karein',
        previousContent: {
          chapterIndex,
          sectionIndex,
          contentIndex: contentIndex - 1
        }
      };
    }
  }

  return { allowed: true };
}




function updateOverallProgress(course, enrollmentIndex) {
  const userEnrollment = course.enrolledUsers[enrollmentIndex];
  
  // Count total chapters, sections, and content items
  let totalChapters = course.chapters.length;
  let completedChapters = 0;
  
  // Count completed chapters
  userEnrollment.chapterProgress.forEach(cp => {
    if (cp.completed) {
      completedChapters++;
    }
  });
  
  // Calculate overall progress as percentage
  const progress = totalChapters > 0 
    ? Math.round((completedChapters / totalChapters) * 100) 
    : 0;
  
  // Update user's progress
  course.enrolledUsers[enrollmentIndex].progress = progress;
  
  // Update current position
  if (userEnrollment.chapterProgress.length > 0) {
    // Find the last incomplete chapter
    const lastIncompleteChapter = userEnrollment.chapterProgress
      .filter(cp => !cp.completed)
      .sort((a, b) => a.sequence - b.sequence)[0];
    
    if (lastIncompleteChapter) {
      course.enrolledUsers[enrollmentIndex].currentChapter = lastIncompleteChapter.sequence;
      
      // Find the last incomplete section in this chapter
      const lastIncompleteSection = lastIncompleteChapter.sectionProgress
        .filter(sp => !sp.completed)
        .sort((a, b) => a.sequence - b.sequence)[0];
      
      if (lastIncompleteSection) {
        course.enrolledUsers[enrollmentIndex].currentSection = lastIncompleteSection.sequence;
        
        // Find the last incomplete content in this section
        const lastIncompleteContent = lastIncompleteSection.contentProgress
          .filter(cp => !cp.completed)
          .sort((a, b) => a.sequence - b.sequence)[0];
        
        if (lastIncompleteContent) {
          course.enrolledUsers[enrollmentIndex].currentContent = lastIncompleteContent.sequence;
        } else {
          course.enrolledUsers[enrollmentIndex].currentContent = 0;
        }
      } else {
        course.enrolledUsers[enrollmentIndex].currentSection = 0;
        course.enrolledUsers[enrollmentIndex].currentContent = 0;
      }
    } else {
      // All chapters completed
      course.enrolledUsers[enrollmentIndex].currentChapter
      course.chapters.length > 0 ? course.chapters.length - 1 : 0;
      
      const lastChapter = course.chapters[course.enrolledUsers[enrollmentIndex].currentChapter];
      course.enrolledUsers[enrollmentIndex].currentSection = 
        lastChapter && lastChapter.sections.length > 0 ? lastChapter.sections.length - 1 : 0;
      
      const lastSection = lastChapter && lastChapter.sections[course.enrolledUsers[enrollmentIndex].currentSection];
      course.enrolledUsers[enrollmentIndex].currentContent = 
        lastSection && lastSection.content.length > 0 ? lastSection.content.length - 1 : 0;
    }
  }
}



const getUserCourseProgress = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user._id; // Assuming user is authenticated

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Find user enrollment
    const userEnrollment = course.enrolledUsers.find(
      enrollment => enrollment.user.toString() === userId.toString()
    );

    if (!userEnrollment) {
      return res.status(403).json({ message: 'User not enrolled in this course' });
    }

    // Format progress data for response
    const progressData = {
      courseId: course._id,
      courseName: course.name,
      overallProgress: userEnrollment.progress,
      currentPosition: {
        chapterIndex: userEnrollment.currentChapter,
        sectionIndex: userEnrollment.currentSection,
        contentIndex: userEnrollment.currentContent
      },
      chapterProgress: []
    };

    // Add chapter progress details
    course.chapters.forEach((chapter, chIdx) => {
      const chapterProgress = userEnrollment.chapterProgress.find(
        cp => cp.sequence === chIdx
      );

      const chapterData = {
        chapterId: chapter._id,
        title: chapter.title,
        sequence: chIdx,
        completed: chapterProgress ? chapterProgress.completed : false,
        sections: []
      };

      // Add section progress details
      chapter.sections.forEach((section, secIdx) => {
        let sectionProgress = null;
        
        if (chapterProgress) {
          sectionProgress = chapterProgress.sectionProgress.find(
            sp => sp.sequence === secIdx
          );
        }

        const sectionData = {
          sectionId: section._id,
          title: section.title,
          sequence: secIdx,
          completed: sectionProgress ? sectionProgress.completed : false,
          content: []
        };

        // Add content progress details
        section.content.forEach((content, conIdx) => {
          let contentProgress = null;
          
          if (sectionProgress) {
            contentProgress = sectionProgress.contentProgress.find(
              cp => cp.sequence === conIdx
            );
          }

          sectionData.content.push({
            contentId: content._id,
            title: content.title,
            contentType: content.contentType,
            sequence: conIdx,
            completed: contentProgress ? contentProgress.completed : false,
            watchedDuration: contentProgress ? contentProgress.watchedDuration : 0,
            lastAccessedAt: contentProgress ? contentProgress.lastAccessedAt : null
          });
        });

        chapterData.sections.push(sectionData);
      });

      progressData.chapterProgress.push(chapterData);
    });

    res.status(200).json(progressData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



const getNextRecommendedContent = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user._id; // Assuming user is authenticated

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Find user enrollment
    const userEnrollment = course.enrolledUsers.find(
      enrollment => enrollment.user.toString() === userId.toString()
    );

    if (!userEnrollment) {
      return res.status(403).json({ message: 'User not enrolled in this course' });
    }

    // Get current position
    const currentChapter = userEnrollment.currentChapter;
    const currentSection = userEnrollment.currentSection;
    const currentContent = userEnrollment.currentContent;

    // Find next content to recommend
    let nextContent = findNextContent(
      course, 
      userEnrollment, 
      currentChapter, 
      currentSection, 
      currentContent
    );

    res.status(200).json(nextContent);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



function findNextContent(course, userEnrollment, chapterIndex, sectionIndex, contentIndex) {
  // Check if current chapter exists
  if (!course.chapters[chapterIndex]) {
    return {
      found: false,
      message: 'No chapters available'
    };
  }

  // Check if current section exists
  if (!course.chapters[chapterIndex].sections[sectionIndex]) {
    // Try first section of next chapter
    if (course.chapters[chapterIndex + 1]) {
      return {
        found: true,
        chapterIndex: chapterIndex + 1,
        sectionIndex: 0,
        contentIndex: 0,
        content: course.chapters[chapterIndex + 1].sections[0]?.content[0] || null,
        chapterTitle: course.chapters[chapterIndex + 1].title,
        sectionTitle: course.chapters[chapterIndex + 1].sections[0]?.title || '',
        contentTitle: course.chapters[chapterIndex + 1].sections[0]?.content[0]?.title || ''
      };
    } else {
      return {
        found: false,
        message: 'Course completed'
      };
    }
  }

  // Check if current content exists
  if (!course.chapters[chapterIndex].sections[sectionIndex].content[contentIndex]) {
    // Try first content of next section
    if (course.chapters[chapterIndex].sections[sectionIndex + 1]) {
      return {
        found: true,
        chapterIndex: chapterIndex,
        sectionIndex: sectionIndex + 1,
        contentIndex: 0,
        content: course.chapters[chapterIndex].sections[sectionIndex + 1].content[0] || null,
        chapterTitle: course.chapters[chapterIndex].title,
        sectionTitle: course.chapters[chapterIndex].sections[sectionIndex + 1].title,
        contentTitle: course.chapters[chapterIndex].sections[sectionIndex + 1].content[0]?.title || ''
      };
    } else {
      // Try first section of next chapter
      if (course.chapters[chapterIndex + 1]) {
        return {
          found: true,
          chapterIndex: chapterIndex + 1,
          sectionIndex: 0,
          contentIndex: 0,
          content: course.chapters[chapterIndex + 1].sections[0]?.content[0] || null,
          chapterTitle: course.chapters[chapterIndex + 1].title,
          sectionTitle: course.chapters[chapterIndex + 1].sections[0]?.title || '',
          contentTitle: course.chapters[chapterIndex + 1].sections[0]?.content[0]?.title || ''
        };
      } else {
        return {
          found: false,
          message: 'Course completed'
        };
      }
    }
  }

  // Check if there's next content in the same section
  if (course.chapters[chapterIndex].sections[sectionIndex].content[contentIndex + 1]) {
    return {
      found: true,
      chapterIndex: chapterIndex,
      sectionIndex: sectionIndex,
      contentIndex: contentIndex + 1,
      content: course.chapters[chapterIndex].sections[sectionIndex].content[contentIndex + 1],
      chapterTitle: course.chapters[chapterIndex].title,
      sectionTitle: course.chapters[chapterIndex].sections[sectionIndex].title,
      contentTitle: course.chapters[chapterIndex].sections[sectionIndex].content[contentIndex + 1].title
    };
  } 
  // Check if there's next section
  else if (course.chapters[chapterIndex].sections[sectionIndex + 1]) {
    return {
      found: true,
      chapterIndex: chapterIndex,
      sectionIndex: sectionIndex + 1,
      contentIndex: 0,
      content: course.chapters[chapterIndex].sections[sectionIndex + 1].content[0] || null,
      chapterTitle: course.chapters[chapterIndex].title,
      sectionTitle: course.chapters[chapterIndex].sections[sectionIndex + 1].title,
      contentTitle: course.chapters[chapterIndex].sections[sectionIndex + 1].content[0]?.title || ''
    };
  } 
  // Check if there's next chapter
  else if (course.chapters[chapterIndex + 1]) {
    return {
      found: true,
      chapterIndex: chapterIndex + 1,
      sectionIndex: 0,
      contentIndex: 0,
      content: course.chapters[chapterIndex + 1].sections[0]?.content[0] || null,
      chapterTitle: course.chapters[chapterIndex + 1].title,
      sectionTitle: course.chapters[chapterIndex + 1].sections[0]?.title || '',
      contentTitle: course.chapters[chapterIndex + 1].sections[0]?.content[0]?.title || ''
    };
  } 
  // No more content
  else {
    return {
      found: false,
      message: 'Course completed'
    };
  }
}



module.exports = {
    getNextRecommendedContent,
     getUserCourseProgress,
     updateContentProgress,
     checkContentAccess  
}


