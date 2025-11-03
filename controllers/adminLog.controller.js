const AdminLog = require('../models/adminLog.model');

const getLogs = async (req, res) => {
    try {
        const { page = 1, limit = 10, resourceType, action, userId, startDate, endDate } = req.query;
        
        const query = {};
        if (resourceType) query.resourceType = resourceType;
        if (action) query.action = action;
        if (userId) query.userId = userId;
        if (startDate && endDate) {
            query.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const logs = await AdminLog.find(query)
            .populate('userId', 'username email phone_number')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const count = await AdminLog.countDocuments(query);

        res.json({
            logs,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalRecords: count
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const bulkDeleteLogs = async (req, res) => {
    try {
        const { ids } = req.body;

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: 'Please provide an array of log IDs to delete' });
        }

        const result = await AdminLog.deleteMany({ _id: { $in: ids } });

        res.json({ 
            message: `Successfully deleted ${result.deletedCount} logs`,
            deletedCount: result.deletedCount 
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


module.exports = { getLogs, bulkDeleteLogs };
