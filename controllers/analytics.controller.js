const Order = require('../models/order.model');
const Cart = require('../models/cart.model');
const Customer = require('../models/customer.model');


const getCartAnalytics = async (req, res) => {
    try {
        // Get only carts with total > 0 and customer ID
        const abandonedCarts = await Cart.find({ 
            total: { $gt: 0 },
            customer: { $exists: true, $ne: null }
        });
        
        // Calculate total abandoned amount
        const totalAbandonedAmount = abandonedCarts.reduce((sum, cart) => sum + cart.total, 0);
        
        // Count of abandoned carts (only those with items and customer)
        const abandonedCartCount = abandonedCarts.length;

        res.status(200).json({
            totalAbandonedAmount,
            abandonedCartCount
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// const getDetailedCartData = async (req, res) => {
//     try {
//         const detailedCarts = await Cart.find({ 
//             total: { $gt: 0 },
//             customer: { $exists: true, $ne: null }
//         })
//             .populate({
//                 path: 'customer',
//                 select: 'username email phone_number'
//             })
//             .populate({
//                 path: 'items.item',
//                 select: 'name sku image'
//             });

//         res.status(200).json(detailedCarts);
//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };


// new
// get top performance: 
const getTopPerformingCustomers = async (req, res) => {
    try {
        const { 
            roleId, 
            warehouseId, 
            limit = 10, 
            sortBy = 'overallGrade', 
            courseId,
            minGrade,
            page = 1,
            pageSize = 10
        } = req.body;

        // Build the pipeline for aggregation
        const pipeline = [];
        
        // Match stage - filter by role and warehouse if provided
        const matchStage = {};
        
        if (roleId) {
            matchStage.role = mongoose.Types.ObjectId(roleId);
        }
        
        if (warehouseId) {
            matchStage.warehouse = mongoose.Types.ObjectId(warehouseId);
        }
        
        if (Object.keys(matchStage).length > 0) {
            pipeline.push({ $match: matchStage });
        }

        // Lookup courses that customers are enrolled in
        pipeline.push({
            $lookup: {
                from: 'courses',
                let: { customerId: '$_id' },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $in: ['$$customerId', '$enrolledUsers.user']
                            },
                            ...(courseId ? { _id: mongoose.Types.ObjectId(courseId) } : {})
                        }
                    },
                    {
                        $unwind: '$enrolledUsers'
                    },
                    {
                        $match: {
                            $expr: {
                                $eq: ['$enrolledUsers.user', '$$customerId']
                            },
                            ...(minGrade ? { 'enrolledUsers.gradePercentage': { $gte: Number(minGrade) } } : {})
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            name: 1,
                            progress: '$enrolledUsers.progress',
                            overallGrade: '$enrolledUsers.overallGrade',
                            gradePercentage: '$enrolledUsers.gradePercentage',
                            gradeLabel: '$enrolledUsers.gradeLabel',
                            certificateEarned: '$enrolledUsers.certificateEarned'
                        }
                    }
                ],
                as: 'coursePerformance'
            }
        });

        // Filter customers who have enrolled in at least one course
        pipeline.push({
            $match: {
                'coursePerformance': { $ne: [] }
            }
        });

        // Add fields for average performance metrics
        pipeline.push({
            $addFields: {
                averageGrade: { $avg: '$coursePerformance.gradePercentage' },
                averageProgress: { $avg: '$coursePerformance.progress' },
                completedCourses: {
                    $size: {
                        $filter: {
                            input: '$coursePerformance',
                            as: 'course',
                            cond: { $eq: ['$$course.progress', 100] }
                        }
                    }
                },
                totalCourses: { $size: '$coursePerformance' },
                certificatesEarned: {
                    $size: {
                        $filter: {
                            input: '$coursePerformance',
                            as: 'course',
                            cond: { $eq: ['$$course.certificateEarned', true] }
                        }
                    }
                }
            }
        });

        // Sort by the specified field
        pipeline.push({
            $sort: { 
                [sortBy === 'overallGrade' ? 'averageGrade' : 
                 sortBy === 'progress' ? 'averageProgress' : 
                 sortBy === 'completedCourses' ? 'completedCourses' : 
                 sortBy === 'certificatesEarned' ? 'certificatesEarned' : 'averageGrade']: -1 
            }
        });

        // Add pagination
        const skip = (page - 1) * pageSize;
        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: Number(pageSize) });

        // Lookup role and warehouse information
        pipeline.push({
            $lookup: {
                from: 'userroles',
                localField: 'role',
                foreignField: '_id',
                as: 'roleInfo'
            }
        });

        pipeline.push({
            $lookup: {
                from: 'warehouses',
                localField: 'warehouse',
                foreignField: '_id',
                as: 'warehouseInfo'
            }
        });

        // Project only needed fields
        pipeline.push({
            $project: {
                _id: 1,
                username: 1,
                email: 1,
                phone_number: 1,
                role: { $arrayElemAt: ['$roleInfo.name', 0] },
                roleId: { $arrayElemAt: ['$roleInfo._id', 0] },
                warehouse: { $arrayElemAt: ['$warehouseInfo.name', 0] },
                warehouseId: { $arrayElemAt: ['$warehouseInfo._id', 0] },
                averageGrade: 1,
                averageProgress: 1,
                completedCourses: 1,
                totalCourses: 1,
                certificatesEarned: 1,
                coursePerformance: 1
            }
        });

        // Execute the aggregation
        const topCustomers = await Customer.aggregate(pipeline);

        // Get total count for pagination
        const countPipeline = [...pipeline];
        // Remove skip, limit, and project stages for counting
        countPipeline.splice(countPipeline.findIndex(stage => stage.$skip !== undefined), 3);
        countPipeline.push({ $count: 'totalCount' });
        
        const countResult = await Customer.aggregate(countPipeline);
        const totalCount = countResult.length > 0 ? countResult[0].totalCount : 0;

        res.status(200).json({
            success: true,
            count: topCustomers.length,
            totalCount,
            totalPages: Math.ceil(totalCount / pageSize),
            currentPage: page,
            data: topCustomers
        });
    } catch (error) {
        console.error('Error getting top performing customers:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting top performing customers',
            error: error.message
        });
    }
};


