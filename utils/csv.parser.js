const fs = require('fs');
const csv = require('csv-parser'); // from csv-parser package

async function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const employees = [];
    fs.createReadStream(filePath)
      .pipe(csv(['name', 'email', 'pdf']))
      .on('data', (row) => {
        const name = (row.name || '').trim();
        const email = (row.email || '').trim();
        const pdf = (row.pdf || '').trim();
        if (name || email || pdf) {
          employees.push({ name, email, pdf });
        }
      })
      .on('end', () => {
        resolve(employees);
      })
      .on('error', (err) => reject(err));
  });
}

module.exports = { parseCSV };
