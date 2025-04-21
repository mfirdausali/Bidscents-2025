// This script encrypts all unencrypted messages in the database
import { db } from '../server/db';
import CryptoJS from 'crypto-js';
import { messages } from '../shared/schema';
import { eq } from 'drizzle-orm';

// Secret key for encryption (same as in encryption.ts)
const SECRET_KEY = process.env.MESSAGE_ENCRYPTION_KEY || 'BidScents-SecureMessageKey-2025';

// Encryption function (same as in encryption.ts)
function encryptMessage(message: string): string {
  try {
    return CryptoJS.AES.encrypt(message, SECRET_KEY).toString();
  } catch (error) {
    console.error('Error encrypting message:', error);
    return message;
  }
}

// Check if a message is encrypted (same as in encryption.ts)
function isEncrypted(message: string): boolean {
  try {
    return message.startsWith('U2FsdGVk') && 
           message.length > 16 && 
           /^[A-Za-z0-9+/=]+$/.test(message);
  } catch (error) {
    console.error('Error checking if message is encrypted:', error);
    return false;
  }
}

async function encryptExistingMessages() {
  console.log('Starting message encryption process...');
  
  try {
    // Fetch all messages
    const allMessages = await db.select().from(messages);
    console.log(`Found ${allMessages.length} messages in the database.`);
    
    // Filter for unencrypted messages
    const unencryptedMessages = allMessages.filter(msg => 
      msg.content && !isEncrypted(msg.content)
    );
    console.log(`Found ${unencryptedMessages.length} unencrypted messages.`);
    
    // Update each unencrypted message
    for (const message of unencryptedMessages) {
      if (!message.content) continue; // Skip empty messages
      
      const encryptedContent = encryptMessage(message.content);
      
      // Update the message in the database
      await db.update(messages)
        .set({ content: encryptedContent })
        .where(eq(messages.id, message.id));
      
      console.log(`Encrypted message id ${message.id}`);
    }
    
    console.log('Message encryption complete!');
  } catch (error) {
    console.error('Error in message encryption process:', error);
  }
}

// Run the encryption function
encryptExistingMessages().then(() => {
  console.log('Encryption script completed');
  process.exit(0);
}).catch(err => {
  console.error('Error in encryption script:', err);
  process.exit(1);
});