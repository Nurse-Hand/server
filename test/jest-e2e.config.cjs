const baseConfig = require('../jest.config.cjs');

module.exports = {
  ...baseConfig,
  rootDir: '..',
  testRegex: 'test[\\\\/].*\\.e2e-spec\\.ts$',
};