// new
// get customersActiviies:
const getCustomerActivities = async (req, res) => {
    try {
        const {
            customerId,
            policyId,
            courseId,
            quizId,
            startDate,
            endDate,
            page = 1,
            pageSize = 10,
            activityType // 'policies', 'quizzes', 'courses', or undefined for all
        } = req.body;

        const result = {};
        const dateFilter = {};
        
        if (startDate) {
            dateFilter.$gte = new Date(startDate);
        }
        
        if (endDate) {
            dateFilter.$lte = new Date(endDate);
        }

        // Function to handle pagination for each activity type
        const getPaginatedResults = async (model, matchQuery, lookupStages, projectStage) => {
            // Pipeline for data
            const pipeline = [
                { $match: matchQuery },
                ...lookupStages,
                projectStage,
                { $skip: (page - 1) * pageSize },
                { $limit: Number(pageSize) }
            ];
            
            // Pipeline for count
            const countPipeline = [
                { $match: matchQuery },
                { $count: 'total' }
            ];
            
            const data = await model.aggregate(pipeline);
            const countResult = await model.aggregate(countPipeline);
            const total = countResult.length > 0 ? countResult[0].total : 0;
            
            return {
                data,
                pagination: {
                    total,
                    totalPages: Math.ceil(total / pageSize),
                    currentPage: Number(page),
                    pageSize: Number(pageSize)
                }
            };
        };

        // 1. Get Policy Signatures
        if (!activityType || activityType === 'policies') {
            const policyMatchQuery = {
                ...(customerId && { customer: mongoose.Types.ObjectId(customerId) }),
                ...(policyId && { policy: mongoose.Types.ObjectId(policyId) }),
                ...(Object.keys(dateFilter).length > 0 && { acceptedAt: dateFilter })
            };
            
            const policyLookupStages = [
                {
                    $lookup: {
                        from: 'customers',
                        localField: 'customer',
                        foreignField: '_id',
                        as: 'customerInfo'
                    }
                },
                {
                    $lookup: {
                        from: 'policies',
                        localField: 'policy',
                        foreignField: '_id',
                        as: 'policyInfo'
                    }
                },
                {
                    $lookup: {
                        from: 'userroles',
                        localField: 'customerInfo.role',
                        foreignField: '_id',
                        as: 'roleInfo'
                    }
                },
                {
                    $lookup: {
                        from: 'warehouses',
                        localField: 'customerInfo.warehouse',
                        foreignField: '_id',
                        as: 'warehouseInfo'
                    }
                }
            ];
            
            const policyProjectStage = {
                $project: {
                    _id: 1,
                    customer: {
                        _id: { $arrayElemAt: ['$customerInfo._id', 0] },
                        username: { $arrayElemAt: ['$customerInfo.username', 0] },
                        email: { $arrayElemAt: ['$customerInfo.email', 0] },
                        role: { $arrayElemAt: ['$roleInfo.name', 0] },
                        warehouse: { $arrayElemAt: ['$warehouseInfo.name', 0] }
                    },
                    policy: {
                        _id: { $arrayElemAt: ['$policyInfo._id', 0] },
                        title: { $arrayElemAt: ['$policyInfo.title', 0] },
                        version: { $arrayElemAt: ['$policyInfo.version', 0] }
                    },
                    acceptedAt: 1,
                    policyVersion: 1,
                    ipAddress: 1,
                    userAgent: 1,
                    signatureData: { $cond: [{ $eq: ["$signatureData", null] }, false, true] },
                    signedDocumentPath: { $cond: [{ $eq: ["$signedDocumentPath", null] }, false, true] }
                }
            };
            
            result.policies = await getPaginatedResults(
                PolicyAcceptance, 
                policyMatchQuery, 
                policyLookupStages, 
                policyProjectStage
            );
        }

        // 2. Get Quiz Attempts
        if (!activityType || activityType === 'quizzes') {
            // We need to unwind the attempts array to get individual attempts
            const quizMatchQuery = {};
            
            if (quizId) {
                quizMatchQuery._id = mongoose.Types.ObjectId(quizId);
            }
            
            if (courseId) {
                quizMatchQuery.courseId = mongoose.Types.ObjectId(courseId);
            }
            
            const quizPipeline = [
                { $match: quizMatchQuery },
                { $unwind: '$attempts' },
                {
                    $match: {
                        ...(customerId && { 'attempts.userId': mongoose.Types.ObjectId(customerId) }),
                        ...(Object.keys(dateFilter).length > 0 && { 'attempts.attemptDate': dateFilter })
                    }
                },
                {
                    $lookup: {
                        from: 'customers',
                        localField: 'attempts.userId',
                        foreignField: '_id',
                        as: 'customerInfo'
                    }
                },
                {
                    $lookup: {
                        from: 'courses',
                        localField: 'courseId',
                        foreignField: '_id',
                        as: 'courseInfo'
                    }
                },
                {
                    $lookup: {
                        from: 'userroles',
                        localField: 'customerInfo.role',
                        foreignField: '_id',
                        as: 'roleInfo'
                    }
                },
                {
                    $lookup: {
                        from: 'warehouses',
                        localField: 'customerInfo.warehouse',
                        foreignField: '_id',
                        as: 'warehouseInfo'
                    }
                },
                {
                    $project: {
                        _id: 1,
                        title: 1,
                        customer: {
                            _id: { $arrayElemAt: ['$customerInfo._id', 0] },
                            username: { $arrayElemAt: ['$customerInfo.username', 0] },
                            email: { $arrayElemAt: ['$customerInfo.email', 0] },
                            role: { $arrayElemAt: ['$roleInfo.name', 0] },
                            warehouse: { $arrayElemAt: ['$warehouseInfo.name', 0] }
                        },
                        course: {
                            _id: { $arrayElemAt: ['$courseInfo._id', 0] },
                            name: { $arrayElemAt: ['$courseInfo.name', 0] }
                        },
                        attempt: {
                            startTime: '$attempts.startTime',
                            endTime: '$attempts.endTime',
                            score: '$attempts.score',
                            percentage: '$attempts.percentage',
                            grade: '$attempts.grade',
                            passed: '$attempts.passed',
                            attemptDate: '$attempts.attemptDate',
                            answersCount: { $size: '$attempts.answers' }
                        }
                    }
                },
                { $skip: (page - 1) * pageSize },
                { $limit: Number(pageSize) }
            ];
            
            // Count pipeline
            const quizCountPipeline = [
                { $match: quizMatchQuery },
                { $unwind: '$attempts' },
                {
                    $match: {
                        ...(customerId && { 'attempts.userId': mongoose.Types.ObjectId(customerId) }),
                        ...(Object.keys(dateFilter).length > 0 && { 'attempts.attemptDate': dateFilter })
                    }
                },
                { $count: 'total' }
            ];
            
            const quizData = await Quiz.aggregate(quizPipeline);
            const quizCountResult = await Quiz.aggregate(quizCountPipeline);
            const quizTotal = quizCountResult.length > 0 ? quizCountResult[0].total : 0;
            
            result.quizzes = {
                data: quizData,
                pagination: {
                    total: quizTotal,
                    totalPages: Math.ceil(quizTotal / pageSize),
                    currentPage: Number(page),
                    pageSize: Number(pageSize)
                }
            };
        }

        // 3. Get Course Enrollments and Progress
        if (!activityType || activityType === 'courses') {
            const courseMatchQuery = {};
            
            if (courseId) {
                courseMatchQuery._id = mongoose.Types.ObjectId(courseId);
            }
            
            const coursePipeline = [
                { $match: courseMatchQuery },
                { $unwind: '$enrolledUsers' },
                {
                    $match: {
                        ...(customerId && { 'enrolledUsers.user': mongoose.Types.ObjectId(customerId) }),
                        ...(Object.keys(dateFilter).length > 0 && { 'enrolledUsers.enrollmentDate': dateFilter })
                    }
                },
                {
                    $lookup: {
                        from: 'customers',
                        localField: 'enrolledUsers.user',
                        foreignField: '_id',
                        as: 'customerInfo'
                    }
                },
                {
                    $lookup: {
                        from: 'userroles',
                        localField: 'customerInfo.role',
                        foreignField: '_id',
                        as: 'roleInfo'
                    }
                },
                {
                    $lookup: {
                        from: 'warehouses',
                        localField: 'customerInfo.warehouse',
                        foreignField: '_id',
                        as: 'warehouseInfo'
                    }
                },
                {
                    $project: {
                        _id: 1,
                        name: 1,
                        description: 1,
                        level: 1,
                        courseType: 1,
                        customer: {
                            _id: { $arrayElemAt: ['$customerInfo._id', 0] },
                            username: { $arrayElemAt: ['$customerInfo.username', 0] },
                            email: { $arrayElemAt: ['$customerInfo.email', 0] },
                            role: { $arrayElemAt: ['$roleInfo.name', 0] },
                            warehouse: { $arrayElemAt: ['$warehouseInfo.name', 0] }
                        },
                        enrollment: {
                            enrollmentDate: '$enrolledUsers.enrollmentDate',
                            progress: '$enrolledUsers.progress',
                            currentChapter: '$enrolledUsers.currentChapter',
                            currentSection: '$enrolledUsers.currentSection',
                            overallGrade: '$enrolledUsers.overallGrade',
                            gradePercentage: '$enrolledUsers.gradePercentage',
                            gradeLabel: '$enrolledUsers.gradeLabel',
                            certificateEarned: '$enrolledUsers.certificateEarned',
                            certificateUrl: '$enrolledUsers.certificateUrl',
                            status: '$status'
                        }
                    }
                },
                { $skip: (page - 1) * pageSize },
                { $limit: Number(pageSize) }
            ];
            
            // Count pipeline
            const courseCountPipeline = [
                { $match: courseMatchQuery },
                { $unwind: '$enrolledUsers' },
                {
                    $match: {
                        ...(customerId && { 'enrolledUsers.user': mongoose.Types.ObjectId(customerId) }),
                        ...(Object.keys(dateFilter).length > 0 && { 'enrolledUsers.enrollmentDate': dateFilter })
                    }
                },
                { $count: 'total' }
            ];
            
            const courseData = await Course.aggregate(coursePipeline);
            const courseCountResult = await Course.aggregate(courseCountPipeline);
            const courseTotal = courseCountResult.length > 0 ? courseCountResult[0].total : 0;
            
            result.courses = {
                data: courseData,
                pagination: {
                    total: courseTotal,
                    totalPages: Math.ceil(courseTotal / pageSize),
                    currentPage: Number(page),
                    pageSize: Number(pageSize)
                }
            };
        }

        res.status(200).json({
            success: true,
            result
        });
    } catch (error) {
        console.error('Error getting customer activities:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting customer activities',
            error: error.message
        });
    }
};

