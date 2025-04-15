#!/usr/bin/env node
// Test MongoDB connection and diagnose issues
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import dns from 'dns';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { exec } from 'child_process';

// Promisify DNS methods
const dnsLookup = promisify(dns.lookup);
const dnsResolve = promisify(dns.resolve);
const execPromise = promisify(exec);

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
  
  // Set MONGODB_URI if found
  if (envVars['MONGODB_URI'] && !process.env.MONGODB_URI) {
    process.env.MONGODB_URI = envVars['MONGODB_URI'];
    console.log('Loaded MONGODB_URI from .env.local');
  }
}

// Parse MongoDB URI to extract hostname
function parseMongoURI(uri) {
  try {
    const match = uri.match(/mongodb(\+srv)?:\/\/([^:]+):([^@]+)@([^\/]+)(?:\/([^?]+))?/);
    if (match) {
      const [, isSrv, username, password, hostname, database] = match;
      return {
        isSrv: !!isSrv,
        username,
        password: password.substring(0, 3) + '***',
        hostname,
        database,
        uri: uri.replace(password, '****')
      };
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Test DNS resolution
async function testDNS(hostname) {
  console.log(`\n🔍 Testing DNS resolution for ${hostname}...`);
  
  try {
    // Regular DNS lookup
    const lookupResult = await dnsLookup(hostname);
    console.log(`✅ DNS lookup successful: ${hostname} -> ${lookupResult.address}`);
  } catch (error) {
    console.error(`❌ DNS lookup failed: ${error.message}`);
  }
  
  // For SRV records
  if (hostname.includes('.mongodb.net')) {
    const srvHostname = `_mongodb._tcp.${hostname}`;
    try {
      console.log(`\n🔍 Testing SRV record resolution for ${srvHostname}...`);
      const srvRecords = await dnsResolve(srvHostname, 'SRV');
      console.log('✅ SRV records found:');
      srvRecords.forEach(record => {
        console.log(`   - Priority: ${record.priority}, Weight: ${record.weight}, Port: ${record.port}, Target: ${record.name}`);
      });
    } catch (error) {
      console.error(`❌ SRV record resolution failed: ${error.message}`);
      console.log('\n⚠️ This error might indicate:');
      console.log('   1. Network connectivity issues');
      console.log('   2. DNS resolution problems');
      console.log('   3. Firewall blocking DNS resolution');
      console.log('   4. The MongoDB Atlas cluster might no longer exist or was renamed');
    }
  }
}

// Test network connectivity
async function testNetworkConnectivity(hostname) {
  console.log(`\n🔍 Testing network connectivity to ${hostname}...`);
  
  try {
    // Use ping to test connectivity (works on most systems)
    const { stdout } = await execPromise(`ping -c 3 ${hostname}`);
    console.log('✅ Network connectivity test (ping) successful:');
    const lines = stdout.split('\n').filter(line => line.includes('time='));
    lines.forEach(line => console.log(`   ${line.trim()}`));
  } catch (error) {
    console.error('❌ Network connectivity test failed:');
    console.error(`   ${error.message.split('\n')[0]}`);
  }
}

// Set a timeout for MongoDB connection
function connectWithTimeout(uri, options, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const client = new MongoClient(uri, options);
    
    // Set a timeout
    const timeout = setTimeout(() => {
      reject(new Error(`Connection timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    
    // Attempt to connect
    client.connect()
      .then(client => {
        clearTimeout(timeout);
        resolve(client);
      })
      .catch(error => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

// Test MongoDB connection
async function testMongoDBConnection() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI environment variable is not set');
    return false;
  }
  
  const parsedURI = parseMongoURI(process.env.MONGODB_URI);
  if (!parsedURI) {
    console.error('❌ Failed to parse MongoDB URI. Please check the format.');
    return false;
  }
  
  console.log('\n=== MongoDB Connection Test ===');
  console.log(`URI: ${parsedURI.uri}`);
  console.log(`Username: ${parsedURI.username}`);
  console.log(`Using SRV record: ${parsedURI.isSrv ? 'Yes' : 'No'}`);
  console.log(`Hostname: ${parsedURI.hostname}`);
  console.log(`Database: ${parsedURI.database || 'default'}`);
  
  // Test DNS resolution
  await testDNS(parsedURI.hostname);
  
  // Test network connectivity
  await testNetworkConnectivity(parsedURI.hostname);
  
  // Test actual connection
  console.log('\n🔍 Testing MongoDB connection...');
  
  try {
    // Set connection options with reasonable timeouts
    const options = {
      serverSelectionTimeoutMS: 5000,  // 5 seconds
      connectTimeoutMS: 10000,         // 10 seconds
      socketTimeoutMS: 45000           // 45 seconds
    };
    
    // Attempt to connect
    const client = await connectWithTimeout(process.env.MONGODB_URI, options);
    
    // Test the connection by executing a simple command
    const admin = client.db().admin();
    const { version, modules } = await admin.serverInfo();
    
    console.log('✅ MongoDB connection successful!');
    console.log(`MongoDB version: ${version}`);
    console.log(`Modules: ${modules ? modules.join(', ') : 'none'}`);
    
    // List databases
    const dbs = await admin.listDatabases();
    console.log('\nAvailable databases:');
    dbs.databases.forEach(db => {
      console.log(`- ${db.name} (${Math.round(db.sizeOnDisk / 1024 / 1024)}MB)`);
    });
    
    // Close the connection
    await client.close();
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection failed:');
    console.error(`   ${error.message}`);
    
    if (error.message.includes('querySrv ENOTFOUND') || error.message.includes('ENOTFOUND')) {
      console.log('\n⚠️ DNS resolution issue detected:');
      console.log('1. Check your internet connection');
      console.log('2. Ensure your DNS server is working properly');
      console.log('3. Try using a different network (e.g., disable VPN if you\'re using one)');
      console.log('4. Check if the MongoDB Atlas cluster still exists');
      console.log('5. Try using a direct connection string without SRV if available');
    } else if (error.message.includes('Authentication failed')) {
      console.log('\n⚠️ Authentication issue detected:');
      console.log('1. Verify username and password in your connection string');
      console.log('2. Check if the database user still exists');
      console.log('3. Ensure the user has the necessary permissions');
    } else if (error.message.includes('timed out')) {
      console.log('\n⚠️ Connection timeout issue detected:');
      console.log('1. Check your network connectivity');
      console.log('2. Verify if there are any firewall rules blocking the connection');
      console.log('3. MongoDB Atlas might be experiencing issues');
    }
    
    return false;
  }
}

// Ask to fix the connection string
async function askToFixConnectionString() {
  console.log('\n🔧 Would you like to try a different MongoDB connection string? (y/n)');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const answer = await new Promise(resolve => {
    rl.question('> ', resolve);
  });
  
  if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
    console.log('\nEnter a new MongoDB connection string:');
    const newUri = await new Promise(resolve => {
      rl.question('> ', resolve);
    });
    
    if (newUri && newUri.trim()) {
      // Update the environment variable
      process.env.MONGODB_URI = newUri.trim();
      
      // Try to update .env.local
      if (fs.existsSync(envFilePath)) {
        let envContent = fs.readFileSync(envFilePath, 'utf8');
        if (envContent.includes('MONGODB_URI=')) {
          // Replace existing MONGODB_URI
          envContent = envContent.replace(/MONGODB_URI=.*/g, `MONGODB_URI=${newUri.trim()}`);
        } else {
          // Add new MONGODB_URI
          envContent += `\nMONGODB_URI=${newUri.trim()}`;
        }
        
        // Write back to .env.local
        fs.writeFileSync(envFilePath, envContent);
        console.log('Updated MONGODB_URI in .env.local');
      }
      
      // Test again
      console.log('\nTesting with new connection string...');
      return await testMongoDBConnection();
    }
  }
  
  rl.close();
  return false;
}

// Main function
async function main() {
  console.log('=== MongoDB CONNECTION DIAGNOSTICS ===');
  
  // Test MongoDB connection
  let connectionSuccess = await testMongoDBConnection();
  
  // If connection failed, ask to fix
  if (!connectionSuccess) {
    connectionSuccess = await askToFixConnectionString();
  }
  
  console.log('\n=== DIAGNOSTICS SUMMARY ===');
  if (connectionSuccess) {
    console.log('✅ MongoDB connection is working correctly.');
    console.log('\nYour application should now be able to connect to MongoDB.');
  } else {
    console.log('❌ MongoDB connection is still not working.');
    console.log('\nSuggested steps:');
    console.log('1. Check network connectivity');
    console.log('2. Verify MongoDB Atlas account and cluster status');
    console.log('3. Create a new database user if necessary');
    console.log('4. Update your .env.local file with the correct connection string');
  }
  
  process.exit(connectionSuccess ? 0 : 1);
}

// Run the main function
main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
}); 