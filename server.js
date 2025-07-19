const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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

  // Daily challenges table
  db.run(`
    CREATE TABLE IF NOT EXISTS daily_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      challenge_completed BOOLEAN DEFAULT TRUE,
      challenge_rating INTEGER,
      challenge_confidence_level TEXT,
      challenge_notes TEXT,
      challenge_date TEXT,
      challenge_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES users (device_id)
    )
  `);

  // Openers table
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
      opener_confidence_level TEXT,
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

// Helper function to ensure user exists
const ensureUserExists = (deviceId, callback) => {
  db.get("SELECT device_id FROM users WHERE device_id = ?", [deviceId], (err, row) => {
    if (err) {
      callback(err);
      return;
    }
    
    if (!row) {
      // Create new user
      db.run("INSERT INTO users (device_id) VALUES (?)", [deviceId], (err) => {
        callback(err);
      });
    } else {
      callback(null);
    }
  });
};

// Helper function to calculate and update streak
const updateUserStreak = (deviceId, challengeDate) => {
  db.get("SELECT current_streak, all_time_best_streak, last_completion_date FROM users WHERE device_id = ?", 
    [deviceId], (err, user) => {
    if (err) {
      console.error('Error getting user for streak update:', err);
      return;
    }

    let newStreak = 1;
    let newBestStreak = user.all_time_best_streak || 0;
    
    if (user.last_completion_date) {
      const lastDate = new Date(user.last_completion_date);
      const currentDate = new Date(challengeDate);
      const daysDiff = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));
      
      if (daysDiff === 1) {
        // Consecutive day
        newStreak = (user.current_streak || 0) + 1;
      } else if (daysDiff === 0) {
        // Same day, keep current streak
        newStreak = user.current_streak || 1;
      }
      // If daysDiff > 1, streak resets to 1 (already set above)
    }
    
    // Update best streak if current is higher
    if (newStreak > newBestStreak) {
      newBestStreak = newStreak;
    }
    
    db.run(
      "UPDATE users SET current_streak = ?, all_time_best_streak = ?, last_completion_date = ? WHERE device_id = ?",
      [newStreak, newBestStreak, challengeDate, deviceId],
      (err) => {
        if (err) {
          console.error('Error updating streak:', err);
        } else {
          console.log(`Updated streak for ${deviceId}: ${newStreak} (best: ${newBestStreak})`);
        }
      }
    );
  });
};

app.get('/', (req, res) => {
  res.json({ message: 'Social Coach Backend API is running!' });
});

// Save Daily Challenge Data
app.post('/api/data/challenge', (req, res) => {
  try {
    const {
      deviceId,
      challengeCompleted = true,
      challengeRating,
      challengeConfidenceLevel,
      challengeNotes,
      challengeDate,
      challengeType
    } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    ensureUserExists(deviceId, (err) => {
      if (err) {
        console.error('Error ensuring user exists:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      // Insert challenge data
      db.run(
        `INSERT INTO daily_challenges 
         (device_id, challenge_completed, challenge_rating, challenge_confidence_level, 
          challenge_notes, challenge_date, challenge_type) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [deviceId, challengeCompleted, challengeRating, challengeConfidenceLevel, 
         challengeNotes, challengeDate, challengeType],
        function(err) {
          if (err) {
            console.error('Error saving challenge:', err);
            return res.status(500).json({ error: 'Failed to save challenge data' });
          }

          // Update streak
          updateUserStreak(deviceId, challengeDate);

          res.json({ 
            success: true, 
            challengeId: this.lastID,
            message: 'Challenge data saved successfully' 
          });
        }
      );
    });
  } catch (error) {
    console.error('Error in challenge endpoint:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save Opener Data
app.post('/api/data/opener', (req, res) => {
  try {
    const {
      deviceId,
      openerText,
      openerSetting,
      openerPurpose,
      openerWasUsed,
      openerWasSuccessful,
      openerRating,
      openerConfidenceLevel,
      openerNotes,
      openerDate
    } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    ensureUserExists(deviceId, (err) => {
      if (err) {
        console.error('Error ensuring user exists:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      // Insert opener data
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

// Get User Analytics
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

      // Get challenge count
      db.get("SELECT COUNT(*) as count FROM daily_challenges WHERE device_id = ?", 
        [deviceId], (err, challengeCount) => {
        if (err) {
          console.error('Error getting challenge count:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        // Get opener stats
        db.all(`
          SELECT 
            COUNT(*) as total_openers,
            SUM(CASE WHEN opener_was_successful = 1 THEN 1 ELSE 0 END) as successful_openers,
            AVG(opener_rating) as avg_rating
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

            const openerStatsData = openerStats[0];
            const developmentStatsData = developmentStats[0];
            
            const successRate = openerStatsData.total_openers > 0 ? 
              Math.round((openerStatsData.successful_openers / openerStatsData.total_openers) * 100) : 0;

            res.json({
              currentStreak: user.current_streak || 0,
              allTimeBestStreak: user.all_time_best_streak || 0,
              totalChallenges: challengeCount.count || 0,
              totalOpeners: openerStatsData.total_openers || 0,
              successfulOpeners: openerStatsData.successful_openers || 0,
              successRate: successRate,
              averageRating: Math.round((openerStatsData.avg_rating || 0) * 10) / 10,
              totalModulesStarted: developmentStatsData.total_modules_started || 0,
              completedModules: developmentStatsData.completed_modules || 0,
              averageModuleProgress: Math.round((developmentStatsData.avg_progress || 0) * 10) / 10
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
    const { level = "beginner" } = req.body;
    console.log('Received daily challenge request:', { level });
    
    const prompt = `Generate a daily social challenge for someone with ${level} social confidence level.

Create a challenge that:
- Is achievable for someone at ${level} level
- Builds social skills gradually
- Is specific and actionable
- Can be completed in one day

Generate:
1. Challenge: The main task to complete (keep it concise, 1-2 sentences)
2. Description: More detailed explanation of what to do (2-3 sentences)
3. Tips: Practical advice for completing this challenge successfully
4. WhyThisMatters: Explanation of the benefits and reasoning behind this challenge
5. Badge: Difficulty level indicator (Foundation, Growth, or Advanced)

Return ONLY JSON with fields: challenge, description, tips, whyThisMatters, badge`;

    const message = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 500,
      system: "You create progressive social challenges that build confidence gradually. Focus on authentic connection over scripted interactions. Return only valid JSON.",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    });

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
    if (!challengeData.challenge || !challengeData.description || !challengeData.tips || !challengeData.whyThisMatters || !challengeData.badge) {
      throw new Error('Invalid response format from AI');
    }
    
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
