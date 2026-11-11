export const SUPPORTED_EXAM_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export type SupportedExamMimeType = (typeof SUPPORTED_EXAM_MIME_TYPES)[number];

const MIME_MAP: Record<string, SupportedExamMimeType> = {
  'application/pdf': 'application/pdf',
  'application/x-pdf': 'application/pdf',
  'application/acrobat': 'application/pdf',
  'applications/vnd.pdf': 'application/pdf',
  'text/pdf': 'application/pdf',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/jfif': 'image/jpeg',
  'image/png': 'image/png',
  'image/x-png': 'image/png',
  'image/webp': 'image/webp',
  'image/gif': 'image/gif',
};

const EXTENSION_MAP: Record<string, SupportedExamMimeType> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

/**
 * Detects if a buffer contains dangerous file signatures (executables, scripts, HTML/XSS payloads, archives).
 */
export function isDangerousFileBuffer(buf: Buffer): boolean {
  if (!buf || buf.length < 2) return false;

  // 1. Windows / DOS PE executable / DLL: 'MZ' (0x4D, 0x5A)
  if (buf[0] === 0x4d && buf[1] === 0x5a) {
    return true;
  }

  // 2. Linux / Unix ELF executable: 0x7F 'ELF' (0x7F, 0x45, 0x4C, 0x46)
  if (
    buf.length >= 4 &&
    buf[0] === 0x7f &&
    buf[1] === 0x45 &&
    buf[2] === 0x4c &&
    buf[3] === 0x46
  ) {
    return true;
  }

  // 3. Java class or Mach-O fat binary: 0xCAFEBABE
  if (
    buf.length >= 4 &&
    buf[0] === 0xca &&
    buf[1] === 0xfe &&
    buf[2] === 0xba &&
    buf[3] === 0xbe
  ) {
    return true;
  }

  // 4. Mach-O binaries: 0xFEEDFACE, 0xFEEDFACF, 0xCEFAEDFE, 0xCFFAEDFE
  if (buf.length >= 4) {
    const magic32 = buf.readUInt32BE(0);
    if (
      magic32 === 0xfeedface ||
      magic32 === 0xfeedfacf ||
      magic32 === 0xcefaedfe ||
      magic32 === 0xcffaedfe
    ) {
      return true;
    }
  }

  // 5. ZIP archive (ZIP, JAR, APK, DOCX, etc.): 'PK\x03\x04', 'PK\x05\x06', 'PK\x07\x08'
  if (
    buf.length >= 4 &&
    buf[0] === 0x50 &&
    buf[1] === 0x4b &&
    (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07) &&
    (buf[3] === 0x04 || buf[3] === 0x06 || buf[3] === 0x08)
  ) {
    return true;
  }

  // 6. Other compressed archives: 7-Zip, RAR, GZIP
  if (
    buf.length >= 6 &&
    buf[0] === 0x37 &&
    buf[1] === 0x7a &&
    buf[2] === 0xbc &&
    buf[3] === 0xaf &&
    buf[4] === 0x27 &&
    buf[5] === 0x1c
  ) {
    return true; // 7z
  }
  if (
    buf.length >= 4 &&
    buf[0] === 0x52 &&
    buf[1] === 0x61 &&
    buf[2] === 0x72 &&
    buf[3] === 0x21
  ) {
    return true; // Rar!
  }
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    return true; // GZIP
  }

  // 7. Scripts and HTML / Web payloads in text header (inspect first 512 bytes)
  const headerText = buf
    .subarray(0, Math.min(buf.length, 512))
    .toString('ascii')
    .toLowerCase()
    .trimStart();

  if (headerText.startsWith('#!')) {
    return true; // Shell script shebang
  }
  if (
    headerText.startsWith('<?php') ||
    headerText.startsWith('<?=') ||
    headerText.startsWith('<%')
  ) {
    return true; // PHP / ASP script
  }
  if (
    headerText.startsWith('<!doctype html') ||
    headerText.startsWith('<html') ||
    headerText.startsWith('<script') ||
    headerText.startsWith('<svg') ||
    headerText.startsWith('<iframe') ||
    headerText.startsWith('<object') ||
    headerText.startsWith('<embed') ||
    headerText.includes('<script')
  ) {
    return true; // HTML/SVG/JS XSS payload
  }

  return false;
}

/**
 * Detects the MIME type of a buffer based on magic byte signatures.
 */
