# Remaining 24 SQLite Operations - Systematic Analysis

## Category 1: CRITICAL iOS DEPENDENCIES (MUST REPLACE)
1. **`/api/data/home/:deviceId`** (Lines 2320+) → iOS HomeScreenService fallback
2. **Need to verify:** `/api/simulated/home/:deviceId` → iOS simulated date system?

## Category 2: DEBUG ENDPOINTS (SAFE TO REMOVE)
1. **`calculateCurrentStreak()` function** (Line 734) → Unused helper
2. **`/api/debug/all-activities/:deviceId`** (Line 919) → Debug only
3. **`/api/debug/grace/:deviceId`** (Line 949) → Debug only  
4. **`/api/debug/query/:deviceId`** (Line 1804) → Debug only
5. **`/api/test/database/:deviceId`** (Line 2269) → Test only
6. **`/api/debug/weekly-activity/:deviceId`** (Line 2459) → Debug only
7. **`/api/debug/test-streak/:deviceId`** (Lines 2588, 2603, 2622) → Debug only
8. **`/api/debug/streak/:deviceId`** (Lines 2645, 2664) → Debug only
9. **`/api/debug/raw-data/:deviceId`** (Lines 2687, 2699) → Debug only
10. **`/api/debug/reset-user/:deviceId`** (Lines 3312, 3322, 3332) → Debug only
11. **`/api/debug/conversation-practice/:deviceId`** (Line 3369) → Debug only
12. **`/api/debug/user/:deviceId`** (Line 4113) → Debug only
13. **`/api/debug/fix-user/:deviceId`** (Line 4146) → Debug only

## Category 3: HELPER FUNCTIONS (SAFE TO REMOVE)
- Various helper function remnants (Line 4026)

## Strategy
1. REPLACE critical iOS dependencies first
2. REMOVE debug endpoints (safe - not used by iOS)
3. REMOVE unused helper functions
4. REMOVE SQLite infrastructure (imports, initialization)
