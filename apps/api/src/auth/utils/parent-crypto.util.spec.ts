import {
  normalizePhoneNumber,
  maskPhoneNumber,
  deriveVirtualEmail,
  generateFamilyPin,
  generateMagicToken,
  hashMagicToken,
  safeCompareStrings,
  encryptDeviceTrustToken,
  decryptDeviceTrustToken,
  DeviceTrustPayload,
} from './parent-crypto.util';
import { Role } from '@prisma/client';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';

describe('parent-crypto.util', () => {
  const secret = 'test-secret-key-for-aes-256-gcm-masar';

  describe('normalizePhoneNumber', () => {
    it('normalizes local Palestinian Jawwal numbers starting with 059', () => {
      expect(normalizePhoneNumber('0591234567')).toBe('+970591234567');
      expect(normalizePhoneNumber('059 123 4567')).toBe('+970591234567');
      expect(normalizePhoneNumber('059-123-4567')).toBe('+970591234567');
    });

    it('normalizes local Palestinian Ooredoo numbers starting with 056', () => {
      expect(normalizePhoneNumber('0561234567')).toBe('+970561234567');
      expect(normalizePhoneNumber('056 123 4567')).toBe('+970561234567');
      expect(normalizePhoneNumber('056-123-4567')).toBe('+970561234567');
    });

    it('normalizes numbers starting with 59 or 56 without leading zero', () => {
      expect(normalizePhoneNumber('591234567')).toBe('+970591234567');
      expect(normalizePhoneNumber('561234567')).toBe('+970561234567');
    });

    it('normalizes international numbers with 00 or + for 059 and 056', () => {
      expect(normalizePhoneNumber('00970591234567')).toBe('+970591234567');
      expect(normalizePhoneNumber('+970561234567')).toBe('+970561234567');
      expect(normalizePhoneNumber('+972591234567')).toBe('+970591234567');
    });

    it('rejects numbers that do not start with 056 or 059 (including +966)', () => {
      expect(() => normalizePhoneNumber('+966501234567')).toThrow(
        BadRequestException,
      );
      expect(() => normalizePhoneNumber('0501234567')).toThrow(
        BadRequestException,
      );
      expect(() => normalizePhoneNumber('0521234567')).toThrow(
        BadRequestException,
      );
      expect(() => normalizePhoneNumber('123')).toThrow(BadRequestException);
      expect(() => normalizePhoneNumber('abc')).toThrow(BadRequestException);
      expect(() => normalizePhoneNumber('')).toThrow(BadRequestException);
    });
  });

  describe('deriveVirtualEmail', () => {
    it('generates an internal virtual email containing the phone digits', () => {
      expect(deriveVirtualEmail('+970591234567')).toBe(
        'parent.970591234567@family.masar.local',
      );
    });
  });

  describe('maskPhoneNumber', () => {
    it('masks Palestinian international numbers correctly (+970***4567)', () => {
      expect(maskPhoneNumber('+970591234567')).toBe('+970***4567');
      expect(maskPhoneNumber('+970569876543')).toBe('+970***6543');
    });

    it('masks local numbers starting with 0 (0***4567)', () => {
      expect(maskPhoneNumber('0591234567')).toBe('0***4567');
    });

    it('returns generic mask for short or invalid input', () => {
      expect(maskPhoneNumber('')).toBe('***');
      expect(maskPhoneNumber('123')).toBe('***');
    });
  });

  describe('generateFamilyPin', () => {
    it('generates a 6-digit numeric string', () => {
      const pin = generateFamilyPin();
      expect(pin).toMatch(/^\d{6}$/);
      expect(pin.length).toBe(6);
    });
  });

  describe('generateMagicToken & hashMagicToken', () => {
    it('generates a 64-character hex token and hashes with SHA-256', () => {
      const token = generateMagicToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      const hash = hashMagicToken(token);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('safeCompareStrings', () => {
    it('returns true for matching strings and false for non-matching strings', () => {
      expect(safeCompareStrings('hash123', 'hash123')).toBe(true);
      expect(safeCompareStrings('hash123', 'hash456')).toBe(false);
      expect(safeCompareStrings('short', 'longer-string')).toBe(false);
    });
  });

  describe('Device Trust Token (AES-256-GCM encryption/decryption)', () => {
    it('encrypts and successfully decrypts a valid payload within 60 days', () => {
      const payload: DeviceTrustPayload = {
        sub: 'user-parent-123',
        phone: '+966501234567',
        role: Role.PARENT,
        iat: Date.now(),
        exp: Date.now() + 60 * 24 * 60 * 60 * 1000,
        jti: 'random-uuid-1',
      };

      const token = encryptDeviceTrustToken(payload, secret);
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);

      const decrypted = decryptDeviceTrustToken(token, secret);
      expect(decrypted.sub).toBe(payload.sub);
      expect(decrypted.phone).toBe(payload.phone);
      expect(decrypted.role).toBe(Role.PARENT);
    });

    it('rejects expired device trust tokens', () => {
      const expiredPayload: DeviceTrustPayload = {
        sub: 'user-parent-123',
        phone: '+966501234567',
        role: Role.PARENT,
        iat: Date.now() - 100000,
        exp: Date.now() - 1000, // expired in the past
        jti: 'expired-uuid',
      };

      const token = encryptDeviceTrustToken(expiredPayload, secret);
      expect(() => decryptDeviceTrustToken(token, secret)).toThrow(
        UnauthorizedException,
      );
    });

    it('rejects tampered tokens', () => {
      const payload: DeviceTrustPayload = {
        sub: 'user-parent-123',
        phone: '+966501234567',
        role: Role.PARENT,
        iat: Date.now(),
        exp: Date.now() + 60 * 24 * 60 * 60 * 1000,
        jti: 'uuid-1',
      };

      const token = encryptDeviceTrustToken(payload, secret);
      const parts = token.split('.');
      // Tamper with the ciphertext
      const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -2)}AA`;

      expect(() => decryptDeviceTrustToken(tampered, secret)).toThrow(
        UnauthorizedException,
      );
    });
  });
});
