/**
 * Enhanced memory management module for handling large document processing
 */

// Constants for memory management
const MEMORY_CRITICAL_THRESHOLD_MB = 1024; // 1GB - critical memory threshold
const MEMORY_WARNING_THRESHOLD_MB = 768;   // 768MB - warning memory threshold
const GC_INTERVAL_MS = 30000;              // Run GC every 30 seconds if possible

// Memory monitoring class
export class EnhancedMemoryManager {
  constructor(options = {}) {
    this.options = {
      enableLogging: options.enableLogging ?? true,
      enableAutoGC: options.enableAutoGC ?? true,
      criticalThresholdMb: options.criticalThresholdMb ?? MEMORY_CRITICAL_THRESHOLD_MB,
      warningThresholdMb: options.warningThresholdMb ?? MEMORY_WARNING_THRESHOLD_MB,
      gcIntervalMs: options.gcIntervalMs ?? GC_INTERVAL_MS,
      onCriticalMemory: options.onCriticalMemory || null
    };
    
    this.maxMemoryUsage = 0;
    this.memoryMonitorInterval = null;
    this.gcInterval = null;
    this.memoryWarningIssued = false;
    this.lastGcTime = 0;
    
    // Memory usage history for trend analysis
    this.memoryHistory = [];
    this.memoryHistoryLength = 10;
  }
  
  /**
   * Start memory monitoring and optional automatic GC
   */
  startMonitoring() {
    // Only run server-side
    if (typeof process === 'undefined' || typeof process.memoryUsage !== 'function') {
      return false;
    }
    
    // Start memory monitoring
    this.memoryMonitorInterval = setInterval(() => {
      this._checkMemoryUsage();
    }, 5000);
    
    // Start automatic GC if enabled
    if (this.options.enableAutoGC) {
      this.gcInterval = setInterval(() => {
        this.forceGC();
      }, this.options.gcIntervalMs);
    }
    
    return true;
  }
  
