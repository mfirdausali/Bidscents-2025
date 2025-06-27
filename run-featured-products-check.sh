#!/bin/bash

# BidScents Featured Products Monitoring Script
# This script runs the featured products checker and saves output to a timestamped file

echo "🚀 Starting BidScents Featured Products Check..."
echo "================================================"

# Create reports directory if it doesn't exist
mkdir -p reports

# Generate timestamp for filename
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
REPORT_FILE="reports/featured_products_report_${TIMESTAMP}.txt"

# Run the check and save to file
echo "📊 Running featured products analysis..."
node check-featured-products.js | tee "$REPORT_FILE"

echo ""
echo "✅ Report saved to: $REPORT_FILE"
echo ""

# Check if there are any critical issues
if grep -q "CRITICAL" "$REPORT_FILE"; then
    echo "🚨 CRITICAL ISSUES DETECTED - Review report immediately!"
elif grep -q "⚠️" "$REPORT_FILE"; then
    echo "⚠️ WARNING: Issues found that need attention"
else
    echo "✅ No critical issues detected"
fi

echo ""
echo "📋 Quick summary from latest report:"
echo "=================================="
tail -20 "$REPORT_FILE" | grep -E "(Total featured products|Currently active|Expired|Expiring|Boost purchases|Revenue)"

echo ""
echo "📁 All reports are saved in the 'reports/' directory"
echo "🔄 Run this script regularly to monitor system health"