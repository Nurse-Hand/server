import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { RequestWithContext } from '../../../common/http/request-context';
import { DemoSessionContextResolver } from '../application/demo-session-context.resolver';
import { DemoSessionRequiredError } from '../domain/demo-session.errors';
import { SKIP_DEMO_SESSION } from './skip-demo-session.decorator';

export type RequestWithDemoSessionContext = RequestWithContext & {
  demoSessionContext?: {
    datasetId: string;
    actorId: string;
    wardId: string;
  };
};

@Injectable()
export class DemoSessionGuard implements CanActivate {
  constructor(
    private readonly resolver: DemoSessionContextResolver,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const shouldSkip = this.reflector.getAllAndOverride<boolean>(
      SKIP_DEMO_SESSION,
      [context.getHandler(), context.getClass()],
    );

    if (shouldSkip) {
      return true;
    }

    if (!this.configService.getOrThrow<boolean>('DEMO_MODE')) {
      throw new NotFoundException();
    }

    const request = context
      .switchToHttp()
      .getRequest<RequestWithDemoSessionContext>();
    const header = request.headers['x-demo-session-id'];
    const sessionId = Array.isArray(header) ? header[0] : header;

    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      throw new DemoSessionRequiredError();
    }

    request.demoSessionContext = await this.resolver.resolve(sessionId);
    return true;
  }
}
