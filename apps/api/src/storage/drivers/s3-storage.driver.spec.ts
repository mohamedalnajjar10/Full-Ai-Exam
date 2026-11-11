import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { S3StorageDriver } from './s3-storage.driver';

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockResolvedValue({
        Body: (async function* () {
          yield Buffer.from('mock pdf content');
        })(),
      }),
    })),
    GetObjectCommand: jest.fn(),
    DeleteObjectCommand: jest.fn(),
    CreateBucketCommand: jest.fn((input) => ({ createBucket: input })),
    HeadBucketCommand: jest.fn((input) => ({ headBucket: input })),
  };
});

jest.mock('@aws-sdk/lib-storage', () => {
  return {
    Upload: jest.fn().mockImplementation(() => ({
      done: jest.fn().mockResolvedValue({}),
    })),
  };
});

// نفس تغطية StorageService السابقة — انتقلت هون لأن كلام S3 صار
// بالـ driver، والخدمة صارت بس تفوّض.
describe('S3StorageDriver', () => {
  let service: S3StorageDriver;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3StorageDriver,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const map: Record<string, any> = {
                AWS_REGION: 'us-east-1',
                AWS_ACCESS_KEY_ID: 'test-key',
                AWS_SECRET_ACCESS_KEY: 'test-secret',
                AWS_S3_BUCKET_NAME: 'test-bucket',
                AWS_S3_ENDPOINT: '',
              };
              return map[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<S3StorageDriver>(S3StorageDriver);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should upload a file and return the key', async () => {
    const buffer = Buffer.from('test file data');
    const result = await service.uploadFile(
      'test-key.pdf',
      buffer,
      'application/pdf',
    );
    expect(result).toBe('test-key.pdf');
  });

  it('should download a file and return a buffer', async () => {
    const buffer = await service.getFileBuffer('test-key.pdf');
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.toString()).toBe('mock pdf content');
  });

  it('should get a file stream and read chunks without error', async () => {
    const fileStream = await service.getFileStream('test-key.pdf');
    expect(fileStream.stream).toBeDefined();
    expect(typeof fileStream.stream.pipe).toBe('function');
    const chunks: Buffer[] = [];
    for await (const chunk of fileStream.stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).toString()).toBe('mock pdf content');
  });

  it('should delete a file', async () => {
    await expect(service.deleteFile('test-key.pdf')).resolves.not.toThrow();
  });

  it('should initialize S3Client with custom endpoint and forcePathStyle: true for S3-compatible storage like Backblaze', async () => {
    const { S3Client } = jest.requireMock('@aws-sdk/client-s3');
    const customConfig = {
      get: jest.fn((key: string) => {
        const map: Record<string, string> = {
          AWS_REGION: 'us-east-005',
          AWS_ACCESS_KEY_ID: 'b2-key-id',
          AWS_SECRET_ACCESS_KEY: 'b2-app-key',
          AWS_S3_BUCKET_NAME: 'ai-exam-bank-storage123',
          AWS_S3_ENDPOINT: 'https://s3.us-east-005.backblazeb2.com',
        };
        return map[key];
      }),
    };

    new S3StorageDriver(customConfig as any);

    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'us-east-005',
        endpoint: 'https://s3.us-east-005.backblazeb2.com',
        forcePathStyle: true,
        credentials: {
          accessKeyId: 'b2-key-id',
          secretAccessKey: 'b2-app-key',
        },
      }),
    );
  });

  describe('missing bucket', () => {
    const { Upload } = jest.requireMock('@aws-sdk/lib-storage');
    const noSuchBucket = Object.assign(
      new Error('The specified bucket does not exist'),
      { name: 'NoSuchBucket' },
    );
    const driverWith = (endpoint: string) =>
      new S3StorageDriver({
        get: (key: string) =>
          ({
            AWS_REGION: 'us-east-1',
            AWS_ACCESS_KEY_ID: 'k',
            AWS_SECRET_ACCESS_KEY: 's',
            AWS_S3_BUCKET_NAME: 'ai-exam-bank-storage',
            AWS_S3_ENDPOINT: endpoint,
          })[key],
      } as any);

    it('creates the bucket on MinIO and retries the upload once', async () => {
      Upload.mockImplementationOnce(() => ({
        done: jest.fn().mockRejectedValue(noSuchBucket),
      }));
      const driver = driverWith('http://localhost:9000');
      const send = (driver as any).s3.send as jest.Mock;

      await expect(
        driver.uploadFile('a.pdf', Buffer.from('x'), 'application/pdf'),
      ).resolves.toBe('a.pdf');
      expect(send).toHaveBeenCalledWith({
        createBucket: { Bucket: 'ai-exam-bank-storage' },
      });
      expect(Upload).toHaveBeenCalledTimes(2);
    });

    it('does not create buckets on AWS — reports a clear error instead', async () => {
      Upload.mockImplementationOnce(() => ({
        done: jest.fn().mockRejectedValue(noSuchBucket),
      }));
      const driver = driverWith('');
      await expect(
        driver.uploadFile('a.pdf', Buffer.from('x'), 'application/pdf'),
      ).rejects.toThrow('S3 bucket "ai-exam-bank-storage" does not exist');
      expect((driver as any).s3.send).not.toHaveBeenCalled();
    });
  });

  describe('configuration and credentials', () => {
    it('leaves endpoint undefined when neither AWS_S3_ENDPOINT nor MINIO_ENDPOINT is set', () => {
      const { S3Client } = jest.requireMock('@aws-sdk/client-s3');
      const config = {
        get: jest.fn((key: string) => {
          const map: Record<string, string> = {
            AWS_REGION: 'us-east-1',
            AWS_ACCESS_KEY_ID: 'k',
            AWS_SECRET_ACCESS_KEY: 's',
            AWS_S3_BUCKET_NAME: 'b',
          };
          return map[key];
        }),
      };
      new S3StorageDriver(config as any);
      expect(S3Client).toHaveBeenCalledWith(
        expect.not.objectContaining({ endpoint: expect.anything() }),
      );
    });

    it('throws in production when credentials are missing', () => {
      const prodConfig = {
        get: jest.fn((key: string) => {
          const map: Record<string, string> = {
            NODE_ENV: 'production',
            AWS_REGION: 'us-east-1',
            AWS_S3_BUCKET_NAME: 'b',
          };
          return map[key];
        }),
      };
      expect(() => new S3StorageDriver(prodConfig as any)).toThrow(
        /Missing storage credentials/,
      );
    });

    it('does not ship default root credentials (minioadmin) when credentials are not configured in dev', () => {
      const { S3Client } = jest.requireMock('@aws-sdk/client-s3');
      const devConfig = {
        get: jest.fn((key: string) => {
          const map: Record<string, string> = {
            NODE_ENV: 'development',
            AWS_REGION: 'us-east-1',
            AWS_S3_BUCKET_NAME: 'b',
          };
          return map[key];
        }),
      };
      new S3StorageDriver(devConfig as any);
      expect(S3Client).toHaveBeenCalledWith(
        expect.not.objectContaining({
          credentials: {
            accessKeyId: 'minioadmin',
            secretAccessKey: 'minioadmin',
          },
        }),
      );
    });
  });
});
