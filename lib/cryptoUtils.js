import crypto from 'crypto';

// Ensure you have a strong, unique secret stored in your environment variables
// Example: Generate with `openssl rand -base64 32`
const ENCRYPTION_SECRET = process.env.FIREWORKS_ENCRYPTION_SECRET; 
const ALGORITHM = 'aes-256-cbc'; // Using AES-256-CBC algorithm
const IV_LENGTH = 16; // For AES, this is always 16

if (!ENCRYPTION_SECRET || ENCRYPTION_SECRET.length < 32) {
  throw new Error('FIREWORKS_ENCRYPTION_SECRET environment variable is missing or too short (must be at least 32 characters).');
}

// Ensure the secret key is the correct length for aes-256-cbc (32 bytes)
const key = crypto.createHash('sha256').update(String(ENCRYPTION_SECRET)).digest('base64').substr(0, 32);

/**
 * Encrypts a text string.
 * @param {string} text - The text to encrypt.
 * @returns {string} - The encrypted text, formatted as 'iv:encryptedData'.
 */
export function encrypt(text) {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    // Return IV and encrypted data together, separated by a colon
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (error) {
    console.error("Encryption failed:", error);
    throw new Error("Encryption process failed.");
  }
}

/**
 * Decrypts a text string.
 * @param {string} text - The encrypted text ('iv:encryptedData').
 * @returns {string} - The decrypted text.
 */
export function decrypt(text) {
  try {
    const textParts = text.split(':');
    if (textParts.length !== 2) {
        throw new Error("Invalid encrypted text format. Expected 'iv:encryptedData'.");
    }
    const iv = Buffer.from(textParts[0], 'hex');
     if (iv.length !== IV_LENGTH) {
         throw new Error(`Invalid IV length. Expected ${IV_LENGTH} bytes, got ${iv.length}.`);
     }
    const encryptedText = Buffer.from(textParts[1], 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
     console.error("Decryption failed:", error);
     // Avoid leaking detailed crypto errors to the user if this were client-facing
     // For server-side logs, the detailed error is fine.
     if (error.message.includes('Invalid IV length') || error.message.includes('Invalid encrypted text format')) {
         throw error; // Re-throw format errors
     }
      if (error.code === 'ERR_OSSL_BAD_DECRYPT' || error.message.includes('bad decrypt')) {
          console.error("Decryption failed potentially due to wrong key or corrupted data.");
          throw new Error("Decryption failed. Check encryption key or data integrity.");
       }
     throw new Error("Decryption process failed."); 
  }
}

// Optional: Add a function to hash data if needed elsewhere, 
// but for API keys, reversible encryption is required.
// export function hashData(data) {
//   return crypto.createHash('sha256').update(data).digest('hex');
// } 