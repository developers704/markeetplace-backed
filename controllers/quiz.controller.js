const Quiz = require("../models/quiz.model");
const Course = require("../models/course.model");
const mongoose = require("mongoose");

// Create a new quiz
const createQuiz = async (req, res) => {
  try {
    const {
      courseId,
      chapterId,
      sectionId,
      title,
      description,
      timeLimit,
      maxAttempts,
      weightage,
      enableSuffling,
      enableTimer,
      questionTimeLimit,
      questions,
      passingScore,
    } = req.body;

    // Validate course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Validate chapter and section exist in the course
    const chapter = course.chapters.id(chapterId);
    if (!chapter) {
      return res
        .status(404)
        .json({ message: "Chapter not found in this course" });
    }

    const section = chapter.sections.id(sectionId);
    if (!section) {
      return res
        .status(404)
        .json({ message: "Section not found in this chapter" });
    }

    // Create the quiz
    const quiz = new Quiz({
      courseId,
      chapterId,
      sectionId,
      title,
      description,
      timeLimit,
      maxAttempts,
      weightage,
      enableSuffling,
      enableTimer,
      questionTimeLimit,
      questions,
      passingScore,
    });

    const savedQuiz = await quiz.save();

    // Update the course to reference this quiz
    section.quiz = savedQuiz._id;
    await course.save();

    res.status(201).json(savedQuiz);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get all quizzes for a course
const getAllQuizzes = async (req, res) => {
  try {
    const quizzes = await Quiz.find().populate("courseId", "name");
    res.status(200).json(quizzes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// get quiz by course id
const getQuizzesByCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const quizzes = await Quiz.find({ courseId });
    res.status(200).json(quizzes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// get quiz by id:
// const getQuizById = async (req, res) => {
//   try {
//     const { quizId } = req.params;

//     console.log('=== GET QUIZ BY ID ===');
//     console.log('Received quizId:', quizId);

//     // Validate ObjectId format
//     if (!mongoose.Types.ObjectId.isValid(quizId)) {
//       console.log('Invalid ObjectId format');
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid quiz ID format',
//         receivedId: quizId
//       });
//     }

//     // Find quiz with populated course details
//     const quiz = await Quiz.findById(quizId)
//       .populate('courseId', 'name description chapters')
//       .lean();

//     console.log('Database query result:', quiz ? 'Found' : 'Not found');

//     if (!quiz) {
//       console.log('Quiz not found in database');
//       return res.status(404).json({
//         success: false,
//         message: 'Quiz not found',
//         searchedId: quizId
//       });
//     }

//     // Extract chapter and section details from populated course
//     let chapterDetails = null;
//     let sectionDetails = null;

//     if (quiz.courseId && quiz.courseId.chapters) {
//       // Find the specific chapter
//       chapterDetails = quiz.courseId.chapters.find(
//         chapter => chapter._id.toString() === quiz.chapterId.toString()
//       );

//       // Find the specific section within that chapter
//       if (chapterDetails && chapterDetails.sections) {
//         sectionDetails = chapterDetails.sections.find(
//           section => section._id.toString() === quiz.sectionId.toString()
//         );
//       }
//     }

//     // Prepare enhanced response
//     const enhancedQuiz = {
//       ...quiz,
//       courseDetails: {
//         courseId: quiz.courseId._id,
//         courseName: quiz.courseId.name,
//         courseDescription: quiz.courseId.description
//       },
//       chapterDetails: chapterDetails ? {
//         chapterId: chapterDetails._id,
//         chapterTitle: chapterDetails.title,
//         chapterDescription: chapterDetails.description,
//         chapterSequence: chapterDetails.sequence
//       } : null,
//       sectionDetails: sectionDetails ? {
//         sectionId: sectionDetails._id,
//         sectionTitle: sectionDetails.title,
//         sectionSequence: sectionDetails.sequence,
//         sectionIntroduction: sectionDetails.introduction,
//         sectionObjective: sectionDetails.objective
//       } : null
//     };

//     // Remove the full course object to keep response clean
//     delete enhancedQuiz.courseId;

//     console.log('Quiz found successfully with chapter and section details');

//     res.status(200).json({
//       success: true,
//       message: 'Quiz retrieved successfully with full details',
//       data: enhancedQuiz
//     });

//   } catch (error) {
//     console.error('Error in getQuizById:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error while fetching quiz',
//       error: error.message,
//       stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
//     });
//   }
// };

const getQuizById = async (req, res) => {
  try {
    const { quizId } = req.params;

    console.log("=== GET QUIZ BY ID ===");
    console.log("Received quizId:", quizId);

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      console.log("Invalid ObjectId format");
      return res.status(400).json({
        success: false,
        message: "Invalid quiz ID format",
        receivedId: quizId,
      });
    }

    // Find quiz with populated course details
    const quiz = await Quiz.findById(quizId)
      .select("-attempts") // Exclude attempts array
      .populate("courseId", "name description chapters")
      .lean();

    console.log("Database query result:", quiz ? "Found" : "Not found");

    if (!quiz) {
      console.log("Quiz not found in database");
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
        searchedId: quizId,
      });
    }

    // Extract chapter and section details from populated course
    let chapterDetails = null;
    let sectionDetails = null;

    if (quiz.courseId && quiz.courseId.chapters) {
      // Find the specific chapter
      chapterDetails = quiz.courseId.chapters.find(
        (chapter) => chapter._id.toString() === quiz.chapterId.toString()
      );

      // Find the specific section within that chapter
      if (chapterDetails && chapterDetails.sections) {
        sectionDetails = chapterDetails.sections.find(
          (section) => section._id.toString() === quiz.sectionId.toString()
        );
      }
    }

    // Prepare clean formatted response
    const formattedQuiz = {
      // Quiz basic info
      quizId: quiz._id,
      title: quiz.title,
      description: quiz.description,
      timeLimit: quiz.timeLimit,
      maxAttempts: quiz.maxAttempts,
      weightage: quiz.weightage,
      enableSuffling: quiz.enableSuffling,
      enableTimer: quiz.enableTimer,
      questionTimeLimit: quiz.questionTimeLimit,
      passingScore: quiz.passingScore,
      totalQuestions: quiz.questions.length,
      isActive: quiz.isActive,

      // Course details
      course: {
        courseId: quiz.courseId._id,
        courseName: quiz.courseId.name,
        courseDescription: quiz.courseId.description,
      },

      // Chapter details
      chapter: chapterDetails
        ? {
          chapterId: chapterDetails._id,
          chapterTitle: chapterDetails.title,
          chapterDescription: chapterDetails.description || "",
          chapterSequence: chapterDetails.sequence,
        }
        : {
          chapterId: quiz.chapterId,
          chapterTitle: "Chapter not found",
          chapterDescription: "",
          chapterSequence: null,
        },

      // Section details
      section: sectionDetails
        ? {
          sectionId: sectionDetails._id,
          sectionTitle: sectionDetails.title,
          sectionSequence: sectionDetails.sequence,
          sectionIntroduction: sectionDetails.introduction || "",
          sectionObjective: sectionDetails.objective || "",
        }
        : {
          sectionId: quiz.sectionId,
          sectionTitle: "Section not found",
          sectionSequence: null,
          sectionIntroduction: "",
          sectionObjective: "",
        },

      // Quiz questions (without correct answers for security)
      questions: quiz.questions.map((question, index) => ({
        questionNumber: index + 1,
        question: question.question,
        options: question.options,
        points: question.points,
        // correctAnswer excluded for security
      })),

      // Timestamps
      createdAt: quiz.createdAt,
      updatedAt: quiz.updatedAt,
    };

    console.log("Quiz found successfully with formatted data");

    res.status(200).json({
      success: true,
      message: "Quiz retrieved successfully",
      data: formattedQuiz,
    });
  } catch (error) {
    console.error("Error in getQuizById:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching quiz",
      error: error.message,
    });
  }
};

// get quiz by chapter id
const getQuizByChapter = async (req, res) => {
  try {
    const { chapterId } = req.params;
    const quiz = await Quiz.find({ chapterId });

    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }
    res.status(200).json(quiz);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// get quiz by section id
const getQuizBySection = async (req, res) => {
  try {
    const { sectionId } = req.params;
    const quiz = await Quiz.find({ sectionId });
    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }
    res.status(200).json(quiz);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// const updateQuiz = async (req, res) => {
//   try {
//     const { quizId } = req.params;
//     const updates = req.body;

//     const quiz = await Quiz.findById(quizId);
//     if (!quiz) {
//       return res.status(404).json({ message: 'Quiz not found' });
//     }

//     // Don't allow updating attempts directly
//     if (updates.attempts) {
//       delete updates.attempts;
//     }

//     const updatedQuiz = await Quiz.findByIdAndUpdate(
//       quizId,
//       updates,
//       { new: true, runValidators: true }
//     );

//     res.status(200).json(updatedQuiz);
//   } catch (error) {
//     res.status(400).json({ message: error.message });
//   }
// };

const updateQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    const updateData = req.body;

    console.log("Updating quiz:", quizId, "with data:", updateData);

    // Validate quiz ID
    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid quiz ID",
      });
    }

    // Find existing quiz
    const existingQuiz = await Quiz.findById(quizId);
    if (!existingQuiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    // Prepare update object - only include provided fields
    const updateFields = {};

    // Basic fields
    if (updateData.title !== undefined) updateFields.title = updateData.title;
    if (updateData.description !== undefined)
      updateFields.description = updateData.description;
    if (updateData.timeLimit !== undefined)
      updateFields.timeLimit = parseInt(updateData.timeLimit);
    if (updateData.maxAttempts !== undefined)
      updateFields.maxAttempts = parseInt(updateData.maxAttempts);
    if (updateData.weightage !== undefined)
      updateFields.weightage = parseInt(updateData.weightage);
    if (updateData.passingScore !== undefined)
      updateFields.passingScore = parseInt(updateData.passingScore);
    if (updateData.isActive !== undefined)
      updateFields.isActive = updateData.isActive;

    // New fields from model
    if (updateData.enableSuffling !== undefined)
      updateFields.enableSuffling = updateData.enableSuffling;
    if (updateData.enableTimer !== undefined)
      updateFields.enableTimer = updateData.enableTimer;
    if (updateData.questionTimeLimit !== undefined)
      updateFields.questionTimeLimit = parseInt(updateData.questionTimeLimit);

    // Questions array - complete replacement or individual question updates
    if (updateData.questions !== undefined) {
      if (Array.isArray(updateData.questions)) {
        // Validate questions
        for (let i = 0; i < updateData.questions.length; i++) {
          const question = updateData.questions[i];
          if (
            !question.question ||
            !question.options ||
            !Array.isArray(question.options) ||
            question.correctAnswer === undefined ||
            !question.points
          ) {
            return res.status(400).json({
              success: false,
              message: `Question ${i + 1} is missing required fields`,
            });
          }
        }
        updateFields.questions = updateData.questions;
      }
    }

    // Validate required fields if provided
    if (updateFields.title && updateFields.title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Title cannot be empty",
      });
    }

    if (updateFields.timeLimit && updateFields.timeLimit <= 0) {
      return res.status(400).json({
        success: false,
        message: "Time limit must be greater than 0",
      });
    }

    if (updateFields.maxAttempts && updateFields.maxAttempts <= 0) {
      return res.status(400).json({
        success: false,
        message: "Max attempts must be greater than 0",
      });
    }

    if (
      updateFields.passingScore &&
      (updateFields.passingScore < 0 || updateFields.passingScore > 100)
    ) {
      return res.status(400).json({
        success: false,
        message: "Passing score must be between 0 and 100",
      });
    }

    // Update quiz
    const updatedQuiz = await Quiz.findByIdAndUpdate(
      quizId,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).populate("courseId", "name");

    if (!updatedQuiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found after update",
      });
    }

    console.log("Quiz updated successfully:", updatedQuiz._id);

    res.status(200).json({
      success: true,
      message: "Quiz updated successfully",
      data: {
        quiz: {
          _id: updatedQuiz._id,
          title: updatedQuiz.title,
          description: updatedQuiz.description,
          timeLimit: updatedQuiz.timeLimit,
          maxAttempts: updatedQuiz.maxAttempts,
          weightage: updatedQuiz.weightage,
          passingScore: updatedQuiz.passingScore,
          enableSuffling: updatedQuiz.enableSuffling,
          enableTimer: updatedQuiz.enableTimer,
          questionTimeLimit: updatedQuiz.questionTimeLimit,
          totalQuestions: updatedQuiz.questions.length,
          course: updatedQuiz.courseId,
          isActive: updatedQuiz.isActive,
          updatedAt: updatedQuiz.updatedAt,
        },
        updatedFields: Object.keys(updateFields),
      },
    });
  } catch (error) {
    console.error("Error updating quiz:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update quiz",
      error: error.message,
    });
  }
};

