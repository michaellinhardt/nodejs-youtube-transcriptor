/**
 * Environment Configuration Loader
 *
 * Manages dotenv integration and validation implementing TR-11
 * Provides clear error messages for configuration issues
 */
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

/**
 * Load environment variables from .env file
 * Validates required variables are present
 * Exits process with code 1 if configuration invalid
 *
 * @returns {void}
 */
function load() {
  // Check .env file exists
  // Navigate from src/utils/ up to package root
  const envPath = path.resolve(__dirname, '../../.env');

  if (!fs.existsSync(envPath)) {
    console.error('Error: .env file not found');
    console.error('');
    console.error('To fix this issue:');
    console.error('  1. Copy .env.example to .env in the package installation directory');
    console.error('  2. Edit .env and add your API key');
    console.error('');
    console.error('Expected location:', envPath);
    process.exit(1);
  }

  // Load variables from .env
  const result = dotenv.config({ path: envPath });

  if (result.error) {
    console.error('Error loading .env file:', result.error.message);
    process.exit(1);
  }

  // Validate required variables present
  // Skip validation if NODE_ENV=structure-test (allows testing without API key)
  if (process.env.NODE_ENV !== 'structure-test') {
    validate();
  }
}

/**
 * Validate required environment variables are set
 * Exits process if any required variables missing
 *
 * @returns {void}
 */
function validate() {
  const requiredKeys = ['SCRAPE_CREATORS_API_KEY'];
  const missing = requiredKeys.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(`Error: Missing required environment variables: ${missing.join(', ')}`);
    console.error('');
    console.error('Please add the following to your .env file:');
    missing.forEach((key) => {
      console.error(`  ${key}=your_value_here`);
    });
    console.error('');
    process.exit(1);
  }
}

/**
 * Get API key from environment
 * @returns {string} API key value
 * @throws {Error} If API key not set or empty
 */
function getApiKey() {
  const key = process.env.SCRAPE_CREATORS_API_KEY;
  if (!key || typeof key !== 'string' || key.trim() === '') {
    throw new Error(
      'SCRAPE_CREATORS_API_KEY not set. ' +
        'This is required even in test environments when making API calls. ' +
        'Add it to your .env file.'
    );
  }
  return key;
}

module.exports = {
  load,
  validate,
  getApiKey,
};
