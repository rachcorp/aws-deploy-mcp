// eslint.config.js (ESLint 9+ flat config)
module.exports = [
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script', // CommonJS modules
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly'
      }
    },
    rules: {
      'indent': ['warn', 2], // Warn instead of error
      'linebreak-style': ['error', 'unix'],
      'quotes': ['warn', 'single'], // Warn instead of error
      'semi': ['error', 'always'],
      'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }], // Warn instead of error
      'no-console': 'off',
      'no-process-exit': 'off',
      'no-undef': 'error'
    }
  },
  // Special rules for test files
  {
    files: ['**/*.test.js', '**/__tests__/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly'
      }
    }
  },
  {
    ignores: [
      'node_modules/',
      'dist/',
      'coverage/',
      '*.min.js'
    ]
  }
]; 