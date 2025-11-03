const express = require('express');
const router = express.Router();
const certificateController = require('../controllers/certificate.controller.js');
const authMiddleware = require('../middlewares/authMiddleware.js');
const {
  uploadCertificateRequest,
  uploadPresidentSignature,
  uploadCertificateImage,
  handleCertificateUploadError
} = require('../middlewares/certificateUpload.js');

router.post('/request', [authMiddleware,uploadCertificateRequest,handleCertificateUploadError], certificateController.requestCertificate);
router.post('/approve/:requestId', authMiddleware,uploadPresidentSignature, certificateController.approveCertificateRequest);
router.post('/reject/:requestId', authMiddleware, certificateController.rejectCertificateRequest);
router.get('/all', authMiddleware, certificateController.getAllCertificateRequests);
router.get('/course/:courseId', authMiddleware, certificateController.getCertificateByUserAndCourse);
router.get('/download/:certificateId', authMiddleware, certificateController.downloadCertificate);


module.exports = router;

