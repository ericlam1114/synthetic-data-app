// lib/services/monitoringService.js

/**
 * Error recovery and monitoring service
 * Implements monitoring, logging, and recovery for document processing pipelines
 */
class MonitoringService {
  constructor(options = {}) {
    this.options = {
      enablePerformanceMetrics:
        options.enablePerformanceMetrics ||
        process.env.ENABLE_PERFORMANCE_METRICS !== "false",
      enableErrorReporting:
        options.enableErrorReporting ||
        process.env.ENABLE_ERROR_REPORTING !== "false",
      enableDetailedLogs:
        options.enableDetailedLogs ||
        process.env.ENABLE_DETAILED_LOGS === "true",
      logLevel: options.logLevel || process.env.LOG_LEVEL || "info",
      metricsNamespace:
        options.metricsNamespace ||
        process.env.METRICS_NAMESPACE ||
        "synthetic-data-pipeline",
    };

    // Initialize performance metrics
    this.metrics = {
      requests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageProcessingTimeMs: 0,
      totalProcessingTimeMs: 0,
      maxProcessingTimeMs: 0,
      minProcessingTimeMs: Number.MAX_SAFE_INTEGER,
      byPipelineType: {},
    };

    // Initialize error tracking
    this.errors = [];
    this.maxErrorsStored = 50;

    // Track currently running processes
    this.runningProcesses = new Map();

    // Monitoring interval
    this.monitoringInterval = null;
    if (this.options.enablePerformanceMetrics) {
      this.startMonitoring();
    }
  }

  /**
   * Start periodic monitoring
   */
  startMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    // Check status of running processes every minute
    this.monitoringInterval = setInterval(() => {
      this.checkRunningProcesses();
    }, 60000);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Register a new processing request
   * @param {string} processId - Unique ID for the process
   * @param {Object} metadata - Process metadata
   * @returns {string} - The process ID
   */
  registerProcess(processId, metadata = {}) {
    const id = processId || generateId();

    this.runningProcesses.set(id, {
      id,
      startTime: Date.now(),
      status: "running",
      lastActivity: Date.now(),
      progress: 0,
      stage: "initialization",
      metadata,
      logs: [],
    });

    this.metrics.requests++;

    // Initialize pipeline-specific metrics if needed
    const pipelineType = metadata.pipelineType || "unknown";
    if (!this.metrics.byPipelineType[pipelineType]) {
      this.metrics.byPipelineType[pipelineType] = {
        requests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageProcessingTimeMs: 0,
        totalProcessingTimeMs: 0,
      };
    }
    this.metrics.byPipelineType[pipelineType].requests++;

    return id;
  }

  /**
   * Update process status
   * @param {string} processId - Process ID
   * @param {Object} update - Status update
   */
  updateProcess(processId, update = {}) {
    if (!this.runningProcesses.has(processId)) {
      return false;
    }

    const process = this.runningProcesses.get(processId);

    // Update fields
    if (update.progress !== undefined) {
      process.progress = update.progress;
    }

    if (update.stage) {
      process.stage = update.stage;
    }

    if (update.message) {
      if (this.options.enableDetailedLogs) {
        process.logs.push({
          time: Date.now(),
          message: update.message,
          stage: update.stage || process.stage,
        });
      }
    }

    // Update last activity time
    process.lastActivity = Date.now();

    this.runningProcesses.set(processId, process);
    return true;
  }

  /**
   * Complete a process (success)
   * @param {string} processId - Process ID
   * @param {Object} result - Processing result
   */
  completeProcess(processId, result = {}) {
    if (!this.runningProcesses.has(processId)) {
      return false;
    }

    const process = this.runningProcesses.get(processId);
    const endTime = Date.now();
    const duration = endTime - process.startTime;

    // Update process status
    process.status = "completed";
    process.endTime = endTime;
    process.duration = duration;
    process.result = result;

    // Update metrics
    this.metrics.successfulRequests++;
    this.metrics.totalProcessingTimeMs += duration;
    this.metrics.averageProcessingTimeMs =
      this.metrics.totalProcessingTimeMs / this.metrics.successfulRequests;
    this.metrics.maxProcessingTimeMs = Math.max(
      this.metrics.maxProcessingTimeMs,
      duration
    );
    this.metrics.minProcessingTimeMs = Math.min(
      this.metrics.minProcessingTimeMs,
      duration
    );

    // Update pipeline-specific metrics
    const pipelineType = process.metadata.pipelineType || "unknown";
    if (this.metrics.byPipelineType[pipelineType]) {
      const pipelineMetrics = this.metrics.byPipelineType[pipelineType];
      pipelineMetrics.successfulRequests++;
      pipelineMetrics.totalProcessingTimeMs += duration;
      pipelineMetrics.averageProcessingTimeMs =
        pipelineMetrics.totalProcessingTimeMs /
        pipelineMetrics.successfulRequests;
    }

    // Keep process in running list for a short time, then remove
    setTimeout(() => {
      this.runningProcesses.delete(processId);
    }, 300000); // Keep for 5 minutes

    return true;
  }

