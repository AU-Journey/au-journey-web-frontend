/**
 * MapManager - Intelligent management of multiple map models
 * Handles loading, switching, and memory optimization for map resources
 */
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { MathUtils, DoubleSide, LoadingManager, LinearFilter } from 'three';
import { optimizeMaterial, disposeObject } from '../utils/renderingOptimizations.js';

class MapManager {
  constructor(scene) {
    this.scene = scene;
    this.loader = new GLTFLoader();
    this.loader.setPath(import.meta.env.BASE_URL || '/');
    
    // Detect mobile device for optimizations
    this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    // Map registry
    this.maps = new Map();
    this.currentMap = null;
    this.activeMapId = null;
    
    // Loading state
    this.isLoading = false;
    this.loadQueue = [];
    this.loadingProgress = 0;
    
    // Progressive loading
    this.initialLoadComplete = false;
    this.loadingManager = new LoadingManager();
    this.setupLoadingManager();
    
    // Configuration
    this.baseUrl = import.meta.env.BASE_URL || '/';
    // Only use cache busting in development
    this.cacheBuster = import.meta.env.DEV ? Date.now() : '';
    
    // Mobile-optimized default map configuration
    const mobileScale = this.isMobile ? 0.8 : 0.908; // Slightly smaller on mobile
    
    // Default map configuration with LOD levels
    this.defaultMapConfig = {
      scale: { x: mobileScale, y: mobileScale, z: mobileScale },
      rotation: { x: 0, y: MathUtils.degToRad(165), z: 0 },
      position: { x: -300, y: 0, z: 220 },
      lodLevels: this.isMobile ? [
        { distance: 0, detail: 'medium' }, // Start with medium detail on mobile
        { distance: 30, detail: 'low' },   // Switch to low detail sooner
        { distance: 60, detail: 'hidden' } // Hide distant objects sooner
      ] : [
        { distance: 0, detail: 'high' },
        { distance: 50, detail: 'medium' },
        { distance: 100, detail: 'low' }
      ]
    };
  }
  
  /**
   * Register a map for lazy loading
   * @param {string} id - Unique identifier for the map
   * @param {string} filename - GLB filename
   * @param {Object} config - Optional position/rotation/scale overrides
   * @param {boolean} preload - Whether to load immediately
   */
  setupLoadingManager() {
    this.loadingManager.onProgress = (url, loaded, total) => {
      this.loadingProgress = (loaded / total) * 100;
      if (this.onLoadingProgress) {
        this.onLoadingProgress(this.loadingProgress);
      }
    };
    
    this.loadingManager.onLoad = () => {
      this.initialLoadComplete = true;
      if (this.onLoadComplete) {
        this.onLoadComplete();
      }
    };
    
    this.loader = new GLTFLoader(this.loadingManager);
  }

  registerMap(id, filename, config = {}, preload = false) {
    const mapConfig = {
      id,
      filename,
      modelPath: `${this.baseUrl}models/${filename}${this.cacheBuster ? `?v=${this.cacheBuster}` : ''}`,
      config: { ...this.defaultMapConfig, ...config },
      loaded: false,
      model: null,
      inScene: false,
      // Add LOD support
      lods: {}
    };
    
    this.maps.set(id, mapConfig);
    
    if (preload) {
      this.loadMap(id);
    }
    
    return mapConfig;
  }
  
  /**
   * Load a map model with mobile optimizations
   * @param {string} id - Map identifier
   * @returns {Promise} - Resolves when map is loaded
   */
  async loadMap(id) {
    const mapData = this.maps.get(id);
    if (!mapData) {
      throw new Error(`Map '${id}' not registered`);
    }
    
    if (mapData.loaded) {
      console.log(`Map '${id}' already loaded`);
      return mapData.model;
    }
    
    if (this.isLoading) {
      // Queue the request
      return new Promise((resolve, reject) => {
        this.loadQueue.push({ id, resolve, reject });
      });
    }
    
    this.isLoading = true;
    
    // Show progressive loading feedback for mobile
    if (this.isMobile && this.onLoadingProgress) {
      this.onLoadingProgress(0);
    }
    
    try {
      const gltf = await this.loadGLTF(mapData.modelPath);
      mapData.model = gltf.scene;
      mapData.loaded = true;
      
      // Apply configuration
      this.applyMapConfiguration(mapData);
      
      // Optimize the model with mobile-specific settings
      this.optimizeMapModel(mapData.model);
      
      // Track geometries and materials for memory management if scene has memoryManager
      if (this.scene.userData && this.scene.userData.memoryManager) {
        this.trackMapResources(mapData.model, this.scene.userData.memoryManager);
      }
      
      console.log(`✅ Map '${id}' loaded successfully`);
      
      // Process queue
      this.processLoadQueue();
      
      return mapData.model;
      
    } catch (error) {
      console.error(`❌ Failed to load map '${id}':`, error);
      this.isLoading = false;
      throw error;
    }
  }
  
