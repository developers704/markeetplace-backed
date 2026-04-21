const fs = require('fs');
const { resolveAbsoluteFsPath } = require('./uploadPaths');

const deleteFile = (filePath) => {
  const abs = resolveAbsoluteFsPath(filePath);
  if (!abs) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    fs.unlink(abs, (err) => {
      if (err) {
        console.error(`Failed to delete file: ${abs}`, err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

module.exports = { deleteFile };
