export default {
  test: {
    include: ['tests/**/*.test.js'],
    globalSetup: ['./tests/global-setup.js'],
    testTimeout: 15000,
  },
};
