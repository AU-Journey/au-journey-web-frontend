/**
 * MapManager - Intelligent management of multiple map models (optimized & sequenced)
 * - Progressive (LOD/variant) loading: low → medium → high
 * - Network-aware + mobile-aware strategies
 * - Byte-accurate progress reporting (for LoadingUI)
 * - Optional KTX2 (BasisU) textures + DRACO geometry support
 * - Safe swapping/disposing when upgrading quality
 * - **Hard-coded sequence**: load `school_map.glb` first, then `school_map2.glb`
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { MathUtils, DoubleSide, LoadingManager } from 'three';
import { optimizeMaterial, disposeObject } from '../utils/renderingOptimizations.js';

class MapManager {
  /**
   * @param {THREE.Scene} scene
   * @param {Object} [opts]
   * @param {THREE.WebGLRenderer} [opts.renderer] - improves KTX2 detection
   * @param {string} [opts.baseUrl] - default assets base
   * @param {string} [opts.dracoPath] - path to DRACO decoders
   * @param {string} [opts.ktx2Path] - path to BasisU / KTX2 transcoder
   * @param {number} [opts.maxConcurrency] - parallel fetch limit (network-aware by default)
   * @param {string} [opts.primaryId] - override hard-coded primary map id
   * @param {string} [opts.secondaryId] - override hard-coded secondary map id
   */
  constructor(scene, opts = {}) {
    this.scene = scene;

    // ---- Hard-coded sequence identifiers ----
    this.primaryId = opts.primaryId || 'school_main';
    this.secondaryId = opts.secondaryId || 'school_secondary';

    // ---- Environment & network heuristics ----
    this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const conn = navigator.connection || {};
    this.netType = conn.effectiveType || 'unknown';
    this.saveData = !!conn.saveData;

    const netLimited = ['slow-2g', '2g', '3g'].includes(this.netType) || this.saveData;
    this.MAX_CONCURRENCY =
      typeof opts.maxConcurrency === 'number' ? opts.maxConcurrency : netLimited ? 2 : 4;

    // ---- Base/config ----
    this.baseUrl = (opts.baseUrl ?? (import.meta?.env?.BASE_URL || '/')) || '/';
    // Use cache busting only during development to avoid defeating HTTP caches in prod
    this.cacheBuster = import.meta?.env?.DEV ? `?v=${Date.now()}` : '';

    this.dracoPath = opts.dracoPath ?? `${this.baseUrl}libs/draco/`;
    this.ktx2Path = opts.ktx2Path ?? `${this.baseUrl}libs/basis/`;

    // Default map transform & LOD policy
    const mobileScale = this.isMobile ? 0.8 : 0.908;
    this.defaultMapConfig = {
      scale: { x: mobileScale, y: mobileScale, z: mobileScale },
      rotation: { x: 0, y: MathUtils.degToRad(165), z: 0 },
      position: { x: -300, y: 0, z: 220 },
      lodLevels: this.isMobile
        ? [
            { distance: 0, detail: 'medium' },
            { distance: 30, detail: 'low' },
            { distance: 60, detail: 'hidden' }
          ]
        : [
            { distance: 0, detail: 'high' },
            { distance: 50, detail: 'medium' },
            { distance: 100, detail: 'low' }
          ]
    };

    // ---- Loading state ----
    this.maps = new Map();
    this.currentMap = null;
    this.activeMapId = null;

    this.globalLoadedBytes = 0; // across all current fetches
    this.globalTotalBytes = 0; // sum of content-lengths we've learned

    // fetch queue (priority ascending)
    this.queue = []; // items: { id, variant, priority, resolve, reject, controller }
    this.active = new Set();

    // ---- LoadingManager (for GLTF sub-assets, if any) ----
    this.loadingManager = new LoadingManager();
    this._setupLoadingManager();

    // ---- GLTF loader w/ KTX2 + DRACO (optional) ----
    this.loader = new GLTFLoader(this.loadingManager);
    this.loader.setPath(this.baseUrl);

    try {
      const ktx2 = new KTX2Loader().setTranscoderPath(this.ktx2Path);
      if (opts.renderer) ktx2.detectSupport(opts.renderer);
      this.loader.setKTX2Loader(ktx2);
    } catch {
      // KTX2 optional
    }

    try {
      const draco = new DRACOLoader().setDecoderPath(this.dracoPath);
      this.loader.setDRACOLoader(draco);
    } catch {
      // DRACO optional
    }
  }

  // ---------- Public events you can assign from outside ----------
  /** @type {(pctOrObj:any)=>void} */ onLoadingProgress = null; // accepts {globalLoaded, globalTotal, pct, url, stage}
  /** @type {(stage:string)=>void} */ onStage = null; // e.g. 'school_main(high) ready'
  /** @type {()=>void} */ onLoadComplete = null; // called when queue drains

  // ---------- LoadingManager hooks (counts sub-resources) ----------
  _setupLoadingManager() {
    this.loadingManager.onLoad = () => {
      if (this.active.size === 0 && this.queue.length === 0) {
        this.onLoadComplete?.();
      }
    };
  }

  // ---------- Registration ----------
  /**
   * Register a map and its quality variants.
   * @param {string} id
   * @param {string|{low?:string, medium?:string, high?:string}} filenameOrVariants
   * @param {Object} config
   * @param {boolean} preload
   */
  registerMap(id, filenameOrVariants, config = {}, preload = false) {
    // Support old signature: filename string
    const variants =
      typeof filenameOrVariants === 'string'
        ? { high: filenameOrVariants }
        : { ...filenameOrVariants };

    const modelPaths = {};
    for (const k of ['low', 'medium', 'high']) {
      if (variants[k]) {
        // always load from /models/
        modelPaths[k] = `${this.baseUrl}models/${variants[k]}${this.cacheBuster}`;
      }
    }

    const mapConfig = {
      id,
      variants: modelPaths, // { low, medium, high }
      filename: variants.high || variants.medium || variants.low || null, // for backward compat
      modelPath: modelPaths.high || null, // kept for compat (primary)
      config: { ...this.defaultMapConfig, ...config },
      loaded: false,
      model: null,
      inScene: false,
      currentVariant: null,
      upgradeToken: 0 // to cancel stale upgrades
    };

    this.maps.set(id, mapConfig);

    if (preload) {
      // Start with a safe initial quality (network-aware)
      this.loadMap(id, { progressive: true }).catch(() => {});
    }

    return mapConfig;
  }

  // ---------- Strategy helpers ----------
  _chooseInitialVariant(mapData, requested = 'auto') {
    if (requested && requested !== 'auto') return requested;

    const has = (v) => !!mapData.variants[v];
    const netLimited = ['slow-2g', '2g', '3g'].includes(this.netType) || this.saveData;

    if (this.isMobile || netLimited) {
      return has('medium') ? 'medium' : has('low') ? 'low' : 'high';
    }
    return has('high') ? 'high' : has('medium') ? 'medium' : 'low';
  }

  _nextHigherVariant(v) {
    if (v === 'low') return 'medium';
    if (v === 'medium') return 'high';
    return null;
  }

  // ---------- Core loading API ----------
  /**
   * Load a map. When progressive=true and higher variants exist, will upgrade in the background.
   * If the loaded map is the **primary** (school_main), this will automatically schedule the **secondary** (school_secondary).
   * @param {string} id
   * @param {{quality?:'low'|'medium'|'high'|'auto', progressive?:boolean, priority?:number}} [opts]
   * @returns {Promise<THREE.Object3D>} resolves when the first attached variant is in scene
   */
  async loadMap(id, opts = {}) {
    const mapData = this.maps.get(id);
    if (!mapData) throw new Error(`Map '${id}' not registered`);

    // If already present in scene, resolve immediately
    if (mapData.inScene && mapData.model) return mapData.model;

    const initial = this._chooseInitialVariant(mapData, opts.quality || 'auto');
    if (!mapData.variants[initial])
      throw new Error(`No available asset for initial variant '${initial}' of map '${id}'`);

    const priority = opts.priority ?? 1;
    const token = ++mapData.upgradeToken; // invalidate older operations

    // Enqueue initial variant (blocking promise)
    const first = await this._enqueueAndAwait({ id, variant: initial, priority });
    if (token !== mapData.upgradeToken) return first; // superseded

    // Mark as current
    this._attachVariant(mapData, first, initial, /*upgrade*/ false);

    // --- Hard-coded sequence: if we just attached the PRIMARY, start loading SECONDARY ---
    if (id === this.primaryId) {
      const sec = this.maps.get(this.secondaryId);
      if (sec && !sec.loaded) {
        // schedule with lower priority so it never blocks first render
        this._enqueue({
          id: this.secondaryId,
          variant: this._chooseInitialVariant(sec, 'auto'),
          priority: priority + 1
        });
      }
    }

    // Optional progressive upgrades for the map we just loaded
    if (opts.progressive !== false) {
      let v = initial,
        next;
      while ((next = this._nextHigherVariant(v)) && mapData.variants[next]) {
        // fire-and-forget upgrades, in priority order (lower priority number = earlier)
        this._enqueue({ id, variant: next, priority: priority + 1 });
        v = next;
      }
    }

    return mapData.model;
  }

  /**
   * Switch active map shown in the scene.
   */
  async switchToMap(id, unloadPrevious = true) {
    if (this.currentMap && this.activeMapId) {
      this.scene.remove(this.currentMap);
      const prev = this.maps.get(this.activeMapId);
      if (prev) prev.inScene = false;
      if (unloadPrevious && this.activeMapId !== id) this.unloadMap(this.activeMapId);
    }

    const model = await this.loadMap(id, { progressive: true, priority: 0 });
    const mapData = this.maps.get(id);
    if (mapData && !mapData.inScene) {
      this.scene.add(mapData.model);
      mapData.inScene = true;
    }

    this.currentMap = model;
    this.activeMapId = id;
    return model;
  }

  /**
   * Preload a set of maps (does not attach to scene). Respects concurrency.
   */
  async preloadMaps(mapIds) {
    const tasks = mapIds.map((id) => this.loadMap(id, { progressive: true }));
    await Promise.allSettled(tasks);
  }

  // ---------- Queue machinery ----------
  _enqueue(job) {
    const mapData = this.maps.get(job.id);
    if (!mapData) return;
    // Abort controller for stream fetch
    job.controller = new AbortController();
    this.queue.push(job);
    this.queue.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    this._pump();
  }

  _enqueueAndAwait({ id, variant, priority }) {
    return new Promise((resolve, reject) => {
      this._enqueue({ id, variant, priority, resolve, reject });
    });
  }

  async _pump() {
    while (this.active.size < this.MAX_CONCURRENCY && this.queue.length) {
      const job = this.queue.shift();
      this.active.add(job);

      const { id, variant, controller } = job;
      const mapData = this.maps.get(id);
      const token = mapData.upgradeToken; // capture token for race protection

      this._loadVariantArrayBuffer(mapData, variant, controller.signal)
        .then(({ arrayBuffer, url }) => this._parseGLB(arrayBuffer, url))
        .then((gltf) => {
          if (token !== mapData.upgradeToken) return null; // superseded
          if (job.resolve) job.resolve(gltf.scene || gltf.scenes?.[0]);
          return gltf;
        })
        .catch((err) => {
          if (job.reject) job.reject(err);
        })
        .finally(() => {
          this.active.delete(job);
          this._pump();
          if (this.active.size === 0 && this.queue.length === 0) this.onLoadComplete?.();
        });
    }
  }

  // ---------- Low-level loading ----------
  async _loadVariantArrayBuffer(mapData, variant, signal) {
    const url = mapData.variants[variant];
    if (!url) throw new Error(`Variant '${variant}' missing for ${mapData.id}`);

    // Stream fetch for byte-accurate progress
    const res = await fetch(url, { signal, cache: 'force-cache' });
    const reader = res.body?.getReader?.();
    const total = Number(res.headers.get('Content-Length')) || 0;

    if (total) this.globalTotalBytes += total; // track once per response

    if (!reader) {
      // Fallback: no streaming available
      const buf = await res.arrayBuffer();
      this.globalLoadedBytes += buf.byteLength;
      this._emitProgress(url);
      return { arrayBuffer: buf, url };
    }

    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      this.globalLoadedBytes += value.byteLength;
      this._emitProgress(url, mapData.id + ':' + variant);
    }
    const blob = new Blob(chunks);
    const arrayBuffer = await blob.arrayBuffer();
    return { arrayBuffer, url };
  }

  _emitProgress(url, stage) {
    const gl = this.globalLoadedBytes;
    const gt = this.globalTotalBytes || gl; // avoid NaN when lengths unknown
    const pct = Math.min(99, Math.floor((gl / gt) * 100));
    this.onLoadingProgress?.({ globalLoaded: gl, globalTotal: gt, pct, url, stage });
  }

  _parseGLB(arrayBuffer, url) {
    return new Promise((resolve, reject) => {
      this.loader.parse(arrayBuffer, '', (gltf) => resolve(gltf), (e) => reject(e));
    });
  }

  // ---------- Attaching & optimizing ----------
  _attachVariant(mapData, gltfScene, variant, isUpgrade) {
    const node = gltfScene || null;
    if (!node) return;

    // Apply transforms
    this._applyMapConfiguration(node, mapData.config);

    // Optimize materials/meshes (mobile-aware, crisp textures)
    this._optimizeMapModel(node);

    // If upgrading, replace old model cleanly
    if (isUpgrade && mapData.model) {
      this.scene.remove(mapData.model);
      disposeObject(mapData.model);
    }

    this.scene.add(node);

    mapData.model = node;
    mapData.loaded = true;
    mapData.inScene = true;
    mapData.currentVariant = variant;

    this.onStage?.(`${mapData.id}(${variant}) ready`);
  }

  _applyMapConfiguration(model, config) {
    model.scale.set(config.scale.x, config.scale.y, config.scale.z);
    model.rotation.set(config.rotation.x, config.rotation.y, config.rotation.z);
    model.position.set(config.position.x, config.position.y, config.position.z);
  }

  /**
   * IMPORTANT: keep textures sharp (mipmaps+trilinear+anisotropy) and only enable transparency if needed.
   */
  _optimizeMapModel(root) {
    const isMobile = this.isMobile;

    root.traverse((child) => {
      if (!child.isMesh || !child.material) return;

      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => {
        // --- Base color / albedo (sRGB) ---
        if (m.map) {
          const tex = m.map;
          if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
          tex.generateMipmaps = true;
          tex.minFilter = THREE.LinearMipmapLinearFilter; // trilinear
          tex.magFilter = THREE.LinearFilter;
          tex.anisotropy = isMobile ? 4 : 8;
          tex.needsUpdate = true;
        }

        // --- Other maps (linear) ---
        ['normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'lightMap'].forEach(
          (k) => {
            const tex = m[k];
            if (!tex) return;
            tex.generateMipmaps = true;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.anisotropy = isMobile ? 4 : 8;
            tex.needsUpdate = true;
          }
        );

        // --- Transparency only when necessary ---
        const wantsTransparency =
          !!m.transparent || !!m.alphaMap || (m.opacity != null && m.opacity < 1.0);
        if (wantsTransparency) {
          m.transparent = true;
          // Prefer alphaTest for foliage/decals (cheaper than full blending)
          if (m.alphaTest == null) m.alphaTest = isMobile ? 0.2 : 0.1;
          m.depthWrite = m.alphaTest < 0.5; // keep depth write when using cutout
          // Don’t force opacity lower than 1 unless asset authoring requires it
          if (m.opacity == null) m.opacity = 1.0;
          // Only force DoubleSide if you *know* your asset needs it (e.g., leaves)
          // m.side = DoubleSide;
          // Slight polygon offset to mitigate z-fighting for thin decals/foliage
          m.polygonOffset = true;
          m.polygonOffsetFactor = 1;
          m.polygonOffsetUnits = 1;
        } else {
          m.transparent = false;
          m.opacity = 1.0;
          m.depthWrite = true;
        }

        // Disable some extras on mobile
        if (isMobile) {
          m.envMap = null;
          m.lightMap = m.lightMap || null;
        }

        // Your existing micro-opts
        try {
          optimizeMaterial(m);
        } catch {}
        m.needsUpdate = true;
      });

      // Shadows – off on mobile for perf
      child.receiveShadow = !isMobile;
      child.castShadow = !isMobile;

      // Mark static objects
      if (!child.name.includes('dynamic') && !child.name.includes('animated')) {
        child.userData.static = true;
        child.matrixAutoUpdate = false;
        child.updateMatrix();
      }

      // Distance culling hint
      if (isMobile) {
        child.userData.maxRenderDistance = child.userData.maxRenderDistance || 80;
      }
    });
  }

  // ---------- Unload / housekeeping ----------
  unloadMap(id) {
    const mapData = this.maps.get(id);
    if (!mapData || !mapData.loaded) return;

    if (mapData.inScene && mapData.model) {
      this.scene.remove(mapData.model);
      mapData.inScene = false;
    }

    if (mapData.model) disposeObject(mapData.model);

    mapData.model = null;
    mapData.loaded = false;
    mapData.currentVariant = null;
    if (this.activeMapId === id) {
      this.currentMap = null;
      this.activeMapId = null;
    }
  }

  getCurrentMap() {
    return { id: this.activeMapId, model: this.currentMap };
  }
  getAllMaps() {
    return this.maps;
  }

  /**
   * Load two maps and show both (kept for compatibility). Upgrades still happen progressively.
   */
  async loadBothMaps(mapId1, mapId2) {
    const [m1, m2] = await Promise.all([
      this.loadMap(mapId1, { progressive: true, priority: 0 }),
      this.loadMap(mapId2, { progressive: true, priority: 1 })
    ]);

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

    this.currentMap = m1;
    this.activeMapId = mapId1;
    return { map1: m1, map2: m2 };
  }

  /** Simple status snapshot */
  getLoadingStatus() {
    const status = {};
    for (const [id, m] of this.maps) {
      status[id] = { loaded: m.loaded, inScene: m.inScene, variant: m.currentVariant };
    }
    return status;
  }

  /** Resource tracking hook, if you have a MemoryManager in scene.userData.memoryManager */
  trackMapResources(model, memoryManager) {
    model.traverse((child) => {
      if (!child.isMesh) return;
      if (child.geometry) memoryManager.track(child.geometry, 'geometry');
      const mat = child.material;
      if (Array.isArray(mat)) {
        mat.forEach((mm) => {
          memoryManager.track(mm, 'material');
          if (mm?.map) memoryManager.track(mm.map, 'texture');
        });
      } else if (mat) {
        memoryManager.track(mat, 'material');
        if (mat.map) memoryManager.track(mat.map, 'texture');
      }
    });
  }

  /** Dispose all maps & cancel pending */
  dispose() {
    // Abort any in-flight fetches
    this.queue.forEach((j) => j.controller?.abort?.());
    this.active.forEach((j) => j.controller?.abort?.());
    this.queue = [];
    this.active.clear();

    for (const [id] of this.maps) this.unloadMap(id);
    this.maps.clear();
    this.currentMap = null;
    this.activeMapId = null;
  }
}

export default MapManager;
