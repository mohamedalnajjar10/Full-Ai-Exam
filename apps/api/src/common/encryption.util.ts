import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  pbkdf2Sync,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const PBKDF2_ITERATIONS = 100_000;
// Read salt from environment; fall back to the original value so that
// any data encrypted before this change remains decryptable.
const SALT: string = process.env.ENCRYPTION_SALT ?? 'ai-exam-encryption-v1';

const derivedKeyCache = new Map<string, Buffer>();

/**
 * Derives a 32-byte key from the secret using PBKDF2 with 100k iterations.
 * Caches derived keys in memory to eliminate event loop blocking on subsequent calls.
 * The cache key includes the salt so that a salt rotation does not serve stale keys.
 */
export function deriveKey(secret: string): Buffer {
  const cacheKey = `${secret}:${SALT}`;
  let key = derivedKeyCache.get(cacheKey);
  if (!key) {
    key = pbkdf2Sync(secret, SALT, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
    derivedKeyCache.set(cacheKey, key);
  }
  return key;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a base64 string containing iv:authTag:ciphertext.
 */
export function encrypt(plaintext: string, secretKey: string): string {
  const key = deriveKey(secretKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypts a base64 string produced by `encrypt`.
 */
export function decrypt(encoded: string, secretKey: string): string {
  const key = deriveKey(secretKey);
  const data = Buffer.from(encoded, 'base64');

  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
