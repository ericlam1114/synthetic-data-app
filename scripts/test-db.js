// scripts/test-db.js
import 'dotenv/config';
import mongoose from 'mongoose';

// Log environment variables (redacted)
console.log("Environment variables loaded:", Object.keys(process.env));
console.log("MONGODB_URI exists:", Boolean(process.env.MONGODB_URI));

// MongoDB connection URI
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ericlam1114:levi2021@cluster0.lv8rdj.mongodb.net/synthetic-data?retryWrites=true&w=majority&appName=Cluster0';

// Connect to MongoDB
async function testConnection() {
  try {
    console.log("Attempting to connect to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB connected successfully');
    
    // List all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));
    
    // Disconnect
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
  }
}

testConnection(); 