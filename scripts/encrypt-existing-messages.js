// This script encrypts all unencrypted messages in the database
import { createClient } from '@supabase/supabase-js';
import CryptoJS from 'crypto-js';

// Get environment variables from env or use values from our server/encryption.ts
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Secret key for encryption (same as in encryption.ts)
const SECRET_KEY = process.env.MESSAGE_ENCRYPTION_KEY || 'BidScents-SecureMessageKey-2025';

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

// Encryption function (same as in encryption.ts)
function encryptMessage(message) {
  try {
    return CryptoJS.AES.encrypt(message, SECRET_KEY).toString();
  } catch (error) {
    console.error('Error encrypting message:', error);
    return message;
  }
}

// Check if a message is encrypted (same as in encryption.ts)
function isEncrypted(message) {
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
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*');
    
    if (error) {
      throw error;
    }
    
    console.log(`Found ${messages.length} messages in the database.`);
    
    // Filter for unencrypted messages
    const unencryptedMessages = messages.filter(msg => !isEncrypted(msg.content));
    console.log(`Found ${unencryptedMessages.length} unencrypted messages.`);
    
    // Update each unencrypted message
    for (const message of unencryptedMessages) {
      const encryptedContent = encryptMessage(message.content);
      
      // Update the message in the database
      const { error: updateError } = await supabase
        .from('messages')
        .update({ content: encryptedContent })
        .eq('id', message.id);
      
      if (updateError) {
        console.error(`Error updating message id ${message.id}:`, updateError);
      } else {
        console.log(`Encrypted message id ${message.id}`);
      }
    }
    
    console.log('Message encryption complete!');
  } catch (error) {
    console.error('Error in message encryption process:', error);
  }
}

// Run the encryption function
encryptExistingMessages();