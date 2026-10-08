import { Module } from '@nestjs/common';
import { TeslaPublicKeyController } from './public-key.controller';
import { TeslaController } from './tesla.controller';
import { TeslaService } from './tesla.service';
import { VehicleLinkRepository } from './vehicle-link.repository';

@Module({
  controllers: [TeslaController, TeslaPublicKeyController],
  providers: [TeslaService, VehicleLinkRepository],
})
export class TeslaModule {}
