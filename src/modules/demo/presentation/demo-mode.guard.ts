import {
  type CanActivate,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DemoModeGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(): boolean {
    if (!this.configService.getOrThrow<boolean>('DEMO_MODE')) {
      throw new NotFoundException();
    }

    return true;
  }
}
