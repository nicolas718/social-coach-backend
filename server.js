const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Check if Anthropic API key is configured
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY environment variable is not set');
  console.log('🔧 Anthropic-dependent endpoints will fail');
} else {
  console.log('✅ Anthropic API key is configured');
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

app.use(cors());
app.use(express.json());

// Initialize SQLite Database
const dbPath = path.join(__dirname, 'social_coach_data.sqlite');
const db = new sqlite3.Database(dbPath);

// Create tables if they don't exist
db.serialize(() => {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      device_id TEXT PRIMARY KEY,
      current_streak INTEGER DEFAULT 0,
      all_time_best_streak INTEGER DEFAULT 0,
      last_completion_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Daily challenges table - UPDATED WITH SUCCESS FIELD AND INTEGER CONFIDENCE
  db.run(`
    CREATE TABLE IF NOT EXISTS daily_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      challenge_completed BOOLEAN DEFAULT TRUE,
      challenge_was_successful BOOLEAN,
      challenge_rating INTEGER,
      challenge_confidence_level INTEGER,
      challenge_notes TEXT,
      challenge_date TEXT,
      challenge_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES users (device_id)
    )
  `);

  // Add the missing column to existing tables
  db.run(`
    ALTER TABLE daily_challenges ADD COLUMN challenge_was_successful BOOLEAN;
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding challenge_was_successful column:', err);
    }
  });

  // Migrate existing confidence level data from TEXT to INTEGER (4-level system)
  db.run(`
    UPDATE daily_challenges 
    SET challenge_confidence_level = 
      CASE 
        WHEN challenge_confidence_level = 'Nervous' THEN 2
        WHEN challenge_confidence_level = 'Okay' THEN 3
        WHEN challenge_confidence_level = 'Confident' THEN 4
        ELSE challenge_confidence_level
      END
    WHERE typeof(challenge_confidence_level) = 'text';
  `, (err) => {
    if (err) {
      console.error('Error migrating challenge confidence levels:', err);
    }
  });

  db.run(`
    UPDATE openers 
    SET opener_confidence_level = 
      CASE 
        WHEN opener_confidence_level = 'Nervous' THEN 2
        WHEN opener_confidence_level = 'Okay' THEN 3  
        WHEN opener_confidence_level = 'Confident' THEN 4
        ELSE opener_confidence_level
      END
    WHERE typeof(opener_confidence_level) = 'text';
  `, (err) => {
    if (err) {
      console.error('Error migrating opener confidence levels:', err);
    }
  });

  // Openers table - UPDATED WITH INTEGER CONFIDENCE
  db.run(`
    CREATE TABLE IF NOT EXISTS openers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      opener_text TEXT,
      opener_setting TEXT,
      opener_purpose TEXT,
      opener_was_used BOOLEAN,
      opener_was_successful BOOLEAN,
      opener_rating INTEGER,
      opener_confidence_level INTEGER,
      opener_notes TEXT,
      opener_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES users (device_id)
    )
  `);

  // Development modules table
  db.run(`
    CREATE TABLE IF NOT EXISTS development_modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      development_module_id TEXT,
      development_screen_reached INTEGER,
      development_is_completed BOOLEAN DEFAULT FALSE,
      development_progress_percentage INTEGER,
      development_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES users (device_id)
    )
  `);
});

// Hardcoded suggestion rotations for each purpose + setting combination
const suggestionRotations = {
  "romantic-active": ["At squat rack", "During yoga class", "Rock climbing wall", "Morning run route"],
  "romantic-quiet": ["Coffee shop corner", "Library study area", "Bookstore aisle", "Museum gallery"],
  "romantic-social": ["House party", "Bar counter", "Concert venue", "Dancing floor"],
  "romantic-everyday": ["Grocery checkout", "Waiting in line", "Dog park", "Farmers market"],
  "professional-active": ["Gym networking", "Running group", "Fitness class", "Sports club"],
  "professional-quiet": ["Co-working space", "Hotel lobby", "Conference area", "Study lounge"],
  "professional-social": ["Networking event", "Happy hour", "Industry meetup", "Work party"],
  "professional-everyday": ["Coffee meeting", "Lunch spot", "Transit hub", "Business district"],
  "casual-active": ["Pickup basketball", "Hiking group", "Beach volleyball", "Park workout"],
  "casual-quiet": ["Local cafe", "Reading corner", "Study group", "Quiet workspace"],
  "casual-social": ["Trivia night", "Game night", "Community event", "Social gathering"],
  "casual-everyday": ["Neighborhood walk", "Local market", "Bus stop", "Shopping center"]
};

// Breathwork affirmations pool
const breathworkAffirmations = [
  "You are worthy of love and respect—including from yourself",
  "Your authentic self is enough for any interaction",
  "Social situations are opportunities, not tests", 
  "You belong in every room you enter",
  "Your nervous energy is just excitement in disguise",
  "People are drawn to genuine confidence",
  "You have something valuable to offer every conversation",
  "Your presence matters and makes a difference",
  "Authentic connections come naturally to you",
  "You are calm, confident, and completely yourself",
  "Every interaction is a chance to practice being real",
  "Your vulnerability is your greatest strength",
  "You create safe spaces wherever you go",
  "Other people want to connect with you too",
  "Your uniqueness is exactly what the world needs",
  "Social confidence grows with every genuine moment",
  "You are exactly where you need to be right now",
  "Your story matters and deserves to be heard",
  "Authentic conversations flow naturally through you",
  "You radiate calm confidence and genuine warmth"
];

// Challenge templates for date-based generation
const challengeTemplates = [
  {
    name: "eye_contact",
    level: "beginner",
    prompt: "Create a challenge about making eye contact and smiling at 3 different people today. Focus on noticing how they respond back and building confidence gradually."
  },
  {
    name: "small_talk",
    level: "beginner", 
    prompt: "Create a challenge about starting one genuine conversation with a stranger today, like a cashier or someone waiting in line."
  },
  {
    name: "compliment",
    level: "beginner",
    prompt: "Create a challenge about giving two genuine compliments to different people today, focusing on choices they made rather than appearance."
  },
  {
    name: "question_asking",
    level: "intermediate",
    prompt: "Create a challenge about asking one thoughtful, curious question to someone new today and really listening to their answer."
  },
  {
    name: "active_listening",
    level: "intermediate",
    prompt: "Create a challenge about practicing active listening in conversations today - asking follow-up questions and showing genuine interest."
  },
  {
    name: "share_opinion",
    level: "intermediate",
    prompt: "Create a challenge about sharing one authentic opinion or perspective in a conversation today, even if it's different from others."
  },
  {
    name: "group_interaction",
    level: "advanced",
    prompt: "Create a challenge about contributing meaningfully to a group conversation or joining a new group discussion today."
  },
  {
    name: "vulnerability",
    level: "advanced",
    prompt: "Create a challenge about sharing something slightly personal or vulnerable with someone today to build deeper connection."
  },
  {
    name: "leadership",
    level: "advanced", 
    prompt: "Create a challenge about taking initiative in a social situation today - suggesting plans, leading a conversation, or helping organize something."
  },
  {
    name: "conflict_resolution",
    level: "advanced",
    prompt: "Create a challenge about addressing a minor disagreement or misunderstanding with someone constructively today."
  }
];

// Simple hash function to convert date string to consistent number
function hashDate(dateString) {
  let hash = 0;
  for (let i = 0; i < dateString.length; i++) {
    const char = dateString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// Get challenge template based on date
function getChallengeTemplateForDate(dateString, level = "beginner") {
  const hash = hashDate(dateString);
  
  // Filter templates by level
  const levelTemplates = challengeTemplates.filter(template => template.level === level);
  
  // If no templates for level, use beginner as fallback
  const availableTemplates = levelTemplates.length > 0 ? levelTemplates : 
    challengeTemplates.filter(template => template.level === "beginner");
  
  // Use hash to select consistent template for this date
  const templateIndex = hash % availableTemplates.length;
  return availableTemplates[templateIndex];
}

// Helper function to ensure user exists
const ensureUserExists = (deviceId, callback) => {
  console.log(`🔍 Checking if user exists: ${deviceId}`);
  
  db.get("SELECT device_id FROM users WHERE device_id = ?", [deviceId], (err, row) => {
    if (err) {
      console.error('❌ Error checking user existence:', err);
      callback(err);
      return;
    }
    
    if (!row) {
      console.log(`👤 User not found, creating new user: ${deviceId}`);
      // Create new user
      db.run("INSERT INTO users (device_id) VALUES (?)", [deviceId], (err) => {
        if (err) {
          console.error('❌ Error creating user:', err);
        } else {
          console.log(`✅ User created successfully: ${deviceId}`);
        }
        callback(err);
      });
    } else {
      console.log(`✅ User already exists: ${deviceId}`);
      callback(null);
    }
  });
};

// Helper function to calculate and update streak - UPDATED TO HANDLE BOTH CHALLENGES AND OPENERS
const updateUserStreak = (deviceId, actionDate) => {
  db.get("SELECT current_streak, all_time_best_streak, last_completion_date FROM users WHERE device_id = ?", 
    [deviceId], (err, user) => {
    if (err) {
      console.error('Error getting user for streak update:', err);
      return;
    }

    console.log(`=== STREAK DEBUG for ${deviceId} ===`);
    console.log('Current user data:', {
      current_streak: user.current_streak,
      all_time_best_streak: user.all_time_best_streak,
      last_completion_date: user.last_completion_date
    });
    console.log('New action date:', actionDate);

    let newStreak = 1;
    let newBestStreak = user.all_time_best_streak || 0;
    
    if (user.last_completion_date) {
      // Parse dates more carefully - extract just the date part (YYYY-MM-DD)
      const lastDateStr = user.last_completion_date.split('T')[0]; // Get YYYY-MM-DD part
      const currentDateStr = actionDate.split('T')[0]; // Get YYYY-MM-DD part
      
      const lastDate = new Date(lastDateStr + 'T00:00:00Z'); // Normalize to UTC midnight
      const currentDate = new Date(currentDateStr + 'T00:00:00Z'); // Normalize to UTC midnight
      
      // Calculate difference in days (more reliable calculation)
      const timeDiff = currentDate.getTime() - lastDate.getTime();
      const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      
      console.log('Date comparison:', {
        lastDateStr,
        currentDateStr,
        lastDate: lastDate.toISOString(),
        currentDate: currentDate.toISOString(),
        timeDiff,
        daysDiff
      });
      
      if (daysDiff === 1) {
        // Consecutive day - streak continues
        newStreak = (user.current_streak || 0) + 1;
        console.log(`Consecutive day detected! Incrementing streak: ${user.current_streak} → ${newStreak}`);
      } else if (daysDiff === 0) {
        // Same day - keep current streak, don't increment for same-day actions
        newStreak = user.current_streak || 1;
        console.log(`Same day detected. Keeping streak at: ${newStreak}`);
      } else {
        // Gap > 1 day - streak resets to 1
        console.log(`Gap detected (${daysDiff} days). Resetting streak to 1`);
        newStreak = 1;
      }
    } else {
      console.log('No previous completion date. Starting new streak at 1');
    }
    
    // Update best streak if current is higher
    if (newStreak > newBestStreak) {
      newBestStreak = newStreak;
      console.log(`New best streak! ${newBestStreak}`);
    }
    
    console.log(`Final streak values: current=${newStreak}, best=${newBestStreak}`);
    
    db.run(
      "UPDATE users SET current_streak = ?, all_time_best_streak = ?, last_completion_date = ? WHERE device_id = ?",
      [newStreak, newBestStreak, actionDate, deviceId],
      (err) => {
        if (err) {
          console.error('Error updating streak:', err);
        } else {
          console.log(`✅ Successfully updated streak for ${deviceId}: ${newStreak} (best: ${newBestStreak})`);
          console.log('=== END STREAK DEBUG ===\n');
        }
      }
    );
  });
};

// Callback version of updateUserStreak for endpoints that need to wait for completion
const updateUserStreakWithCallback = (deviceId, actionDate, callback) => {
  db.get("SELECT current_streak, all_time_best_streak, last_completion_date FROM users WHERE device_id = ?", 
    [deviceId], (err, user) => {
    if (err) {
      console.error('Error getting user for streak update:', err);
      return callback(err);
    }

    console.log(`=== STREAK DEBUG (WITH CALLBACK) for ${deviceId} ===`);
    console.log('Current user data:', {
      current_streak: user.current_streak,
      all_time_best_streak: user.all_time_best_streak,
      last_completion_date: user.last_completion_date
    });
    console.log('New action date:', actionDate);

    let newStreak = 1;
    let newBestStreak = user.all_time_best_streak || 0;
    
    if (user.last_completion_date) {
      // Parse dates more carefully - extract just the date part (YYYY-MM-DD)
      const lastDateStr = user.last_completion_date.split('T')[0]; // Get YYYY-MM-DD part
      const currentDateStr = actionDate.split('T')[0]; // Get YYYY-MM-DD part
      
      const lastDate = new Date(lastDateStr + 'T00:00:00Z'); // Normalize to UTC midnight
      const currentDate = new Date(currentDateStr + 'T00:00:00Z'); // Normalize to UTC midnight
      
      // Calculate difference in days (more reliable calculation)
      const timeDiff = currentDate.getTime() - lastDate.getTime();
      const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      
      console.log('Date comparison:', {
        lastDateStr,
        currentDateStr,
        lastDate: lastDate.toISOString(),
        currentDate: currentDate.toISOString(),
        timeDiff,
        daysDiff
      });
      
      if (daysDiff === 1) {
        // Consecutive day - increment streak
        newStreak = (user.current_streak || 0) + 1;
        console.log(`Consecutive day detected! Incrementing streak: ${user.current_streak} → ${newStreak}`);
      } else if (daysDiff === 0) {
        // Same day - keep current streak, don't increment for same-day actions
        newStreak = user.current_streak || 1;
        console.log(`Same day detected. Keeping streak at: ${newStreak}`);
      } else {
        // Gap > 1 day - streak resets to 1
        console.log(`Gap detected (${daysDiff} days). Resetting streak to 1`);
        newStreak = 1;
      }
    } else {
      console.log('No previous completion date. Starting new streak at 1');
    }
    
    // Update best streak if current is higher
    if (newStreak > newBestStreak) {
      newBestStreak = newStreak;
      console.log(`New best streak! ${newBestStreak}`);
    }
    
    console.log(`Final streak values: current=${newStreak}, best=${newBestStreak}`);
    
    // Update the database
    db.run(
      "UPDATE users SET current_streak = ?, all_time_best_streak = ?, last_completion_date = ? WHERE device_id = ?",
      [newStreak, newBestStreak, actionDate, deviceId],
      function(err) {
        if (err) {
          console.error(`❌ Failed to update streak for ${deviceId}:`, err);
          return callback(err);
        } else {
          console.log(`✅ Successfully updated streak for ${deviceId}: ${newStreak} (best: ${newBestStreak})`);
          console.log('=== END STREAK DEBUG (WITH CALLBACK) ===\n');
          callback(null); // Success - no error
        }
      }
    );
  });
};

// Helper function to calculate Social Zone level with grace period logic
const calculateSocialZoneLevel = (currentStreak, daysWithoutActivity, highestLevelAchieved, allTimeMaxStreak) => {
  // Base level requirements (days needed to reach each level)
  const baseLevelRequirements = {
    'Warming Up': 0,
    'Breaking Through': 7,
    'Coming Alive': 21,
    'Charming': 46,
    'Socialite': 90
  };

  // Grace periods for each level
  const gracePeriods = {
    'Warming Up': 0,
    'Breaking Through': 2,
    'Coming Alive': 3,
    'Charming': 5,
    'Socialite': 7
  };

  // Calculate level based on current streak
  let currentLevel = 'Warming Up';
  if (currentStreak >= 90) currentLevel = 'Socialite';
  else if (currentStreak >= 46) currentLevel = 'Charming';
  else if (currentStreak >= 21) currentLevel = 'Coming Alive';
  else if (currentStreak >= 7) currentLevel = 'Breaking Through';

  // If streak is broken (currentStreak = 0), check grace period logic
  if (currentStreak === 0 && daysWithoutActivity > 0) {
    // Determine what level they had before the break
    let previousLevel = 'Warming Up';
    if (allTimeMaxStreak >= 90) previousLevel = 'Socialite';
    else if (allTimeMaxStreak >= 46) previousLevel = 'Charming';
    else if (allTimeMaxStreak >= 21) previousLevel = 'Coming Alive';
    else if (allTimeMaxStreak >= 7) previousLevel = 'Breaking Through';

    // Check if still within grace period
    const gracePeriod = gracePeriods[previousLevel];
    if (daysWithoutActivity <= gracePeriod && gracePeriod > 0) {
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
      return {
        level: droppedLevel,
        isInGracePeriod: false,
        droppedFrom: previousLevel
      };
    }
  }

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

// Helper function to calculate days without activity
const calculateDaysWithoutActivity = (lastActivityDate) => {
  if (!lastActivityDate) return 999; // No activity recorded
  
  const lastDate = new Date(lastActivityDate);
  const today = new Date();
  const daysDiff = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
  
  return daysDiff;
};

// NEW: Calculate current streak based on both challenges and openers
const calculateCurrentStreak = (deviceId, callback) => {
  // Get all activity dates (both challenges and used openers)
  db.all(`
    SELECT DISTINCT date(activity_date) as activity_date
    FROM (
      SELECT challenge_date as activity_date
      FROM daily_challenges 
      WHERE device_id = ? AND challenge_completed = 1
      
      UNION
      
      SELECT opener_date as activity_date
      FROM openers 
      WHERE device_id = ? AND opener_was_used = 1
    ) activities
    ORDER BY activity_date DESC
  `, [deviceId, deviceId], (err, activityDates) => {
    if (err) {
      console.error('Error getting activity dates for streak calculation:', err);
      return callback(err);
    }

    console.log(`=== STREAK CALCULATION for ${deviceId} ===`);
    console.log('Activity dates found:', activityDates.map(d => d.activity_date));

    if (activityDates.length === 0) {
      console.log('No activity found - streak is 0');
      return callback(null, 0);
    }

    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    console.log('Today:', todayStr);

    let currentStreak = 0;
    let checkDate = new Date(today);
    
    // Count consecutive days backwards from today
    while (true) {
      const checkDateStr = checkDate.toISOString().split('T')[0];
      console.log(`Checking date: ${checkDateStr}`);
      
      // Check if this date has activity
      const hasActivity = activityDates.some(activity => activity.activity_date === checkDateStr);
      
      if (hasActivity) {
        currentStreak++;
        console.log(`✅ Activity found on ${checkDateStr}, streak: ${currentStreak}`);
      } else {
        console.log(`❌ No activity on ${checkDateStr}, streak ends at ${currentStreak}`);
        break; // Streak broken
      }
      
      // Move to previous day
      checkDate.setDate(checkDate.getDate() - 1);
    }

    console.log(`Final streak calculation: ${currentStreak}`);
    console.log('=== END STREAK CALCULATION ===');
    
    callback(null, currentStreak);
  });
};

app.get('/', (req, res) => {
  res.json({ message: 'Social Coach Backend API is running!' });
});

// Save Daily Challenge Data - CHALLENGES ALWAYS UPDATE STREAK
app.post('/api/data/challenge', (req, res) => {
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

    console.log('Challenge data received:', { 
      deviceId, challengeCompleted, challengeWasSuccessful, 
      challengeRating, challengeConfidenceLevel, challengeType 
    });

    // Validate confidence level is within 4-level range (1-4)
    if (challengeConfidenceLevel !== null && challengeConfidenceLevel !== undefined) {
      if (challengeConfidenceLevel < 1 || challengeConfidenceLevel > 4) {
        return res.status(400).json({ error: 'Invalid confidence level. Must be 1-4 (1=Anxious, 2=Nervous, 3=Comfortable, 4=Confident)' });
      }
    }

    ensureUserExists(deviceId, (err) => {
      if (err) {
        console.error('❌ Error ensuring user exists:', err);
        return res.status(500).json({ error: 'Database error creating user' });
      }
      
      console.log(`✅ User exists/created, proceeding with challenge for: ${deviceId}`);

      // Insert challenge data with success field
      db.run(
        `INSERT INTO daily_challenges 
         (device_id, challenge_completed, challenge_was_successful, challenge_rating, 
          challenge_confidence_level, challenge_notes, challenge_date, challenge_type) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [deviceId, challengeCompleted, challengeWasSuccessful, challengeRating, 
         challengeConfidenceLevel, challengeNotes, challengeDate, challengeType],
        function(err) {
          if (err) {
            console.error('Error saving challenge:', err);
            return res.status(500).json({ error: 'Failed to save challenge data' });
          }

          console.log(`📝 Challenge saved successfully for ${deviceId}, now updating streak...`);

          // Capture the challenge ID before the callback to preserve context
          const challengeId = this.lastID;

          // Update streak and wait for completion before responding
          updateUserStreakWithCallback(deviceId, challengeDate, (streakErr) => {
            if (streakErr) {
              console.error('Error updating streak:', streakErr);
              return res.status(500).json({ error: 'Failed to update streak' });
            }

            console.log(`✅ Challenge and streak update completed for ${deviceId}: Success=${challengeWasSuccessful}`);

            res.json({ 
              success: true, 
              challengeId: challengeId,
              message: 'Challenge data saved and streak updated successfully' 
            });
          });
        }
      );
    });
  } catch (error) {
    console.error('Error in challenge endpoint:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save Opener Data - UPDATED WITH CONDITIONAL STREAK LOGIC
app.post('/api/data/opener', (req, res) => {
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

    console.log('Opener data received:', { 
      deviceId, openerWasUsed, openerWasSuccessful, 
      openerSetting, openerPurpose, openerConfidenceLevel 
    });

    // Validate confidence level is within 4-level range (1-4)
    if (openerConfidenceLevel !== null && openerConfidenceLevel !== undefined) {
      if (openerConfidenceLevel < 1 || openerConfidenceLevel > 4) {
        return res.status(400).json({ error: 'Invalid confidence level. Must be 1-4 (1=Anxious, 2=Nervous, 3=Comfortable, 4=Confident)' });
      }
    }

    ensureUserExists(deviceId, (err) => {
      if (err) {
        console.error('Error ensuring user exists:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      // ALWAYS insert opener data (save everything regardless of usage)
      db.run(
        `INSERT INTO openers 
         (device_id, opener_text, opener_setting, opener_purpose, opener_was_used, 
          opener_was_successful, opener_rating, opener_confidence_level, opener_notes, opener_date) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [deviceId, openerText, openerSetting, openerPurpose, openerWasUsed, 
         openerWasSuccessful, openerRating, openerConfidenceLevel, openerNotes, openerDate],
        function(err) {
          if (err) {
            console.error('Error saving opener:', err);
            return res.status(500).json({ error: 'Failed to save opener data' });
          }

          // CONDITIONAL STREAK UPDATE: Only if opener was actually used
          if (openerWasUsed === true) {
            updateUserStreak(deviceId, openerDate);
            console.log(`Opener was USED - streak updated for ${deviceId}: Success=${openerWasSuccessful}`);
          } else {
            console.log(`Opener was NOT USED - no streak update for ${deviceId}: Data saved but no streak credit`);
          }

          res.json({ 
            success: true, 
            openerId: this.lastID,
            message: 'Opener data saved successfully' 
          });
        }
      );
    });
  } catch (error) {
    console.error('Error in opener endpoint:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save Development Module Data
app.post('/api/data/development', (req, res) => {
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

    ensureUserExists(deviceId, (err) => {
      if (err) {
        console.error('Error ensuring user exists:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      // Check if module progress already exists for this user and module
      db.get(
        "SELECT * FROM development_modules WHERE device_id = ? AND development_module_id = ?",
        [deviceId, developmentModuleId],
        (err, existingRecord) => {
          if (err) {
            console.error('Error checking existing module progress:', err);
            return res.status(500).json({ error: 'Database error' });
          }

          if (existingRecord) {
            // Update existing record if new progress is higher or module is completed
            const shouldUpdate = 
              developmentScreenReached > existingRecord.development_screen_reached ||
              (developmentIsCompleted && !existingRecord.development_is_completed);

            if (shouldUpdate) {
              db.run(
                `UPDATE development_modules 
                 SET development_screen_reached = ?, development_is_completed = ?, 
                     development_progress_percentage = ?, development_date = ?
                 WHERE device_id = ? AND development_module_id = ?`,
                [developmentScreenReached, developmentIsCompleted, 
                 developmentProgressPercentage, developmentDate, deviceId, developmentModuleId],
                function(err) {
                  if (err) {
                    console.error('Error updating development module:', err);
                    return res.status(500).json({ error: 'Failed to update development module data' });
                  }

                  console.log(`Updated development module ${developmentModuleId} for ${deviceId}: Screen ${developmentScreenReached}, ${developmentProgressPercentage}%`);

                  res.json({ 
                    success: true, 
                    moduleId: existingRecord.id,
                    message: 'Development module data updated successfully' 
                  });
                }
              );
            } else {
              // No update needed
              res.json({ 
                success: true, 
                moduleId: existingRecord.id,
                message: 'Development module data already up to date' 
              });
            }
          } else {
            // Insert new record
            db.run(
              `INSERT INTO development_modules 
               (device_id, development_module_id, development_screen_reached, 
                development_is_completed, development_progress_percentage, development_date) 
               VALUES (?, ?, ?, ?, ?, ?)`,
              [deviceId, developmentModuleId, developmentScreenReached, 
               developmentIsCompleted, developmentProgressPercentage, developmentDate],
              function(err) {
                if (err) {
                  console.error('Error saving development module:', err);
                  return res.status(500).json({ error: 'Failed to save development module data' });
                }

                console.log(`Saved development module ${developmentModuleId} for ${deviceId}: Screen ${developmentScreenReached}, ${developmentProgressPercentage}%`);

                res.json({ 
                  success: true, 
                  moduleId: this.lastID,
                  message: 'Development module data saved successfully' 
                });
              }
            );
          }
        }
      );
    });
  } catch (error) {
    console.error('Error in development endpoint:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get User Analytics - COMPLETE UPDATE WITH ALL FRONTEND DATA
app.get('/api/data/analytics/:deviceId', (req, res) => {
  try {
    const { deviceId } = req.params;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    // Get user info
    db.get("SELECT * FROM users WHERE device_id = ?", [deviceId], (err, user) => {
      if (err) {
        console.error('Error getting user:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get challenge stats with success tracking
      db.all(`
        SELECT 
          COUNT(*) as total_challenges,
          SUM(CASE WHEN challenge_was_successful = 1 THEN 1 ELSE 0 END) as successful_challenges,
          AVG(challenge_confidence_level) as avg_challenge_confidence
        FROM daily_challenges 
        WHERE device_id = ?
      `, [deviceId], (err, challengeStats) => {
        if (err) {
          console.error('Error getting challenge stats:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        // Get opener stats (only count used openers for success rate)
        db.all(`
          SELECT 
            COUNT(*) as total_openers,
            SUM(CASE WHEN opener_was_successful = 1 THEN 1 ELSE 0 END) as successful_openers,
            AVG(opener_rating) as avg_rating,
            AVG(opener_confidence_level) as avg_opener_confidence
          FROM openers 
          WHERE device_id = ? AND opener_was_used = 1
        `, [deviceId], (err, openerStats) => {
          if (err) {
            console.error('Error getting opener stats:', err);
            return res.status(500).json({ error: 'Database error' });
          }

          // Get development module stats
          db.all(`
            SELECT 
              COUNT(*) as total_modules_started,
              SUM(CASE WHEN development_is_completed = 1 THEN 1 ELSE 0 END) as completed_modules,
              AVG(development_progress_percentage) as avg_progress
            FROM development_modules 
            WHERE device_id = ?
          `, [deviceId], (err, developmentStats) => {
            if (err) {
              console.error('Error getting development stats:', err);
              return res.status(500).json({ error: 'Database error' });
            }

            // Get confidence progression (early vs recent)
            db.all(`
              SELECT 
                AVG(CASE WHEN created_at < datetime('now', '-30 days') THEN challenge_confidence_level END) as early_challenge_confidence,
                AVG(CASE WHEN created_at >= datetime('now', '-30 days') THEN challenge_confidence_level END) as recent_challenge_confidence
              FROM daily_challenges 
              WHERE device_id = ? AND challenge_confidence_level IS NOT NULL
            `, [deviceId], (err, confidenceProgression) => {
              if (err) {
                console.error('Error getting confidence progression:', err);
                return res.status(500).json({ error: 'Database error' });
              }

              // Get weekly activity counts (last 7 days)
              db.all(`
                SELECT DISTINCT date(activity_date) as activity_date
                FROM (
                  SELECT challenge_date as activity_date
                  FROM daily_challenges 
                  WHERE device_id = ?
                  
                  UNION
                  
                  SELECT opener_date as activity_date
                  FROM openers 
                  WHERE device_id = ? AND opener_was_used = 1
                ) activities
                ORDER BY activity_date
              `, [deviceId, deviceId], (err, weeklyActivity) => {
                if (err) {
                  console.error('Error getting weekly activity:', err);
                  return res.status(500).json({ error: 'Database error' });
                }

                // Get activity frequency for social energy calculation
                db.all(`
                  SELECT 
                    COUNT(DISTINCT action_date) as recent_active_days,
                    COUNT(*) as total_recent_actions
                  FROM (
                    SELECT date(challenge_date) as action_date FROM daily_challenges WHERE device_id = ? AND challenge_date >= date('now', '-7 days')
                    UNION ALL
                    SELECT date(opener_date) as action_date FROM openers WHERE device_id = ? AND opener_was_used = 1 AND opener_date >= date('now', '-7 days')
                  )
                `, [deviceId, deviceId], (err, activityFrequency) => {
                  if (err) {
                    console.error('Error getting activity frequency:', err);
                    return res.status(500).json({ error: 'Database error' });
                  }

                  // Extract stats
                  const challengeStatsData = challengeStats[0];
                  const openerStatsData = openerStats[0];
                  const developmentStatsData = developmentStats[0];
                  const confidenceData = confidenceProgression[0];
                  const activityData = activityFrequency[0];
                  
                  // Calculate core metrics
                  const currentStreak = user.current_streak || 0; // Keep using database streak for now
                  const totalSuccessfulActions = (challengeStatsData.successful_challenges || 0) + (openerStatsData.successful_openers || 0);
                  const totalActions = (challengeStatsData.total_challenges || 0) + (openerStatsData.total_openers || 0);
                  const overallSuccessRate = totalActions > 0 ? Math.round((totalSuccessfulActions / totalActions) * 100) : 0;
                  
                  // Social confidence percentage (based on 90-day target)
                  const socialConfidencePercentage = Math.min(100, Math.round((currentStreak / 90) * 100));
                  
                  // Generate streak-aware weekly activity array (simplified and robust)
                  const weeklyActivityArray = [];
                  
                  // Create a map of dates to activity counts
                  const activityMap = {};
                  weeklyActivity.forEach(row => {
                    activityMap[row.activity_date] = row.activity_count;
                  });
                  const activityDates = Object.keys(activityMap).sort();
                  
                  console.log('=== ANALYTICS WEEKLY ACTIVITY ===');
                  console.log('Current streak:', currentStreak);
                  console.log('Activity dates found:', activityDates);
                  
                  // Use today as reference point for 7-day window
                  const today = new Date();
                  
                  // Build array of the last 7 days ending today
                  for (let i = 6; i >= 0; i--) {
                    const checkDate = new Date(today);
                    checkDate.setDate(today.getDate() - i);
                    const dateString = checkDate.toISOString().split('T')[0];
                    const activityCount = activityMap[dateString] || 0;
                    
                    let activityStatus = 'none';
                    
                    // Simple logic: if there's activity on this date, mark it as streak if we have a current streak
                    if (activityCount > 0) {
                      if (currentStreak > 0) {
                        activityStatus = 'streak';  // Part of streak
                      } else {
                        activityStatus = 'activity';  // Activity but no streak
                      }
                    } else {
                      activityStatus = 'none';  // No activity
                    }
                    
                    weeklyActivityArray.push(activityStatus);
                  }
                  
                  console.log('Analytics final weekly activity array:', weeklyActivityArray);
                  console.log('=== END ANALYTICS WEEKLY ACTIVITY ===');
                  
                  // Calculate Personal Benefits (MVP simplified formulas)
                  
                  // 1. Improved Confidence (confidence level progression + streak boost)
                  let improvedConfidence = 30; // Base confidence
                  if (confidenceData.recent_challenge_confidence && confidenceData.early_challenge_confidence) {
                    const confidenceImprovement = (confidenceData.recent_challenge_confidence - confidenceData.early_challenge_confidence) / 4 * 100;
                    improvedConfidence += Math.max(0, confidenceImprovement);
                  }
                  improvedConfidence += Math.min(40, currentStreak * 2); // Streak bonus
                  improvedConfidence = Math.min(100, Math.round(improvedConfidence));
                  
                  // 2. Reduced Social Anxiety (inverse of confidence improvement + consistency)
                  let reducedSocialAnxiety = 25; // Base anxiety reduction
                  const consistencyBonus = currentStreak >= 7 ? 20 : Math.round(currentStreak * 2.8);
                  reducedSocialAnxiety += consistencyBonus;
                  if (overallSuccessRate > 60) {
                    reducedSocialAnxiety += Math.round((overallSuccessRate - 60) * 0.5);
                  }
                  reducedSocialAnxiety = Math.min(100, Math.round(reducedSocialAnxiety));
                  
                  // 3. Enhanced Communication Skills (success rate + module progress)
                  const avgModuleProgress = developmentStatsData.avg_progress || 0;
                  const moduleProgressScore = Math.min(100, avgModuleProgress); // Use actual average progress
                  const communicationSkills = Math.round((overallSuccessRate * 0.7) + (moduleProgressScore * 0.3));
                  const enhancedCommunication = Math.min(100, communicationSkills);
                  
                  // 4. Increased Social Energy (activity frequency)
                  let socialEnergy = 20; // Base energy
                  const recentActiveDays = activityData.recent_active_days || 0;
                  const totalRecentActions = activityData.total_recent_actions || 0;
                  
                  // Frequency bonus: active days in last week
                  socialEnergy += Math.min(35, recentActiveDays * 5); // Max 35 for 7 active days
                  
                  // Volume bonus: total actions in last week  
                  socialEnergy += Math.min(25, totalRecentActions * 2); // Max 25 for 12+ actions
                  
                  if (currentStreak >= 5) {
                    socialEnergy += 20; // Momentum bonus
                  }
                  const increasedSocialEnergy = Math.min(100, Math.round(socialEnergy));
                  
                  // 5. Better Relationship Building (opener success + conversation skills)
                  let relationshipBuilding = 25; // Base relationship skills
                  const openerSuccessRate = openerStatsData.total_openers > 0 ? 
                    Math.round((openerStatsData.successful_openers / openerStatsData.total_openers) * 100) : 0;
                  relationshipBuilding += Math.round(openerSuccessRate * 0.4);
                  relationshipBuilding += Math.min(20, currentStreak * 1.5); // Consistency bonus
                  const betterRelationships = Math.min(100, Math.round(relationshipBuilding));

                  console.log(`Analytics calculated for ${deviceId}:`, {
                    streak: currentStreak,
                    successRate: overallSuccessRate,
                    socialConfidence: socialConfidencePercentage,
                    weeklyActivity: weeklyActivityArray,
                    benefits: {
                      confidence: improvedConfidence,
                      anxiety: reducedSocialAnxiety,
                      communication: enhancedCommunication,
                      energy: increasedSocialEnergy,
                      relationships: betterRelationships
                    }
                  });

                  // Return complete analytics data for frontend
                  res.json({
                    // Streak Info
                    currentStreak: currentStreak,
                    allTimeBestStreak: user.all_time_best_streak || 0,
                    
                    // Social Confidence (calculated from streak)
                    socialConfidencePercentage: socialConfidencePercentage,
                    
                    // Weekly Activity (7 days of activity counts)
                    weeklyActivity: weeklyActivityArray,
                    
                    // Overall Success Rate (from challenges + openers)
                    overallSuccessRate: overallSuccessRate,
                    totalChallenges: challengeStatsData.total_challenges || 0,
                    totalOpeners: openerStatsData.total_openers || 0,
                    successfulChallenges: challengeStatsData.successful_challenges || 0,
                    successfulOpeners: openerStatsData.successful_openers || 0,
                    
                    // Personal Benefits (calculated from various data points)
                    improvedConfidence: improvedConfidence,
                    reducedSocialAnxiety: reducedSocialAnxiety,
                    enhancedCommunication: enhancedCommunication,
                    increasedSocialEnergy: increasedSocialEnergy,
                    betterRelationships: betterRelationships,
                    
                    // Additional data (for debugging/future use)
                    averageRating: Math.round((openerStatsData.avg_rating || 0) * 10) / 10,
                    totalModulesStarted: developmentStatsData.total_modules_started || 0,
                    completedModules: developmentStatsData.completed_modules || 0,
                    averageModuleProgress: Math.round((developmentStatsData.avg_progress || 0) * 10) / 10
                  });
                });
              });
            });
          });
        });
      });
    });
  } catch (error) {
    console.error('Error in analytics endpoint:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// SIMULATED DATE HOME ENDPOINT - BACKEND HANDLES ALL LOGIC
app.get('/api/simulated/home/:deviceId', (req, res) => {
  try {
    const { deviceId } = req.params;
    const { currentDate, completed } = req.query;
    
    console.log(`🧪 SIMULATED HOME: Device ${deviceId}, Current Date: ${currentDate}`);
    
    // Get completed dates from query parameter (comma-separated list)
    const completedDates = completed ? completed.split(',').filter(d => d.length > 0) : [];
    console.log(`🧪 SIMULATED HOME: Completed dates: [${completedDates.join(', ')}]`);
    
    // Parse current date
    const currentDateObj = new Date(currentDate + 'T00:00:00.000Z');
    
    // Build week array - 7 days ending with current date
    const weeklyActivity = [];
    const calendar = [];
    
    for (let i = 6; i >= 0; i--) {
      const checkDate = new Date(currentDateObj);
      checkDate.setDate(checkDate.getDate() - i);
      const checkDateString = checkDate.toISOString().split('T')[0]; // YYYY-MM-DD
      
      calendar.push(checkDateString);
      
      if (completedDates.includes(checkDateString)) {
        // Completed day - GREEN
        weeklyActivity.push('streak');
      } else if (completedDates.length === 0) {
        // New user - all previous days should be grey
        weeklyActivity.push('none');
      } else {
        // Find the first completed date to determine if this is before start or missed
        const firstCompletedDate = completedDates.sort()[0];
        if (checkDateString < firstCompletedDate) {
          // Before user started - GREY
          weeklyActivity.push('none');
        } else if (checkDateString >= currentDate) {
          // Current day or future - don't mark as missed yet - GREY
          weeklyActivity.push('none');
        } else {
          // Past day after user started but not completed - RED
          weeklyActivity.push('missed');
        }
      }
    }
    
    // Calculate current streak - consecutive completed days working backwards from most recent
    let currentStreak = 0;
    
    if (completedDates.length > 0) {
      const sortedCompletedDates = completedDates.sort(); // Earliest to latest
      const mostRecentCompletedDate = sortedCompletedDates[sortedCompletedDates.length - 1];
      const mostRecentCompletedDateObj = new Date(mostRecentCompletedDate + 'T00:00:00.000Z');
      
      // Check if there's a gap between most recent completed date and current date
      // If user missed days, streak should be 0
      const daysBetween = Math.floor((currentDateObj.getTime() - mostRecentCompletedDateObj.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysBetween > 1) {
        // There are missed days between most recent completion and current date
        // Streak is broken, reset to 0
        currentStreak = 0;
        console.log(`🧪 SIMULATED HOME: Streak broken - ${daysBetween} days between ${mostRecentCompletedDate} and ${currentDate}`);
      } else {
        // No gap, count consecutive days backwards
        let checkDate = new Date(mostRecentCompletedDateObj);
        
        // Count consecutive days backwards
        for (let i = sortedCompletedDates.length - 1; i >= 0; i--) {
          const expectedDateString = checkDate.toISOString().split('T')[0];
          
          if (sortedCompletedDates[i] === expectedDateString) {
            currentStreak++;
            checkDate.setDate(checkDate.getDate() - 1); // Go back one day
          } else {
            // Gap found, streak is broken
            break;
          }
        }
      }
    }
    
    console.log(`🧪 SIMULATED HOME: Calendar: [${calendar.join(', ')}]`);
    console.log(`🧪 SIMULATED HOME: Week array: [${weeklyActivity.join(', ')}]`);
    console.log(`🧪 SIMULATED HOME: Current streak: ${currentStreak}`);
    
    const response = {
      currentStreak: currentStreak,
      socialZoneLevel: "Warming Up",
      weeklyActivity: weeklyActivity,
      hasActivityToday: completedDates.includes(currentDate)
    };
    
    console.log(`🧪 SIMULATED HOME: Response:`, response);
    res.json(response);
  } catch (error) {
    console.error('❌ Error in simulated home endpoint:', error);
    res.status(500).json({ error: 'Simulated endpoint error' });
  }
});

// Home Screen Data API Endpoint
app.get('/api/data/home/:deviceId', (req, res) => {
  try {
    console.log('🏠 Home endpoint started');
    const { deviceId } = req.params;
    const { customDate } = req.query;  // Get custom date from query parameter

    console.log(`🏠 Device ID: ${deviceId}, Custom Date: ${customDate}`);

    if (!deviceId) {
      console.log('❌ No device ID provided');
      return res.status(400).json({ error: 'deviceId is required' });
    }

    // Use custom date if provided (for debug mode), otherwise use current date
    const referenceDate = customDate ? new Date(customDate + 'T00:00:00Z') : new Date();
    console.log(`🏠 Home screen request for device: ${deviceId}`);
    console.log(`🏠 Reference date: ${referenceDate.toISOString()}`);
    if (customDate) {
      console.log(`🧪 DEBUG MODE: Using custom date: ${customDate} (${referenceDate.toISOString()})`);
    }

    // Ensure user exists first
    console.log('🏠 Calling ensureUserExists...');
    ensureUserExists(deviceId, (err) => {
      console.log('🏠 ensureUserExists callback called', err ? 'with error:' : 'successfully', err);
      if (err) {
        console.error('❌ Error ensuring user exists:', err);
        return res.status(500).json({ error: 'Database error creating user' });
      }

      // Get user info
      db.get("SELECT * FROM users WHERE device_id = ?", [deviceId], (err, user) => {
        if (err) {
          console.error('❌ Error getting user:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        if (!user) {
          console.error('❌ User still not found after creation attempt');
          return res.status(500).json({ error: 'User creation failed' });
        }

        console.log(`✅ User found: ${deviceId}, streak: ${user.current_streak}`);

        // Get activity data for week calculation
        // In debug mode: get ALL activities (no date filtering)
        // In normal mode: get activities from last 30 days
        let activityQuery;
        let queryParams;
        
        if (customDate) {
          // DEBUG MODE: Get ALL activities, no date filtering
          console.log(`🧪 DEBUG MODE: Getting ALL activities for device ${deviceId}`);
          activityQuery = `
            SELECT DISTINCT date(activity_date) as activity_date
            FROM (
              SELECT challenge_date as activity_date
              FROM daily_challenges 
              WHERE device_id = ?
              
              UNION
              
              SELECT opener_date as activity_date
              FROM openers 
              WHERE device_id = ? AND opener_was_used = 1
            ) activities
            ORDER BY activity_date
          `;
          queryParams = [deviceId, deviceId];
        } else {
          // NORMAL MODE: Get activities from last 30 days
          const dateThreshold = new Date(referenceDate.getTime() - (30 * 24 * 60 * 60 * 1000));
          const dateThresholdString = dateThreshold.toISOString().split('T')[0];
          console.log(`🔍 NORMAL MODE: Using date threshold: ${dateThresholdString}`);
          
          activityQuery = `
            SELECT DISTINCT date(activity_date) as activity_date
            FROM (
              SELECT challenge_date as activity_date
              FROM daily_challenges 
              WHERE device_id = ?
              
              UNION
              
              SELECT opener_date as activity_date
              FROM openers 
              WHERE device_id = ? AND opener_was_used = 1
            ) activities
            WHERE activity_date >= ?
            ORDER BY activity_date
          `;
          queryParams = [deviceId, deviceId, dateThresholdString];
        }
        
        db.all(activityQuery, queryParams, (err, weeklyActivity) => {
          if (err) {
            console.error('❌ Error getting weekly activity:', err);
            return res.status(500).json({ error: 'Database error' });
          }

          const activityDates = weeklyActivity.map(row => row.activity_date).sort();
          console.log('📊 Activity dates found:', activityDates);
          
          // Build weekly activity array for last 7 days (simple logic)
          const weeklyActivityArray = [];
          const today = referenceDate;
          
          console.log(`🔍 DEBUG: Building week array for reference date: ${today.toISOString()}`);
          
          // Find first activity date to determine when user started
          const firstActivityDate = activityDates.length > 0 ? new Date(activityDates[0]) : null;
          console.log(`🔍 DEBUG: First activity date: ${firstActivityDate ? firstActivityDate.toISOString() : 'none'}`);
          console.log(`🔍 DEBUG: Activity dates found: [${activityDates.join(', ')}]`);
          
          for (let i = 6; i >= 0; i--) {
            // Create date more reliably to avoid timezone issues
            const checkDate = new Date(today.getTime());
            checkDate.setUTCDate(today.getUTCDate() - i);
            const dateString = checkDate.toISOString().split('T')[0];
            
            const hasActivity = activityDates.includes(dateString);
            let activityStatus = 'none';
            
            if (hasActivity) {
              // Has activity = GREEN (part of streak)
              activityStatus = 'streak';
            } else if (firstActivityDate && checkDate >= firstActivityDate) {
              // No activity but user has started = RED (missed day)
              activityStatus = 'missed';
            } else {
              // No activity and before user started = GRAY (none)
              activityStatus = 'none';
            }
            
            console.log(`📅 Day ${6-i} - ${dateString}: ${activityStatus} (hasActivity: ${hasActivity}, started: ${firstActivityDate ? 'yes' : 'no'})`);
            weeklyActivityArray.push(activityStatus);
          }

          // Ensure we always have exactly 7 elements
          while (weeklyActivityArray.length < 7) {
            weeklyActivityArray.push('none');
          }
          weeklyActivityArray.splice(7); // Trim to exactly 7 if somehow more

          console.log(`🔍 DEBUG: Final weeklyActivityArray (${weeklyActivityArray.length} elements): [${weeklyActivityArray.join(', ')}]`);

          // Check if user has activity today
          const todayString = today.toISOString().split('T')[0];
          const hasActivityToday = activityDates.includes(todayString);

          const response = {
            currentStreak: user.current_streak || 0,
            socialZoneLevel: "Warming Up",
            weeklyActivity: weeklyActivityArray,
            hasActivityToday: hasActivityToday
          };

          console.log(`✅ Returning home screen data for ${deviceId}:`, response);
          res.json(response);
        });
      });
    });
  } catch (error) {
    console.error('❌ Error in home screen endpoint:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DEBUG ENDPOINT - Check weekly activity calculation
app.get('/api/debug/weekly-activity/:deviceId', (req, res) => {
  try {
    const { deviceId } = req.params;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    // Get user info
    db.get("SELECT * FROM users WHERE device_id = ?", [deviceId], (err, user) => {
      if (err) {
        console.error('Error getting user:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get enough activity data to cover the full streak range (30 days to be safe)
      db.all(`
        SELECT DISTINCT date(activity_date) as activity_date
        FROM (
          SELECT challenge_date as activity_date
          FROM daily_challenges 
          WHERE device_id = ?
          
          UNION
          
          SELECT opener_date as activity_date
          FROM openers 
          WHERE device_id = ? AND opener_was_used = 1
        ) activities
        WHERE activity_date >= date('now', '-30 days')
        ORDER BY activity_date
      `, [deviceId, deviceId], (err, weeklyActivity) => {
        if (err) {
          console.error('Error getting weekly activity:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        // Calculate the streak start date (working backwards from last completion)
        const currentStreak = user.current_streak || 0;
        let streakStartDate = null;
        
        if (user.last_completion_date && currentStreak > 0) {
          const lastCompletionDate = new Date(user.last_completion_date.split('T')[0] + 'T00:00:00Z');
          streakStartDate = new Date(lastCompletionDate);
          streakStartDate.setDate(lastCompletionDate.getDate() - (currentStreak - 1));
        }

        // Generate debug info for each day
        const today = new Date();
        const activityDates = weeklyActivity.map(row => row.activity_date);
        const weeklyActivityArray = [];
        const debugInfo = [];

        for (let i = 6; i >= 0; i--) {
          const checkDate = new Date(today);
          checkDate.setDate(today.getDate() - i);
          const dateString = checkDate.toISOString().split('T')[0];
          
          let activityStatus = 'none';
          let reasoning = 'No activity, not part of streak';
          
          if (streakStartDate) {
            const streakStartDateString = streakStartDate.toISOString().split('T')[0];
            const lastCompletionDateString = user.last_completion_date.split('T')[0];
            
            if (dateString >= streakStartDateString && dateString <= lastCompletionDateString) {
              if (activityDates.includes(dateString)) {
                activityStatus = 'streak';
                reasoning = 'Within streak range AND has activity';
              } else {
                activityStatus = 'missed';
                reasoning = 'Within streak range BUT missing activity';
              }
            } else if (dateString > lastCompletionDateString) {
              if (activityDates.includes(dateString)) {
                activityStatus = 'activity';
                reasoning = 'After streak ended but has activity';
              } else {
                activityStatus = 'none';
                reasoning = 'After streak ended, no activity';
              }
            } else {
              reasoning = 'Before streak started';
            }
          } else {
            if (activityDates.includes(dateString)) {
              activityStatus = 'activity';
              reasoning = 'No current streak, but has activity';
            }
          }
          
          weeklyActivityArray.push(activityStatus);
          debugInfo.push({
            date: dateString,
            dayOfWeek: checkDate.toLocaleDateString('en-US', { weekday: 'short' }),
            status: activityStatus,
            reasoning: reasoning,
            hasActivity: activityDates.includes(dateString)
          });
        }

        res.json({
          user: {
            current_streak: user.current_streak,
            last_completion_date: user.last_completion_date,
            all_time_best_streak: user.all_time_best_streak
          },
          streakCalculation: {
            currentStreak,
            streakStartDate: streakStartDate?.toISOString().split('T')[0],
            lastCompletionDate: user.last_completion_date?.split('T')[0]
          },
          activityDates,
          weeklyActivityArray,
          debugInfo
        });
      });
    });
  } catch (error) {
    console.error('Error in weekly activity debug endpoint:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DEBUG ENDPOINT - Test streak updates with specific dates
app.post('/api/debug/test-streak/:deviceId', (req, res) => {
  try {
    const { deviceId } = req.params;
    const { challengeDate, resetStreak = false } = req.body;

    if (!deviceId || !challengeDate) {
      return res.status(400).json({ error: 'deviceId and challengeDate are required' });
    }

    console.log(`\n🧪 TESTING STREAK UPDATE for ${deviceId} with date: ${challengeDate}`);

    // If resetStreak is true, reset the user's streak first
    if (resetStreak) {
      db.run(
        "UPDATE users SET current_streak = 0, last_completion_date = NULL WHERE device_id = ?",
        [deviceId],
        (err) => {
          if (err) {
            console.error('Error resetting streak:', err);
            return res.status(500).json({ error: 'Failed to reset streak' });
          }
          console.log(`🔄 Reset streak for ${deviceId}`);
          
          // Now update the streak with the test date
          updateUserStreak(deviceId, challengeDate);
          
          // Return current user data after a short delay
          setTimeout(() => {
            db.get("SELECT * FROM users WHERE device_id = ?", [deviceId], (err, user) => {
              if (err) {
                return res.status(500).json({ error: 'Database error' });
              }
              res.json({
                message: 'Streak test completed (with reset)',
                testDate: challengeDate,
                userAfterUpdate: user
              });
            });
          }, 100);
        }
      );
    } else {
      // Just update the streak with the test date
      updateUserStreak(deviceId, challengeDate);
      
      // Return current user data after a short delay
      setTimeout(() => {
        db.get("SELECT * FROM users WHERE device_id = ?", [deviceId], (err, user) => {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }
          res.json({
            message: 'Streak test completed',
            testDate: challengeDate,
            userAfterUpdate: user
          });
        });
      }, 100);
    }
  } catch (error) {
    console.error('Error in streak test endpoint:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DEBUG ENDPOINT - Check streak-contributing actions
app.get('/api/debug/streak/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  
  // Get all streak-contributing actions
  db.all(`
    SELECT 'challenge' as type, challenge_date as date, challenge_completed as contributed, 
           challenge_was_successful as was_successful, 'N/A' as was_used
    FROM daily_challenges 
    WHERE device_id = ? AND challenge_completed = 1
    
    UNION ALL
    
    SELECT 'opener' as type, opener_date as date, opener_was_used as contributed,
           opener_was_successful as was_successful, opener_was_used as was_used
    FROM openers 
    WHERE device_id = ? AND opener_was_used = 1
    
    ORDER BY date DESC
  `, [deviceId, deviceId], (err, actions) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    db.get("SELECT * FROM users WHERE device_id = ?", [deviceId], (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      res.json({
        user: user,
        streak_contributing_actions: actions,
        explanation: {
          challenges: "All completed challenges count toward streak (regardless of success)",
          openers: "Only USED openers count toward streak (regardless of conversation success)", 
          unused_openers: "Unused openers are saved but don't contribute to streak"
        }
      });
    });
  });
});

// RAW DATA DEBUG ENDPOINT - See all collected form data
app.get('/api/debug/raw-data/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  
  // Get all challenge data with form responses
  db.all(`
    SELECT id, challenge_was_successful, challenge_rating, challenge_confidence_level, 
           challenge_notes, challenge_date, challenge_type, created_at
    FROM daily_challenges 
    WHERE device_id = ?
    ORDER BY created_at DESC
  `, [deviceId], (err, challenges) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    // Get all opener data with form responses
    db.all(`
      SELECT id, opener_was_used, opener_was_successful, opener_rating, 
             opener_confidence_level, opener_notes, opener_date, opener_setting, 
             opener_purpose, created_at
      FROM openers 
      WHERE device_id = ?
      ORDER BY created_at DESC
    `, [deviceId], (err, openers) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      res.json({
        deviceId: deviceId,
        challenges: challenges,
        openers: openers,
        summary: {
          total_challenges: challenges.length,
          total_openers: openers.length
        }
      });
    });
  });
});

app.post('/generate-suggestions', async (req, res) => {
  try {
    const { purpose, setting } = req.body;
    console.log('Received suggestions request:', { purpose, setting });
    
    const key = `${purpose}-${setting}`;
    const suggestions = suggestionRotations[key] || ["General location", "Another spot", "Third place", "Fourth option"];
    
    console.log('Returning hardcoded suggestions for:', key, suggestions);
    res.json({ suggestions });
    
  } catch (error) {
    console.error('Error getting suggestions:', error);
    res.status(500).json({ 
      error: 'Failed to get suggestions', 
      details: error.message 
    });
  }
});

app.post('/generate-opener', async (req, res) => {
  try {
    const { purpose, setting, context } = req.body;
    console.log('Received opener request:', { purpose, setting, context });
    
    // Handle optional context
    const contextText = context && context.trim() ? context : `a ${setting} environment`;
    
    const prompt = `Create a conversation opener for:

Purpose: ${purpose}
Setting: ${setting}  
Context: ${contextText}

Generate:
1. Opener: Natural conversation starter for ${purpose} intentions in this situation
2. Follow-ups: 3 questions that match the purpose/setting/context
3. ExitStrategy: Polite way to end the conversation
4. Tip: Specific advice for this exact scenario
5. Confidence Boost: Encouraging message for this situation

Return ONLY JSON with fields: opener, followUps (array of 3 strings), exitStrategy, tip, confidenceBoost`;

    const message = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 400,
      system: "You create contextually perfect conversation guidance. Return only valid JSON.",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const result = message.content[0].text.trim();
    console.log('Raw Claude Response:', result);
    
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
    
    // Parse the JSON
    const openerData = JSON.parse(cleanResult);
    
    // Validate the response has required fields
    if (!openerData.opener || !openerData.followUps || !openerData.exitStrategy || !openerData.tip || !openerData.confidenceBoost) {
      throw new Error('Invalid response format from AI');
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

app.post('/generate-daily-challenge', async (req, res) => {
  try {
    const { level = "beginner", date } = req.body;
    
    // Check if Anthropic API key is available
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('❌ Cannot generate challenge: ANTHROPIC_API_KEY not configured');
      return res.status(500).json({ 
        error: 'Service configuration error', 
        details: 'AI service not properly configured on server' 
      });
    }
    
    // Use provided date or current date
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    console.log('Received daily challenge request:', { level, date: targetDate });
    
    // Get consistent template for this date
    const template = getChallengeTemplateForDate(targetDate, level);
    
    const prompt = `You are a social skills coach who creates progressive social challenges that build confidence gradually. Focus on authentic connection over scripted interactions.

${template.prompt}

Create a challenge that:
- Is achievable for someone at ${level} level
- Builds social skills gradually  
- Is specific and actionable
- Can be completed in one day
- Focuses on authentic connection, not scripted interactions
- Builds confidence progressively

Generate:
1. Challenge: The main task to complete (keep it concise, 1-2 sentences)
2. Description: More detailed explanation of what to do (2-3 sentences)
3. Tips: Practical advice for completing this challenge successfully
4. WhyThisMatters: Explanation of the benefits and reasoning behind this challenge

Return ONLY valid JSON with fields: challenge, description, tips, whyThisMatters. No markdown formatting, no extra text, just the JSON object.`;

    let message;
    try {
      message = await anthropic.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      });
    } catch (anthropicError) {
      console.error('❌ Anthropic API Error:', anthropicError);
      console.error('❌ Error type:', anthropicError.constructor.name);
      console.error('❌ Error status:', anthropicError.status);
      console.error('❌ Error message:', anthropicError.message);
      
      // Provide specific error based on the type
      if (anthropicError.status === 401) {
        throw new Error('Invalid API key configuration');
      } else if (anthropicError.status === 404) {
        throw new Error('Anthropic service not found - check model name or endpoint');
      } else if (anthropicError.status === 429) {
        throw new Error('API rate limit exceeded - try again later');
      } else {
        throw new Error(`Anthropic API error: ${anthropicError.message}`);
      }
    }

    const result = message.content[0].text.trim();
    console.log('Raw Claude Daily Challenge Response:', result);
    
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
    challengeData.dateGenerated = targetDate;
    
    console.log(`Generated challenge for ${targetDate} using template: ${template.name}`);
    
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

app.post('/api/ai-coach/chat', async (req, res) => {
  try {
    const { message, context = {} } = req.body;
    console.log('Received AI coach chat request:', { message, context });
    
    if (!message || !message.trim()) {
      return res.status(400).json({ 
        error: 'Message is required', 
        details: 'Please provide a message to chat with the AI coach' 
      });
    }

    // Build context string for the prompt
    let contextInfo = "";
    if (context.userStreak) {
      contextInfo += `User has a ${context.userStreak}-day streak. `;
    }
    if (context.recentChallenges) {
      contextInfo += `Completed ${context.recentChallenges} challenges recently. `;
    }
    if (context.successRate) {
      contextInfo += `Success rate: ${context.successRate}%. `;
    }

    const prompt = `You are a supportive social confidence coach. A user says: "${message}"

${contextInfo ? `Context: ${contextInfo}` : ''}

Provide a supportive coaching response that:
- Is 2-4 sentences maximum for chat-friendly conversation
- Asks a follow-up question to continue the conversation
- References their progress when available (streak/challenges/success rate)
- Provides actionable next steps
- Uses a warm, encouraging but realistic tone
- Sounds like a conversational mentor, not clinical

Return ONLY a plain text response, no JSON formatting.`;

    const aiMessage = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 150,
      system: "You are a warm, supportive social confidence coach. Keep responses conversational, brief (2-4 sentences), and always ask a follow-up question. Reference user progress when available.",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const response = aiMessage.content[0].text.trim();
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

app.get('/api/breathwork/affirmations', async (req, res) => {
  try {
    console.log('Received breathwork affirmations request');
    
    // Shuffle the affirmations array and return 10-15 random ones
    const shuffled = [...breathworkAffirmations].sort(() => 0.5 - Math.random());
    const selectedAffirmations = shuffled.slice(0, 12);
    
    console.log('Returning affirmations:', selectedAffirmations.length);
    
    res.json({
      affirmations: selectedAffirmations
    });
    
  } catch (error) {
    console.error('Error getting breathwork affirmations:', error);
    res.status(500).json({ 
      error: 'Failed to get affirmations', 
      details: error.message 
    });
  }
});



// DEBUG ENDPOINT - Reset all user data
app.post('/api/debug/reset-user/:deviceId', (req, res) => {
  try {
    const { deviceId } = req.params;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    console.log(`🧪 RESETTING ALL DATA for device: ${deviceId}`);

    // Reset user data
    db.run(
      "UPDATE users SET current_streak = 0, all_time_best_streak = 0, last_completion_date = NULL WHERE device_id = ?",
      [deviceId],
      (err) => {
        if (err) {
          console.error('Error resetting user data:', err);
          return res.status(500).json({ error: 'Failed to reset user data' });
        }

        // Delete all challenge history
        db.run(
          "DELETE FROM daily_challenges WHERE device_id = ?",
          [deviceId],
          (err) => {
            if (err) {
              console.error('Error deleting challenges:', err);
              return res.status(500).json({ error: 'Failed to delete challenge history' });
            }

            // Delete all opener history
            db.run(
              "DELETE FROM openers WHERE device_id = ?",
              [deviceId],
              (err) => {
                if (err) {
                  console.error('Error deleting openers:', err);
                  return res.status(500).json({ error: 'Failed to delete opener history' });
                }

                console.log(`✅ Successfully reset all data for ${deviceId}`);
                res.json({
                  message: 'All user data reset successfully',
                  deviceId: deviceId
                });
              }
            );
          }
        );
      }
    );
  } catch (error) {
    console.error('Error in reset user endpoint:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Anthropic API health check endpoint
app.get('/api/anthropic/health', async (req, res) => {
  try {
    console.log('🔍 Testing Anthropic API connection...');
    
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ 
        status: 'error',
        error: 'ANTHROPIC_API_KEY environment variable not set',
        hasApiKey: false
      });
    }
    
    // Try a simple API call to test connection
    const testMessage = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 10,
      messages: [{ role: "user", content: "Say hello" }]
    });
    
    res.json({ 
      status: 'healthy',
      hasApiKey: true,
      testResponse: testMessage.content[0].text,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Anthropic health check failed:', error);
    res.status(500).json({ 
      status: 'error',
      error: error.message,
      errorType: error.constructor.name,
      errorStatus: error.status,
      hasApiKey: !!process.env.ANTHROPIC_API_KEY,
      timestamp: new Date().toISOString()
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
