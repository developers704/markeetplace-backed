const Policy = require('../models/policy.model');
const PolicyAcceptance = require('../models/policyAcceptance.model');
const Customer = require('../models/customer.model');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

//  create a new policy:
const createPolicy = async (req, res) => {
    try {
        const { 
            title, 
            content, 
            version, 
            isActive, 
            showFirst,
            sequence,
            applicableRoles, 
            applicableWarehouses 
        } = req.body;

        // Get uploaded image path
        const picturePath = req.file ? req.file.path : null;

        const existingSequenceAlreadyExists = await Policy.findOne({ sequence });
        if (existingSequenceAlreadyExists) {
            return res.status(400).json({ message: `Sequence ${sequence} already exists` });
        }

        // Create new policy
        const policy = new Policy({
            title,
            content,
            version: version ? Number(version) : 1,
            picture: picturePath,
            isActive: isActive !== undefined ? isActive : true,
            showFirst: showFirst || false,
            sequence: sequence || 0,
            applicableRoles,
            applicableWarehouses
        });

        // If this policy is set as active, deactivate other policies with the same title
        if (isActive) {
            await Policy.updateMany(
                { title: title, _id: { $ne: policy._id } },
                { $set: { isActive: false } }
            );
        }

        // If showFirst is true, set other policies' showFirst to false for same roles/warehouses
        if (showFirst) {
            const query = {
                _id: { $ne: policy._id },
                showFirst: true,
                $or: []
            };

            if (applicableRoles && applicableRoles.length > 0) {
                query.$or.push({ applicableRoles: { $in: applicableRoles } });
            }
            if (applicableWarehouses && applicableWarehouses.length > 0) {
                query.$or.push({ applicableWarehouses: { $in: applicableWarehouses } });
            }

            if (query.$or.length > 0) {
                await Policy.updateMany(query, { $set: { showFirst: false } });
            }
        }

        await policy.save();
        res.status(201).json({ 
            message: 'Policy created successfully', 
            policy 
        });
    } catch (error) {
        // Delete uploaded file if policy creation fails
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        res.status(400).json({ message: error.message });
    }
};



