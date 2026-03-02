const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const {
  getDashboardStats,
  getWeeklySales,
  getYearlySales,
  newUsers,
} = require('../controllers/dashboard.controller');

const checkSuperuser = (req, res, next) => {
  if (req.user?.is_superuser) return next();
  return res.status(403).json({ success: false, message: 'Admin access required' });
};

router.use(authMiddleware, checkSuperuser);

router.get('/stats', getDashboardStats);
router.get('/newusers', newUsers);
router.get('/weekly-sales', getWeeklySales);
router.get('/yearly-sales', getYearlySales);

module.exports = router;
