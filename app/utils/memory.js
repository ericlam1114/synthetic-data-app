// File: utils/memory.js
/**
 * Utility for managing memory in a streaming process
 */
export class MemoryManager {
    constructor() {
      this.maxMemoryUsage = 0;
      this.checkInterval = null;
    }
  
    /**
     * Start monitoring memory usage
     * @param {number} intervalMs - Check interval in milliseconds
     */
    startMonitoring(intervalMs = 1000) {
      if (typeof process === 'undefined') return;
      
      this.checkInterval = setInterval(() => {
        const memoryUsage = process.memoryUsage();
        const heapUsed = memoryUsage.heapUsed / 1024 / 1024; // MB
        this.maxMemoryUsage = Math.max(this.maxMemoryUsage, heapUsed);
        
        // Log if memory usage is high
        if (heapUsed > 500) { // 500MB threshold
          console.warn(`High memory usage: ${heapUsed.toFixed(2)} MB`);
        }
      }, intervalMs);
    }
  
    /**
     * Stop monitoring memory usage
     */
    stopMonitoring() {
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
      }
    }
  
    /**
     * Get the maximum memory usage observed
     * @returns {number} Maximum memory usage in MB
     */
    getMaxMemoryUsage() {
      return this.maxMemoryUsage;
    }
  
    /**
     * Request garbage collection if available
     * (Note: This requires Node.js to be run with --expose-gc flag)
     */
    triggerGC() {
      if (global.gc) {
        global.gc();
      }
    }
  }