  /**
   * Mark a process as failed
   * @param {string} processId - Process ID
   * @param {Error|Object} error - Error that occurred
   */
  failProcess(processId, error) {
    if (!this.runningProcesses.has(processId)) {
      return false;
    }

    const process = this.runningProcesses.get(processId);
    const endTime = Date.now();
    const duration = endTime - process.startTime;

    // Update process status
    process.status = "failed";
    process.endTime = endTime;
    process.duration = duration;
    process.error = {
      message: error.message || "Unknown error",
      stack: error.stack,
      time: new Date().toISOString(),
    };

    // Log the error
    this.logError(error, {
      processId,
      pipelineType: process.metadata.pipelineType,
      duration,
    });

    // Update metrics
    this.metrics.failedRequests++;

    // Update pipeline-specific metrics
    const pipelineType = process.metadata.pipelineType || "unknown";
    if (this.metrics.byPipelineType[pipelineType]) {
      this.metrics.byPipelineType[pipelineType].failedRequests++;
    }

    // Keep process in running list for a short time, then remove
    setTimeout(() => {
      this.runningProcesses.delete(processId);
    }, 300000); // Keep for 5 minutes

    return true;
  }

  /**
   * Check all running processes for timeouts or issues
   */
  checkRunningProcesses() {
    const now = Date.now();
    const timeoutThresholdMs = 15 * 60 * 1000; // 15 minutes
    const inactivityThresholdMs = 5 * 60 * 1000; // 5 minutes

    for (const [id, process] of this.runningProcesses.entries()) {
      // Skip processes that are already completed or failed
      if (process.status !== "running") {
        continue;
      }

      // Check for overall timeout
      const runtime = now - process.startTime;
      if (runtime > timeoutThresholdMs) {
        this.logWarning(
          `Process ${id} has been running for ${Math.round(
            runtime / 1000 / 60
          )} minutes - marking as failed due to timeout`
        );
        this.failProcess(id, new Error("Process timed out"));
        continue;
      }

      // Check for inactivity
      const inactivityTime = now - process.lastActivity;
      if (inactivityTime > inactivityThresholdMs) {
        this.logWarning(
          `Process ${id} has been inactive for ${Math.round(
            inactivityTime / 1000 / 60
          )} minutes - checking status`
        );

        // Log the inactivity but don't fail the process yet
        this.updateProcess(id, {
          message: `Warning: No activity detected for ${Math.round(
            inactivityTime / 1000 / 60
          )} minutes`,
        });
      }
    }
  }

  /**
   * Log an error with context
   * @param {Error|Object} error - Error to log
   * @param {Object} context - Additional context
   */
  logError(error, context = {}) {
    if (!this.options.enableErrorReporting) {
      return;
    }

    const errorObj = {
      message: error.message || "Unknown error",
      stack: error.stack,
      time: new Date().toISOString(),
      context,
    };

    // Add to error log with size limit
    this.errors.unshift(errorObj);
    if (this.errors.length > this.maxErrorsStored) {
      this.errors.pop();
    }

    // Log to console
    console.error(`[${errorObj.time}] Error:`, errorObj.message, context);
    if (error.stack && this.options.logLevel === "debug") {
      console.error(error.stack);
    }

    // In a production environment, you could send this to an error reporting service
    // such as Sentry, DataDog, New Relic, etc.
  }

  /**
   * Log a warning
   * @param {string} message - Warning message
   * @param {Object} context - Additional context
   */
  logWarning(message, context = {}) {
    if (this.options.logLevel === "error") {
      return;
    }

    console.warn(`[${new Date().toISOString()}] Warning:`, message, context);
  }


  /**
   * Log an info message
   * @param {string} message - Info message
   * @param {Object} context - Additional context
   */
  logInfo(message, context = {}) {
    if (this.options.logLevel === "error" || this.options.logLevel === "warn") {
      return;
    }

    if (this.options.enableDetailedLogs) {
      console.log(`[${new Date().toISOString()}] Info:`, message, context);
    }
  }

  /**
   * Log a debug message
   * @param {string} message - Debug message
   * @param {Object} context - Additional context
   */
  logDebug(message, context = {}) {
    if (this.options.logLevel !== "debug") {
      return;
    }

    console.debug(`[${new Date().toISOString()}] Debug:`, message, context);
  }

