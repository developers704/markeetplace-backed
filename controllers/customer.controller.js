const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Customer = require('../models/customer.model');
const { sendEmail } = require('../config/sendMails');
const Address = require('../models/address.model');
const fs = require('fs');
const path = require('path');
const { deleteFile } = require('../config/fileOperations');
const Wallet = require('../models/wallet.model'); // Adjust the path as needed
const { Parser } = require('json2csv');
const WarehouseWallet = require('../models/warehouseWallet.model');
const warehouse = require('../models/warehouse.model');
const SecuritySettings = require('../models/securitySettings.model');


const generateUniqueBarcode = async (phone_number) => {
    let barcode;
    let barcodeExists = true;

    // Loop until a unique barcode is found
    while (barcodeExists) {
        const randomSuffix = Math.floor(1000 + Math.random() * 9000); // Generate 4-digit random number
        barcode = `${phone_number}${randomSuffix}`;

        // Check if the barcode already exists in the database
        barcodeExists = await Customer.exists({ barcode });
    }

    return barcode;
};

const registerCustomer = async (req, res) => {
    try {
        const { username, email, password, phone_number, city, date_of_birth, gender } = req.body;

        // Check if email is provided and, if so, check for uniqueness
        if (email) {
            const existingCustomer = await Customer.findOne({ email });
            if (existingCustomer) {
                return res.status(400).json({ message: 'Email already exists' });
            }
        }

        // Check if phone number already exists
        const existingPhoneNumber = await Customer.findOne({ phone_number });
        if (existingPhoneNumber) {
            return res.status(400).json({ message: 'Phone number already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const verificationToken = crypto.randomBytes(20).toString('hex');
        const barcode = await generateUniqueBarcode(phone_number);


        const customer = new Customer({
            username,
            email,
            password: hashedPassword,
            phone_number,
            barcode,
            city,              // Optional field
            date_of_birth,     // Optional field
            gender,   // Optional field
            verificationToken
        });

        await customer.save();

        // Create the wallet for the customer with zero balance
        const wallet = new Wallet({
            customer: customer._id,
            balance: 0  // Initial balance is zero
        });

        await wallet.save();

        // Send verification email if email is provided
        if (email) {
            const mailOptions = {
                to: customer.email,
                from: process.env.EMAIL_USER,
                subject: 'Verify Your Email Address',
                html: `
                <h2>Welcome to Our E-commerce Platform!</h2>
                <p>Thank you for registering. To complete your registration, please verify your email address by clicking the button below:</p>
                <a href="${process.env.BASE_URL}/customers/verify/${verificationToken}" style="background-color: #4CAF50; border: none; color: white; padding: 15px 32px; text-align: center; text-decoration: none; display: inline-block; font-size: 16px; margin: 4px 2px; cursor: pointer;">Verify Email</a>
                <p>If you did not request this, please ignore this email.</p>
                <p>Best regards,<br>Your E-commerce Team</p>
            `
            };

            await sendEmail(mailOptions);
        }

        res.status(201).json({ message: 'Customer registered successfully.' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


const verifyEmail = async (req, res) => {
    try {
        const { token } = req.params;
        const customer = await Customer.findOne({ verificationToken: token });
        if (!customer) {
            return res.status(400).json({ message: 'Invalid verification token' });
        }
        customer.verified = true;
        customer.verificationToken = undefined;
        await customer.save();
        res.status(200).json({ message: 'Email verified successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// Get customer profile
// const getCustomerProfile = async (req, res) => {
//     try {
//         const customerId = req.user.id;
//         const customer = await Customer.findById(customerId)
//             .select('-password')
//             .populate('addresses')
//             .populate('role')
//             .populate({
//                 path: 'warehouse',
//                 select: 'name'
//             });
//         if (!customer) {
//             return res.status(404).json({ message: 'Customer not found' });
//         }
//         res.status(200).json(customer);
//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };

const getGlobalSecuritySettings = async () => {
    try {
        const globalSettings = await SecuritySettings.findOne({ type: 'global' });

        if (!globalSettings) {
            // Return default settings
            return {
                type: 'global',
                autoLogout: {
                    enabled: false,
                    timeLimit: 30
                }
            };
        }

        return {
            type: globalSettings.type,
            autoLogout: globalSettings.autoLogout
        };
    } catch (error) {
        console.error('Error getting global security settings:', error);
        // Return default on error
        return {
            type: 'global',
            autoLogout: {
                enabled: false,
                timeLimit: 30
            }
        };
    }
};


const getCustomerProfile = async (req, res) => {
    try {
        const customerId = req.user.id;
        const customer = await Customer.findById(customerId)
            .select('-password')
            .populate('addresses')
            .populate('role')
            .populate('department')
            .populate('warehouse', 'name');

        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        let customerData = customer.toObject();

        if (customer.warehouse) {
            const warehouseWallet = await WarehouseWallet.findOne({ warehouse: customer.warehouse._id })
                .select('balance lastTransaction');

            if (warehouseWallet) {
                customerData.warehouse.wallet = warehouseWallet;
            }
        }

        const globalSecuritySettings = await getGlobalSecuritySettings();
        customerData.securitySettings = globalSecuritySettings;


        res.status(200).json(customerData);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};



const getApplicableSecuritySettings = async (userId, roleId) => {
    try {
        // Priority: User-specific > Role-based > Global

        // Check for user-specific settings
        let userSettings = await SecuritySettings.findOne({
            type: 'user',
            user: userId
        });

        if (userSettings) {
            return {
                autoLogout: userSettings.autoLogout,
                presenceDetection: userSettings.presenceDetection,
                appliedLevel: 'user'
            };
        }

        // Check for role-based settings
        let roleSettings = await SecuritySettings.findOne({
            type: 'role',
            roles: roleId
        });

        if (roleSettings) {
            return {
                autoLogout: roleSettings.autoLogout,
                presenceDetection: roleSettings.presenceDetection,
                appliedLevel: 'role'
            };
        }

        // Check for global settings
        let globalSettings = await SecuritySettings.findOne({
            type: 'global'
        });

        if (globalSettings) {
            return {
                autoLogout: globalSettings.autoLogout,
                presenceDetection: globalSettings.presenceDetection,
                appliedLevel: 'global'
            };
        }

        // Default settings if none found
        return {
            autoLogout: {
                enabled: false,
                timeLimit: 60000
            },
            presenceDetection: {
                enabled: false
            },
            appliedLevel: 'default'
        };

    } catch (error) {
        console.error('Error getting security settings:', error);
        return {
            autoLogout: {
                enabled: false,
                timeLimit: 60000
            },
            presenceDetection: {
                enabled: false
            },
            appliedLevel: 'default'
        };
    }
};


const updateCustomerProfile = async (req, res) => {
    try {
        const customerId = req.user.id;
        const { username, email, phone_number, city, date_of_birth, gender, address } = req.body;

        const customer = await Customer.findById(customerId);
        if (!customer) {
            if (req.file) await deleteFile(req.file.path); // Delete uploaded file if customer not found
            return res.status(404).json({ message: 'Customer not found' });
        }

        // Email uniqueness check
        if (email && email !== customer.email) {
            const existingCustomer = await Customer.findOne({ email });
            if (existingCustomer) {
                if (req.file) await deleteFile(req.file.path); // Delete uploaded file on error
                return res.status(400).json({ message: 'Email already exists' });
            }
        }

        // Phone number uniqueness check
        if (phone_number && phone_number !== customer.phone_number) {
            const existingPhoneNumber = await Customer.findOne({ phone_number });
            if (existingPhoneNumber) {
                if (req.file) await deleteFile(req.file.path); // Delete uploaded file on error
                return res.status(400).json({ message: 'Phone number already exists' });
            }
        }

        // Update fields
        customer.username = username || customer.username;
        customer.email = email || customer.email;
        customer.phone_number = phone_number || customer.phone_number;
        customer.city = city !== undefined ? city : customer.city;
        customer.date_of_birth = date_of_birth !== undefined ? date_of_birth : customer.date_of_birth;
        customer.gender = gender !== undefined ? gender : customer.gender;

        // Update profile image if uploaded
        if (req.file) {
            // Delete old image if it exists
            if (customer.profileImage) {
                const oldImagePath = path.join(__dirname, '..', customer.profileImage);
                await deleteFile(oldImagePath);
            }

            // Set new profile image path
            const profileImagePath = path.join('uploads', 'images', req.file.filename);
            customer.profileImage = profileImagePath;
        }

        await customer.save();

        res.status(200).json({ message: 'Profile updated successfully', customer });
    } catch (error) {
        // Delete uploaded file if any other error occurs
        if (req.file) await deleteFile(req.file.path);
        res.status(400).json({ message: error.message });
    }
};


const changeCustomerPassword = async (req, res) => {
    try {
        const customerId = req.user.id;
        const { currentPassword, newPassword } = req.body;

        const customer = await Customer.findById(customerId);
        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        const isMatch = await bcrypt.compare(currentPassword, customer.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        const salt = await bcrypt.genSalt(10);
        customer.password = await bcrypt.hash(newPassword, salt);

        await customer.save();

        res.status(200).json({ message: 'Password changed successfully' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Delete own account and associated profile image
const deleteOwnAccount = async (req, res) => {
    try {
        const customerId = req.user.id;
        const customer = await Customer.findById(customerId);

        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        // Delete profile image if it exists
        if (customer.profileImage) {
            const imagePath = path.join(__dirname, '..', customer.profileImage);
            await deleteFile(imagePath); // Using deleteFile helper
        }

        await Address.deleteMany({ customer: customerId });
        await Customer.findByIdAndDelete(customerId);

        res.status(200).json({ message: 'Your account has been successfully deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting account', error: error.message });
    }
};

// Delete a customer by ID and associated profile image
const deleteCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const customer = await Customer.findById(id);

        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        // Delete profile image if it exists
        if (customer.profileImage) {
            const imagePath = path.join(__dirname, '..', customer.profileImage);
            await deleteFile(imagePath); // Using deleteFile helper
        }

        await Address.deleteMany({ customer: id });
        await Customer.findByIdAndDelete(id);

        res.status(200).json({ message: 'Customer deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Delete multiple customers by IDs and associated profile images
const deleteCustomers = async (req, res) => {
    try {
        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: 'Please select customers to delete' });
        }

        // Find all customers by IDs and delete images if they exist
        const customers = await Customer.find({ _id: { $in: ids } });
        for (const customer of customers) {
            if (customer.profileImage) {
                const imagePath = path.join(__dirname, '..', customer.profileImage);
                await deleteFile(imagePath); // Using deleteFile helper
            }
        }

        // Delete addresses and customers
        await Address.deleteMany({ customer: { $in: ids } });
        await Customer.deleteMany({ _id: { $in: ids } });

        res.status(200).json({ message: 'Customers and related addresses deleted successfully.' });
    } catch (error) {
        console.error('Error deleting customers:', error.message);
        res.status(400).json({ message: error.message });
    }
};


// Get all customers
const getAllCustomers = async (req, res) => {
    try {
        const customers = await Customer.find()
            .select('-password')
            .populate('addresses')
            .populate('department')
            .populate({
                path: 'role',
                select: 'role_name',

            })
            .populate('warehouse')
            .sort({ updatedAt: -1, createdAt: -1 });
        res.status(200).json(customers);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const getAllCustomersForStore = async (req, res) => {
  try {
    const customers = await Customer.find()
      .select('_id username') // sirf _id aur username
      .populate({
        path: 'role',
        select: 'role_name' // role ka sirf name
      })
      .sort({ updatedAt: -1, createdAt: -1 });

    res.status(200).json(customers);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};




const deactivateAccount = async (req, res) => {
    try {
        const customerId = req.user.id;
        const customer = await Customer.findById(customerId);
        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        customer.isDeactivated = true;
        customer.deactivationDate = new Date();
        await customer.save();

        // Notify admin about the deactivation request
        // You can implement this part based on your notification system

        res.status(200).json({
            message: 'Account deactivation request submitted successfully',
            customer // Returning the updated customer data
        });
    } catch (error) {
        res.status(500).json({ message: 'Error deactivating account', error: error.message });
    }
};

const reactivateAccount = async (req, res) => {
    try {
        const customerId = req.user.id;
        const customer = await Customer.findById(customerId);
        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        if (!customer.isDeactivated) {
            return res.status(400).json({ message: 'Account is already active' });
        }

        customer.isDeactivated = false;
        customer.deactivationDate = null;
        await customer.save();

        res.status(200).json({
            message: 'Account reactivated successfully',
            customer // Returning the updated customer data
        });
    } catch (error) {
        res.status(500).json({ message: 'Error reactivating account', error: error.message });
    }
};



const updateCustomerByAdmin = async (req, res) => {
    try {
        const customerId = req.params.id;
        const { username, email, phone_number, city, date_of_birth, gender } = req.body;

        const customer = await Customer.findById(customerId);
        if (!customer) {
            if (req.file) await deleteFile(req.file.path);
            return res.status(404).json({ message: 'Customer not found' });
        }

        // Rest of the validation and update logic remains the same as in your original function
        // Email uniqueness check
        if (email && email !== customer.email) {
            const existingCustomer = await Customer.findOne({ email });
            if (existingCustomer) {
                if (req.file) await deleteFile(req.file.path);
                return res.status(400).json({ message: 'Email already exists' });
            }
        }

        // Phone number uniqueness check
        if (phone_number && phone_number !== customer.phone_number) {
            const existingPhoneNumber = await Customer.findOne({ phone_number });
            if (existingPhoneNumber) {
                if (req.file) await deleteFile(req.file.path);
                return res.status(400).json({ message: 'Phone number already exists' });
            }
        }

        // Update fields
        customer.username = username || customer.username;
        customer.email = email || customer.email;
        customer.phone_number = phone_number || customer.phone_number;
        customer.city = city !== undefined ? city : customer.city;
        customer.date_of_birth = date_of_birth !== undefined ? date_of_birth : customer.date_of_birth;
        customer.gender = gender !== undefined ? gender : customer.gender;

        // Handle profile image update
        if (req.file) {
            if (customer.profileImage) {
                const oldImagePath = path.join(__dirname, '..', customer.profileImage);
                await deleteFile(oldImagePath);
            }
            const profileImagePath = path.join('uploads', 'images', req.file.filename);
            customer.profileImage = profileImagePath;
        }

        await customer.save();
        res.status(200).json({ message: 'Customer profile updated successfully', customer });
    } catch (error) {
        if (req.file) await deleteFile(req.file.path);
        res.status(400).json({ message: error.message });
    }
};

const exportCustomersToCSV = async (req, res) => {
    try {
        const customers = await Customer.find()
            .select('username email phone_number date_joined addresses city date_of_birth gender')
            .populate('addresses', 'address title isDefault');

        const customersFormatted = customers.map(customer => ({
            Username: customer.username,
            Email: customer.email || 'N/A',
            PhoneNumber: customer.phone_number,
            DateJoined: new Date(customer.date_joined).toISOString().split('T')[0],
            City: customer.city || 'N/A',
            DateOfBirth: customer.date_of_birth ? new Date(customer.date_of_birth).toISOString().split('T')[0] : 'N/A',
            Gender: customer.gender || 'N/A',
            Addresses: customer.addresses.map(addr =>
                `${addr.title}: ${addr.address}${addr.isDefault ? ' (Default)' : ''}`
            ).join(' | ')
        }));

        const fields = [
            'Username',
            'Email',
            'PhoneNumber',
            'DateJoined',
            'City',
            'DateOfBirth',
            'Gender',
            'Addresses'
        ];

        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(customersFormatted);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=customers.csv');
        res.status(200).send(csv);

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};







module.exports = { registerCustomer, getCustomerProfile, deleteCustomer, getAllCustomers, updateCustomerProfile, changeCustomerPassword, verifyEmail, deleteOwnAccount, deactivateAccount, reactivateAccount, deleteCustomers, updateCustomerByAdmin, exportCustomersToCSV, getAllCustomersForStore };
