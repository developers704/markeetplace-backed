# Bulk Other Products Import System

## Overview
This system allows you to import multiple "other products" (special products) at once using CSV files. The system handles variant creation, special category management, and all other product-related data automatically.

## API Endpoints

### 1. Get CSV Template
**GET** `/api/bulk-other-products/template`

Returns the CSV template structure and sample data.

**Response:**
```json
{
  "headers": ["name", "sku", "type", "specialCategory", ...],
  "sampleData": { ... },
  "instructions": { ... }
}
```

### 2. Import Other Products from CSV
**POST** `/api/bulk-other-products/import`

Upload a CSV file to import other products in bulk.

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
    "skippedCount": 3,
    "errorCount": 2,
    "successRate": "95.00%"
  },
  "errors": [
    {
      "row": 10,
      "error": "Required field missing",
      "data": { ... }
    }
  ]
}
```

## CSV Format

### Required Fields
- `name`: Product name
- `sku`: Unique product SKU
- `type`: Product type (supplies, GWP, marketing, tool finding)
- `specialCategory`: Special category name

### Optional Fields
- `specialCategoryType`: Special category type (inventory, supplies, packages-gws, marketing, tool finding)
- `specialSubcategory`: Special subcategory name
- `unitSize`: Unit size description
- `prices`: Price format "Amount:BuyPrice:SalePrice"
- `description`: Product description
- `image`: Main product image URL
- `gallery`: Comma-separated gallery image URLs
- `link`: Product link URL
- `stock`: Stock quantity
- `level`: Product level
- `productVariants`: Variant format "VariantName:Value"
- `status`: Product status (active, inactive)
- `isActive`: Boolean (true, false)

### CSV Example
```csv
name,sku,type,specialCategory,specialCategoryType,specialSubcategory,unitSize,prices,description,image,gallery,link,stock,level,productVariants,status,isActive
"Sample Other Product","OTHER-001","supplies","Electronics","inventory","Mobile Accessories","Large","100:80:90","Sample other product description","https://example.com/image.jpg","image1.jpg,image2.jpg","https://example.com/product","50","Beginner","Color:Red","active","true"
```

## Data Processing Logic

### Special Categories
- Special categories are created if they don't exist
- Special subcategories require a parent special category
- Duplicates are skipped silently

### Variants
- If variant name doesn't exist, it will be created
- If variant value doesn't exist, it will be created
- Variants are linked to products automatically
- Duplicates are skipped silently

### Prices
- Prices format: "Amount:BuyPrice:SalePrice" (e.g., "100:80:90")
- City ID is automatically set to the default city (67400e8a7b963a1282d218b5)
- Only one price per product (using the default city)

### Product Types
- `supplies`: Supply products
- `GWP`: Gift with purchase
- `marketing`: Marketing materials
- `tool finding`: Tool finding products

## Error Handling

The system provides detailed error reporting:
- Row-by-row error tracking
- Specific error messages
- Data that caused the error
- Success/failure statistics
- Duplicate products are skipped silently

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
curl -X GET "http://localhost:5000/api/bulk-other-products/template" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Import other products
curl -X POST "http://localhost:5000/api/bulk-other-products/import" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "csvFile=@other-products.csv"
```

### Using JavaScript/Fetch
```javascript
// Get template
const templateResponse = await fetch('/api/bulk-other-products/template', {
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  }
});
const template = await templateResponse.json();

// Import other products
const formData = new FormData();
formData.append('csvFile', csvFile);

const importResponse = await fetch('/api/bulk-other-products/import', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: formData
});
const result = await importResponse.json();
```

## Notes

1. **SKU Uniqueness**: Each SKU must be unique across all other products
2. **Product Types**: Must be one of: supplies, GWP, marketing, tool finding
3. **Special Categories**: Are created automatically if they don't exist
4. **Variant Management**: Variants are automatically created and linked
5. **File Cleanup**: Uploaded files are automatically deleted after processing
6. **Error Recovery**: Failed rows don't affect successful imports
7. **Duplicate Handling**: Duplicates are skipped silently without errors

## Troubleshooting

### Common Issues
1. **SKU Already Exists**: Check for duplicate SKUs in your CSV
2. **Invalid Product Type**: Use only: supplies, GWP, marketing, tool finding
3. **Invalid Price Format**: Use "Amount:BuyPrice:SalePrice" format
4. **Invalid Variant Format**: Use "VariantName:Value" format
5. **File Size**: Ensure CSV file is under 10MB
6. **Permission Denied**: Check user permissions for product management

### Best Practices
1. Test with a small CSV file first
2. Validate your data before uploading
3. Keep backups of your CSV files
4. Monitor the import results for errors
5. Use the template endpoint to understand the format
6. Ensure SKUs are unique across all products
7. Use valid product types only
