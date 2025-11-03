const mongoose = require('mongoose');

const certificateRequestSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  // User's signature image PATH
  userSignaturePath: {
    type: String,
    required: true
  },
  // President's signature image PATH (will be added by admin)
  presidentSignaturePath: {
    type: String,
    default: null
  },
  // Generated certificate image PATH (final certificate with both signatures)
  certificateImagePath: {
    type: String,
    default: null
  },
  // User's name (stored separately for certificate generation)
  userName: {
    type: String,
    required: true
  },
  // Certificate status
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Certificate_Generated'],
    default: 'Pending'
  },
  // User's course completion data
  completionData: {
    completionDate: {
      type: Date,
      required: true
    },
    finalGrade: {
      type: Number,
      required: true
    },
    gradePercentage: {
      type: Number,
      required: true
    },
    gradeLabel: {
      type: String,
      required: true
    },
    totalChapters: {
      type: Number,
      required: true
    },
    completedChapters: {
      type: Number,
      required: true
    },
    totalQuizzes: {
      type: Number,
      default: 0
    },
    passedQuizzes: {
      type: Number,
      default: 0
    }
  },
  // Admin who approved/rejected
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  reviewComments: {
    type: String,
    default: null
  },
  // Certificate unique ID
  certificateId: {
    type: String,
    unique: true,
    sparse: true // Only unique if not null
  }
}, {
  timestamps: true
});

// Generate certificate ID before saving
certificateRequestSchema.pre('save', function(next) {
  if (this.status === 'Approved' && !this.certificateId) {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.certificateId = `CERT-${timestamp}-${randomStr}`;
  }
  next();
});

module.exports = mongoose.model('CertificateRequest', certificateRequestSchema);
