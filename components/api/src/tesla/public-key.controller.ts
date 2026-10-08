import { Controller, Get, Header } from '@nestjs/common';
import { TESLA_PUBLIC_KEY } from './public-key';

export const PUBLIC_KEY_PATH = '.well-known/appspecific/com.tesla.3p.public-key.pem';

/** Served at the domain root: Tesla checks it when the application registers the domain. */
@Controller()
export class TeslaPublicKeyController {
  @Get(PUBLIC_KEY_PATH)
  @Header('Content-Type', 'application/x-pem-file')
  publicKey(): string {
    return `${TESLA_PUBLIC_KEY}\n`;
  }
}
