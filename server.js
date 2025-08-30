// DEPLOYMENT VERSION: v9.0.0 - SUPABASE MIGRATION COMPLETE - 2025-01-12
// IF THIS COMMENT IS NOT IN RAILWAY LOGS, THE DEPLOYMENT FAILED
// 100% SUPABASE POSTGRESQL - SQLite COMPLETELY ELIMINATED

const express = require('express');
const cors = require('cors');
// SQLite removed - using Supabase PostgreSQL
const path = require('path');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

console.log('===============================================');
console.log('🚨🚨🚨 SERVER STARTING - VERSION 9.0.0-SUPABASE-COMPLETE 🚨🚨🚨');
console.log('DEPLOYMENT TIME:', new Date().toISOString());
console.log('GRACE PERIOD FIX: ACTIVE');
console.log('daysSinceActivity calculation: FIXED');
console.log('lastRun calculation: FIXED');
console.log('===============================================');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure Express for better connection stability
app.set('trust proxy', true);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Check if AWS Bedrock configuration is set
if (!process.env.BEDROCK_API_KEY) {
  console.error('❌ BEDROCK_API_KEY environment variable is not set');
  console.log('🔧 AWS Bedrock-dependent endpoints will fail');
} else {
  console.log('✅ AWS Bedrock API key is configured');
}

if (!process.env.BEDROCK_ENDPOINT) {
  console.error('❌ BEDROCK_ENDPOINT environment variable is not set');
} else {
  console.log('✅ AWS Bedrock endpoint is configured:', process.env.BEDROCK_ENDPOINT);
}

if (!process.env.MODEL_ID) {
  console.error('❌ MODEL_ID environment variable is not set');
} else {
  console.log('✅ Model ID is configured:', process.env.MODEL_ID);
}

// Check if Frontend API key is configured
if (!process.env.FRONTEND_API_KEY) {
  console.error('❌ FRONTEND_API_KEY environment variable is not set');
  console.log('⚠️  API routes will be unprotected!');
} else {
  console.log('✅ Frontend API key is configured');
}

