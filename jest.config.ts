/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/en/configuration.html
 */

export default {
  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  // Reset the module registry before running each individual test
  resetModules: true,

  // Test paths to skip
  testPathIgnorePatterns: ['/node_modules/', 'src/__tests__/helpers.ts'],

  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage',

  // An array of regexp pattern strings used to skip coverage collection
  coveragePathIgnorePatterns: ['/node_modules/'],

  // Make calling deprecated APIs throw helpful error messages
  errorOnDeprecated: true,

  // A list of paths to modules that run some code to configure or set up the testing framework before each test
  setupFilesAfterEnv: ['jest-plugin-must-assert'],

  // The number of seconds after which a test is considered as slow and reported as such in the results.
  slowTestThreshold: 5,

  // The test environment that will be used for testing
  testEnvironment: 'node',

  // Sonarqube
  testResultsProcessor: 'jest-sonar-reporter',

  // Directories to search for tests
  roots: ['<rootDir>/src'],
};
