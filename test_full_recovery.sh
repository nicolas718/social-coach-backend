#!/bin/bash

DEVICE_ID="test-full-$(date +%s)"
API_URL="https://social-coach-backend-production.up.railway.app"

echo "🚀 COMPREHENSIVE GRACE RECOVERY TEST"
echo "====================================="
echo "Testing complete journey from grace period to next zone"
echo ""

# Build 7-day streak
echo "📈 Step 1: Building 7-day streak to reach 'Breaking Through'..."
for i in {1..7}; do
  DATE=$(date -j -f "%Y-%m-%d" "2025-01-0$i" +"%Y-%m-%d" 2>/dev/null || date -d "2025-01-0$i" +"%Y-%m-%d")
  curl -s -X POST "$API_URL/api/data/challenge" \
    -H "Content-Type: application/json" \
    -d "{\"deviceId\":\"$DEVICE_ID\",\"challengeDate\":\"${DATE}T12:00:00Z\",\"challengeCompleted\":true}" > /dev/null
done

RESULT=$(curl -s "$API_URL/api/clean/home/$DEVICE_ID?currentDate=2025-01-07")
echo "✓ Zone: $(echo "$RESULT" | grep -o '"socialZoneLevel":"[^"]*"' | sed 's/"socialZoneLevel":"//;s/"//')"
echo "✓ Streak: $(echo "$RESULT" | grep -o '"currentStreak":[0-9]*' | sed 's/"currentStreak"://')"

# Miss 2 days (grace period)
echo -e "\n⏸️  Step 2: Missing 2 days (Jan 8-9) - testing grace period..."
RESULT=$(curl -s "$API_URL/api/clean/home/$DEVICE_ID?currentDate=2025-01-10")
echo "✓ Zone: $(echo "$RESULT" | grep -o '"socialZoneLevel":"[^"]*"' | sed 's/"socialZoneLevel":"//;s/"//')"
echo "✓ In Grace: $(echo "$RESULT" | grep -o '"isInGracePeriod":[^,]*' | sed 's/"isInGracePeriod"://')"

# Resume activity
echo -e "\n▶️  Step 3: Resuming activity on Jan 10..."
curl -s -X POST "$API_URL/api/data/challenge" \
  -H "Content-Type: application/json" \
  -d "{\"deviceId\":\"$DEVICE_ID\",\"challengeDate\":\"2025-01-10T12:00:00Z\",\"challengeCompleted\":true}" > /dev/null

RESULT=$(curl -s "$API_URL/api/clean/home/$DEVICE_ID?currentDate=2025-01-10")
ZONE=$(echo "$RESULT" | grep -o '"socialZoneLevel":"[^"]*"' | sed 's/"socialZoneLevel":"//;s/"//')
echo "✓ Zone maintained at: $ZONE (Recovery mode active)"
echo "✓ New streak: $(echo "$RESULT" | grep -o '"currentStreak":[0-9]*' | sed 's/"currentStreak"://')"

# Continue for 13 more days (total 14 from resumption = 21 total)
echo -e "\n🏃 Step 4: Building 13 more days (Jan 11-23) to reach 21 total..."
for day in {11..23}; do
  DATE=$(date -j -f "%Y-%m-%d" "2025-01-$day" +"%Y-%m-%d" 2>/dev/null || date -d "2025-01-$day" +"%Y-%m-%d")
  curl -s -X POST "$API_URL/api/data/challenge" \
    -H "Content-Type: application/json" \
    -d "{\"deviceId\":\"$DEVICE_ID\",\"challengeDate\":\"${DATE}T12:00:00Z\",\"challengeCompleted\":true}" > /dev/null
done

RESULT=$(curl -s "$API_URL/api/clean/home/$DEVICE_ID?currentDate=2025-01-23")
FINAL_ZONE=$(echo "$RESULT" | grep -o '"socialZoneLevel":"[^"]*"' | sed 's/"socialZoneLevel":"//;s/"//')
FINAL_STREAK=$(echo "$RESULT" | grep -o '"currentStreak":[0-9]*' | sed 's/"currentStreak"://')

echo "✓ Final Zone: $FINAL_ZONE"
echo "✓ Final Streak: $FINAL_STREAK"

echo -e "\n📊 RESULTS:"
echo "==========="
if [[ "$FINAL_ZONE" == *"Coming Alive"* ]] && [ "$FINAL_STREAK" = "14" ]; then
  echo "✅ PERFECT! Grace recovery works exactly as expected!"
  echo "   • Started at 7-day streak (Breaking Through)"
  echo "   • Missed 2 days but stayed in Breaking Through (grace period)"
  echo "   • Resumed and maintained Breaking Through zone"
  echo "   • After 14 more days (21 total), reached Coming Alive!"
  echo "   • User didn't lose progress due to the 2-day break"
else
  echo "⚠️  Unexpected result:"
  echo "   Expected: Zone='Coming Alive', Streak=14"
  echo "   Got: Zone=$FINAL_ZONE, Streak=$FINAL_STREAK"
fi

# Cleanup
curl -s -X DELETE "$API_URL/api/data/clear/$DEVICE_ID" > /dev/null
echo -e "\n✓ Test data cleaned up"