// new
// get Summary statistics for admin dasboard:
const getActivitySummary = async (req, res) => {
    try {
        const summary = {};
        
        // Get policy acceptance stats
        const policyStats = await PolicyAcceptance.aggregate([
            {
                $group: {
                    _id: null,
                    totalAcceptances: { $sum: 1 },
                    uniqueCustomers: { $addToSet: '$customer' },
                    uniquePolicies: { $addToSet: '$policy' }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalAcceptances: 1,
                    uniqueCustomersCount: { $size: '$uniqueCustomers' },
                    uniquePoliciesCount: { $size: '$uniquePolicies' }
                }
            }
        ]);
        
        summary.policies = policyStats.length > 0 ? policyStats[0] : {
            totalAcceptances: 0,
            uniqueCustomersCount: 0,
            uniquePoliciesCount: 0
        };
        
        // Get quiz attempt stats
        const quizStats = await Quiz.aggregate([
            { $unwind: '$attempts' },
            {
                $group: {
                    _id: null,
                    totalAttempts: { $sum: 1 },
                    uniqueCustomers: { $addToSet: '$attempts.userId' },
                    uniqueQuizzes: { $addToSet: '$_id' },
                    passedAttempts: { 
                        $sum: { $cond: [{ $eq: ['$attempts.passed', true] }, 1, 0] }
                    },
                    failedAttempts: { 
                        $sum: { $cond: [{ $eq: ['$attempts.passed', false] }, 1, 0]}
                    },
                    avgScore: { $avg: '$attempts.percentage' }
                }
            
            },
            {
                $project: {
                    _id: 0,
                    totalAttempts: 1,
                    uniqueCustomersCount: { $size: '$uniqueCustomers' },
                    uniqueQuizzesCount: { $size: '$uniqueQuizzes' },
                    passedAttempts: 1,
                    failedAttempts: 1,
                    passRate: { 
                        $multiply: [
                            { $divide: ['$passedAttempts', '$totalAttempts'] },
                            100
                        ]
                    },
                    avgScore: 1
                }
            }
        ]);
        
        summary.quizzes = quizStats.length > 0 ? quizStats[0] : {
            totalAttempts: 0,
            uniqueCustomersCount: 0,
            uniqueQuizzesCount: 0,
            passedAttempts: 0,
            failedAttempts: 0,
            passRate: 0,
            avgScore: 0
        };
        
        // Get course enrollment stats
        const courseStats = await Course.aggregate([
            { $unwind: '$enrolledUsers' },
            {
                $group: {
                    _id: null,
                    totalEnrollments: { $sum: 1 },
                    uniqueCustomers: { $addToSet: '$enrolledUsers.user' },
                    uniqueCourses: { $addToSet: '$_id' },
                    completedEnrollments: { 
                        $sum: { $cond: [{ $eq: ['$enrolledUsers.progress', 100] }, 1, 0] }
                    },
                    certificatesEarned: { 
                        $sum: { $cond: [{ $eq: ['$enrolledUsers.certificateEarned', true] }, 1, 0] }
                    },
                    avgProgress: { $avg: '$enrolledUsers.progress' },
                    avgGrade: { $avg: '$enrolledUsers.gradePercentage' }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalEnrollments: 1,
                    uniqueCustomersCount: { $size: '$uniqueCustomers' },
                    uniqueCoursesCount: { $size: '$uniqueCourses' },
                    completedEnrollments: 1,
                    completionRate: { 
                        $multiply: [
                            { $divide: ['$completedEnrollments', '$totalEnrollments'] },
                            100
                        ]
                    },
                    certificatesEarned: 1,
                    avgProgress: 1,
                    avgGrade: 1
                }
            }
        ]);
        
        summary.courses = courseStats.length > 0 ? courseStats[0] : {
            totalEnrollments: 0,
            uniqueCustomersCount: 0,
            uniqueCoursesCount: 0,
            completedEnrollments: 0,
            completionRate: 0,
            certificatesEarned: 0,
            avgProgress: 0,
            avgGrade: 0
        };
        
        // Get recent activity (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        // Recent policy acceptances
        const recentPolicyAcceptances = await PolicyAcceptance.countDocuments({
            acceptedAt: { $gte: sevenDaysAgo }
        });
        
        // Recent quiz attempts
        const recentQuizAttempts = await Quiz.aggregate([
            { $unwind: '$attempts' },
            { 
                $match: { 
                    'attempts.attemptDate': { $gte: sevenDaysAgo } 
                } 
            },
            { $count: 'count' }
        ]);
        
        // Recent course enrollments
        const recentCourseEnrollments = await Course.aggregate([
            { $unwind: '$enrolledUsers' },
            { 
                $match: { 
                    'enrolledUsers.enrollmentDate': { $gte: sevenDaysAgo } 
                } 
            },
            { $count: 'count' }
        ]);
        
        summary.recentActivity = {
            policyAcceptances: recentPolicyAcceptances,
            quizAttempts: recentQuizAttempts.length > 0 ? recentQuizAttempts[0].count : 0,
            courseEnrollments: recentCourseEnrollments.length > 0 ? recentCourseEnrollments[0].count : 0
        };
        
        res.status(200).json({
            success: true,
            summary
        });
    } catch (error) { console.error('Error getting activity summary:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting activity summary',
            error: error.message
        });
    }
};