const getUserPolicies = async (req, res) => {
    try {
         const { customerId } = req.params;
        const { roleId, warehouseId } = req.query;
        
        if (!roleId && !warehouseId) {
            return res.status(400).json({ message: 'Either roleId or warehouseId is required in query params' });
        }
        
        // Build filter for applicable policies
        const filter = {
            isActive: true,
            $or: []
        };
        
        if (roleId) {
            filter.$or.push({ applicableRoles: roleId });
        }
        if (warehouseId) {
            filter.$or.push({ applicableWarehouses: warehouseId });
        }
        
        // Get all applicable policies
        const policies = await Policy.find(filter)
            .populate('applicableRoles', 'role_name')
            .populate('applicableWarehouses', 'name location')
            .sort({ showFirst: -1, sequence: 1, createdAt: -1 });
        
        // Get valid policy acceptances for this customer
        const acceptances = await PolicyAcceptance.find({
            customer: customerId,
            policy: { $ne: null } // Only get acceptances where policy exists
        }).populate('policy', '_id');
        
        // Create a map of accepted policies for quick lookup
        const acceptanceMap = new Map();
        acceptances.forEach(acceptance => {
            // Add null check before accessing policy._id
            if (acceptance.policy && acceptance.policy._id) {
                acceptanceMap.set(acceptance.policy._id.toString(), acceptance);
            }
        });
        
        // Add sign status to each policy
        const policiesWithSignStatus = policies.map(policy => {
            const acceptance = acceptanceMap.get(policy._id.toString());
            
            return {
                ...policy.toObject(),
                isSigned: !!acceptance,
                signedAt: acceptance ? acceptance.acceptedAt : null,
                signatureData: acceptance ? acceptance.signatureData : null,
                signedDocumentPath: acceptance ? acceptance.signedDocumentPath : null,
                ipAddress: acceptance ? acceptance.ipAddress : null,
                userAgent: acceptance ? acceptance.userAgent : null,
                policyVersion: acceptance ? acceptance.policyVersion : null,
                acceptanceId: acceptance ? acceptance._id : null
            };
        });
        
        // Separate signed and unsigned policies
        const signedPolicies = policiesWithSignStatus.filter(p => p.isSigned);
        const unsignedPolicies = policiesWithSignStatus.filter(p => !p.isSigned);
        
        res.status(200).json({
            success: true,
            data: {
                allPolicies: policiesWithSignStatus,
                signedPolicies: signedPolicies,
                unsignedPolicies: unsignedPolicies,
                statistics: {
                    totalPolicies: policiesWithSignStatus.length,
                    signedCount: signedPolicies.length,
                    unsignedCount: unsignedPolicies.length,
                    completionPercentage: policiesWithSignStatus.length > 0 
                        ? Math.round((signedPolicies.length / policiesWithSignStatus.length) * 100) 
                        : 0
                }
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            message: error.message 
        });
    }
};

//  get all policies:
const getPolicies = async (req, res) => {
    try {
        const { 
            isActive, 
            title, 
            version, 
            roleId, 
            warehouseId 
        } = req.query;
        
        const filter = {};
        
        // Apply filters if provided
        if (isActive !== undefined) {
            filter.isActive = isActive === 'true';
        }
        
        if (title) {
            filter.title = { $regex: title, $options: 'i' };
        }
        
        if (version) {
            filter.version = version;
        }
        
        if (roleId) {
            filter.applicableRoles = mongoose.Types.ObjectId(roleId);
        }
        
        if (warehouseId) {
            filter.applicableWarehouses = mongoose.Types.ObjectId(warehouseId);
        }
        
        const policies = await Policy.find(filter)
            .populate('applicableRoles', 'role_name')
            .populate('applicableWarehouses', 'name location')
            .sort({ showFirst: -1, sequence: 1, createdAt: -1 }); // Sort by priority
            
        res.status(200).json({ policies });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

//  get a single policy by ID:
const getPolicyById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const policy = await Policy.findById(id)
            .populate('applicableRoles', 'role_name')
            .populate('applicableWarehouses', 'name location');
            
        if (!policy) {
            return res.status(404).json({ message: 'Policy not found' });
        }
        
        res.status(200).json({ policy });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

//  update a policy by ID:
const updatePolicy = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            title, 
            content, 
            version, 
            isActive, 
            showFirst,
            sequence,
            applicableRoles, 
            applicableWarehouses 
        } = req.body;
        
        const policy = await Policy.findById(id);
        if (!policy) {
            return res.status(404).json({ message: 'Policy not found' });
        }
        
        const existingSequenceAlreadyExists = await Policy.findOne({ sequence, _id: { $ne: id } });
        if (existingSequenceAlreadyExists) {
            return res.status(400).json({ message: 'Sequence already exists for another policy' });
        }

        // Handle image upload
        if (req.file) {
            // Delete old image if new image is uploaded
            if (oldImagePath) {
                fs.unlink(oldImagePath, (err) => {
                    if (err) {
                        console.error('Error deleting old image:', err);
                    }
                });
            }

            // Store new image path
            policy.picture = req.file.path;
        }

        // Store old image path and old content/version for comparison
        const oldImagePath = policy.picture;
        const oldContent = policy.content;
        const oldVersion = policy.version;
        
        // Update fields if provided
        if (title !== undefined) policy.title = title;
        if (content !== undefined) policy.content = content;
        // If admin provided explicit version, use it, else if content changed bump version
        if (version !== undefined) {
            policy.version = Number(version);
        } else if (content !== undefined && content !== oldContent) {
            policy.version = (policy.version || 1) + 1;
        }
        if (isActive !== undefined) policy.isActive = isActive;
        if (showFirst !== undefined) policy.showFirst = showFirst;
        if (sequence !== undefined) policy.sequence = sequence;
        if (applicableRoles !== undefined) policy.applicableRoles = applicableRoles;
        if (applicableWarehouses !== undefined) policy.applicableWarehouses = applicableWarehouses;
        
        // Update image if new one is uploaded
        if (req.file) {
            policy.picture = req.file.path;
            
            // Delete old image if it exists
            if (oldImagePath && fs.existsSync(oldImagePath)) {
                fs.unlinkSync(oldImagePath);
            }
        }
        
        policy.updatedAt = Date.now();
        
        // If this policy is set as active, deactivate other policies with the same title
        if (isActive) {
            await Policy.updateMany(
                { title: policy.title, _id: { $ne: policy._id } },
                { $set: { isActive: false } }
            );
        }

        // If showFirst is true, set other policies' showFirst to false for same roles/warehouses
        if (showFirst) {
            const query = {
                _id: { $ne: policy._id },
                showFirst: true,
                $or: []
            };

            if (policy.applicableRoles && policy.applicableRoles.length > 0) {
                query.$or.push({ applicableRoles: { $in: policy.applicableRoles } });
            }
            if (policy.applicableWarehouses && policy.applicableWarehouses.length > 0) {
                query.$or.push({ applicableWarehouses: { $in: policy.applicableWarehouses } });
            }

            if (query.$or.length > 0) {
                await Policy.updateMany(query, { $set: { showFirst: false } });
            }
        }
        
        await policy.save();
        try {
            const { sendPolicyUpdateNotifications } = require('../helpers/notificationHelper');
            const notificationResult = await sendPolicyUpdateNotifications(policy);
            console.log('📧 Policy update notifications result:', notificationResult);
        } catch (notificationError) {
            console.error('❌ Error sending policy update notifications:', notificationError);
            // Don't fail the entire update if notifications fail
        }
        res.status(200).json({ 
            message: 'Policy updated and email send successfully', 
            policy 
        });
    } catch (error) {
        // Delete uploaded file if update fails
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        res.status(400).json({ message: error.message });
    }
};