// Helper function to call AWS Bedrock API
async function callBedrockAPI(messages, maxTokens = 400, systemPrompt = null) {
  const endpoint = `${process.env.BEDROCK_ENDPOINT}/model/${process.env.MODEL_ID}/invoke`;
  
  // Format request body to match Claude's expected format
  const requestBody = {
    messages: messages,
    max_tokens: maxTokens,
    anthropic_version: "bedrock-2023-05-31"
  };
  
  if (systemPrompt) {
    requestBody.system = systemPrompt;
  }
  
  // AWS Bedrock API Key uses Bearer token authentication
  const apiKey = process.env.BEDROCK_API_KEY;
  
  // Debug: Check for whitespace issues
  console.log('🔍 API Key from environment');
  console.log('🔍 API Key configured:', !!apiKey);
  console.log('🔍 Endpoint:', endpoint);
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ AWS Bedrock API Error:', response.status, errorText);
    console.error('📋 Full endpoint called:', endpoint);
    console.error('📋 Authorization header:', headers.Authorization.substring(0, 30) + '...');
    throw new Error(`AWS Bedrock API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  
  // Log the response to debug format differences
  console.log('🔍 Raw Bedrock response:', JSON.stringify(data, null, 2));
  
  return data;
}

// CORS with optimized settings for mobile apps
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key'],
  credentials: false
}));

// JSON parsing with larger limits for complex data
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// General rate limiting for all API endpoints (prevents connection spam)
const generalRateLimit = rateLimit({
  windowMs: 1000, // 1 second window
  max: 20, // 20 requests per second per IP (generous for mobile app)
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks and tests
    return req.path === '/' || req.path.startsWith('/test-') || req.path === '/health';
  }
});

// Apply general rate limiting to all routes
app.use(generalRateLimit);

// Rate limiting for AI endpoints (150 requests per hour per IP)
const aiRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 150, // limit each IP to 150 requests per windowMs
  message: {
    error: 'Too Many AI Requests',
    message: 'You have exceeded the AI request limit of 150 requests per hour. Please try again later.',
    retryAfter: 3600 // seconds until reset (1 hour)
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Only count requests that result in success or client errors (4xx)
  // Don't count server errors (5xx)
  skip: (req, res) => res.statusCode >= 500,
  handler: (req, res) => {
    console.log(`🚫 Rate limit exceeded for IP: ${req.ip} on AI endpoint: ${req.path}`);
    res.status(429).json({
      error: 'Too Many AI Requests',
      message: 'You have exceeded the AI request limit of 150 requests per hour. Please try again later.',
      retryAfter: 3600
    });
  }
});

// API Key Authentication Middleware function
function requireApiKey(req, res, next) {
  // Skip authentication for auth endpoints (they need to be publicly accessible)
  if (req.path.startsWith('/api/auth/')) {
    console.log(`🔐 Allowing public access to auth endpoint: ${req.path}`);
    return next();
  }
  
  // Skip authentication if FRONTEND_API_KEY is not configured
  if (!process.env.FRONTEND_API_KEY) {
    console.warn('⚠️  API request received but FRONTEND_API_KEY not configured - allowing request');
    return next();
  }
  
  const apiKey = req.headers['x-api-key'];
  
  // Check if API key is provided
  if (!apiKey) {
    console.error('❌ API request rejected - missing x-api-key header');
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Missing API key in x-api-key header' 
    });
  }
  
  // Validate API key
  if (apiKey !== process.env.FRONTEND_API_KEY) {
    console.error('❌ API request rejected - invalid API key');
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Invalid API key' 
    });
  }
  
  // API key is valid, continue to the route handler
  next();
}

// Apply authentication to all /api/* routes
app.use('/api/*', requireApiKey);

console.log('✅ API key authentication middleware configured for all protected routes');

// SQLite initialization removed - using Supabase PostgreSQL

// Initialize Supabase Database
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

console.log('✅ Supabase client initialized');
console.log('🔗 Supabase URL:', process.env.SUPABASE_URL);
console.log('🔑 Service key configured:', !!process.env.SUPABASE_SERVICE_KEY);

// ========================================
// AUTHENTICATION MIDDLEWARE
// ========================================

// Supabase Auth middleware for protected routes
async function requireAuthentication(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Missing authorization header' 
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Verify JWT token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Invalid or expired token' 
      });
    }

    // Add user info to request
    req.user = user;
    req.userId = user.id;
    
    console.log(`🔐 Authenticated user: ${user.id} (${user.email})`);
    next();
    
  } catch (error) {
    console.error('❌ Authentication error:', error);
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Authentication failed' 
    });
  }
}

// Helper function to get user from token (without middleware)
async function getUserFromToken(authHeader) {
  try {
    if (!authHeader) return null;
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) return null;
    return user;
  } catch (error) {
    console.error('❌ Error getting user from token:', error);
    return null;
  }
}

// Dual auth middleware - supports both API key (legacy) and user auth (new)
async function requireApiKeyOrAuth(req, res, next) {
  // Try API key authentication first (legacy support)
  const apiKey = req.headers['x-api-key'];
  
  if (apiKey && apiKey === process.env.FRONTEND_API_KEY) {
    console.log('🔑 Legacy API key authentication successful');
    req.authMethod = 'api_key';
    return next();
  }
  
  // Try user authentication
  const authHeader = req.headers.authorization;
  if (authHeader) {
    try {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (!error && user) {
        req.user = user;
        req.userId = user.id;
        req.authMethod = 'user_auth';
        console.log(`🔐 User authentication successful: ${user.id}`);
        return next();
      }
    } catch (error) {
      console.error('❌ User authentication failed:', error);
    }
  }
  
  // No valid authentication found
  return res.status(401).json({ 
    error: 'Unauthorized', 
    message: 'Valid API key or user authentication required' 
  });
}

// SQLite table creation removed - all tables now exist in Supabase





// Social Zone-based challenge templates
const socialZoneTemplates = {
  "Warming Up": {
    name: "warming_up",
    intent: "Build comfort with initiating light interactions. Very low barrier, short, easy to attempt.",
    challengeType: "Simple icebreakers, noticing others, friendly interactions.",
    prompt: "Generate a Daily Challenge that helps the user practice starting light, low-stakes interactions. Keep it positive, easy to attempt, and ensure it feels fresh and different from previous challenges."
  },
  "Breaking Through": {
    name: "breaking_through", 
    intent: "Move past hesitation and expand interactions beyond one-liners.",
    challengeType: "Slightly longer exchanges, encouraging curiosity and follow-ups.",
    prompt: "Generate a Daily Challenge that encourages the user to break past comfort zones by initiating and continuing interactions. The challenge should invite natural back-and-forth and ensure variety from previous challenges."
  },
  "Coming Alive": {
    name: "coming_alive",
    intent: "Show more personality and presence in interactions.",
    challengeType: "Add playfulness, humor, or personal expression while keeping the interaction natural.",
    prompt: "Generate a Daily Challenge that helps the user express more personality during interactions. Encourage light humor, playfulness, or personal touches while staying natural and positive."
  },
  "Charming": {
    name: "charming",
    intent: "Build attraction and social magnetism through engaging, fun interactions.",
    challengeType: "Confident delivery, socially bold moves, smooth but still approachable.",
    prompt: "Generate a Daily Challenge that encourages confident and charming interactions. Help them practice socially bold but fun approaches that feel inviting and magnetic with varied interaction styles."
  },
  "Socialite": {
    name: "socialite",
    intent: "Operate comfortably in dynamic, extroverted environments.",
    challengeType: "Advanced social tasks — longer interactions, group dynamics, or socially leading moments.",
    prompt: "Generate a Daily Challenge for dynamic social contexts. The challenge should involve engaging multiple people or sustaining interactions in an outgoing way while feeling expansive and socially bold."
  }
};

// Get challenge template based on Social Zone level
function getChallengeTemplateForSocialZone(socialZoneLevel) {
  console.log(`🎯 Getting challenge template for Social Zone: ${socialZoneLevel}`);
  
  // Validate that the zone exists - crash if it doesn't
  if (!socialZoneTemplates[socialZoneLevel]) {
    const validZones = ["Warming Up", "Breaking Through", "Coming Alive", "Charming", "Socialite"];
    console.error(`❌ TEMPLATE ERROR: Invalid Social Zone "${socialZoneLevel}"`);
    console.error(`   Available zones: ${validZones.join(', ')}`);
    console.error(`   Available templates: ${Object.keys(socialZoneTemplates).join(', ')}`);
    throw new Error(`Invalid Social Zone "${socialZoneLevel}". Valid zones are: ${validZones.join(', ')}`);
  }
  
  const template = socialZoneTemplates[socialZoneLevel];
  console.log(`✅ Template found: ${template.name} for zone "${socialZoneLevel}"`);
  
  return template;
}

// Test endpoint to verify all Social Zone templates
app.get('/api/test/social-zones', (req, res) => {
  try {
    console.log('🧪 TESTING ALL SOCIAL ZONE TEMPLATES:');
    
    const allZones = ["Warming Up", "Breaking Through", "Coming Alive", "Charming", "Socialite"];
    const results = [];
    
    allZones.forEach((zone, index) => {
      try {
        const template = getChallengeTemplateForSocialZone(zone);
        const result = {
          zone: zone,
          status: 'SUCCESS',
          templateName: template.name,
          intent: template.intent.substring(0, 50) + '...',
          challengeType: template.challengeType,
          hasPrompt: !!template.prompt
        };
        results.push(result);
        console.log(`✅ ${index + 1}. ${zone} - Template: ${template.name}`);
      } catch (error) {
        const result = {
          zone: zone,
          status: 'ERROR',
          error: error.message
        };
        results.push(result);
        console.log(`❌ ${index + 1}. ${zone} - ERROR: ${error.message}`);
      }
    });
    
    res.json({
      success: true,
      totalZones: allZones.length,
      successfulZones: results.filter(r => r.status === 'SUCCESS').length,
      results: results
    });
  } catch (error) {
    console.error('❌ Error testing social zones:', error);
    res.status(500).json({ error: 'Test failed', details: error.message });
  }
});

// SQLite helper function removed - using ensureUserExistsSupabase() instead

// Supabase version of streak update - 100% accurate replication of SQLite logic
const updateUserStreakSupabase = async (deviceId, actionDate) => {
  console.log(`=== SUPABASE STREAK DEBUG for ${deviceId} ===`);
  
  try {
    // Get user data from Supabase (equivalent to SQLite SELECT)
    const { data: user, error: selectError } = await supabase
      .from('users')
      .select('current_streak, all_time_best_streak, last_completion_date')
      .eq('device_id', deviceId)
      .single();
    
    if (selectError) {
      console.error('❌ [SUPABASE] Error getting user for streak update:', selectError);
      throw selectError;
    }

    console.log('[SUPABASE] Current user data:', {
      current_streak: user.current_streak,
      all_time_best_streak: user.all_time_best_streak,
      last_completion_date: user.last_completion_date
    });
    console.log('[SUPABASE] New action date:', actionDate);

    let newStreak = 1;
    let newBestStreak = user.all_time_best_streak || 0;
    
    if (user.last_completion_date) {
      // EXACT SAME date parsing logic as SQLite version
      const lastDateStr = user.last_completion_date.split('T')[0]; // Get YYYY-MM-DD part
      const currentDateStr = actionDate.split('T')[0]; // Get YYYY-MM-DD part
      
      const lastDate = new Date(lastDateStr + 'T00:00:00Z'); // Normalize to UTC midnight
      const currentDate = new Date(currentDateStr + 'T00:00:00Z'); // Normalize to UTC midnight
      
      // Calculate difference in days (EXACT SAME calculation)
      const timeDiff = currentDate.getTime() - lastDate.getTime();
      const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      
      console.log('[SUPABASE] Date comparison:', {
        lastDateStr,
        currentDateStr,
        lastDate: lastDate.toISOString(),
        currentDate: currentDate.toISOString(),
        timeDiff,
        daysDiff
      });
      
      // EXACT SAME streak logic as SQLite version
      if (daysDiff === 1) {
        // Consecutive day - increment streak
        newStreak = (user.current_streak || 0) + 1;
        console.log(`[SUPABASE] Consecutive day detected! Incrementing streak: ${user.current_streak} → ${newStreak}`);
      } else if (daysDiff === 0) {
        // Same day - keep current streak, don't increment for same-day actions
        newStreak = user.current_streak || 1;
        console.log(`[SUPABASE] Same day detected. Keeping streak at: ${newStreak}`);
      } else {
        // Gap > 1 day - streak resets to 1
        console.log(`[SUPABASE] Gap detected (${daysDiff} days). Resetting streak to 1`);
        newStreak = 1;
      }
    } else {
      console.log('[SUPABASE] No previous completion date. Starting new streak at 1');
    }
    
    // Update best streak if current is higher (EXACT SAME logic)
    if (newStreak > newBestStreak) {
      newBestStreak = newStreak;
      console.log(`[SUPABASE] New best streak! ${newBestStreak}`);
    }
    
    console.log(`[SUPABASE] Final streak values: current=${newStreak}, best=${newBestStreak}`);
    
    // Update the database (Supabase equivalent of SQLite UPDATE)
    const { error: updateError } = await supabase
      .from('users')
      .update({
        current_streak: newStreak,
        all_time_best_streak: newBestStreak,
        last_completion_date: actionDate
      })
      .eq('device_id', deviceId);
    
    if (updateError) {
      console.error(`❌ [SUPABASE] Failed to update streak for ${deviceId}:`, updateError);
      throw updateError;
        } else {
      console.log(`✅ [SUPABASE] Successfully updated streak for ${deviceId}: ${newStreak} (best: ${newBestStreak})`);
      console.log('=== END SUPABASE STREAK DEBUG ===\n');
      
      return {
        currentStreak: newStreak,
        bestStreak: newBestStreak,
        lastCompletionDate: actionDate
      };
    }
    
  } catch (error) {
    console.error('❌ [SUPABASE] updateUserStreakSupabase failed:', error);
    throw error;
  }
};

// Supabase version of ensure user exists
const ensureUserExistsSupabase = async (deviceId, customDate = null) => {
  console.log(`🔍 [SUPABASE] Checking if user exists: ${deviceId}`);
  
  try {
    // Check if user exists
    const { data: existingUser, error: selectError } = await supabase
      .from('users')
      .select('device_id')
      .eq('device_id', deviceId)
      .single();
    
    if (selectError && selectError.code !== 'PGRST116') {
      // PGRST116 is "not found" error, which is expected for new users
      console.error('❌ [SUPABASE] Error checking user existence:', selectError);
      throw selectError;
    }
    
    if (!existingUser) {
      console.log(`👤 [SUPABASE] User not found, creating new user: ${deviceId}`);
      
      // Create new user with creation date
      let createdAt;
      if (customDate) {
        // Use the simulated date provided
        createdAt = new Date(customDate + 'T00:00:00Z').toISOString();
        console.log(`👤 [SUPABASE] Using simulated date for user creation: ${createdAt}`);
      } else {
        // Use current real date
        createdAt = new Date().toISOString();
        console.log(`👤 [SUPABASE] Using real date for user creation: ${createdAt}`);
      }
      
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          device_id: deviceId,
          created_at: createdAt
        })
        .select()
        .single();
      
      if (insertError) {
        console.error('❌ [SUPABASE] Error creating user:', insertError);
        throw insertError;
      } else {
        console.log(`✅ [SUPABASE] User created successfully: ${deviceId} with creation date: ${createdAt}`);
      }
      
      return newUser;
        } else {
      console.log(`✅ [SUPABASE] User already exists: ${deviceId}`);
      return existingUser;
        }
  } catch (error) {
    console.error('❌ [SUPABASE] ensureUserExists failed:', error);
    throw error;
      }
};

// SQLite helper function removed - using updateUserStreakSupabase() instead

// SQLite helper function removed - using updateUserStreakSupabase() instead

// Helper function to calculate Social Zone level with grace period logic
const calculateSocialZoneLevel = (currentStreak, daysWithoutActivity, highestLevelAchieved, allTimeMaxStreak, activityDates = []) => {
  console.log(`🔧 GRACE DEBUG: calculateSocialZoneLevel called with:`, {
    currentStreak,
    daysWithoutActivity,
    highestLevelAchieved,
    allTimeMaxStreak
  });
  // Base level requirements (days needed to reach each level)
  const baseLevelRequirements = {
    'Warming Up': 0,
    'Breaking Through': 7,
    'Coming Alive': 21,
    'Charming': 46,
    'Socialite': 90
  };

  // Grace periods for each level
  // Slightly more generous grace windows to make the zone feel steadier
  const gracePeriods = {
    'Warming Up': 0,
    'Breaking Through': 3,
    'Coming Alive': 4,
    'Charming': 6,
    'Socialite': 6
  };

  // Calculate level based on current streak
  let currentLevel = 'Warming Up';
  if (currentStreak >= 90) currentLevel = 'Socialite';
  else if (currentStreak >= 46) currentLevel = 'Charming';
  else if (currentStreak >= 21) currentLevel = 'Coming Alive';
  else if (currentStreak >= 7) currentLevel = 'Breaking Through';

  console.log(`🔧 GRACE DEBUG: Current level based on streak (${currentStreak}): ${currentLevel}`);

  // If streak is broken (currentStreak = 0), check grace period logic
  if (currentStreak === 0 && daysWithoutActivity > 0) {
    console.log(`🔧 GRACE DEBUG: Streak is broken, checking grace period logic`);
    
    // Determine the last achieved level before the miss.
    // IMPORTANT: Check if user previously achieved a higher level through grace continuation
    // by looking at their activity pattern for evidence of grace continuation achievements
    let previousLevel = highestLevelAchieved || 'Warming Up';
    if (!highestLevelAchieved) {
      if (allTimeMaxStreak >= 90) previousLevel = 'Socialite';
      else if (allTimeMaxStreak >= 46) previousLevel = 'Charming';
      else if (allTimeMaxStreak >= 21) previousLevel = 'Coming Alive';
      else if (allTimeMaxStreak >= 7) previousLevel = 'Breaking Through';
    }
    
    // BUGFIX: If user has gaps in their activity (indicating grace continuation usage),
    // check if they could have achieved a higher level through grace continuation
    const hasActivityGaps = () => {
      if (!activityDates || activityDates.length < 7) return false;
      const sorted = [...activityDates].sort();
      for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i-1] + 'T00:00:00Z');
        const curr = new Date(sorted[i] + 'T00:00:00Z'); 
        const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
        if (diffDays > 1) return true;
      }
      return false;
    };
    
    // If user has gaps and their total activity suggests they achieved a higher level, upgrade their grace level
    if (hasActivityGaps() && allTimeMaxStreak >= 7) {
      const totalActivityDays = (activityDates || []).length;
      const gapAdjustedLevel = totalActivityDays >= 90 ? 'Socialite'
        : totalActivityDays >= 46 ? 'Charming'
        : totalActivityDays >= 21 ? 'Coming Alive'
        : totalActivityDays >= 7 ? 'Breaking Through'
        : previousLevel;
      
      if (gapAdjustedLevel !== previousLevel) {
        console.log(`🔧 GRACE BUGFIX: Upgrading grace level from ${previousLevel} to ${gapAdjustedLevel} based on total activity (${totalActivityDays} days)`);
        previousLevel = gapAdjustedLevel;
      }
    }

    console.log(`🔧 GRACE DEBUG: Previous level based on highestLevelAchieved(${highestLevelAchieved}) and allTimeMaxStreak(${allTimeMaxStreak}): ${previousLevel}`);

    // Check if still within grace period
    const gracePeriod = gracePeriods[previousLevel];
    console.log(`🔧 GRACE DEBUG: Grace period for ${previousLevel}: ${gracePeriod} days, daysWithoutActivity: ${daysWithoutActivity}`);
    
    if (daysWithoutActivity <= gracePeriod && gracePeriod > 0) {
      console.log(`🔧 GRACE DEBUG: ✅ WITHIN GRACE PERIOD - staying at ${previousLevel} (${daysWithoutActivity}/${gracePeriod} days used)`);
      return {
        level: previousLevel,
        isInGracePeriod: true,
        gracePeriodLeft: gracePeriod - daysWithoutActivity
      };
    } else if (gracePeriod > 0) {
      // Grace period expired, drop one level
      const levels = ['Warming Up', 'Breaking Through', 'Coming Alive', 'Charming', 'Socialite'];
      const previousIndex = levels.indexOf(previousLevel);
      const droppedLevel = previousIndex > 0 ? levels[previousIndex - 1] : 'Warming Up';
      console.log(`🔧 GRACE DEBUG: ❌ GRACE PERIOD EXPIRED - dropping from ${previousLevel} to ${droppedLevel} (${daysWithoutActivity}>${gracePeriod})`);
      return {
        level: droppedLevel,
        isInGracePeriod: false,
        droppedFrom: previousLevel
      };
    }
  }

  // NEW: Check if user is rebuilding from a grace period break
  // When resuming after grace, add their previous achievement as "credit" toward next zone
  // BUT ONLY if they were recently in a grace period (not for fresh starts after resets)
  // GRACE PERIOD CONTINUATION: Give credit only when there's evidence of activity gaps
  // This allows users to continue toward next level after grace periods
  if (currentStreak > 0 && highestLevelAchieved && highestLevelAchieved !== 'Warming Up') {
    const baseLevelRequirements = {
      'Warming Up': 0,
      'Breaking Through': 7,  
      'Coming Alive': 21,
      'Charming': 46,
      'Socialite': 90
    };
    
    const levelRequirement = baseLevelRequirements[highestLevelAchieved] || 0;
    
    // Detect gaps by checking if activity dates have non-consecutive days
    const hasActivityGaps = () => {
      if (!activityDates || activityDates.length < 7) return false;
      const sorted = [...activityDates].sort();
      for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i-1] + 'T00:00:00Z');
        const curr = new Date(sorted[i] + 'T00:00:00Z'); 
        const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
        if (diffDays > 1) return true; // Found a gap
      }
      return false;
    };
    
    // Final approach: Help users who achieved meaningful levels and have evidence of gaps
    const hadMeaningfulLevel = levelRequirement >= 7;
    const hasGaps = hasActivityGaps();
    
    // Give credit if: meaningful previous level + evidence of gaps in activity pattern
    const isGraceRecovery = hadMeaningfulLevel && hasGaps;
    
    if (isGraceRecovery) {
      console.log(`🔧 GRACE CONTINUATION: Detected grace recovery - currentStreak: ${currentStreak}, allTimeMax: ${allTimeMaxStreak}, previousLevel: ${highestLevelAchieved}`);
      
      // For grace period continuation, give them credit for their actual previous progress
      // This allows users to continue building where they left off after grace periods  
      const creditDays = Math.max(levelRequirement, allTimeMaxStreak); // Use actual previous streak, not just level requirement
      const effectiveStreak = currentStreak + creditDays;
      
      console.log(`🔧 GRACE CONTINUATION: Adding ${creditDays} credit days. Effective streak: ${effectiveStreak}`);
      
      // Determine zone based on effective streak (continuing from where they left off)
      let recoveryZone = 'Warming Up';
      if (effectiveStreak >= 90) recoveryZone = 'Socialite';
      else if (effectiveStreak >= 46) recoveryZone = 'Charming';
      else if (effectiveStreak >= 21) recoveryZone = 'Coming Alive';
      else if (effectiveStreak >= 7) recoveryZone = 'Breaking Through';
      
      // Never drop below their highest achieved level
      const levelOrder = ['Warming Up', 'Breaking Through', 'Coming Alive', 'Charming', 'Socialite'];
      const highestIndex = levelOrder.indexOf(highestLevelAchieved);
      const recoveryIndex = levelOrder.indexOf(recoveryZone);
      
      const finalZone = recoveryIndex >= highestIndex ? recoveryZone : highestLevelAchieved;
      
      console.log(`🔧 GRACE CONTINUATION: Final zone: ${finalZone} (effective streak: ${effectiveStreak})`);
      
      return {
        level: finalZone,
        isInGracePeriod: false,
        isRecovering: true,
        graceContinuation: true,
        effectiveStreak: effectiveStreak,
        newHighestAchieved: finalZone  // Record the new level achieved through grace continuation
      };
    }
  }

  console.log(`🔧 GRACE DEBUG: No grace period needed, returning current level: ${currentLevel}`);

  // Apply streak recovery boost (25% faster if they've been at this level before)
  const hasBeenAtHigherLevel = highestLevelAchieved && 
    Object.keys(baseLevelRequirements).indexOf(highestLevelAchieved) > 
    Object.keys(baseLevelRequirements).indexOf(currentLevel);

  if (hasBeenAtHigherLevel && currentStreak > 0) {
    // Check if they qualify for a boosted level
    const boostedStreak = Math.floor(currentStreak / 0.75); // 25% boost
    let boostedLevel = currentLevel;
    if (boostedStreak >= 90) boostedLevel = 'Socialite';
    else if (boostedStreak >= 46) boostedLevel = 'Charming';
    else if (boostedStreak >= 21) boostedLevel = 'Coming Alive';
    else if (boostedStreak >= 7) boostedLevel = 'Breaking Through';

    if (boostedLevel !== currentLevel) {
      return {
        level: boostedLevel,
        isBoosted: true,
        normalStreak: currentStreak,
        boostedStreak: boostedStreak
      };
    }
  }

  return {
    level: currentLevel,
    isInGracePeriod: false,
    isBoosted: false
  };
};

// Helper function to calculate consecutive streak - MOVED TO GLOBAL SCOPE
const calculateConsecutiveStreak = (dates, today) => {
  if (!dates || dates.length === 0) return 0;
  const todayStr = today.toISOString().split('T')[0];
  const yesterdayStr = new Date(today.getTime() - 86400000).toISOString().split('T')[0];
  
  if (!dates.includes(todayStr) && !dates.includes(yesterdayStr)) {
    return 0;
  }
  
  let streak = 0;
  let checkDate = new Date(today);
  
  if (!dates.includes(todayStr)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }
  
  while (dates.includes(checkDate.toISOString().split('T')[0])) {
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }
  
  return streak;
};

// Helper function to calculate days without activity
const calculateDaysWithoutActivity = (lastActivityDate) => {
  if (!lastActivityDate) return 999; // No activity recorded
  
  const lastDate = new Date(lastActivityDate);
  const today = new Date();
  const daysDiff = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
  
  return daysDiff;
};

// NEW: Calculate current streak based on both challenges and openers

app.get('/', (req, res) => {
  res.json({ 
    message: 'SOCIAL CONFIDENCE CALCULATION IMPROVED',
    version: 'v8.0.0-GRACE-RECOVERY',
    timestamp: new Date().toISOString(),
    build: 'critical-' + Date.now(),
    deploymentId: process.env.RAILWAY_DEPLOYMENT_ID || 'local',
    fixApplied: 'daysSinceActivity-and-lastRun-calculation-fixed'
  });
});

// Test endpoint to verify deployment
app.get('/test-deployment', (req, res) => {
  res.json({
    status: 'NEW CODE DEPLOYED SUCCESSFULLY',
    version: 'v3.0.0',
    message: 'If you see this, Railway has deployed the latest code'
  });
});

// Test Supabase connection
app.get('/api/test/supabase', async (req, res) => {
  try {
    console.log('🧪 Testing Supabase connection...');
    
    // Simple test query - just select any data to test connection
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('❌ Supabase test failed:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Supabase connection failed',
        error: error.message
      });
    }
    
    console.log('✅ Supabase connection successful');
    res.json({
      status: 'success',
      message: 'Supabase connection working!',
      timestamp: new Date().toISOString(),
      supabaseConnected: true
    });
    
  } catch (error) {
    console.error('❌ Supabase test error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Supabase test failed',
      error: error.message
    });
  }
});

// Diagnostic endpoint removed - SQLite dependency eliminated

// Test Supabase user creation
app.post('/api/test/user-create', async (req, res) => {
  try {
    const { deviceId, customDate } = req.body;
    
    if (!deviceId) {
      return res.status(400).json({ 
        error: 'deviceId is required in request body' 
      });
    }
    
    console.log(`🧪 Testing Supabase user creation for: ${deviceId}`);
    
    // Test the new Supabase function
    const user = await ensureUserExistsSupabase(deviceId, customDate);
    
    console.log('✅ Supabase user creation test successful');
    res.json({
      status: 'success',
      message: 'User creation test successful!',
      user: user,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Supabase user creation test failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'User creation test failed',
      error: error.message,
      stack: error.stack
    });
  }
});

// Test endpoint for API key authentication
app.get('/api/test/auth', (req, res) => {
    res.json({
    status: 'authenticated', 
    message: 'API key is valid',
    timestamp: new Date().toISOString()
  });
});

// ========================================
// AUTHENTICATION ENDPOINTS
// ========================================

// User registration endpoint
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, fullName, deviceId } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        message: 'Email and password are required' 
      });
    }

    console.log(`🔐 Registration attempt for: ${email}`);
    
    // Create user with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { 
        full_name: fullName || null 
      },
      email_confirm: false // For development - set to true in production
    });

    if (authError) {
      console.error('❌ Registration failed:', authError);
      return res.status(400).json({ 
        error: 'Registration failed', 
        message: authError.message 
      });
    }

    const user = authData.user;
    console.log(`✅ User created: ${user.id} (${email})`);

    // If deviceId provided, migrate existing data
    let migrationResult = null;
    if (deviceId) {
      console.log(`🔄 Migrating data from device: ${deviceId} to user: ${user.id}`);
      
      const { data: migrationData, error: migrationError } = await supabase
        .rpc('migrate_device_data_to_user', {
          p_device_id: deviceId,
          p_user_id: user.id
        });

      if (migrationError) {
        console.error('❌ Data migration failed:', migrationError);
      } else {
        migrationResult = migrationData;
        console.log('✅ Data migration successful:', migrationResult);
      }
    }

    // Create session token
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'signup',
      email: user.email,
      password
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.user_metadata?.full_name || null
      },
      migration: migrationResult,
      // Note: In production, handle session creation differently
      requiresLogin: true
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Registration failed' 
    });
  }
});

// User login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Missing credentials', 
        message: 'Email and password are required' 
      });
    }

    console.log(`🔐 Login attempt for: ${email}`);

    // Sign in with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      console.error('❌ Login failed:', authError);
      return res.status(401).json({ 
        error: 'Authentication failed', 
        message: authError.message 
      });
    }

    const { user, session } = authData;
    console.log(`✅ Login successful: ${user.id} (${email})`);

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        fullName: profile?.full_name || user.user_metadata?.full_name || null
      },
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in
      },
      profile: profile || null
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Login failed' 
    });
  }
});

// Data migration endpoint (for existing users)
app.post('/api/auth/migrate-data', requireAuthentication, async (req, res) => {
  try {
    const { deviceId } = req.body;
    const userId = req.userId;
    
    if (!deviceId) {
      return res.status(400).json({ 
        error: 'Missing device ID', 
        message: 'Device ID is required for migration' 
      });
    }

    console.log(`🔄 Manual data migration: ${deviceId} → ${userId}`);

    const { data: migrationResult, error: migrationError } = await supabase
      .rpc('migrate_device_data_to_user', {
        p_device_id: deviceId,
        p_user_id: userId
      });

    if (migrationError) {
      console.error('❌ Migration failed:', migrationError);
      return res.status(500).json({ 
        error: 'Migration failed', 
        message: migrationError.message 
      });
    }

    console.log('✅ Manual migration successful:', migrationResult);

    res.json({
      success: true,
      message: 'Data migration completed',
      migration: migrationResult
    });

  } catch (error) {
    console.error('❌ Migration error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Migration failed' 
    });
  }
});

// Get user profile
app.get('/api/auth/profile', requireAuthentication, async (req, res) => {
  try {
    const userId = req.userId;
    
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('❌ Profile fetch error:', error);
      return res.status(500).json({ 
        error: 'Database error', 
        message: 'Failed to fetch profile' 
      });
    }

    res.json({
      success: true,
      user: req.user,
      profile: profile || null
    });

  } catch (error) {
    console.error('❌ Profile error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to get profile' 
    });
  }
});

// Update user profile
app.put('/api/auth/profile', requireAuthentication, async (req, res) => {
  try {
    const userId = req.userId;
    const { fullName, subscriptionStatus } = req.body;

    const updates = {};
    if (fullName !== undefined) updates.full_name = fullName;
    if (subscriptionStatus !== undefined) updates.subscription_status = subscriptionStatus;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ 
        error: 'No updates provided', 
        message: 'At least one field must be provided' 
      });
    }

    updates.updated_at = new Date().toISOString();

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('❌ Profile update error:', error);
      return res.status(500).json({ 
        error: 'Database error', 
        message: 'Failed to update profile' 
      });
    }

    console.log(`✅ Profile updated for user: ${userId}`);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      profile
    });

  } catch (error) {
    console.error('❌ Profile update error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to update profile' 
    });
  }
});

// Debug endpoints removed after successful Social Zone testing

// Save Daily Challenge Data - NOW POWERED BY SUPABASE!
app.post('/api/data/challenge', async (req, res) => {
  try {
    const {
      deviceId,
      challengeCompleted = true,
      challengeWasSuccessful,
      challengeRating,
      challengeConfidenceLevel,
      challengeNotes,
      challengeDate,
      challengeType
    } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    console.log('[SUPABASE] Challenge data received:', { 
      deviceId, challengeCompleted, challengeWasSuccessful, 
      challengeRating, challengeConfidenceLevel, challengeType 
    });

    // Validate confidence level is within 4-level range (1-4)
    if (challengeConfidenceLevel !== null && challengeConfidenceLevel !== undefined) {
      if (challengeConfidenceLevel < 1 || challengeConfidenceLevel > 4) {
        return res.status(400).json({ error: 'Invalid confidence level. Must be 1-4 (1=Anxious, 2=Nervous, 3=Comfortable, 4=Confident)' });
      }
    }

    // Extract date from challengeDate for user creation
    const dateForUserCreation = challengeDate ? challengeDate.split('T')[0] : null;

    // Ensure user exists (Supabase version)
    await ensureUserExistsSupabase(deviceId, dateForUserCreation);
    
    console.log(`✅ [SUPABASE] User exists/created, proceeding with challenge for: ${deviceId}`);

    // Insert challenge data into Supabase
    const { data: challengeData, error: challengeError } = await supabase
      .from('daily_challenges')
      .insert({
        device_id: deviceId,
        challenge_completed: challengeCompleted,
        challenge_was_successful: challengeWasSuccessful,
        challenge_rating: challengeRating,
        challenge_confidence_level: challengeConfidenceLevel,
        challenge_notes: challengeNotes,
        challenge_date: challengeDate,
        challenge_type: challengeType
      })
      .select()
      .single();

    if (challengeError) {
      console.error('❌ [SUPABASE] Error saving challenge:', challengeError);
      return res.status(500).json({ 
        error: 'Failed to save challenge data', 
        details: challengeError.message 
      });
    }

    console.log(`✅ [SUPABASE] Challenge saved successfully for ${deviceId}, now updating streak...`);

    // Update streak using Supabase version - 100% accurate replication
    const streakResult = await updateUserStreakSupabase(deviceId, challengeDate);
    
    console.log(`✅ [SUPABASE] Challenge and streak update completed for ${deviceId}: Success=${challengeWasSuccessful}`);

    // Return same response format that iOS app expects (must be integer for iOS compatibility)
          res.json({ 
            success: true, 
      challengeId: 1,  // iOS expects integer, not UUID - use simple integer for compatibility
              message: 'Challenge data saved and streak updated successfully' 
            });

  } catch (error) {
    console.error('❌ [SUPABASE] Error in challenge endpoint:', error);
    res.status(500).json({ 
      error: 'Server error', 
      details: error.message 
    });
  }
});



// Save Opener Data - NOW POWERED BY SUPABASE!
app.post('/api/data/opener', async (req, res) => {
  try {
    const {
      deviceId,
      openerText,
      openerSetting,
      openerPurpose,
      openerWasUsed,          // "Did you use this opener?" - KEY FIELD FOR STREAK
      openerWasSuccessful,    // "Was it a successful conversation?" - DOESN'T AFFECT STREAK
      openerRating,
      openerConfidenceLevel,
      openerNotes,
      openerDate
    } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    console.log('[SUPABASE] Opener data received:', { 
      deviceId, openerWasUsed, openerWasSuccessful, 
      openerSetting, openerPurpose, openerConfidenceLevel 
    });

    // Validate confidence level is within 4-level range (1-4)
    if (openerConfidenceLevel !== null && openerConfidenceLevel !== undefined) {
      if (openerConfidenceLevel < 1 || openerConfidenceLevel > 4) {
        return res.status(400).json({ error: 'Invalid confidence level. Must be 1-4 (1=Anxious, 2=Nervous, 3=Comfortable, 4=Confident)' });
      }
    }

    // Ensure user exists (Supabase version)
    await ensureUserExistsSupabase(deviceId);

      // ALWAYS insert opener data (save everything regardless of usage)
    const { data: openerData, error: openerError } = await supabase
      .from('openers')
      .insert({
        device_id: deviceId,
        opener_text: openerText,
        opener_setting: openerSetting,
        opener_purpose: openerPurpose,
        opener_was_used: openerWasUsed,
        opener_was_successful: openerWasSuccessful,
        opener_rating: openerRating,
        opener_confidence_level: openerConfidenceLevel,
        opener_notes: openerNotes,
        opener_date: openerDate
      })
      .select()
      .single();

    if (openerError) {
      console.error('❌ [SUPABASE] Error saving opener:', openerError);
      return res.status(500).json({ 
        error: 'Failed to save opener data',
        details: openerError.message 
      });
    }

    // Update streak if opener was used (SAME LOGIC as SQLite version)
          if (openerWasUsed === true) {
      try {
        await updateUserStreakSupabase(deviceId, openerDate);
        console.log(`✅ [SUPABASE] Opener streak updated for ${deviceId}`);
      } catch (streakErr) {
        console.error('❌ [SUPABASE] Error updating streak after opener:', streakErr);
        // Don't fail the request if streak update fails - opener was saved successfully
      }
    }
    
    console.log(`[SUPABASE] Opener saved: Used=${openerWasUsed}, Success=${openerWasSuccessful}`);

    // Return same response format that iOS app expects (must be integer for iOS compatibility)
          res.json({ 
            success: true, 
      openerId: 1,  // iOS expects integer, not UUID - use simple integer for compatibility
            message: 'Opener data saved successfully' 
          });

  } catch (error) {
    console.error('❌ [SUPABASE] Error in opener endpoint:', error);
    res.status(500).json({ 
      error: 'Server error',
      details: error.message 
    });
  }
});

// Save Development Module Data - NOW POWERED BY SUPABASE!
app.post('/api/data/development', async (req, res) => {
  try {
    const {
      deviceId,
      developmentModuleId,
      developmentScreenReached,
      developmentIsCompleted,
      developmentProgressPercentage,
      developmentDate
    } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    console.log('[SUPABASE] Development data received:', {
      deviceId, developmentModuleId, developmentScreenReached, 
      developmentIsCompleted, developmentProgressPercentage
    });

    // Ensure user exists (Supabase version)
    await ensureUserExistsSupabase(deviceId);

      // Check if module progress already exists for this user and module
    const { data: existingRecord, error: selectError } = await supabase
      .from('development_modules')
      .select('*')
      .eq('device_id', deviceId)
      .eq('development_module_id', developmentModuleId)
      .single();

    // Handle "not found" error (PGRST116) as expected case
    if (selectError && selectError.code !== 'PGRST116') {
      console.error('❌ [SUPABASE] Error checking existing module progress:', selectError);
            return res.status(500).json({ error: 'Database error' });
          }

          if (existingRecord) {
      // Update existing record if new progress is higher or module is completed (SAME LOGIC)
            const shouldUpdate = 
              developmentScreenReached > existingRecord.development_screen_reached ||
              (developmentIsCompleted && !existingRecord.development_is_completed);

            if (shouldUpdate) {
        const { data: updatedRecord, error: updateError } = await supabase
          .from('development_modules')
          .update({
            development_screen_reached: developmentScreenReached,
            development_is_completed: developmentIsCompleted,
            development_progress_percentage: developmentProgressPercentage,
            development_date: developmentDate
          })
          .eq('device_id', deviceId)
          .eq('development_module_id', developmentModuleId)
          .select()
          .single();

        if (updateError) {
          console.error('❌ [SUPABASE] Error updating development module:', updateError);
          return res.status(500).json({ 
            error: 'Failed to update development module data',
            details: updateError.message 
          });
        }

        console.log(`✅ [SUPABASE] Updated development module ${developmentModuleId} for ${deviceId}: Screen ${developmentScreenReached}, ${developmentProgressPercentage}%`);

                  res.json({ 
                    success: true, 
          moduleId: 1,  // iOS expects integer, not UUID - use simple integer for compatibility
                    message: 'Development module data updated successfully' 
                  });
            } else {
        // No update needed (SAME LOGIC)
        console.log(`[SUPABASE] Development module ${developmentModuleId} for ${deviceId} already up to date`);
              res.json({ 
                success: true, 
          moduleId: 1,  // iOS expects integer, not UUID - use simple integer for compatibility
                message: 'Development module data already up to date' 
              });
            }
          } else {
      // Insert new record (SAME LOGIC)
      const { data: newRecord, error: insertError } = await supabase
        .from('development_modules')
        .insert({
          device_id: deviceId,
          development_module_id: developmentModuleId,
          development_screen_reached: developmentScreenReached,
          development_is_completed: developmentIsCompleted,
          development_progress_percentage: developmentProgressPercentage,
          development_date: developmentDate
        })
        .select()
        .single();

      if (insertError) {
        console.error('❌ [SUPABASE] Error saving development module:', insertError);
        return res.status(500).json({ 
          error: 'Failed to save development module data',
          details: insertError.message 
        });
      }

      console.log(`✅ [SUPABASE] Saved development module ${developmentModuleId} for ${deviceId}: Screen ${developmentScreenReached}, ${developmentProgressPercentage}%`);

                res.json({ 
                  success: true, 
        moduleId: 1,  // iOS expects integer, not UUID - use simple integer for compatibility
                  message: 'Development module data saved successfully' 
                });
              }

  } catch (error) {
    console.error('❌ [SUPABASE] Error in development endpoint:', error);
    res.status(500).json({ 
      error: 'Server error',
      details: error.message 
    });
  }
});

// Clear all data for a device (for testing) - NOW CLEARS SUPABASE!
app.delete('/api/data/clear/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    console.log(`🗑️ [SUPABASE] CLEARING ALL DATA for device: ${deviceId}`);

    // Delete all data for this device from SUPABASE
    const deletePromises = [
      supabase.from('daily_challenges').delete().eq('device_id', deviceId),
      supabase.from('openers').delete().eq('device_id', deviceId), 
      supabase.from('development_modules').delete().eq('device_id', deviceId),
      supabase.from('conversation_practice_scenarios').delete().eq('device_id', deviceId)
    ];

    const deleteResults = await Promise.all(deletePromises);
    
    // Check for errors
    const errors = deleteResults.filter(result => result.error);
    if (errors.length > 0) {
      console.error('❌ [SUPABASE] Error deleting data:', errors);
      return res.status(500).json({ error: 'Failed to clear some data tables' });
    }

    console.log('✅ [SUPABASE] Deleted challenges, openers, development modules, conversation practice scenarios');

    // Reset user streaks to 0 in Supabase  
    const { error: userResetError } = await supabase
      .from('users')
      .update({
        current_streak: 0,
        all_time_best_streak: 0,
        last_completion_date: null
      })
      .eq('device_id', deviceId);

    if (userResetError) {
      console.error('❌ [SUPABASE] Error resetting user streak:', userResetError);
      return res.status(500).json({ error: 'Failed to reset user streak' });
    }

    console.log('✅ [SUPABASE] Reset user streak to 0');

      // Send success response
      res.json({ 
        success: true, 
      message: 'All data cleared for testing from Supabase',
        clearedTables: ['daily_challenges', 'openers', 'development_modules', 'conversation_practice_scenarios', 'users']
    });

  } catch (error) {
    console.error('❌ Error clearing data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get User Analytics - NOW COMPLETELY POWERED BY SUPABASE!
app.get('/api/data/analytics/:deviceId', async (req, res) => {
  console.log('🎯🎯🎯 ANALYTICS ENDPOINT CALLED 🎯🎯🎯');
  console.log('ANALYTICS: Request received at', new Date().toISOString());
  try {
    const { deviceId } = req.params;
    const { currentDate, completed } = req.query;
    console.log('ANALYTICS: deviceId:', deviceId, 'currentDate:', currentDate);

    console.log(`🚀 [SUPABASE] ANALYTICS V3 START: Device ${deviceId}, currentDate: ${currentDate}`);

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    // Use simulated date if provided, otherwise use current date
    const referenceDate = currentDate ? new Date(currentDate + 'T00:00:00.000Z') : new Date();
    
    console.log(`📊 [SUPABASE] ANALYTICS: Device ${deviceId}, Reference Date: ${referenceDate.toISOString()}`);

    // Get user info from SUPABASE
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('device_id', deviceId)
      .single();

    if (userError && userError.code !== 'PGRST116') {
      console.error('❌ [SUPABASE] Error getting user for analytics:', userError);
        return res.status(500).json({ error: 'Database error' });
      }

      // If no user exists, return all zeros
      if (!user) {
      console.log(`📊 [SUPABASE] ANALYTICS: No user found for ${deviceId}, returning all zeros`);
        return res.json({
          currentStreak: 0,
          allTimeBestStreak: 0,
          socialConfidencePercentage: 0,
          weeklyActivity: [0, 0, 0, 0, 0, 0, 0],
          overallSuccessRate: 0,
          totalChallenges: 0,
          totalOpeners: 0,
          successfulChallenges: 0,
          successfulOpeners: 0,
          improvedConfidence: 0,
          reducedSocialAnxiety: 0,
          enhancedCommunication: 0,
          increasedSocialEnergy: 0,
          betterRelationships: 0,
          averageRating: 0,
          totalModulesStarted: 0,
          completedModules: 0,
          averageModuleProgress: 0
        });
      }

    console.log(`📊 [SUPABASE] ANALYTICS: User found - current_streak: ${user.current_streak}, best_streak: ${user.all_time_best_streak}`);

    // Get ALL data from SUPABASE for analytics calculations
    console.log(`📊 [SUPABASE] ANALYTICS: Fetching all data for comprehensive calculations`);

    // Get all challenges from Supabase
    const { data: allChallenges, error: challengesError } = await supabase
      .from('daily_challenges')
      .select('*')
      .eq('device_id', deviceId);

    if (challengesError) {
      console.error('❌ [SUPABASE] Error getting challenges for analytics:', challengesError);
      return res.status(500).json({ error: 'Database error getting challenges' });
    }

    // Get all openers from Supabase
    const { data: allOpeners, error: openersError } = await supabase
      .from('openers')
      .select('*')
      .eq('device_id', deviceId);

    if (openersError) {
      console.error('❌ [SUPABASE] Error getting openers for analytics:', openersError);
      return res.status(500).json({ error: 'Database error getting openers' });
    }

    // Get all development modules from Supabase
    const { data: allModules, error: modulesError } = await supabase
      .from('development_modules')
      .select('*')
      .eq('device_id', deviceId);

    if (modulesError) {
      console.error('❌ [SUPABASE] Error getting development modules for analytics:', modulesError);
      return res.status(500).json({ error: 'Database error getting modules' });
    }

    console.log(`📊 [SUPABASE] ANALYTICS DATA: Challenges: ${(allChallenges || []).length}, Openers: ${(allOpeners || []).length}, Modules: ${(allModules || []).length}`);

    // Calculate analytics stats directly from Supabase data (replacing calculateAllAnalyticsStats)
    const totalChallenges = (allChallenges || []).length;
    const successfulChallenges = (allChallenges || []).filter(c => c.challenge_was_successful === true).length;
    const avgChallengeConfidence = totalChallenges > 0 
      ? (allChallenges || []).filter(c => c.challenge_confidence_level != null)
          .reduce((sum, c) => sum + (c.challenge_confidence_level || 0), 0) / 
        (allChallenges || []).filter(c => c.challenge_confidence_level != null).length
      : 0;

    const usedOpeners = (allOpeners || []).filter(o => o.opener_was_used === true);
    const totalOpeners = usedOpeners.length;
    const successfulOpeners = usedOpeners.filter(o => o.opener_was_successful === true).length;
    const avgRating = usedOpeners.length > 0
      ? usedOpeners.reduce((sum, o) => sum + (o.opener_rating || 0), 0) / usedOpeners.length
      : 0;

    const totalModulesStarted = (allModules || []).length;
    const completedModules = (allModules || []).filter(m => m.development_is_completed === true).length;
    const avgProgress = totalModulesStarted > 0
      ? (allModules || []).reduce((sum, m) => sum + (m.development_progress_percentage || 0), 0) / totalModulesStarted
      : 0;

    console.log(`📊 [SUPABASE] CALCULATED STATS: Challenges: ${totalChallenges}/${successfulChallenges}, Openers: ${totalOpeners}/${successfulOpeners}, Modules: ${totalModulesStarted}/${completedModules}`);

    // Calculate activity dates and weekly activity (replacing calculateWeeklyActivityCounts)
    const openerActivityDates = usedOpeners.map(o => o.opener_date?.split('T')[0]).filter(Boolean);
    const challengeActivityDates = (allChallenges || []).map(c => c.challenge_date?.split('T')[0]).filter(Boolean);
    const allActivityDates = [...new Set([...openerActivityDates, ...challengeActivityDates])].sort();

    console.log(`📊 [SUPABASE] ACTIVITY DATES: ${allActivityDates.length} unique dates: [${allActivityDates.join(', ')}]`);

    // Build weekly activity array (last 7 days)
    const weeklyActivityArray = [];
    for (let i = 6; i >= 0; i--) {
      const checkDate = new Date(referenceDate);
      checkDate.setDate(referenceDate.getDate() - i);
      const dateString = checkDate.toISOString().split('T')[0];
      
      // Count activities on this date
      const dayActivityCount = 
        (allChallenges || []).filter(c => c.challenge_date?.split('T')[0] === dateString).length +
        usedOpeners.filter(o => o.opener_date?.split('T')[0] === dateString).length;
      
      weeklyActivityArray.push(dayActivityCount);
    }

    console.log(`📊 [SUPABASE] WEEKLY ACTIVITY: [${weeklyActivityArray.join(', ')}]`);
    // Use authoritative Supabase streak instead of recalculating from activity  
    const currentStreak = user.current_streak || 0;
    console.log(`🔧 [SUPABASE] ANALYTICS: Using authoritative streak: ${currentStreak} (from Supabase user record)`);

    // Calculate allTimeMaxStreak from activity data (same logic as other endpoints)
            const computeMaxConsecutiveStreak = (dates) => {
              if (!dates || dates.length === 0) return 0;
              const sorted = [...dates].sort();
              let maxRun = 1, run = 1;
              for (let i = 1; i < sorted.length; i++) {
                const prev = new Date(sorted[i - 1] + 'T00:00:00Z');
                const cur = new Date(sorted[i] + 'T00:00:00Z');
                const diff = Math.floor((cur - prev) / (1000 * 60 * 60 * 24));
                if (diff === 1) { run += 1; maxRun = Math.max(maxRun, run); }
                else if (diff > 1) { run = 1; }
              }
              return maxRun;
            };
    const derivedBestStreak = computeMaxConsecutiveStreak(allActivityDates);
            const allTimeMaxStreak = Math.max(user?.all_time_best_streak || 0, derivedBestStreak);

    // Calculate lastAchievedLevel (same logic as other endpoints)  
            const toISO = (d) => d.toISOString().split('T')[0];
            let lastRun = 0;
    if (allActivityDates.length > 0) {
      // Use most recent date (allActivityDates is ASC ordered, so take last element)
      const recent = new Date(allActivityDates[allActivityDates.length - 1] + 'T00:00:00Z');
              let check = new Date(recent);
              while (true) {
                const ds = toISO(check);
        if (allActivityDates.includes(ds)) {
                  lastRun += 1;
                  check.setDate(check.getDate() - 1);
                } else {
                  break;
                }
              }
            }

            // Use allTimeMaxStreak for highest level achieved (for grace recovery)
            const lastAchievedLevel = allTimeMaxStreak >= 90
              ? 'Socialite'
              : allTimeMaxStreak >= 46
                ? 'Charming'
                : allTimeMaxStreak >= 21
                  ? 'Coming Alive'
                  : allTimeMaxStreak >= 7
                    ? 'Breaking Through'
                    : 'Warming Up';

    console.log(`🔧 [SUPABASE] ANALYTICS: Derived stats - lastRun: ${lastRun}, lastAchievedLevel: ${lastAchievedLevel}, allTimeMaxStreak: ${allTimeMaxStreak}`);

    // Calculate core metrics using SUPABASE data (same logic as SQLite version)
    const totalSuccessfulActions = successfulChallenges + successfulOpeners;
    const totalActions = totalChallenges + totalOpeners;
            const overallSuccessRate = totalActions > 0 ? Math.round((totalSuccessfulActions / totalActions) * 100) : 0;
    
            // Bayesian smoothing for success rate to reduce volatility at low volume
            const priorCount = 12; // neutral prior ~ two weeks of mixed activity
            const priorMean = 0.5; // assume 50% success prior
            const smoothedSuccessRate = Math.round(((totalSuccessfulActions + priorMean * priorCount) / (totalActions + priorCount)) * 100);
            // Social Confidence = function of Social Zone and streak, with graceful trickle-down
    // Compute zone from current context using SUPABASE data
            const todayForZone = referenceDate || new Date();
            const daysSinceActivityForZone = (() => {
      if (allActivityDates.length === 0) return 999;
      const mostRecentActivity = allActivityDates[allActivityDates.length - 1]; // Last element (most recent)
      const d1 = new Date(mostRecentActivity + 'T00:00:00Z');
              const d2 = new Date(todayForZone);
              return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
            })();
    console.log(`🔧 [SUPABASE] ANALYTICS: About to call calculateSocialZoneLevel with:`, {
              currentStreak,
              daysSinceActivityForZone,
              lastAchievedLevel,
              allTimeMaxStreak,
              'user.all_time_best_streak': user.all_time_best_streak,
      'mostRecentActivity': allActivityDates[allActivityDates.length - 1],
              'todayForZone': todayForZone.toISOString().split('T')[0]
            });

            const zoneInfo = calculateSocialZoneLevel(
              currentStreak,
              daysSinceActivityForZone,
              lastAchievedLevel,
              allTimeMaxStreak,
      allActivityDates
            );

    console.log(`🔧 [SUPABASE] ANALYTICS: calculateSocialZoneLevel returned:`, zoneInfo);
    
          const zoneOrder = ['Warming Up', 'Breaking Through', 'Coming Alive', 'Charming', 'Socialite'];
          const zoneIndex = Math.max(0, zoneOrder.indexOf(zoneInfo.level));
    
          // STRICT mapping: Social Confidence always matches Social Zone level
          // Zone start/end mapping (strict per-zone band), plus within-zone progression by streak
          const zoneStart = [4, 20, 40, 60, 80]; // entry confidence for each zone
          const zoneEnd   = [18, 32, 52, 72, 90]; // cap within each zone
          const zoneBaseRequirements = [0, 7, 21, 46, 90];
          const nextRequirements = [7, 21, 46, 90, 120]; // last one effectively "infinity"

          const startPct = zoneStart[zoneIndex] ?? 2;
          const endPct   = zoneEnd[zoneIndex] ?? 90;
          const zoneStartStreak = zoneBaseRequirements[zoneIndex] ?? 0;
          const zoneEndStreak = nextRequirements[zoneIndex] ?? (zoneStartStreak + 30);
          const zoneSpan = Math.max(1, zoneEndStreak - zoneStartStreak);
          const streakWithinZone = Math.max(0, Math.min(zoneSpan, currentStreak - zoneStartStreak));
    
          // Calculate progress within the zone (0 to 1)
          const linearProgress = streakWithinZone / zoneSpan;
          // Apply conservative easing curve (^1.6) for smoother early progression
          const progress = Math.pow(linearProgress, 1.6);
          let socialConfidencePercentage = Math.round(startPct + (endPct - startPct) * progress);

    console.log(`💫 [SUPABASE] CONFIDENCE DEBUG:`, {
            zone: zoneInfo.level,
            zoneIndex,
            currentStreak,
            streakWithinZone,
            linearProgress: (linearProgress * 100).toFixed(1) + '%',
            easedProgress: (progress * 100).toFixed(1) + '%',
            startPct,
            endPct,
            baseConfidence: socialConfidencePercentage,
            isInGracePeriod: zoneInfo.isInGracePeriod
          });

          // Apply decay by days since last activity (still anchored to current zone)
          const daysMissed = Math.max(0, daysSinceActivityForZone);
          const decayPerDayInGrace = 0.4;  // gentler decay during grace
          const decayPerDayAfterGrace = 1.2; // faster decay after grace expires
          const decayRate = zoneInfo.isInGracePeriod ? decayPerDayInGrace : decayPerDayAfterGrace;
          const decayAmount = decayRate * daysMissed;
          socialConfidencePercentage = Math.max(2, Math.round(socialConfidencePercentage - decayAmount));

    console.log(`💫 [SUPABASE] CONFIDENCE DECAY:`, {
            daysMissed,
            decayRate: decayRate + '%/day',
            totalDecay: decayAmount + '%',
            finalConfidence: socialConfidencePercentage + '%'
          });

    // Damping weights to avoid volatility with very few actions (using SUPABASE data)
          // Logarithmic ramp up – reaches ~1 around 16+ actions
          const effectiveVolume = Math.min(1, Math.log2((totalActions || 0) + 1) / 4);
    const openerEffectiveVolume = Math.min(1, Math.log2(totalOpeners + 1) / 4);

    // Calculate personal benefits using SUPABASE data
          let improvedConfidence = 0, reducedSocialAnxiety = 0, enhancedCommunication = 0;
          let increasedSocialEnergy = 0, betterRelationships = 0;

          // Only calculate benefits based on actual activities (stabilized growth curves)
    if (currentStreak > 0 || totalChallenges > 0 || totalOpeners > 0) {
            // Helper functions for smooth, bounded growth
            const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
            const logistic = (n, k, max) => max * (1 - Math.exp(-k * Math.max(0, n)));

            const A = totalActions;              // total activity volume
            const S = currentStreak;             // streak length

            // Improved Confidence – small baseline, slow growth from streak + volume, light success influence
            const confFromStreak = logistic(S, 0.18, 35);      // caps at 35
            const confFromActivity = logistic(A, 0.08, 20);    // caps at 20
            const confFromSuccess = ((smoothedSuccessRate - 50) / 100) * 10 * effectiveVolume; // ±5 at low volume
            improvedConfidence = clamp(20 + confFromStreak + confFromActivity + confFromSuccess, 10, 85);

            // Reduced Social Anxiety – similar scale, slightly different weights
            const anxFromStreak = logistic(S, 0.15, 25);
            const anxFromActivity = logistic(A, 0.06, 15);
            const anxFromSuccess = ((smoothedSuccessRate - 50) / 100) * 8 * effectiveVolume;
            reducedSocialAnxiety = clamp(20 + anxFromStreak + anxFromActivity + anxFromSuccess, 10, 85);

            // Increased Social Energy – very gentle curve with streak only
            increasedSocialEnergy = clamp(12 + logistic(S, 0.12, 25), 10, 70);

            // Better Relationships – based on opener success with strong damping + small streak effect
            const openerPriorCount = 8;
            const openerSmoothedRate = totalOpeners > 0
              ? ((successfulOpeners + priorMean * openerPriorCount) / (totalOpeners + openerPriorCount)) * 100
              : priorMean * 100;
            const relFromOpeners = (openerSmoothedRate * 0.18) * openerEffectiveVolume; // capped by effective volume
            const relFromStreak = logistic(S, 0.08, 10);
            betterRelationships = clamp(15 + relFromOpeners + relFromStreak, 10, 80);
          }
          
    // Enhanced Communication is calculated separately and includes module progress (using SUPABASE data)
          // Module contribution scales based on number of completed modules
    const moduleProgressScore = Math.min(100, avgProgress || 0);
          
          // Base contribution from modules is 30%, but increases with more modules completed
          // 1 module = 30%, 2 modules = 40%, 3 modules = 50%, 4+ modules = 60%
          // Module weight grows with completed modules; keep low with none
          const moduleContribution = Math.min(40, Math.max(5, completedModules * 10));
          // Activity contribution is damped at low volume
          const activityContribution = (100 - moduleContribution) * effectiveVolume;
          
          // Calculate enhanced communication with dynamic weighting
          enhancedCommunication = Math.round(
            (smoothedSuccessRate * (activityContribution / 100)) +
            (moduleProgressScore * (moduleContribution / 100))
          );

          // Cap all benefits at 100
          improvedConfidence = Math.min(100, Math.round(improvedConfidence));
          reducedSocialAnxiety = Math.min(100, Math.round(reducedSocialAnxiety));
          enhancedCommunication = Math.min(100, enhancedCommunication);
          increasedSocialEnergy = Math.min(100, Math.round(increasedSocialEnergy));
          betterRelationships = Math.min(100, Math.round(betterRelationships));

          // Return complete analytics data
          res.json({
            _DEBUG_NEW_VERSION: 'v8.2.0-GRACE-RECOVERY-PROGRESSIVE',
            _DEBUG_GRACE_WORKING: zoneInfo,
            currentStreak: currentStreak,
            allTimeBestStreak: allTimeMaxStreak,
            socialZoneLevel: zoneInfo.level,  // ADD ZONE DIRECTLY TO ANALYTICS RESPONSE
            socialConfidencePercentage: socialConfidencePercentage,
            weeklyActivity: weeklyActivityArray,
            overallSuccessRate: overallSuccessRate,
            totalChallenges: totalChallenges,
            totalOpeners: totalOpeners,
            successfulChallenges: successfulChallenges,
            successfulOpeners: successfulOpeners,
            improvedConfidence: improvedConfidence,
            reducedSocialAnxiety: reducedSocialAnxiety,
            enhancedCommunication: enhancedCommunication,
            increasedSocialEnergy: increasedSocialEnergy,
            betterRelationships: betterRelationships,
            averageRating: Math.round(avgRating * 10) / 10,
            totalModulesStarted: totalModulesStarted,
            completedModules: completedModules,
            averageModuleProgress: Math.round(avgProgress * 10) / 10
          });

    console.log(`📊 [SUPABASE] ANALYTICS COMPLETE: Migration successful`);

  } catch (error) {
    console.error('❌ [SUPABASE] Error in analytics endpoint:', error);
    res.status(500).json({ 
      error: 'Server error',
      details: error.message 
    });
  }
});

// DEBUG ENDPOINT FOR ACTIVITY QUERY TEST

// NEW CLEAN WEEK BAR + STREAK SYSTEM - NOW FULLY SUPABASE!
  app.get('/api/clean/home/:deviceId', async (req, res) => {
    console.log('🚨🚨🚨 HOME ENDPOINT CALLED 🚨🚨🚨');
    console.log('HOME: Request received at', new Date().toISOString());
    try {
      const { deviceId } = req.params;
      const { currentDate } = req.query;
      console.log('HOME: deviceId:', deviceId, 'currentDate:', currentDate);
    
    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }
    
      console.log(`🎯 [SUPABASE] CLEAN SYSTEM: Device ${deviceId}, Current Date: ${currentDate}`);
      
      // Step 1: Get user account creation date from SUPABASE
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('device_id', deviceId)
        .single();
      
      if (userError && userError.code !== 'PGRST116') {
        console.error('❌ [SUPABASE] Error getting user:', userError);
                return res.status(500).json({ error: 'Database error' });
              }

      console.log(`🎯 [SUPABASE] HOME: User data:`, user ? {
        device_id: user.device_id,
        current_streak: user.current_streak,
        all_time_best_streak: user.all_time_best_streak,
        last_completion_date: user.last_completion_date
      } : 'No user found');

      const today = currentDate ? new Date(currentDate + 'T00:00:00Z') : new Date();
      // Account creation logic for proper week bar colors
      let accountCreationDate;
      if (user && user.created_at) {
        // Always use the stored creation date
        accountCreationDate = new Date(user.created_at);
      } else {
        // No user record = treat as created today
        // This shows all past days as grey (before account creation)
        accountCreationDate = new Date(today); // Account created "today" in simulation
      }
      
      console.log(`🎯 Account created: ${accountCreationDate.toISOString().split('T')[0]}`);
      console.log(`🎯 Current date: ${today.toISOString().split('T')[0]}`);
      console.log(`🎯 Account creation full date: ${accountCreationDate.toISOString()}`);
      console.log(`🎯 Account creation date string for comparison: ${accountCreationDate.toISOString().split('T')[0]}`);
      
      // Step 2: Get all activity dates from SUPABASE (used openers + completed challenges)
      try {
        console.log(`🎯 [SUPABASE] Getting activity dates for device: ${deviceId}`);
        
        // Get opener activity dates from Supabase
        const { data: openerActivities, error: openerError } = await supabase
          .from('openers')
          .select('opener_date')
          .eq('device_id', deviceId)
          .eq('opener_was_used', true);
        
        if (openerError) {
          console.error('❌ [SUPABASE] Error getting opener activities:', openerError);
          return res.status(500).json({ error: 'Database error getting opener activities' });
        }
        
        // Get challenge activity dates from Supabase  
        const { data: challengeActivities, error: challengeError } = await supabase
          .from('daily_challenges')
          .select('challenge_date')
          .eq('device_id', deviceId);
        
        if (challengeError) {
          console.error('❌ [SUPABASE] Error getting challenge activities:', challengeError);
          return res.status(500).json({ error: 'Database error getting challenge activities' });
        }
        
        // Combine and format activity dates (same logic as SQLite version)
        const allActivityDates = [
          ...(openerActivities || []).map(row => row.opener_date?.split('T')[0]).filter(Boolean),
          ...(challengeActivities || []).map(row => row.challenge_date?.split('T')[0]).filter(Boolean)
        ];
        
        // Remove duplicates and sort (same as SQLite DISTINCT and ORDER BY)
        const activityDates = [...new Set(allActivityDates)].sort();
        
        console.log(`🎯 [SUPABASE] Activity dates: [${activityDates.join(', ')}]`);
        console.log(`🎯 [SUPABASE] Opener activities: ${(openerActivities || []).length}`);
        console.log(`🎯 [SUPABASE] Challenge activities: ${(challengeActivities || []).length}`);
        console.log(`🎯 [SUPABASE] Combined unique dates: ${activityDates.length}`);
        
        // Step 3: Build week bar using SUPABASE activity data (6 previous days + today)
        const weekBar = [];
        
                  for (let i = 6; i >= 0; i--) {
                    const checkDate = new Date(today);
                    checkDate.setDate(today.getDate() - i);
                    const dateString = checkDate.toISOString().split('T')[0];
          
          let color = 'none';
          
          if (i === 0) {
            // Position 6: Today is always white
            color = 'today';
          } else if (activityDates.includes(dateString)) {
            // Has activity: green (check activity FIRST, before account creation logic)
            color = 'activity';
          } else if (dateString < accountCreationDate.toISOString().split('T')[0]) {
            // Before account creation: grey
            color = 'before';
            console.log(`🎯 [SUPABASE] BEFORE: ${dateString} < ${accountCreationDate.toISOString().split('T')[0]}`);
                      } else {
            // No activity after account creation: red
            color = 'missed';
          }
          
          weekBar.push(color);
          const accountDateStr = accountCreationDate.toISOString().split('T')[0];
          console.log(`🎯 [SUPABASE] Day ${i}: ${dateString} → ${color} (activity: ${activityDates.includes(dateString)}, comparison: "${dateString}" vs account "${accountDateStr}", is before: ${dateString < accountDateStr})`);
        }
        
        // Step 4: Check if streak is broken due to missed days
        const referenceDate = currentDate ? new Date(currentDate + 'T00:00:00.000Z') : new Date();
        console.log(`🔧 [SUPABASE] HOME: Using referenceDate: ${referenceDate.toISOString()}, vs today: ${today.toISOString()}`);
        
        // Check if streak is broken due to missed days
        let currentStreak = user ? (user.current_streak || 0) : 0;
        
        if (user && user.last_completion_date && currentStreak > 0) {
          const lastCompletionStr = user.last_completion_date.split('T')[0];
          const todayStr = referenceDate.toISOString().split('T')[0];
          
          const lastDate = new Date(lastCompletionStr + 'T00:00:00Z');
          const currentDateObj = new Date(todayStr + 'T00:00:00Z');
          const daysSinceLastActivity = Math.floor((currentDateObj.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
          
          console.log(`🔧 [SUPABASE] HOME: Streak break check - Last activity: ${lastCompletionStr}, Today: ${todayStr}, Days since: ${daysSinceLastActivity}`);
          
          if (daysSinceLastActivity > 1) {
            // Streak is broken - reset to 0 for "Start Streak" display
            console.log(`🔥 [SUPABASE] HOME: Streak broken! ${daysSinceLastActivity} days since last activity. Setting streak to 0.`);
            currentStreak = 0;
            
            // Update the user record to reflect broken streak
            await supabase
              .from('users')
              .update({ current_streak: 0 })
              .eq('device_id', deviceId);
          } else {
            console.log(`🔥 [SUPABASE] HOME: Streak intact - ${daysSinceLastActivity} days since last activity.`);
          }
        }
        
        console.log(`🔧 [SUPABASE] HOME: Final streak after gap check: ${currentStreak}`);
        
        console.log(`🎯 [SUPABASE] Current streak: ${currentStreak}`);
        console.log(`🎯 [SUPABASE] Week bar: [${weekBar.join(', ')}]`);
        
        // Compute Social Zone with grace period using SUPABASE activity data
        const daysSinceActivity = (() => {
          const todayStr = referenceDate.toISOString().split('T')[0];
          if (activityDates.length === 0) return 999;
          const mostRecent = activityDates[activityDates.length - 1];
          const d1 = new Date(mostRecent + 'T00:00:00Z');
          const d2 = new Date(todayStr + 'T00:00:00Z');
          const daysDiff = Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
          console.log(`🔧 [SUPABASE] HOME: daysSinceActivity calculation - mostRecent: ${mostRecent}, referenceDate: ${todayStr}, daysDiff: ${daysDiff}`);
          return daysDiff;
        })();

        // Recompute best streak from activity dates to ensure grace works even if DB best streak isn't updated
        const computeMaxConsecutiveStreak = (dates) => {
          if (!dates || dates.length === 0) return 0;
          const sorted = [...dates].sort();
          let maxRun = 1, run = 1;
          for (let i = 1; i < sorted.length; i++) {
            const prev = new Date(sorted[i - 1] + 'T00:00:00Z');
            const cur = new Date(sorted[i] + 'T00:00:00Z');
            const diff = Math.floor((cur - prev) / (1000 * 60 * 60 * 24));
            if (diff === 1) { run += 1; maxRun = Math.max(maxRun, run); }
            else if (diff > 1) { run = 1; }
          }
          return maxRun;
        };
        const derivedBestStreak = computeMaxConsecutiveStreak(activityDates);
        const allTimeMaxStreak = Math.max(user?.all_time_best_streak || 0, derivedBestStreak);

        // Determine the most recently achieved level based purely on the last uninterrupted run
        const toISO = (d) => d.toISOString().split('T')[0];
        let lastRun = 0;
        if (activityDates.length > 0) {
          const recent = new Date(activityDates[activityDates.length - 1] + 'T00:00:00Z'); // FIX: Use last element for most recent with ASC ordering
          // Walk backward from recent while dates are consecutive
          let check = new Date(recent);
          while (true) {
            const ds = toISO(check);
            if (activityDates.includes(ds)) {
              lastRun += 1;
              check.setDate(check.getDate() - 1);
            } else {
              break;
            }
          }
        }

        // Use allTimeMaxStreak for highest level achieved (for grace recovery)
        const lastAchievedLevel = allTimeMaxStreak >= 90
          ? 'Socialite'
          : allTimeMaxStreak >= 46
            ? 'Charming'
            : allTimeMaxStreak >= 21
              ? 'Coming Alive'
              : allTimeMaxStreak >= 7
                ? 'Breaking Through'
                : 'Warming Up';

        console.log('!!!!! HOME ENDPOINT HIT - DEVICE:', deviceId);
        console.log('!!!!! HOME ACTIVITY DATES:', activityDates);
        console.log('!!!!! HOME LASTRUN:', lastRun);
        console.log('!!!!! HOME DAYS SINCE:', daysSinceActivity);
        console.log('!!!!! HOME LAST ACHIEVED:', lastAchievedLevel);
        console.log('!!!!! HOME ALL TIME MAX:', allTimeMaxStreak);
        console.log(`🔧 HOME CRITICAL: About to call calculateSocialZoneLevel with:`, {
          currentStreak,
          daysSinceActivity,
          lastAchievedLevel,
          allTimeMaxStreak,
          derivedBestStreak,
          lastRun,
          user_all_time_best_streak: user?.all_time_best_streak,
          activityDates: activityDates
        });
        console.log(`🔧 HOME CRITICAL: This should now match analytics endpoint exactly!`);
        
        // EMERGENCY DEBUG - Log exact parameters
        console.log('🚨🚨🚨 EXACT PARAMS BEING PASSED:');
        console.log('- activityDates:', activityDates);
        console.log('- lastRun:', lastRun);
        console.log('- currentStreak:', currentStreak);
        console.log('- daysSinceActivity:', daysSinceActivity);
        console.log('- lastAchievedLevel:', lastAchievedLevel);
        console.log('- allTimeMaxStreak:', allTimeMaxStreak);

        const zone = calculateSocialZoneLevel(currentStreak, daysSinceActivity, lastAchievedLevel, allTimeMaxStreak, activityDates);

        console.log(`🔧 CLEAN HOME DEBUG: calculateSocialZoneLevel returned:`, zone);
        console.log('!!!!! HOME ZONE RESULT:', zone);

        // Use zone level directly (no softening) so grace/window behavior is exact
        const ordered = ['Warming Up', 'Breaking Through', 'Coming Alive', 'Charming', 'Socialite'];
        const softenedLevel = zone.level;

        console.log('!!!!! HOME RESPONSE BEING SENT:', {
          currentStreak: currentStreak,
          weeklyActivity: weekBar,
          hasActivityToday: activityDates.includes(today.toISOString().split('T')[0]),
          socialZoneLevel: softenedLevel,
          zoneFromFunction: zone
        });

        // Get total challenges count for reset dialog
        const { data: allChallenges, error: challengeCountError } = await supabase
          .from('daily_challenges')
          .select('id')
          .eq('device_id', deviceId);
        
        const totalChallenges = allChallenges?.length || 0;
        console.log(`🎯 [SUPABASE] HOME: Total challenges for device: ${totalChallenges}`);

        // Return complete home screen data (enhanced with challenge count for reset dialog)
        const homeResponse = {
          currentStreak: currentStreak,
          weeklyActivity: weekBar,
          hasActivityToday: activityDates.includes(today.toISOString().split('T')[0]),
          socialZoneLevel: zone.level,
          totalChallenges: totalChallenges,  // NEW: For accurate reset dialog data
          _DEBUG_HOME_VERSION: 'v8.3.0-SUPABASE-COMPLETE',
          _DEBUG_HOME_ZONE: zone
        };
        
        console.log('🎯 [SUPABASE] HOME RESPONSE:', homeResponse);
        res.json(homeResponse);
        
      } catch (activityError) {
        console.error('❌ [SUPABASE] Error getting activity data:', activityError);
        return res.status(500).json({ error: 'Database error getting activity data' });
      }
      
    } catch (error) {
      console.error('❌ [SUPABASE] Error in clean home endpoint:', error);
      res.status(500).json({ 
        error: 'Server error',
        details: error.message 
      });
  }
});

// Removed duplicate calculateConsecutiveStreak function - now using global version

// ORIGINAL SIMULATED ENDPOINT (BACKUP)

// Home Screen Data API Endpoint - SIMPLIFIED SUPABASE FALLBACK (iOS Dependency)
app.get('/api/data/home/:deviceId', async (req, res) => {
  try {
    console.log('🏠 [SUPABASE] Home fallback endpoint - redirecting to main clean endpoint');
    const { deviceId } = req.params;
    const { customDate } = req.query;

    // This is a fallback endpoint - use the main clean home logic
    const currentDateParam = customDate ? `?currentDate=${customDate}` : '';
    const cleanEndpoint = `/api/clean/home/${deviceId}${currentDateParam}`;
    
    console.log(`🏠 [SUPABASE] Redirecting to clean endpoint: ${cleanEndpoint}`);
    
    // Make internal request to the main clean home endpoint (already fully Supabase)
    const homeUrl = `${req.protocol}://${req.get('host')}${cleanEndpoint}`;
    
    try {
      const response = await fetch(homeUrl, {
        headers: {
          'x-api-key': req.get('x-api-key') || '',
        }
      });
      
      if (!response.ok) {
        throw new Error(`Clean home endpoint failed: ${response.status}`);
      }
      
      const homeData = await response.json();
      
      console.log('✅ [SUPABASE] Home fallback: Successfully fetched data from clean endpoint');
      res.json(homeData);
      
    } catch (fetchError) {
      console.error('❌ [SUPABASE] Error calling clean home endpoint:', fetchError);
      
      // Fallback to simple response
      res.json({
        currentStreak: 0,
            socialZoneLevel: "Warming Up",
        weeklyActivity: [0, 0, 0, 0, 0, 0, 0],
        hasActivityToday: false
      });
    }

  } catch (error) {
    console.error('❌ [SUPABASE] Error in home fallback endpoint:', error);
    res.status(500).json({ 
      error: 'Server error',
      details: error.message 
    });
  }
});

