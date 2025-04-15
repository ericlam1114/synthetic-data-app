import mongoose from 'mongoose';
import { config } from 'dotenv';

// Load environment variables
config();

// MongoDB connection URI
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/synthetic-data';

// Connection options
const options = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
};

// Track connection status
let isConnected = false;

/**
 * Connect to MongoDB
 */
export async function connectToDatabase() {
  if (isConnected) {
    return;
  }

  try {
    const db = await mongoose.connect(MONGODB_URI, options);
    isConnected = db.connections[0].readyState === 1; // 1 = connected
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

/**
 * Disconnect from MongoDB
 */
export async function disconnectFromDatabase() {
  if (!isConnected) {
    return;
  }

  try {
    await mongoose.disconnect();
    isConnected = false;
    console.log('MongoDB disconnected successfully');
  } catch (error) {
    console.error('MongoDB disconnection error:', error);
    throw error;
  }
}

// Create a connection object
const connection = { isConnected, connectToDatabase, disconnectFromDatabase };

export default connection; 