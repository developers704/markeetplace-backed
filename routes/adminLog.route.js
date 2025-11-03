const express = require('express');
const { getLogs, bulkDeleteLogs } = require('../controllers/adminLog.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');

const router = express.Router();

router.get('/', authMiddleware, getLogs);
router.delete('/bulk-delete', authMiddleware, checkSuperuserOrPermission('Logs', 'Delete'), bulkDeleteLogs);

module.exports = router;