// DEBUG ENDPOINT - Check weekly activity calculation

// DEBUG ENDPOINT - Test streak updates with specific dates

// DEBUG ENDPOINT - Check streak-contributing actions

// RAW DATA DEBUG ENDPOINT - See all collected form data



app.post('/generate-opener', requireApiKey, aiRateLimit, async (req, res) => {
  try {
    const { purpose, setting, context } = req.body;
    console.log('Received opener request:', { purpose, setting, context });
    
    // Handle optional context
    const contextText = context && context.trim() ? context : `a ${setting} environment`;
    
    // Create purpose-specific prompts
    let prompt;
    
    if (purpose.toLowerCase() === 'romantic') {
      // ROMANTIC PURPOSE ONLY - Dedicated romantic framework only, no CASUAL & PROFESSIONAL framework
      prompt = `Create a conversation opener for:

Purpose: ${purpose}
Setting: ${setting}  
Context: ${contextText}

# ROMANTIC INTEREST OPENER FRAMEWORK

### CORE GOALS:
1. Be non-threatening — casual, approachable, friendly
2. Be positive/neutral — never judgmental, naggy, or teasing
3. Be engaging — sparks curiosity and invites a reply
4. Be situational — context-aware, relevant to environment/activity
5. Show interest
6. Be charming — focus on getting conversation going
7. Be seductive but playful — create intrigue without being pushy

## FORMULA:
**PRIORITIZE DIRECT APPROACH:**
• Direct Intro Start = [Direct Personal Intro] + [Observation/Compliment] + [Light Question]
• (Occasionally Environmental Start = [Environment Observation] + [Personal Observation/Compliment] + [Light Question])

## OPENER TYPES:
• Situational Observation — comment on what's happening around you
• Personal Observation (Tasteful) — notice a detail without judging
• Opinion Question — invite perspective on something light and relevant
• Genuine Compliment + Follow-Up — compliment naturally tied to a question

## RULES FOR DELIVERY:
• Tone: friendly, curious, and light
• Avoid big words — be casual and conversational
• Use simple, natural language — say "smile" not "incredible smile", "stories" not "fascinating stories"
• Be charming — focus on getting conversation going
• Be seductive but playful — create intrigue without being pushy
• Avoid judgmental framing:
  * Avoid: "Why are you on your phone?"
  * Better: "Do you usually train here, or just trying it out?"
• Focus on neutral-to-positive hooks — environment, activity, shared context

### ⚡ STRICT REQUIREMENTS:
* Each opener must feel completely different from the last
* **PRIORITIZE DIRECT PERSONAL INTROS:** Usually start with direct personal intros, occasionally use environment observations
* Use varied sentence structures and question types
* Sometimes brief, sometimes more conversational
* Mix direct approaches with indirect observations
* NEVER use these banned words: "energy", "vibe", "atmosphere", "presence"
* Never ask to join someone — this is conversation starter, not request
* Avoid big words — keep casual and conversational
* Use simple, natural language — avoid unnecessary adjectives ("incredible smile" → "smile", "fascinating stories" → "stories")

### 🚫 CRITICAL ANTI-ASSUMPTION RULES:
* DO NOT use same greeting patterns repeatedly ("Hey there!", "Hi!", etc.)
* COMPLETELY AVOID overused words: "energy", "vibe", "atmosphere", "presence" - these are banned entirely
* DO NOT repeat same opening phrases ("Couldn't help noticing...", "You've got this...", "Your form looks...", etc.)
* NEVER assume specific details not mentioned in context
* FORBIDDEN ASSUMPTIONS: names, drinks, food, furniture, activities, locations within venue, what someone is doing, why they're there, their mood/state
* NEVER invent names — use [Name] placeholder if needed
* NEVER generate same opening structure twice in a row
* VARY YOUR ENTIRE APPROACH: direct questions, observations, casual comments, situational remarks
* CREATE COMPLETELY DIFFERENT OPENERS each time — avoid repeating any phrases or patterns
* STAY COMPLETELY GENERAL — only reference basic setting type
* BANNED WORDS: "Whew", "magnetic", "energy", "vibe", "atmosphere", "presence" — never use these words

## RESPONSE HANDLING:
• POSITIVE RESPONSE (smiles, engages): Continue with follow-up questions, show genuine interest
• NEUTRAL RESPONSE (brief but polite): Keep light, one more attempt with different angle, then graceful transition
• NEGATIVE RESPONSE (closed off, uninterested): Respect boundaries immediately, polite exit

## BODY LANGUAGE CUES:
• Open posture + eye contact = green light to continue
• Polite but closed posture = keep it brief and respectful
• Looking away/phone/headphones = respect the boundary

SUMMARY: Opener = [Friendly Approach] + [Positive/Neutral Observation or Compliment] + [Light Curiosity Question]

Generate:
1. Opener: Create a conversation starter following the framework above - **PRIORITIZE DIRECT APPROACH**: Usually start with direct personal intros, occasionally use environment observations. Use simple, natural language - avoid unnecessary adjectives. Be non-threatening, positive/neutral, engaging, situational, charming, and seductive but playful. Focus on getting a conversation going and creating intrigue without being pushy. NEVER say "Whew", "magnetic", "energy", "vibe", "atmosphere", or "presence"
2. Follow-ups: 3 varied questions that flow naturally from the opener and match the setting
3. ExitStrategy: Natural way to end the conversation gracefully  
4. Tip: Practical advice for this scenario focusing on delivery and mindset
5. Confidence Boost: Encouraging message that builds genuine confidence
6. ResponseFramework: Include this romantic response framework as a single string:

# ROMANTIC INTEREST RESPONSE FRAMEWORK

### CORE GOALS:
1. Be non-threatening — casual, approachable, friendly
2. Be positive/neutral — never judgmental, naggy, or teasing
3. Be engaging — sparks curiosity and invites a reply
4. Be situational — context-aware, relevant to environment/activity
5. Show interest
6. Be charming — focus on getting a conversation going
7. Be seductive but playful — create intrigue without being pushy

## FORMULA:
**PRIORITIZE DIRECT APPROACH:**
• Direct Intro Start = [Direct Personal Intro] + [Observation/Compliment] + [Light Question]
• (Occasionally Environmental Start = [Environment Observation] + [Personal Observation/Compliment] + [Light Question])

## OPENER TYPES:
• Situational Observation — comment on what's happening around you
• Personal Observation (Tasteful) — notice a detail without judging
• Opinion Question — invite perspective on something light and relevant
• Genuine Compliment + Follow-Up — compliment naturally tied to a question

## RULES FOR DELIVERY:
• Tone: friendly, curious, and light
• Avoid big words — be casual and conversational
• Use simple, natural language — say "smile" not "incredible smile", "stories" not "fascinating stories"
• Be charming — focus on getting conversation going
• Be seductive but playful — create intrigue without being pushy
• Avoid judgmental framing:
  * Avoid: "Why are you on your phone?"
  * Better: "Do you usually train here, or just trying it out?"
• Focus on neutral-to-positive hooks — environment, activity, shared context

### ⚡ STRICT REQUIREMENTS:
* Each opener must feel completely different from the last
* **PRIORITIZE DIRECT PERSONAL INTROS:** Usually start with direct personal intros, occasionally use environment observations
* Use varied sentence structures and question types
* Sometimes brief, sometimes more conversational
* Mix direct approaches with indirect observations
* NEVER use these banned words: "energy", "vibe", "atmosphere", "presence"
* Never ask to join someone — this is conversation starter, not request
* Avoid big words — keep casual and conversational
* Use simple, natural language — avoid unnecessary adjectives ("incredible smile" → "smile", "fascinating stories" → "stories")

### 🚫 CRITICAL ANTI-ASSUMPTION RULES:
* DO NOT use same greeting patterns repeatedly ("Hey there!", "Hi!", etc.)
* COMPLETELY AVOID overused words: "energy", "vibe", "atmosphere", "presence" - these are banned entirely
* DO NOT repeat same opening phrases ("Couldn't help noticing...", "You've got this...", "Your form looks...", etc.)
* NEVER assume specific details not mentioned in context
* FORBIDDEN ASSUMPTIONS: names, drinks, food, furniture, activities, locations within venue, what someone is doing, why they're there, their mood/state
* NEVER invent names — use [Name] placeholder if needed
* NEVER generate same opening structure twice in a row
* VARY YOUR ENTIRE APPROACH: direct questions, observations, casual comments, situational remarks
* CREATE COMPLETELY DIFFERENT OPENERS each time — avoid repeating any phrases or patterns
* STAY COMPLETELY GENERAL — only reference basic setting type
* BANNED WORDS: "Whew", "magnetic", "energy", "vibe", "atmosphere", "presence" — never use these words

## RESPONSE HANDLING:
• POSITIVE RESPONSE (smiles, engages): Continue with follow-up questions, show genuine interest
• NEUTRAL RESPONSE (brief but polite): Keep light, one more attempt with different angle, then graceful transition
• NEGATIVE RESPONSE (closed off, uninterested): Respect boundaries immediately, polite exit

## BODY LANGUAGE CUES:
• Open posture + eye contact = green light to continue
• Polite but closed posture = keep it brief and respectful
• Looking away/phone/headphones = respect the boundary

SUMMARY: Opener = [Friendly Approach] + [Positive/Neutral Observation or Compliment] + [Light Curiosity Question]

Return ONLY valid JSON with fields: opener, followUps (array of 3 strings), exitStrategy, tip, confidenceBoost, responseFramework (MUST be a single string, not an object)`;
    } else {
      // CASUAL AND PROFESSIONAL - CASUAL & PROFESSIONAL framework + purpose-specific additions
      prompt = `Create a conversation opener for:

Purpose: ${purpose}
Setting: ${setting}  
Context: ${contextText}

CRITICAL ANTI-ASSUMPTION RULES:
- DO NOT use the same greeting patterns repeatedly ("Hey there!", "Hi!", etc.)
- DO NOT start with similar phrases about "energy/vibe/atmosphere" every time
- ABSOLUTELY NEVER assume specific details not mentioned in the context
- FORBIDDEN ASSUMPTIONS: names, drinks, food, furniture (couches, tables, etc.), activities (people-watching, reading, etc.), locations within venue (corner, bar area, etc.), what someone is doing, why they're there, their mood/state
- NEVER invent names - if name introduction is needed, use [Name] as placeholder
- NEVER generate the same opening structure twice in a row
- VARY YOUR ENTIRE APPROACH each time: direct questions, observations, casual comments, situational remarks
- STAY COMPLETELY GENERAL - only reference the basic setting type, nothing more specific

OPENER VARIETY EXAMPLES (STAY GENERAL):
- Direct: "Mind if I ask you something?"
- Situational: "This place gets busy around this time, doesn't it?"
- Casual: "How's it going?"
- Simple question: "Are you enjoying yourself?"
- General observation: "Nice place, isn't it?"
- Time-based: "Perfect timing to be here"
- With name introduction: "I'm [Name], mind if I join you?"

PURPOSE-SPECIFIC GUIDELINES:

FOR CASUAL CONVERSATION:
- Focus on actual CONVERSATION starters - not requests to join/sit/share space
- AVOID openers that ask for permission to join them physically or share their space
- NEVER ask "Can I sit here?" or "Mind if I share this space?" - these are space requests, not conversation starters
- Examples of what NOT to do: asking permission to join, requesting to share tables/spaces, asking to sit somewhere

FOR PROFESSIONAL NETWORKING:
- ALWAYS start professional openers with a polite greeting (Hi, Hello, Hi there, etc.) - more professional and respectful
- CRITICAL: MUST end with a QUESTION or direct invitation for response - never just statements
- Professional openers MUST follow format: "Greeting + [optional brief context] + QUESTION"
- NEVER end with just a statement - every professional opener needs a conversational hook/question
- Examples of what NOT to do: greetings followed by statements with no questions, being too direct about wanting insights

WRONG EXAMPLES (TOO SPECIFIC/RANDOM/ASSUMPTIVE):
❌ "Perfect spot to catch your breath" (assumes they need a break)
❌ "The corner couches are great" (assumes specific furniture/location)
❌ "Great for people-watching" (assumes specific activity)
❌ "That drink looks good" (assumes what they're drinking)
❌ "You look relaxed" (assumes their mood/state)

❌ "Pardon the interruption - this seems like an ideal moment to introduce myself" (assumes interrupting something, assumes timing is good, assumes they want introduction)
❌ "This looks like the perfect time to..." (assumes timing assessment)
❌ "You seem like you could use..." (assumes their needs/state)
❌ "Hello - I've noticed the great setup they have here for training. Still exploring all the options myself." (greeting + statement with no conversational hook)
❌ "Can I sit here?" (asking permission to join, not conversation starter - CASUAL problem)
❌ "Mind if I share this space?" (space request, not conversation opener - CASUAL problem)
❌ "Pardon me - would you mind if I shared this quiet space for a bit?" (requesting to join/sit, not starting conversation - CASUAL problem)
❌ "Is it okay if I share this table?" (space request, not conversation opener - CASUAL problem)
❌ "Mind if I share this quiet corner of tranquility?" (requesting to share space, not conversation starter - applies to casual/professional purposes)
❌ "Hello - impressed by the energy everyone brings to their training here. I find it really motivating to be around dedicated people." (greeting + statement, no question - PROFESSIONAL problem)
❌ "Hello - great to see so many dedicated people here. I'm just getting familiar with this facility myself." (greeting + statement, no question - PROFESSIONAL problem)
❌ "I'd love to hear your professional insights" (too direct/random for most settings - PROFESSIONAL problem)
❌ "Making connections in an active environment - I'd love to hear your professional insights." (too direct, assumes they want to share insights - PROFESSIONAL problem)

STRICT REQUIREMENTS:
- Each opener must feel completely different from the last
- Use varied sentence structures, different question types
- Sometimes be brief, sometimes more conversational
- Mix direct approaches with indirect observations
- Never repeat the same energy/vibe/atmosphere comments

Generate:
1. Opener: Create a COMPLETELY UNIQUE conversation starter for ${purpose} intentions. Use a different greeting style, sentence structure, and approach than any previous opener. Must feel natural but distinctly different each time. NO repetitive patterns or similar phrasing.
2. Follow-ups: 3 varied questions that flow naturally from the opener and match the purpose/setting
3. ExitStrategy: Natural way to end the conversation gracefully
4. Tip: Practical advice for this scenario that focuses on delivery and mindset
5. Confidence Boost: Encouraging message that builds genuine confidence

Return ONLY valid JSON with fields: opener, followUps (array of 3 strings), exitStrategy, tip, confidenceBoost`;
    }



    const message = await callBedrockAPI(
      [
        {
          role: "user",
          content: prompt
        }
      ],
      600,
"You are a social skills coach creating maximally varied, authentic conversation guidance. CRITICAL: Every opener must be completely different in structure, greeting, and approach. Generate radically different openers each time - vary greetings, sentence structure, question types, and conversational approaches. Make each one feel like a completely different person wrote it. Never invent specific details not mentioned in the context. NEVER invent names - if name introduction is needed, use [Name] as placeholder. You MUST return only valid JSON. For romantic openers, include all 6 fields where responseFramework is a SINGLE STRING (not nested objects or arrays). For other purposes, include only the first 5 fields. No markdown, no extra text, just clean JSON with string values only."
    );

    // Handle AWS Bedrock response format
    let result;
    if (message.content && message.content[0] && message.content[0].text) {
      result = message.content[0].text.trim();
    } else if (message.text) {
      result = message.text.trim();
    } else if (typeof message === 'string') {
      result = message.trim();
    } else {
      console.error('❌ Unexpected Bedrock response format:', message);
      throw new Error('Unexpected response format from Bedrock API');
    }
    console.log('Raw Bedrock Response:', result);
    
    // Clean up the response before parsing
    let cleanResult = result;
    
    // Remove markdown code blocks if present
    cleanResult = cleanResult.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    
    // Find JSON object in the response
    const jsonMatch = cleanResult.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanResult = jsonMatch[0];
    }
    
    console.log('Cleaned Response:', cleanResult);
    
    // Parse the JSON with better error handling
    let openerData;
    try {
      openerData = JSON.parse(cleanResult);
    } catch (parseError) {
      console.error('❌ JSON Parse Error:', parseError.message);
      console.error('❌ Raw response that failed to parse:', result);
      console.error('❌ Cleaned response that failed to parse:', cleanResult);
      throw new Error(`Failed to parse AI response as JSON: ${parseError.message}`);
    }
    
    // Validate the response has required fields
    if (!openerData.opener || !openerData.followUps || !openerData.exitStrategy || !openerData.tip || !openerData.confidenceBoost) {
      throw new Error('Invalid response format from AI - missing required fields');
    }
    
    // For romantic interest openers, validate and fix responseFramework format
    if (purpose.toLowerCase() === 'romantic') {
      console.log('🔍 ROMANTIC VALIDATION: Checking for responseFramework field...');
      console.log('🔍 AI Response fields:', Object.keys(openerData));
      console.log('🔍 responseFramework present:', !!openerData.responseFramework);
      console.log('🔍 responseFramework type:', typeof openerData.responseFramework);
      
      if (!openerData.responseFramework) {
        console.error('❌ CRITICAL: Romantic opener missing responseFramework field!');
        console.error('❌ AI Response:', JSON.stringify(openerData, null, 2));
      } else if (typeof openerData.responseFramework === 'object') {
        // Convert object to string if AI returned nested object
        console.log('🔧 Converting responseFramework object to string');
        const framework = openerData.responseFramework;
        openerData.responseFramework = Object.keys(framework)
          .map(key => `${key}: ${framework[key]}`)
          .join('. ');
        console.log('🔧 Converted responseFramework:', openerData.responseFramework);
      } else {
        console.log('✅ ROMANTIC FRAMEWORK SUCCESS: responseFramework is a string');
        console.log('✅ responseFramework content:', openerData.responseFramework.substring(0, 100) + '...');
      }
    } else {
      console.log('ℹ️  NON-ROMANTIC: Skipping responseFramework validation');
    }
    
    res.json(openerData);
    
  } catch (error) {
    console.error('Error generating opener:', error);
    console.error('Error details:', error.message);
    res.status(500).json({ 
      error: 'Failed to generate opener', 
      details: error.message 
    });
  }
});

