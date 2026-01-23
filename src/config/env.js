// Environment configuration
const dotenv = require('dotenv');

dotenv.config();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3001,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_ANON_KEY,
  terra: {
    apiKey: process.env.TERRA_API_KEY,
    devId: process.env.TERRA_DEV_ID,
    webhookSecret: process.env.TERRA_WEBHOOK_SECRET,
  },
  openaiApiKey: process.env.OPENAI_API_KEY,
};

module.exports = { env };
