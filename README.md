# Social Coach Backend

Backend API for the Social Coach iOS app. Generates conversation openers and quick suggestions using Replicate AI.

## Documentation
- [Social Zone & Social Confidence Product Spec](./PRODUCT_SPEC.md) - Detailed specification for the streak and zone system

## Simulated Date & Debug System

### Overview
The app includes a comprehensive debug system that allows testing streak mechanics, social zones, and grace periods without waiting for real days to pass. This system works by simulating time progression while maintaining all production functionality.

### How It Works

#### Frontend (iOS)
- **SimulatedDateService**: Manages a simulated date that can be different from the current date
- **Debug Controls**: UI buttons in HomeView.swift that allow date manipulation
- **Persistence**: Simulated date persists across app restarts using UserDefaults

#### Backend Support
- **Flexible Date Handling**: All endpoints accept an optional `currentDate` parameter
- **Automatic Fallback**: When no `currentDate` provided, uses real current date
- **Database Queries**: All date-based calculations respect the provided date

### Debug Controls Location
```swift
// In HomeView.swift - Debug Controls Section
if isDevelopment {
    // Skip to Next Day button
    // Reset Streak button  
    // Current simulated date display
}
```

### Key Files
- **Frontend**: `Social Coach 1/Services/SimulatedDateService.swift`
- **Frontend**: `Social Coach 1/Views/HomeView.swift` (debug controls)
- **Backend**: All endpoints in `server.js` check for `currentDate` parameter

### Backend Implementation
```javascript
// Example from any endpoint
const today = currentDate ? new Date(currentDate + 'T00:00:00Z') : new Date();
```

### Testing Scenarios

#### Grace Period Testing
1. Build a 7-day streak to reach "Breaking Through"
2. Use "Skip to Next Day" to miss 1-3 days
3. Verify zone stays "Breaking Through" (grace period)
4. Skip 4th day → Zone drops to "Warming Up"

#### Streak Building
1. Start with "Reset Streak" 
2. Complete challenges/openers
3. Use "Skip to Next Day" to advance
4. Watch zone progression: Warming Up → Breaking Through → Coming Alive...

### Production vs Debug Mode

#### Debug Mode (Current)
- Simulated date can be set to any date
- "Skip to Next Day" advances simulated date
- All calculations use simulated date
- Date persists across app restarts

#### Production Mode  
- Uses real current date only
- No date manipulation possible
- Normal time progression

---

## Safe Removal for Production

### Step 1: Remove Debug UI
```swift
// In HomeView.swift, remove or comment out:
if isDevelopment {
    // ... debug controls section
}
```

### Step 2: Modify SimulatedDateService
```swift
// Option A: Simple - always return real date
public func getCurrentSimulatedDate() -> Date {
    return Date() // Always real date
}

// Option B: Toggle-based for future testing
public func getCurrentSimulatedDate() -> Date {
    return debugModeEnabled ? simulatedDate : Date()
}
```

### Step 3: Clear Persisted Debug Data (Optional)
```swift
// Add this to app startup if desired
UserDefaults.standard.removeObject(forKey: "simulatedDate")
```

---

## Safe Re-implementation for Testing

### Step 1: Restore SimulatedDateService
```swift
// Restore full functionality in SimulatedDateService.swift
@Published public var simulatedDate: Date
private let debugModeEnabled = true // Toggle for testing

public func getCurrentSimulatedDate() -> Date {
    return debugModeEnabled ? simulatedDate : Date()
}
```

### Step 2: Re-add Debug Controls
```swift
// In HomeView.swift, restore debug section:
#if DEBUG
VStack {
    Text("🛠️ DEBUG CONTROLS")
    Text("Simulated Date: \(formatDate(simulatedDate))")
    
    Button("Skip to Next Day") {
        // Implementation
    }
    
    Button("Reset Streak") {
        // Implementation  
    }
}
#endif
```

### Step 3: Environment-Based Toggle
```swift
// Production-safe approach
private var isDevelopment: Bool {
    #if DEBUG
    return true
    #else
    return false  
    #endif
}
```

---

## Backend Compatibility

### Current Implementation
All endpoints handle both modes automatically:
```javascript
// Works for both debug and production
const today = currentDate ? new Date(currentDate + 'T00:00:00Z') : new Date();
```

### No Backend Changes Required
- Debug mode: Frontend sends `?currentDate=2025-08-31`
- Production: Frontend sends no parameter, backend uses `new Date()`

---

## Best Practices

### For Development
- Use debug controls to test edge cases
- Test grace periods for all social zones  
- Verify streak calculations across date boundaries
- Test data persistence across simulated dates

### For Production
- Remove debug UI completely
- Keep SimulatedDateService for future testing capability
- Use environment flags to control debug features
- Clear any persisted debug data on production builds

### For Testing Team
1. **Build Streaks**: Use skip buttons to rapidly test zone progression
2. **Test Grace**: Miss days deliberately to verify grace period logic  
3. **Edge Cases**: Test month boundaries, leap years, timezone changes
4. **Data Integrity**: Verify all calculations match expected behavior

## Endpoints



### Generate Conversation Opener
POST /generate-opener
Body: { "purpose": "romantic", "setting": "quiet", "context": "At a coffee shop" }
Response: { "opener": "...", "followUps": [...], "exit": "...", "tip": "...", "confidenceBoost": "..." }

## Setup
1. Clone repository
2. Run `npm install`
3. Add your Replicate API token to `.env`
4. Run `npm start`

## Deploy
This backend is configured for Railway deployment.
