/**
 * Path Resolver Utility
 *
 * Centralizes all file system path construction implementing TR-10
 * Uses Node.js built-in modules for cross-platform compatibility
 *
 * All paths returned are absolute to prevent ambiguity
 */
const os = require('os');
const path = require('path');

/**
 * Get user home directory path
 * @returns {string} Absolute path to home directory
 * @throws {Error} If home directory cannot be determined
 */
function getHomePath() {
  const home = os.homedir();
  if (!home || typeof home !== 'string' || home.trim() === '') {
    throw new Error('Unable to determine home directory - HOME environment variable not set');
  }
  return home;
}

/**
 * Get transcriptor storage directory path
 * @returns {string} Absolute path to ~/.transcriptor
 */
function getStoragePath() {
  return path.join(getHomePath(), '.transcriptor');
}

/**
 * Get transcripts storage directory path
 * @returns {string} Absolute path to ~/.transcriptor/transcripts
 */
function getTranscriptsPath() {
  return path.join(getStoragePath(), 'transcripts');
}

/**
 * Get registry file path
 * @returns {string} Absolute path to ~/.transcriptor/data.json
 */
function getRegistryPath() {
  return path.join(getStoragePath(), 'data.json');
}

/**
 * Get local project transcripts directory path
 * @returns {string} Absolute path to ./transcripts in current working directory
 * @throws {Error} If current working directory is not accessible
 */
function getLocalTranscriptsPath() {
  let cwd;
  try {
    cwd = process.cwd();
  } catch (error) {
    throw new Error(
      `Unable to access current directory: ${error.message}. Directory may have been deleted.`
    );
  }
  return path.resolve(cwd, 'transcripts');
}

module.exports = {
  getHomePath,
  getStoragePath,
  getTranscriptsPath,
  getRegistryPath,
  getLocalTranscriptsPath,
};
