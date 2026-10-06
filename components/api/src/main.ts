import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp } from './app.factory';
import { AppConfig } from './platform/config/config.module';

const bootstrap = async (): Promise<void> => {
  const app = await createApp();
  const config = app.get(AppConfig);
  await app.listen({ port: config.get('API_PORT'), host: config.get('API_HOST') });
  new Logger('bootstrap').log(`API listening on ${await app.getUrl()}`);
};

void bootstrap();
