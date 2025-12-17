const bcrypt = require('bcryptjs');
const User = require('../models/user.model');
const Wallet = require('../models/wallet.model.js')
const UserRole = require('../models/userRole.model');
require('dotenv').config();
const Settings = require('../models/settings.model');
const Customer = require('../models/customer.model');
const Warehouse =  require('../models/warehouse.model');
const WarehouseWallet = require('../models/warehouseWallet.model');
const InventoryWallet = require('../models/inventoryWallet.model.js');
const SuppliesWallet = require('../models/suppliesWallet.model');
const Department = require('../models/department.model.js');
const fsSync = require('fs');
const csv = require('csv-parser');
const { deleteFile } = require('../config/fileOperations.js');

// Create User Role
const createUserRole = async (req, res) => {
    try {
        const { role_name, permissions } = req.body;

        // Check if a role with the same name already exists
        const existingRole = await UserRole.findOne({ role_name });
        if (existingRole) {
            return res.status(400).json({ message: 'Role name already exists' });
        }

        const userRole = new UserRole({ role_name, permissions });
        await userRole.save();
        res.status(201).json({ message: 'User role created successfully', userRole });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Get all User Roles
const getAllUserRoles = async (req, res) => {
    try {
        // Find all roles except the one marked as "superuser"
        const userRoles = await UserRole.find({ role_name: { $ne: 'Super User' } });

        res.status(200).json(userRoles);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// Update User Role
const updateUserRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { role_name } = req.body;

        // Check if a different role with the same name exists
        if (role_name) {
            const existingRole = await UserRole.findOne({ role_name, _id: { $ne: id } });
            if (existingRole) {
                return res.status(400).json({ message: 'Role name already exists' });
            }
        }

        const updatedRole = await UserRole.findByIdAndUpdate(id, req.body, { new: true });
        if (!updatedRole) {
            return res.status(404).json({ message: 'User role not found' });
        }
        res.status(200).json({ message: 'User role updated successfully', updatedRole });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Delete User Role
const deleteUserRole = async (req, res) => {
    try {
        const { id } = req.params;
        await UserRole.findByIdAndDelete(id);
        res.status(200).json({ message: 'User role deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Bulk Delete User Roles
const bulkDeleteUserRoles = async (req, res) => {
    try {
        const { ids } = req.body; // Array of IDs to be deleted

        // Validate that 'ids' is an array
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: 'Please provide an array of user role IDs to delete' });
        }

        // Perform bulk delete using the array of IDs
        const result = await UserRole.deleteMany({ _id: { $in: ids } });

        // Return success message with the count of deleted roles
        res.status(200).json({ message: `${result.deletedCount} user roles deleted successfully` });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// Create User bulk import 

function transformUserCSV(rows) {
  return rows.map((r) => ({
    username: r.username?.trim() || "",
    email: r.email?.trim().toLowerCase() || "",
    password: r.password?.trim() || "",
    phone_number: r.phone_number?.trim() || "",
    roleName: r.role?.trim() || "",
    departmentName: r.department?.trim() || "",
    storeNames: r.store
      ? r.store.split(",").map((s) => s.trim())
      : [],
    initialBalance: Number(r.initialBalance) || 0
}));
}

const findOrCreateRole = async (name) => {
  if (!name) return null;

  let role = await UserRole.findOne({
    role_name: new RegExp(`^${name}$`, "i")
  });

  if (!role) {
    // create default role with empty permissions
    role = await UserRole.create({
      role_name: name,
      permissions: {} 
    });
  }

  return role;
};

const findOrCreateDepartment = async (name) => {
  if (!name) return null;

  let dept = await Department.findOne({
    name: new RegExp(`^${name}$`, "i")
  });

  if (!dept) {
    dept = await Department.create({ name });
  }

  return dept;
};


const findStoresByNames = async (names = []) => {
  if (!names.length) return [];

  return await Warehouse.find({
    name: { $in: names.map(n => new RegExp(`^${n}$`, "i")) }
  });
};
const importBulkUsers = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No CSV file uploaded" });
    }

    const csvFilePath = req.file.path;
    const results = [];
    const errors = [];

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Read CSV
    await new Promise((resolve, reject) => {
      fsSync.createReadStream(csvFilePath)
        .pipe(csv())
        .on("data", (data) => results.push(data))
        .on("end", resolve)
        .on("error", reject);
    });

    const cleanRows = transformUserCSV(results);

    for (let i = 0; i < cleanRows.length; i++) {
      const row = cleanRows[i];
      const rowNumber = i + 2;

      try {
        // Required
        if (!row.username || !row.email || !row.password) {
          errors.push({
            row: rowNumber,
            error: "Username, Email & Password required",
            data: row
          });
          errorCount++;
          continue;
        }

        // Skip duplicate email
        const exists =
          await User.findOne({ email: row.email }) ||
          await Customer.findOne({ email: row.email });

        if (exists) {
          skippedCount++;
          continue;
        }

        // 🔹 Role (NAME based)
         const role = await findOrCreateRole(row.roleName);

        // 🔹 Department (NAME based)
        const department = await findOrCreateDepartment(row.departmentName);


        // 🔹 Stores (optional)
        const warehouses = await findStoresByNames(row.storeNames);
        const warehouseIds = warehouses.map((w) => w._id);

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(row.password, salt);

        // Create User
        const user = await User.create({
          username: row.username,
          email: row.email,
          password: hashedPassword,
          phone_number: row.phone_number,
          role: role._id,
          department: department._id,
          warehouse: warehouseIds 
        });

        // Create Customer
        const customer = await Customer.create({
          username: row.username,
          email: row.email,
          password: hashedPassword,
          phone_number: row.phone_number,
          role: role._id,
          department: department._id,
          warehouse: warehouseIds
        });

        // Wallet
        await Wallet.create({
          customer: customer._id,
          balance: row.initialBalance
        });

        successCount++;
      } catch (err) {
        errors.push({
          row: rowNumber,
          error: err.message,
          data: row
        });
        errorCount++;
      }
    }

    await deleteFile(csvFilePath);

    res.status(200).json({
      message: "Bulk user import completed",
      summary: {
        totalRows: results.length,
        successCount,
        skippedCount,
        errorCount,
        successRate: `${(
          (successCount / results.length) *
          100
        ).toFixed(2)}%`
      },
      errors: errors.length ? errors : undefined
    });
  } catch (error) {
    if (req.file?.path) await deleteFile(req.file.path);
    res.status(500).json({
      message: "Error processing CSV file",
      error: error.message
    });
  }
};

const createUser = async (req, res) => {
    try {
        const { username, email, password, phone_number, userRoleId, warehouseId, department, initialBalance} = req.body;

        // Check if userRoleId exists
        const role = await UserRole.findById(userRoleId);
        if (!role) {
            return res.status(400).json({ message: 'Invalid user role ID' });
        }

        const departmentExists = await Department.findById(department);
        if (!departmentExists) {
            return res.status(400).json({ message: 'Invalid department ID' });
        }

        // if (warehouseId) {
        //     const warehouse = await Warehouse.findById(warehouseId);
        //     if (!warehouse) {
        //         return res.status(400).json({ message: 'Invalid warehouse ID' });
        //     }
        // }

        if (warehouseId && warehouseId.length > 0) {
        const warehouses = await Warehouse.find({ _id: { $in: warehouseId } });
  
        if (warehouses.length !== warehouseId.length) {
        return res.status(400).json({ message: 'One or more warehouse IDs are invalid' });
        }
        }

        // Check if email already exists
        const existingUserByEmail = await User.findOne({ email });
        const existingCustomerByEmail = await Customer.findOne({ email });
        if (existingUserByEmail || existingCustomerByEmail) {
            return res.status(400).json({ message: 'Email already exists' });
        }

        // Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create the user with the provided userRoleId
        const user = new User({
            username,
            email,
            password: hashedPassword,
            phone_number,
            role: userRoleId,
            warehouse: warehouseId,
            department
        });

        const customer = new Customer({
            username,
            email,
            password: hashedPassword,
            phone_number,
            role: userRoleId,
            warehouse: warehouseId,
            department
        });

        const wallet = new Wallet({
            customer: customer._id,
            balance: initialBalance
        });

        await user.save();
        await customer.save();
        await wallet.save();
        res.status(201).json({ message: 'User created successfully' ,data:{
            user,
            customer,
            wallet  
        }});
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};



const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { username, email, password, phone_number, userRoleId, warehouseId, department, initialBalance, initialSuppliesBalance, initialInventoryBalance } = req.body;

        // Prevent modification of is_superuser
        if ('is_superuser' in req.body) {
            return res.status(403).json({ message: 'Forbidden: Cannot modify superuser status' });
        }

        if (department) {
            const departmentExists = await Department.findById(department);
            if (!departmentExists) {
                return res.status(400).json({ message: 'Invalid department ID' });
            }
        }

        // Find the user by ID
        const user = await User.findById(id);
        const customer = await Customer.findOne({email: user.email});
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

          // Update username without checking uniqueness
        //   if (username) {
        //     user.username = username;
        // }
        
        // // Update email if provided
        // if (email) {
        //     const existingUserByEmail = await User.findOne({ email });
        //     if (existingUserByEmail && existingUserByEmail._id.toString() !== id) {
        //         return res.status(400).json({ message: 'Email already exists' });
        //     }
        //     user.email = email;
        // }

        // // Update password if provided
        // if (password) {
        //     const salt = await bcrypt.genSalt(10);
        //     user.password = await bcrypt.hash(password, salt);
        // }

        // // Update phone number if provided
        // if (phone_number) {
        //     user.phone_number = phone_number;
        // }

        // // Update user role if provided
        // if (userRoleId) {
        //     const role = await UserRole.findById(userRoleId);
        //     if (!role) {
        //         return res.status(400).json({ message: 'Invalid user role ID' });
        //     }
        //     user.role = userRoleId; // Directly reference the existing user role
        // }

        // await user.save();

        if (warehouseId) {
            const warehouse = await Warehouse.findById(warehouseId);
            if (!warehouse) {
                return res.status(400).json({ message: 'Invalid warehouse ID' });
            }
        }

        const updates = {};
        if (username) updates.username = username;
        if (email) {
            const existingUserByEmail = await User.findOne({ email, _id: { $ne: id } });
            if (existingUserByEmail) {
                return res.status(400).json({ message: 'Email already exists' });
            }
            updates.email = email;
        }
        if (phone_number) updates.phone_number = phone_number;
        if (userRoleId) {
            const role = await UserRole.findById(userRoleId);
            if (!role) {
                return res.status(400).json({ message: 'Invalid user role ID' });
            }
            updates.role = userRoleId;
        }

        if (warehouseId !== undefined) updates.warehouse = warehouseId;

        if (department) updates.department = department;

        // Update password if provided
        if (password) {
            const salt = await bcrypt.genSalt(10);
            updates.password = await bcrypt.hash(password, salt);
        }

        // Update both user and customer
        const updatedUser = await User.findByIdAndUpdate(id, updates, { new: true });
        if (customer) {
            await Customer.findByIdAndUpdate(customer._id, updates, { new: true });

            if (initialBalance !== undefined) {
                await Wallet.findOneAndUpdate(
                    { customer: customer._id },
                    { balance: initialBalance },
                    { new: true }
                );
            }

            if (warehouseId) {
                // Update warehouse wallet
                if (initialInventoryBalance !== undefined) {
                    await InventoryWallet.findOneAndUpdate(
                        { warehouse: warehouseId },
                        { balance: initialInventoryBalance },
                        { new: true, upsert: true }
                    );
                }
                
                // Update supplies wallet
                if (initialSuppliesBalance !== undefined) {
                    await SuppliesWallet.findOneAndUpdate(
                        { warehouse: warehouseId },
                        { balance: initialSuppliesBalance },
                        { new: true, upsert: true }
                    );
                }
            }

        }

        res.status(200).json({ message: 'User updated successfully' , user: updatedUser});
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


//user updating password
const updateOwnPassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        // Find the user by ID
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        // Update to new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);

        await user.save();
        res.status(200).json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const updateUserInfo = async (req, res) => {
    try {
      const userId = req.user.id;
      const { username, email, phone_number } = req.body;
  
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
  
      if (username) user.username = username;
      if (email) user.email = email;
      if (phone_number) user.phone_number = phone_number;
  
      await user.save();
  
      res.status(200).json({ message: "User information updated successfully", user: user.toObject({ getters: true, versionKey: false }) });
    } catch (error) {
      res.status(400).json({ message: "Error updating user information", error: error.message });
    }
  };
  


// Get all user data excluding password and superuser data, sorted by updated date
// const getAllUsers = async (req, res) => {
//     try {
//         // Fetch all users excluding the password field and superuser data
//         const users = await User.find({ is_superuser: false }, '-password')
//             .populate('role')
//             .populate('warehouse')
//             .populate('department')
//             .populate({
//                 path: 'wallet',
//                 model: 'Wallet',
//                 select: 'balance',
//             })
//             .sort({ updatedAt: -1 }) // Sort by updated date in descending order
//             .exec();
//         res.status(200).json(users);
//     } catch (error) {
//         res.status(400).json({ message: error.message });
//     }
// };

const getAllUsers = async (req, res) => {
    try {
        // First get all users
        const users = await User.find({ is_superuser: false }, '-password')
            .populate('role')
            .populate('warehouse')
            .populate('department')
            .sort({ updatedAt: -1 });

        // Get all customers with matching emails
        const userEmails = users.map(user => user.email);
        const customers = await Customer.find({ email: { $in: userEmails } });

        // Create email to customer ID mapping
        const customerMap = customers.reduce((acc, customer) => {
            acc[customer.email] = customer._id;
            return acc;
        }, {});

        // Get wallets for these customers
        const wallets = await Wallet.find({
            customer: { $in: customers.map(customer => customer._id) }
        });

        // Create customer ID to wallet mapping
        const walletMap = wallets.reduce((acc, wallet) => {
            acc[wallet.customer.toString()] = wallet;
            return acc;
        }, {});

        // Combine all data
        const usersWithWallets = users.map(user => {
            const userObj = user.toObject();
            const customerId = customerMap[user.email];
            userObj.wallet = customerId ? walletMap[customerId.toString()] : null;
            return userObj;
        });

        res.status(200).json(usersWithWallets);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};



//get individual user data
// const getOwnData = async (req, res) => {
//     try {
//         const userId = req.user.id;

//         // Find the user by ID and exclude the password and is_superuser fields
//         const user = await User.findById(userId, '-password -is_superuser').populate('role').exec();
//         if (!user) {
//             return res.status(404).json({ message: 'User not found' });
//         }

//         res.status(200).json(user);
//     } catch (error) {
//         res.status(400).json({ message: error.message });
//     }
// };

const getOwnData = async (req, res) => {
    try {
        const userId = req.user.id;

        // Find the user by ID and exclude the password and is_superuser fields
        const user = await User.findById(userId, '-password -is_superuser')
            .populate('role')
            .populate('warehouse', 'name')
            .populate('department')
            .lean()
            .exec();

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.warehouse) {
            // const warehouseWallet = await WarehouseWallet.findOne({ warehouse: user.warehouse._id })
            //     .select('balance lastTransaction')
            //     .lean();

            const inventoryWallet = await InventoryWallet.findOne({ warehouse: user.warehouse._id })
                .select('balance lastTransaction')
                .lean();
                
            const suppliesWallet = await SuppliesWallet.findOne({ warehouse: user.warehouse._id })
                .select('balance lastTransaction')
                .lean();

            
                user.warehouse.inventoryWallet = inventoryWallet || { balance: 0, lastTransaction: null };
                user.warehouse.suppliesWallet = suppliesWallet || { balance: 0, lastTransaction: null };
            
            // if (warehouseWallet) {
            //     user.warehouse.wallet = warehouseWallet;
            // }
        }

        res.status(200).json(user);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


//deleting the user
const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        // Find the user by ID
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const customer = await Customer.findOne({ email: user.email });
        if (customer) {
            await Customer.findByIdAndDelete(customer._id);
            // Delete associated wallet if exists
            await Wallet.findOneAndDelete({ customer: customer._id });
        }

        // Delete the user
        await User.findByIdAndDelete(id);

        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const deleteUsers = async (req, res) => {
    try {
        const { ids } = req.body; // Expecting an array of user IDs in the body

        // Validate if ids array is provided and not empty
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: 'Please provide a valid array of user IDs' });
        }

        const users = await User.find({ _id: { $in: ids } });
        const userEmails = users.map(user => user.email);

        const customers = await Customer.find({ email: { $in: userEmails } });
        const customerIds = customers.map(customer => customer._id);

        await Wallet.deleteMany({ customer: { $in: customerIds } });
        await Customer.deleteMany({ _id: { $in: customerIds } });

        // Find and delete users by their IDs
        const deleteResult = await User.deleteMany({ _id: { $in: ids } });

        // Check if any users were actually deleted
        if (deleteResult.deletedCount === 0) {
            return res.status(404).json({ message: 'No users found with the provided IDs' });
        }

        res.status(200).json({ message: `${deleteResult.deletedCount} user(s) deleted successfully` });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


const toggleTwoFactorAuth = async (req, res) => {
    try {
      const { enabled } = req.body;
      let settings = await Settings.findOne();
      if (!settings) {
        settings = new Settings();
      }
      settings.twoFactorAuthEnabled = enabled;
      await settings.save();
      res.status(200).json({ message: 'Two-factor authentication setting updated', enabled });
    } catch (error) {
      res.status(500).json({ message: 'Error updating two-factor authentication setting', error: error.message });
    }
  };

  const getTwoFactorAuthSetting = async (req, res) => {
    try {
        const settings = await Settings.findOne();
        if (!settings) {
            return res.status(404).json({ message: 'Settings not found' });
        }
        res.status(200).json({ twoFactorAuthEnabled: settings.twoFactorAuthEnabled });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching two-factor authentication setting', error: error.message });
    }
};


  const getDeactivationRequests = async (req, res) => {
    try {
      const deactivatedCustomers = await Customer.find({ isDeactivated: true }).sort({ deactivationDate: -1 });
      res.status(200).json(deactivatedCustomers);
    } catch (error) {
      res.status(500).json({ message: 'Error fetching deactivation requests', error: error.message });
    }
  };
  
  const getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id)
            .select('-password') // Exclude the password field
            .populate('role'); // Populate the role field

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json(user);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};



module.exports = { createUserRole, getAllUserRoles, updateUserRole, deleteUserRole, createUser, importBulkUsers , updateUser, updateOwnPassword, getAllUsers, getOwnData, deleteUser, updateUserInfo, toggleTwoFactorAuth, getDeactivationRequests, getUserById, deleteUsers, getTwoFactorAuthSetting, bulkDeleteUserRoles };
