import crypto from 'crypto';

let encryptionKey: Buffer;

function getEncryptionKey(): Buffer {
  if (encryptionKey) return encryptionKey;

  const keyHex = process.env.ENCRYPTION_KEY;

  if (!keyHex) {
    const randomKey = crypto.randomBytes(32);
    encryptionKey = randomKey;
    console.warn(
      '[ENCRYPTION] No ENCRYPTION_KEY env var set. Using random key. ' +
      'In production, set ENCRYPTION_KEY to: ' + randomKey.toString('hex')
    );
    return encryptionKey;
  }

  try {
    encryptionKey = Buffer.from(keyHex, 'hex');
    if (encryptionKey.length !== 32) {
      throw new Error('Key must be 32 bytes (64 hex chars)');
    }
    return encryptionKey;
  } catch (err) {
    throw new Error(`Invalid ENCRYPTION_KEY: ${err.message}`);
  }
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();
  const combined = iv.toString('hex') + ':' + encrypted + ':' + authTag.toString('hex');

  return Buffer.from(combined).toString('base64');
}

export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(ciphertext, 'base64').toString('hex');
  const [ivHex, encryptedHex, authTagHex] = combined.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
