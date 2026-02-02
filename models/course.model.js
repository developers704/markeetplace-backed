const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
    name: {
        type: String,
        trim: true
    },
    courseDuration: {
        type: String,
    },
    description: {
        type: String,
        trim: true
    },
    thumbnail: {
        type: String,
        
    },
    approximateHours: {
        type: Number,
        
    },
    level: {
        type: String,
        // enum: ["Beginner", "Intermediate", "Advanced"],
       
    },
    courseType: {
    type: String,
    enum: ["Course", "Short Course", "Task"],
    
    default: "Course"
    },
    language: {
        type: String,
       
    },
    // Course sequence in curriculum
    sequence: {
        type: Number,
    
    },
    // Passing grade for the entire course
    passingGrade: {
        type: Number,
        default: 70,
        
    },
    // Access control for roles and stores
    accessControl: {
        roles: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'UserRole'
        }],
        stores: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Warehouse'
        }]
    },
    // Chapters structure
    chapters: [{
        title: {
            type: String,
       
        },
        description: {
            type: String
        },
        sequence: {
            type: Number,
           
        },
        deadline: {
            type: Date
        },
        quiz: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quiz',
        default: null   
    },
        // Sections within chapters
        sections: [{
            title: {
                type: String,
                
            },
            sequence: {
                type: Number,
                
            },
            introduction: {
                type: String,
                
            },
            objective: {
                type: String
            },
            // Required time in seconds before videos/content are shown (optional)
            requiredTime: {
                type: Number,
                default: null
            },
            // Content items (videos or text)
            content: [{
                contentType: {
                    type: String,
                    enum: ['video', 'text'],
                    
                },
                title: {
                    type: String,
                    
                },
                description: {
                    type: String
                },
                sequence: {
                    type: Number,
                    
                },
                // For video content
                videoUrl: {
                    type: String
                },
                duration: {
                    type: Number
                },
                thumbnail: {
                    type: String
                },
                minimumWatchTime: {
                    type: Number
                },
                // For text content
                textContent: {
                    type: String
                },
                // Common fields for both types
                likes: {
                    type: Number,
                    default: 0
                },
                dislikes: {
                    type: Number,
                    default: 0
                },
                likedBy: [{
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Customer'
                }],
                dislikedBy: [{
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Customer'
                }]
            }],
            // Reference to quiz for this section
            quiz: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Quiz'
            }
        }]
    }],
    totalVideos: {
        type: Number,
        
    },
    enrolledUsers: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Customer'
        },
        enrollmentDate: {
            type: Date,
            default: Date.now
        },
        status: {
        type: String,
        enum: ['Not Started', 'In Progress', 'Completed', 'Failed', 'Requested', 'Done'],
        default: 'Not Started'
        },
        progress: {
            type: Number,
            default: 0
        },
        currentChapter: {
            type: Number,
            default: 0
        },
        currentSection: {
            type: Number,
            default: 0
        },
        currentContent: {
            type: Number,
            default: 0
        },
        // Track progress by chapter and section
        chapterProgress: [{
            chapterId: {
                type: mongoose.Schema.Types.ObjectId
            },
            sequence: {
                type: Number
            },
            completed: {
                type: Boolean,
                default: false
            },
            // Quiz progress for chapter-level quiz
            quizProgress: {
                quizId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Quiz'
                },
                attempts: {
                    type: Number,
                    default: 0
                },
                bestScore: {
                    type: Number,
                    default: 0
                },
                passed: {
                    type: Boolean,
                    default: false
                },
                lastAttemptDate: {
                    type: Date
                }
            },
            sectionProgress: [{
                sectionId: {
                    type: mongoose.Schema.Types.ObjectId
                },
                sequence: {
                    type: Number
                },
                completed: {
                    type: Boolean,
                    default: false
                },
                contentProgress: [{
                    contentId: {
                        type: mongoose.Schema.Types.ObjectId
                    },
                    sequence: {
                        type: Number
                    },
                    watchedDuration: {
                        type: Number,
                        default: 0
                    },
                    completed: {
                        type: Boolean,
                        default: false
                    },
                    lastAccessedAt: {
                        type: Date
                    }
                }],
                // Quiz progress reference
                quizProgress: {
                    quizId: {
                        type: mongoose.Schema.Types.ObjectId,
                        ref: 'Quiz'
                    },
                    attempts: {
                        type: Number,
                        default: 0
                    },
                    bestScore: {
                        type: Number,
                        default: 0
                    },
                    passed: {
                        type: Boolean,
                        default: false
                    },
                    lastAttemptDate: {
                        type: Date
                    }
                }
            }]
        }],
        overallGrade: {
            type: Number,
            default: 0
        },
        gradePercentage: {
            type: Number,
            default: 0
        },
        gradeLabel: {
            type: String,
            enum: ['A', 'B', 'C', 'D', 'F', 'Incomplete','Completed'],
            default: 'Incomplete'
        },

            // certificateUrl: {
            //     type: String
            //     },
            certificateRequestStatus: {
                type: String,
                enum: ['Not Eligible', 'Eligible', 'Requested', 'Approved', 'Rejected'],
                default: 'Not Eligible'
            },
            certificateRequestId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'CertificateRequest',
                default: null
            },
            lastAccessDate: {
                type: Date,
                default: Date.now
            },
         allChaptersCompleted: {
        type: Boolean,
        default: false
         },
         allQuizzesPassed: {
        type: Boolean,
        default: false
        },
        certificateEarned: {
            type: Boolean,
            default: false
        },
        certificateUrl: {
            type: String
        },
        completionDate: {
        type: Date
    }
    }],
    status: {
        type: String,
        enum: ['Not Started', 'In Progress', 'Completed', 'Locked', 'Unlocked'],
        default: 'Locked'
        },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

const Course = mongoose.model('Course', courseSchema);
module.exports = Course;

