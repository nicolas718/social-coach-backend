#!/bin/bash

DEVICE_ID="debug-prog-$(date +%s)"
API_URL="https://social-coach-backend-production.up.railway.app"

echo "🔍 Debugging Zone Progression"
echo "=============================="

# Build initial 7-day streak
for i in {1..7}; do
  DATE=$(date -j -f "%Y-%m-%d" "2025-01-0$i" +"%Y-%m-%d" 2>/dev/null || date -d "2025-01-0$i" +"%Y-%m-%d")
  curl -s -X POST "$API_URL/api/data/challenge" \
    -H "Content-Type: application/json" \
    -d "{\"deviceId\":\"$DEVICE_ID\",\"challengeDate\":\"${DATE}T12:00:00Z\",\"challengeCompleted\":true}" > /dev/null
done

echo "After 7 days:"
curl -s "$API_URL/api/debug/grace/$DEVICE_ID?currentDate=2025-01-07" | python3 -m json.tool | grep -E '"currentStreak"|"allTimeMaxStreak"|"lastAchievedLevel"|"level"'

# Miss 2 days, then resume
curl -s -X POST "$API_URL/api/data/challenge" \
  -H "Content-Type: application/json" \
  -d "{\"deviceId\":\"$DEVICE_ID\",\"challengeDate\":\"2025-01-10T12:00:00Z\",\"challengeCompleted\":true}" > /dev/null

echo -e "\nAfter resuming (Jan 10):"
curl -s "$API_URL/api/debug/grace/$DEVICE_ID?currentDate=2025-01-10" | python3 -m json.tool | grep -E '"currentStreak"|"allTimeMaxStreak"|"lastAchievedLevel"|"level"|"isRecovering"|"streakNeededToMaintain"'

# Add 6 more days (total 7 in new streak)
for day in {11..16}; do
  DATE=$(date -j -f "%Y-%m-%d" "2025-01-$day" +"%Y-%m-%d" 2>/dev/null || date -d "2025-01-$day" +"%Y-%m-%d")
  curl -s -X POST "$API_URL/api/data/challenge" \
    -H "Content-Type: application/json" \
    -d "{\"deviceId\":\"$DEVICE_ID\",\"challengeDate\":\"${DATE}T12:00:00Z\",\"challengeCompleted\":true}" > /dev/null
done

echo -e "\nAfter 7 days of new streak (should exit recovery):"
curl -s "$API_URL/api/debug/grace/$DEVICE_ID?currentDate=2025-01-16" | python3 -m json.tool | grep -E '"currentStreak"|"allTimeMaxStreak"|"lastAchievedLevel"|"level"|"isRecovering"'

# Add 7 more days (total 14 in new streak)
for day in {17..23}; do
  DATE=$(date -j -f "%Y-%m-%d" "2025-01-$day" +"%Y-%m-%d" 2>/dev/null || date -d "2025-01-$day" +"%Y-%m-%d")
  curl -s -X POST "$API_URL/api/data/challenge" \
    -H "Content-Type: application/json" \
    -d "{\"deviceId\":\"$DEVICE_ID\",\"challengeDate\":\"${DATE}T12:00:00Z\",\"challengeCompleted\":true}" > /dev/null
done

echo -e "\nAfter 14 days of new streak:"
curl -s "$API_URL/api/debug/grace/$DEVICE_ID?currentDate=2025-01-23" | python3 -m json.tool | grep -E '"currentStreak"|"allTimeMaxStreak"|"lastAchievedLevel"|"level"'

# Add 7 more days (total 21 in new streak)
for day in {24..30}; do
  DATE=$(date -j -f "%Y-%m-%d" "2025-01-$day" +"%Y-%m-%d" 2>/dev/null || date -d "2025-01-$day" +"%Y-%m-%d")
  curl -s -X POST "$API_URL/api/data/challenge" \
    -H "Content-Type: application/json" \
    -d "{\"deviceId\":\"$DEVICE_ID\",\"challengeDate\":\"${DATE}T12:00:00Z\",\"challengeCompleted\":true}" > /dev/null
done

echo -e "\nAfter 21 days of new streak (should be Coming Alive):"
curl -s "$API_URL/api/debug/grace/$DEVICE_ID?currentDate=2025-01-30" | python3 -m json.tool | grep -E '"currentStreak"|"allTimeMaxStreak"|"lastAchievedLevel"|"level"'

curl -s -X DELETE "$API_URL/api/data/clear/$DEVICE_ID" > /dev/null
