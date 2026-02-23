/**
 * Salary email routes
 */

const express = require('express');
const router = express.Router();
const salaryController = require('../controllers/salary.controller');
const { uploadMiddleware } = require('../middlewares/upload.middleware');

// Wrap multer to catch errors and pass to error handler
const uploadWithErrorHandling = (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (err) return next(err);
    next();
  });
};

// POST /api/send-salary-emails - Send salary emails
router.post(
  '/send-salary-emails',
  uploadWithErrorHandling,
  salaryController.sendSalaryEmails
);

module.exports = router;
