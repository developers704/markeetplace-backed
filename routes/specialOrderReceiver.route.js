const express = require('express');
const router = express.Router();
const uploadMiddleware = require('../middlewares/uploadMiddleware');
const adminLogger = require('../middlewares/adminLogger');
const { listRecivers , setReceiver ,toggleReceiver, deleteReceiver } = require('../controllers/specialOrderReceiver.controller')

router.post('/create', setReceiver );
router.get('/get', listRecivers );
router.patch('/:id/toggle',toggleReceiver );
router.delete('/:id', deleteReceiver );

module.exports = router;

