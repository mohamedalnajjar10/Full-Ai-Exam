import {
  BadRequestException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './http-exception.filter';

const createMockHttp = (): {
  filter: ExceptionFilter;
  response: { status: jest.Mock; json: jest.Mock };
  host: ArgumentsHost;
} => {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const request = { method: 'GET', url: '/test' } as unknown as Request;
  const host = {
    switchToHttp: () => ({
      getResponse: () => response as unknown as Response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { filter: new AllExceptionsFilter(), response, host };
};

const getJsonBody = (response: {
  status: jest.Mock;
  json: jest.Mock;
}): {
  statusCode: number;
  message: unknown;
  timestamp: string;
  path: string;
} => {
  const calls = response.json.mock.calls as unknown as [
    { statusCode: number; message: unknown; timestamp: string; path: string },
  ][];
  return calls[0][0];
};

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('Prisma error', {
    code,
    clientVersion: '1.0.0',
  });

describe('AllExceptionsFilter', () => {
  let filter: ExceptionFilter;
  let response: { status: jest.Mock; json: jest.Mock };
  let host: ArgumentsHost;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const mock = createMockHttp();
    filter = mock.filter;
    response = mock.response;
    host = mock.host;
  });

  it('should respond with a consistent error body shape', () => {
    filter.catch(new BadRequestException('bad input'), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    const body = getJsonBody(response);
    expect(body.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(body.message).toBe('bad input');
    expect(() => new Date(body.timestamp).toISOString()).not.toThrow();
    expect(body.path).toBe('/test');
  });

  describe('HttpException', () => {
    it('should use the status and string message', () => {
      filter.catch(new BadRequestException('bad input'), host);

      expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(getJsonBody(response).message).toBe('bad input');
    });

    it('should forward validation message arrays', () => {
      const errors = ['name must be a string', 'email must be an email'];
      filter.catch(new BadRequestException(errors), host);

      expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(getJsonBody(response).message).toEqual(errors);
    });
  });

  describe('logging', () => {
    it('should log client errors (4xx) as warnings without a stack', () => {
      filter.catch(new BadRequestException('bad input'), host);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('400'));
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('should log server errors (5xx) as errors with a stack', () => {
      filter.catch(new Error('boom'), host);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('500'),
        expect.stringContaining('Error: boom'),
      );
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should log internal server errors thrown as HttpExceptions as errors', () => {
      filter.catch(new InternalServerErrorException('boom'), host);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('500'),
        expect.any(String),
      );
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Prisma known request errors', () => {
    it.each([
      ['P2000', HttpStatus.BAD_REQUEST, 'The value is too long for this field'],
      ['P2001', HttpStatus.NOT_FOUND, 'Record not found'],
      ['P2002', HttpStatus.CONFLICT, 'A record with this value already exists'],
      ['P2003', HttpStatus.BAD_REQUEST, 'Related record not found'],
      ['P2004', HttpStatus.BAD_REQUEST, 'Constraint check failed'],
      ['P2005', HttpStatus.BAD_REQUEST, 'Invalid value stored in the database'],
      ['P2006', HttpStatus.BAD_REQUEST, 'Invalid value for field'],
      ['P2007', HttpStatus.BAD_REQUEST, 'Data validation error'],
      ['P2008', HttpStatus.BAD_REQUEST, 'Failed to parse query'],
      ['P2009', HttpStatus.BAD_REQUEST, 'Failed to validate query'],
      ['P2011', HttpStatus.BAD_REQUEST, 'Missing required field'],
      ['P2012', HttpStatus.BAD_REQUEST, 'Missing required value'],
      ['P2013', HttpStatus.BAD_REQUEST, 'Missing required argument'],
      ['P2014', HttpStatus.BAD_REQUEST, 'Relation violation'],
      ['P2015', HttpStatus.BAD_REQUEST, 'Related record not found'],
      ['P2016', HttpStatus.BAD_REQUEST, 'Could not interpret query'],
      ['P2017', HttpStatus.BAD_REQUEST, 'Related records are not connected'],
      ['P2018', HttpStatus.NOT_FOUND, 'Required related records not found'],
      ['P2020', HttpStatus.BAD_REQUEST, 'Value out of allowed range for field'],
      ['P2025', HttpStatus.NOT_FOUND, 'Record not found'],
      ['P2034', HttpStatus.CONFLICT, 'Transaction conflict, please retry'],
      ['P2010', HttpStatus.INTERNAL_SERVER_ERROR, 'Database query failed'],
      ['P2021', HttpStatus.INTERNAL_SERVER_ERROR, 'Database table not found'],
      ['P2022', HttpStatus.INTERNAL_SERVER_ERROR, 'Database column not found'],
      ['P2023', HttpStatus.INTERNAL_SERVER_ERROR, 'Database index not found'],
      [
        'P2024',
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Database constraint not found',
      ],
      [
        'P2026',
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Unsupported database engine',
      ],
      [
        'P2027',
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Multiple database errors occurred',
      ],
      ['P2028', HttpStatus.INTERNAL_SERVER_ERROR, 'Database transaction error'],
      [
        'P2030',
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Full-text search is not available',
      ],
      ['P2033', HttpStatus.INTERNAL_SERVER_ERROR, 'Database number overflow'],
    ])(
      'should map Prisma code %s to %i with message %s',
      (code, status, message) => {
        filter.catch(prismaError(code), host);

        expect(response.status).toHaveBeenCalledWith(status);
        expect(getJsonBody(response).message).toBe(message);
      },
    );

    it('should fall back to a generic database error for unknown codes', () => {
      filter.catch(prismaError('P9999'), host);

      expect(response.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(getJsonBody(response).message).toBe('Database error');
    });
  });

  describe('Other Prisma client errors', () => {
    it('should return 503 when the database cannot be reached', () => {
      filter.catch(
        new Prisma.PrismaClientInitializationError(
          'Connection refused',
          '1.0.0',
        ),
        host,
      );

      expect(response.status).toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      expect(getJsonBody(response).message).toBe('Database is unavailable');
    });

    it('should return 500 for query validation errors', () => {
      filter.catch(
        new Prisma.PrismaClientValidationError('Invalid query', {
          clientVersion: '1.0.0',
        }),
        host,
      );

      expect(response.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(getJsonBody(response).message).toBe('Invalid database query');
    });

    it('should return 500 for engine panics', () => {
      filter.catch(
        new Prisma.PrismaClientRustPanicError('Panic', '1.0.0'),
        host,
      );

      expect(response.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(getJsonBody(response).message).toBe('Database error');
    });

    it('should return 500 for unknown request errors', () => {
      filter.catch(
        new Prisma.PrismaClientUnknownRequestError('Unknown', {
          clientVersion: '1.0.0',
        }),
        host,
      );

      expect(response.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(getJsonBody(response).message).toBe('Database error');
    });
  });

  describe('Unexpected errors', () => {
    it('should return a generic 500 for any uncaught error', () => {
      filter.catch(new Error('something went wrong'), host);

      expect(response.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(getJsonBody(response).message).toBe('Internal server error');
    });

    it('should return a generic 500 for non-error values', () => {
      filter.catch('string error', host);

      expect(response.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(getJsonBody(response).message).toBe('Internal server error');
    });
  });
});
