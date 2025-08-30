// SOCIAL COACH BACKEND - 100% SUPABASE VERSION
// ALL SQLite dependencies removed - Production ready

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

console.log('===============================================');
console.log('🚨🚨🚨 SERVER STARTING - VERSION 9.0.0-SUPABASE-COMPLETE 🚨🚨🚨');
console.log('DEPLOYMENT TIME:', new Date().toISOString());
console.log('DATABASE: 100% Supabase PostgreSQL');
console.log('SQLite: COMPLETELY ELIMINATED');
console.log('===============================================');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure Express for better connection stability
app.set('trust proxy', true);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Check Supabase configuration
if (!process.env.SUPABASE_URL) {
  console.error('❌ SUPABASE_URL environment variable is not set');
  process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY environment variable is not set');
  process.exit(1);
}

// Check AWS Bedrock configuration
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

// Check Frontend API key
if (!process.env.FRONTEND_API_KEY) {
  console.error('❌ FRONTEND_API_KEY environment variable is not set');
  console.log('⚠️  API routes will be unprotected!');
} else {
  console.log('✅ Frontend API key is configured');
}
