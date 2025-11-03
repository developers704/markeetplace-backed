const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
    Create: { type: Boolean, required: true, default: false },
    View: { type: Boolean, required: true, default: false },
    Update: { type: Boolean, required: true, default: false },
    Delete: { type: Boolean, required: true, default: false }
}, { _id: false }); // This does not create a separate collection; it defines the structure of a nested document.

const userRoleSchema = new mongoose.Schema({
    role_name: {
        type: String,
        required: true,
        maxlength: 50,
        trim: true,
        unique: true // Make role_name unique
    },
    permissions: {
        type: Map,
        of: permissionSchema, // Using the defined sub-schema
        required: true
    }
}, {
    timestamps: true
});

const UserRole = mongoose.model('UserRole', userRoleSchema);

module.exports = UserRole;
