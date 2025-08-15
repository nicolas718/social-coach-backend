#!/bin/bash

DEVICE_ID="test-grace-debug-$(date +%s)"
API_URL="https://social-coach-backend-production.up.railway.app"

echo "🧪 Testing Grace Recovery with Debug"
echo "===================================="
echo "Device ID: $DEVICE_ID"
echo ""

# Step 1: Build 7-day streak
echo "📈 Building 7-day streak..."
for i in {1..7}; do
  DATE=$(date -j -f "%Y-%m-%d" "2025-01-0$i" +"%Y-%m-%d" 2>/dev/null || date -d "2025-01-0$i" +"%Y-%m-%d")
  curl -s -X POST "$API_URL/api/data/challenge" \
    -H "Content-Type: application/json" \
    -d "{\"deviceId\":\"$DEVICE_ID\",\"challengeDate\":\"${DATE}T12:00:00Z\",\"challengeCompleted\":true}" > /dev/null
done

# Get detailed debug info
echo -e "\n📊 Debug info after 7-day streak:"
curl -s "$API_URL/api/debug/grace/$DEVICE_ID?currentDate=2025-01-07" | python3 -m json.tool | head -20

# Miss 2 days and check grace
echo -e "\n⏸️  After missing 2 days (Jan 8-9):"
curl -s "$API_URL/api/debug/grace/$DEVICE_ID?currentDate=2025-01-10" | python3 -m json.tool | head -20

# Resume activity
echo -e "\n▶️  Resuming activity on Jan 10..."
curl -s -X POST "$API_URL/api/data/challenge" \
  -H "Content-Type: application/json" \
  -d "{\"deviceId\":\"$DEVICE_ID\",\"challengeDate\":\"2025-01-10T12:00:00Z\",\"challengeCompleted\":true}" > /dev/null

echo -e "\n🔍 Debug after resuming:"
curl -s "$API_URL/api/debug/grace/$DEVICE_ID?currentDate=2025-01-10" | python3 -m json.tool

# Cleanup
curl -s -X DELETE "$API_URL/api/data/clear/$DEVICE_ID" > /dev/null
