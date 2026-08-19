import { SetMetadata } from '@nestjs/common';

export const SKIP_DEMO_SESSION = 'skipDemoSession';

export const SkipDemoSession = () => SetMetadata(SKIP_DEMO_SESSION, true);