// const deleteQuiz = async (req, res) => {
//   try {
//     const { quizId } = req.params;

//     const quiz = await Quiz.findById(quizId);
//     if (!quiz) {
//       return res.status(404).json({ message: 'Quiz not found' });
//     }

//     // Remove quiz reference from course
//     await Course.findOneAndUpdate(
//       { 'chapters.sections.quiz': quizId },
//       { $unset: { 'chapters.$[].sections.$[section].quiz': '' } },
//       { arrayFilters: [{ 'section.quiz': quizId }] }
//     );

//     await Quiz.findByIdAndDelete(quizId);
//     res.status(200).json({ message: 'Quiz deleted successfully' });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };

// check krna ha

const bulkDeleteQuizzes = async (req, res) => {
  try {
    const { quizIds } = req.body;

    console.log("Bulk deleting quizzes:", quizIds);

    // Validate input
    if (!quizIds || !Array.isArray(quizIds) || quizIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Quiz IDs array is required and cannot be empty",
      });
    }

    // Validate all quiz IDs
    const invalidIds = quizIds.filter(
      (id) => !mongoose.Types.ObjectId.isValid(id)
    );
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid quiz IDs found",
        invalidIds: invalidIds,
      });
    }

    // Find all quizzes to be deleted
    const quizzesToDelete = await Quiz.find({
      _id: { $in: quizIds },
    }).select("_id title courseId chapterId sectionId");

    if (quizzesToDelete.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No quizzes found with provided IDs",
      });
    }

    console.log(`Found ${quizzesToDelete.length} quizzes to delete`);

    const deletionResults = {
      successful: [],
      failed: [],
      coursesUpdated: [],
    };

    // Process each quiz deletion
    for (const quiz of quizzesToDelete) {
      try {
        console.log(`Deleting quiz: ${quiz._id} - ${quiz.title}`);

        // Remove quiz reference from course
        const courseUpdateResult = await Course.findOneAndUpdate(
          { "chapters.sections.quiz": quiz._id },
          { $unset: { "chapters.$[].sections.$[section].quiz": "" } },
          {
            arrayFilters: [{ "section.quiz": quiz._id }],
            new: true,
          }
        );

        if (courseUpdateResult) {
          console.log(
            `Removed quiz reference from course: ${courseUpdateResult._id}`
          );
          if (
            !deletionResults.coursesUpdated.includes(
              courseUpdateResult._id.toString()
            )
          ) {
            deletionResults.coursesUpdated.push(
              courseUpdateResult._id.toString()
            );
          }
        }

        // Delete the quiz
        await Quiz.findByIdAndDelete(quiz._id);

        deletionResults.successful.push({
          _id: quiz._id,
          title: quiz.title,
          courseId: quiz.courseId,
          message: "Quiz deleted successfully",
        });

        console.log(`Successfully deleted quiz: ${quiz._id}`);
      } catch (error) {
        console.error(`Error deleting quiz ${quiz._id}:`, error);
        deletionResults.failed.push({
          _id: quiz._id,
          title: quiz.title,
          error: error.message,
        });
      }
    }

    // Prepare response
    const totalRequested = quizIds.length;
    const totalFound = quizzesToDelete.length;
    const totalDeleted = deletionResults.successful.length;
    const totalFailed = deletionResults.failed.length;

    const responseMessage =
      totalFailed === 0
        ? `Successfully deleted ${totalDeleted} quiz(es)`
        : `Deleted ${totalDeleted} quiz(es), ${totalFailed} failed`;

    const responseStatus = totalFailed === 0 ? 200 : 207; // 207 = Multi-Status

    res.status(responseStatus).json({
      success: totalFailed === 0,
      message: responseMessage,
      data: {
        summary: {
          totalRequested: totalRequested,
          totalFound: totalFound,
          totalDeleted: totalDeleted,
          totalFailed: totalFailed,
          coursesUpdated: deletionResults.coursesUpdated.length,
        },
        results: {
          successful: deletionResults.successful,
          failed: deletionResults.failed,
          coursesUpdated: deletionResults.coursesUpdated,
        },
      },
    });
  } catch (error) {
    console.error("Error in bulk delete quizzes:", error);
    res.status(500).json({
      success: false,
      message: "Failed to perform bulk delete operation",
      error: error.message,
    });
  }
};

const getQuizDetails = async (req, res) => {
  try {
    const { quizId } = req.params;
    const userId = req.user.id;

    const quiz = await Quiz.findById(quizId);

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    // Get user's previous attempts
    const userAttempts = quiz.attempts.filter(
      (attempt) => attempt.userId.toString() === userId.toString()
    );

    // Check if user has reached maximum attempts
    const attemptsRemaining = quiz.maxAttempts - userAttempts.length;
    const canAttempt = attemptsRemaining > 0;

    // Get best score from previous attempts
    let bestScore = 0;
    let bestGrade = null;
    let hasPassed = false;

    if (userAttempts.length > 0) {
      bestScore = Math.max(...userAttempts.map((a) => a.percentage || 0));
      const bestAttempt = userAttempts.reduce((best, current) => {
        return current.percentage > (best?.percentage || 0) ? current : best;
      }, null);

      if (bestAttempt) {
        bestGrade = bestAttempt.grade;
        hasPassed = bestAttempt.passed;
      }
    }

    // Return quiz details without correct answers
    const quizDetails = {
      _id: quiz._id,
      title: quiz.title,
      description: quiz.description,
      timeLimit: quiz.timeLimit,
      maxAttempts: quiz.maxAttempts,
      passingScore: quiz.passingScore,
      totalQuestions: quiz.questions.length,
      totalPoints: quiz.questions.reduce((sum, q) => sum + q.points, 0),
      attemptsUsed: userAttempts.length,
      attemptsRemaining: attemptsRemaining,
      canAttempt: canAttempt,
      bestScore: bestScore,
      bestGrade: bestGrade,
      hasPassed: hasPassed,
    };

    res.status(200).json({
      success: true,
      data: quizDetails,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch quiz details",
      error: error.message,
    });
  }
};

