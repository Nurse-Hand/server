const baseConfig = require('../jest.config.cjs');

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL이 필요합니다.');
}

const parsed = new URL(testDatabaseUrl);
const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
const schema = parsed.searchParams.get('schema');
const safeNamePattern = /^nh_it_[a-z0-9_]{1,57}$/;

if (
  !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
  !safeNamePattern.test(databaseName) ||
  !schema ||
  !safeNamePattern.test(schema)
) {
  throw new Error(
    'TEST_DATABASE_URL의 database와 schema는 안전한 nh_it_* prefix여야 합니다.',
  );
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.NODE_ENV = 'test';
process.env.DEMO_MODE = 'true';
process.env.DEMO_SESSION_TTL_SECONDS = '25200';

module.exports = {
  ...baseConfig,
  rootDir: '..',
  testRegex: 'test[\\/]integration[\\/].*\\.integration-spec\\.ts$',
  testTimeout: 30_000,
};
