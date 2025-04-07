import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as os from 'os';

// For Replit database
const { Client } = require('@replit/database')
const db = new Client();
const writeFileAsync = util.promisify(fs.writeFile);
const readFileAsync = util.promisify(fs.readFile);
const mkdirAsync = util.promisify(fs.mkdir);

// Get the temporary directory
const tempDir = path.join(os.tmpdir(), 'product-images');

// Ensure the temp directory exists
async function ensureTempDirExists() {
  try {
    await mkdirAsync(tempDir, { recursive: true });
  } catch (err: any) {
    // If directory already exists, ignore the error
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }
}

// Generate a unique file name
function generateUniqueFileName(originalName: string): string {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const ext = path.extname(originalName);
  return `${timestamp}-${randomString}${ext}`;
}

// Store a file in Replit Object Storage
export async function storeFile(fileBuffer: Buffer, originalName: string): Promise<string> {
  await ensureTempDirExists();
  
  const fileName = generateUniqueFileName(originalName);
  const filePath = path.join(tempDir, fileName);
  
  // Write file to temp directory
  await writeFileAsync(filePath, fileBuffer);
  
  // Get the file data
  const fileData = await readFileAsync(filePath);
  
  // Store in Replit's Object Storage (using the database client)
  const storagePath = `product-images/${fileName}`;
  await db.set(storagePath, fileData.toString('base64'));
  
  // Return the path to access this file
  return storagePath;
}

// Get a file from Replit Object Storage
export async function getFile(storagePath: string): Promise<Buffer | null> {
  try {
    const fileDataBase64 = await db.get(storagePath);
    if (!fileDataBase64) return null;
    
    // Convert any response to string and then to buffer
    const dataString = String(fileDataBase64);
    return Buffer.from(dataString, 'base64');
  } catch (error) {
    console.error('Error retrieving file from storage:', error);
    return null;
  }
}

// Delete a file from Replit Object Storage
export async function deleteFile(storagePath: string): Promise<boolean> {
  try {
    await db.delete(storagePath);
    return true;
  } catch (error) {
    console.error('Error deleting file from storage:', error);
    return false;
  }
}