// lib/utils/memoryManager.js
export function forceGC() {
    if (global.gc) {
      global.gc();
    } else {
      console.warn("No garbage collection exposed - run with --expose-gc flag");
    }
  }
  
  export function memoryReport() {
    if (typeof process !== "undefined" && process.memoryUsage) {
      const mem = process.memoryUsage();
      return {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        external: Math.round(mem.external / 1024 / 1024),
      };
    }
    return null;
  }
  
  export function logMemory(label = "Memory usage") {
    const mem = memoryReport();
    if (mem) {
      console.log(
        `${label}: RSS ${mem.rss}MB, Heap ${mem.heapUsed}MB/${mem.heapTotal}MB`
      );
    }
  }