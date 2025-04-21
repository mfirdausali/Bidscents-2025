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
    const bytes = CryptoJS.AES.decrypt(encryptedMessage, SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('Error decrypting message:', error);
    // Return the encrypted message if decryption fails
    // This makes it clear to the user that something went wrong
    return `[Encrypted: ${encryptedMessage.substring(0, 10)}...]`;
  }
}

/**
 * Checks if a message is encrypted
 * This is a basic check and might need improvement for production
 * @param message The message to check
 * @returns Boolean indicating if the message appears to be encrypted
 */
export function isEncrypted(message: string): boolean {
  // A very basic check - encrypted messages from CryptoJS AES typically:
  // - Are longer than the original
  // - Contain only base64 characters
  // - Start with 'U2F'
  return message.length > 20 && /^[A-Za-z0-9+/=]+$/.test(message);
}