#!/bin/bash

# Script to identify all remaining SQLite debug endpoints for systematic removal

echo "🔍 Searching for remaining SQLite debug endpoints..."

# Find all debug endpoints that use SQLite
grep -n "app\.get.*debug" "/Users/nicolasg/Desktop/social coach backend 1/social-coach-backend/server.js"
echo ""
grep -n "app\.post.*debug" "/Users/nicolasg/Desktop/social coach backend 1/social-coach-backend/server.js"
echo ""

# Count remaining SQLite operations  
echo "📊 Remaining SQLite operations:"
grep -c "db\.get\|db\.run\|db\.all" "/Users/nicolasg/Desktop/social coach backend 1/social-coach-backend/server.js"

echo "✅ Debug endpoint removal script complete"
