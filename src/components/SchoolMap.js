import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  AmbientLight,
  DirectionalLight,
  Vector3,
  Box3,
} from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import TramMovement from './TramMovement.js';
import LoadingUI from './LoadingUI';
import WeatherSystem from './WeatherSystem.js';
// Removed WeatherDisplay UI per request
import TramTracker from './TramTracker.js';
import { gpsRoute } from '../config/gpsRoute.js';
import {
  applyRendererDefaults,
  optimizeMaterial,
  optimizeScene,
  disposeObject,
  updateDistanceCulling
} from '../utils/renderingOptimizations.js';
import PerformanceMonitor from '../utils/PerformanceMonitor.js';
import MapManager from './MapManager.js';
import MemoryManager from '../utils/MemoryManager.js';
import CameraController from './CameraController.js';

class SchoolMap {
  constructor(container) {
    this.container = container;
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new WebGLRenderer({ antialias: true });
    this.controls = null;

    // Base-aware asset prefix so it works under '/' and '/journey/'
    this.baseUrl = import.meta.env.BASE_URL || '/';

    // Pass baseUrl + renderer to MapManager so it prefixes /models/* correctly
    this.mapManager = new MapManager(this.scene, {
      baseUrl: this.baseUrl,
      renderer: this.renderer,
      // If your decoders live elsewhere, customize:
      // dracoPath: `${this.baseUrl}libs/draco/`,
      // ktx2Path: `${this.baseUrl}libs/basis/`,
    });

    this.tramMovement = null;
    this.tramMovement2 = null;
    this.weatherSystem = null;
    this.tramTracker = null;
    this.tramTracker2 = null;
    this.cameraController = null;

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
    // Apply rendering optimizations from utility FIRST
    applyRendererDefaults(this.renderer);

    // Renderer setup with proper sizing (after optimization)
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0xbfd1e5); // Sky blue background
    this.container.appendChild(this.renderer.domElement);

    // Camera setup: focus on a central area
    this.camera.position.set(0, 20, 50);
    this.camera.lookAt(0, 0, 0);

    // Lighting setup - mobile-optimized
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    // Brighter ambient light for mobile to compensate for disabled shadows
    const ambientLightIntensity = isMobile ? 1.2 : 0.8;
    const ambientLight = new AmbientLight(0xffffff, ambientLightIntensity);
    this.scene.add(ambientLight);
    this.ambientLight = ambientLight; // Store reference for weather system

    // Directional light setup - conditional shadows
    const directionalLight = new DirectionalLight(0xffffff, isMobile ? 1.5 : 1.0);
    directionalLight.position.set(50, 100, 50);

    // Only enable shadows on desktop for performance
    if (!isMobile) {
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
    }

    this.scene.add(directionalLight);
    this.directionalLight = directionalLight; // Store reference for weather system

    // Add additional fill light to brighten darker areas
    const fillLight = new DirectionalLight(0xffffff, isMobile ? 0.5 : 0.3);
    fillLight.position.set(-50, 50, -50); // Opposite direction to main light
    fillLight.castShadow = false; // No shadows for fill light to reduce complexity
    this.scene.add(fillLight);
    this.fillLight = fillLight;

    // Initialize weather system (UI removed; background logic retained)
    this.weatherSystem = new WeatherSystem(this.scene, this.renderer);

    // Initialize enhanced tram tracking system
    this.tramTracker = new TramTracker('tram_1');
    this.tramTracker2 = new TramTracker('tram_2');

    // Controls setup
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2.1; // Prevent camera from going below ground
    this.controls.minDistance = 20; // Prevent zooming too close
    this.controls.maxDistance = 200; // Prevent zooming too far

    // Initialize camera controller for different camera modes
    this.cameraController = new CameraController(this.camera, this.controls, this.scene);

    // Register and load maps with the MapManager
    this.initializeMaps();

    // Load tram models and let them position themselves based on Redis data
    this.loadTramFBXModel();
    this.loadTram2FBXModel();

    // Start animation loop
    this.animate();

