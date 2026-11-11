import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FilesController } from './files.controller';
import { LocalStorageDriver } from './drivers/local-storage.driver';
import type { Response } from 'express';

describe('FilesController', () => {
  let controller: FilesController;
  let mockLocalDriver: {
    verify: jest.Mock;
    getFileStream: jest.Mock;
    getFileBuffer: jest.Mock;
  };
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockLocalDriver = {
      verify: jest.fn(),
      getFileStream: jest.fn(),
      getFileBuffer: jest.fn(),
    };

    mockRes = {
      setHeader: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
      headersSent: false,
    };

    controller = new FilesController(mockLocalDriver as unknown as LocalStorageDriver);
  });

  it('throws BadRequestException if required parameters are missing', async () => {
    await expect(
      controller.serve('', '123456789', 'sig', undefined, mockRes as Response),
    ).rejects.toThrow(BadRequestException);

    await expect(
      controller.serve('key.pdf', '', 'sig', undefined, mockRes as Response),
    ).rejects.toThrow(BadRequestException);

    await expect(
      controller.serve('key.pdf', '123456789', '', undefined, mockRes as Response),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws ForbiddenException if signature verification fails', async () => {
    mockLocalDriver.verify!.mockReturnValue(false);

    await expect(
      controller.serve('key.pdf', '123456789', 'invalidsig', undefined, mockRes as Response),
    ).rejects.toThrow(ForbiddenException);

    expect(mockLocalDriver.verify).toHaveBeenCalledWith('key.pdf', 123456789, 'invalidsig');
  });

  it('serves file as buffer when getFileStream is not available', async () => {
    mockLocalDriver.verify!.mockReturnValue(true);
    (mockLocalDriver as any).getFileStream = undefined;
    const fileBuffer = Buffer.from('fake pdf content');
    mockLocalDriver.getFileBuffer!.mockResolvedValue(fileBuffer);

    await controller.serve('books/sample.pdf', '123456789', 'validsig', 'custom.pdf', mockRes as Response);

    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('custom.pdf'),
    );
    expect(mockRes.send).toHaveBeenCalledWith(fileBuffer);
  });
});