app.post('/generate-daily-challenge', requireApiKey, aiRateLimit, async (req, res) => {
  try {
    const { socialZone = "Warming Up", date } = req.body;
    
    // Comprehensive request validation and logging
    console.log('🚀 DAILY CHALLENGE REQUEST RECEIVED:');
    console.log('   📝 Raw socialZone:', typeof socialZone, '|', socialZone, '|');
    console.log('   📅 Raw date:', typeof date, '|', date, '|');
    console.log('   🎯 Request body:', JSON.stringify(req.body, null, 2));
    
    // Validate Social Zone before proceeding
    const validZones = ["Warming Up", "Breaking Through", "Coming Alive", "Charming", "Socialite"];
    const finalSocialZone = validZones.includes(socialZone) ? socialZone : "Warming Up";
    
    if (socialZone !== finalSocialZone) {
      console.log(`⚠️ BACKEND: Invalid Social Zone '${socialZone}' received - using '${finalSocialZone}' instead`);
    }
    
    // Check if AWS Bedrock configuration is available
    if (!process.env.BEDROCK_API_KEY || !process.env.BEDROCK_ENDPOINT || !process.env.MODEL_ID) {
      console.error('❌ Cannot generate challenge: AWS Bedrock not properly configured');
      return res.status(500).json({ 
        error: 'Service configuration error', 
        details: 'AI service not properly configured on server' 
      });
    }
    
    // Use provided date or current date for daily rotation
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    console.log('✅ VALIDATED REQUEST:', { socialZone: finalSocialZone, date: targetDate });
    
    // Get template based on VALIDATED Social Zone level
    const template = getChallengeTemplateForSocialZone(finalSocialZone);
    
    // Comprehensive logging to verify template selection
    console.log(`📋 TEMPLATE VERIFICATION:`);
    console.log(`   Final Social Zone: ${finalSocialZone}`);
    console.log(`   Template Name: ${template.name}`);
    console.log(`   Intent: ${template.intent}`);
    console.log(`   Challenge Type: ${template.challengeType}`);
    console.log(`   Date: ${targetDate}`);
    
    const prompt = `You are a social skills coach who creates progressive social challenges that build confidence gradually. Focus on authentic connection over scripted interactions.

Social Zone Context: ${finalSocialZone}
Zone Intent: ${template.intent}
Challenge Type: ${template.challengeType}

${template.prompt}

Core Rules:
- Never repetitive: Vary structure, wording, and approach style to keep challenges fresh
- Setting-agnostic: Must work in any place where people are present
- Tone: Always friendly, encouraging, and light
- Use neutral-to-positive starting points that feel natural
- No judgmental or pressuring language
- Balance between shorter/light interactions and deeper/multi-step ones
- Create variety through different interaction types and approaches

Generate:
1. Challenge: The main task to complete (keep it concise but clear, 1-2 sentences)
2. Description: More focused explanation of what to do (2-3 sentences, more concise than typical)
3. Tips: Array of 2-3 practical tips for completing this challenge successfully (brief but helpful)
4. WhyThisMatters: Brief explanation of benefits and reasoning (1-2 sentences, keep it focused)

Return ONLY valid JSON with fields: challenge, description, tips, whyThisMatters. 
Format tips as an array of strings: ["tip 1", "tip 2", "tip 3"]
No markdown formatting, no extra text, just the JSON object.`;

    let message;
    try {
      message = await callBedrockAPI(
        [
          {
            role: "user",
            content: prompt
          }
        ],
        500
      );
    } catch (bedrockError) {
      console.error('❌ AWS Bedrock API Error:', bedrockError);
      console.error('❌ Error type:', bedrockError.constructor.name);
      console.error('❌ Error message:', bedrockError.message);
      
      // Provide specific error based on the type
      if (bedrockError.message.includes('401')) {
        throw new Error('Invalid API key configuration');
      } else if (bedrockError.message.includes('404')) {
        throw new Error('AWS Bedrock service not found - check model ID or endpoint');
      } else if (bedrockError.message.includes('429')) {
        throw new Error('API rate limit exceeded - try again later');
      } else {
        throw new Error(`AWS Bedrock API error: ${bedrockError.message}`);
      }
    }

    // Handle AWS Bedrock response format
    let result;
    if (message.content && message.content[0] && message.content[0].text) {
      result = message.content[0].text.trim();
    } else if (message.text) {
      result = message.text.trim();
    } else if (typeof message === 'string') {
      result = message.trim();
    } else {
      console.error('❌ Unexpected Bedrock response format:', message);
      throw new Error('Unexpected response format from Bedrock API');
    }
    console.log('Raw Bedrock Daily Challenge Response:', result);
    
    // Clean up the response before parsing
    let cleanResult = result;
    
    // Remove markdown code blocks if present
    cleanResult = cleanResult.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    
    // Find JSON object in the response
    const jsonMatch = cleanResult.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanResult = jsonMatch[0];
    }
    
    console.log('Cleaned Daily Challenge Response:', cleanResult);
    
    // Parse the JSON
    const challengeData = JSON.parse(cleanResult);
    
    // Validate the response has required fields
    if (!challengeData.challenge || !challengeData.description || !challengeData.tips || !challengeData.whyThisMatters) {
      throw new Error('Invalid response format from AI');
    }
    
    // Add metadata for debugging
    challengeData.templateUsed = template.name;
    challengeData.socialZone = finalSocialZone; // Use validated zone
    challengeData.zoneIntent = template.intent;
    challengeData.dateGenerated = targetDate; // Keep date for daily rotation
    challengeData.generatedAt = new Date().toISOString();
    
    console.log(`✅ CHALLENGE GENERATED SUCCESSFULLY:`);
    console.log(`   📅 Date: ${targetDate}`);
    console.log(`   🎯 Social Zone: "${finalSocialZone}"`);
    console.log(`   📝 Template: ${template.name}`);
    console.log(`   🎪 Challenge: "${challengeData.challenge}"`);
    console.log(`   📊 Response Size: ${JSON.stringify(challengeData).length} bytes`);
    
    res.json(challengeData);
    
  } catch (error) {
    console.error('Error generating daily challenge:', error);
    console.error('Error details:', error.message);
    res.status(500).json({ 
      error: 'Failed to generate daily challenge', 
      details: error.message 
    });
  }
});

