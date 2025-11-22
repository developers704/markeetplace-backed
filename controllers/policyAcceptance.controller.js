const PolicyAcceptance = require('../models/policyAcceptance.model.js');
const Policy = require('../models/policy.model.js');
const Customer = require('../models/customer.model.js');
const path = require('path');
const fs = require('fs');
const { saveFileToDisk }  = require('../config/policyMulter.js');


const acceptPolicy = async (req, res) => {
    try {
        const customerId = req.user.id;
        const { policyId, signatureData } = req.body;
        
        // Check if file was uploaded
        if (!req.file) {
            return res.status(400).json({ message: 'Signed document image is required' });
        }
        
        // Get client IP and user agent
        let ipAddress = req.headers['x-forwarded-for'] || 
                        req.headers['x-real-ip'] || 
                        req.connection.remoteAddress || 
                        req.socket.remoteAddress;
        
        // Clean the IP address
        if (ipAddress) {
            // Handle comma-separated IPs (from proxies)
            ipAddress = ipAddress.split(',')[0].trim();
            
            // Remove IPv6 prefix if present
            ipAddress = ipAddress.replace(/^::ffff:/, '');
            
            // Handle localhost case
            if (ipAddress === '::1' || ipAddress === 'localhost' || ipAddress === '127.0.0.1') {
                // Try to get the local network IP
                try {
                    const networkInterfaces = require('os').networkInterfaces();
                    const localIP = Object.values(networkInterfaces)
                        .flat()
                        .find(details => 
                            details.family === 'IPv4' && 
                            !details.internal && 
                            (details.address.startsWith('192.168.') || 
                             details.address.startsWith('10.') || 
                             details.address.startsWith('172.'))
                        );
                    
                    if (localIP) {
                        ipAddress = localIP.address;
                    }
                } catch (error) {
                    console.error('Error getting local IP:', error);
                    // Keep the original IP if there's an error
                }
            }
        }
        
        const userAgent = req.headers['user-agent'] || 'Unknown';
        
        // Verify the policy exists
        const policy = await Policy.findById(policyId);
        if (!policy) {
            return res.status(404).json({ message: 'Policy not found' });
        }
        
        // Verify the customer exists
        const customer = await Customer.findById(customerId);
        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }
        
        // Check if this policy applies to this customer
        const isApplicable = policy.applicableRoles.some(role => role.equals(customer.role)) || 
                            policy.applicableWarehouses.some(warehouse => warehouse.equals(customer.warehouse));
        
        if (!isApplicable) {
            return res.status(400).json({ 
                message: 'This policy is not applicable to your role or warehouse' 
            });
        }
        const signedDocumentPath = await saveFileToDisk(req.file, customerId, policyId);

        const forced = Array.isArray(policy.forceForUsers) && policy.forceForUsers.some(f => String(f.user) === String(customerId));
        
        // Check if already accepted
        const existingAcceptance = await PolicyAcceptance.findOne({
            customer: customerId,
            policy: policyId
        });

        let policyAcceptance;

        const existingVersion = parseFloat(existingAcceptance.policyVersion || 0);
        const newVersion = parseFloat(policy.version || 0);


       if (existingAcceptance) {

       if (!forced && existingVersion >= newVersion) {
        // Normal policy, already latest signed
        return res.status(400).json({
        message: 'You already signed the latest version of this policy'
        });
        }

         // Forced policy OR version upgrade
        existingAcceptance.signatureData = signatureData;
        existingAcceptance.signedDocumentPath = signedDocumentPath;
        existingAcceptance.policyVersion = newVersion;
        existingAcceptance.policySnapshot = policy.content;
        existingAcceptance.acceptedAt = new Date();
        existingAcceptance.ipAddress = ipAddress;
        existingAcceptance.userAgent = userAgent;

        await existingAcceptance.save();
        policyAcceptance = existingAcceptance;
        } else {
        policyAcceptance = new PolicyAcceptance({
        customer: customerId,
        policy: policyId,
        signatureData,
        signedDocumentPath,
        ipAddress,
        userAgent,
        policyVersion: parseFloat(policy.version),
        policySnapshot: policy.content
        });
        await policyAcceptance.save();
        }

        const idx = (customer.policyAccepted || []).findIndex(pa => String(pa.policy) === String(policyId));
        if (idx >= 0) {
        customer.policyAccepted[idx].agreedVersion = policy.version;
        customer.policyAccepted[idx].agreedAt = new Date();
        customer.policyAccepted[idx].forced = false;
        } else {
        customer.policyAccepted.push({
        policy: policyId,
        agreedVersion: policy.version,
        agreedAt: new Date(),
        forced: false
        });
        }
         
        await Policy.updateOne(
        { _id: policyId },
        { $pull: { forceForUsers: { user: customer._id } } }
        );
        
        // Update customer's policy acceptance status
        const applicablePolicies = await Policy.find({
            isActive: true,
            $or: [
                { applicableRoles: customer.role },
                { applicableWarehouses: customer.warehouse }
            ]
        });
        
        const acceptedPolicies = await PolicyAcceptance.find({
            customer: customerId,
            policy: { $in: applicablePolicies.map(p => p._id) }
        });
        
            customer.policiesAccepted = acceptedPolicies.length >= applicablePolicies.length;

        if (customer.policiesAccepted) { 
            customer.policiesAcceptedDate = new Date();
        }

        // Save customer ONCE
        await customer.save();
     
        
        res.status(201).json({
            message: 'Policy accepted successfully',
            policyAcceptance: {
                id: policyAcceptance._id,
                policyId: policyAcceptance.policy,
                acceptedAt: policyAcceptance.acceptedAt,
                documentUrl: `/uploads/${policyAcceptance.signedDocumentPath}`
            },
           allPoliciesAccepted: customer.policiesAccepted
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


const getPolicyAcceptance = async (req, res) => {
    try {
        const { id } = req.params;
        
        const acceptance = await PolicyAcceptance.findById(id)
            .populate('customer', 'username email')
            .populate('policy', 'title version');
            
        if (!acceptance) {
            return res.status(404).json({ message: 'Policy acceptance record not found' });
        }
        
        // Add full URL for the document
        const acceptanceData = acceptance.toObject();
        acceptanceData.documentUrl = `/uploads/${acceptance.signedDocumentPath}`;
        
        res.status(200).json({ acceptance: acceptanceData });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


const getCustomerAcceptedPolicies = async (req, res) => {
    try {
        const customerId = req.user.id;
        
        const acceptances = await PolicyAcceptance.find({ customer: customerId })
            .populate('policy', 'title version')
            .sort({ acceptedAt: -1 });
            
        // Add document URLs
        const acceptancesWithUrls = acceptances.map(acceptance => {
            const data = acceptance.toObject();
            data.documentUrl = `/uploads/${acceptance.signedDocumentPath}`;
            return data;
        });
        
        res.status(200).json({ acceptances: acceptancesWithUrls });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


const getbyCustomerAcceptedPolicy = async (req, res) => {
    try {
        const { customerId } = req.params;
        
        const acceptances = await PolicyAcceptance.find({ customer: customerId })
            .populate('policy', 'title version')
            .sort({ acceptedAt: -1 });
            
        // Add document URLs
        const acceptancesWithUrls = acceptances.map(acceptance => {
            const data = acceptance.toObject();
            data.documentUrl = `/uploads/${acceptance.signedDocumentPath}`;
            return data;
        });
        
        res.status(200).json({ acceptances: acceptancesWithUrls });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// get by  policy id:
// Get all acceptances for a specific policy
const getAcceptancesByPolicy = async (req, res) => {
    try {
        const { policyId } = req.params;
        
        // Verify the policy exists
        const policy = await Policy.findById(policyId);
        if (!policy) {
            return res.status(404).json({ message: 'Policy not found' });
        }
        
        // Find all acceptances for this policy
        const acceptances = await PolicyAcceptance.find({ policy: policyId })
            .populate({
                path: 'customer',
                select: 'username email phone_number role warehouse department'
            })
            .populate({
                path: 'policy',
                select: 'title version'
            })
            .sort({ acceptedAt: -1 });
        
        // Add document URLs and format the response
        const formattedAcceptances = acceptances.map(acceptance => {
            const data = acceptance.toObject();
            data.documentUrl = `/uploads/${acceptance.signedDocumentPath}`;
            return {
                id: data._id,
                customer: data.customer,
                acceptedAt: data.acceptedAt,
                ipAddress: data.ipAddress,
                userAgent: data.userAgent,
                policyVersion: data.policyVersion,
                documentUrl: data.documentUrl
            };
        });
        
        res.status(200).json({
            policy: {
                id: policy._id,
                title: policy.title,
                version: policy.version
            },
            totalAcceptances: acceptances.length,
            acceptances: formattedAcceptances
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// get all policies:
// Get all policy acceptances (admin only)
const getAllPolicyAcceptances = async (req, res) => {
    try {
        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        
        // Filtering parameters
        const { policyId, customerId, fromDate, toDate } = req.query;
        
        // Build filter object
        const filter = {};
        
        if (policyId) {
            filter.policy = policyId;
        }
        
        if (customerId) {
            filter.customer = customerId;
        }
        
        // Date range filter
        if (fromDate || toDate) {
            filter.acceptedAt = {};
            
            if (fromDate) {
                filter.acceptedAt.$gte = new Date(fromDate);
            }
            
            if (toDate) {
                filter.acceptedAt.$lte = new Date(toDate);
            }
        }
        
        // Get total count for pagination
        const totalCount = await PolicyAcceptance.countDocuments(filter);
        
        // Get acceptances with pagination and populate references
        const acceptances = await PolicyAcceptance.find(filter)
            .populate({
                path: 'customer',
                select: 'username email phone_number role warehouse department',
                populate: [
                    {
                        path: 'role',
                        model: 'UserRole', 
                        select: 'role_name permissions'
                    },
                    {
                        path: 'warehouse', 
                        select: 'name location address'
                    },
                    {
                        path: 'department',
                        select: 'name description'
                    }
                ]
            })
            .populate({
                path: 'policy',
                select: 'title version content isActive showFirst sequence applicableRoles applicableWarehouses picture',
                populate: [
                    {
                        path: 'applicableRoles',
                        model: 'UserRole', // 🆕 Explicitly specify model
                        select: 'role_name permissions'
                    },
                    {
                        path: 'applicableWarehouses',
                        select: 'name location address'
                    }
                ]
            })
            .sort({ acceptedAt: -1 })
            .skip(skip)
            .limit(limit);
        
        // Format the response
        const formattedAcceptances = acceptances.map(acceptance => {
            const data = acceptance.toObject();
            return {
        id: data._id,
        customer: data.customer ? {
            id: data.customer._id,
            username: data.customer.username,
            email: data.customer.email,
            phone_number: data.customer.phone_number,
            role: data.customer.role ? {
                id: data.customer.role._id,
                name: data.customer.role.role_name,
                permissions: data.customer.role.permissions
            } : null,
            warehouse: data.customer.warehouse ? {
                id: data.customer.warehouse._id,
                name: data.customer.warehouse.name,
                location: data.customer.warehouse.location,
                address: data.customer.warehouse.address
            } : null,
            department: data.customer.department ? {
                id: data.customer.department._id,
                name: data.customer.department.name,
                description: data.customer.department.description
            } : null
        } : null,
        policy: data.policy ? {
            id: data.policy._id,
            title: data.policy.title,
            version: data.policy.version,
            content: data.policy.content,
            isActive: data.policy.isActive,
            showFirst: data.policy.showFirst,
            sequence: data.policy.sequence,
            picture: data.policy.picture,
            applicableRoles: data.policy.applicableRoles ? data.policy.applicableRoles.map(role => ({
                id: role._id,
                name: role.role_name,
                permissions: role.permissions
            })) : [],
            applicableWarehouses: data.policy.applicableWarehouses ? data.policy.applicableWarehouses.map(warehouse => ({
                id: warehouse._id,
                name: warehouse.name,
                location: warehouse.location,
                address: warehouse.address
            })) : []
        } : null,
        acceptedAt: data.acceptedAt,
        policyVersion: data.policyVersion,
        policySnapshot: data.policySnapshot,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        documentUrl: data.signedDocumentPath ? `/uploads/${data.signedDocumentPath}` : null,
        signatureData: data.signatureData ? 'Available' : 'Not Available'
    };
        });
        
        res.status(200).json({
            success: true,
            message: 'Policy acceptances retrieved successfully',
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page,
            acceptances: formattedAcceptances
        });
    } catch (error) {
        console.error('Error getting policy acceptances:', error);
        res.status(500).json({ 
            success: false,
            message: 'Failed to get policy acceptances',
            error: error.message 
        });
    }
};


// Get policy acceptance statistics (admin only)
const getPolicyAcceptanceStats = async (req, res) => {
    try {
        // Get total number of acceptances
        const totalAcceptances = await PolicyAcceptance.countDocuments();
        
        // Get total number of unique customers who have accepted any policy
        const uniqueCustomers = await PolicyAcceptance.distinct('customer');
        
        // Get total number of unique policies that have been accepted
        const uniquePolicies = await PolicyAcceptance.distinct('policy');
        
        // Get acceptances by policy (count for each policy)
        const acceptancesByPolicy = await PolicyAcceptance.aggregate([
            {
                $group: {
                    _id: '$policy',
                    count: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: 'policies',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'policyDetails'
                }
            },
            {
                $unwind: '$policyDetails'
            },
            {
                $project: {
                    policyId: '$_id',
                    policyTitle: '$policyDetails.title',
                    policyVersion: '$policyDetails.version',
                    count: 1
                }
            },
            {
                $sort: { count: -1 }
            }
        ]);
        
        // Get recent acceptances (last 7 days)
        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        
        const recentAcceptances = await PolicyAcceptance.countDocuments({
            acceptedAt: { $gte: lastWeek }
        });
        
        res.status(200).json({
            totalAcceptances,
            uniqueCustomers: uniqueCustomers.length,
            uniquePolicies: uniquePolicies.length,
            recentAcceptances,
            acceptancesByPolicy
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


        


module.exports = {
    acceptPolicy,
    getPolicyAcceptance,
    getCustomerAcceptedPolicies,
    getbyCustomerAcceptedPolicy,
    getAcceptancesByPolicy,
    getAllPolicyAcceptances,
    getPolicyAcceptanceStats
}


    
        


