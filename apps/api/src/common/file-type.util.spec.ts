import { resolveExamMimeType } from './file-type.util';
import { decodeUploadName } from './file-type.util';

describe('file-type.util', () => {
  it('should resolve canonical PDF from valid magic bytes', () => {
    const file = {
      mimetype: 'application/pdf',
      originalname: 'test.pdf',
      buffer: Buffer.from('%PDF-1.4 standard content'),
    } as Express.Multer.File;

    expect(resolveExamMimeType(file)).toBe('application/pdf');
    expect(file.mimetype).toBe('application/pdf');
  });

  it('should resolve PDF from variant mimetype when buffer is not provided', () => {
    const file = {
      mimetype: 'application/x-pdf; charset=utf-8',
      originalname: 'test.bin',
    } as Express.Multer.File;

    expect(resolveExamMimeType(file)).toBe('application/pdf');
    expect(file.mimetype).toBe('application/pdf');
  });

  it('should resolve PDF from extension when mimetype is application/octet-stream and buffer is not provided', () => {
    const file = {
      mimetype: 'application/octet-stream',
      originalname: 'calculus_2025.PDF',
    } as Express.Multer.File;

    expect(resolveExamMimeType(file)).toBe('application/pdf');
    expect(file.mimetype).toBe('application/pdf');
  });

  it('should resolve PDF from buffer magic bytes (%PDF)', () => {
    const file = {
      mimetype: 'application/octet-stream',
      originalname: 'unknown_file',
      buffer: Buffer.from('%PDF-1.4 header data'),
    } as Express.Multer.File;

    expect(resolveExamMimeType(file)).toBe('application/pdf');
    expect(file.mimetype).toBe('application/pdf');
  });

  it('should resolve image formats from mimetype, extension, and magic bytes', () => {
    // PNG with magic bytes
    const pngFile = {
      mimetype: 'image/png',
      originalname: 'exam.png',
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    } as Express.Multer.File;
    expect(resolveExamMimeType(pngFile)).toBe('image/png');

    // JPEG via magic bytes
    const jpgFile = {
      mimetype: 'application/octet-stream',
      originalname: 'exam.jpg',
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    } as Express.Multer.File;
    expect(resolveExamMimeType(jpgFile)).toBe('image/jpeg');
    expect(jpgFile.mimetype).toBe('image/jpeg');

    // PNG via magic bytes
    const pngMagic = {
      mimetype: 'application/octet-stream',
      originalname: 'file_without_ext',
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    } as Express.Multer.File;
    expect(resolveExamMimeType(pngMagic)).toBe('image/png');
  });

  it('should reject file when buffer is present but lacks valid magic bytes even if mimetype claims application/pdf (anti-spoofing)', () => {
    const spoofedFile = {
      mimetype: 'application/pdf',
      originalname: 'script.php',
      buffer: Buffer.from('<?php echo "evil"; ?>'),
    } as Express.Multer.File;
    expect(resolveExamMimeType(spoofedFile)).toBeNull();
  });

  it('should return null for unsupported file types', () => {
    const zipFile = {
      mimetype: 'application/zip',
      originalname: 'archive.zip',
      buffer: Buffer.from('PK\x03\x04'),
    } as Express.Multer.File;
    expect(resolveExamMimeType(zipFile)).toBeNull();

    const txtFile = {
      mimetype: 'text/plain',
      originalname: 'notes.txt',
      buffer: Buffer.from('hello world'),
    } as Express.Multer.File;
    expect(resolveExamMimeType(txtFile)).toBeNull();
  });

  describe('security & magic bytes spoofing protection', () => {
    it('should reject Windows PE executable even if header claims application/pdf', () => {
      const file = {
        mimetype: 'application/pdf',
        originalname: 'invoice.pdf',
        buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]), // MZ header
      } as Express.Multer.File;
      expect(resolveExamMimeType(file)).toBeNull();
    });

    it('should reject Linux ELF executable even if extension is .pdf', () => {
      const file = {
        mimetype: 'application/pdf',
        originalname: 'exploit.pdf',
        buffer: Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]), // \x7fELF
      } as Express.Multer.File;
      expect(resolveExamMimeType(file)).toBeNull();
    });

    it('should reject ZIP file disguised as PDF with application/pdf header', () => {
      const file = {
        mimetype: 'application/pdf',
        originalname: 'homework.pdf',
        buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x08, 0x00]), // PK\x03\x04
      } as Express.Multer.File;
      expect(resolveExamMimeType(file)).toBeNull();
    });

    it('should reject Shell script disguised as PDF', () => {
      const file = {
        mimetype: 'application/pdf',
        originalname: 'script.pdf',
        buffer: Buffer.from('#!/bin/bash\nrm -rf /'),
      } as Express.Multer.File;
      expect(resolveExamMimeType(file)).toBeNull();
    });

    it('should reject PHP script disguised as JPEG image', () => {
      const file = {
        mimetype: 'image/jpeg',
        originalname: 'avatar.jpg',
        buffer: Buffer.from('<?php phpinfo(); ?>'),
      } as Express.Multer.File;
      expect(resolveExamMimeType(file)).toBeNull();
    });

    it('should reject HTML/XSS script disguised as PNG image', () => {
      const file = {
        mimetype: 'image/png',
        originalname: 'picture.png',
        buffer: Buffer.from('<script>alert("XSS")</script>'),
      } as Express.Multer.File;
      expect(resolveExamMimeType(file)).toBeNull();
    });

    it('should detect WebP from magic bytes (RIFF...WEBP)', () => {
      const webpHeader = Buffer.alloc(16);
      webpHeader.write('RIFF', 0);
      webpHeader.writeUInt32LE(100, 4);
      webpHeader.write('WEBP', 8);
      webpHeader.write('VP8 ', 12);
      const file = {
        mimetype: 'application/octet-stream',
        originalname: 'photo.unknown',
        buffer: webpHeader,
      } as Express.Multer.File;
      expect(resolveExamMimeType(file)).toBe('image/webp');
    });

    it('should detect GIF from magic bytes (GIF89a)', () => {
      const file = {
        mimetype: 'application/octet-stream',
        originalname: 'animation',
        buffer: Buffer.from('GIF89a\x01\x00\x01\x00'),
      } as Express.Multer.File;
      expect(resolveExamMimeType(file)).toBe('image/gif');
    });

    it('should prefer actual magic bytes over conflicting client header', () => {
      // Client claims PDF, but bytes are actually PNG
      const file = {
        mimetype: 'application/pdf',
        originalname: 'fake.pdf',
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      } as Express.Multer.File;
      expect(resolveExamMimeType(file)).toBe('image/png');
      expect(file.mimetype).toBe('image/png');
    });
  });
});

describe('decodeUploadName', () => {
  const asMulter = (s: string) => Buffer.from(s, 'utf8').toString('latin1');

  it('recovers UTF-8 names that multer decoded as latin1', () => {
    expect(decodeUploadName(asMulter('اللغة العربية - الكتاب الأول.pdf'))).toBe(
      'اللغة العربية - الكتاب الأول.pdf',
    );
  });

  it('leaves plain ASCII and genuine latin1 names alone', () => {
    expect(decodeUploadName('exam_2025.pdf')).toBe('exam_2025.pdf');
    expect(decodeUploadName('café.pdf')).toBe('café.pdf');
  });

  it('leaves names that are already proper Unicode alone', () => {
    expect(decodeUploadName('كيمياء.pdf')).toBe('كيمياء.pdf');
  });

  it('recovers Windows-1252 mojibake with characters like Š', () => {
    expect(decodeUploadName('History12 2025 Tawjihi Ø§Ø¯Ø¨ÙŠ.pdf')).toBe(
      'History12 2025 Tawjihi ادبي.pdf',
    );
  });
});
