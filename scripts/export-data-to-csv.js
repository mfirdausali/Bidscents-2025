import pkg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create output directory for CSV files
const outputDir = path.join(__dirname, '..', 'data-exports');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Connect to PostgreSQL database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Tables in our database
const tables = [
  'users',
  'categories',
  'products',
  'product_images',
  'reviews',
  'orders',
  'order_items',
  'session',
  'bookmarks',
  'bids'
];

// Helper function to convert results to CSV
function convertToCSV(data) {
  const csvRows = [];
  
  // Get headers
  const headers = Object.keys(data[0] || {});
  csvRows.push(headers.join(','));
  
  // Add data rows
  for (const row of data) {
    const values = headers.map(header => {
      const val = row[header];
      // Handle null values and escape quotes in strings
      if (val === null) return '';
      if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
      return val;
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
}

async function exportTableToCSV(tableName) {
  try {
    console.log(`Exporting ${tableName} to CSV...`);
    const result = await pool.query(`SELECT * FROM ${tableName}`);
    
    if (result.rows.length === 0) {
      console.log(`No data found in table ${tableName}`);
      return;
    }
    
    const csvData = convertToCSV(result.rows);
    const filePath = path.join(outputDir, `${tableName}.csv`);
    
    fs.writeFileSync(filePath, csvData);
    console.log(`Exported ${result.rows.length} rows to ${filePath}`);
  } catch (error) {
    console.error(`Error exporting ${tableName}:`, error);
  }
}

async function exportAllTables() {
  try {
    console.log('Starting database export to CSV...');
    
    // Export each table
    for (const table of tables) {
      await exportTableToCSV(table);
    }
    
    console.log(`All tables exported to ${outputDir}`);
    await pool.end();
  } catch (error) {
    console.error('Export failed:', error);
    await pool.end();
  }
}

exportAllTables();