app.post('/api/ai-coach/chat', aiRateLimit, async (req, res) => {
  try {
    const { message, context = {} } = req.body;
    console.log('Received AI coach chat request:', { message, context });
    
    if (!message || !message.trim()) {
      return res.status(400).json({ 
        error: 'Message is required', 
        details: 'Please provide a message to chat with the AI coach' 
      });
    }

    const prompt = `You are the Opner Coach, the supportive AI assistant within the "Opner: Social Coach" app. A user says: "${message}"

Provide a supportive coaching response that:
- Is 2-4 sentences maximum for chat-friendly conversation
- Asks a follow-up question to continue the conversation
- Provides actionable next steps for social confidence
- Uses a warm, encouraging but realistic tone
- Sounds like a conversational mentor, not clinical
- When relevant, you can reference being their Opner Coach in the Social Coach app

Return ONLY a plain text response, no JSON formatting.`;

    const aiMessage = await callBedrockAPI(
      [
        {
          role: "user",
          content: prompt
        }
      ],
      150,
      "You are the Opner Coach, the supportive AI assistant in the Social Coach app. Keep responses conversational, brief (2-4 sentences), and always ask a follow-up question."
    );

    // Handle AWS Bedrock response format
    let response;
    if (aiMessage.content && aiMessage.content[0] && aiMessage.content[0].text) {
      response = aiMessage.content[0].text.trim();
    } else if (aiMessage.text) {
      response = aiMessage.text.trim();
    } else if (typeof aiMessage === 'string') {
      response = aiMessage.trim();
    } else {
      console.error('❌ Unexpected Bedrock response format:', aiMessage);
      throw new Error('Unexpected response format from Bedrock API');
    }
    console.log('AI Coach Response:', response);
    
    // Generate messageId and timestamp
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();
    
    res.json({
      response: response,
      messageId: messageId,
      timestamp: timestamp
    });
    
  } catch (error) {
    console.error('Error in AI coach chat:', error);
    console.error('Error details:', error.message);
    res.status(500).json({ 
      error: 'Failed to get AI coach response', 
      details: error.message 
    });
  }
});





