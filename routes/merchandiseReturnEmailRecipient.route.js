const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const {
  listAdminUsers,
  getWarehouseRecipients,
  toggleRecipient,
  addRecipients,
  deleteRecipient,
  syncRecipients,
} = require('../controllers/merchandiseReturnEmailRecipient.controller');

const router = express.Router();

router.use(authMiddleware);

router.get('/admin-users', listAdminUsers);
router.get('/:warehouseId', getWarehouseRecipients);
router.post('/:warehouseId/sync', syncRecipients);
router.post('/:warehouseId/add', addRecipients);
router.patch('/:id/toggle', toggleRecipient);
router.delete('/:id', deleteRecipient);

module.exports = router;