// check krna ha
// start quiz:
const startQuizAttempt = async (req, res) => {
  try {
    const { quizId } = req.params;
    const userId = req.user.id;

    const quiz = await Quiz.findById(quizId);

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    // Check if user has reached maximum attempts
    const userAttempts = quiz.attempts.filter(
      (attempt) => attempt.userId.toString() === userId.toString()
    );

    if (userAttempts.length >= quiz.maxAttempts) {
      return res.status(400).json({
        success: false,
        message: `Maximum attempts (${quiz.maxAttempts}) reached for this quiz`,
        attemptsUsed: userAttempts.length,
        maxAttempts: quiz.maxAttempts,
      });
    }

    // Create a new attempt
    const newAttempt = {
      userId: userId,
      startTime: Date.now(),
      answers: [],
    };

    quiz.attempts.push(newAttempt);
    await quiz.save();

    // Return quiz questions without correct answers
    const questionsWithoutAnswers = quiz.questions.map((q) => ({
      _id: q._id,
      question: q.question,
      options: q.options,
      points: q.points,
    }));

    res.status(200).json({
      success: true,
      message: "Quiz attempt started",
      data: {
        quizId: quiz._id,
        title: quiz.title,
        description: quiz.description,
        timeLimit: quiz.timeLimit,
        questions: questionsWithoutAnswers,
        attemptNumber: userAttempts.length + 1,
        maxAttempts: quiz.maxAttempts,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to start quiz attempt",
      error: error.message,
    });
  }
};

// next navigation check krna ha
const checkContentNavigation = async (req, res) => {
  try {
    const { courseId, chapterIndex, sectionIndex, contentIndex } = req.params;
    const userId = req.user.id;

    const course = await Course.findById(courseId);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Find user's enrollment
    const enrollment = course.enrolledUsers.find(
      (enrollment) => enrollment.user.toString() === userId
    );

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: "User not enrolled in this course",
      });
    }

    // Get current position
    const currentChapterIndex = enrollment.currentChapter;
    const currentSectionIndex = enrollment.currentSection;
    const currentContentIndex = enrollment.currentContent;

    // If trying to access future content
    if (
      parseInt(chapterIndex) > currentChapterIndex ||
      (parseInt(chapterIndex) === currentChapterIndex &&
        parseInt(sectionIndex) > currentSectionIndex) ||
      (parseInt(chapterIndex) === currentChapterIndex &&
        parseInt(sectionIndex) === currentSectionIndex &&
        parseInt(contentIndex) > currentContentIndex)
    ) {
      // Check if previous content is completed
      const chapter = course.chapters[currentChapterIndex];
      const section = chapter.sections[currentSectionIndex];

      // Get chapter progress
      const chapterProgressIndex = enrollment.chapterProgress.findIndex(
        (cp) => cp.sequence === chapter.sequence
      );

      const sectionProgressIndex = enrollment.chapterProgress[
        chapterProgressIndex
      ].sectionProgress.findIndex((sp) => sp.sequence === section.sequence);

      // Check if current content is completed
      const currentContentProgress =
        enrollment.chapterProgress[chapterProgressIndex].sectionProgress[
          sectionProgressIndex
        ].contentProgress[currentContentIndex];

      if (!currentContentProgress.completed) {
        return res.status(403).json({
          success: false,
          canNavigate: false,
          message: "Please complete the current content before moving forward",
        });
      }

      // If trying to move to next section
      if (
        parseInt(sectionIndex) > currentSectionIndex ||
        parseInt(chapterIndex) > currentChapterIndex
      ) {
        // Check if all content in current section is completed
        const allContentCompleted = enrollment.chapterProgress[
          chapterProgressIndex
        ].sectionProgress[sectionProgressIndex].contentProgress.every(
          (cp) => cp.completed
        );

        if (!allContentCompleted) {
          return res.status(403).json({
            success: false,
            canNavigate: false,
            message: "Please complete all content in the current section",
          });
        }

        // Check if section has quiz and if it's passed
        if (section.quiz) {
          const quizProgress =
            enrollment.chapterProgress[chapterProgressIndex].sectionProgress[
              sectionProgressIndex
            ].quizProgress;

          if (!quizProgress || !quizProgress.passed) {
            return res.status(403).json({
              success: false,
              canNavigate: false,
              message: "Please complete and pass the quiz for this section",
              quizId: section.quiz,
            });
          }
        }
      }

      // If trying to move to next chapter
      if (parseInt(chapterIndex) > currentChapterIndex) {
        // Check if all sections in current chapter are completed
        const allSectionsCompleted = enrollment.chapterProgress[
          chapterProgressIndex
        ].sectionProgress.every((sp) => sp.completed);

        if (!allSectionsCompleted) {
          return res.status(403).json({
            success: false,
            canNavigate: false,
            message: "Please complete all sections in the current chapter",
          });
        }
      }
    }

    // If all checks pass, allow navigation
    res.status(200).json({
      success: true,
      canNavigate: true,
      message: "Navigation allowed",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to check navigation",
      error: error.message,
    });
  }
};

// checking
const updateCurrentPosition = async (req, res) => {
  try {
    const { courseId, chapterIndex, sectionIndex, contentIndex } = req.params;
    const userId = req.user.id;

    const course = await Course.findById(courseId);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Find user's enrollment
    const enrollmentIndex = course.enrolledUsers.findIndex(
      (enrollment) => enrollment.user.toString() === userId
    );

    if (enrollmentIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "User not enrolled in this course",
      });
    }

    // Update current position
    course.enrolledUsers[enrollmentIndex].currentChapter =
      parseInt(chapterIndex);
    course.enrolledUsers[enrollmentIndex].currentSection =
      parseInt(sectionIndex);
    course.enrolledUsers[enrollmentIndex].currentContent =
      parseInt(contentIndex);

    await course.save();

    res.status(200).json({
      success: true,
      message: "Current position updated successfully",
      data: {
        currentChapter: parseInt(chapterIndex),
        currentSection: parseInt(sectionIndex),
        currentContent: parseInt(contentIndex),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update current position",
      error: error.message,
    });
  }
};

// sbmitting quiz;
// const submitQuizAttempt = async (req, res) => {
//   try {
//     const { quizId } = req.params;
//     const userId = req.user._id; // Assuming user is authenticated
//     const { answers, startTime, endTime } = req.body;

//     const quiz = await Quiz.findById(quizId);
//     if (!quiz) {
//       return res.status(404).json({ message: 'Quiz not found' });
//     }

//     // Check if user has exceeded max attempts
//     const userAttempts = quiz.attempts.filter(attempt =>
//       attempt.userId.toString() === userId.toString()
//     );

//     if (userAttempts.length >= quiz.maxAttempts) {
//       return res.status(400).json({
//         message: `Maximum attempts (${quiz.maxAttempts}) reached for this quiz`
//       });
//     }

//     // Calculate score
//     let totalPoints = 0;
//     let earnedPoints = 0;
//     const processedAnswers = [];

//     answers.forEach(answer => {
//       const question = quiz.questions[answer.questionIndex];
//       if (!question) return;

//       const isCorrect = answer.selectedAnswer === question.correctAnswer;
//       const pointsEarned = isCorrect ? question.points : 0;

//       totalPoints += question.points;
//       earnedPoints += pointsEarned;

//       processedAnswers.push({
//         questionIndex: answer.questionIndex,
//         selectedAnswer: answer.selectedAnswer,
//         isCorrect,
//         pointsEarned
//       });
//     });

//     const score = earnedPoints;
//     const percentage = (earnedPoints / totalPoints) * 100;
//     const passed = percentage >= quiz.passingScore;

//     // Determine grade
//     let grade;
//     if (percentage >= 90) grade = 'A';
//     else if (percentage >= 80) grade = 'B';
//     else if (percentage >= 70) grade = 'C';
//     else if (percentage >= 60) grade = 'D';
//     else grade = 'F';

//     // Create attempt object
//     const attempt = {
//       userId,
//       quizId: quizId, // Add the quiz ID here
//       startTime,
//       endTime,
//       score,
//       percentage,
//       grade,
//       passed,
//       attemptDate: new Date(),
//       answers: processedAnswers
//     };

//     // Add attempt to quiz
//     quiz.attempts.push(attempt);
//     await quiz.save();

//     // Update user progress in course
//     await updateUserProgress(userId, quiz.courseId, quiz.chapterId, quiz.sectionId, attempt);

//     res.status(200).json({
//       message: 'Quiz submitted successfully',
//       result: {
//         score,
//         percentage,
//         grade,
//         passed
//       }
//     });
//   } catch (error) {
//     console.error('Error submitting quiz:', error);
//     res.status(400).json({ message: error.message });
//   }
// };

// const submitQuizAttempt = async (req, res) => {
//  try {
//     const { quizId } = req.params;
//     const userId = req.user._id; // Assuming user is authenticated
//     const { answers, startTime, endTime } = req.body;

//     console.log("Quiz submission received:", { quizId, userId });

//     const quiz = await Quiz.findById(quizId);
//     if (!quiz) {
//       return res.status(404).json({ message: 'Quiz not found' });
//     }

//     // Check if user has exceeded max attempts
//     const userAttempts = quiz.attempts.filter(attempt =>
//       attempt.userId.toString() === userId.toString()
//     );

//     if (userAttempts.length >= quiz.maxAttempts) {
//       return res.status(400).json({
//         message: `Maximum attempts (${quiz.maxAttempts}) reached for this quiz`
//       });
//     }

//     // Calculate score
//     let totalPoints = 0;
//     let earnedPoints = 0;
//     const processedAnswers = [];

//     answers.forEach(answer => {
//       const question = quiz.questions[answer.questionIndex];
//       if (!question) return;

//       const isCorrect = answer.selectedAnswer === question.correctAnswer;
//       const pointsEarned = isCorrect ? question.points : 0;

//       totalPoints += question.points;
//       earnedPoints += pointsEarned;

//       processedAnswers.push({
//         questionIndex: answer.questionIndex,
//         selectedAnswer: answer.selectedAnswer,
//         isCorrect,
//         pointsEarned
//       });
//     });

//     const score = earnedPoints;
//     const percentage = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
//     const passed = percentage >= quiz.passingScore;

//     // Determine grade
//     let grade;
//     if (percentage >= 90) grade = 'A';
//     else if (percentage >= 80) grade = 'B';
//     else if (percentage >= 70) grade = 'C';
//     else if (percentage >= 60) grade = 'D';
//     else grade = 'F';

