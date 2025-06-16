#!/bin/bash

# Object Storage Download Script Runner
# This script helps you download all files from your object storage

echo "==================================="
echo "Object Storage Download Tool"
echo "==================================="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL environment variable is not set"
    echo "Please make sure your database is configured"
    exit 1
fi

echo "Choose download option:"
echo "1. Basic download (database-tracked files only)"
echo "2. Enhanced download (with file discovery)"
echo "3. Both options"
echo ""
read -p "Enter your choice (1-3): " choice

case $choice in
    1)
        echo "Starting basic download..."
        node scripts/download-all-files.js
        ;;
    2)
        echo "Starting enhanced download..."
        node scripts/download-with-discovery.js
        ;;
    3)
        echo "Starting basic download..."
        node scripts/download-all-files.js
        echo ""
        echo "Starting enhanced download..."
        node scripts/download-with-discovery.js
        ;;
    *)
        echo "Invalid choice. Exiting."
        exit 1
        ;;
esac

echo ""
echo "Download completed! Check the downloads folder(s) for your files."