// Delete a policy
// Bulk Delete policies
const bulkDeletePolicies = async (req, res) => {
    try {
        const { policyIds } = req.body;
        
        if (!policyIds || !Array.isArray(policyIds) || policyIds.length === 0) {
            return res.status(400).json({ message: 'policyIds array is required and cannot be empty' });
        }
        
        // Find policies to get their image paths before deletion
        const policies = await Policy.find({ _id: { $in: policyIds } });
        
        if (policies.length === 0) {
            return res.status(404).json({ message: 'No policies found with provided IDs' });
        }
        
        // Delete associated image files
        policies.forEach(policy => {
            if (policy.picture && fs.existsSync(policy.picture)) {
                try {
                    fs.unlinkSync(policy.picture);
                } catch (error) {
                    console.error(`Failed to delete image: ${policy.picture}`, error);
                }
            }
        });
        
        // Delete policies from database
        const deleteResult = await Policy.deleteMany({ _id: { $in: policyIds } });
        
        res.status(200).json({ 
            message: `${deleteResult.deletedCount} policies deleted successfully`,
            deletedCount: deleteResult.deletedCount,
            requestedCount: policyIds.length
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// Get policies for user login (role and warehouse specific with priority)
const getApplicablePolicies = async (req, res) => {
    try {
        const { roleId, warehouseId } = req.params;
        
        const filter = {
            isActive: true,
            $or: [
                { applicableRoles: roleId },
                { applicableWarehouses: warehouseId }
            ]
        };
        
        const policies = await Policy.find(filter)
            .populate('applicableRoles', 'role_name')
            .populate('applicableWarehouses', 'name location')
            .sort({ showFirst: -1, sequence: 1, createdAt: -1 }); // Priority order
            
        res.status(200).json({ policies });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get first priority policy for user login
const getFirstPriorityPolicy = async (req, res) => {
    try {
        const { roleId, warehouseId } = req.params;
        const { customerId } = req.query; // Customer ID from query params
        
        if (!customerId) {
            return res.status(400).json({ message: 'customerId is required in query params' });
        }
        
        const filter = {
            isActive: true,
            showFirst: true,
            $or: [
                { applicableRoles: roleId },
                { applicableWarehouses: warehouseId }
            ]
        };
        
        const policy = await Policy.findOne(filter)
            .populate('applicableRoles', 'role_name')
            .populate('applicableWarehouses', 'name location');
            
        if (!policy) {
            return res.status(404).json({ message: 'No priority policy found' });
        }
        
        // Check if policy is signed by the customer
        const acceptance = await PolicyAcceptance.findOne({
            customer: customerId,
            policy: policy._id
        });
        
        const policyWithSignStatus = {
            ...policy.toObject(),
            isSigned: !!acceptance,
            signedAt: acceptance ? acceptance.acceptedAt : null,
            signatureData: acceptance ? acceptance.signatureData : null
        };
        
        res.status(200).json({ policy: policyWithSignStatus });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};



const getPendingPolicies = async (req, res) => {
  try {
    const warehouseId = req.user.selectedWarehouse || null;
    const userId = req.user?._id || req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const user = await Customer.findById(userId).lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    const roleId = user.role?._id || null;

    // Fetch active policies
    const policies = await Policy.find({ isActive: true }).sort({ showFirst: -1, sequence: 1, createdAt: -1 }).lean();

    // Fetch all acceptances for this user
    const acceptances = await PolicyAcceptance.find({ customer: userId }).lean();
    const acceptedMap = new Map();
    acceptances.forEach(a => {
      if (a.policy && mongoose.Types.ObjectId.isValid(a.policy)) {
        acceptedMap.set(a.policy.toString(), a);
      }
    });

    const pending = [];

    for (const p of policies) {
      if (!mongoose.Types.ObjectId.isValid(p._id)) continue;

      // Role filter
      if (p.applicableRoles?.length && roleId && !p.applicableRoles.map(String).includes(String(roleId))) continue;

      // Warehouse filter
      if (p.applicableWarehouses?.length && warehouseId && !p.applicableWarehouses.map(String).includes(String(warehouseId))) continue;

      // Forced check
      const forced = Array.isArray(p.forceForUsers) && p.forceForUsers.some(f => mongoose.Types.ObjectId.isValid(f.user) && String(f.user) === String(userId));

      const acc = acceptedMap.get(String(p._id));

      if (!acc) {
        pending.push({ ...p, reason: forced ? 'forced' : 'not_signed' });
        continue;
      }

      // Check version
      if ((acc.policyVersion || '0') < (p.version || '0')) {
        pending.push({ ...p, reason: 'new_version' });
        continue;
      }

      if (forced) {
        pending.push({ ...p, reason: 'forced' });
      }
    }
    return res.json({ pending });

  } catch (error) {
    console.error('getPendingPolicies error:', error);
    return res.status(500).json({ message: error.message });
  }
};



// POST /api/policies/force/:userId
const forcePolicyForUser = async (req, res) => {
    try {
        const policyId = req.body.policyId;
        const { userId } = req.params;
        if (!policyId || !userId) return res.status(400).json({ message: 'policyId and userId required' });

        // add to policy.forceForUsers

        const policy = await Policy.findById(policyId);
        if (!policy) {
            return res.status(404).json({ message: 'Policy not found' });
        }

        const alreadyForced = policy.forceForUsers.some(f => String(f.user) === String(userId));
        if (alreadyForced) {
            return res.status(400).json({ message: 'Policy already forced for this user' });
        }
           policy.forceForUsers.push({
           user: userId,
           forcedAt: new Date()
          });

        await policy.save();
        
        // const updated = await Policy.findByIdAndUpdate(policyId, { $addToSet: { forceForUsers: { user: userId, forcedAt: new Date() } } }, { new: true });

        // mark customer's policyAccepted entry as forced = true (so UI can show forced reason)
        const customer = await Customer.findById(userId);
        if (customer) {
            const idx = (customer.policyAccepted || []).findIndex(pa => String(pa.policy) === String(policyId));
            if (idx >= 0) {
                customer.policyAccepted[idx].forced = true;
                await customer.save();
            }
        }

        res.json({ success: true, message: 'Policy forced for user', policy });
    } catch (error) {
        console.error('forcePolicyForUser error:', error);
        res.status(500).json({ message: error.message });
    }
}

// Admin: Assign a policy to specific user(s)
// POST /api/policies/:id/assign
const assignPolicyToUser = async (req, res) => {
    try {
        const { id: policyId } = req.params;
        const { userIds } = req.body; // array of user IDs
        if (!policyId || !userIds || !Array.isArray(userIds)) {
            return res.status(400).json({ message: 'policyId and userIds array required' });
        }

        const policy = await Policy.findById(policyId);
        if (!policy) {
            return res.status(404).json({ message: 'Policy not found' });
        }

        // Assign to each user
        for (const userId of userIds) {
            const customer = await Customer.findById(userId);
            if (!customer) continue;

            // Add to policyAccepted if not already assigned
            const idx = (customer.policyAccepted || []).findIndex(pa => String(pa.policy) === String(policyId));
            if (idx < 0) {
                // New assignment
                customer.policyAccepted = customer.policyAccepted || [];
                customer.policyAccepted.push({
                    policy: policyId,
                    agreedVersion: -1, // Mark as not accepted yet
                    agreedAt: null,
                    forced: false,
                    assigned: true
                });
                await customer.save();
            }
        }

        res.json({ success: true, message: `Policy assigned to ${userIds.length} users` });
    } catch (error) {
        console.error('assignPolicyToUser error:', error);
        res.status(500).json({ message: error.message });
    }
}

// GET /api/policies/assignments/:userId
const getPolicyAssignments = async (req, res) => {
    try {
        const { userId } = req.params;
        const customer = await Customer.findById(userId).lean();
        if (!customer) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Get all policies assigned to this user (those with assigned = true)
        const assignmentIds = (customer.policyAccepted || [])
            .filter(pa => pa.assigned === true)
            .map(pa => pa.policy);

        const assignedPolicies = await Policy.find({ _id: { $in: assignmentIds }, isActive: true })
            .sort({ showFirst: -1, sequence: 1 })
            .lean();

        res.json({ assigned: assignedPolicies });
    } catch (error) {
        console.error('getPolicyAssignments error:', error);
        res.status(500).json({ message: error.message });
    }
}

module.exports = {
    createPolicy,
    getPolicies,
    getPolicyById,
    updatePolicy,
    bulkDeletePolicies,
    getApplicablePolicies,
    getFirstPriorityPolicy,
    getUserPolicies,
    getPendingPolicies,
    forcePolicyForUser,
    assignPolicyToUser,
    getPolicyAssignments
};