// new
// Get customer activity breakdown by role and warehouse
const getCustomerBreakdown = async (req, res) => {
    try {
        const result = {};
        
        // Get breakdown by role
        const roleBreakdown = await Customer.aggregate([
            {
                $lookup: {
                    from: 'userroles',
                    localField: 'role',
                    foreignField: '_id',
                    as: 'roleInfo'
                }
            },
            {
                $group: {
                    _id: '$role',
                    roleName: { $first: { $arrayElemAt: ['$roleInfo.name', 0] } },
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    roleId: '$_id',
                    roleName: 1,
                    count: 1
                }
            },
            { $sort: { count: -1 } }
        ]);
        
        result.byRole = roleBreakdown;
        
        // Get breakdown by warehouse
        const warehouseBreakdown = await Customer.aggregate([
            {
                $lookup: {
                    from: 'warehouses',
                    localField: 'warehouse',
                    foreignField: '_id',
                    as: 'warehouseInfo'
                }
            },
            {
                $group: {
                    _id: '$warehouse',
                    warehouseName: { $first: { $arrayElemAt: ['$warehouseInfo.name', 0] } },
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    warehouseId: '$_id',
                    warehouseName: 1,
                    count: 1
                }
            },
            { $sort: { count: -1 } }
        ]);
        
        result.byWarehouse = warehouseBreakdown;
        
        // Get policy acceptance by role
        const policyByRole = await PolicyAcceptance.aggregate([
            {
                $lookup: {
                    from: 'customers',
                    localField: 'customer',
                    foreignField: '_id',
                    as: 'customerInfo'
                }
            },
            {
                $lookup: {
                    from: 'userroles',
                    localField: 'customerInfo.role',
                    foreignField: '_id',
                    as: 'roleInfo'
                }
            },
            {
                $group: {
                    _id: { $arrayElemAt: ['$customerInfo.role', 0] },
                    roleName: { $first: { $arrayElemAt: ['$roleInfo.name', 0] } },
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    roleId: '$_id',
                    roleName: 1,
                    count: 1
                }
            },
            { $sort: { count: -1 } }
        ]);
        
        result.policyAcceptanceByRole = policyByRole;
        
        // Get policy acceptance by warehouse
        const policyByWarehouse = await PolicyAcceptance.aggregate([
            {
                $lookup: {
                    from: 'customers',
                    localField: 'customer',
                    foreignField: '_id',
                    as: 'customerInfo'
                }
            },
            {
                $lookup: {
                    from: 'warehouses',
                    localField: 'customerInfo.warehouse',
                    foreignField: '_id',
                    as: 'warehouseInfo'
                }
            },
            {
                $group: {
                    _id: { $arrayElemAt: ['$customerInfo.warehouse', 0] },
                    warehouseName: { $first: { $arrayElemAt: ['$warehouseInfo.name', 0] } },
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    warehouseId: '$_id',
                    warehouseName: 1,
                    count: 1
                }
            },
            { $sort: { count: -1 } }
        ]);
        
        result.policyAcceptanceByWarehouse = policyByWarehouse;
        
        res.status(200).json({
            success: true,
            result
        });
    } catch (error) {
        console.error('Error getting customer breakdown:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting customer breakdown',
            error: error.message
        });
    }
};




const getDetailedCartData = async (req, res) => {
    try {
        const detailedCarts = await Cart.find({ 
            total: { $gt: 0 },
            customer: { $exists: true, $ne: null }
        })
        .populate({
            path: 'customer',
            select: 'username email phone_number'
        })
        .populate([
            {
                path: 'items',
                populate: {
                    path: 'item',
                    model: 'Product',
                    select: 'name sku image prices gallery description brand category',
                    populate: [
                        { path: 'brand', select: 'name' },
                        { path: 'category', select: 'name' }
                    ]
                }
            },
            {
                path: 'items',
                populate: {
                    path: 'item',
                    model: 'SpecialProduct',
                    select: 'name sku image prices gallery description specialCategory',
                    populate: {
                        path: 'specialCategory',
                        select: 'name'
                    }
                }
            }
        ]);

        res.status(200).json(detailedCarts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};



module.exports = {
    getCartAnalytics,
    getDetailedCartData,
    getTopPerformingCustomers,
    getCustomerActivities,
    getCustomerBreakdown,
    getActivitySummary
};