  /**
   * Load GLTF with promise wrapper
   */
  loadGLTF(path) {
    return new Promise((resolve, reject) => {
      this.loader.load(path, resolve, undefined, reject);
    });
  }
  
  /**
   * Process the load queue
   */
  processLoadQueue() {
    this.isLoading = false;
    
    if (this.loadQueue.length > 0) {
      const next = this.loadQueue.shift();
      this.loadMap(next.id)
        .then(next.resolve)
        .catch(next.reject);
    }
  }
  
  /**
   * Apply position, rotation, and scale to map model
   */
  applyMapConfiguration(mapData) {
    const { model, config } = mapData;
    
    model.scale.set(config.scale.x, config.scale.y, config.scale.z);
    model.rotation.set(config.rotation.x, config.rotation.y, config.rotation.z);
    model.position.set(config.position.x, config.position.y, config.position.z);
  }
  
  /**
   * Optimize map model for performance with mobile-specific settings
   */
  optimizeMapModel(model) {
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        // Mobile-specific material optimization
        if (this.isMobile) {
          // Reduce texture quality on mobile
          if (child.material.map) {
            child.material.map.generateMipmaps = false;
            child.material.map.minFilter = LinearFilter;
            child.material.map.magFilter = LinearFilter;
          }
          
          // Disable expensive features on mobile
          child.material.envMap = null;
          child.material.lightMap = null;
        }
        
        // Enhanced grass/transparent material fix
        if (child.material.transparent || (child.material.map && child.material.alphaMap)) {
          child.material.alphaTest = this.isMobile ? 0.2 : 0.1; // Higher alpha test on mobile
          child.material.depthWrite = true;
          child.material.side = DoubleSide;
          child.material.transparent = true;
          child.material.opacity = this.isMobile ? 0.95 : 0.98;
          
          // Prevent z-fighting
          child.material.polygonOffset = true;
          child.material.polygonOffsetFactor = 1;
          child.material.polygonOffsetUnits = 1;
        } else {
          child.material.transparent = false;
          child.material.opacity = 1.0;
        }
        
        // Apply material optimizations
        optimizeMaterial(child.material);
        
        // Shadow settings - disable shadows on mobile for performance
        child.receiveShadow = !this.isMobile;
        child.castShadow = !this.isMobile;
        
        // Mark static objects for performance
        if (!child.name.includes('dynamic') && !child.name.includes('animated')) {
          child.userData.static = true;
          child.matrixAutoUpdate = false;
          child.updateMatrix();
        }
        
        // Set LOD distance for mobile culling
        if (this.isMobile) {
          child.userData.maxRenderDistance = child.userData.maxRenderDistance || 80;
        }
      }
    });
  }
  
  /**
   * Switch to a different map
   * @param {string} id - Map identifier
   * @param {boolean} unloadPrevious - Whether to unload the previous map from memory
   */
  async switchToMap(id, unloadPrevious = true) {
    console.log(`🔄 Switching to map: ${id}`);
    
    // Remove current map from scene
    if (this.currentMap && this.activeMapId) {
      this.scene.remove(this.currentMap);
      this.maps.get(this.activeMapId).inScene = false;
      
      // Optionally unload from memory
      if (unloadPrevious && this.activeMapId !== id) {
        this.unloadMap(this.activeMapId);
      }
    }
    
    // Load new map if not already loaded
    const mapData = this.maps.get(id);
    if (!mapData) {
      throw new Error(`Map '${id}' not registered`);
    }
    
    if (!mapData.loaded) {
      await this.loadMap(id);
    }
    
    // Add to scene
    this.scene.add(mapData.model);
    mapData.inScene = true;
    
    this.currentMap = mapData.model;
    this.activeMapId = id;
    
    console.log(`✅ Switched to map: ${id}`);
    return mapData.model;
  }
  
  /**
   * Preload multiple maps
   * @param {Array} mapIds - Array of map identifiers
   */
  async preloadMaps(mapIds) {
    console.log(`📦 Preloading maps: ${mapIds.join(', ')}`);
    
    const loadPromises = mapIds.map(id => {
      const mapData = this.maps.get(id);
      return mapData && !mapData.loaded ? this.loadMap(id) : Promise.resolve();
    });
    
    await Promise.all(loadPromises);
    console.log(`✅ All maps preloaded`);
  }
  
  /**
   * Unload a map from memory
   * @param {string} id - Map identifier
   */
  unloadMap(id) {
    const mapData = this.maps.get(id);
    if (!mapData || !mapData.loaded) {
      return;
    }
    
    // Remove from scene if active
    if (mapData.inScene) {
      this.scene.remove(mapData.model);
      mapData.inScene = false;
    }
    
    // Dispose resources
    disposeObject(mapData.model);
    
    // Reset state
    mapData.model = null;
    mapData.loaded = false;
    
    // Clear current references if this was the active map
    if (this.activeMapId === id) {
      this.currentMap = null;
      this.activeMapId = null;
    }
    
    console.log(`🗑️ Map '${id}' unloaded from memory`);
  }
  
  /**
   * Get current active map
   */
  getCurrentMap() {
    return {
      id: this.activeMapId,
      model: this.currentMap
    };
  }
  
  /**
   * Get all registered maps
   */
  getAllMaps() {
    return this.maps;
  }
  
  /**
   * Load both maps and add them to the scene
   * @param {string} mapId1 - First map identifier
   * @param {string} mapId2 - Second map identifier
   */
  async loadBothMaps(mapId1, mapId2) {
    // Loading both maps...
    
    try {
      // Load both maps in parallel
      const [map1, map2] = await Promise.all([
        this.loadMap(mapId1),
        this.loadMap(mapId2)
      ]);
      
      // Add both to scene
      const mapData1 = this.maps.get(mapId1);
      const mapData2 = this.maps.get(mapId2);
      
      if (mapData1 && !mapData1.inScene) {
        this.scene.add(mapData1.model);
        mapData1.inScene = true;
      }
      
      if (mapData2 && !mapData2.inScene) {
        this.scene.add(mapData2.model);
        mapData2.inScene = true;
      }
      
      // Set the first map as the "current" for backward compatibility
      this.currentMap = map1;
      this.activeMapId = mapId1;
      
      console.log(`✅ Both maps loaded and added to scene`);
      return { map1, map2 };
      
    } catch (error) {
      console.error(`❌ Failed to load both maps:`, error);
      throw error;
    }
  }
  
  /**
   * Get map loading status
   */
  getLoadingStatus() {
    const status = {};
    for (const [id, mapData] of this.maps) {
      status[id] = {
        loaded: mapData.loaded,
        inScene: mapData.inScene
      };
    }
    return status;
  }
  
  /**
   * Track map resources in memory manager
   * @param {Object3D} model - Map model
   * @param {MemoryManager} memoryManager - Memory manager instance
   */
  trackMapResources(model, memoryManager) {
    model.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) {
          memoryManager.track(child.geometry, 'geometry');
        }
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => {
              memoryManager.track(mat, 'material');
              if (mat.map) memoryManager.track(mat.map, 'texture');
            });
          } else {
            memoryManager.track(child.material, 'material');
            if (child.material.map) memoryManager.track(child.material.map, 'texture');
          }
        }
      }
    });
  }
  
  /**
   * Dispose all maps and cleanup
   */
  dispose() {
    console.log('🧹 Disposing MapManager');
    
    for (const [id, mapData] of this.maps) {
      if (mapData.loaded) {
        this.unloadMap(id);
      }
    }
    
    this.maps.clear();
    this.currentMap = null;
    this.activeMapId = null;
    this.loadQueue = [];
  }
}

export default MapManager; 