// DEBUG ENDPOINT - Reset all user data

// Debug endpoint to see conversation practice data

// AWS Bedrock API health check endpoint
app.get('/api/bedrock/health', aiRateLimit, async (req, res) => {
  try {
    console.log('🔍 Testing AWS Bedrock API connection...');
    
    if (!process.env.BEDROCK_API_KEY || !process.env.BEDROCK_ENDPOINT || !process.env.MODEL_ID) {
      return res.status(500).json({ 
        status: 'error',
        error: 'AWS Bedrock configuration incomplete',
        hasApiKey: !!process.env.BEDROCK_API_KEY,
        hasEndpoint: !!process.env.BEDROCK_ENDPOINT,
        hasModelId: !!process.env.MODEL_ID
      });
    }
    
    // Try a simple API call to test connection
    const testMessage = await callBedrockAPI(
      [{ role: "user", content: "Say hello" }],
      10
    );
    
    res.json({ 
      status: 'healthy',
      hasApiKey: true,
      hasEndpoint: true,
      hasModelId: true,
      modelId: process.env.MODEL_ID,
      testResponse: testMessage.content && testMessage.content[0] ? testMessage.content[0].text : (testMessage.text || 'Unknown format'),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ AWS Bedrock health check failed:', error);
    res.status(500).json({ 
      status: 'error',
      error: error.message,
      errorType: error.constructor.name,
      hasApiKey: !!process.env.BEDROCK_API_KEY,
      hasEndpoint: !!process.env.BEDROCK_ENDPOINT,
      hasModelId: !!process.env.MODEL_ID,
      timestamp: new Date().toISOString()
    });
  }
});

// Opener Library Data API Endpoint - NOW POWERED BY SUPABASE!
app.get('/api/data/opener-library/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { currentDate } = req.query;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    // Use simulated date if provided, otherwise use current date
    const referenceDate = currentDate ? new Date(currentDate + 'T00:00:00.000Z') : new Date();
    
    console.log(`📚 [SUPABASE] OPENER LIBRARY: Device ${deviceId}, Reference Date: ${referenceDate.toISOString()}`);

    // Get all opener statistics from Supabase
    const { data: allOpeners, error: openersError } = await supabase
      .from('openers')
      .select('*')
      .eq('device_id', deviceId);

    if (openersError) {
      console.error('❌ [SUPABASE] Error getting opener data:', openersError);
      return res.status(500).json({ 
        error: 'Database error',
        details: openersError.message 
      });
    }

    // Calculate statistics (same logic as SQLite version)
    const totalOpeners = allOpeners?.length || 0;
    const usedOpeners = allOpeners?.filter(o => o.opener_was_used === true).length || 0;
    const successfulOpeners = allOpeners?.filter(o => o.opener_was_used === true && o.opener_was_successful === true).length || 0;

    // Calculate success rate (successful / used openers) - same logic as SQLite version
    const successRate = usedOpeners > 0 
      ? Math.round((successfulOpeners / usedOpeners) * 100)
      : 0;

    console.log(`📚 [SUPABASE] STATS: Total: ${totalOpeners}, Used: ${usedOpeners}, Successful: ${successfulOpeners}, Rate: ${successRate}%`);

    // Get successful openers list from Supabase (most recent first)
    const successfulOpenersData = (allOpeners || [])
      .filter(o => o.opener_was_used === true && o.opener_was_successful === true)
      .sort((a, b) => new Date(b.created_at || b.opener_date) - new Date(a.created_at || a.opener_date))
      .slice(0, 20)
      .map(opener => ({
        id: opener.id,
        category: opener.opener_purpose,
        setting: opener.opener_setting,
        text: opener.opener_text,
        date: opener.opener_date,
        rating: opener.opener_rating,
        confidence: opener.opener_confidence_level
      }));

    console.log(`📚 [SUPABASE] Found ${successfulOpenersData.length} successful openers`);

    // Get recent history from Supabase (all logged openers, most recent first)
    const recentHistoryData = (allOpeners || [])
      .sort((a, b) => new Date(b.created_at || b.opener_date) - new Date(a.created_at || a.opener_date))
      .slice(0, 50)
      .map(opener => ({
        id: opener.id,
        category: opener.opener_purpose,
        setting: opener.opener_setting,
        text: opener.opener_text,
        date: opener.opener_date,
        rating: opener.opener_rating,
        confidence: opener.opener_confidence_level,
        wasUsed: opener.opener_was_used,
        wasSuccessful: opener.opener_was_successful
      }));

    console.log(`📚 [SUPABASE] Found ${recentHistoryData.length} recent openers in history`);

    // Calculate success by purpose breakdown using Supabase data
            const allPurposes = ['casual', 'romantic', 'professional'];
            
    // Group openers by purpose and calculate stats (same logic as SQLite version)
    const purposeStats = {};
    (allOpeners || []).forEach(opener => {
      const purpose = opener.opener_purpose;
      if (!purposeStats[purpose]) {
        purposeStats[purpose] = { total_count: 0, used_count: 0, successful_count: 0 };
      }
      purposeStats[purpose].total_count++;
      if (opener.opener_was_used === true) {
        purposeStats[purpose].used_count++;
        if (opener.opener_was_successful === true) {
          purposeStats[purpose].successful_count++;
        }
      }
    });
    
    // Calculate success rates by purpose - include all purposes (same format as SQLite version)
            const successByPurpose = allPurposes.map(purpose => {
      const stat = purposeStats[purpose] || { used_count: 0, successful_count: 0 };
              const successRate = stat.used_count > 0 
                ? (stat.successful_count / stat.used_count)
                : 0;
              
              return {
                name: purpose.charAt(0).toUpperCase() + purpose.slice(1),
                setting: getPurposeDescription(purpose),
                successRate: Math.round(successRate * 100),
                totalUsed: stat.used_count,
                totalSuccessful: stat.successful_count
              };
            });

    console.log(`📚 [SUPABASE] Success by purpose calculated for ${allPurposes.length} categories`);

    // Format successful openers for frontend (using Supabase data) - iOS expects integer IDs
    const formattedSuccessfulOpeners = successfulOpenersData.map((opener, index) => ({
      id: index + 1,  // Convert UUID to integer for iOS compatibility
              category: opener.category,
              setting: opener.setting,
              text: opener.text,
              date: formatOpenerDate(opener.date),
              rating: opener.rating || 0,
              confidence: opener.confidence || 0,
              isSuccess: true
            }));

    // Format recent history for frontend (using Supabase data) - iOS expects integer IDs
    const formattedRecentHistory = recentHistoryData.map((opener, index) => ({
      id: index + 1,  // Convert UUID to integer for iOS compatibility
              category: opener.category,
              setting: opener.setting,
              text: opener.text,
              date: formatOpenerDate(opener.date),
              rating: opener.rating || 0,
              confidence: opener.confidence || 0,
              wasUsed: Boolean(opener.wasUsed),
              isSuccess: Boolean(opener.wasSuccessful)
            }));

    // Build final response using Supabase data (same format as SQLite version)
            const response = {
              successRate: successRate,
      totalConversations: usedOpeners,
              successfulOpeners: formattedSuccessfulOpeners,
              recentHistory: formattedRecentHistory,
              successByPurpose: successByPurpose,
      totalOpeners: totalOpeners,
      totalSuccessful: successfulOpeners
            };

    console.log(`📚 [SUPABASE] OPENER LIBRARY: Returning data with ${formattedSuccessfulOpeners.length} successful, ${formattedRecentHistory.length} history, ${successByPurpose.length} purposes`);
    console.log(`📚 [SUPABASE] OPENER LIBRARY: Total conversations: ${usedOpeners}, Success rate: ${successRate}%`);
    
            res.json(response);

  } catch (error) {
    console.error('❌ Error in opener library endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to get purpose descriptions
function getPurposeDescription(purpose) {
  console.log(`🎯 PURPOSE DESCRIPTION: Input "${purpose}", lowercase: "${purpose.toLowerCase()}"`);
  const descriptions = {
    'casual': 'Coffee shops, gyms',
    'romantic': 'Social events, quiet spaces',
    'professional': 'Networking, work events',
    'social': 'Parties, group settings',
    'academic': 'School, study groups'
  };
  const result = descriptions[purpose.toLowerCase()] || 'Various settings';
  console.log(`🎯 PURPOSE DESCRIPTION: Result "${result}"`);
  return result;
}

// Helper function to format opener dates
function formatOpenerDate(dateString) {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'Yesterday';
    if (diffDays === 0) return 'Today';
    if (diffDays <= 7) return `${diffDays} days ago`;
    if (diffDays <= 30) return `${Math.ceil(diffDays / 7)} week${diffDays > 14 ? 's' : ''} ago`;
    return `${Math.ceil(diffDays / 30)} month${diffDays > 60 ? 's' : ''} ago`;
  } catch (error) {
    return 'Unknown date';
  }
}

// CONVERSATION PRACTICE API - NOW POWERED BY SUPABASE!
app.get('/api/conversation-practice/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { currentDate } = req.query;
    
    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }
    
    console.log(`🎭 [SUPABASE] CONVERSATION PRACTICE: Device ${deviceId}, Current Date: ${currentDate}`);
    
    // Use current date or simulated date (SAME LOGIC)
    const today = currentDate ? new Date(currentDate + 'T00:00:00Z') : new Date();
    const dateKey = today.toISOString().split('T')[0];
    
    // Check if we already have scenarios for this date (Supabase version)
    console.log(`🎭 [SUPABASE] CONVERSATION PRACTICE: Querying database for device_id='${deviceId}' AND practice_date='${dateKey}'`);
    
    const { data: existing, error: selectError } = await supabase
      .from('conversation_practice_scenarios')
      .select('*')
      .eq('device_id', deviceId)
      .eq('practice_date', dateKey)
      .single();
    
    // Handle "not found" error as expected case
    if (selectError && selectError.code !== 'PGRST116') {
      console.error('❌ [SUPABASE] Error checking existing scenarios:', selectError);
          return res.status(500).json({ error: 'Database error' });
        }
        
        if (existing) {
      // Return existing scenarios with completion status, score, and user answers (SAME LOGIC)
      console.log(`🎭 [SUPABASE] CONVERSATION PRACTICE: Found existing scenarios for ${dateKey}`);
      console.log(`🎭 [SUPABASE] CONVERSATION PRACTICE: completed=${existing.completed}, score=${existing.score}`);
          const scenariosData = JSON.parse(existing.scenarios_json);
          scenariosData.isCompleted = !!existing.completed;
          scenariosData.score = existing.score || 0;
          
          // Include user answers if they exist (for review mode)
          if (existing.user_answers) {
            scenariosData.userAnswers = JSON.parse(existing.user_answers);
          }
          
      console.log(`🎭 [SUPABASE] CONVERSATION PRACTICE: Returning data with isCompleted=${scenariosData.isCompleted}, score=${scenariosData.score}`);
          return res.json(scenariosData);
        }
        
    console.log(`🎭 [SUPABASE] CONVERSATION PRACTICE: No existing scenarios found for ${dateKey} - will generate new ones`);
        
        // Generate new scenarios using AI
        console.log(`🎭 CONVERSATION PRACTICE: Generating new scenarios for ${dateKey}`);
        try {
          const systemPrompt = `You are a social skills expert creating conversation practice scenarios. Generate exactly 5 diverse conversation practice scenarios for someone to improve their social skills.

Each scenario should include:
- setting: A brief description of the location/environment
- situation: What's happening in that moment that creates a conversation opportunity
- options: Exactly 3 multiple choice responses with:
  - text: The response option
  - rating: "best", "good", or "poor" (use each rating exactly once)
  - feedback: Detailed explanation of why this choice works or doesn't work

CRITICAL: Randomize the position of the "best" answer across all scenarios. Do NOT always put the best answer first. Vary it - sometimes first, sometimes second, sometimes third option. This is essential for realistic practice.

Make scenarios realistic, diverse (different settings like coffee shops, bookstore, gym, dog park, grocery store, etc.), and focus on everyday social interactions. Each scenario should teach something valuable about starting conversations.

Examples of proper randomization:
- Scenario 1: best=option 2, good=option 1, poor=option 3
- Scenario 2: best=option 3, good=option 2, poor=option 1  
- Scenario 3: best=option 1, good=option 3, poor=option 2
- Continue varying positions randomly

Return ONLY valid JSON in this exact format:
{
  "scenarios": [
    {
      "setting": "Bookstore fiction section",
      "situation": "Someone is browsing the same shelf as you and picks up a book you've read",
      "options": [
        {
          "text": "I haven't read that one yet, any good?",
          "rating": "good",
          "feedback": "Shows interest but could be more engaging with specific knowledge."
        },
        {
          "text": "Oh, that's a fantastic book! I loved the plot twist about halfway through - no spoilers though!",
          "rating": "best",
          "feedback": "Perfect! Shows you've read it, creates intrigue, and demonstrates consideration by avoiding spoilers."
        },
        {
          "text": "That book is terrible, don't waste your time",
          "rating": "poor",
          "feedback": "Negative and dismissive. Shuts down conversation and shows poor social judgment."
        }
      ]
    }
  ]
}`;

          const messages = [
            {
              role: "user", 
              content: "Generate 5 diverse conversation practice scenarios with realistic settings and helpful feedback for each response option."
            }
          ];

          const aiResponse = await callBedrockAPI(messages, 2000, systemPrompt);
          
          console.log('🎭 AI Response received:', JSON.stringify(aiResponse, null, 2));
          
          let scenariosData;
          if (aiResponse.content && aiResponse.content[0] && aiResponse.content[0].text) {
            const responseText = aiResponse.content[0].text.trim();
            console.log('🎭 Raw AI response text:', responseText);
            
            try {
              scenariosData = JSON.parse(responseText);
            } catch (parseError) {
              console.error('🎭 JSON parse error:', parseError);
              console.error('🎭 Response text that failed to parse:', responseText);
              throw new Error('Invalid JSON response from AI');
            }
          } else {
            console.error('🎭 Unexpected AI response format:', aiResponse);
            throw new Error('Unexpected response format from AI');
          }

          if (!scenariosData.scenarios || scenariosData.scenarios.length !== 5) {
            throw new Error('AI did not return exactly 5 scenarios');
          }

          // Store scenarios in Supabase for this date
          try {
            const { data: storedScenarios, error: storageError } = await supabase
              .from('conversation_practice_scenarios')
              .insert({
                device_id: deviceId,
                practice_date: dateKey,
                scenarios_json: JSON.stringify(scenariosData),
                created_at: new Date().toISOString()
              })
              .select()
              .single();
            
            if (storageError) {
              console.error('❌ [SUPABASE] Error storing scenarios:', storageError);
                // Still return the scenarios even if storage fails
              } else {
              console.log(`✅ [SUPABASE] CONVERSATION PRACTICE: Stored scenarios for ${dateKey}`);
              }
          } catch (storageErr) {
            console.error('❌ [SUPABASE] Storage error:', storageErr);
            // Continue anyway - return generated scenarios
            }

          // Add completion status and return the generated scenarios
          scenariosData.isCompleted = false;
          res.json(scenariosData);
          
        } catch (error) {
          console.error('🎭 [SUPABASE] Error generating conversation scenarios:', error);
          
          // Fallback to sample scenarios if AI fails
          const fallbackScenarios = {
            scenarios: [
              {
                setting: "Coffee shop during afternoon break",
                situation: "You're in line and the person ahead of you is looking at the menu board, seeming undecided",
                options: [
                  {
                    text: "The iced caramel macchiato is really good if you're looking for something sweet",
                    rating: "best",
                    feedback: "Perfect! You're being helpful by offering a specific recommendation, which opens the door for them to ask follow-up questions or share their preferences."
                  },
                  {
                    text: "First time here?",
                    rating: "good",
                    feedback: "A solid conversation starter that shows interest, though it could be more specific to what you observed."
                  },
                  {
                    text: "You should hurry up, there's a line behind you",
                    rating: "poor",
                    feedback: "This is impatient and rude. It will make them feel pressured and embarrassed, definitely not a good conversation starter."
                  }
                ]
              },
              {
                setting: "Bookstore browsing section",
                situation: "Someone near you picks up a book, reads the back cover, then puts it back with interest",
                options: [
                  {
                    text: "You have good taste in books",
                    rating: "poor",
                    feedback: "While meant as a compliment, this can come across as presumptuous since you don't know their actual taste or reading habits."
                  },
                  {
                    text: "I was looking at that one too - what did you think of the description?",
                    rating: "best",
                    feedback: "Excellent approach! You're acknowledging shared interest and asking for their opinion, which people love to give."
                  },
                  {
                    text: "Is it any good?",
                    rating: "good", 
                    feedback: "Direct and to the point, but they haven't read it yet. Shows you weren't really observing the situation."
                  }
                ]
              },
              {
                setting: "Fitness center during evening workout",
                situation: "You finish using a machine at the same time someone nearby finishes theirs, and you both reach for your water bottles",
                options: [
                  {
                    text: "You're really going hard on those weights",
                    rating: "poor",
                    feedback: "Comments about someone's workout intensity can make them self-conscious. Focus on shared experiences rather than observations about their performance."
                  },
                  {
                    text: "Do you come here often?",
                    rating: "good",
                    feedback: "A classic conversation starter that works in this context, though it's somewhat predictable."
                  },
                  {
                    text: "Good workout! This evening crowd is usually pretty motivated",
                    rating: "best",
                    feedback: "Perfect timing and context! You're acknowledging the shared experience and making a positive observation about the environment you both share."
                  }
                ]
              },
              {
                setting: "Dog park on a sunny weekend morning",
                situation: "Your dog and another person's dog start playing together while you both watch",
                options: [
                  {
                    text: "I hope your dog doesn't have any behavioral issues",
                    rating: "poor",
                    feedback: "This implies concern about their dog's behavior right from the start, which will make them defensive rather than friendly."
                  },
                  {
                    text: "They seem to be having a great time together! How old is yours?",
                    rating: "best",
                    feedback: "Perfect! You're commenting on the obvious connection between your dogs and asking a natural follow-up question that dog owners love to answer."
                  },
                  {
                    text: "Your dog is so friendly!",
                    rating: "good",
                    feedback: "A nice compliment that most dog owners appreciate, though it could be more interactive."
                  }
                ]
              },
              {
                setting: "Grocery store checkout line during weekend shopping",
                situation: "You notice the person ahead of you has ingredients that look like they're making the same dish you're planning",
                options: [
                  {
                    text: "You must be really into healthy eating",
                    rating: "poor",
                    feedback: "Makes assumptions about their lifestyle choices, which can feel judgmental even when meant positively."
                  },
                  {
                    text: "Those vegetables look fresh",
                    rating: "good",
                    feedback: "A safe, positive comment but doesn't create much conversation momentum."
                  },
                  {
                    text: "Are you making stir-fry too? I'm attempting the same thing tonight",
                    rating: "best",
                    feedback: "Excellent! You're making a specific observation that creates instant common ground and sharing something about yourself to balance the conversation."
                  }
                ]
              }
            ]
          };
          
          // Add completion status to fallback scenarios
          fallbackScenarios.isCompleted = false;
          res.json(fallbackScenarios);
        }

  } catch (error) {
    console.error('❌ [SUPABASE] Error in conversation practice endpoint:', error);
    res.status(500).json({ 
      error: 'Server error',
      details: error.message 
    });
  }
});

