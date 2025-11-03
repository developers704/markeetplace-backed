const mongoose = require('mongoose');
const cron = require('node-cron');


const adminLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    action: {
        type: String,
        enum: ['CREATE', 'UPDATE', 'DELETE'],
        required: true
    },
    resourceType: {
        type: String,
        required: true
    },
    details: {
        type: Object
    }
}, {
    timestamps: true
});



// Cron job to clear logs every 12 hours
cron.schedule('0 */12 * * *', async () => {
    try {
        const twelvehours = new Date(Date.now() - 12 * 60 * 60 * 1000);
        await mongoose.model('AdminLog').deleteMany({
            createdAt: { $lt: twelvehours }
        });
        console.log('AdminLogs cleared successfully');
    } catch (error) {
        console.error('Error clearing AdminLogs:', error);
    }
});

module.exports = mongoose.model('AdminLog', adminLogSchema);
