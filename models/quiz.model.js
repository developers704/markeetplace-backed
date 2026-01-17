const mongoose = require('mongoose');

const quizSchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  chapterId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  // sectionId: {
  //   type: mongoose.Schema.Types.ObjectId,
  // },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  timeLimit: {
    type: Number,
    required: true  // Time in minutes for the entire quiz
  },
  maxAttempts: {
    type: Number,
    required: true,
    default: 3
  },
  weightage: {
    type: Number,
    required: true,
    default: 100  // Percentage weight of this quiz in the chapter grade
  },

  enableSuffling: {
    type: Boolean,
    default: true
  },
  enableTimer: {
    type: Boolean,
    default: false
  },
  questionTimeLimit: {
    type: Number,
    default: 30  // Seconds per question
  },

  questions: [{
    question: {
      type: String,
      required: true
    },
    options: [{
      type: String,
      required: true
    }],
    correctAnswer: {
      type: Number,
      required: true
    },
    points: {
      type: Number,
      required: true,
      default: 1
    }
  }],
  passingScore: {
    type: Number,
    required: true,
    default: 70  // Percentage required to pass
  },
  attempts: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true
    },
    startTime: {
      type: Date,
    },
    endTime: {
      type: Date
    },
    score: {
      type: Number
    },
    percentage: {
      type: Number
    },
    grade: {
      type: String,
      enum: ['A', 'B', 'C', 'D', 'F']
    },
    passed: {
      type: Boolean,
      default: false
    },
    attemptDate: {
      type: Date,
      default: Date.now
    },
    answers: [{
      questionIndex: Number,
      selectedAnswer: Number,
      isCorrect: Boolean,
      pointsEarned: Number
    }]
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const Quiz = mongoose.model('Quiz', quizSchema);
module.exports = Quiz;
