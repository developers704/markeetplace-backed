// const mongoose = require('mongoose');

// const courseSchema = new mongoose.Schema({
//     name: {
//         type: String,
//         required: true,
//         trim: true
//     },
//     description: {
//         type: String,
//         required: true,
//         trim: true
//     },
//     thumbnail: {
//         type: String,
//         required: true
//     },
//     approximateHours: {
//         type: Number,
//         required: true
//     },
//     totalVideos: {
//         type: Number,
//         required: true
//     },
//     level:{
//         type: String,
//         // required: true,
//         enum: ["Beginner", "Intermediate", "Advanced"]
//     },
//     language:{
//         type: String
//     },
//     videos: [{
//         title: {
//             type: String,
//             required: true
//         },
//         videoUrl: {
//             type: String,
//             required: true
//         },
//         duration: {
//             type: Number,
//             required: true
//         },
//         description: {
//             type: String
//         },
//         order: {
//             type: Number,
//             required: true
//         },
//         minimumWatchTime: {
//             type: Number,
//             required: true
//         },
//         thumbnail: {
//             type: String
//         },
//         likes:{
//             type: Number,
//             default: 0
//         },
//         dislikes: {
//         type: Number,
//         default: 0
//         },
//     quizId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'Quiz'
//     },
//     certificate: {
//       type: String
//     }
//     }],
//     // instructor: {
//     //     type: mongoose.Schema.Types.ObjectId,
//     //     ref: 'User',
//     //     required: true
//     // },
//     enrolledUsers: [{
//         user: {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: 'User'
//         },
//         enrollmentDate: {
//             type: Date,
//             default: Date.now
//         },
//         progress: {
//             type: Number,
//             default: 0
//         },
//         completedVideos: [{
//             videoId:{
//             type: mongoose.Schema.Types.ObjectId
//             },
//             watchedDuration: {
//                 type: Number,
//                 default: 0
//             },
//             completed:{
//                 type: Boolean,
//                 default: false
//             },
//             lastWatchedAt: {
//                 type: Date,
//             },
//             currentVideo:{
//                 type: Number,
//                 default: 0
//             },
//             quizStatus: {
//         type: String,
//         enum: ['Not Attempted', 'Passed', 'Failed'],
//         default: 'Not Attempted'
//       },
//       grade: {
//         type: String,
//       },
//       certificateEarned: {
//         type: Boolean,
//         default: false
//       }
//         }]
//     }],
//     isActive: {
//         type: Boolean,
//         default: true
//     }
// }, {
//     timestamps: true
// });

// const Course = mongoose.model('Course', courseSchema);
// module.exports = Course;





const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    courseDuration: {
        type: String,
        required: true
    },
    description: {
        type: String,
        // required: true,
        trim: true
    },
    thumbnail: {
        type: String,
        required: true
    },
    approximateHours: {
        type: Number,
        required: true
    },
    level: {
        type: String,
        // enum: ["Beginner", "Intermediate", "Advanced"],
        required: true
    },
    courseType: {
    type: String,
    enum: ["Course", "Short Course", "Task"],
    required: true,
    default: "Course"
    },
    language: {
        type: String,
        required: true
    },
    // Course sequence in curriculum
    sequence: {
        type: Number,
        required: true
    },
    // Passing grade for the entire course
    passingGrade: {
        type: Number,
        default: 70,
        required: true
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
            required: true
        },
        description: {
            type: String
        },
        sequence: {
            type: Number,
            required: true
        },
        deadline: {
            type: Date
        },
        // Sections within chapters
        sections: [{
            title: {
                type: String,
                required: true
            },
            sequence: {
                type: Number,
                required: true
            },
            introduction: {
                type: String,
                required: true
            },
            objective: {
                type: String
            },
            // Content items (videos or text)
            content: [{
                contentType: {
                    type: String,
                    enum: ['video', 'text'],
                    required: true
                },
                title: {
                    type: String,
                    required: true
                },
                description: {
                    type: String
                },
                sequence: {
                    type: Number,
                    required: true
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
        required: true
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
            enum: ['A', 'B', 'C', 'D', 'F', 'Incomplete'],
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

