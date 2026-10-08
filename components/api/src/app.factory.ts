import fastifyCookie from '@fastify/cookie';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module';
import { AppConfig } from './platform/config/config.module';
import { PUBLIC_KEY_PATH } from './tesla/public-key.controller';

export const API_PREFIX = 'api';

/** Shared by main.ts and tests so both run the exact same app. */
export const createApp = async (): Promise<NestFastifyApplication> => {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true, requestIdHeader: 'x-request-id' }),
    { bufferLogs: true },
  );
  await app.register(fastifyCookie);
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(API_PREFIX, { exclude: [PUBLIC_KEY_PATH] });
  app.useGlobalPipes(new ZodValidationPipe());
  app.enableShutdownHooks();
  app.get(AppConfig); // fail fast if env is invalid
  return app;
};
