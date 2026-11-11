import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'crypto';
import { Role } from '@prisma/client';

export interface DeviceTrustPayload {
  sub: string; // parent userId
  phone: string; // standardized parent phone
  role: Role; // PARENT
  iat: number; // issued at ms
  exp: number; // expires at ms (60 days)
  jti: string; // unique random identifier
}

/**
 * Normalizes an incoming phone number into standard Palestinian mobile format (+970).
 * Strips formatting characters (spaces, dashes, parentheses).
 * Strictly requires mobile numbers starting with 056 (Ooredoo) or 059 (Jawwal).
 */
export function normalizePhoneNumber(rawPhone: string): string {
  if (!rawPhone || typeof rawPhone !== 'string') {
    throw new BadRequestException('Phone number is required');
  }

  // Remove spaces, dashes, dots, parentheses
  let cleaned = rawPhone.replace(/[\s\-().]/g, '').trim();

  // Convert international prefix 00 to +
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2);
  }

  // Handle international formats (+970 or +972)
  if (cleaned.startsWith('+970') || cleaned.startsWith('+972')) {
    const nationalPart = cleaned.slice(4);
    if (!nationalPart.startsWith('56') && !nationalPart.startsWith('59')) {
      throw new BadRequestException(
        'رقم الهاتف غير صالح. يجب أن يبدأ الرقم بـ 056 أو 059 فقط (مثال: 0591234567 أو 0561234567).',
      );
    }
    cleaned = '+970' + nationalPart;
  } else if (/^0(56|59)\d{7}$/.test(cleaned)) {
    // Standard local 10-digit number: 056xxxxxxx or 059xxxxxxx
    cleaned = '+970' + cleaned.slice(1);
  } else if (/^(56|59)\d{7}$/.test(cleaned)) {
    // 9-digit without leading 0: 56xxxxxxx or 59xxxxxxx
    cleaned = '+970' + cleaned;
  } else {
    throw new BadRequestException(
      'رقم الهاتف غير صالح. يجب أن يبدأ الرقم بـ 056 أو 059 ويتكون من 10 أرقام (مثال: 0591234567 أو 0561234567).',
    );
  }

  // Final validation: Must be exactly +97056xxxxxxx or +97059xxxxxxx
  if (!/^\+970(56|59)\d{7}$/.test(cleaned)) {
    throw new BadRequestException(
      'رقم الهاتف غير صالح. يجب أن يبدأ الرقم بـ 056 أو 059 ويتكون من 10 أرقام (مثال: 0591234567 أو 0561234567).',
    );
  }

  return cleaned;
}

/**
 * Derives an internal virtual email for backward compatibility with User table:
 * parent.{phoneDigits}@family.masar.local
 */
export function deriveVirtualEmail(normalizedPhone: string): string {
  const digitsOnly = normalizedPhone.replace(/\D/g, '');
  return `parent.${digitsOnly}@family.masar.local`;
}

/**
 * Masks a phone number for safe audit logging and privacy preservation (PRV-01).
 * E.g., "+970591234567" -> "+970***4567"
 */
export function maskPhoneNumber(phone: string): string {
  if (!phone || typeof phone !== 'string') return '***';
  if (phone.length <= 4) return '***';
  const prefix = phone.startsWith('+970')
    ? '+970***'
    : phone.startsWith('0')
      ? '0***'
      : '***';
  return prefix + phone.slice(-4);
}

/**
 * Generates a cryptographically secure 6-digit Family PIN.
 */
export function generateFamilyPin(): string {
  return randomInt(100000, 1000000).toString();
}

/**
 * Generates a 32-byte (64-character hex) random magic token.
 */
export function generateMagicToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Computes a SHA-256 hash of a magic token for fast, indexable database lookup.
 */
export function hashMagicToken(magicToken: string): string {
  return createHash('sha256').update(magicToken).digest('hex');
}

/**
 * Performs a constant-time comparison between two strings to prevent timing attacks.
 */
export function safeCompareStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Equalize timing even if lengths mismatch
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Derives a 32-byte AES-256 encryption key from a secret string.
 */
function deriveEncryptionKey(secret: string): Buffer {
  return createHash('sha256')
    .update(secret + ':masar:parent:device-trust:v1')
    .digest();
}

/**
 * Encrypts a device trust payload into a tamper-evident AES-256-GCM token.
 * Valid for 60 days. Format: iv.authTag.ciphertext (Base64URL encoded).
 */
export function encryptDeviceTrustToken(
  payload: DeviceTrustPayload,
  secret: string,
): string {
  const key = deriveEncryptionKey(secret);
  const iv = randomBytes(12); // Standard 96-bit IV for AES-GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64url')}.${authTag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

/**
 * Decrypts and validates an AES-256-GCM device trust token.
 * Throws UnauthorizedException on tamper, format mismatch, or expiration.
 */
export function decryptDeviceTrustToken(
  token: string,
  secret: string,
): DeviceTrustPayload {
  if (!token || typeof token !== 'string') {
    throw new UnauthorizedException('Missing or invalid device trust token');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new UnauthorizedException('Malformed device trust token format');
  }

  const [ivB64, authTagB64, ciphertextB64] = parts;

  try {
    const key = deriveEncryptionKey(secret);
    const iv = Buffer.from(ivB64, 'base64url');
    const authTag = Buffer.from(authTagB64, 'base64url');
    const ciphertext = Buffer.from(ciphertextB64, 'base64url');

    if (iv.length !== 12 || authTag.length !== 16) {
      throw new Error('Invalid IV or auth tag length');
    }

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');

    const payload = JSON.parse(decrypted) as DeviceTrustPayload;

    if (
      !payload.sub ||
      payload.role !== Role.PARENT ||
      !payload.exp ||
      typeof payload.exp !== 'number'
    ) {
      throw new Error('Invalid payload claims');
    }

    if (Date.now() > payload.exp) {
      throw new UnauthorizedException('Device trust token has expired');
    }

    return payload;
  } catch (err: unknown) {
    if (err instanceof UnauthorizedException) {
      throw err;
    }
    throw new UnauthorizedException(
      'Invalid, tampered, or expired device trust token',
    );
  }
}
