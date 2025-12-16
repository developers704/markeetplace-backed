const express = require('express');
const router = express.Router();
const {
  createUser,
  updateUser,
  updateOwnPassword,
  getAllUsers,
  getOwnData,
  deleteUser,
  updateUserInfo,
  toggleTwoFactorAuth,
  getDeactivationRequests,
  createUserRole,
  getAllUserRoles,
  updateUserRole,
  deleteUserRole,
  getUserById,
  deleteUsers,
  getTwoFactorAuthSetting,
  bulkDeleteUserRoles,
  importBulkUsers
} = require('../controllers/user.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission.js');
const adminLogger = require('../middlewares/adminLogger');
const multer = require('multer');
const upload = multer({ dest: 'uploads/temp/' });


router.post('/role/', authMiddleware, checkSuperuserOrPermission('Users', 'Create'), adminLogger(), createUserRole);
router.get('/role/', getAllUserRoles);
router.put('/role/:id', authMiddleware, checkSuperuserOrPermission('Users', 'Update'), adminLogger(), updateUserRole);
router.delete('/roles/bulk-delete', authMiddleware, checkSuperuserOrPermission('Users', 'Delete'), adminLogger(), bulkDeleteUserRoles);
router.delete('/role/:id', authMiddleware, checkSuperuserOrPermission('Users', 'Delete'), adminLogger(), deleteUserRole);

// Only a superuser or a user with 'Create' permission on 'users' page can create users
router.post("/", authMiddleware, checkSuperuserOrPermission('Users', 'Create'), adminLogger(), createUser);
router.post("/bulk-upload-users", authMiddleware, checkSuperuserOrPermission('Users', 'Create'), adminLogger(), upload.single('csvFile'), importBulkUsers);

// Users can update their own information
router.put("/update-info", authMiddleware, updateUserInfo);

// Only a superuser or a user with 'Update' permission on 'permissions' page can allow otp authentication
router.put('/toggle-2fa', authMiddleware, checkSuperuserOrPermission('Settings', 'Update'), toggleTwoFactorAuth);

router.get('/two-factor-auth', getTwoFactorAuthSetting);

// Only a superuser or a user with 'Update' permission on 'users' page can update a user
router.put("/:id", authMiddleware, checkSuperuserOrPermission('Users', 'Update'), adminLogger(), updateUser);

// Users can update their own password
router.put("/me/password", authMiddleware, updateOwnPassword);


// Only a superuser or a user with 'View' permission on 'users' page can fetch all users
router.get("/", authMiddleware, checkSuperuserOrPermission('Users', 'View'), getAllUsers);

// Users can fetch their own data
router.get("/me", authMiddleware, getOwnData);

router.get('/:id', getUserById);

// Only a superuser or a user with 'Delete' permission on 'users' page can bulk delete users
router.delete('/bulk-delete', authMiddleware, checkSuperuserOrPermission('Users', 'Delete'), adminLogger(), deleteUsers);

// Only a superuser or a user with 'Delete' permission on 'users' page can delete a user
router.delete("/:id", authMiddleware, checkSuperuserOrPermission('Users', 'Delete'), adminLogger(), deleteUser);


router.get('/deactivation-requests', authMiddleware, checkSuperuserOrPermission('Users', 'View'), getDeactivationRequests);



module.exports = router;
