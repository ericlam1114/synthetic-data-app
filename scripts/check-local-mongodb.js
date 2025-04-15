// scripts/check-local-mongodb.js
import mongoose from 'mongoose';

async function checkLocalMongoDB() {
  try {
    console.log('Attempting to connect to local MongoDB...');
    const uri = 'mongodb://localhost:27017/synthetic-data';
    
    // Connect to MongoDB
    const connection = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    
    console.log('MongoDB connected successfully');
    
    // Check database and collections
    const db = connection.connection.db;
    const collections = await db.listCollections().toArray();
    
    console.log('Connected to database:', db.databaseName);
    console.log('Available collections:', collections.map(c => c.name));
    
    // Create a test collection if none exist
    if (collections.length === 0) {
      console.log('No collections found, creating a test collection...');
      await db.createCollection('test');
      console.log('Test collection created');
    }
    
    // Disconnect
    await mongoose.disconnect();
    console.log('MongoDB disconnected successfully');
    
  } catch (error) {
    console.error('MongoDB connection error:', error);
  } finally {
    process.exit(0);
  }
}

checkLocalMongoDB(); 