/**
 * Performance monitoring utility for Three.js applications
 */
class PerformanceMonitor {
  constructor() {
    this.stats = {
      fps: 0,
      frameTime: 0,
      memoryUsage: 0,
      drawCalls: 0,
      triangles: 0,
      geometries: 0,
      textures: 0
    };
    
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.fpsUpdateInterval = 1000; // Update FPS every second
    this.lastFpsUpdate = 0;
    
    // Create debug overlay
    this.createDebugOverlay();
    
    // Monitor memory if available
    this.memoryMonitoringAvailable = 'memory' in performance;
  }
  
  createDebugOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'performance-monitor';
    this.overlay.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 10px;
      font-family: monospace;
      font-size: 12px;
      z-index: 10000;
      border-radius: 5px;
      min-width: 200px;
      display: none;
    `;
    document.body.appendChild(this.overlay);
  }
  
  show() {
    if (this.overlay) {
      this.overlay.style.display = 'block';
    }
  }
  
  hide() {
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }
  }
  
  toggle() {
    if (this.overlay.style.display === 'none') {
      this.show();
    } else {
      this.hide();
    }
  }
  
  update(renderer, scene, camera) {
    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastTime;
    
    this.frameCount++;
    this.stats.frameTime = deltaTime;
    
    // Update FPS
    if (currentTime - this.lastFpsUpdate >= this.fpsUpdateInterval) {
      this.stats.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = currentTime;
    }
    
    // Update memory usage
    if (this.memoryMonitoringAvailable) {
      this.stats.memoryUsage = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
    }
    
    // Update Three.js specific stats
    if (renderer && renderer.info) {
      this.stats.drawCalls = renderer.info.render.calls;
      this.stats.triangles = renderer.info.render.triangles;
      this.stats.geometries = renderer.info.memory.geometries;
      this.stats.textures = renderer.info.memory.textures;
    }
    
    this.updateDisplay();
    this.lastTime = currentTime;
  }
  
  updateDisplay() {
    if (!this.overlay || this.overlay.style.display === 'none') return;
    
    const memoryInfo = this.memoryMonitoringAvailable 
      ? `Memory: ${this.stats.memoryUsage}MB` 
      : 'Memory: N/A';
    
    this.overlay.innerHTML = `
      <div><strong>Performance Monitor</strong></div>
      <div>FPS: ${this.stats.fps}</div>
      <div>Frame Time: ${this.stats.frameTime.toFixed(2)}ms</div>
      <div>${memoryInfo}</div>
      <div>Draw Calls: ${this.stats.drawCalls}</div>
      <div>Triangles: ${this.stats.triangles.toLocaleString()}</div>
      <div>Geometries: ${this.stats.geometries}</div>
      <div>Textures: ${this.stats.textures}</div>
      <div style="margin-top: 5px; font-size: 10px; color: #aaa;">
        Press 'P' to toggle
      </div>
    `;
  }
  
  // Analyze performance and provide recommendations
  getRecommendations() {
    const recommendations = [];
    
    if (this.stats.fps < 30) {
      recommendations.push({
        severity: 'high',
        message: 'Low FPS detected. Consider reducing quality settings.',
        category: 'fps'
      });
    }
    
    if (this.stats.drawCalls > 100) {
      recommendations.push({
        severity: 'medium',
        message: 'High draw call count. Consider batching geometries.',
        category: 'rendering'
      });
    }
    
    if (this.stats.triangles > 500000) {
      recommendations.push({
        severity: 'medium',
        message: 'High triangle count. Consider LOD or simplification.',
        category: 'geometry'
      });
    }
    
    if (this.memoryMonitoringAvailable && this.stats.memoryUsage > 100) {
      recommendations.push({
        severity: 'medium',
        message: 'High memory usage. Check for memory leaks.',
        category: 'memory'
      });
    }
    
    return recommendations;
  }
  
  dispose() {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
  }
}

export default PerformanceMonitor; 