const fs = require('fs');

const deleteFile = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error(`Failed to delete file: ${filePath}`, err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

module.exports = { deleteFile };