    // Handle window resize
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  async initializeMaps() {
    try {
      // Connect LoadingUI to MapManager's loading manager for progress tracking
      if (this.loadingUI && this.mapManager.loadingManager) {
        this.loadingUI.connectLoadingManager(this.mapManager.loadingManager, { label: 'Map' });
      }

      // Register maps with the IDs expected by MapManager's sequence
      // IMPORTANT: pass just filenames; MapManager adds `${baseUrl}models/` for you
      this.mapManager.registerMap('school_main', 'school_map.glb');
      this.mapManager.registerMap('school_secondary', 'school_map2.glb'); // correct filename (no underscore)

      // 1) Show the main map ASAP for fast-first-render
      await this.mapManager.switchToMap('school_main');
      this.setMapVisibility('school_main', true);

      // LoadingUI will automatically hide when the loading manager completes

      // Apply initial scene optimizations
      this.optimizeMapScene();
      
      // Calculate and update map center for camera controller
      this.updateMapCenterForCamera();

      // 2) Defer-load & attach the secondary map so it doesn't block first render
      setTimeout(async () => {
        try {
          await this.mapManager.loadMap('school_secondary');
          const maps = this.mapManager.getAllMaps();
          const sec = maps.get('school_secondary');
          if (sec && sec.model && !sec.inScene) {
            this.scene.add(sec.model);
            sec.inScene = true;
            sec.model.visible = true; // both maps visible together
          }
          // Re-run scene touches now that secondary is in
          this.optimizeMapScene();
          
          // Recalculate map center with both maps loaded
          this.updateMapCenterForCamera();
        } catch (err) {
          // Failed to load secondary map
          if (import.meta.env.DEV) {
            console.warn('⚠️ Failed to load secondary map:', err);
          }
        }
      }, 1200); // small delay keeps first render snappy

    } catch (error) {
      console.error('❌ Failed to initialize maps:', error);
      // Hide loading UI on error as a fallback
      if (this.loadingUI) {
        this.loadingUI.setMessage('Failed to load map');
        this.loadingUI.setSubMessage('Please refresh to try again');
        setTimeout(() => this.loadingUI.hide(), 2000);
      }
    }
  }

  toggleMapVisibility() {
    const maps = this.mapManager.getAllMaps();
    const map1 = maps.get('school_main');
    const map2 = maps.get('school_secondary');

    if (map1 && map2 && map1.model && map2.model) {
      // Toggle between: both visible → main only → secondary only → both visible
      if (map1.model.visible && map2.model.visible) {
        map1.model.visible = true;
        map2.model.visible = false; // both → main only
      } else if (map1.model.visible && !map2.model.visible) {
        map1.model.visible = false; // main only → secondary only
        map2.model.visible = true;
      } else {
        map1.model.visible = true;  // secondary only/none → both
        map2.model.visible = true;
      }
    }
  }

  setMapVisibility(mapId, visible) {
    const maps = this.mapManager.getAllMaps();
    const map = maps.get(mapId);

    if (map && map.model) {
      map.model.visible = visible;
      // Map visibility updated
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
    for (const [, mapData] of allMaps) {
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
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();

    // Maintain proper pixel ratio on resize to prevent blurriness
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const devicePixelRatio = window.devicePixelRatio || 1;
    const performanceRatio = isMobile ? Math.min(devicePixelRatio, 2) : Math.min(devicePixelRatio, 2);

    this.renderer.setPixelRatio(performanceRatio);
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
      // Memory warning - silent in production
      if (import.meta.env.DEV) {
        console.warn('⚠️ Memory Warning:', data.message);
      }
    });

    this.memoryManager.onMemoryEvent('critical', (data) => {
      // Critical memory usage - trigger cleanup
      if (import.meta.env.DEV) {
        console.error('🚨 Critical Memory Usage:', data.message);
      }
      this.performEmergencyCleanup();
    });

    this.memoryManager.onMemoryEvent('leak', (data) => {
      // Memory leak detection - keep for development debugging
      if (import.meta.env.DEV) {
        console.error('🕳️ Memory Leak Detected:', data.message);
      }
    });

    // 🔕 Removed all keyboard hotkeys (mobile focus)
  }

  performEmergencyCleanup() {
    // Performing emergency cleanup...

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

    // Emergency cleanup completed
  }

  logMemoryStats() {
    // Memory and performance statistics available for development debugging
    if (import.meta.env.DEV) {
      const stats = this.memoryManager.getStats();
      console.log('📊 Memory Statistics:', stats);

      const perfStats = this.performanceMonitor?.stats;
      if (perfStats) {
        console.log('⚡ Performance Statistics:', perfStats);
      }
    }
  }

  animate() {
    requestAnimationFrame(this.animate.bind(this));

    this.frameCount++;

    // Mobile-optimized frame rate control (kept from your original)
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile && this.frameCount % 2 === 0) {
      // Skip every other frame on mobile for better performance
      return;
    }

    if (this.controls) {
      this.controls.update();
    }

    // Update camera controller for tram following mode
    if (this.cameraController) {
      this.cameraController.update();
    }

    // Update weather system (throttled more aggressively on mobile)
    const currentTime = performance.now();
    const weatherUpdateInterval = isMobile ? this.weatherUpdateInterval * 2 : this.weatherUpdateInterval;

