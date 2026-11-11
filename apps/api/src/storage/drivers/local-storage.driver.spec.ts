import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalStorageDriver } from './local-storage.driver';

describe('LocalStorageDriver', () => {
  let root: string;
  let driver: LocalStorageDriver;

  const configWith = (uploadDir: string) =>
    ({
      get: (key: string) =>
        ({
          UPLOAD_DIR: uploadDir,
          ENCRYPTION_KEY: 'test-secret-key',
          BACKEND_URL: 'http://localhost:3002',
        })[key],
    }) as unknown as ConfigService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'aiexam-storage-'));
    driver = new LocalStorageDriver(configWith(root));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('round-trips a file through the same key the database stores', async () => {
    const body = Buffer.from('%PDF-1.7 fake book');
    const key = await driver.uploadFile(
      'books/math.pdf',
      body,
      'application/pdf',
    );

    expect(key).toBe('books/math.pdf');
    await expect(driver.getFileBuffer(key)).resolves.toEqual(body);

    const streamResult = await driver.getFileStream(key);
    expect(streamResult.contentLength).toBe(body.length);
    const chunks: Buffer[] = [];
    for await (const chunk of streamResult.stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks)).toEqual(body);

    // nested keys create their directories
    await expect(readFile(join(root, 'books/math.pdf'))).resolves.toEqual(body);
  });

  it('deletes a file, and deleting a missing one is not an error', async () => {
    await driver.uploadFile('a.pdf', Buffer.from('x'), 'application/pdf');
    await driver.deleteFile('a.pdf');

    await expect(driver.getFileBuffer('a.pdf')).rejects.toThrow();
    await expect(driver.getFileStream('a.pdf')).rejects.toThrow();
    await expect(driver.deleteFile('a.pdf')).resolves.toBeUndefined();
  });

  it('refuses keys that try to escape the upload directory', async () => {
    await expect(driver.getFileBuffer('../../../etc/passwd')).rejects.toThrow(
      /Invalid file key/,
    );
    await expect(driver.getFileStream('../../../etc/passwd')).rejects.toThrow(
      /Invalid file key/,
    );
    await expect(
      driver.uploadFile('../escape.txt', Buffer.from('x'), 'text/plain'),
    ).rejects.toThrow(/Invalid file key/);
  });

  it('signs a time-limited URL that verifies', async () => {
    const url = await driver.getPresignedUrl(
      'books/math.pdf',
      'الرياضيات.pdf',
      60,
    );
    const parsed = new URL(url);

    expect(parsed.pathname).toBe('/api/v1/files');
    const key = parsed.searchParams.get('key')!;
    const expires = Number(parsed.searchParams.get('expires'));
    const sig = parsed.searchParams.get('sig')!;

    expect(driver.verify(key, expires, sig)).toBe(true);
  });

  it('rejects an expired link, a tampered key, and a forged signature', async () => {
    const key = 'books/math.pdf';
    const future = Date.now() + 60_000;
    const good = driver.sign(key, future);

    expect(
      driver.verify(
        key,
        Date.now() - 1000,
        driver.sign(key, Date.now() - 1000),
      ),
    ).toBe(false);
    expect(driver.verify('books/other.pdf', future, good)).toBe(false);
    expect(driver.verify(key, future, 'deadbeef')).toBe(false);
  });
});