  /**
   * Get processing statistics
   * @returns {Object} - Processing statistics
   */
  getStats() {
    return {
      metrics: this.metrics,
      runningProcesses: Array.from(this.runningProcesses.values()).map(
        (process) => ({
          id: process.id,
          status: process.status,
          progress: process.progress,
          stage: process.stage,
          runtime: process.startTime
            ? Math.round((Date.now() - process.startTime) / 1000)
            : 0,
          pipelineType: process.metadata.pipelineType,
        })
      ),
      errorCount: this.errors.length,
    };
  }

  /**
   * Get recent errors
   * @param {number} limit - Maximum number of errors to return
   * @returns {Array} - Recent errors
   */
  getRecentErrors(limit = 10) {
    return this.errors.slice(0, limit);
  }

  /**
   * Get a specific process
   * @param {string} processId - Process ID
   * @returns {Object|null} - Process info or null if not found
   */
  getProcess(processId) {
    if (!this.runningProcesses.has(processId)) {
      return null;
    }

    return this.runningProcesses.get(processId);
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      requests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageProcessingTimeMs: 0,
      totalProcessingTimeMs: 0,
      maxProcessingTimeMs: 0,
      minProcessingTimeMs: Number.MAX_SAFE_INTEGER,
      byPipelineType: {},
    };

    this.errors = [];
  }

  /**
   * Record error recovery attempt
   * @param {string} processId - Process ID
   * @param {string} strategy - Recovery strategy used
   * @param {boolean} success - Whether recovery was successful
   */
  recordRecoveryAttempt(processId, strategy, success) {
    if (!this.runningProcesses.has(processId)) {
      return false;
    }

    const process = this.runningProcesses.get(processId);

    // Initialize recovery attempts array if needed
    if (!process.recoveryAttempts) {
      process.recoveryAttempts = [];
    }

    // Add new recovery attempt
    process.recoveryAttempts.push({
      time: Date.now(),
      strategy,
      success,
      processStage: process.stage,
      processProgress: process.progress,
    });

    // Log the recovery attempt
    this.logInfo(
      `Recovery attempt for process ${processId} using strategy "${strategy}": ${
        success ? "successful" : "failed"
      }`,
      {
        processId,
        pipelineType: process.metadata.pipelineType,
        recoveryAttempt: process.recoveryAttempts.length,
      }
    );

    return true;
  }

  /**
   * Try to recover a failing process
   * @param {string} processId - Process ID
   * @returns {boolean} - Whether recovery was attempted
   */
  tryRecoverProcess(processId) {
    if (!this.runningProcesses.has(processId)) {
      return false;
    }

    const process = this.runningProcesses.get(processId);

    // Skip if process is not running (already completed or failed)
    if (process.status !== "running") {
      return false;
    }

    // Check if process is stuck
    const now = Date.now();
    const inactivityTime = now - process.lastActivity;
    const inactivityThresholdMs = 3 * 60 * 1000; // 3 minutes

    if (inactivityTime < inactivityThresholdMs) {
      // Not inactive long enough to attempt recovery
      return false;
    }

    // Determine best recovery strategy based on pipeline stage
    let recoveryStrategy;
    let recoverySuccess = false;

    switch (process.stage) {
      case "chunking":
        // If stuck in chunking, try reducing chunk size
        recoveryStrategy = "reduce_chunk_size";

        // Implement actual recovery logic here
        // For example, send a message to the process to reduce chunk size
        // This would require additional API endpoints and process communication

        // For now, just log the attempt
        this.logWarning(
          `Attempting to recover stuck process ${processId} by reducing chunk size`
        );
        recoverySuccess = false; // Replace with actual recovery result
        break;

      case "extraction":
      case "classification":
      case "generation":
        // If stuck in AI processing stages, try restarting the current stage
        recoveryStrategy = "restart_current_stage";

        // Implement actual recovery logic here

        this.logWarning(
          `Attempting to recover stuck process ${processId} by restarting the ${process.stage} stage`
        );
        recoverySuccess = false; // Replace with actual recovery result
        break;

      default:
        // No specific recovery strategy for this stage
        recoveryStrategy = "none";
        recoverySuccess = false;
    }

    // Record the recovery attempt
    this.recordRecoveryAttempt(processId, recoveryStrategy, recoverySuccess);

    return recoverySuccess;
  }
}

/**
 * Generate a random ID
 * @returns {string} - Random ID
 */
function generateId() {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

// Create singleton instance
const monitoringService = new MonitoringService();

export default monitoringService;
