const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const { uploadSpoAttachments } = require('../middlewares/spoUpload.middleware');

const {
  createSpecialOrder,
  listMySpecialOrders,
  listAdminSpecialOrders,
  getSpecialOrderById,
  updateSpecialOrder,
} = require('../controllers/specialOrder.controller');

const checkSuperuser = (req, res, next) => {
  if (req.user?.is_superuser) return next();
  return res.status(403).json({ success: false, message: 'Admin access required' });
};

router.use(authMiddleware);

router.post('/', uploadSpoAttachments, createSpecialOrder);
router.get('/', listMySpecialOrders);
router.get('/admin', checkSuperuser, listAdminSpecialOrders);
router.get('/:id', checkSuperuser, getSpecialOrderById);
router.patch('/:id', checkSuperuser, updateSpecialOrder);

module.exports = router;
