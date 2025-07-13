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

app.get('/', (req, res) => {
  res.json({ message: 'Social Coach Backend API is running!' });
});

app.post('/generate-suggestions', async (req, res) => {
  try {
    const { purpose, setting } = req.body;
    console.log('Received suggestions request:', { purpose, setting });
    
    const prompt = `Generate 4 creative, specific location suggestions for someone with ${purpose} intentions in ${setting} environments.

Purpose: ${purpose}
Setting: ${setting}

Create NOVEL, interesting suggestions that people wouldn't immediately think of but make perfect sense for this combination. Avoid obvious/generic locations.

Examples of SMART suggestions:
- Romantic + Active: "Rock climbing gym", "Morning hiking trail", "Beach volleyball pickup", "Outdoor fitness bootcamp"
- Professional + Quiet: "University research library", "Co-working cafe corner", "Business hotel lobby", "Museum member lounge"  
- Casual + Social: "Trivia night", "Food truck festival", "Dog park gathering", "Community art class"
- Romantic + Everyday: "Farmer's market", "Laundromat", "Bookstore poetry section", "Coffee roastery tour"

Make each suggestion:
- 3-5 words maximum
- Specific and actionable
- Novel but realistic
- Perfect for the purpose + setting combo

Return ONLY a JSON array of 4 location strings.`;

    const input = {
      prompt: prompt,
      system_prompt: "You generate creative, contextually perfect location suggestions. Return only valid JSON array.",
      max_tokens: 150
    };

    const output = await replicate.run("openai/gpt-4o-mini", { input });
    const result = output.join('').trim();
    console.log('Suggestions API Response:', result);
    
    const suggestions = JSON.parse(result);
    res.json({ suggestions });
    
  } catch (error) {
    console.error('Error generating suggestions:', error);
    res.status(500).json({ 
      error: 'Failed to generate suggestions', 
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
    
    const prompt = `Create a conversation opener specifically for:

**Situation:**
- Purpose: ${purpose}
- Setting: ${setting}  
- Context: ${contextText}

Generate a complete conversation guide that perfectly matches this exact scenario:

1. **Opener**: Natural conversation starter for someone with ${purpose} intentions in this specific situation
2. **Follow-ups**: 3 questions that flow naturally and match the purpose/setting/context
3. **Exit**: Polite way to end the conversation that respects the environment and situation
4. **Tip**: Specific behavioral advice for this exact combination of purpose + setting + context
5. **Confidence Boost**: Encouraging message tailored to this specific social scenario

Everything must be contextually perfect for ${purpose} intentions in ${setting} setting at/during "${contextText}".

Return ONLY JSON with fields: opener, followUps (array of 3 strings), exit, tip, confidenceBoost`;

    const input = {
      prompt: prompt,
      system_prompt: "You create contextually perfect conversation guidance. Return only valid JSON.",
      max_tokens: 500
    };

    const output = await replicate.run("openai/gpt-4o-mini", { input });
    const result = output.join('').trim();
    console.log('Opener API Response:', result);
    
    const openerData = JSON.parse(result);
    res.json(openerData);
    
  } catch (error) {
    console.error('Error generating opener:', error);
    res.status(500).json({ 
      error: 'Failed to generate opener', 
      details: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
