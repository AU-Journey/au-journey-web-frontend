/**
 * Memory management utility for Three.js applications
 * Helps detect and prevent memory leaks
 */
class MemoryManager {
  constructor() {
    this.trackedObjects = new Set();
    this.memoryHistory = [];
    this.lastMemoryCheck = 0;
    this.memoryCheckInterval = 10000; // Check every 10 seconds
    this.maxHistorySize = 50;
    
    // Memory thresholds
    this.warningThreshold = 200; // MB
    this.criticalThreshold = 500; // MB
    
    this.callbacks = {
      warning: [],
      critical: [],
      leak: []
    };
  }
  
  /**
   * Track an object for memory monitoring
   * @param {Object} object - Object to track
   * @param {string} category - Category for grouping (e.g., 'geometry', 'texture', 'material')
   */
  track(object, category = 'unknown') {
    if (!object) return;
    
    const entry = {
      object,
      category,
      timestamp: Date.now(),
      disposed: false
    };
    
    this.trackedObjects.add(entry);
    
    // Add disposal tracking if the object has a dispose method
    if (object.dispose && typeof object.dispose === 'function') {
      const originalDispose = object.dispose.bind(object);
      object.dispose = () => {
        originalDispose();
        entry.disposed = true;
        this.trackedObjects.delete(entry);
      };
    }
  }
  
  /**
   * Remove an object from tracking
   * @param {Object} object - Object to untrack
   */
  untrack(object) {
    for (const entry of this.trackedObjects) {
      if (entry.object === object) {
        this.trackedObjects.delete(entry);
        break;
      }
    }
  }
  
  /**
   * Update memory monitoring
   */
  update() {
    const currentTime = Date.now();
    
    if (currentTime - this.lastMemoryCheck < this.memoryCheckInterval) {
      return;
    }
    
    this.lastMemoryCheck = currentTime;
    
    // Check browser memory if available
    if ('memory' in performance) {
      const memoryInfo = performance.memory;
      const usedMemoryMB = Math.round(memoryInfo.usedJSHeapSize / 1024 / 1024);
      
      // Add to history
      this.memoryHistory.push({
        timestamp: currentTime,
        used: usedMemoryMB,
        total: Math.round(memoryInfo.totalJSHeapSize / 1024 / 1024),
        limit: Math.round(memoryInfo.jsHeapSizeLimit / 1024 / 1024)
      });
      
      // Limit history size
      if (this.memoryHistory.length > this.maxHistorySize) {
        this.memoryHistory.shift();
      }
      
      // Check thresholds
      this.checkMemoryThresholds(usedMemoryMB);
      
      // Check for memory leaks
      this.detectMemoryLeaks();
    }
    
    // Clean up disposed objects
    this.cleanupDisposedObjects();
  }
  
  /**
   * Check memory usage against thresholds
   * @param {number} usedMemoryMB - Current memory usage in MB
   */
  checkMemoryThresholds(usedMemoryMB) {
    if (usedMemoryMB > this.criticalThreshold) {
      this.triggerCallbacks('critical', {
        type: 'critical',
        memory: usedMemoryMB,
        message: `Critical memory usage: ${usedMemoryMB}MB`
      });
    } else if (usedMemoryMB > this.warningThreshold) {
      this.triggerCallbacks('warning', {
        type: 'warning',
        memory: usedMemoryMB,
        message: `High memory usage: ${usedMemoryMB}MB`
      });
    }
  }
  
  /**
   * Detect potential memory leaks
   */
  detectMemoryLeaks() {
    if (this.memoryHistory.length < 10) return;
    
    // Check for consistent memory growth
    const recent = this.memoryHistory.slice(-10);
    const growthRate = this.calculateGrowthRate(recent);
    
    if (growthRate > 2) { // Growing by more than 2MB per check
      this.triggerCallbacks('leak', {
        type: 'leak',
        growthRate,
        message: `Potential memory leak detected. Growth rate: ${growthRate.toFixed(2)}MB per check`
      });
    }
    
    // Check for objects that haven't been disposed
    const oldObjects = this.getOldUndisposedObjects();
    if (oldObjects.length > 50) {
      this.triggerCallbacks('leak', {
        type: 'leak',
        undisposedCount: oldObjects.length,
        message: `${oldObjects.length} old objects not properly disposed`
      });
    }
  }
  
