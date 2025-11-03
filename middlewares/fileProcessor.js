const csv = require('csv-parser');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

class CSVProcessor {
    // Read CSV file
    static async readCSV(filePath) {
        return new Promise((resolve, reject) => {
            const results = [];
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => results.push(data))
                .on('end', () => resolve(results))
                .on('error', (error) => reject(error));
        });
    }

    // Read Excel file
    static async readExcel(filePath) {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet);
            return data;
        } catch (error) {
            throw new Error('Error reading Excel file: ' + error.message);
        }
    }

    // Process uploaded file based on extension
    static async processFile(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        
        if (ext === '.csv') {
            return await this.readCSV(filePath);
        } else if (ext === '.xlsx' || ext === '.xls') {
            return await this.readExcel(filePath);
        } else {
            throw new Error('Unsupported file format');
        }
    }

    // Generate CSV content
    static generateCSV(data, headers) {
        let csv = headers.join(',') + '\n';
        data.forEach(row => {
            const values = headers.map(header => {
                const value = row[header] || '';
                return `"${value}"`;
            });
            csv += values.join(',') + '\n';
        });
        return csv;
    }

    // Generate Excel content
    static generateExcel(data, headers) {
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Warehouse Balance');
        return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    }
}

module.exports = CSVProcessor;
