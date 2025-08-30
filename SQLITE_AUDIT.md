# SQLite Removal Audit - Complete Inventory

## SQLite Dependencies Found

### 1. Imports and Database Initialization
- `const sqlite3 = require('sqlite3').verbose();` (Line 6)
- `const db = new sqlite3.Database(dbPath);` (Line 197)
- All table creation and migration code (Lines 210-347)

### 2. Helper Functions Still Using SQLite
- `ensureUserExists()` - Still uses SQLite db.get and db.run
- `updateUserStreak()` - Still uses SQLite for streak calculations  
- `updateUserStreakWithCallback()` - Still uses SQLite
- `calculateCurrentStreak()` - Still uses SQLite queries

### 3. Endpoints Still Using SQLite (CRITICAL)
Found these endpoints still have SQLite operations:

#### Analytics Endpoint (MAJOR)
- `/api/data/analytics/:deviceId` - Complex analytics calculations from SQLite

#### Debug Endpoints  
- `/api/debug/all-activities/:deviceId` - Activity history
- `/api/debug/activity/:deviceId` - Activity data
- `/api/debug/query/:deviceId` - Debug queries
- `/api/debug/weekly-activity/:deviceId` - Weekly stats
- `/api/debug/streak/:deviceId` - Streak debugging
- `/api/debug/raw-data/:deviceId` - Raw data access
- `/api/debug/user/:deviceId` - User info
- `/api/debug/reset-user/:deviceId` - User reset
- `/api/debug/test-streak/:deviceId` - Streak testing
- `/api/debug/conversation-practice/:deviceId` - Conversation debug
- `/api/debug/fix-user/:deviceId` - User fixes

#### Secondary Read Endpoints
- `/api/data/home/:deviceId` - Alternative home endpoint
- `/api/simulated/home/:deviceId` - Simulated home data  
- `/api/test/database/:deviceId` - Database testing
- `/api/data/development-progress/:deviceId` - Development progress

#### Administrative Endpoints
- `/api/debug/reset-user/:deviceId` - Admin user reset

## Migration Priority

### CRITICAL (Affects Core App Function)
1. **Analytics endpoint** - Major iOS app dependency
2. **Helper functions** - Used by multiple endpoints
3. **Alternative home endpoints** - May be fallback paths

### MEDIUM (Debug/Development)  
1. **Debug endpoints** - Used for development and testing
2. **Test endpoints** - Development utilities

### LOW (Administrative)
1. **Admin endpoints** - Backend management

## Strategy
1. Migrate analytics endpoint completely
2. Replace SQLite helper functions with Supabase versions
3. Migrate or remove debug endpoints  
4. Remove all SQLite imports and initialization
5. Delete SQLite database files
