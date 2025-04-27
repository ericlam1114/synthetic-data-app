import mongoose from 'mongoose';

// MongoDB connection options
const CONNECTION_OPTIONS = {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
};

// MongoDB URIs
const LOCAL_MONGODB_URI = 'mongodb://localhost:27017/synthetic-data';
const CONFIGURED_URI = process.env.MONGODB_URI;

// Get the best available MongoDB URI
function getBestConnectionUri() {
  // Check if we have a configured URI from env vars
  if (CONFIGURED_URI) {
    console.log('Using configured MongoDB URI from environment');
    return CONFIGURED_URI;
  }
  
  // Otherwise, use local MongoDB
  console.log('Using local MongoDB URI');
  return LOCAL_MONGODB_URI;
}

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
    console.log('Attempting to connect to MongoDB...');
    
    // Try to connect to configured URI first
    let uri = getBestConnectionUri();
    let error = null;
    
    try {
      const db = await mongoose.connect(uri, CONNECTION_OPTIONS);
      isConnected = db.connections[0].readyState === 1; // 1 = connected
      
      if (isConnected) {
        console.log('MongoDB connected successfully');
        return;
      }
    } catch (err) {
      error = err;
      console.warn('Failed to connect using primary URI:', err.message);
      
      // If we were using the configured URI and it failed, try local
      if (uri !== LOCAL_MONGODB_URI) {
        console.log('Trying local MongoDB as fallback...');
        uri = LOCAL_MONGODB_URI;
        
        try {
          const db = await mongoose.connect(uri, CONNECTION_OPTIONS);
          isConnected = db.connections[0].readyState === 1; // 1 = connected
          
          if (isConnected) {
            console.log('MongoDB connected successfully using local fallback');
            return;
          }
        } catch (localErr) {
          console.error('Failed to connect to local MongoDB:', localErr.message);
          throw error; // Throw the original error as it's likely more informative
        }
      } else {
        throw error;
      }
    }
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