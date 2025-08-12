import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  AmbientLight,
  DirectionalLight,
  PCFSoftShadowMap,
  Vector3,
  Box3,
  MathUtils,
  DoubleSide
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import TramMovement from './TramMovement.js';
import LoadingUI from './LoadingUI';
import WeatherSystem from './WeatherSystem.js';
import WeatherDisplay from './WeatherDisplay.js';
import TramTracker from './TramTracker.js';
import { gpsRoute } from '../config/gpsRoute.js';
import { optimizeRenderer, optimizeMaterial, optimizeScene, disposeObject, updateDistanceCulling } from '../utils/renderingOptimizations.js';
import PerformanceMonitor from '../utils/PerformanceMonitor.js';
import MapManager from './MapManager.js';
import MemoryManager from '../utils/MemoryManager.js';

class SchoolMap {
  constructor(container) {
    this.container = container;
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new WebGLRenderer({ antialias: true });
    this.controls = null;
    this.mapManager = new MapManager(this.scene);
    this.tramMovement = null;
    this.weatherSystem = null;
    this.weatherDisplay = null;
    this.tramTracker = null;
    
    // Performance monitoring
    this.performanceMonitor = new PerformanceMonitor();
    
    // Memory management
    this.memoryManager = new MemoryManager();
    this.setupMemoryManagement();
    
    // Make memory manager available to other components
    this.scene.userData.memoryManager = this.memoryManager;
    
    // Debug UI throttling
    this.lastDebugUpdate = 0;
    this.debugUpdateInterval = 1000; // 1 second
    
    // Frame counting for optimizations
    this.frameCount = 0;
    
    // Update throttling for performance
    this.lastWeatherUpdate = 0;
    this.lastTramUpdate = 0;
    this.weatherUpdateInterval = 5000; // 5 seconds
    this.tramUpdateInterval = 100; // 100ms for smooth tram movement

    // Loading UI
    this.loadingUI = new LoadingUI();
    this.loadingUI.show();

    this.init();

    // GPS route points from config (kept for fallback purposes only)
    this.gpsPoints = gpsRoute;
  }

  init() {
    // Renderer setup with optimizations using utility functions
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0xbfd1e5); // Sky blue background
    this.container.appendChild(this.renderer.domElement);
    
    // Apply rendering optimizations from utility
    optimizeRenderer(this.renderer);

    // Camera setup: focus on a central area
    this.camera.position.set(0, 20, 50);
    this.camera.lookAt(0, 0, 0);

    // Lighting setup - brighter for better visibility
    const ambientLight = new AmbientLight(0xffffff, 0.8); // Increased from 0.6 to 0.8
    this.scene.add(ambientLight);
    this.ambientLight = ambientLight; // Store reference for weather system

    const directionalLight = new DirectionalLight(0xffffff, 1.0); // Increased from 0.8 to 1.0
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    
    // Optimized shadow settings for better performance
    const shadowMapSize = this.getOptimalShadowMapSize();
    directionalLight.shadow.mapSize.width = shadowMapSize;
    directionalLight.shadow.mapSize.height = shadowMapSize;
    
    // Optimize shadow camera for better performance
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 300; // Reduced from 500
    directionalLight.shadow.camera.left = -80; // Reduced from -100
    directionalLight.shadow.camera.right = 80; // Reduced from 100
    directionalLight.shadow.camera.top = 80; // Reduced from 100
    directionalLight.shadow.camera.bottom = -80; // Reduced from -100
    
    // Additional shadow optimizations
    directionalLight.shadow.bias = -0.0001;
    directionalLight.shadow.normalBias = 0.02;
    this.scene.add(directionalLight);
    this.directionalLight = directionalLight; // Store reference for weather system