// Mark conversation practice as completed - NOW POWERED BY SUPABASE!
app.post('/api/conversation-practice/:deviceId/complete', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { currentDate, score, userAnswers } = req.body;
    
    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }
    
    console.log(`🎭 [SUPABASE] CONVERSATION PRACTICE COMPLETE: Device ${deviceId}, Date: ${currentDate}, Score: ${score}%`);
    
    // Use current date or simulated date (SAME LOGIC)
    const today = currentDate ? new Date(currentDate + 'T00:00:00Z') : new Date();
    const dateKey = today.toISOString().split('T')[0];
    
    // Mark as completed in Supabase and store score and user answers
    const userAnswersJson = userAnswers ? JSON.stringify(userAnswers) : null;
    
    const { data: updatedRecord, error: updateError } = await supabase
      .from('conversation_practice_scenarios')
      .update({
        completed: true,
        completed_at: new Date().toISOString(),
        score: score,
        user_answers: userAnswersJson
      })
      .eq('device_id', deviceId)
      .eq('practice_date', dateKey)
      .select()
      .single();
    
    if (updateError) {
      console.error('❌ [SUPABASE] Error marking conversation practice complete:', updateError);
      return res.status(500).json({ 
        error: 'Database error',
        details: updateError.message 
      });
    }
    console.log(`✅ [SUPABASE] CONVERSATION PRACTICE: Marked complete for ${dateKey} with score ${score}%`);
    res.json({ 
      success: true, 
      message: 'Conversation practice completed!', 
      score: score,
      practiceId: updatedRecord.id
    });

  } catch (error) {
    console.error('❌ [SUPABASE] Error in conversation practice completion endpoint:', error);
    res.status(500).json({ 
      error: 'Server error',
      details: error.message 
    });
  }
});

