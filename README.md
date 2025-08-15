# Social Coach Backend

Backend API for the Social Coach iOS app. Generates conversation openers and quick suggestions using Replicate AI.

## Documentation
- [Social Zone & Social Confidence Product Spec](./PRODUCT_SPEC.md) - Detailed specification for the streak and zone system

## Endpoints

### Generate Quick Suggestions
POST /generate-suggestions
Body: { "purpose": "romantic", "setting": "quiet" }
Response: { "suggestions": ["suggestion1", "suggestion2", ...] }

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