//     // Create attempt object
//     const attempt = {
//       userId,
//       quizId: quizId,
//       startTime,
//       endTime,
//       score,
//       percentage,
//       grade,
//       passed,
//       attemptDate: new Date(),
//       answers: processedAnswers
//     };

//     console.log("Quiz attempt created:", {
//       score,
//       percentage,
//       grade,
//       passed
//     });

//     // Add attempt to quiz
//     quiz.attempts.push(attempt);
//     await quiz.save();

//     // Update user progress in course
//     const progressUpdate = await updateUserProgress(userId, quiz.courseId, quiz.chapterId, quiz.sectionId, attempt);

//     // Prepare response message based on quiz result
//     let message = '';
//     if (passed) {
//       message = 'Congratulations! You have passed the quiz.';
//     } else {
//       // If user has attempts remaining
//       if (userAttempts.length + 1 < quiz.maxAttempts) {
//         message = `You did not pass the quiz. You have ${quiz.maxAttempts - userAttempts.length - 1} attempts remaining.`;
//       } else {
//         message = 'You did not pass the quiz. This was your last attempt.';
//       }
//     }

//     // Check if this quiz failure affects overall course passing
//     let coursePassingWarning = '';
//     if (!passed && progressUpdate.completed && !progressUpdate.passed) {
//       coursePassingWarning = 'Warning: Your current overall grade is below the passing threshold for this course.';
//     }

//     res.status(200).json({
//       message: 'Quiz submitted successfully',
//       result: {
//         score,
//         percentage,
//         grade,
//         passed,
//         message,
//         coursePassingWarning
//       },
//       courseProgress: progressUpdate
//     });
//   } catch (error) {
//     console.error('Error submitting quiz:', error);
//     res.status(400).json({ message: error.message });
//   }
// };

const submitQuizAttempt = async (req, res) => {
  try {
    const { quizId } = req.params;
    const userId = req.user._id; // Assuming user is authenticated
    const { answers, startTime, endTime } = req.body;

    console.log("Quiz submission received:", { quizId, userId });

    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    // Check if user has exceeded max attempts
    const userAttempts = quiz.attempts.filter(
      (attempt) => attempt.userId.toString() === userId.toString()
    );

    if (userAttempts.length >= quiz.maxAttempts) {
      return res.status(400).json({
        message: `Maximum attempts (${quiz.maxAttempts}) reached for this quiz`,
      });
    }

    // if (userAttempts.length + 1 < quiz.maxAttempts) {
    //   message = `You did not pass the quiz. You have ${quiz.maxAttempts - userAttempts.length - 1} attempts remaining.`;
    // } else {
    //   message = 'You did not pass the quiz. This was your last attempt.';
    // }

    // Calculate score
    let totalPoints = 0;
    let earnedPoints = 0;
    const processedAnswers = [];

    quiz.questions.forEach((question) => {
      totalPoints += question.points;
    });

    // answers.forEach(answer => {
    //   const question = quiz.questions[answer.questionIndex];
    //   if (!question) return;

    //   const isCorrect = answer.selectedAnswer === question.correctAnswer;
    //   const pointsEarned = isCorrect ? question.points : 0;

    //   totalPoints += question.points;
    //   earnedPoints += pointsEarned;

    //   processedAnswers.push({
    //     questionIndex: answer.questionIndex,
    //     selectedAnswer: answer.selectedAnswer,
    //     isCorrect,
    //     pointsEarned
    //   });
    // });

    answers.forEach((answer) => {
      const question = quiz.questions[answer.questionIndex];
      if (!question) return;

      // Check if answer is provided and correct
      const isCorrect =
        answer.selectedAnswer !== null &&
        answer.selectedAnswer !== undefined &&
        answer.selectedAnswer === question.correctAnswer;
      const pointsEarned = isCorrect ? question.points : 0;

      earnedPoints += pointsEarned;

      processedAnswers.push({
        questionIndex: answer.questionIndex,
        selectedAnswer: answer.selectedAnswer,
        isCorrect,
        pointsEarned,
      });
    });

    for (let i = 0; i < quiz.questions.length; i++) {
      const answered = answers.find((ans) => ans.questionIndex === i);
      if (!answered) {
        processedAnswers.push({
          questionIndex: i,
          selectedAnswer: null,
          isCorrect: false,
          pointsEarned: 0,
        });
      }
    }

    const score = earnedPoints;
    const percentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const passed = percentage >= quiz.passingScore;

    // Determine grade
    // let grade;
    // if (percentage >= 90) grade = "A";
    // else if (percentage >= 80) grade = "B";
    // else if (percentage >= 70) grade = "C";
    // // else if (percentage >= 60) grade = "D";
    // // else grade = "F";

    let grade = "F"; // Default grade
    if (percentage >= 90) {
      grade = "A";
    } else if (percentage >= 80) {
      grade = "B";
    } else if (percentage >= 70) {
      grade = "C";
    } else {
      grade = "F"; // Explicitly set F for anything below 70
    }

    console.log("Grade calculation:", {
    percentage,
    passingScore: quiz.passingScore,
    grade,
    passed
  });

    // Create attempt object
    const attempt = {
      userId,
      quizId: quizId,
      startTime,
      endTime,
      score,
      percentage,
      grade,
      passed,
      attemptDate: new Date(),
      answers: processedAnswers,
    };

    console.log("Quiz attempt created:", {
      score,
      percentage,
      grade,
      passed,
    });

    // Add attempt to quiz
    quiz.attempts.push(attempt);
    await quiz.save();

    // 🆕 UPDATE COURSE PROGRESS WITH QUIZ RESULT
    const quizResult = {
      passed: passed,
      percentage: percentage,
      score: score,
      grade: grade,
      attempts: userAttempts.length + 1,
    };

    // Call the updateQuizProgress function
    await updateQuizProgress(
      quiz.courseId,
      quiz.chapterId,
      quiz.sectionId,
      userId,
      quizResult
    );

    // 🆕 GET UPDATED COURSE STATUS AFTER QUIZ
    const updatedCourse = await Course.findById(quiz.courseId);
    const userEnrollment = updatedCourse.enrolledUsers.find(
      (enrollment) => enrollment.user.toString() === userId.toString()
    );

    // Prepare response message based on quiz result
    let message = "";
    let courseStatus = userEnrollment ? userEnrollment.status : "In Progress";

    if (passed) {
      message = "Congratulations! You have passed the quiz.";
    } else {
      // If user has attempts remaining
      if (userAttempts.length + 1 < quiz.maxAttempts) {
        message = `You did not pass the quiz. You have ${quiz.maxAttempts - userAttempts.length - 1
          } attempts remaining.`;
      } else {
        message = "You did not pass the quiz. This was your last attempt.";
        // Check if course status changed to Failed
        if (courseStatus === "Failed") {
          message +=
            " Your course status has been updated to Failed due to maximum quiz attempts reached.";
        }
      }
    }

    // 🆕 CHECK OVERALL COURSE COMPLETION
    let courseCompleted = false;
    let certificateInfo = null;

    if (
      userEnrollment &&
      (userEnrollment.status === "Completed" ||
        userEnrollment.status === "Failed")
    ) {
      courseCompleted = true;
      certificateInfo = {
        earned: userEnrollment.certificateEarned,
        url: userEnrollment.certificateUrl,
        finalGrade: userEnrollment.gradeLabel,
        finalPercentage: userEnrollment.gradePercentage,
      };
    }

    res.status(200).json({
      success: true,
      message: "Quiz submitted successfully",
      result: {
        score,
        percentage,
        grade,
        passed,
        message,
        courseStatus: courseStatus,
        courseCompleted: courseCompleted,
        certificateInfo: certificateInfo,
      },
      // 🆕 ADDITIONAL COURSE PROGRESS INFO
      courseProgress: userEnrollment
        ? {
          progress: userEnrollment.progress,
          currentChapter: userEnrollment.currentChapter,
          currentSection: userEnrollment.currentSection,
          status: userEnrollment.status,
          gradePercentage: userEnrollment.gradePercentage,
          gradeLabel: userEnrollment.gradeLabel,
        }
        : null,
    });
  } catch (error) {
    console.error("Error submitting quiz:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit quiz",
      error: error.message,
    });
  }
};

// 🆕 ADD THE HELPER FUNCTION IN SAME FILE
// const updateQuizProgress = async (courseId, chapterId, sectionId, userId, quizResult) => {
//   try {
//     const course = await Course.findById(courseId);
//     const enrollmentIndex = course.enrolledUsers.findIndex(
//       enrollment => enrollment.user.toString() === userId.toString()
//     );

//     if (enrollmentIndex !== -1) {
//       const chapterProgressIndex = course.enrolledUsers[enrollmentIndex].chapterProgress.findIndex(
//         cp => cp.chapterId.toString() === chapterId.toString()
//       );

//       if (chapterProgressIndex !== -1) {
//         const sectionProgressIndex = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//           .sectionProgress.findIndex(
//             sp => sp.sectionId.toString() === sectionId.toString()
//           );

//         if (sectionProgressIndex !== -1) {
//           // Update quiz progress
//           const quizProgress = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//             .sectionProgress[sectionProgressIndex].quizProgress;

//           if (quizProgress) {
//             quizProgress.attempts = quizResult.attempts;
//             quizProgress.bestScore = Math.max(quizProgress.bestScore || 0, quizResult.percentage);
//             quizProgress.passed = quizResult.passed;
//             quizProgress.lastAttemptDate = new Date();
//           }

//           if (course.enrolledUsers[enrollmentIndex].status === 'Not Started') {
//             course.enrolledUsers[enrollmentIndex].status = 'In Progress';
//           }

