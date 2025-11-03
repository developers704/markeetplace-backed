# Bulk Product Import System

## Overview
This system allows you to import multiple products at once using CSV files. The system handles variant creation, category management, and all product-related data automatically.

## API Endpoints

### 1. Get CSV Template
**GET** `/api/bulk-products/template`

Returns the CSV template structure and sample data.

**Response:**
```json
{
  "headers": ["name", "brand", "description", "sku", ...],
  "sampleData": { ... },
  "instructions": { ... }
}
```

### 2. Import Products from CSV
**POST** `/api/bulk-products/import`

Upload a CSV file to import products in bulk.

**Request:**
- Content-Type: `multipart/form-data`
- Field: `csvFile` (CSV file)

**Response:**
```json
{
  "message": "Bulk import completed",
  "summary": {
    "totalRows": 100,
    "successCount": 95,
    "errorCount": 5,
    "successRate": "95.00%"
  },
  "errors": [
    {
      "row": 10,
      "error": "SKU already exists",
      "data": { ... }
    }
  ]
}
```

## CSV Format

### Required Fields
- `name`: Product name
- `sku`: Unique product SKU

### Optional Fields
- `brand`: Brand name (will be created if doesn't exist)
- `description`: Product description
- `prices`: JSON array of prices with city, amount, and optional salePrice
- `currency`: Currency code (default: USD)
- `category`: Comma-separated category names
- `subcategory`: Comma-separated subcategory names
- `subsubcategory`: Comma-separated subsubcategory names
- `videoLink`: Video URL
- `variants`: JSON array of variants with name and value
- `lifecycleStage`: active, discontinued, upcoming, archived (default: active)
- `tags`: Comma-separated tags
- `variationId`: Custom variation ID
- `meta_title`: SEO meta title
- `meta_description`: SEO meta description
- `image_alt_text`: Image alt text
- `product_url`: Product URL slug

### CSV Example
```csv
name,brand,description,sku,prices,currency,category,subcategory,subsubcategory,videoLink,variants,lifecycleStage,tags,variationId,meta_title,meta_description,image_alt_text,product_url
"Sample Product","Sample Brand","Product description","SKU-001","100:90","USD","Electronics,Accessories","Mobile,Chargers","iPhone,USB-C","https://example.com/video.mp4","Color:Red","active","electronics,mobile,premium","VAR-001","Sample Product - Best Quality","High quality sample product","Sample product image","sample-product"
```

## Data Processing Logic

### Variants
- If variant name doesn't exist, it will be created
- If variant value doesn't exist, it will be created
- Variants are linked to products automatically

### Categories
- Categories are created if they don't exist
- Subcategories require a parent category
- Subsubcategories require a parent subcategory

### Brands
- Brands are created if they don't exist
- Brand names must be unique

### Tags
- Tags are created if they don't exist
- Tags are linked to products automatically

### Prices
- Prices format: "Amount:SalePrice" (e.g., "100:90" for $100 with $90 sale price)
- City ID is automatically set to the default city (67400e8a7b963a1282d218b5)
- Only one price per product (using the default city)

## Error Handling

The system provides detailed error reporting:
- Row-by-row error tracking
- Specific error messages
- Data that caused the error
- Success/failure statistics

## File Upload Limits

- Maximum file size: 10MB
- Only CSV files are allowed
- Files are automatically cleaned up after processing

## Security

- Authentication required
- Permission-based access control
- File validation and sanitization

## Usage Examples

### Using curl
```bash
# Get template
curl -X GET "http://localhost:5000/api/bulk-products/template" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Import products
curl -X POST "http://localhost:5000/api/bulk-products/import" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "csvFile=@products.csv"
```

### Using JavaScript/Fetch
```javascript
// Get template
const templateResponse = await fetch('/api/bulk-products/template', {
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  }
});
const template = await templateResponse.json();

// Import products
const formData = new FormData();
formData.append('csvFile', csvFile);

const importResponse = await fetch('/api/bulk-products/import', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: formData
});
const result = await importResponse.json();
```

## Notes

1. **SKU Uniqueness**: Each SKU must be unique across all products
2. **City Requirements**: All cities in prices must exist in the database
3. **Category Hierarchy**: Subcategories require parent categories, subsubcategories require parent subcategories
4. **Variant Management**: Variants are automatically created and linked
5. **File Cleanup**: Uploaded files are automatically deleted after processing
6. **Error Recovery**: Failed rows don't affect successful imports

## Troubleshooting

### Common Issues
1. **SKU Already Exists**: Check for duplicate SKUs in your CSV
2. **Invalid Price Format**: Use "Amount:SalePrice" format (e.g., "100:90")
3. **Invalid Variant Format**: Use "VariantName:Value" format (e.g., "Color:Red")
4. **File Size**: Ensure CSV file is under 10MB
5. **Permission Denied**: Check user permissions for product management

### Best Practices
1. Test with a small CSV file first
2. Validate your data before uploading
3. Keep backups of your CSV files
4. Monitor the import results for errors
5. Use the template endpoint to understand the format
