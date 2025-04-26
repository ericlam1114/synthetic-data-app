import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // For AES GCM
const SALT_LENGTH = 64; // For PBKDF2 key derivation
const KEY_LENGTH = 32; // For AES-256
const AUTH_TAG_LENGTH = 16; // For AES GCM
const PBKDF2_ITERATIONS = 100000; // Number of iterations for key derivation

const secretKey = process.env.ENCRYPTION_KEY;

if (!secretKey || Buffer.from(secretKey, 'base64').length !== KEY_LENGTH) {
  console.error("CRITICAL: ENCRYPTION_KEY environment variable is missing or not 32 bytes (base64 encoded).");
  // In a real app, you might throw an error here to prevent startup
  // throw new Error("Encryption key is invalid or missing.");
}

// Function to derive a key from the master secret key and a salt
function deriveKey(salt) {
  if (!secretKey) throw new Error("Encryption key not configured.");
  return crypto.pbkdf2Sync(secretKey, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
}

export function encrypt(text) {
  if (!secretKey) throw new Error("Encryption key not configured.");
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = deriveKey(salt);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Store iv, salt, authTag, and encrypted data together
    const buffer = Buffer.concat([salt, iv, authTag, encrypted]);
    return buffer.toString('base64');
  } catch (error) {
    console.error("Encryption failed:", error);
    throw new Error("Encryption failed");
  }
}

export function decrypt(encryptedTextBase64) {
  if (!secretKey) throw new Error("Encryption key not configured.");
  try {
    const encryptedBuffer = Buffer.from(encryptedTextBase64, 'base64');
    
    // Extract components from the stored buffer
    const salt = encryptedBuffer.subarray(0, SALT_LENGTH);
    const iv = encryptedBuffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = encryptedBuffer.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = encryptedBuffer.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
    
    const key = deriveKey(salt);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error("Decryption failed:", error);
    // Don't leak details, just indicate failure
    // Common errors: wrong key, corrupted data, auth tag mismatch
    if (error.message.includes('Unsupported state or unable to authenticate data')) {
        throw new Error("Decryption failed: Authentication tag mismatch or corrupted data.");
    } else if (error.message.includes('Invalid key length') || error.message.includes('Invalid IV length')) {
        throw new Error("Decryption failed: Configuration error.");
    } else {
        throw new Error("Decryption failed."); 
    }
  }
} 