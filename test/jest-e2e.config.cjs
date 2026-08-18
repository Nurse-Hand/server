const baseConfig = require('../jest.config.cjs');

module.exports = {
  ...baseConfig,
  rootDir: '..',
  setupFiles: ['<rootDir>/test/setup-e2e-env.cjs'],
  testRegex: 'test[\\\\/].*\\.e2e-spec\\.ts$',
};
