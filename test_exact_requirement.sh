#!/bin/bash

DEVICE_ID="test-exact-$(date +%s)"
API_URL="https://social-coach-backend-production.up.railway.app"

echo "🎯 Testing EXACT User Requirement"
echo "================================="
echo "Requirement: 7 days → miss 2 → resume → only 14 more days to Coming Alive"
echo ""

# Build 7-day streak
echo "📈 Building 7-day streak..."
for i in {1..7}; do
  DATE=$(date -j -f "%Y-%m-%d" "2025-01-0$i" +"%Y-%m-%d" 2>/dev/null || date -d "2025-01-0$i" +"%Y-%m-%d")
  curl -s -X POST "$API_URL/api/data/challenge" \
    -H "Content-Type: application/json" \
    -d "{\"deviceId\":\"$DEVICE_ID\",\"challengeDate\":\"${DATE}T12:00:00Z\",\"challengeCompleted\":true}" > /dev/null
done

echo "Day 7: $(curl -s "$API_URL/api/clean/home/$DEVICE_ID?currentDate=2025-01-07" | grep -o '"socialZoneLevel":"[^"]*"' | sed 's/"socialZoneLevel":"//;s/"//')"

# Miss 2 days, resume on day 10
echo -e "\n⏸️  Missing 2 days (Jan 8-9)..."
curl -s -X POST "$API_URL/api/data/challenge" \
  -H "Content-Type: application/json" \
  -d "{\"deviceId\":\"$DEVICE_ID\",\"challengeDate\":\"2025-01-10T12:00:00Z\",\"challengeCompleted\":true}" > /dev/null

echo "Day 10 (resumed): $(curl -s "$API_URL/api/clean/home/$DEVICE_ID?currentDate=2025-01-10" | grep -o '"socialZoneLevel":"[^"]*"' | sed 's/"socialZoneLevel":"//;s/"//')"

# Add exactly 14 more days (Jan 11-24)
echo -e "\n🏃 Adding exactly 14 more days..."
for day in {11..24}; do
  DATE=$(date -j -f "%Y-%m-%d" "2025-01-$day" +"%Y-%m-%d" 2>/dev/null || date -d "2025-01-$day" +"%Y-%m-%d")
  curl -s -X POST "$API_URL/api/data/challenge" \
    -H "Content-Type: application/json" \
    -d "{\"deviceId\":\"$DEVICE_ID\",\"challengeDate\":\"${DATE}T12:00:00Z\",\"challengeCompleted\":true}" > /dev/null
done

RESULT=$(curl -s "$API_URL/api/clean/home/$DEVICE_ID?currentDate=2025-01-24")
ZONE=$(echo "$RESULT" | grep -o '"socialZoneLevel":"[^"]*"' | sed 's/"socialZoneLevel":"//;s/"//')
STREAK=$(echo "$RESULT" | grep -o '"currentStreak":[0-9]*' | sed 's/"currentStreak"://')

echo "After 14 more days (Day 24):"
echo "  Zone: $ZONE"
echo "  Current Streak: $STREAK"

echo -e "\n📊 RESULT:"
if [[ "$ZONE" == *"Coming Alive"* ]]; then
  echo "✅ PERFECT! User reached Coming Alive after exactly 14 more days!"
  echo "   This matches the requirement: 7 + (miss 2) + 14 = 21 total for Coming Alive"
else
  echo "❌ NOT WORKING AS REQUIRED"
  echo "   Expected: Coming Alive after 14 more days"
  echo "   Got: $ZONE"
  echo ""
  echo "   Current behavior: Requires full 21-day NEW streak after resuming"
  echo "   Required behavior: Only 14 more days (continuing from 7)"
fi

curl -s -X DELETE "$API_URL/api/data/clear/$DEVICE_ID" > /dev/null
