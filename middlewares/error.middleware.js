/**
 * Global error handling middleware
 */

exports.errorHandler = (err, req, res, next) => {
  console.error('Error:', err.message);

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: 'File too large. Max 10MB per file.',
      successCount: 0,
      failureCount: 0,
      logs: [],
    });
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      error: 'Too many files.',
      successCount: 0,
      failureCount: 0,
      logs: [],
    });
  }

  // Generic 500
  res.status(500).json({
    error: err.message || 'Internal server error',
    successCount: 0,
    failureCount: 0,
    logs: [],
  });
};
