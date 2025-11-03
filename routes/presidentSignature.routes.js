const  express = require('express');
const router = express.Router();
const presidentSignatureController = require('../controllers/presidentSignature.controller');
const authMiddleware = require('../middlewares/authMiddleware');
const { uploadPresidentSignature } = require('../middlewares/certificateUpload');

router.post('/upload', [authMiddleware, uploadPresidentSignature], presidentSignatureController.uploadPresidentSignature);
router.get('/', authMiddleware, presidentSignatureController.getPresidentSignature);
router.delete('/delete', authMiddleware, presidentSignatureController.deletePresidentSignature);

module.exports = router;