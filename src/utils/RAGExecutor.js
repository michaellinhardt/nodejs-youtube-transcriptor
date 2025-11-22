/**
 * RAGExecutor - RAG Generator Process Execution Utility
 *
 * Implements FR-12.2, TR-37, TR-38, TR-39, TR-40
 *
 * Spawns claude-code RAG generator command in ./transcripts directory
 * Provides non-blocking execution with real-time output streaming
 * Handles all error scenarios as non-fatal (RAG failures don't impact transcript processing)
 *
 * Usage:
 *   const RAGExecutor = require('../utils/RAGExecutor');
 *   const result = await RAGExecutor.execute(process.cwd());
 *
 * @module RAGExecutor
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

class RAGExecutor {
  /**
   * Execute RAG generator in ./transcripts directory
   *
   * Implements FR-12.2: Execute RAG generator after successful processing
   * Implements TR-37: RAG process execution with spawn
   * Implements TR-38: Process spawn implementation with correct options
   * Implements TR-39: Working directory configuration
   * Implements TR-40: RAG generator error handling (non-fatal)
   *
   * Command: claude --dangerously-skip-permissions -p /rag-generator
   * Working directory: {projectDir}/transcripts
   * Output: Direct to console (stdio: inherit)
   *
   * Error handling:
   * - ENOENT: Command not found (claude not installed)
   * - EACCES: Permission denied
   * - Spawn errors: Unexpected process spawn failures
   * - Exit non-zero: RAG process ran but failed
   * - All errors are NON-FATAL per FR-12.3
   *
   * @param {string} projectDir - Project root directory (defaults to cwd)
   * @returns {Promise<Object>} Result object with executed, exitCode, error
   *
   * Result object schema:
   * {
   *   executed: boolean,      // true if spawn attempted
   *   exitCode: number|null,  // 0 for success, non-zero for failure, null if spawn failed
   *   error: string|null      // Error message if spawn/execution failed
   * }
   *
   * @throws {Error} Only if transcripts directory doesn't exist (validation error)
   */
  static async execute(projectDir = process.cwd()) {
    const transcriptsDir = path.resolve(projectDir, 'transcripts');

    // TR-39: Validate working directory exists
    const dirExists = await fs.pathExists(transcriptsDir);
    if (!dirExists) {
      throw new Error(`Transcripts directory not found: ${transcriptsDir}`);
    }

    return new Promise((resolve) => {
      // TR-38: Spawn configuration per specification
      // Use explicit cd command to ensure proper directory context
      const command = `cd "${transcriptsDir}" && claude --dangerously-skip-permissions -p /rag-generator && cd -`;

      const childProcess = spawn(
        command,
        [],
        {
          stdio: 'inherit', // Direct console output (real-time streaming)
          shell: true, // Enable shell parsing (required for cd command)
          env: process.env // Pass environment variables to child process
        }
      );

      // TR-42: Track process state
      const result = {
        executed: true,
        exitCode: null,
        error: null
      };

      // Handle process completion
      // Close event fires when stdio streams close (most reliable)
      childProcess.on('close', (code, signal) => {
        result.exitCode = code;

        // TR-40: Handle signal termination
        if (signal) {
          result.error = `Process terminated by signal: ${signal}`;
        }

        resolve(result);
      });

      // TR-40: Handle spawn errors (command not found, permission denied, etc.)
      // Error event fires when process fails to spawn
      childProcess.on('error', (err) => {
        result.exitCode = -1;

        // TR-40: Provide actionable error messages based on error code
        if (err.code === 'ENOENT') {
          result.error =
            'Command not found: claude. Please install claude-code CLI tool.';
        } else if (err.code === 'EACCES') {
          result.error =
            'Permission denied executing claude command. Check executable permissions.';
        } else {
          result.error = err.message;
        }

        // Non-fatal: Always resolve, never reject
        resolve(result);
      });
    });
  }
}

module.exports = RAGExecutor;
