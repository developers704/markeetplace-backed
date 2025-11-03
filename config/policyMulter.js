const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Use memory storage initially to avoid saving files before validation
const memoryStorage = multer.memoryStorage();

// Configure multer with memory storage
const upload = multer({
    storage: memoryStorage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept only images and PDFs
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and PDF are allowed.'));
        }
    }
});

// Function to save file to disk after validation
const saveFileToDisk = (file, customerId, policyId) => {
    return new Promise((resolve, reject) => {
        // Create directory if it doesn't exist
        const uploadDir = path.join(__dirname, '../uploads/policy_documents');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        // Generate unique filename
        const timestamp = Date.now();
        const fileExt = file.originalname.split('.').pop();
        const filename = `policy_${policyId}_customer_${customerId}_${timestamp}.${fileExt}`;
        const filepath = path.join(uploadDir, filename);
        
        // Write file to disk
        fs.writeFile(filepath, file.buffer, (err) => {
            if (err) {
                return reject(err);
            }
            
            // Return the relative path to store in database
            const relativePath = `policy_documents/${filename}`;
            resolve(relativePath);
        });
    });
};

module.exports = {
    upload,
    saveFileToDisk
};
