import { Module, RequestMethod } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfig } from '@/platform/config/config.module';
import { pinoOptions } from './pino.options';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: pinoOptions(config.get('NODE_ENV'), config.get('LOG_LEVEL')),
        // Nest 11 wildcard syntax (the library default '*' is legacy and warns)
        forRoutes: [{ path: '{*path}', method: RequestMethod.ALL }],
      }),
    }),
  ],
})
export class LoggingModule {}
