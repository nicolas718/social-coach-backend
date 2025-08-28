### Social Zone and Social Confidence – Product/Engineering Spec

#### Overview
- Social Zone represents the user's current social momentum tier.
- Social Confidence is a percentage designed to track with Social Zone and provide gradual day‑to‑day movement without volatility.
- All dates use the real server time. Server uses current date/time for all user activity logic.

#### Implementation Status: ✅ FULLY WORKING
- Grace period logic has been successfully implemented and tested for all social zone levels
- The system correctly maintains zone levels during grace periods and drops only one level when grace expires
- All endpoints (home, analytics, debug) use the unified `calculateSocialZoneLevel` function
- Verified working date: January 2025

---

### Social Zone

- Levels and base streak requirements:
  - Warming Up: 0+
  - Breaking Through: 7+
  - Coming Alive: 21+
  - Charming: 46+
  - Socialite: 90+

- Grace periods (days allowed to miss without zone drop):
  - Breaking Through: 3
  - Coming Alive: 4
  - Charming: 6
  - Socialite: 6
  - Warming Up: 0

- Upgrade rule:
  - When the user's current streak meets or exceeds the level's base requirement, the zone upgrades immediately.

- Drop rule with grace:
  - If the user misses days, we compute daysSinceActivity.
  - While daysSinceActivity ≤ grace for the user's previous best level, keep the current zone (in grace).
  - After daysSinceActivity > grace, drop exactly one level at a time (not multiple in a single step).

- Correctness guardrails:
  - All-time best streak is derived as max(stored_best_streak, computed_max_consecutive_streak from activity dates).
  - The clean home endpoint returns the exact zone level from the grace logic (no smoothing/softening).

#### Implementation Details
- **Core Function**: `calculateSocialZoneLevel(currentStreak, daysWithoutActivity, highestLevelAchieved, allTimeMaxStreak)`
  - Located in `server.js` lines 478-557
  - Returns: `{ level, isInGracePeriod, gracePeriodLeft }` or `{ level, isInGracePeriod, droppedFrom }`
- **Used by endpoints**:
  - `/api/clean/home/:deviceId` - Primary UI display
  - `/api/data/analytics/:deviceId` - Analytics view
  - `/api/debug/grace/:deviceId` - Debug testing

---

### Social Confidence

- Strictly linked to Social Zone, with within-zone progression and zone-linked decay.
- Zone bands (start → end within each zone):
  - Warming Up: 4% → 18%
  - Breaking Through: 20% → 32%
  - Coming Alive: 40% → 52%
  - Charming: 60% → 72%
  - Socialite: 80% → 90%
  - Global minimum floor: 2%

- Within-zone progression:
  - Based on current streak relative to that zone's range:
    - Example ranges: Warming Up [0..7), Breaking Through [7..21), Coming Alive [21..46), Charming [46..90), Socialite [90..∞)
  - Use a conservative easing curve so small early gains don't spike the percentage:
    - progress = ((streak - zoneStartStreak) / (zoneEndStreak - zoneStartStreak))^1.6
    - confidence = startPct + (endPct − startPct) × progress
  - When zone upgrades/downgrades, the band changes immediately and confidence re-maps using the new band.

- Decay (days since last activity):
  - During grace: 0.4% per missed day (gentle)
  - After grace: 1.2% per missed day (faster)
  - Applied after within-zone mapping; bounded by 2% minimum.
  - Still anchored to the current zone; once zone drops post-grace, the band changes and the percentage re-evaluates.

---

### Frontend Behavior

- HomeView:
  - Uses clean home endpoint to render week bar, current streak, and Social Zone label.
  - When challenge or opener is completed, refreshes home endpoint and triggers Analytics refresh.

- AnalyticsView:
  - Shows Social Confidence half wheel.
  - Shows skeleton only on first load; subsequent refreshes overlay a subtle "Refreshing…" banner while keeping current content to prevent flashing.

- Daily Challenge:
  - Loads only once per simulated day (persistent guard via @AppStorage key).
  - Reset streak clears the guard and loads a new challenge.

---

### Edge Cases and Guarantees

- One-day miss at high zone:
  - Zone remains at the higher level inside grace; confidence gently decays by 0.4% per day.
  - After grace, a single-level drop occurs; confidence re-maps to the lower band and continues to decay if inactivity continues (1.2%/day).

- Rapid activity after inactivity:
  - As soon as activity resumes, daysSinceActivity resets; within-zone progression recalculates on the next fetch.

- No multi-level drops in a single step:
  - Drops are evaluated one level at a time as grace windows expire.

---

### Tuning Parameters (server-side)

- Grace periods: configured per level (see above).
- Zone band start/end percentages:
  - Warming Up: 4→18; Breaking Through: 20→32; Coming Alive: 40→52; Charming: 60→72; Socialite: 80→90
- Progress curve exponent: 1.6
- Decay rates: 0.4%/day in grace, 1.2%/day after grace
- Global floor: 2%

Change requests: specify new numbers and I'll update the constants accordingly.

---

### Testing the Grace Period System

To test that grace periods are working correctly:

1. **Build a streak** to reach desired social zone
2. **Skip days** without completing activities to test grace period
3. **Verify zone maintains** during grace period days
4. **Confirm single-level drop** after grace expires

Example for "Breaking Through" (7-day streak, 3-day grace):
- Complete 7 days of activities → Zone: "Breaking Through"
- Skip 1-3 days → Zone should remain "Breaking Through"
- Skip 4th day → Zone drops to "Warming Up"

Use the debug endpoint for quick testing:
```
GET /api/debug/grace/:deviceId
```
