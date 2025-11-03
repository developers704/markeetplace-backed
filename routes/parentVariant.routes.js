const express = require('express');
const router = express.Router();
const parentVariantController = require('../controllers/parentVariant.controller');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/',authMiddleware,parentVariantController.create);
router.get('/', authMiddleware,parentVariantController.findAll);
router.get('/:id', authMiddleware,parentVariantController.findOne);
router.put('/:id', authMiddleware,parentVariantController.update);
router.delete('/:id', authMiddleware,parentVariantController.Delete);

module.exports = router;