    if (this.weatherSystem && currentTime - this.lastWeatherUpdate > weatherUpdateInterval) {
      this.weatherSystem.update(currentTime);
      this.lastWeatherUpdate = currentTime;
      // WeatherDisplay UI removed, but background/lighting still react to weather
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
  updateTramPositionFromLiveGPS(lat, lon, tramId = 'tram_1') {
    // Legacy GPS update called - Redis is now primary data source

    // This method is primarily for fallback when Redis is unavailable
    if (tramId === 'tram_1' && this.tramMovement) {
      const redisStatus = this.tramMovement.getRedisStatus();
      if (!redisStatus.isConnected) {
        // Using legacy GPS update as Redis fallback
        this.tramMovement.updateFromLiveGPS(lat, lon);
      }
    } else if (tramId === 'tram_2' && this.tramMovement2) {
      const redisStatus = this.tramMovement2.getRedisStatus();
      if (!redisStatus.isConnected) {
        // Using legacy GPS update as Redis fallback
        this.tramMovement2.updateFromLiveGPS(lat, lon);
      }
    }

    // Always update local tracking system as secondary data source
    if (tramId === 'tram_1' && this.tramTracker) {
      this.tramTracker.updatePosition(lat, lon);
    } else if (tramId === 'tram_2' && this.tramTracker2) {
      this.tramTracker2.updatePosition(lat, lon);
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
      tramId: 'tram_1', // Match the tram_1.fbx model and Redis tram_1 data entry
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

    // TramMovement initialized with Redis integration

    // Wait a moment for initial positioning to complete
    setTimeout(() => {
      if (this.tramMovement && this.tramMovement.lastKnownPosition) {
        this.focusCameraOnTram();
        this.cameraFocused = true;
        // Initial camera focus completed
      }
    }, 2000); // Give time for Redis data to arrive and position tram
  }

  // Initialize tram_2 movement system
  async initializeTram2Movement() {
    if (!this.tram2) {
      console.warn('Cannot initialize tram_2 movement: tram2 model not loaded');
      return;
    }

    // WebSocket GPS configuration for tram_2
    const gpsConfig = {
      tramId: 'tram_2', // Match the tram_2.fbx model and Redis tram_2 data entry
      // WebSocketGPSService will handle environment detection and defaults
    };

    // Create TramMovement instance for tram_2 with WebSocket GPS integration
    this.tramMovement2 = new TramMovement(
      this.tram2,
      null,
      this.gpsPoints, // Fallback GPS points
      new Vector3(20, 0, 20), // Different initial position from tram_1
      gpsConfig
    );

    // TramMovement2 initialized with Redis integration
  }

  loadTramFBXModel() {
    const loader = new FBXLoader();
    // Base-aware FBX URL so it resolves under '/journey/' in prod
    const modelPath = `${this.baseUrl}models/tram_1.fbx`;
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

  loadTram2FBXModel() {
    const loader = new FBXLoader();
    // Base-aware FBX URL so it resolves under '/journey/' in prod
    const modelPath = `${this.baseUrl}models/tram_2.fbx`;
    loader.load(modelPath, async (object) => {
      this.tram2 = object;
      // Center and scale tram model
      const bbox = new Box3().setFromObject(this.tram2);
      const size = bbox.getSize(new Vector3());
      const center = bbox.getCenter(new Vector3());
      this.tram2.position.sub(center); // Center the model

      // Scale tram to reasonable size (12,4,8)
      const targetSize = new Vector3(12, 4, 8);
      const scale = new Vector3(
        targetSize.x / size.x,
        targetSize.y / size.y,
        targetSize.z / size.z
      );
      const uniformScale = (scale.x + scale.y + scale.z) / 3;
      this.tram2.scale.set(uniformScale, uniformScale, uniformScale);

      // Don't position tram at fixed location - let TramMovement handle positioning via Redis
      this.tram2.position.set(20, -0.3, 20); // Different temporary position until Redis data arrives
      this.tram2.rotation.y = Math.PI; // Rotate tram 180 degrees for correct forward direction

      // Apply optimizations to tram model
      this.tram2.traverse((child) => {
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

      this.scene.add(this.tram2);
      this.renderer.shadowMap.needsUpdate = true;

      // Initialize tram_2 movement
      await this.initializeTram2Movement();

    }, undefined, (error) => {
      console.error('Error loading tram_2.fbx:', error);
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
    // Update tram_1 tracking
    this.updateSingleTramTracking('tram_1');

    // Update tram_2 tracking
    this.updateSingleTramTracking('tram_2');
  }

  // Update tracking for a single tram
  updateSingleTramTracking(tramId) {
    const tramMovement = tramId === 'tram_1' ? this.tramMovement : this.tramMovement2;
    const tramTracker = tramId === 'tram_1' ? this.tramTracker : this.tramTracker2;

    if (!tramMovement || !tramTracker || !tramMovement.tram) return;

    // Get current tram progress (now includes WebSocket GPS data)
    let progress;
    try {
      progress = tramMovement.getProgress();
      if (!progress) return;
    } catch (error) {
      console.error(`❌ Error getting ${tramId} progress:`, error);
      return;
    }

    // Check WebSocket connection health
    const isHealthy = progress.isConnectionHealthy;
    if (!isHealthy && progress.lastConnectionLoss) {
      // Show connection warning if disconnected for more than 10 seconds
      const disconnectedTime = Date.now() - progress.lastConnectionLoss;
      if (disconnectedTime > 10000) {
        if (import.meta.env.DEV) {
          console.warn(`⚠️ ${tramId} WebSocket connection lost for`, Math.floor(disconnectedTime / 1000), 'seconds');
        }
      }
    }

    // Use real-time GPS data from WebSocket if available
    if (progress.currentGPS) {
      // Update local tracker with real-time GPS data
      tramTracker.updatePosition(progress.currentGPS.lat, progress.currentGPS.lon);

      // Update debug UI if available (only for tram_1 to avoid clutter)
      if (tramId === 'tram_1') {
        this.updateDebugUI(progress.currentGPS, progress);
      }

      // Focus camera on tram_1 when GPS data is available (first time)
      if (tramId === 'tram_1' && !this.cameraFocused && tramMovement.lastKnownPosition) {
        this.focusCameraOnTram();
        this.cameraFocused = true;
        // Camera focused on tram at GPS position
      }
    } else if (progress.realTimeMode === false && this.gpsPoints && progress.currentIndex < this.gpsPoints.length) {
      // Fallback to static GPS points if WebSocket is unavailable
      const currentGPS = this.gpsPoints[progress.currentIndex];
      if (currentGPS) {
        tramTracker.updatePosition(currentGPS.lat, currentGPS.lon);
        if (tramId === 'tram_1') {
          this.updateDebugUI(currentGPS, progress);
        }
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
      if (import.meta.env.DEV) {
        console.warn('⚠️ Debug UI update failed:', error);
      }
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

  // Update camera controller with calculated map center
  updateMapCenterForCamera() {
    if (!this.cameraController) return;
    
    const mapCenter = this.calculateMapCenter();
    this.cameraController.updateBirdEyeTarget(mapCenter);
  }

  // Calculate the visual center of the loaded map geometry
  calculateMapCenter() {
    const maps = this.mapManager.getAllMaps();
    const mainMap = maps.get('school_main');
    const secondaryMap = maps.get('school_secondary');
    
    // Create combined bounding box from all loaded maps
    const combinedBox = new Box3();
    let hasGeometry = false;
    
    // Add main map to bounding box calculation
    if (mainMap && mainMap.model && mainMap.inScene) {
      const mapBox = new Box3().setFromObject(mainMap.model);
      if (!mapBox.isEmpty()) {
        combinedBox.union(mapBox);
        hasGeometry = true;
      }
    }
    
    // Add secondary map to bounding box calculation
    if (secondaryMap && secondaryMap.model && secondaryMap.inScene) {
      const mapBox = new Box3().setFromObject(secondaryMap.model);
      if (!mapBox.isEmpty()) {
        combinedBox.union(mapBox);
        hasGeometry = true;
      }
    }
    
    if (hasGeometry) {
      // Calculate the center of the combined geometry
      const center = combinedBox.getCenter(new Vector3());
      // Store the calculated center for use by other components
      this.mapCenter = center;
      return center;
    }
    
    // Fallback to map object position if no geometry found
    const fallbackCenter = new Vector3(-300, 0, 220);
    this.mapCenter = fallbackCenter;
    return fallbackCenter;
  }
  
  // Get the current map center (calculate if not cached)
  getMapCenter() {
    if (!this.mapCenter) {
      return this.calculateMapCenter();
    }
    return this.mapCenter.clone();
  }

  // Dispose of resources and cleanup
  dispose() {
    // Dispose tram movement system and Redis connection
    if (this.tramMovement) {
      this.tramMovement.dispose();
      this.tramMovement = null;
    }

    // Dispose tram_2 movement system and Redis connection
    if (this.tramMovement2) {
      this.tramMovement2.dispose();
      this.tramMovement2 = null;
    }

    // Dispose weather system
    if (this.weatherSystem) {
      this.weatherSystem.dispose();
      this.weatherSystem = null;
    }

    // WeatherDisplay UI removed

    // Dispose map manager and all maps
    if (this.mapManager) {
      this.mapManager.dispose();
      this.mapManager = null;
    }

    // Dispose tram models properly
    if (this.tram) {
      disposeObject(this.tram);
    }
    if (this.tram2) {
      disposeObject(this.tram2);
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

    // Dispose camera controller
    if (this.cameraController) {
      this.cameraController.dispose();
      this.cameraController = null;
    }

    // SchoolMap resources disposed
  }
}

export default SchoolMap;
