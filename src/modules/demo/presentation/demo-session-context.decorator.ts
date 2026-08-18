import {
  createParamDecorator,
  type ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import type { DemoSessionContext } from '../application/demo-session-context';
import type { RequestWithDemoSessionContext } from './demo-session.guard';

export const DemoSessionContextParam = createParamDecorator(
  (_data: unknown, context: ExecutionContext): DemoSessionContext => {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithDemoSessionContext>();

    if (!request.demoSessionContext) {
      throw new InternalServerErrorException();
    }

    return request.demoSessionContext;
  },
);
