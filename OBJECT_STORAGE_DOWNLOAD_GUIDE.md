# Object Storage Download Guide

This guide explains how to download all files from your object storage to your local computer.

## What Files Will Be Downloaded

Your app stores files in two separate object storage buckets:

1. **Main Bucket** - Contains:
   - Product images (from product listings)
   - User profile photos
   - User cover photos

2. **Message Bucket** - Contains:
   - Files attached to messages between users

## Download Options

### Option 1: Basic Download
Downloads only files that are tracked in your database.

```bash
node scripts/download-all-files.js
```

### Option 2: Enhanced Download  
Downloads database-tracked files plus attempts to discover additional files.

```bash
node scripts/download-with-discovery.js
```

### Option 3: Interactive Script
Run the interactive script to choose your download method:

```bash
./scripts/run-download.sh
```

## What You Need

1. **Database Access**: Your `DATABASE_URL` environment variable must be set
2. **Object Storage Access**: The script uses your existing object storage configuration
3. **Disk Space**: Ensure you have enough space for all files

## Where Files Are Downloaded

### Basic Download
Files are organized in the `downloads/` folder:
```
downloads/
├── product-images/     # Product listing images
├── profile-images/     # User profile photos  
├── cover-photos/       # User cover photos
├── message-files/      # Message attachments
├── unknown/           # Unclassified files
└── download-summary.txt
```

### Enhanced Download
Files are organized in the `downloads-enhanced/` folder:
```
downloads-enhanced/
├── product-images/     # Product listing images
├── profile-images/     # User profile photos
├── cover-photos/       # User cover photos  
├── message-files/      # Message attachments
├── discovered/         # Additional discovered files
└── enhanced-download-summary.txt
```

## Enhanced Features

The enhanced download script includes:
- **Metadata Files**: Each downloaded file gets a `.metadata.json` file with details
- **File Type Detection**: Automatically detects file types from binary signatures
- **Smart Discovery**: Attempts to find files not tracked in the database
- **Detailed Reporting**: Comprehensive summary of what was downloaded

## File Organization

Files are automatically organized by type and include:
- Original file names when available
- Proper file extensions (detected automatically)
- Metadata about the file source (enhanced mode only)

## Running the Downloads

1. **Make sure your database is accessible**:
   ```bash
   echo $DATABASE_URL
   ```

2. **Choose your download method**:
   ```bash
   # Interactive (recommended for first-time users)
   ./scripts/run-download.sh
   
   # Or run directly
   node scripts/download-all-files.js
   ```

3. **Monitor the progress**: The scripts provide detailed console output showing:
   - Files being downloaded
   - Success/failure status
   - File sizes
   - Final summary

## Understanding the Results

### Download Summary
Each script generates a summary file showing:
- Number of files found in database
- Number of files successfully downloaded
- Success rate percentage
- Location of downloaded files

### Success Rate
- **100%**: All database-tracked files were successfully downloaded
- **<100%**: Some files in the database no longer exist in object storage

### Common Scenarios
- **Files not found**: Normal if files were deleted from storage but references remain in database
- **Zero downloads**: Check your database connection and object storage configuration

## Moving Files After Download

Once downloaded, you can:
1. **Copy to external storage**: USB drive, external hard drive
2. **Upload to cloud storage**: Google Drive, Dropbox, etc.
3. **Archive**: Create zip files for easier handling
4. **Backup**: Store in multiple locations for safety

## Troubleshooting

### Database Connection Issues
```bash
# Check if database is accessible
node scripts/check-env.js
```

### Permission Issues
```bash
# Make script executable
chmod +x scripts/run-download.sh
```

### Storage Space Issues
Check available disk space before running:
```bash
df -h .
```

## Security Notes

- Downloaded files maintain their original content
- Metadata files contain database information (enhanced mode)
- No passwords or sensitive authentication data is included
- File contents are preserved exactly as stored

## Next Steps

After downloading your files:
1. Verify the download summary
2. Test a few files to ensure they open correctly
3. Create backups of the downloaded folder
4. Move files to your preferred storage location

The download folder structure makes it easy to understand what each file was used for in your application.