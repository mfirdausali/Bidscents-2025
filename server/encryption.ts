import CryptoJS from 'crypto-js';

// Secret key for encryption/decryption - in production, this should be stored in environment variables
const SECRET_KEY = process.env.MESSAGE_ENCRYPTION_KEY || 'BidScents-SecureMessageKey-2025';

/**
 * Encrypts a message using AES encryption
 * @param message The plain text message to encrypt
 * @returns The encrypted message as a string
 */
export function encryptMessage(message: string): string {
  try {
    return CryptoJS.AES.encrypt(message, SECRET_KEY).toString();
  } catch (error) {
    console.error('Error encrypting message:', error);
    // Return original message if encryption fails (with warning in logs)
    // In production, you might want to handle this differently
    return message;
  }
}

/**
 * Decrypts an encrypted message
 * @param encryptedMessage The encrypted message string
 * @returns The decrypted plain text message
 */
export function decryptMessage(encryptedMessage: string): string {
  try {
    // Only attempt to decrypt if it matches our encryption pattern
    if (isEncrypted(encryptedMessage)) {
      const bytes = CryptoJS.AES.decrypt(encryptedMessage, SECRET_KEY);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      
      // A successful decryption should yield a non-empty string
      if (decrypted && decrypted.length > 0) {
        return decrypted;
      }
      
      // If we get an empty string, decryption likely failed
      console.warn('Decryption resulted in empty string:', encryptedMessage.substring(0, 20) + '...');
      return encryptedMessage; // Return original if decryption fails
    }
    
    // If it doesn't match our encryption pattern, return as is
    return encryptedMessage;
  } catch (error) {
    console.error('Error decrypting message:', error);
    // Return the original message if decryption fails
    return encryptedMessage;
  }
}

/**
 * Checks if a message is encrypted
 * @param message The message to check
 * @returns Boolean indicating if the message appears to be encrypted
 */
export function isEncrypted(message: string): boolean {
  try {
    // Use a more robust method to detect encrypted messages
    // CryptoJS AES encrypted strings:
    // - Always start with 'U2FsdGVk' (which is 'Salted' in base64)
    // - Are always longer than 16 characters
    // - Consist only of valid base64 characters
    return message.startsWith('U2FsdGVk') && 
           message.length > 16 && 
           /^[A-Za-z0-9+/=]+$/.test(message);
  } catch (error) {
    console.error('Error checking if message is encrypted:', error);
    return false;
  }
}