//           // 🆕 CHECK IF QUIZ FAILED AND UPDATE STATUS
//           if (!quizResult.passed && quizResult.attempts >= 3) {
//           course.enrolledUsers[enrollmentIndex].status = 'Failed';
//           course.enrolledUsers[enrollmentIndex].certificateRequestStatus = 'Not Eligible';
//           console.log(`User ${userId} course status updated to Failed due to quiz failure`);
//         }

//           // 🆕 CHECK IF ALL COURSE REQUIREMENTS ARE MET
//           // if (quizResult.passed) {
//           //   const courseCompleted = checkCourseCompletion(course, enrollmentIndex);

//           //   if (courseCompleted.allCompleted) {
//           //     const finalGrade = calculateFinalGrade(course, enrollmentIndex);

//           //     course.enrolledUsers[enrollmentIndex].gradePercentage = finalGrade.percentage;
//           //     course.enrolledUsers[enrollmentIndex].gradeLabel = finalGrade.label;
//           //     course.enrolledUsers[enrollmentIndex].allChaptersCompleted = true;
//           //     course.enrolledUsers[enrollmentIndex].allQuizzesPassed = courseCompleted.allQuizzesPassed;
//           //     course.enrolledUsers[enrollmentIndex].completionDate = new Date();

//           //     // Determine final status
//           //     if (finalGrade.percentage >= course.passingGrade && courseCompleted.allQuizzesPassed) {
//           //       course.enrolledUsers[enrollmentIndex].status = 'Completed';
//           //       course.enrolledUsers[enrollmentIndex].certificateEarned = true;
//           //       course.enrolledUsers[enrollmentIndex].certificateUrl = `/certificates/${courseId}/${userId}`;
//           //       console.log(`User ${userId} completed course successfully`);
//           //     } else {
//           //       course.enrolledUsers[enrollmentIndex].status = 'Failed';
//           //       course.enrolledUsers[enrollmentIndex].certificateEarned = false;
//           //       console.log(`User ${userId} failed course due to low overall grade`);
//           //     }
//           //   }
//           // }

//           if (quizResult.passed) {
//         const courseCompleted = checkCourseCompletion(course, enrollmentIndex);

//         if (courseCompleted.allCompleted) {
//           const finalGrade = calculateFinalGrade(course, enrollmentIndex);

//             course.enrolledUsers[enrollmentIndex].gradePercentage = finalGrade.percentage;
//             course.enrolledUsers[enrollmentIndex].gradeLabel = finalGrade.label;
//             course.enrolledUsers[enrollmentIndex].allChaptersCompleted = true;
//             course.enrolledUsers[enrollmentIndex].allQuizzesPassed = courseCompleted.allQuizzesPassed;
//             course.enrolledUsers[enrollmentIndex].completionDate = new Date();

//           course.enrolledUsers[enrollmentIndex].gradePercentage = finalGrade.percentage;
//           course.enrolledUsers[enrollmentIndex].gradeLabel = finalGrade.label;
//           course.enrolledUsers[enrollmentIndex].allChaptersCompleted = true;
//           course.enrolledUsers[enrollmentIndex].allQuizzesPassed = courseCompleted.allQuizzesPassed;
//           course.enrolledUsers[enrollmentIndex].completionDate = new Date();

//           // Determine final status
//           if (finalGrade.percentage >= course.passingGrade && courseCompleted.allQuizzesPassed) {
//             course.enrolledUsers[enrollmentIndex].status = 'Completed';
//             course.enrolledUsers[enrollmentIndex].certificateRequestStatus = 'Eligible';
//             course.enrolledUsers[enrollmentIndex].certificateEarned = true;
//             course.enrolledUsers[enrollmentIndex].certificateUrl = `/certificates/${courseId}/${userId}`;
//             console.log(`User ${userId} completed course successfully and is eligible for certificate`);
//           } else {
//             course.enrolledUsers[enrollmentIndex].status = 'Failed';
//             course.enrolledUsers[enrollmentIndex].certificateRequestStatus = 'Not Eligible';
//             course.enrolledUsers[enrollmentIndex].certificateEarned = false;
//             course.enrolledUsers[enrollmentIndex].certificateUrl = null;
//             console.log(`User ${userId} failed course due to low overall grade`);
//           }
//         }
// }

//           await course.save();
//         }
//       }
//     }
//   } catch (error) {
//     console.error('Error updating quiz progress:', error);
//     throw error;
//   }
// };

const updateQuizProgress = async (
  courseId,
  chapterId,
  sectionId,
  userId,
  quizResult
) => {
  try {
    const course = await Course.findById(courseId);
    const enrollmentIndex = course.enrolledUsers.findIndex(
      (enrollment) => enrollment.user.toString() === userId.toString()
    );

    const quiz = await Quiz.findOne({
      courseId: courseId,
      chapterId: chapterId,
      sectionId: sectionId
    });

    if (enrollmentIndex !== -1) {
      const chapterProgressIndex = course.enrolledUsers[
        enrollmentIndex
      ].chapterProgress.findIndex(
        (cp) => cp.chapterId.toString() === chapterId.toString()
      );

      if (chapterProgressIndex !== -1) {
        const sectionProgressIndex = course.enrolledUsers[
          enrollmentIndex
        ].chapterProgress[chapterProgressIndex].sectionProgress.findIndex(
          (sp) => sp.sectionId.toString() === sectionId.toString()
        );

        if (sectionProgressIndex !== -1) {
          console.log("=== UPDATING QUIZ PROGRESS ===");

          // Update quiz progress
          const quizProgress =
            course.enrolledUsers[enrollmentIndex].chapterProgress[
              chapterProgressIndex
            ].sectionProgress[sectionProgressIndex].quizProgress;

          if (quizProgress) {
            quizProgress.attempts = quizResult.attempts;
            quizProgress.bestScore = Math.max(
              quizProgress.bestScore || 0,
              quizResult.percentage
            );
            quizProgress.passed = quizResult.passed;
            quizProgress.lastAttemptDate = new Date();
            console.log("Quiz progress updated:", {
              attempts: quizProgress.attempts,
              bestScore: quizProgress.bestScore,
              passed: quizProgress.passed,
            });
          }

          if (course.enrolledUsers[enrollmentIndex].status === "Not Started") {
            course.enrolledUsers[enrollmentIndex].status = "In Progress";
          }

          // 🆕 CHECK IF QUIZ FAILED AND UPDATE STATUS
          // if (!quizResult.passed && quizResult.attempts >= 3) {
          //   course.enrolledUsers[enrollmentIndex].status = "Failed";
          //   course.enrolledUsers[enrollmentIndex].certificateRequestStatus =
          //     "Not Eligible";
          //   console.log(
          //     `User ${userId} course status updated to Failed due to quiz failure`
          //   );
          // }

          if (!quizResult.passed && quizResult.attempts >= quiz.maxAttempts) {
            course.enrolledUsers[enrollmentIndex].status = 'Failed';
            course.enrolledUsers[enrollmentIndex].certificateRequestStatus = 'Not Eligible';
            console.log(`User ${userId} course status updated to Failed due to quiz failure (${quizResult.attempts}/${quiz.maxAttempts} attempts)`);
          }

          // 🆕 IF QUIZ PASSED - UPDATE SECTION/CHAPTER COMPLETION
          if (quizResult.passed) {
            console.log("Quiz passed, checking section completion...");

            // Get current section and chapter from course structure
            const currentChapter = course.chapters.find(
              (ch) => ch._id.toString() === chapterId.toString()
            );
            const currentSection = currentChapter?.sections?.find(
              (sec) => sec._id.toString() === sectionId.toString()
            );

            if (currentSection) {
              // Check if all content in section is completed
              const allContentCompleted = currentSection.content.every(
                (content) => {
                  const contentProgress = course.enrolledUsers[
                    enrollmentIndex
                  ].chapterProgress[chapterProgressIndex].sectionProgress[
                    sectionProgressIndex
                  ].contentProgress.find(
                    (cp) => cp.contentId.toString() === content._id.toString()
                  );

                  const isCompleted =
                    contentProgress && contentProgress.completed;
                  console.log(
                    `Content "${content.title}": ${isCompleted ? "COMPLETED" : "NOT COMPLETED"
                    }`
                  );
                  return isCompleted;
                }
              );

              console.log("All content completed:", allContentCompleted);
              console.log("Quiz passed:", quizResult.passed);

              // 🆕 MARK SECTION AS COMPLETED if all content + quiz done
              if (allContentCompleted && quizResult.passed) {
                course.enrolledUsers[enrollmentIndex].chapterProgress[
                  chapterProgressIndex
                ].sectionProgress[sectionProgressIndex].completed = true;
                console.log(
                  `✅ Section "${currentSection.title}" marked as COMPLETED`
                );

                // 🆕 CHECK IF ALL SECTIONS IN CHAPTER ARE COMPLETED
                const allSectionsCompleted = course.enrolledUsers[
                  enrollmentIndex
                ].chapterProgress[chapterProgressIndex].sectionProgress.every(
                  (sp) => sp.completed
                );

                console.log(
                  "All sections in chapter completed:",
                  allSectionsCompleted
                );

                if (allSectionsCompleted) {
                  course.enrolledUsers[enrollmentIndex].chapterProgress[
                    chapterProgressIndex
                  ].completed = true;
                  console.log(
                    `✅ Chapter "${currentChapter.title}" marked as COMPLETED`
                  );
                }

                // 🆕 RECALCULATE OVERALL PROGRESS
                const totalItems = course.chapters.reduce((total, chapter) => {
                  return (
                    total +
                    chapter.sections.reduce((sectionTotal, section) => {
                      return (
                        sectionTotal +
                        section.content.length +
                        (section.quiz ? 1 : 0)
                      );
                    }, 0)
                  );
                }, 0);

                let completedItems = 0;
                course.enrolledUsers[enrollmentIndex].chapterProgress.forEach(
                  (cp) => {
                    cp.sectionProgress.forEach((sp) => {
                      // Count completed content
                      completedItems += sp.contentProgress.filter(
                        (contentP) => contentP.completed
                      ).length;
                      // Count passed quiz
                      if (sp.quizProgress && sp.quizProgress.passed) {
                        completedItems++;
                      }
                    });
                  }
                );

                const newProgress =
                  totalItems > 0
                    ? Math.round((completedItems / totalItems) * 100)
                    : 0;
                course.enrolledUsers[enrollmentIndex].progress = newProgress;

                console.log(
                  `Progress updated: ${completedItems}/${totalItems} = ${newProgress}%`
                );
              }
            }

            // 🆕 CHECK IF ALL COURSE REQUIREMENTS ARE MET
            const courseCompleted = checkCourseCompletion(
              course,
              enrollmentIndex
            );

            if (courseCompleted.allCompleted) {
              const finalGrade = calculateFinalGrade(course, enrollmentIndex);

              course.enrolledUsers[enrollmentIndex].gradePercentage =
                finalGrade.percentage;
              course.enrolledUsers[enrollmentIndex].gradeLabel =
                finalGrade.label;
              course.enrolledUsers[enrollmentIndex].allChaptersCompleted = true;
              course.enrolledUsers[enrollmentIndex].allQuizzesPassed =
                courseCompleted.allQuizzesPassed;
              course.enrolledUsers[enrollmentIndex].completionDate = new Date();
              course.enrolledUsers[enrollmentIndex].progress = 100; // 🆕 FORCE 100%

              // Determine final status
              if (
                finalGrade.percentage >= course.passingGrade &&
                courseCompleted.allQuizzesPassed
              ) {
                course.enrolledUsers[enrollmentIndex].status = "Completed";
                course.enrolledUsers[enrollmentIndex].certificateRequestStatus =
                  "Eligible";
                course.enrolledUsers[enrollmentIndex].certificateEarned = true;
                course.enrolledUsers[
                  enrollmentIndex
                ].certificateUrl = `/certificates/${courseId}/${userId}`;
                console.log(
                  `User ${userId} completed course successfully and is eligible for certificate`
                );
              } else {
                course.enrolledUsers[enrollmentIndex].status = "Failed";
                course.enrolledUsers[enrollmentIndex].certificateRequestStatus =
                  "Not Eligible";
                course.enrolledUsers[enrollmentIndex].certificateEarned = false;
                course.enrolledUsers[enrollmentIndex].certificateUrl = null;
                console.log(
                  `User ${userId} failed course due to low overall grade`
                );
              }
            }
          }

          await course.save();
          console.log("Course saved successfully after quiz completion");
        }
      }
    }
  } catch (error) {
    console.error("Error updating quiz progress:", error);
    throw error;
  }
};