    // Add additional fill light to brighten darker areas
    const fillLight = new DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-50, 50, -50); // Opposite direction to main light
    fillLight.castShadow = false; // No shadows for fill light to reduce complexity
    this.scene.add(fillLight);
    this.fillLight = fillLight;

    // Initialize weather system
    this.weatherSystem = new WeatherSystem(this.scene, this.renderer);
    
    // Initialize weather display
    this.weatherDisplay = new WeatherDisplay();
    this.weatherDisplay.show();
    
    // Initialize enhanced tram tracking system
    this.tramTracker = new TramTracker();

    // Controls setup
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2.1; // Prevent camera from going below ground
    this.controls.minDistance = 20; // Prevent zooming too close
    this.controls.maxDistance = 200; // Prevent zooming too far

    // Register and load maps with the MapManager
    this.initializeMaps();

    // Load tram model and let it position itself based on Redis data
    this.loadTramFBXModel();

    // Start animation loop
    this.animate();

    // Handle window resize
    window.addEventListener('resize', this.onWindowResize.bind(this));
    
    // Add keyboard shortcut for performance monitor
    window.addEventListener('keydown', (event) => {
      if (event.key === 'p' || event.key === 'P') {
        this.performanceMonitor.toggle();
      }
    });
  }

  async initializeMaps() {
    try {
      // Register both maps
      this.mapManager.registerMap('school_map', 'school_map.glb');
      this.mapManager.registerMap('school_map2', 'school_map2.glb');
      
      // Load both maps and add them to the scene
      console.log('🗺️ Loading both map models...');
      await this.mapManager.loadBothMaps('school_map', 'school_map2');
      
      // Apply scene optimizations after maps are loaded
      this.optimizeMapScene();
      
      // Hide loading UI after maps are loaded
      if (this.loadingUI) this.loadingUI.hide();
      
      // Add keyboard shortcuts for map control
      window.addEventListener('keydown', (event) => {
        if (event.key === 'm' || event.key === 'M') {
          this.toggleMapVisibility();
        }
        if (event.key === '1') {
          this.setMapVisibility('school_map', true);
          this.setMapVisibility('school_map2', false);
        }
        if (event.key === '2') {
          this.setMapVisibility('school_map', false);
          this.setMapVisibility('school_map2', true);
        }
        if (event.key === '3') {
          this.setMapVisibility('school_map', true);
          this.setMapVisibility('school_map2', true);
        }
      });
      
      console.log('🗺️ Both maps loaded - Press M to toggle, 1/2/3 for specific maps');
      
    } catch (error) {
      console.error('❌ Failed to initialize maps:', error);
      // Hide loading UI even on error
      if (this.loadingUI) this.loadingUI.hide();
    }
  }
  
  toggleMapVisibility() {
    const maps = this.mapManager.getAllMaps();
    const map1 = maps.get('school_map');
    const map2 = maps.get('school_map2');
    
    if (map1 && map2) {
      // Toggle between: both visible → map1 only → map2 only → both visible
      if (map1.model.visible && map2.model.visible) {
        // Both visible → show only map1
        map1.model.visible = true;
        map2.model.visible = false;
        console.log('🗺️ Showing only school_map');
      } else if (map1.model.visible && !map2.model.visible) {
        // Map1 only → show only map2
        map1.model.visible = false;
        map2.model.visible = true;
        console.log('🗺️ Showing only school_map2');
      } else {
        // Map2 only or neither → show both
        map1.model.visible = true;
        map2.model.visible = true;
        console.log('🗺️ Showing both maps');
      }
    }
  }
  
  setMapVisibility(mapId, visible) {
    const maps = this.mapManager.getAllMaps();
    const map = maps.get(mapId);
    
    if (map && map.model) {
      map.model.visible = visible;
      console.log(`🗺️ ${mapId} visibility set to ${visible}`);
    }
  }

  // Apply scene optimizations specifically for the maps
  optimizeMapScene() {
    // Apply general scene optimizations from utility
    optimizeScene(this.scene);
    
    // Ensure shadows are properly rendered for lighting
    this.renderer.shadowMap.needsUpdate = true;
    
    // Force matrix updates for static objects in all loaded maps
    const allMaps = this.mapManager.getAllMaps();
    for (const [mapId, mapData] of allMaps) {
      if (mapData.model && mapData.loaded) {
        mapData.model.traverse((child) => {
          if (child.userData.static) {
            child.matrixAutoUpdate = false;
            child.updateMatrix();
          }
          
          // Ensure proper lighting for all meshes
          if (child.isMesh && child.material) {
            // Apply material optimizations from utility
            optimizeMaterial(child.material);
            
            // Ensure shadows are enabled for better lighting
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
      }
    }
    
    //console.log('🎯 Scene optimizations applied with enhanced lighting');
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
  
  getOptimalShadowMapSize() {
    // Determine shadow map size based on device capabilities
    const gl = this.renderer.getContext();
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    
    // Check for mobile devices or low-performance GPUs
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    if (isMobile || devicePixelRatio < 2) {
      return Math.min(1024, maxTextureSize); // Lower resolution for mobile
    } else if (maxTextureSize >= 4096) {
      return 2048; // Standard resolution for desktop
    } else {
      return 1024; // Fallback for older hardware
    }
  }
  
  setupMemoryManagement() {
    // Set up memory event handlers
    this.memoryManager.onMemoryEvent('warning', (data) => {
      console.warn('⚠️ Memory Warning:', data.message);
    });
    
    this.memoryManager.onMemoryEvent('critical', (data) => {
      console.error('🚨 Critical Memory Usage:', data.message);
      // Could trigger emergency cleanup here
      this.performEmergencyCleanup();
    });
    
    this.memoryManager.onMemoryEvent('leak', (data) => {
      console.error('🕳️ Memory Leak Detected:', data.message);
    });
    
    // Add keyboard shortcut for memory stats
    window.addEventListener('keydown', (event) => {
      if (event.key === 'i' || event.key === 'I') {
        this.logMemoryStats();
      }
    });
  }
  
  performEmergencyCleanup() {
    console.log('🚨 Performing emergency cleanup...');
    
    // Force garbage collection if available
    this.memoryManager.forceGarbageCollection();
    
    // Reduce shadow map size temporarily
    if (this.directionalLight && this.directionalLight.shadow) {
      this.directionalLight.shadow.mapSize.setScalar(512);
      this.directionalLight.shadow.map?.dispose();
      this.directionalLight.shadow.map = null;
    }
    
    // Reduce weather update frequency
    this.weatherUpdateInterval = 10000; // Increase to 10 seconds
    
    console.log('✅ Emergency cleanup completed');
  }
  
  logMemoryStats() {
    const stats = this.memoryManager.getStats();
    console.log('📊 Memory Statistics:', stats);
    
    const perfStats = this.performanceMonitor?.stats;
    if (perfStats) {
      console.log('⚡ Performance Statistics:', perfStats);
    }
  }

  animate() {
    requestAnimationFrame(this.animate.bind(this));
    
    this.frameCount++;
    
    if (this.controls) {
      this.controls.update();
    }
    
    // Update weather system (throttled)
    const currentTime = performance.now();
    if (this.weatherSystem && currentTime - this.lastWeatherUpdate > this.weatherUpdateInterval) {
      this.weatherSystem.update(currentTime);
      this.lastWeatherUpdate = currentTime;
      
      // Update weather display
      if (this.weatherDisplay) {
        const weatherInfo = this.weatherSystem.getWeatherInfo();
        this.weatherDisplay.update(weatherInfo);
      }
    }
    
    // Update tram tracking if tram is moving (throttled)
    if (currentTime - this.lastTramUpdate > this.tramUpdateInterval) {
      this.updateTramTracking();
      this.lastTramUpdate = currentTime;
    }
    
    // Apply distance-based culling for performance
    updateDistanceCulling(this.camera, this.scene, this.frameCount);
    
    // Update performance monitor
    if (this.performanceMonitor) {
      this.performanceMonitor.update(this.renderer, this.scene, this.camera);
    }
    
    // Update memory manager
    if (this.memoryManager) {
      this.memoryManager.update();
    }
    
    this.renderer.render(this.scene, this.camera);
  }

  // Method to update tram position from live GPS (legacy method - Redis is now primary)
  updateTramPositionFromLiveGPS(lat, lon) {
    console.log('📍 Legacy GPS update called - Redis is now primary data source');
    
    // This method is primarily for fallback when Redis is unavailable
    if (this.tramMovement) {
      const redisStatus = this.tramMovement.getRedisStatus();
      if (!redisStatus.isConnected) {
        console.log('🔄 Using legacy GPS update as Redis fallback');
        this.tramMovement.updateFromLiveGPS(lat, lon);
      }
    }
    
    // Always update local tracking system as secondary data source
    if (this.tramTracker) {
      this.tramTracker.updatePosition(lat, lon);
    }
  }

  // Initialize tram movement system
  async initializeTramMovement() {
    if (!this.tram) {
      console.warn('Cannot initialize tram movement: tram model not loaded');
      return;
    }

    // WebSocket GPS configuration
    const gpsConfig = {
      // WebSocketGPSService will handle environment detection and defaults
    };

    // Create TramMovement instance with WebSocket GPS integration
    this.tramMovement = new TramMovement(
      this.tram,
      null,
      this.gpsPoints, // Fallback GPS points
      new Vector3(0, 0, 0),
      gpsConfig
    );
    
    console.log('🚊 TramMovement initialized with Redis integration');
    
    // Wait a moment for initial positioning to complete
    setTimeout(() => {
      if (this.tramMovement && this.tramMovement.lastKnownPosition) {
        this.focusCameraOnTram();
        this.cameraFocused = true;
        console.log('📷 Initial camera focus completed');
      }
    }, 2000); // Give time for Redis data to arrive and position tram
  }

  loadTramFBXModel() {
    const loader = new FBXLoader();
    const baseUrl = import.meta.env.BASE_URL || '/';
    const modelPath = `${baseUrl}models/Tram.fbx`;
    loader.load(modelPath, async (object) => {
      this.tram = object;
      // Center and scale tram model
      const bbox = new Box3().setFromObject(this.tram);
      const size = bbox.getSize(new Vector3());
      const center = bbox.getCenter(new Vector3());
      this.tram.position.sub(center); // Center the model

      // Scale tram to reasonable size (12,4,8)
      const targetSize = new Vector3(12, 4, 8);
      const scale = new Vector3(
        targetSize.x / size.x,
        targetSize.y / size.y,
        targetSize.z / size.z
      );
      const uniformScale = (scale.x + scale.y + scale.z) / 3;
      this.tram.scale.set(uniformScale, uniformScale, uniformScale);

      // Don't position tram at fixed location - let TramMovement handle positioning via Redis
      this.tram.position.set(0, -0.3, 0); // Temporary position until Redis data arrives
      this.tram.rotation.y = Math.PI; // Rotate tram 180 degrees for correct forward direction

      // Apply optimizations to tram model
      this.tram.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          
          // Apply material optimizations if material exists
          if (child.material) {
            optimizeMaterial(child.material);
          }
          
          // Mark as dynamic object (not static)
          child.userData.static = false;
          child.frustumCulled = true; // Enable frustum culling
        }
      });

      this.scene.add(this.tram);
      this.renderer.shadowMap.needsUpdate = true;
      
      // Initialize tram movement first, then focus camera after GPS data arrives
      await this.initializeTramMovement();
      
      // Focus camera on a reasonable default position initially
      this.camera.position.set(0, 30, 60);
      this.camera.lookAt(0, 0, 0);
      if (this.controls) {
        this.controls.target.set(0, 0, 0);
        this.controls.update();
      }
    }, undefined, (error) => {
      console.error('Error loading Tram.fbx:', error);
    });
  }

  // Focus camera on tram (called when tram position is updated)
  focusCameraOnTram() {
    if (!this.tram) return;
    
    // Offset the camera to be above and behind the tram
    const offset = new Vector3(0, 30, 60); // Y: height, Z: behind
    const tramPos = this.tram.position.clone();
    const camPos = tramPos.clone().add(offset);
    this.camera.position.copy(camPos);
    this.camera.lookAt(tramPos);
    if (this.controls) {
      this.controls.target.copy(tramPos);
      this.controls.update();
    }
  }

  // Update tram tracking system continuously for WebSocket GPS data
  updateTramTracking() {
    if (!this.tramMovement || !this.tramTracker || !this.tramMovement.tram) return;
    
    // Get current tram progress (now includes WebSocket GPS data)
    let progress;
    try {
      progress = this.tramMovement.getProgress();
      if (!progress) return;
    } catch (error) {
      console.error('❌ Error getting tram progress:', error);
      return;
    }
    
    // Check WebSocket connection health
    const isHealthy = progress.isConnectionHealthy;
    if (!isHealthy && progress.lastConnectionLoss) {
      // Show connection warning if disconnected for more than 10 seconds
      const disconnectedTime = Date.now() - progress.lastConnectionLoss;
      if (disconnectedTime > 10000) {
        console.warn('⚠️ WebSocket connection lost for', Math.floor(disconnectedTime / 1000), 'seconds');
      }
    }

    // Use real-time GPS data from WebSocket if available
    if (progress.currentGPS) {
      // Update local tracker with real-time GPS data
      this.tramTracker.updatePosition(progress.currentGPS.lat, progress.currentGPS.lon);
      
      // Update debug UI if available
      this.updateDebugUI(progress.currentGPS, progress);
      
      // Focus camera on tram when GPS data is available (first time)
      if (!this.cameraFocused && this.tramMovement.lastKnownPosition) {
        this.focusCameraOnTram();
        this.cameraFocused = true;
        console.log('📷 Camera focused on tram at GPS position');
      }
    } else if (progress.realTimeMode === false && this.gpsPoints && progress.currentIndex < this.gpsPoints.length) {
      // Fallback to static GPS points if WebSocket is unavailable
      const currentGPS = this.gpsPoints[progress.currentIndex];
      if (currentGPS) {
        this.tramTracker.updatePosition(currentGPS.lat, currentGPS.lon);
        this.updateDebugUI(currentGPS, progress);
      }
    }
  }
  
  // Update debug UI with current status
  async updateDebugUI(currentGPS, progress) {
    if (!this.tramDebugUI) return;
    
    // Throttle debug UI updates
    const currentTime = Date.now();
    if (currentTime - this.lastDebugUpdate < this.debugUpdateInterval) {
      return;
    }
    this.lastDebugUpdate = currentTime;
    
    try {
      // Prepare debug data
      const debugData = {
        frontendStatus: progress.isMoving ? 'Running' : 'Stopped',
        position: currentGPS,
        connectionStatus: {
          state: progress.connectionState || 'unknown',
          healthy: progress.isConnectionHealthy || false,
          lastLoss: progress.lastConnectionLoss,
          webSocketStatus: progress.webSocketStatus
        }
      };
      
      // Update debug UI
      this.tramDebugUI.updateStatus(debugData);
      
    } catch (error) {
      console.warn('⚠️ Debug UI update failed:', error);
    }
  }
  
  // Get current tram status for API (fallback to local tracker)
  getTramStatusAPI() {
    if (!this.tramTracker) return null;
    return this.tramTracker.getStatusForAPI();
  }
  
  // Reset tram tracking
  resetTramTracking() {
    if (this.tramTracker) {
      this.tramTracker.reset();
    }
  }

  // Dispose of resources and cleanup
  dispose() {
    // Dispose tram movement system and Redis connection
    if (this.tramMovement) {
      this.tramMovement.dispose();
      this.tramMovement = null;
    }
    
    // Dispose weather system
    if (this.weatherSystem) {
      this.weatherSystem.dispose();
      this.weatherSystem = null;
    }
    
    // Dispose weather display
    if (this.weatherDisplay) {
      this.weatherDisplay.dispose();
      this.weatherDisplay = null;
    }
    
    // Dispose map manager and all maps
    if (this.mapManager) {
      this.mapManager.dispose();
      this.mapManager = null;
    }
    
    // Dispose tram model properly
    if (this.tram) {
      disposeObject(this.tram);
    }
    
    // Dispose performance monitor
    if (this.performanceMonitor) {
      this.performanceMonitor.dispose();
      this.performanceMonitor = null;
    }
    
    // Dispose memory manager
    if (this.memoryManager) {
      this.memoryManager.dispose();
      this.memoryManager = null;
    }
    
    console.log('🧹 SchoolMap resources disposed');
  }
}

export default SchoolMap;