// Configure server for better connection handling
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Improve server connection handling
server.keepAliveTimeout = 65000; // 65 seconds
server.headersTimeout = 66000; // 66 seconds (slightly more than keepAlive)

// Handle server errors gracefully
server.on('error', (err) => {
  console.error('Server error:', err);
});

// Handle connection drops gracefully
server.on('connection', (socket) => {
  socket.setTimeout(30000); // 30 second timeout
  socket.on('error', (err) => {
    console.warn('Socket error (handled gracefully):', err.message);
  });
});

// === ANALYTICS CALCULATION FUNCTIONS ===


// SQLite helper function removed - analytics calculations now done directly in Supabase endpoints

// === END ANALYTICS FUNCTIONS ===

// Get development module progress for a device
app.get('/api/data/development-progress/:deviceId', async (req, res) => {
  try {
  const { deviceId } = req.params;
  
    console.log(`📊 [SUPABASE] Fetching development progress for device: ${deviceId}`);
    
    // Get all development modules from Supabase with proper field mapping
    const { data: modules, error: modulesError } = await supabase
      .from('development_modules')
      .select('development_module_id, development_screen_reached, development_is_completed, development_progress_percentage, development_date')
      .eq('device_id', deviceId);

    if (modulesError) {
      console.error('❌ [SUPABASE] Error fetching development progress:', modulesError);
      return res.status(500).json({ 
        error: 'Database error',
        details: modulesError.message 
      });
    }
    
    console.log(`✅ [SUPABASE] Found ${modules ? modules.length : 0} module records`);
    
    // Format for iOS app with exact same field names as SQLite version
      const formattedModules = (modules || []).map(module => ({
      moduleId: module.development_module_id,
      screenReached: module.development_screen_reached,
      isCompleted: module.development_is_completed === true,  // Convert boolean properly
      progressPercentage: module.development_progress_percentage,
      lastUpdated: module.development_date
      }));
      
      res.json({
        modules: formattedModules,
        totalModules: formattedModules.length
      });

  } catch (error) {
    console.error('❌ [SUPABASE] Error in development progress endpoint:', error);
    res.status(500).json({ 
      error: 'Server error',
      details: error.message 
    });
  }
});

// Debug endpoint to check user data

// Force fix user creation date
// Force rebuild Thu Aug 14 16:21:28 PDT 2025
// Force rebuild Thu Aug 14 18:08:08 PDT 2025
// Force rebuild Thu Aug 14 19:18:46 PDT 2025 - Grace period critical fix