// 🆕 ADD HELPER FUNCTIONS (same as in navigation controller)
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
          (cp) => cp.chapterId.toString() === chapter._id.toString()
        );

        if (!chapterProgress) {
          allContentCompleted = false;
          break;
        }

        const sectionProgress = chapterProgress.sectionProgress.find(
          (sp) => sp.sectionId.toString() === section._id.toString()
        );

        if (!sectionProgress) {
          allContentCompleted = false;
          break;
        }

        const contentProgress = sectionProgress.contentProgress.find(
          (cp) => cp.contentId.toString() === content._id.toString()
        );

        if (!contentProgress || !contentProgress.completed) {
          allContentCompleted = false;
          break;
        }
      }

      // Check quiz if exists
      if (section.quiz) {
        const chapterProgress = userEnrollment.chapterProgress.find(
          (cp) => cp.chapterId.toString() === chapter._id.toString()
        );

        if (chapterProgress) {
          const sectionProgress = chapterProgress.sectionProgress.find(
            (sp) => sp.sectionId.toString() === section._id.toString()
          );

          if (
            !sectionProgress ||
            !sectionProgress.quizProgress ||
            !sectionProgress.quizProgress.passed
          ) {
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
    allQuizzesPassed,
  };
}

function calculateFinalGrade(course, enrollmentIndex) {
  const userEnrollment = course.enrolledUsers[enrollmentIndex];
  let totalScore = 0;
  let totalQuizzes = 0;
  let totalQuizzesInCourse = 0;

  // Calculate average of all quiz scores
  // userEnrollment.chapterProgress.forEach((cp) => {
  //   cp.sectionProgress.forEach((sp) => {
  //     if (sp.quizProgress && sp.quizProgress.bestScore > 0) {
  //       totalScore += sp.quizProgress.bestScore;
  //       totalQuizzes++;
  //     }
  //   });
  // });


  course.chapters.forEach(chapter => {
    chapter.sections.forEach(section => {
      if (section.quiz) {
        totalQuizzesInCourse++;
      }
    });
  });


  userEnrollment.chapterProgress.forEach(cp => {
    cp.sectionProgress.forEach(sp => {
      if (sp.quizProgress && sp.quizProgress.attempts > 0) {
        // Use best score even if quiz was not passed
        totalScore += sp.quizProgress.bestScore || 0;
        totalQuizzes++;
      }
    });
  });

  if (totalQuizzes < totalQuizzesInCourse) {
    return { percentage: 0, label: 'F' };
  }

  const averageScore = totalQuizzes > 0 ? totalScore / totalQuizzes : 0;
  const percentage = Math.round(averageScore);

  let label = "F";
  if (percentage >= 90) label = "A";
  else if (percentage >= 80) label = "B";
  else if (percentage >= 70) label = "C";
  // else if (percentage >= 60) label = "F";
  // else grade = "F";

  return { percentage, label };
}

// updateUserProgress = async (userId, courseId, chapterId, sectionId, attempt) => {
//   try {
//     // Find the course
//     const course = await Course.findById(courseId);
//     if (!course) {
//       console.log("Course not found");
//       return;
//     }

//     console.log("Updating progress for user:", userId);
//     console.log("Course:", courseId);
//     console.log("Chapter:", chapterId);
//     console.log("Section:", sectionId);

//     // Find the user's enrollment
//     const enrollmentIndex = course.enrolledUsers.findIndex(
//       enrollment => enrollment.user.toString() === userId.toString()
//     );

//     if (enrollmentIndex === -1) {
//       console.log("User not enrolled in course");
//       return;
//     }

//     // Find the chapter progress
//     const chapterProgressIndex = course.enrolledUsers[enrollmentIndex].chapterProgress.findIndex(
//       cp => cp.chapterId.toString() === chapterId.toString()
//     );

//     if (chapterProgressIndex === -1) {
//       console.log("Chapter progress not found");
//       return;
//     }

//     // Find the section progress
//     const sectionProgressIndex = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//       .sectionProgress.findIndex(
//         sp => sp.sectionId.toString() === sectionId.toString()
//       );

//     if (sectionProgressIndex === -1) {
//       console.log("Section progress not found");
//       return;
//     }

//     console.log("Found section progress at index:", sectionProgressIndex);

//     // Update quiz progress
//     const quizProgress = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//       .sectionProgress[sectionProgressIndex].quizProgress;

//     // Create a new quiz progress object
//     const updatedQuizProgress = {
//       quizId: attempt.userId, // This should be the quiz ID, not user ID
//       attempts: quizProgress ? quizProgress.attempts + 1 : 1,
//       bestScore: quizProgress ? Math.max(quizProgress.bestScore, attempt.percentage) : attempt.percentage,
//       passed: quizProgress ? quizProgress.passed || attempt.passed : attempt.passed,
//       lastAttemptDate: new Date()
//     };

//     // Update the quiz progress
//     course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//       .sectionProgress[sectionProgressIndex].quizProgress = updatedQuizProgress;

//     console.log("Updated quiz progress:", updatedQuizProgress);

//     // If quiz is passed, mark section as completed
//     if (attempt.passed) {
//       course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//         .sectionProgress[sectionProgressIndex].completed = true;

//       console.log("Section marked as completed");

//       // Check if all sections in chapter are completed
//       const allSectionsCompleted = course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex]
//         .sectionProgress.every(sp => sp.completed);

//       if (allSectionsCompleted) {
//         course.enrolledUsers[enrollmentIndex].chapterProgress[chapterProgressIndex].completed = true;
//         console.log("Chapter marked as completed");
//       }

//       // Calculate overall progress
//       const totalChapters = course.chapters.length;
//       const completedChapters = course.enrolledUsers[enrollmentIndex].chapterProgress
//         .filter(cp => cp.completed).length;

//       const newProgress = Math.round((completedChapters / totalChapters) * 100);
//       course.enrolledUsers[enrollmentIndex].progress = newProgress;
//       console.log("Overall progress updated to:", newProgress);

//       // Update current position
//       course.enrolledUsers[enrollmentIndex].currentChapter = 0; // Should be the next chapter index
//       course.enrolledUsers[enrollmentIndex].currentSection = 0; // Should be the next section index
//       course.enrolledUsers[enrollmentIndex].currentContent = 0; // Should be the next content index
//     }

//     // Save the updated course
//     await course.save();
//     console.log("Course saved successfully");
//   } catch (error) {
//     console.error('Error updating user progress:', error);
//   }
// };

// get user quiz attempts

const updateUserProgress = async (
  userId,
  courseId,
  chapterId,
  sectionId,
  attempt
) => {
  try {
    const course = await Course.findById(courseId);
    if (!course) {
      console.log("Course not found");
      return;
    }

    console.log("Updating progress for user:", userId);
    console.log("Course:", courseId);
    console.log("Chapter:", chapterId);
    console.log("Section:", sectionId);
    console.log("Quiz attempt:", attempt);

    // Find the user's enrollment
    const enrollmentIndex = course.enrolledUsers.findIndex(
      (enrollment) => enrollment.user.toString() === userId.toString()
    );

    if (enrollmentIndex === -1) {
      console.log("User not enrolled in course");
      return;
    }

    // Find the chapter progress
    const chapterProgressIndex = course.enrolledUsers[
      enrollmentIndex
    ].chapterProgress.findIndex(
      (cp) => cp.chapterId.toString() === chapterId.toString()
    );

    if (chapterProgressIndex === -1) {
      console.log("Chapter progress not found");
      return;
    }

    // Find the section progress
    const sectionProgressIndex = course.enrolledUsers[
      enrollmentIndex
    ].chapterProgress[chapterProgressIndex].sectionProgress.findIndex(
      (sp) => sp.sectionId.toString() === sectionId.toString()
    );

    if (sectionProgressIndex === -1) {
      console.log("Section progress not found");
      return;
    }

    console.log("Found section progress at index:", sectionProgressIndex);

    // Update quiz progress
    const quizProgress =
      course.enrolledUsers[enrollmentIndex].chapterProgress[
        chapterProgressIndex
      ].sectionProgress[sectionProgressIndex].quizProgress || {};

    // Create a new quiz progress object
    const updatedQuizProgress = {
      quizId: attempt.quizId,
      attempts: (quizProgress.attempts || 0) + 1,
      bestScore: Math.max(quizProgress.bestScore || 0, attempt.percentage),
      passed: quizProgress.passed || attempt.passed,
      lastAttemptDate: new Date(),
    };

    // Update the quiz progress
    course.enrolledUsers[enrollmentIndex].chapterProgress[
      chapterProgressIndex
    ].sectionProgress[sectionProgressIndex].quizProgress = updatedQuizProgress;

    console.log("Updated quiz progress:", updatedQuizProgress);

    // If quiz is passed, mark section as completed
    if (attempt.passed) {
      course.enrolledUsers[enrollmentIndex].chapterProgress[
        chapterProgressIndex
      ].sectionProgress[sectionProgressIndex].completed = true;
      console.log("Section marked as completed");
    } else {
      // Even if quiz is failed, we'll still allow progress
      // We'll use the presence of quizProgress with attempts > 0 to indicate attempted
      console.log("Quiz failed but progress will continue");
    }

    // Check if all sections in chapter have been attempted
    // A section is considered attempted if it's completed OR has quiz attempts
    const allSectionsAttempted = course.enrolledUsers[
      enrollmentIndex
    ].chapterProgress[chapterProgressIndex].sectionProgress.every(
      (sp) => sp.completed || (sp.quizProgress && sp.quizProgress.attempts > 0)
    );

    if (allSectionsAttempted) {
      // Mark chapter as completed if all sections are attempted
      course.enrolledUsers[enrollmentIndex].chapterProgress[
        chapterProgressIndex
      ].completed = true;
      console.log("Chapter marked as completed (all sections attempted)");
    }

    // Calculate overall progress based on chapters completed
    const totalChapters = course.chapters.length;
    const completedChapters = course.enrolledUsers[
      enrollmentIndex
    ].chapterProgress.filter((cp) => cp.completed).length;

    const newProgress = Math.round((completedChapters / totalChapters) * 100);
    course.enrolledUsers[enrollmentIndex].progress = newProgress;
    console.log("Overall progress updated to:", newProgress);

    // Calculate overall grade based on all quiz attempts
    let totalScore = 0;
    let totalQuizzes = 0;

    course.enrolledUsers[enrollmentIndex].chapterProgress.forEach((cp) => {
      cp.sectionProgress.forEach((sp) => {
        if (sp.quizProgress && sp.quizProgress.bestScore > 0) {
          totalScore += sp.quizProgress.bestScore;
          totalQuizzes++;
        }
      });
    });

    if (totalQuizzes > 0) {
      const averageScore = totalScore / totalQuizzes;
      course.enrolledUsers[enrollmentIndex].gradePercentage =
        Math.round(averageScore);

      // Assign grade label
      const gradePercentage =
        course.enrolledUsers[enrollmentIndex].gradePercentage;

      if (gradePercentage >= 90) {
        course.enrolledUsers[enrollmentIndex].gradeLabel = "A";
      } else if (gradePercentage >= 80) {
        course.enrolledUsers[enrollmentIndex].gradeLabel = "B";
      } else if (gradePercentage >= 70) {
        course.enrolledUsers[enrollmentIndex].gradeLabel = "C";
      } else if (gradePercentage >= 60) {
        course.enrolledUsers[enrollmentIndex].gradeLabel = "D";
      } else {
        course.enrolledUsers[enrollmentIndex].gradeLabel = "F";
      }

      console.log(
        "Overall grade updated to:",
        course.enrolledUsers[enrollmentIndex].gradeLabel,
        "(" + course.enrolledUsers[enrollmentIndex].gradePercentage + "%)"
      );

      // Check if all chapters are completed
      const allChaptersCompleted = course.enrolledUsers[
        enrollmentIndex
      ].chapterProgress.every((cp) => cp.completed);

      if (allChaptersCompleted) {
        // If all chapters are completed, check if course is passed
        const coursePassed = gradePercentage >= course.passingGrade;

        if (coursePassed) {
          // Award certificate if passed
          course.enrolledUsers[enrollmentIndex].certificateEarned = true;
          course.enrolledUsers[
            enrollmentIndex
          ].certificateUrl = `/certificates/${courseId}/${userId}`;
          console.log("Certificate earned");
        } else {
          console.log(
            "Course completed but not passed. Grade:",
            gradePercentage,
            "%, Required:",
            course.passingGrade,
            "%"
          );
        }
      }
    }

    // Update current position to next content
    // Find next section or chapter
    const currentChapterIndex = course.chapters.findIndex(
      (ch) => ch._id.toString() === chapterId.toString()
    );
    const currentSectionIndex = course.chapters[
      currentChapterIndex
    ].sections.findIndex((sec) => sec._id.toString() === sectionId.toString());

    // If there's a next section in this chapter
    if (
      currentSectionIndex + 1 <
      course.chapters[currentChapterIndex].sections.length
    ) {
      course.enrolledUsers[enrollmentIndex].currentChapter =
        currentChapterIndex;
      course.enrolledUsers[enrollmentIndex].currentSection =
        currentSectionIndex + 1;
      course.enrolledUsers[enrollmentIndex].currentContent = 0;
    }
    // If there's a next chapter
    else if (currentChapterIndex + 1 < course.chapters.length) {
      course.enrolledUsers[enrollmentIndex].currentChapter =
        currentChapterIndex + 1;
      course.enrolledUsers[enrollmentIndex].currentSection = 0;
      course.enrolledUsers[enrollmentIndex].currentContent = 0;
    }
    // Otherwise, course is completed
    else {
      // Keep current position at the last content
      course.enrolledUsers[enrollmentIndex].currentChapter =
        currentChapterIndex;
      course.enrolledUsers[enrollmentIndex].currentSection =
        currentSectionIndex;
      course.enrolledUsers[enrollmentIndex].currentContent =
        course.chapters[currentChapterIndex].sections[currentSectionIndex]
          .content.length - 1;
    }

    // Save the updated course
    await course.save();
    console.log("Course saved successfully");

    // Return updated progress information
    return {
      progress: course.enrolledUsers[enrollmentIndex].progress,
      gradePercentage: course.enrolledUsers[enrollmentIndex].gradePercentage,
      gradeLabel: course.enrolledUsers[enrollmentIndex].gradeLabel,
      certificateEarned:
        course.enrolledUsers[enrollmentIndex].certificateEarned,
      certificateUrl: course.enrolledUsers[enrollmentIndex].certificateUrl,
      completed: course.enrolledUsers[enrollmentIndex].progress === 100,
      passed:
        course.enrolledUsers[enrollmentIndex].gradePercentage >=
        course.passingGrade,
    };
  } catch (error) {
    console.error("Error updating user progress:", error);
    throw error;
  }
};

const getUserQuizAttempts = async (req, res) => {
  try {
    const { quizId } = req.params;
    const userId = req.user._id; // Assuming user is authenticated

    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    const userAttempts = quiz.attempts.filter(
      (attempt) => attempt.userId.toString() === userId.toString()
    );

    res.status(200).json(userAttempts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// get course progress and grades:
const getCourseGrades = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user._id; // Assuming user is authenticated

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Find user enrollment
    const enrollment = course.enrolledUsers.find(
      (enrollment) => enrollment.user.toString() === userId.toString()
    );

    if (!enrollment) {
      return res
        .status(404)
        .json({ message: "User not enrolled in this course" });
    }

    // Get all quizzes for this course
    const quizzes = await Quiz.find({ courseId });

    // Calculate chapter grades
    const chapterGrades = [];

    for (const chapter of course.chapters) {
      const chapterQuizzes = quizzes.filter(
        (quiz) => quiz.chapterId.toString() === chapter._id.toString()
      );

      const sectionGrades = [];
      let chapterTotalScore = 0;
      let chapterMaxScore = 0;

      for (const section of chapter.sections) {
        const quiz = chapterQuizzes.find(
          (q) => q.sectionId.toString() === section._id.toString()
        );

        if (quiz) {
          const userAttempts = quiz.attempts.filter(
            (attempt) => attempt.userId.toString() === userId.toString()
          );

          // Get best attempt
          const bestAttempt =
            userAttempts.length > 0
              ? userAttempts.reduce(
                (best, current) =>
                  current.percentage > best.percentage ? current : best,
                userAttempts[0]
              )
              : null;

          const sectionGrade = {
            sectionId: section._id,
            sectionTitle: section.title,
            quizId: quiz._id,
            attempts: userAttempts.length,
            maxAttempts: quiz.maxAttempts,
            bestScore: bestAttempt ? bestAttempt.percentage : 0,
            passed: bestAttempt ? bestAttempt.passed : false,
            grade: bestAttempt ? bestAttempt.grade : "Incomplete",
          };

          sectionGrades.push(sectionGrade);

          // Add to chapter totals (weighted)
          if (bestAttempt) {
            chapterTotalScore +=
              bestAttempt.percentage * (quiz.weightage / 100);
            chapterMaxScore += quiz.weightage;
          }
        } else {
          sectionGrades.push({
            sectionId: section._id,
            sectionTitle: section.title,
            quizId: null,
            attempts: 0,
            maxAttempts: 0,
            bestScore: 0,
            passed: false,
            grade: "No Quiz",
          });
        }
      }

      // Calculate chapter grade
      const chapterPercentage =
        chapterMaxScore > 0 ? (chapterTotalScore / chapterMaxScore) * 100 : 0;

      let chapterGrade;
      if (chapterPercentage >= 90) chapterGrade = "A";
      else if (chapterPercentage >= 80) chapterGrade = "B";
      else if (chapterPercentage >= 70) chapterGrade = "C";
      else if (chapterPercentage >= 60) chapterGrade = "D";
      else chapterGrade = "F";

      chapterGrades.push({
        chapterId: chapter._id,
        chapterTitle: chapter.title,
        percentage: chapterPercentage,
        grade: chapterGrade,
        sections: sectionGrades,
      });
    }

    // Calculate overall course grade
    const overallGrade = calculateOverallGrade(chapterGrades, course);

    res.status(200).json({
      courseId,
      courseName: course.name,
      userId,
      overallProgress: enrollment.progress,
      overallGrade: overallGrade.percentage,
      gradeLabel: overallGrade.grade,
      passed: overallGrade.percentage >= course.passingGrade,
      chapterGrades,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getUserCoursesProgress = async (req, res) => {
  try {
    const userId = req.user._id; // Assuming user is authenticated

    // Find all courses where the user is enrolled
    const courses = await Course.find({
      "enrolledUsers.user": userId,
    });

    if (!courses || courses.length === 0) {
      return res.status(200).json({
        message: "User is not enrolled in any courses",
        courses: [],
      });
    }

    // Get all quizzes for these courses
    const courseIds = courses.map((course) => course._id);
    const quizzes = await Quiz.find({
      courseId: { $in: courseIds },
    });

    // Process each course to get detailed progress
    const coursesProgress = await Promise.all(
      courses.map(async (course) => {
        // Find user enrollment in this course
        const enrollment = course.enrolledUsers.find(
          (e) => e.user.toString() === userId.toString()
        );

        if (!enrollment) {
          return null; // Should not happen due to our query, but just in case
        }

        // Calculate chapter grades and progress
        const chapterProgress = [];
        let overallQuizScore = 0;
        let totalQuizWeightage = 0;

        for (const chapter of course.chapters) {
          // Get quizzes for this chapter
          const chapterQuizzes = quizzes.filter(
            (quiz) =>
              quiz.courseId.toString() === course._id.toString() &&
              quiz.chapterId.toString() === chapter._id.toString()
          );

          // Find chapter progress in user enrollment
          const userChapterProgress = enrollment.chapterProgress.find(
            (cp) => cp.chapterId.toString() === chapter._id.toString()
          ) || { completed: false, sectionProgress: [] };

          // Calculate section progress and grades
          const sectionProgress = [];
          let chapterTotalScore = 0;
          let chapterMaxScore = 0;

          for (const section of chapter.sections) {
            // Find quiz for this section
            const quiz = chapterQuizzes.find(
              (q) => q.sectionId.toString() === section._id.toString()
            );

            // Find section progress in user enrollment
            const userSectionProgress =
              userChapterProgress.sectionProgress?.find(
                (sp) => sp.sectionId.toString() === section._id.toString()
              ) || { completed: false, contentProgress: [], quizProgress: {} };

            // Calculate content completion
            const totalContent = section.content.length;
            const completedContent =
              userSectionProgress.contentProgress?.filter((cp) => cp.completed)
                .length || 0;

            const contentCompletionPercentage =
              totalContent > 0 ? (completedContent / totalContent) * 100 : 0;

            // Calculate quiz score if available
            let quizScore = 0;
            let quizPassed = false;
            let quizGrade = "Not Attempted";

            if (quiz && userSectionProgress.quizProgress?.quizId) {
              // Find user attempts for this quiz
              const userAttempts = quiz.attempts.filter(
                (attempt) => attempt.userId.toString() === userId.toString()
              );

              // Get best attempt
              const bestAttempt =
                userAttempts.length > 0
                  ? userAttempts.reduce(
                    (best, current) =>
                      current.percentage > best.percentage ? current : best,
                    userAttempts[0]
                  )
                  : null;

              if (bestAttempt) {
                quizScore = bestAttempt.percentage;
                quizPassed = bestAttempt.passed;
                quizGrade = bestAttempt.grade;

                // Add to chapter totals (weighted)
                chapterTotalScore += quizScore * (quiz.weightage / 100);
                chapterMaxScore += quiz.weightage;
              }
            }

            sectionProgress.push({
              sectionId: section._id,
              sectionTitle: section.title,
              sequence: section.sequence,
              completed: userSectionProgress.completed,
              contentCompletionPercentage,
              quizId: quiz?._id || null,
              quizAttempts: userSectionProgress.quizProgress?.attempts || 0,
              quizMaxAttempts: quiz?.maxAttempts || 0,
              quizScore,
              quizPassed,
              quizGrade,
            });
          }

          // Calculate chapter grade
          const chapterPercentage =
            chapterMaxScore > 0
              ? (chapterTotalScore / chapterMaxScore) * 100
              : 0;

          let chapterGrade;
          if (chapterPercentage >= 90) chapterGrade = "A";
          else if (chapterPercentage >= 80) chapterGrade = "B";
          else if (chapterPercentage >= 70) chapterGrade = "C";
          else if (chapterPercentage >= 60) chapterGrade = "D";
          else chapterGrade = "F";

          // Add to overall course quiz score (weighted by chapter)
          // Assuming each chapter has equal weight in the course
          overallQuizScore += chapterPercentage;
          totalQuizWeightage += 100; // Each chapter is worth 100%

          chapterProgress.push({
            chapterId: chapter._id,
            chapterTitle: chapter.title,
            sequence: chapter.sequence,
            completed: userChapterProgress.completed,
            percentage: chapterPercentage,
            grade: chapterGrade,
            sections: sectionProgress,
          });
        }

        // Sort chapters and sections by sequence
        chapterProgress.sort((a, b) => a.sequence - b.sequence);
        chapterProgress.forEach((chapter) => {
          chapter.sections.sort((a, b) => a.sequence - b.sequence);
        });

        // Calculate overall course grade
        const overallQuizPercentage =
          totalQuizWeightage > 0
            ? (overallQuizScore / totalQuizWeightage) * 100
            : 0;

        let overallGradeLabel;
        if (overallQuizPercentage >= 90) overallGradeLabel = "A";
        else if (overallQuizPercentage >= 80) overallGradeLabel = "B";
        else if (overallQuizPercentage >= 70) overallGradeLabel = "C";
        else if (overallQuizPercentage >= 60) overallGradeLabel = "D";
        else overallGradeLabel = "F";

        const passed = overallQuizPercentage >= course.passingGrade;

        return {
          courseId: course._id,
          courseName: course.name,
          thumbnail: course.thumbnail,
          level: course.level,
          language: course.language,
          enrollmentDate: enrollment.enrollmentDate,
          progress: enrollment.progress,
          currentChapter: enrollment.currentChapter,
          currentSection: enrollment.currentSection,
          currentContent: enrollment.currentContent,
          overallGrade: overallQuizPercentage,
          gradeLabel: overallGradeLabel,
          passed,
          certificateEarned: enrollment.certificateEarned,
          certificateUrl: enrollment.certificateUrl,
          chapters: chapterProgress,
        };
      })
    );

    // Filter out any null values (shouldn't happen)
    const validCoursesProgress = coursesProgress.filter(
      (course) => course !== null
    );

    // Calculate overall statistics across all courses
    const totalCourses = validCoursesProgress.length;
    const completedCourses = validCoursesProgress.filter(
      (course) => course.progress === 100
    ).length;
    const inProgressCourses = validCoursesProgress.filter(
      (course) => course.progress > 0 && course.progress < 100
    ).length;
    const notStartedCourses = validCoursesProgress.filter(
      (course) => course.progress === 0
    ).length;
    const passedCourses = validCoursesProgress.filter(
      (course) => course.passed
    ).length;

    const averageProgress =
      totalCourses > 0
        ? validCoursesProgress.reduce(
          (sum, course) => sum + course.progress,
          0
        ) / totalCourses
        : 0;

    const averageGrade =
      totalCourses > 0
        ? validCoursesProgress.reduce(
          (sum, course) => sum + course.overallGrade,
          0
        ) / totalCourses
        : 0;

    res.status(200).json({
      userId,
      totalCourses,
      completedCourses,
      inProgressCourses,
      notStartedCourses,
      passedCourses,
      averageProgress,
      averageGrade,
      courses: validCoursesProgress,
    });
  } catch (error) {
    console.error("Error fetching user courses progress:", error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createQuiz,
  getAllQuizzes,
  startQuizAttempt,
  updateCurrentPosition,
  checkContentNavigation,
  getQuizzesByCourse,
  getQuizById,
  updateQuiz,
  submitQuizAttempt,
  getUserQuizAttempts,
  getCourseGrades,
  getUserCoursesProgress,
  // deleteQuiz
  bulkDeleteQuizzes,
};
