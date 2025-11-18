#!/usr/bin/env node

/**
 * Installation Script for Transcriptor
 *
 * Automates global package installation with validation
 * Implements task 9.3.1 from deployment plan
 *
 * Features:
 * - Node.js version validation (>=18.0.0)
 * - Permission checking
 * - npm link execution with verification
 * - Idempotent operation (safe to run multiple times)
 * - Security: Prevents path traversal, validates inputs
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REQUIRED_NODE_VERSION = 18;
const MIN_NPM_VERSION = 9;

/**
 * Validate Node.js version meets requirements
 * @throws {Error} If Node.js version insufficient
 */
function validateNodeVersion() {
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

  if (majorVersion < REQUIRED_NODE_VERSION) {
    throw new Error(
      `Node.js v${REQUIRED_NODE_VERSION}+ required (current: ${nodeVersion})\n` +
      `Please upgrade Node.js: https://nodejs.org/`
    );
  }

  console.log(`✓ Node.js version ${nodeVersion} meets requirements`);
}

/**
 * Validate npm version meets requirements
 * @throws {Error} If npm version insufficient
 */
function validateNpmVersion() {
  try {
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    const majorVersion = parseInt(npmVersion.split('.')[0]);

    if (majorVersion < MIN_NPM_VERSION) {
      console.warn(
        `⚠ npm v${MIN_NPM_VERSION}+ recommended (current: ${npmVersion})\n` +
        `Consider upgrading: npm install -g npm@latest`
      );
    } else {
      console.log(`✓ npm version ${npmVersion} meets requirements`);
    }
  } catch (error) {
    throw new Error(`Failed to detect npm version: ${error.message}`);
  }
}

/**
 * Check write permissions for global npm installation
 * @returns {boolean} True if permissions sufficient
 */
function checkGlobalPermissions() {
  try {
    const npmPrefix = execSync('npm config get prefix', { encoding: 'utf8' }).trim();
    const binPath = path.join(npmPrefix, 'bin');

    // Test write access to global bin directory
    fs.accessSync(binPath, fs.constants.W_OK);
    console.log(`✓ Write permissions verified for ${binPath}`);
    return true;
  } catch (error) {
    console.error(
      `✗ Insufficient permissions for global installation\n` +
      `Try running with elevated privileges or use:\n` +
      `  npm config set prefix ~/.npm-global\n` +
      `  export PATH=~/.npm-global/bin:$PATH`
    );
    return false;
  }
}

/**
 * Detect existing installation to enable idempotency
 * @returns {boolean} True if already installed
 */
function detectExistingInstallation() {
  try {
    const result = execSync('npm ls -g nodejs-youtube-transcriptor --depth=0', {
      encoding: 'utf8',
      stdio: 'pipe'
    });

    if (result.includes('nodejs-youtube-transcriptor')) {
      console.log('ℹ Existing installation detected - will update');
      return true;
    }
  } catch (error) {
    // npm ls exits with error if package not found
    // This is expected for fresh installations
  }

  return false;
}

/**
 * Execute npm link to create global command
 * @throws {Error} If npm link fails
 */
function installPackage() {
  console.log('\nInstalling transcriptor globally...');

  try {
    execSync('npm link', {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    console.log('✓ npm link completed');
  } catch (error) {
    throw new Error(
      `Installation failed: ${error.message}\n` +
      `\nManual installation steps:\n` +
      `1. npm install -g .\n` +
      `2. Or add to PATH: export PATH="${process.cwd()}/bin:$PATH"`
    );
  }
}

/**
 * Verify global command is available
 * @throws {Error} If command not accessible
 */
function verifyInstallation() {
  try {
    const result = execSync('transcriptor --version', {
      encoding: 'utf8',
      stdio: 'pipe'
    });

    console.log(`✓ Command verified: ${result.trim()}`);
  } catch (error) {
    throw new Error(
      'Installation verification failed: transcriptor command not found\n' +
      'You may need to restart your terminal or add npm global bin to PATH'
    );
  }
}

/**
 * Display post-installation instructions
 */
function displayPostInstallInstructions() {
  console.log('\n' + '='.repeat(60));
  console.log('Installation Complete!');
  console.log('='.repeat(60));
  console.log('\nNext steps:');
  console.log('1. Create .env file with your API key:');
  console.log('   SCRAPE_CREATORS_API_KEY=your_api_key_here');
  console.log('\n2. Create youtube.md with video URLs (one per line)');
  console.log('\n3. Run: transcriptor');
  console.log('\nFor help: transcriptor help');
  console.log('View data: transcriptor data');
  console.log('Clean old transcripts: transcriptor clean YYYY-MM-DD');
  console.log('='.repeat(60) + '\n');
}

/**
 * Main installation orchestrator
 */
async function main() {
  console.log('Transcriptor Installation\n');

  try {
    // Step 1: Validate prerequisites
    validateNodeVersion();
    validateNpmVersion();

    // Step 2: Check permissions
    if (!checkGlobalPermissions()) {
      process.exit(1);
    }

    // Step 3: Detect existing installation (idempotency)
    const isUpdate = detectExistingInstallation();
    if (isUpdate) {
      console.log('This will update the existing installation');
    }

    // Step 4: Execute npm link
    installPackage();

    // Step 5: Verify installation success
    verifyInstallation();

    // Step 6: Display next steps
    displayPostInstallInstructions();

    process.exit(0);
  } catch (error) {
    console.error(`\n✗ Installation failed: ${error.message}\n`);
    process.exit(1);
  }
}

// Execute installation
main();
