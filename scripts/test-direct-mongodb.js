// scripts/test-direct-mongodb.js
import 'dotenv/config';
import { connectToDatabase, disconnectFromDatabase } from '../lib/db/mongodb.js';
import mongoose from 'mongoose';

async function testDirectConnection() {
  try {
    console.log("Testing direct MongoDB connection...");
    console.log("MONGODB_URI exists:", Boolean(process.env.MONGODB_URI));
    
    if (process.env.MONGODB_URI) {
      console.log("Original connection string (masked):", 
        process.env.MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//USER:PASSWORD@'));
    }
    
    // Attempt to connect
    await connectToDatabase();
    
    // Check connection
    if (mongoose.connection.readyState === 1) {
      console.log("Connection successful!");
      
      // Show database name and collections
      const dbName = mongoose.connection.db.databaseName;
      const collections = await mongoose.connection.db.listCollections().toArray();
      
      console.log("Connected to database:", dbName);
      console.log("Available collections:", collections.map(c => c.name));
    } else {
      console.error("Connection failed, readyState:", mongoose.connection.readyState);
    }
    
    // Disconnect
    await disconnectFromDatabase();
    console.log("Disconnected successfully!");
    
  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}

testDirectConnection(); 