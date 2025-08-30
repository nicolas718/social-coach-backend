# Social Coach Backend: SQLite to Supabase Migration Plan

## Current Status
**Date:** January 12, 2025  
**Migration Type:** SQLite → Supabase PostgreSQL  
**Deployment:** Railway (auto-deploy from GitHub)

## Critical Issue Identified
**Data Flow Disconnect:** Write operations use Supabase, Read operations use SQLite
- iOS App submits challenges → Saved to Supabase ✅
- iOS App loads home screen → Reads from SQLite ❌ (empty database)
- Result: Streak shows 0 despite successful submissions

## iOS App API Contract Requirements

### HomeScreenData Response Format
```swift
HomeScreenData {
    currentStreak: Int              // User's current consecutive day streak
    socialZoneLevel: String         // "Warming Up", "Breaking Through", etc.
    weeklyActivity: [String]        // 7-day array: ["none", "streak", "missed", "activity"]
    hasActivityToday: Bool          // Whether user has activity today
}
```

### Critical Endpoints iOS App Depends On
1. **`/api/clean/home/:deviceId`** - Main screen data (currentStreak, weeklyActivity, zone)
2. **`/api/data/analytics/:deviceId`** - Analytics screen 
3. **`/api/data/opener-library/:deviceId`** - Opener library with success rates
4. **`/api/data/challenge`** - Challenge submission (✅ MIGRATED)
5. **`/api/data/opener`** - Opener logging (✅ MIGRATED)  
6. **`/api/data/development`** - Module progress (✅ MIGRATED)
7. **`/api/conversation-practice/:deviceId`** - Practice scenarios (✅ MIGRATED)
8. **`/api/data/clear/:deviceId`** - Reset/clear data (✅ MIGRATED)

## Migration Strategy

### Phase 1: Critical Read Endpoints (IMMEDIATE)
**Priority 1:** `/api/clean/home/:deviceId`
- Issue: Reads user from Supabase but activity data from SQLite
- Fix: Migrate all activity queries to Supabase
- Impact: Fixes streak display, week bar, social zone calculation

**Priority 2:** `/api/data/analytics/:deviceId`  
- Issue: All calculations use SQLite data
- Fix: Migrate all data queries and calculations to Supabase
- Impact: Fixes analytics screen data

**Priority 3:** `/api/data/opener-library/:deviceId`
- Issue: Reads opener history from SQLite
- Fix: Migrate opener history queries to Supabase  
- Impact: Fixes opener library success rates and history

### Phase 2: Validation & Testing
1. End-to-end testing of all iOS app functionality
2. Simulated date system testing
3. Data consistency validation
4. Performance testing

### Phase 3: Cleanup
1. Remove SQLite dependencies
2. Remove debug/test endpoints
3. Production readiness checks

## Data Consistency Requirements
- **Streak Calculation:** Must be identical to current SQLite logic
- **Week Bar Logic:** Must preserve current color logic  
- **Social Zone Calculation:** Must preserve grace period logic
- **Simulated Date Support:** Must work with debug date system
- **Response Formats:** Must match exact iOS Swift model structures

## Testing Requirements
- **Postman validation** of all migrated endpoints
- **iOS app testing** of all user flows
- **Simulated date testing** with debug buttons
- **Data persistence validation** in Supabase
- **Performance benchmarking** vs SQLite

## Success Criteria
✅ All iOS app functionality works identically to before migration  
✅ Streak calculations are 100% accurate  
✅ Simulated date system works perfectly  
✅ All data persists correctly in Supabase  
✅ No breaking changes for iOS app (same endpoints, same responses)
