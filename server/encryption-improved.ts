import crypto from 'crypto';

interface EncryptedData {
  iv: string;
  authTag: string;
  data: string;
  version: number;
}

class MessageEncryption {
  private readonly algorithm = 'aes-256-gcm';
  private readonly currentVersion = 1;
  private readonly keyRotationInterval = 90 * 24 * 60 * 60 * 1000; // 90 days
  
  private getKey(version: number = this.currentVersion): Buffer {
    const baseKey = process.env.MESSAGE_ENCRYPTION_KEY;
    if (!baseKey) {
      throw new Error('MESSAGE_ENCRYPTION_KEY not configured');
    }
    
    // Derive version-specific key using HKDF
    const salt = Buffer.from(`v${version}`, 'utf8');
    return crypto.pbkdf2Sync(baseKey, salt, 100000, 32, 'sha256');
  }
  
  encrypt(plaintext: string): string {
    try {
      const key = this.getKey();
      const iv = crypto.randomBytes(16);
      
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      
      let encrypted = cipher.update(plaintext, 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      const authTag = cipher.getAuthTag();
      
      const result: EncryptedData = {
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        data: encrypted.toString('base64'),
        version: this.currentVersion
      };
      
      return Buffer.from(JSON.stringify(result)).toString('base64');
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt message');
    }
  }
  
  decrypt(encryptedText: string): string {
    try {
      const encryptedData: EncryptedData = JSON.parse(
        Buffer.from(encryptedText, 'base64').toString('utf8')
      );
      
      const key = this.getKey(encryptedData.version);
      const iv = Buffer.from(encryptedData.iv, 'base64');
      const authTag = Buffer.from(encryptedData.authTag, 'base64');
      const encrypted = Buffer.from(encryptedData.data, 'base64');
      
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt message');
    }
  }
  
  isEncrypted(text: string): boolean {
    try {
      const data = JSON.parse(Buffer.from(text, 'base64').toString('utf8'));
      return data.version !== undefined && data.iv !== undefined && data.authTag !== undefined;
    } catch {
      return false;
    }
  }
}

export const messageEncryption = new MessageEncryption();
export const encryptMessage = (msg: string) => messageEncryption.encrypt(msg);
export const decryptMessage = (msg: string) => messageEncryption.decrypt(msg);
export const isEncrypted = (msg: string) => messageEncryption.isEncrypted(msg);