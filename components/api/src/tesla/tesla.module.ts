import { Module } from '@nestjs/common';
import { TeslaPublicKeyController } from './public-key.controller';

@Module({
  controllers: [TeslaPublicKeyController],
})
export class TeslaModule {}
