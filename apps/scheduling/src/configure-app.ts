import { INestApplication, ValidationPipe } from '@nestjs/common';

/**
 * Shared application configuration applied to BOTH the production bootstrap
 * (main.ts) and the e2e test app, so tests exercise the real wiring.
 */
export function configureApp(app: INestApplication): void {
  app.enableCors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
}
