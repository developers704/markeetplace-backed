/**
 * Salary email controller
 * Handles POST /send-salary-emails request
 */

const salaryService = require('../services/salary.service');
const { parseCSV } = require('../utils/csv.parser');

exports.sendSalaryEmails = async (req, res) => {
  const logs = [];
  let successCount = 0;
  let failureCount = 0;

  try {
    const csvFile = req.files?.csv?.[0];
    const pdfFiles = req.files?.pdfs || [];

    // Input validation
    if (!csvFile) {
      return res.status(400).json({
        error: 'CSV file is required',
        successCount: 0,
        failureCount: 0,
        logs,
      });
    }

    if (!pdfFiles || pdfFiles.length === 0) {
      return res.status(400).json({
        error: 'At least one PDF file is required',
        successCount: 0,
        failureCount: 0,
        logs,
      });
    }

    // Parse CSV
    const employees = await parseCSV(csvFile.path);

    if (!employees || employees.length === 0) {
      return res.status(400).json({
        error: 'CSV is empty or invalid. Expected columns: name, email, pdf',
        successCount: 0,
        failureCount: 0,
        logs,
      });
    }
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // Send emails
    for (const employee of employees) {
      const { name, email, pdf } = employee;

      if (!name || !email || !pdf) {
        logs.push({ success: false, message: `Skipped: missing name/email/pdf for row` });
        failureCount++;
        continue;
      }
      
      const pdfFilename = pdf.trim();
      const normalize = (name) =>
      name.toLowerCase().trim().replace(/\s+/g, '');
      const pdfFilenameNorm = normalize(pdfFilename);


      const matchingPdf = pdfFiles.find((f) => {
        const originalName = f.originalname || f.filename;
         return normalize(originalName).includes(pdfFilenameNorm);
      });

      if (!matchingPdf) {
        logs.push({ success: false, message: `${email}: PDF not found (${pdfFilename})` });
        failureCount++;
        continue;
      }

      try {
        await salaryService.sendSalaryEmail({
          to: email,
          employeeName: name,
          pdfPath: matchingPdf.path,
          pdfFilename,
        });
        await sleep(1500);
        logs.push({ success: true, message: `${email}: Sent successfully` });
        successCount++;
      } catch (err) {
        console.error(`Failed to send to ${email}:`, err.message);
        logs.push({ success: false, message: `${email}: ${err.message}` });
        failureCount++;
      }
    }

    // Clean temp files
    await salaryService.cleanupTempFiles([csvFile.path, ...pdfFiles.map((f) => f.path)]);

    res.json({
      successCount,
      failureCount,
      logs,
    });
  } catch (err) {
    console.error('sendSalaryEmails error:', err);

    // Attempt cleanup on error
    try {
      const csvFile = req.files?.csv?.[0];
      const pdfFiles = req.files?.pdfs || [];
      const paths = [csvFile?.path, ...(pdfFiles || []).map((f) => f.path)].filter(Boolean);
      await salaryService.cleanupTempFiles(paths);
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr.message);
    }

    res.status(500).json({
      error: err.message || 'Failed to process request',
      successCount,
      failureCount,
      logs,
    });
  }
};
