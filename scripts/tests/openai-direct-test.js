#!/usr/bin/env node
// Direct test of OpenAI API connection
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { setTimeout } from 'timers/promises';

// Try to load environment variables from .env.local
const envFilePath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envFilePath)) {
  console.log('Loading environment variables from .env.local...');
  const envFile = fs.readFileSync(envFilePath, 'utf8');
  const envVars = envFile.split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .reduce((vars, line) => {
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim();
      if (key && value) {
        vars[key.trim()] = value;
      }
      return vars;
    }, {});
  
  // Set OPENAI_API_KEY if found
  if (envVars['OPENAI_API_KEY'] && !process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = envVars['OPENAI_API_KEY'];
    console.log('Loaded OPENAI_API_KEY from .env.local');
  }
}

if (!process.env.OPENAI_API_KEY) {
  console.error('❌ ERROR: OPENAI_API_KEY is not set. Please set it in your .env.local file.');
  process.exit(1);
}

console.log('=== DIRECT OPENAI API TEST ===');
console.log('Testing direct connection to OpenAI API...\n');

async function testOpenAI() {
  try {
    // Explicitly check for a valid API key format
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || !apiKey.startsWith('sk-')) {
      console.error(`❌ Invalid OpenAI API key format: ${apiKey ? apiKey.substring(0, 5) + '...' : 'undefined'}`);
      console.error('API key should start with "sk-"');
      return false;
    }
    
    console.log('API key format looks valid (starts with sk-)');
    
    // Simple completion request
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say "The OpenAI API is working!"' }],
        max_tokens: 50
      })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('\n✅ SUCCESS! OpenAI API connection is working.');
      console.log('Response from OpenAI:');
      console.log(result.choices[0].message.content);
      return true;
    } else {
      console.error('\n❌ OpenAI API returned an error:');
      console.error(result.error ? result.error : JSON.stringify(result, null, 2));
      
      // Common error handling
      if (result.error?.type === 'invalid_request_error') {
        console.error('\nPossible reasons:');
        console.error('- Invalid API key');
        console.error('- Specified model may not exist or you may not have access to it');
      } else if (result.error?.type === 'insufficient_quota') {
        console.error('\nYour account has insufficient quota. Your monthly limit has been reached or your balance is depleted.');
      }
      
      return false;
    }
  } catch (error) {
    console.error('\n❌ Error connecting to OpenAI API:');
    console.error(error);
    return false;
  }
}

// Check for current date
console.log(`Current date: ${new Date().toLocaleString()}`);

// Run the test
const success = await testOpenAI();

if (success) {
  console.log('\n✅ OpenAI API TEST PASSED');
  console.log('Your OpenAI integration is working correctly!');
} else {
  console.error('\n❌ OpenAI API TEST FAILED');
  console.error('Check the error messages above for troubleshooting.');
}

// Exit with appropriate code
process.exit(success ? 0 : 1); 