const PolicyAcceptance = require('../models/policyAcceptance.model.js');
const Policy = require('../models/policy.model.js');
const Customer = require('../models/customer.model.js');
const path = require('path');
const fs = require('fs');
const { Parser } = require('json2csv');
const { saveFileToDisk }  = require('../config/policyMulter.js');
const Warehouse = require('../models/warehouse.model.js');

function stripHtml(html) {
    if (!html) return '';
    return String(html)
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

function getPublicBaseUrl(req) {
    const fromEnv = process.env.PUBLIC_BASE_URL || process.env.BASE_API;
    if (fromEnv) return String(fromEnv).replace(/\/$/, '');
    return `${req.protocol}://${req.get('host')}`;
}

function toMediaUrl(req, pathValue) {
    if (!pathValue) return '';
    const s = String(pathValue);
    if (s.startsWith('http://') || s.startsWith('https://')) return s;
    if (s.startsWith('/')) return `${getPublicBaseUrl(req)}${s}`;
    if (s.startsWith('uploads/')) return `${getPublicBaseUrl(req)}/${s}`;
    return `${getPublicBaseUrl(req)}/uploads/${s}`;
}

async function buildPolicyAcceptanceFilter(query) {
    const { policyId, customerId, fromDate, toDate, warehouse, department, search } = query || {};
    const filter = {};

    if (policyId) filter.policy = policyId;
    if (customerId) filter.customer = customerId;
    if (warehouse) filter.warehouse = warehouse;

    const searchQ = search && String(search).trim() ? String(search).trim() : '';
    if (department || searchQ) {
        const customerFilter = {};
        if (department) customerFilter.department = department;
        if (searchQ) {
            customerFilter.$or = [
                { username: { $regex: searchQ, $options: 'i' } },
                { email: { $regex: searchQ, $options: 'i' } },
                { phone_number: { $regex: searchQ, $options: 'i' } },
            ];
        }
        const customerIds = await Customer.find(customerFilter).distinct('_id');
        const orConditions = [];
        if (customerIds.length) {
            orConditions.push({ customer: { $in: customerIds } });
        }
        if (searchQ) {
            const policyIds = await Policy.find({ title: { $regex: searchQ, $options: 'i' } }).distinct('_id');
            if (policyIds.length) {
                orConditions.push({ policy: { $in: policyIds } });
            }
        }
        if (!orConditions.length) {
            return { filter: null, empty: true };
        }
        filter.$or = orConditions;
    }

    if (fromDate || toDate) {
        filter.acceptedAt = {};
        if (fromDate) filter.acceptedAt.$gte = new Date(fromDate);
        if (toDate) filter.acceptedAt.$lte = new Date(toDate);
    }

    return { filter, empty: false };
}

const acceptancePopulate = [
    {
        path: 'customer',
        select: 'username email phone_number role department',
        populate: [
            { path: 'role', model: 'UserRole', select: 'role_name permissions' },
            { path: 'warehouse', select: 'name location address' },
            { path: 'department', select: 'name description' },
        ],
    },
    { path: 'warehouse', select: 'name location address' },
    {
        path: 'policy',
        select: 'title version content isActive showFirst sequence applicableRoles applicableWarehouses picture',
        populate: [
            { path: 'applicableRoles', model: 'UserRole', select: 'role_name permissions' },
            { path: 'applicableWarehouses', select: 'name location address' },
        ],
    },
];

function formatAcceptanceRecord(data, req) {
    const documentPath = data.signedDocumentPath
        ? (String(data.signedDocumentPath).startsWith('/')
            ? data.signedDocumentPath
            : `/uploads/${data.signedDocumentPath}`)
        : null;
    const photoRel = data.photoPath
        ? (String(data.photoPath).startsWith('/')
            ? data.photoPath
            : `/uploads/${data.photoPath}`)
        : null;

    return {
        id: data._id,
        warehouse: data.warehouse
            ? {
                id: data.warehouse._id,
                name: data.warehouse.name,
                location: data.warehouse.location,
                address: data.warehouse.address,
            }
            : null,
        customer: data.customer
            ? {
                id: data.customer._id,
                username: data.customer.username,
                email: data.customer.email,
                phone_number: data.customer.phone_number,
                role: data.customer.role
                    ? {
                        id: data.customer.role._id,
                        name: data.customer.role.role_name,
                        permissions: data.customer.role.permissions,
                    }
                    : null,
                warehouse: data.customer.warehouse
                    ? {
                        id: data.customer.warehouse._id,
                        name: data.customer.warehouse.name,
                        location: data.customer.warehouse.location,
                        address: data.customer.warehouse.address,
                    }
                    : null,
                department: data.customer.department
                    ? {
                        id: data.customer.department._id,
                        name: data.customer.department.name,
                        description: data.customer.department.description,
                    }
                    : null,
            }
            : null,
        policy: data.policy
            ? {
                id: data.policy._id,
                title: data.policy.title,
                version: data.policy.version,
                content: data.policy.content,
                isActive: data.policy.isActive,
                showFirst: data.policy.showFirst,
                sequence: data.policy.sequence,
                picture: data.policy.picture,
                applicableRoles: (data.policy.applicableRoles || []).map((role) => ({
                    id: role._id,
                    name: role.role_name,
                    permissions: role.permissions,
                })),
                applicableWarehouses: (data.policy.applicableWarehouses || []).map((wh) => ({
                    id: wh._id,
                    name: wh.name,
                    location: wh.location,
                    address: wh.address,
                })),
            }
            : null,
        acceptedAt: data.acceptedAt,
        policyVersion: data.policyVersion,
        policySnapshot: data.policySnapshot,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        documentUrl: documentPath,
        photoPath: photoRel,
        signatureData: data.signatureData ? 'Available' : 'Not Available',
    };
}

function acceptanceToCsvRow(record, req) {
    const c = record.customer;
    const p = record.policy;
    const wh = record.warehouse;
    const custWh = c?.warehouse;

    return {
        'Acceptance ID': String(record.id || ''),
        'Customer Username': c?.username || '',
        'Customer Email': c?.email || '',
        'Customer Phone': c?.phone_number || '',
        'Customer Role': c?.role?.name || '',
        'Customer Department': c?.department?.name || '',
        'Customer Store': custWh?.name || '',
        'Customer Store Location': custWh?.location || '',
        'Acceptance Store': wh?.name || '',
        'Acceptance Store Location': wh?.location || '',
        'Policy Title': p?.title || '',
        'Policy Version': p?.version ?? record.policyVersion ?? '',
        'Policy Picture URL': toMediaUrl(req, p?.picture),
        'Accepted At': record.acceptedAt ? new Date(record.acceptedAt).toISOString() : '',
        'Policy Version At Acceptance': record.policyVersion || '',
        'IP Address': record.ipAddress || '',
        'User Agent': record.userAgent || '',
        'Signed Document URL': toMediaUrl(req, record.documentUrl),
        'Employee Photo URL': toMediaUrl(req, record.photoPath),
        'Signature': record.signatureData || '',
        'Policy Content': stripHtml(p?.content),
        'Policy Snapshot': stripHtml(record.policySnapshot),
        'Applicable Roles': (p?.applicableRoles || []).map((r) => r.name).filter(Boolean).join('; '),
        'Applicable Stores': (p?.applicableWarehouses || []).map((w) => w.name).filter(Boolean).join('; '),
    };
}


const acceptPolicy = async (req, res) => {
    try {
        const customerId = req.user.id;
        const { policyId, signatureData } = req.body;
        const warehouseID = req?.user?.selectedWarehouse;
    
        
        
        const warehouse = await Warehouse.findById(warehouseID);
        if (!warehouse) {
            return res.status(404).json({ message: 'Selected warehouse not found' });
        }
        
       

        // Check if files were uploaded
        if (!req.files || !req.files.signedDocument || !req.files.signedDocument[0]) {
            return res.status(400).json({ message: 'Signed document image is required' });
        }
        
        if (!req.files.photoFile || !req.files.photoFile[0]) {
            return res.status(400).json({ message: 'Employee photo is required' });
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
        // Save both signature and photo
        const signatureFile = req.files.signedDocument[0];
        const photoFile = req.files.photoFile[0];
        
        const signedDocumentPath = await saveFileToDisk(signatureFile, customerId, policyId);
        const photoPath = await saveFileToDisk(photoFile, customerId, `${policyId}_photo`);

        const forced = Array.isArray(policy.forceForUsers) && policy.forceForUsers.some(f => String(f.user) === String(customerId));
        
        // Check if already accepted
        const existingAcceptance = await PolicyAcceptance.findOne({
            customer: customerId,
            policy: policyId
        });



        let policyAcceptance;

      const existingVersion = existingAcceptance ? parseFloat(existingAcceptance.policyVersion || 0) : 0;

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
        existingAcceptance.photoPath = photoPath;
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
        photoPath,
        ipAddress,
        userAgent,
        policyVersion: parseFloat(policy.version),
        policySnapshot: policy?.content,
        warehouse: warehouse?._id
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
                documentUrl: `/uploads/${policyAcceptance.signedDocumentPath}`,
                photoUrl: `/uploads/${policyAcceptance.photoPath}`
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
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 15;
        
        const pageNum = Math.max(1, page);
        const limitNum = Math.min(100, Math.max(1, limit));

        // Filtering parameters
        const { policyId, customerId, fromDate, toDate, warehouse, department, search } = req.query;
        
        // Build filter object
        const filter = {};
        
        if (policyId) {
            filter.policy = policyId;
        }
        
        if (customerId) {
            filter.customer = customerId;
        }

        if (warehouse) {
            filter.warehouse = warehouse;
        }

        const searchQ = search && String(search).trim() ? String(search).trim() : '';
        if (department || searchQ) {
            const Customer = require('../models/customer.model');
            const Policy = require('../models/policy.model');
            const orConditions = [];

            const customerFilter = {};
            if (department) customerFilter.department = department;
            if (searchQ) {
                customerFilter.$or = [
                    { username: { $regex: searchQ, $options: 'i' } },
                    { email: { $regex: searchQ, $options: 'i' } },
                    { phone_number: { $regex: searchQ, $options: 'i' } },
                ];
            }
            const customerIds = await Customer.find(customerFilter).distinct('_id');
            if (customerIds.length) {
                orConditions.push({ customer: { $in: customerIds } });
            }

            if (searchQ) {
                const policyIds = await Policy.find({ title: { $regex: searchQ, $options: 'i' } }).distinct('_id');
                if (policyIds.length) {
                    orConditions.push({ policy: { $in: policyIds } });
                }
            }

            if (!orConditions.length) {
                return res.status(200).json({
                    success: true,
                    message: 'Policy acceptances retrieved successfully',
                    totalCount: 0,
                    totalPages: 0,
                    currentPage: pageNum,
                    limit: limitNum,
                    hasNextPage: false,
                    acceptances: [],
                });
            }

            filter.$or = orConditions;
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
        
        const skip = (pageNum - 1) * limitNum;

        // Get total count for pagination
        const totalCount = await PolicyAcceptance.countDocuments(filter);
        
        // Get acceptances with pagination and populate references
        const acceptances = await PolicyAcceptance.find(filter)
            .populate({
                path: 'customer',
                select: 'username email phone_number role department',
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
            }).populate({
                path: 'warehouse',
                select: 'name location address'
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
            .limit(limitNum);
        
        // Format the response
        const formattedAcceptances = acceptances.map(acceptance => {
            const data = acceptance.toObject();
            return {
            id: data._id,
            warehouse: data.warehouse ? {
                id: data.warehouse._id,
                name: data.warehouse.name,
                location: data.warehouse.location,
                address: data.warehouse.address
            } : null,
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
                warehouseData: data.warehouseData ? {
                id: data.warehouseData._id,
                name: data.warehouseData.name,
                location: data.warehouseData.location,
                address: data.warehouseData.address
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
        photoPath: data.photoPath ? `/uploads/${data.photoPath}` : null,
        signatureData: data.signatureData ? 'Available' : 'Not Available'
    };
        });
        
        res.status(200).json({
            success: true,
            message: 'Policy acceptances retrieved successfully',
            totalCount,
            totalPages: Math.ceil(totalCount / limitNum) || 0,
            currentPage: pageNum,
            limit: limitNum,
            hasNextPage: pageNum * limitNum < totalCount,
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

/** GET /api/policy-acceptance/export/csv — all matching rows (respects list filters) */
const exportPolicyAcceptancesToCSV = async (req, res) => {
    try {
        const { filter, empty } = await buildPolicyAcceptanceFilter(req.query);

        let acceptances = [];
        if (!empty && filter) {
            acceptances = await PolicyAcceptance.find(filter)
                .populate(acceptancePopulate)
                .sort({ acceptedAt: -1 })
                .lean();
        }

        const formatted = acceptances.map((row) => formatAcceptanceRecord(row, req));
        const csvRows = formatted.map((row) => acceptanceToCsvRow(row, req));

        const fields = [
            'Acceptance ID',
            'Customer Username',
            'Customer Email',
            'Customer Phone',
            'Customer Role',
            'Customer Department',
            'Customer Store',
            'Customer Store Location',
            'Acceptance Store',
            'Acceptance Store Location',
            'Policy Title',
            'Policy Version',
            'Policy Picture URL',
            'Accepted At',
            'Policy Version At Acceptance',
            'IP Address',
            'User Agent',
            'Signed Document URL',
            'Employee Photo URL',
            'Signature',
            'Policy Content',
            'Policy Snapshot',
            'Applicable Roles',
            'Applicable Stores',
        ];

        const parser = new Parser({ fields });
        const csv = parser.parse(csvRows.length ? csvRows : [{}]);

        const stamp = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=policy-acceptances-${stamp}.csv`);
        return res.status(200).send('\uFEFF' + csv);
    } catch (error) {
        console.error('Error exporting policy acceptances:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to export policy acceptances',
            error: error.message,
        });
    }
};


        


module.exports = {
    acceptPolicy,
    getPolicyAcceptance,
    getCustomerAcceptedPolicies,
    getbyCustomerAcceptedPolicy,
    getAcceptancesByPolicy,
    getAllPolicyAcceptances,
    getPolicyAcceptanceStats,
    exportPolicyAcceptancesToCSV,
}


    
        


