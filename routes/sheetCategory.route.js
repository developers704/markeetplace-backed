const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const {
  createSheetCategory,
  listAdminSheets,
  listMySheets,
  getSheetById,
  updateSheetCategory,
  deleteSheetCategory,
} = require('../controllers/sheetCategory.controller');

const router = express.Router();

router.use(authMiddleware);

router.get('/my', listMySheets);
router.get('/admin', listAdminSheets);
router.post('/', createSheetCategory);
router.get('/:id', getSheetById);
router.patch('/:id', updateSheetCategory);
router.delete('/:id', deleteSheetCategory);

module.exports = router;