  /**
   * Calculate memory growth rate
   * @param {Array} samples - Memory samples
   */
  calculateGrowthRate(samples) {
    if (samples.length < 2) return 0;
    
    const first = samples[0].used;
    const last = samples[samples.length - 1].used;
    const timeSpan = samples.length;
    
    return (last - first) / timeSpan;
  }
  
  /**
   * Get objects that are old and haven't been disposed
   */
  getOldUndisposedObjects() {
    const cutoffTime = Date.now() - 300000; // 5 minutes ago
    return Array.from(this.trackedObjects).filter(entry => 
      !entry.disposed && entry.timestamp < cutoffTime
    );
  }
  
  /**
   * Clean up objects marked as disposed
   */
  cleanupDisposedObjects() {
    for (const entry of this.trackedObjects) {
      if (entry.disposed) {
        this.trackedObjects.delete(entry);
      }
    }
  }
  
  /**
   * Add callback for memory events
   * @param {string} type - Event type ('warning', 'critical', 'leak')
   * @param {Function} callback - Callback function
   */
  onMemoryEvent(type, callback) {
    if (this.callbacks[type]) {
      this.callbacks[type].push(callback);
    }
  }
  
  /**
   * Remove callback for memory events
   * @param {string} type - Event type
   * @param {Function} callback - Callback function to remove
   */
  offMemoryEvent(type, callback) {
    if (this.callbacks[type]) {
      const index = this.callbacks[type].indexOf(callback);
      if (index > -1) {
        this.callbacks[type].splice(index, 1);
      }
    }
  }
  
  /**
   * Trigger callbacks for a specific event type
   * @param {string} type - Event type
   * @param {Object} data - Event data
   */
  triggerCallbacks(type, data) {
    if (this.callbacks[type]) {
      this.callbacks[type].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Memory manager callback error:`, error);
        }
      });
    }
  }
  
  /**
   * Force garbage collection if available (for debugging)
   */
  forceGarbageCollection() {
    if (window.gc && typeof window.gc === 'function') {
      window.gc();
      console.log('🗑️ Forced garbage collection');
    } else {
      console.warn('🗑️ Garbage collection not available (run with --expose-gc flag)');
    }
  }
  
  /**
   * Get memory statistics
   */
  getStats() {
    const trackedByCategory = {};
    for (const entry of this.trackedObjects) {
      trackedByCategory[entry.category] = (trackedByCategory[entry.category] || 0) + 1;
    }
    
    const currentMemory = this.memoryHistory.length > 0 
      ? this.memoryHistory[this.memoryHistory.length - 1]
      : null;
    
    return {
      trackedObjects: this.trackedObjects.size,
      trackedByCategory,
      currentMemory,
      memoryHistory: this.memoryHistory.slice(-10), // Last 10 entries
      oldUndisposedObjects: this.getOldUndisposedObjects().length
    };
  }
  
  /**
   * Dispose all tracked objects and cleanup
   */
  dispose() {
    console.log('🧹 Disposing MemoryManager');
    
    // Dispose all tracked objects
    for (const entry of this.trackedObjects) {
      if (entry.object && entry.object.dispose && !entry.disposed) {
        try {
          entry.object.dispose();
        } catch (error) {
          console.warn('Error disposing tracked object:', error);
        }
      }
    }
    
    this.trackedObjects.clear();
    this.memoryHistory = [];
    
    // Clear callbacks
    Object.keys(this.callbacks).forEach(type => {
      this.callbacks[type] = [];
    });
  }
}

export default MemoryManager; 