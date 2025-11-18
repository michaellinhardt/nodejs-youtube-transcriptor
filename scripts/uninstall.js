#!/usr/bin/env node

/**
 * Uninstallation Script for Transcriptor
 *
 * Removes global package and optionally cleans up data
 * Implements task 9.3.2 from deployment plan
 *
 * Features:
 * - Safe data retention by default
 * - Interactive prompt for data deletion
 * - npm unlink execution
 * - Complete cleanup of symbolic links
 * - Security: Validates paths, prevents script injection
 */

const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const readline = require('readline');

/**
 * Path resolver for storage location
 * Matches pathResolver utility but standalone for uninstall independence
 */
const pathResolver = {
  getStoragePath() {
    const home = process.env.HOME || process.env.USERPROFILE;
    if (!home) {
      throw new Error('Cannot determine home directory');
    }
    return path.join(home, '.transcriptor');
  }
};

/**
 * Create readline interface for user prompts
 * @returns {readline.Interface}
 */
function createPrompt() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Prompt user for data deletion decision
 * Returns promise for async/await compatibility
 *
 * @param {readline.Interface} rl - Readline interface
 * @returns {Promise<boolean>} True if user confirms deletion
 */
function promptDataCleanup(rl) {
  return new Promise((resolve) => {
    rl.question(
      '\nDo you want to remove all transcript data from ~/.transcriptor? (yes/no) [no]: ',
      (answer) => {
        // Security: Only accept explicit 'yes' for deletion
        // Prevents accidental data loss from mistyped input
        const normalized = answer.trim().toLowerCase();
        resolve(normalized === 'yes');
      }
    );
  });
}

/**
 * Remove global npm link
 * Handles both npm link and npm install -g scenarios
 */
function removeGlobalLink() {
  console.log('Removing global transcriptor command...');

  try {
    // Try npm unlink first (for npm link installations)
    execSync('npm unlink -g nodejs-youtube-transcriptor', {
      stdio: 'pipe'
    });
    console.log('✓ Global link removed');
  } catch (error) {
    // Fallback to npm uninstall (for npm install -g installations)
    try {
      execSync('npm uninstall -g nodejs-youtube-transcriptor', {
        stdio: 'pipe'
      });
      console.log('✓ Global package uninstalled');
    } catch (uninstallError) {
      console.warn('⚠ No global installation found (already removed?)');
    }
  }
}

/**
 * Get statistics about data to be deleted
 * Helps user make informed decision
 *
 * @param {string} storagePath - Path to .transcriptor directory
 * @returns {Object} Statistics object
 */
async function getDataStatistics(storagePath) {
  try {
    const registryPath = path.join(storagePath, 'data.json');
    const transcriptsPath = path.join(storagePath, 'transcripts');

    const stats = {
      exists: await fs.pathExists(storagePath),
      transcriptCount: 0,
      totalSize: 0
    };

    if (!stats.exists) {
      return stats;
    }

    // Count transcripts from registry
    if (await fs.pathExists(registryPath)) {
      const registry = await fs.readJson(registryPath);
      stats.transcriptCount = Object.keys(registry).length;
    }

    // Calculate total size
    if (await fs.pathExists(transcriptsPath)) {
      const files = await fs.readdir(transcriptsPath);
      for (const file of files) {
        const filePath = path.join(transcriptsPath, file);
        const fileStat = await fs.stat(filePath);
        stats.totalSize += fileStat.size;
      }
    }

    return stats;
  } catch (error) {
    console.warn('⚠ Could not read data statistics:', error.message);
    return { exists: false, transcriptCount: 0, totalSize: 0 };
  }
}

/**
 * Format bytes to human-readable size
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Remove all transcript data
 * @param {string} storagePath - Path to .transcriptor directory
 */
async function cleanupData(storagePath) {
  try {
    console.log(`Removing data from ${storagePath}...`);

    // Security: Validate path is within expected location
    const expectedPath = pathResolver.getStoragePath();
    if (storagePath !== expectedPath) {
      throw new Error('Invalid storage path detected');
    }

    await fs.remove(storagePath);
    console.log('✓ All transcript data removed');
  } catch (error) {
    console.error(`✗ Failed to remove data: ${error.message}`);
    throw error;
  }
}

/**
 * Verify command no longer exists
 * @returns {boolean} True if successfully removed
 */
function verifyRemoval() {
  try {
    execSync('transcriptor --version', {
      stdio: 'pipe'
    });
    // If command still exists, verification failed
    return false;
  } catch (error) {
    // Command not found = successful removal
    return true;
  }
}

/**
 * Display data retention information
 * @param {string} storagePath - Path where data is kept
 */
function displayDataRetentionInfo(storagePath) {
  console.log('\n' + '='.repeat(60));
  console.log('Transcript data retained at:');
  console.log(storagePath);
  console.log('\nTo manually remove later:');
  console.log(`  rm -rf ${storagePath}`);
  console.log('='.repeat(60) + '\n');
}

/**
 * Main uninstallation orchestrator
 */
async function main() {
  console.log('Transcriptor Uninstallation\n');

  const rl = createPrompt();

  try {
    const storagePath = pathResolver.getStoragePath();

    // Step 1: Show current data statistics
    const stats = await getDataStatistics(storagePath);

    if (stats.exists) {
      console.log('Current transcript data:');
      console.log(`  Transcripts: ${stats.transcriptCount}`);
      console.log(`  Total size: ${formatSize(stats.totalSize)}`);
      console.log(`  Location: ${storagePath}`);
    } else {
      console.log('No transcript data found');
    }

    // Step 2: Remove global command
    removeGlobalLink();

    // Step 3: Verify removal
    if (verifyRemoval()) {
      console.log('✓ Command removed successfully');
    } else {
      console.warn('⚠ Command may still be accessible (try restarting terminal)');
    }

    // Step 4: Prompt for data cleanup
    if (stats.exists) {
      const shouldCleanup = await promptDataCleanup(rl);

      if (shouldCleanup) {
        await cleanupData(storagePath);
        console.log('\n✓ Uninstallation complete (data removed)');
      } else {
        displayDataRetentionInfo(storagePath);
        console.log('✓ Uninstallation complete (data retained)');
      }
    } else {
      console.log('\n✓ Uninstallation complete');
    }

    rl.close();
    process.exit(0);
  } catch (error) {
    console.error(`\n✗ Uninstallation failed: ${error.message}\n`);
    rl.close();
    process.exit(1);
  }
}

// Execute uninstallation
main();
