
const mongoose = require('mongoose');
const specialOrderReceiverModel = require('../models/specialOrderReceiver.model');


const isObjectId = (v) => mongoose.isValidObjectId(String(v || '').trim()) 

const listRecivers = async (req , res) => {

    try {
        const receviers = await specialOrderReceiverModel.find()
        .populate('userId' , 'username email')
        .sort({createAt : -1})
        .lean();

        return res.json({ success :true , data : receviers})

    } catch (err) {
        return res.status(500).json({ success : false , message : err.message})
        
    }

};


const setReceiver = async (req , res) => {
    
    try {
        const {userIds} = req.body;
        if (!Array.isArray(userIds) || userIds.length === 0){
            return res.status(400).json({success : false, message : 'usersIds array required'});
        }
        const normalizedIds = userIds.map((u) => {
            if (typeof u === 'string') return u;
            if (u?._id) return u._id;
            if (u?.value) return u.value;
            return null

        })
        .filter((id) => mongoose.isValidObjectId(id));
        if (normalizedIds.length === 0){
            return res.status(400).json({
                success : false ,
                message : 'No valid user IDs provided'
            })
        } 

        
        await specialOrderReceiverModel.deleteMany({});

        const docs = normalizedIds.map((id) => ({ 
            userId: id ,
            isActive: true,
        }));
        console.log('user id doc', docs)
        
        await specialOrderReceiverModel.insertMany(docs)
        

        return res.json({
            success : true,
            message: 'Speacial Order receivers Update'
        })

    } catch (err) {
        return res.status(500).json({success : false , message : err.message })

    }
}

const toggleReceiver = async ( req , res ) => {
    try {
        const {id} = req.params
        const rec = await specialOrderReceiverModel.findById(id);
        if(!rec) return res.status(400).json({success : false , message : 'reciver not found'});

        rec.isActive = !rec.isActive;
        await rec.save();

        return res.json({
            success : true,
            message : 'receiver status update',
            data : rec
        })

    } catch (err) {
        res.status(500).json({success:false , message : err.message})
    }
}

/**
 * DELETE /api/spo-users/:id
 * Remove a single receiver from special order email list
 */
const deleteReceiver = async (req, res) => {
    try {
        const { id } = req.params;
        if (!isObjectId(id)) {
            return res.status(400).json({ success: false, message: 'Invalid receiver ID' });
        }
        const rec = await specialOrderReceiverModel.findByIdAndDelete(id);
        if (!rec) {
            return res.status(404).json({ success: false, message: 'Receiver not found' });
        }
        return res.json({
            success: true,
            message: 'Receiver removed successfully',
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

module.exports ={
    listRecivers,
    setReceiver,
    toggleReceiver,
    deleteReceiver,
}