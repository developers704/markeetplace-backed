const express = require('express');
const router = express.Router();
const controller = require('../controllers/IPAccess.controller');
const authMiddleware = require('../middlewares/authMiddleware.js');

router.post('/', controller.create);
router.get('/', controller.findAll);
router.get('/:id', authMiddleware, controller.findOne);
router.put('/:id', authMiddleware, controller.update);
router.delete('/:id', authMiddleware, controller.Delete);

module.exports = router;
