#!/bin/bash

# Deployment script for BidScents
# This script builds and runs the application in production mode

echo "🚀 BidScents Deployment Script"
echo "=============================="

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please create a .env file with the required environment variables."
    exit 1
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

echo "✓ Environment variables loaded"

# Build the application
echo ""
echo "📦 Building application..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo "✓ Build completed successfully"

# Start the production server
echo ""
echo "🌐 Starting production server..."
echo "Server will be available at: http://localhost:5000"
echo ""

# Run with environment variables
NODE_ENV=production node dist/index.js