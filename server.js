const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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
    
    // TODO: Add Replicate API call here
    // For now, return mock data
    const mockSuggestions = {
      suggestions: [
        `At a ${setting} place`,
        `During ${purpose} time`,
        `In a busy area`,
        `At a local spot`
      ]
    };
    
    res.json(mockSuggestions);
  } catch (error) {
    console.error('Error generating suggestions:', error);
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
});

// Generate opener endpoint  
app.post('/generate-opener', async (req, res) => {
  try {
    const { purpose, setting, context } = req.body;
    
    // TODO: Add Replicate API call here
    // For now, return mock data
    const mockOpener = {
      opener: `Mock opener for ${purpose} in ${setting} setting at ${context}`,
      followUps: [
        "Mock follow-up question 1?",
        "Mock follow-up question 2?", 
        "Mock follow-up question 3?"
      ],
      exit: "Mock graceful exit line.",
      tip: "Mock tip for this situation.",
      confidenceBoost: "Mock confidence boost message!"
    };
    
    res.json(mockOpener);
  } catch (error) {
    console.error('Error generating opener:', error);
    res.status(500).json({ error: 'Failed to generate opener' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