export function detectMagicMimeType(buf: Buffer): SupportedExamMimeType | null {
  if (!buf || buf.length < 3) return null;

  // PDF: starts with %PDF (or within first 1024 bytes)
  if (
    buf.length >= 4 &&
    buf[0] === 0x25 &&
    buf[1] === 0x50 &&
    buf[2] === 0x44 &&
    buf[3] === 0x46
  ) {
    return 'application/pdf';
  }
  if (buf.length >= 10) {
    const head = buf.subarray(0, Math.min(buf.length, 1024));
    const pdfIdx = head.indexOf('%PDF-');
    if (pdfIdx !== -1 && pdfIdx < 32) {
      return 'application/pdf';
    }
  }

  // PNG: \x89PNG
  if (
    buf.length >= 4 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return 'image/png';
  }

  // JPEG: \xFF\xD8\xFF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }

  // GIF: GIF8 (0x47 0x49 0x46 0x38)
  if (
    buf.length >= 4 &&
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38
  ) {
    return 'image/gif';
  }

  // WEBP: RIFF....WEBP
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Resolves and normalizes the MIME type of an uploaded file.
 * Checks for dangerous payloads, inspects buffer magic bytes,
 * and falls back to headers/extensions when safe.
 * If valid, returns the canonical MIME type and updates `file.mimetype`.
 */
export function resolveExamMimeType(
  file: Express.Multer.File,
): SupportedExamMimeType | null {
  if (!file) return null;

  // 1. If buffer is present, strictly enforce magic bytes validation
  if (file.buffer && file.buffer.length > 0) {
    if (isDangerousFileBuffer(file.buffer)) {
      return null;
    }

    // Direct magic bytes inspection
    const magicMime = detectMagicMimeType(file.buffer);
    if (magicMime) {
      file.mimetype = magicMime;
      return magicMime;
    }

    // Strict Anti-Spoofing: when buffer is available, it MUST match supported magic bytes.
    // Never fall back to client-provided mimetype headers or filename extensions when buffer inspection fails.
    return null;
  }

  // 2. Fallback only for metadata-only objects where buffer is not present: Check raw mimetype header
  const rawMime = file.mimetype
    ? file.mimetype.toLowerCase().split(';')[0].trim()
    : '';
  if (rawMime && MIME_MAP[rawMime]) {
    const canonical = MIME_MAP[rawMime];
    file.mimetype = canonical;
    return canonical;
  }

  // 3. Fallback only for metadata-only objects: Check filename extension
  if (file.originalname) {
    const ext = file.originalname.toLowerCase().split('.').pop()?.trim();
    if (ext && EXTENSION_MAP[ext]) {
      const canonical = EXTENSION_MAP[ext];
      file.mimetype = canonical;
      return canonical;
    }
  }

  return null;
}

const WIN1252_REVERSE: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

/**
 * اسم الملف الأصلي كما كتبه المستخدم. multer (busboy) بيفك اسم الملف
 * بالـ multipart كـ latin1 أو Windows-1252، والمتصفحات بتبعته UTF-8 — فـ«اللغة العربية.pdf»
 * كان يوصل «Ø§ÙÙØºØ©.pdf» أو مع محارف ويندوز مثل «Š» بدل 0x8A.
 * منرجّع البايتات ومنفكها UTF-8؛ إذا الناتج مش UTF-8 سليم منترك الاسم زي ما هو.
 */
export function decodeUploadName(name: string): string {
  if (!name || typeof name !== 'string') return name;

  // إذا كان الاسم يحتوي أحرفاً عربية بالفعل، فهو سليم
  if (/[\u0600-\u06FF]/.test(name)) return name;

  const hasMojibakeChars =
    /[\u0080-\u00FF\u0160\u0161\u0152\u0153\u017D\u017E\u0178\u02C6\u02DC\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]/.test(
      name,
    );
  if (!hasMojibakeChars) return name;

  // 1. محاولة فك latin1 قياسي
  try {
    const latin1Decoded = Buffer.from(name, 'latin1').toString('utf8');
    if (
      !latin1Decoded.includes('\uFFFD') &&
      /[\u0600-\u06FF]/.test(latin1Decoded)
    ) {
      return latin1Decoded;
    }
  } catch {}

  // 2. محاولة عكس خريطة Windows-1252
  try {
    const bytes: number[] = [];
    for (let i = 0; i < name.length; i++) {
      const code = name.charCodeAt(i);
      if (WIN1252_REVERSE[code] !== undefined) {
        bytes.push(WIN1252_REVERSE[code]);
      } else if (code <= 0xff) {
        bytes.push(code);
      } else {
        bytes.push(code & 0xff);
      }
    }
    const winDecoded = Buffer.from(bytes).toString('utf8');
    if (!winDecoded.includes('\uFFFD') && /[\u0600-\u06FF]/.test(winDecoded)) {
      return winDecoded;
    }
  } catch {}

  // Fallback: فحص latin1 الكلاسيكي
  if (!/[\u0080-ÿ]/.test(name) || /[^\u0000-ÿ]/.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
}
