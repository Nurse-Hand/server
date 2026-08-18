import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { AllExceptionsFilter } from '../common/http/all-exceptions.filter';
import { ApiResponseInterceptor } from '../common/http/api-response.interceptor';
import { GLOBAL_API_PREFIX } from '../config/application.constants';

export function configureApplication(app: INestApplication): void {
  app.setGlobalPrefix(GLOBAL_API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      whitelist: true,
    }),
  );
  app.useGlobalInterceptors(new ApiResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
}
