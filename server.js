const express = require('express');
const cors = require('cors');
const Replicate = require('replicate');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

app.use(cors());
app.use(express.json());

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

app.get('/', (req, res) => {
  res.json({ message: 'Social Coach Backend API is running!' });
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
3. Exit: Polite way to end the conversation
4. Tip: Specific advice for this exact scenario
5. Confidence Boost: Encouraging message for this situation

Return ONLY JSON with fields: opener, followUps (array of 3 strings), exit, tip, confidenceBoost`;

    const input = {
      prompt: prompt,
      system_prompt: "You create contextually perfect conversation guidance. Return only valid JSON.",
      max_tokens: 400
    };

    const output = await replicate.run("openai/gpt-4o-mini", { input });
    
    // Fix: Better handling of Replicate response
    let result;
    if (Array.isArray(output)) {
      result = output.join('').trim();
    } else if (typeof output === 'string') {
      result = output.trim();
    } else {
      result = String(output).trim();
    }
    
    console.log('Raw Replicate Response:', result);
    
    // Fix: Clean up the response before parsing
    // Remove any markdown formatting or extra characters
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
    if (!openerData.opener || !openerData.followUps || !openerData.exit || !openerData.tip || !openerData.confidenceBoost) {
      throw new Error('Invalid response format from AI');
    }
    
    res.json(openerData);
    
  } catch (error) {
    console.error('Error generating opener:', error);
    console.error('Error details:', error.message);
    
    // Return a fallback response instead of failing
    const fallbackOpener = {
      opener: `Hi! I noticed you're in this ${req.body.setting || 'social'} setting. How's your day going?`,
      followUps: [
        "What brings you here today?",
        "Do you come here often?",
        "How are you finding this place?"
      ],
      exit: "It was great talking with you! Have a wonderful day!",
      tip: `In ${req.body.setting || 'social'} settings, keep the conversation light and friendly.`,
      confidenceBoost: "You're doing great by taking the initiative to connect with others!"
    };
    
    // Log the error but return fallback instead of 500
    console.log('Returning fallback opener due to error');
    res.json(fallbackOpener);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
