# Final SQLite Cleanup - Systematic Removal Plan

## Current Status
- **Started with:** 268 SQLite operations
- **Currently:** 21 SQLite operations  
- **Remaining:** Debug/test endpoints only
- **iOS App:** 100% protected - all critical endpoints REPLACED

## Remaining Operations Analysis

### Category 1: Unused Helper Functions (SAFE TO REMOVE)
1. `calculateCurrentStreak()` - Line 734 - REPLACED with Supabase version

### Category 2: Debug Endpoints (SAFE TO REMOVE)
- `/api/debug/grace/:deviceId` 
- `/api/debug/query/:deviceId`
- `/api/debug/weekly-activity/:deviceId`
- `/api/debug/test-streak/:deviceId`
- `/api/debug/streak/:deviceId`
- `/api/debug/raw-data/:deviceId`
- `/api/debug/reset-user/:deviceId`
- `/api/debug/conversation-practice/:deviceId`
- `/api/debug/user/:deviceId`
- `/api/debug/fix-user/:deviceId`

### Category 3: Test Endpoints (SAFE TO REMOVE)
- `/api/test/database/:deviceId`
- `/api/simulated/home/:deviceId` (NOT used by iOS)

### Category 4: Infrastructure (SAFE TO REMOVE)
- SQLite imports: `const sqlite3 = require('sqlite3')`
- SQLite initialization: `const db = new sqlite3.Database()`
- Database files: `social_coach_data.sqlite`, `social_coach.db`

## Verification
✅ All iOS app endpoints REPLACED with Supabase equivalents
✅ All response formats preserved  
✅ All calculations maintained
✅ All functionality preserved
✅ Simulated date system preserved

## Final Steps
1. Remove debug/test endpoints
2. Remove SQLite infrastructure  
3. Remove SQLite from package.json
4. Delete SQLite database files
5. Validate 0 SQLite references remain
