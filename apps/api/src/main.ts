import * as dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '../../.env' });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import {
  ExpressAdapter,
  NestExpressApplication,
} from '@nestjs/platform-express';
import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common';

async function createApp(): Promise<NestExpressApplication> {
  const server = express();
  server.set('trust proxy', 1);

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(server),
  );

  app.enableShutdownHooks();

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
          imgSrc: ["'self'", 'data:', 'https://cdn.jsdelivr.net'],
        },
      },
      crossOriginResourcePolicy: false,
    }),
  );
  app.use(cookieParser());

  app.setGlobalPrefix('api/v1');

  const rawOrigins = [
    process.env.FRONTEND_URL,
    process.env.ALLOWED_ORIGINS,
    'https://frontend-sfal.vercel.app',
    'https://backend-e3we.onrender.com',
    'https://ai-exam-frontend-2.onrender.com',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:8088',
    'http://localhost:5173',
    'http://localhost:8091',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:5173',
  ];

  const allowedOrigins = rawOrigins
    .filter(Boolean)
    .flatMap((o) => (o ? o.split(',').map((s) => s.trim()) : []))
    .filter(Boolean);

  const isDev = process.env.NODE_ENV !== 'production';

  app.enableCors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        (isDev && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
      ) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const isDevOrSwaggerEnabled =
    process.env.NODE_ENV !== 'production' ||
    process.env.ENABLE_SWAGGER === 'true';

  if (isDevOrSwaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Exam Prep AI Assistant')
      .setDescription('API documentation for the Exam Prep AI Assistant')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
        'access-token',
      )
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
        'refresh-token',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);

    SwaggerModule.setup('api-docs', app, document, {
      customCssUrl: [
        'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.8/swagger-ui.css',
      ],
      customJs: [
        'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.8/swagger-ui-bundle.js',
        'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.8/swagger-ui-standalone-preset.js',
      ],
    });
  }

  await app.init();
  return app;
}

let isBootstrapping = false;

export async function bootstrap() {
  if (isBootstrapping) return;
  isBootstrapping = true;

  const app = await createApp();
  const port = process.env.PORT ?? 8088;
  const server = await app.listen(port);
  if (server && typeof (server as any).setTimeout === 'function') {
    (server as any).setTimeout(120_000);
    (server as any).keepAliveTimeout = 65_000;
    (server as any).headersTimeout = 66_000;
  }
  new Logger('Bootstrap').log(`Application listening on port ${port}`);
}

if (
  require.main === module ||
  (!process.env.VERCEL && require.main?.filename?.includes('main'))
) {
  void bootstrap();
}

// Promise-based singleton: concurrent cold-start invocations share the same
// initialisation promise instead of each spawning a full NestJS application.
let handlerPromise: Promise<(req: Request, res: Response) => void> | null =
  null;

export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!handlerPromise) {
    handlerPromise = createApp().then(
      (app) =>
        app.getHttpAdapter().getInstance() as (
          req: Request,
          res: Response,
        ) => void,
    );
  }
  const fn = await handlerPromise;
  fn(req, res);
}
