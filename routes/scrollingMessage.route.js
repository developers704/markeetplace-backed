const express = require('express');
const router = express.Router();
const {
    createScrollingMessage,
    getAllScrollingMessages,
    updateScrollingMessage,
    bulkDeleteScrollingMessages,
    getActiveScrollingMessages
} = require('../controllers/scrollingMessage.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const checkSuperuserOrPermission = require('../middlewares/checkSuperuserOrPermission');

router.post('/', authMiddleware, checkSuperuserOrPermission('Scrolling Messages', 'Create'), createScrollingMessage);
router.get('/', authMiddleware, checkSuperuserOrPermission('Scrolling Messages', 'View'), getAllScrollingMessages);
router.get('/active', getActiveScrollingMessages);
router.put('/:id', authMiddleware, checkSuperuserOrPermission('Scrolling Messages', 'Update'), updateScrollingMessage);
router.delete('/bulk-delete', authMiddleware, checkSuperuserOrPermission('Scrolling Messages', 'Delete'), bulkDeleteScrollingMessages);

module.exports = router;
