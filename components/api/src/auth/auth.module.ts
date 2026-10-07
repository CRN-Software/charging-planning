import { Global, Module } from '@nestjs/common';
import { AppConfig } from '@/platform/config/config.module';
import { SecretBox } from '@/platform/crypto/secret-box';
import { AccountsRepository } from './accounts.repository';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionGuard } from './session.guard';
import { SessionsRepository } from './sessions.repository';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: SecretBox,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => new SecretBox(config.get('TOKEN_ENCRYPTION_KEY')),
    },
    AccountsRepository,
    SessionsRepository,
    AuthService,
    SessionGuard,
  ],
  exports: [SecretBox, AccountsRepository, SessionsRepository, SessionGuard, AuthService],
})
export class AuthModule {}
