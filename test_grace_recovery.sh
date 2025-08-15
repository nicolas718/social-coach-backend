#!/bin/bash

DEVICE_ID="test-grace-recovery-$(date +%s)"
API_URL="https://social-coach-backend-production.up.railway.app"

echo "🧪 Testing Grace Recovery Feature"
echo "================================="
echo "Device ID: $DEVICE_ID"
echo ""

# Step 1: Build 7-day streak to reach Breaking Through
echo "📈 Step 1: Building 7-day streak..."
for i in {1..7}; do
  DATE=$(date -j -f "%Y-%m-%d" "2025-01-0$i" +"%Y-%m-%d" 2>/dev/null || date -d "2025-01-0$i" +"%Y-%m-%d")
  curl -s -X POST "$API_URL/api/data/challenge" \
    -H "Content-Type: application/json" \
    -d "{\"deviceId\":\"$DEVICE_ID\",\"challengeDate\":\"${DATE}T12:00:00Z\",\"challengeCompleted\":true}" > /dev/null
done

# Check status after 7 days
echo "Status after 7-day streak:"
RESULT=$(curl -s "$API_URL/api/clean/home/$DEVICE_ID?currentDate=2025-01-07")
echo "$RESULT" | grep -o '"socialZoneLevel":"[^"]*"' | sed 's/"socialZoneLevel":"//;s/"//'
echo "$RESULT" | grep -o '"currentStreak":[0-9]*' | sed 's/"currentStreak":/Streak: /'
echo ""

# Step 2: Miss 2 days (grace period)
echo "⏸️  Step 2: Missing 2 days (Jan 8-9)..."
echo "Status on Jan 10 (after missing 2 days):"
RESULT=$(curl -s "$API_URL/api/clean/home/$DEVICE_ID?currentDate=2025-01-10")
echo "$RESULT" | grep -o '"socialZoneLevel":"[^"]*"' | sed 's/"socialZoneLevel":"//;s/"//'
echo "$RESULT" | grep -o '"currentStreak":[0-9]*' | sed 's/"currentStreak":/Streak: /'
IS_IN_GRACE=$(echo "$RESULT" | grep -o '"isInGracePeriod":[^,]*' | sed 's/"isInGracePeriod":/In Grace: /')
echo "$IS_IN_GRACE"
echo ""

# Step 3: Resume activity on Jan 10
echo "▶️  Step 3: Resuming activity on Jan 10..."
curl -s -X POST "$API_URL/api/data/challenge" \
  -H "Content-Type: application/json" \
  -d "{\"deviceId\":\"$DEVICE_ID\",\"challengeDate\":\"2025-01-10T12:00:00Z\",\"challengeCompleted\":true}" > /dev/null

echo "Status after resuming:"
RESULT=$(curl -s "$API_URL/api/clean/home/$DEVICE_ID?currentDate=2025-01-10")
ZONE=$(echo "$RESULT" | grep -o '"socialZoneLevel":"[^"]*"' | sed 's/"socialZoneLevel":"//;s/"//')
STREAK=$(echo "$RESULT" | grep -o '"currentStreak":[0-9]*' | sed 's/"currentStreak"://')
echo "Zone: $ZONE"
echo "Streak: $STREAK"
echo ""

# Check if grace recovery is working
if [[ "$ZONE" == *"Breaking Through"* ]] && [ "$STREAK" = "1" ]; then
  echo "✅ GRACE RECOVERY WORKS!"
  echo "   - Zone maintained at 'Breaking Through' (not dropped to 'Warming Up')"
  echo "   - Streak correctly shows as 1 (restarted counting)"
  echo "   - User can continue building towards 'Coming Alive' (needs 20 more days)"
else
  echo "❌ Grace recovery may not be working correctly"
  echo "   Expected: Zone='Breaking Through', Streak=1"
  echo "   Got: Zone=$ZONE, Streak=$STREAK"
fi

# Cleanup
echo ""
echo "🧹 Cleaning up test data..."
curl -s -X DELETE "$API_URL/api/data/clear/$DEVICE_ID" > /dev/null
echo "Test complete!"
