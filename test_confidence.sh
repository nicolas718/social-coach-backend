#!/bin/bash

# Test Social Confidence calculation with different scenarios
DEVICE_ID="${1:-TEST-CONFIDENCE}"
BASE_URL="https://social-coach-backend-production.up.railway.app"

echo "=== TESTING SOCIAL CONFIDENCE CALCULATION ==="
echo "Device ID: $DEVICE_ID"
echo ""

# Clear existing data
echo "1. Clearing existing data..."
curl -X DELETE "$BASE_URL/api/data/clear/$DEVICE_ID" -s > /dev/null
sleep 1

echo ""
echo "2. Testing progression within Warming Up zone (0-6 days):"
echo ""

# Day 1
echo "Day 1 (1 streak):"
curl -X POST "$BASE_URL/api/data/challenge" \
  -H "Content-Type: application/json" \
  -d "{\"deviceId\":\"$DEVICE_ID\",\"challengeDate\":\"2025-01-15T00:00:00Z\",\"challengeCompleted\":true}" \
  -s > /dev/null
sleep 0.5
curl -s "$BASE_URL/api/data/analytics/$DEVICE_ID" | python3 -m json.tool | grep -E "currentStreak|socialZoneLevel|socialConfidencePercentage" | sed 's/^/  /'

# Day 3  
echo ""
echo "Day 3 (3 streak):"
curl -X POST "$BASE_URL/api/data/challenge" \
  -H "Content-Type: application/json" \
  -d "{\"deviceId\":\"$DEVICE_ID\",\"challengeDate\":\"2025-01-16T00:00:00Z\",\"challengeCompleted\":true}" \
  -s > /dev/null
curl -X POST "$BASE_URL/api/data/challenge" \
  -H "Content-Type: application/json" \
  -d "{\"deviceId\":\"$DEVICE_ID\",\"challengeDate\":\"2025-01-17T00:00:00Z\",\"challengeCompleted\":true}" \
  -s > /dev/null
sleep 0.5
curl -s "$BASE_URL/api/data/analytics/$DEVICE_ID" | python3 -m json.tool | grep -E "currentStreak|socialZoneLevel|socialConfidencePercentage" | sed 's/^/  /'

# Day 7 - should jump to Breaking Through
echo ""
echo "Day 7 (7 streak - should be Breaking Through):"
for i in 18 19 20 21; do
  curl -X POST "$BASE_URL/api/data/challenge" \
    -H "Content-Type: application/json" \
    -d "{\"deviceId\":\"$DEVICE_ID\",\"challengeDate\":\"2025-01-${i}T00:00:00Z\",\"challengeCompleted\":true}" \
    -s > /dev/null
done
sleep 0.5
curl -s "$BASE_URL/api/data/analytics/$DEVICE_ID" | python3 -m json.tool | grep -E "currentStreak|socialZoneLevel|socialConfidencePercentage" | sed 's/^/  /'

echo ""
echo "3. Testing grace period decay (miss 1 day):"
curl -s "$BASE_URL/api/data/analytics/$DEVICE_ID?currentDate=2025-01-23" | python3 -m json.tool | grep -E "currentStreak|socialZoneLevel|socialConfidencePercentage|isInGracePeriod" | sed 's/^/  /'

echo ""
echo "4. Testing after grace period (miss 4 days):"
curl -s "$BASE_URL/api/data/analytics/$DEVICE_ID?currentDate=2025-01-26" | python3 -m json.tool | grep -E "currentStreak|socialZoneLevel|socialConfidencePercentage" | sed 's/^/  /'

echo ""
echo "Done!"
