const express = require('express');
const cors = require('cors');
const Replicate = require('replicate');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Replicate
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Social Coach Backend API is running!' });
});

// Generate quick suggestions endpoint
app.post('/generate-suggestions', async (req, res) => {
  try {
    const { purpose, setting } = req.body;
    
    const prompt = `Generate 4 specific location/context suggestions for:
Purpose: ${purpose}
Setting: ${setting}

Requirements:
- Each suggestion should be 3-5 words
- Specific locations/contexts that match the purpose and setting
- Diverse but realistic scenarios
- Return as JSON array of strings only, no other text

Example: ["At a co-working space", "In a library", "At a quiet cafe", "During lunch break"]`;

    const input = {
      prompt: prompt,
      system_prompt: "You are a helpful assistant that generates location suggestions. Return only valid JSON.",
      max_tokens: 100
    };

    const output = await replicate.run("openai/gpt-4o-mini", { input });
    const result = output.join('').trim();
    
    // Parse the JSON response
    const suggestions = JSON.parse(result);
    
    res.json({ suggestions });
  } catch (error) {
    console.error('Error generating suggestions:', error);
    
    // Fallback suggestions
    const fallbackSuggestions = {
      suggestions: [
        `At a ${setting} place`,
        `During ${purpose} time`,
        `In a busy area`,
        `At a local spot`
      ]
    };
    
    res.json(fallbackSuggestions);
  }
});

// Generate opener endpoint  
app.post('/generate-opener', async (req, res) => {
  try {
    const { purpose, setting, context } = req.body;
    
    const prompt = `Generate a conversation opener for:
Purpose: ${purpose}
Setting: ${setting}
Context: ${context}

Requirements:
- Natural, respectful conversation starter
- 3 relevant follow-up questions
- Polite exit strategy
- Practical delivery tip
- Brief confidence boost message

Respond only in JSON format with fields: opener, followUps (array of 3 strings), exit, tip, confidenceBoost.`;

    const input = {
      prompt: prompt,
      system_prompt: "You are a social confidence coach. Return only valid JSON with the exact fields requested.",
      max_tokens: 400
    };

    const output = await replicate.run("openai/gpt-4o-mini", { input });
    const result = output.join('').trim();
    
    // Parse the JSON response
    const openerData = JSON.parse(result);
    
    res.json(openerData);
  } catch (error) {
    console.error('Error generating opener:', error);
    
    // Fallback opener
    const fallbackOpener = {
      opener: `Here's a conversation starter for ${purpose} in a ${setting} setting: ${context}`,
      followUps: [
        "How's your day going?",
        "Do you come here often?", 
        "What brings you here today?"
      ],
      exit: "Well, it was nice meeting you. Have a great day!",
      tip: "Make eye contact, smile naturally, and be genuinely curious about their response.",
      confidenceBoost: "Take a breath. You've got this! People appreciate genuine conversation."
    };
    
    res.json(fallbackOpener);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