  /**
   * Stop memory monitoring
   */
  stopMonitoring() {
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
      this.memoryMonitorInterval = null;
    }
    
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
    }
  }
  
  /**
   * Check current memory usage and update memory metrics
   * Trigger warnings or GC as needed
   */
  _checkMemoryUsage() {
    try {
      const memoryUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
      const residentSetMB = Math.round(memoryUsage.rss / 1024 / 1024);
      
      // Update max memory usage
      this.maxMemoryUsage = Math.max(this.maxMemoryUsage, heapUsedMB);
      
      // Add to history with timestamp
      this.memoryHistory.push({
        timestamp: Date.now(),
        heapUsedMB,
        residentSetMB
      });
      
      // Keep history limited to last N entries
      if (this.memoryHistory.length > this.memoryHistoryLength) {
        this.memoryHistory.shift();
      }
      
      // Check for memory warnings
      if (heapUsedMB > this.options.criticalThresholdMb) {
        // Critical memory situation
        this._handleCriticalMemory(heapUsedMB);
      }
      else if (heapUsedMB > this.options.warningThresholdMb) {
        // Warning level memory
        if (!this.memoryWarningIssued) {
          this.memoryWarningIssued = true;
          this.logMemoryWarning(heapUsedMB);
          // Try to free some memory
          this.forceGC();
        }
      }
      else {
        // Memory usage back to normal
        this.memoryWarningIssued = false;
      }
      
      // Log memory usage if enabled
      if (this.options.enableLogging && (heapUsedMB > this.options.warningThresholdMb || Math.random() < 0.1)) {
        this.logMemoryUsage();
      }
      
      // Return current memory metrics
      return {
        heapUsedMB,
        residentSetMB,
        isWarningLevel: heapUsedMB > this.options.warningThresholdMb,
        isCriticalLevel: heapUsedMB > this.options.criticalThresholdMb
      };
    }
    catch (err) {
      console.error('Error checking memory usage:', err);
      return null;
    }
  }
  
  /**
   * Handle critical memory situations
   */
  _handleCriticalMemory(heapUsedMB) {
    this.logMemoryCritical(heapUsedMB);
    
    // Force garbage collection
    this.forceGC();
    
    // Call custom handler if provided
    if (this.options.onCriticalMemory && typeof this.options.onCriticalMemory === 'function') {
      try {
        this.options.onCriticalMemory(heapUsedMB);
      }
      catch (err) {
        console.error('Error in critical memory handler:', err);
      }
    }
  }
  
  /**
   * Force garbage collection if available
   * Return true if GC was triggered, false otherwise
   */
  forceGC() {
    const now = Date.now();
    
    // Only run GC if sufficient time has passed since last GC
    if (now - this.lastGcTime < 5000) {
      return false;
    }
    
    try {
      if (global.gc) {
        global.gc();
        this.lastGcTime = now;
        
        // Allow time for GC to complete
        return true;
      }
      else {
        if (this.options.enableLogging) {
          console.warn('Garbage collection not exposed. Run Node.js with --expose-gc flag to enable.');
        }
        return false;
      }
    }
    catch (err) {
      console.error('Error forcing garbage collection:', err);
      return false;
    }
  }
  
  /**
   * Log current memory usage
   */
  logMemoryUsage() {
    if (!this.options.enableLogging) return;
    
    const memoryUsage = process.memoryUsage();
    console.log('📊 Memory usage:', {
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
      maxObserved: `${this.maxMemoryUsage}MB`
    });
  }
  
  /**
   * Log memory warning
   */
  logMemoryWarning(heapUsedMB) {
    if (!this.options.enableLogging) return;
    
    console.warn(`⚠️ HIGH MEMORY USAGE: ${heapUsedMB}MB used (warning threshold: ${this.options.warningThresholdMb}MB)`);
  }
  
  /**
   * Log critical memory situation
   */
  logMemoryCritical(heapUsedMB) {
    if (!this.options.enableLogging) return;
    
    console.error(`🚨 CRITICAL MEMORY USAGE: ${heapUsedMB}MB used (critical threshold: ${this.options.criticalThresholdMb}MB)`);
  }
  
  /**
   * Get memory trend analysis
   */
  getMemoryTrend() {
    if (this.memoryHistory.length < 2) {
      return {
        trend: 'unknown',
        growthRate: 0,
        isGrowing: false,
        currentUsage: 0
      };
    }
    
    // Calculate trend based on last few samples
    const firstSample = this.memoryHistory[0];
    const lastSample = this.memoryHistory[this.memoryHistory.length - 1];
    
    const memoryDiff = lastSample.heapUsedMB - firstSample.heapUsedMB;
    const timeDiffSeconds = (lastSample.timestamp - firstSample.timestamp) / 1000;
    
    // Calculate growth rate in MB per minute
    const growthRatePerMinute = timeDiffSeconds > 0 ? (memoryDiff / timeDiffSeconds) * 60 : 0;
    
    return {
      trend: growthRatePerMinute > 10 ? 'rapidly-increasing' : 
             growthRatePerMinute > 2 ? 'increasing' :
             growthRatePerMinute < -5 ? 'decreasing' : 'stable',
      growthRate: growthRatePerMinute,
      isGrowing: growthRatePerMinute > 1,
      timePeriodSeconds: timeDiffSeconds,
      currentUsage: lastSample.heapUsedMB
    };
  }
}

// Convenience exports
export function createMemoryManager(options = {}) {
  return new EnhancedMemoryManager(options);
}

export function logMemory(label = "Memory usage") {
  try {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const mem = process.memoryUsage();
      console.log(
        `${label}: RSS ${Math.round(mem.rss / 1024 / 1024)}MB, Heap ${Math.round(mem.heapUsed / 1024 / 1024)}MB/${Math.round(mem.heapTotal / 1024 / 1024)}MB`
      );
      return true;
    }
  } catch (err) {
    // Ignore errors in memory logging
  }
  return false;
}

export function forceGC() {
  try {
    if (global.gc) {
      global.gc();
      return true;
    }
  } catch (e) {
    // Ignore errors in GC
  }
  return false;
}