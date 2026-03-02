const mongoose = require('mongoose')

const specialOrderReceiverSchema  = new mongoose.Schema({

    userId:{
        type: mongoose.Schema.Types.ObjectId,
        ref : 'User',
        required: true,
        unique : true,
    },
    isActive:{
        type:Boolean,
        default : true,
        index : true,
    },


},
{timestamps:true}
);

module.exports = mongoose.model('SpeacialOrderReceiver', specialOrderReceiverSchema );