// scripts/test-mongodb-connection.js
import { connectToDatabase, disconnectFromDatabase } from '../lib/db/mongodb.js';
import mongoose from 'mongoose';

async function testMongoDBConnection() {
  try {
    console.log('Testing MongoDB connection from lib/db/mongodb.js...');
    console.log('MongoDB URI from env:', process.env.MONGODB_URI);
    
    // Test connection
    await connectToDatabase();
    console.log('Connection test successful!');
    
    // Show database info
    const dbName = mongoose.connection.name;
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    console.log('Connected to database:', dbName);
    console.log('Available collections:', collections.map(c => c.name));
    
    // Test disconnection
    await disconnectFromDatabase();
    console.log('Disconnection test successful!');
    
    process.exit(0);
  } catch (error) {
    console.error('Connection test failed:', error);
    process.exit(1);
  }
}

console.log('Starting MongoDB connection test...');
testMongoDBConnection(); 