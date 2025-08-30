/**
 * Rendering optimization utilities for Three.js (mobile-first)
 * - Safe renderer defaults (set at construction time)
 * - Smart DPR cap + adaptive resolution scaler
 * - Shadow, tone-mapping, and color space sane defaults
 * - Material/object optimizations (no illegal props on materials)
 * - Robust dispose traversal
 */
import {
  PCFShadowMap,
  LOD,
  Object3D,
  WebGLRenderer,
  SRGBColorSpace,
  NoToneMapping
} from 'three';

/**
 * Create a renderer already tuned for mobile/web perf.
 * Prefer calling this to set options that only work at construction time.
 */
export function createOptimizedRenderer(THREE, { antialiasDesktop = true, alpha = false } = {}) {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const renderer = new THREE.WebGLRenderer({
    antialias: isMobile ? false : !!antialiasDesktop,
    alpha,
    powerPreference: 'high-performance',
    depth: true,
    stencil: false,
    preserveDrawingBuffer: false,
    logarithmicDepthBuffer: false
  });

  applyRendererDefaults(renderer);
  return renderer;
}

/**
 * Apply fast defaults to an existing renderer.
 * Safe to call multiple times.
 */
export function applyRendererDefaults(renderer) {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping; // swap to ACES if you need it, but it's a cost

  // Start shadows conservative; enable per-light later as needed
  renderer.shadowMap.enabled = !isMobile;
  if (renderer.shadowMap.enabled) {
    renderer.shadowMap.type = PCFShadowMap; // cheaper than PCFSoft on phones
    renderer.shadowMap.autoUpdate = false;  // call renderer.shadowMap.needsUpdate = true when lights/receivers move
  }
}

/**
 * Lightweight dynamic resolution scaler to keep frame time under budget.
 * Call `scaler.markFrame(dt)` once per frame and `scaler.resizeToDisplay()` on demand.
 */
export function makeAdaptiveResolution(renderer, {
  targetFPS = 60,
  minScale = 0.6,
  maxScale = 1.0
} = {}) {
  let scale = 1.0;
  let last = performance.now();
  const budget = 1000 / targetFPS;

  function markFrame() {
    const now = performance.now();
    const dt = now - last; last = now;
    if (dt > budget * 1.15 && scale > minScale) {
      scale = Math.max(minScale, scale * 0.9);
    } else if (dt < budget * 0.7 && scale < maxScale) {
      scale = Math.min(maxScale, scale * 1.05);
    }
  }

  function resizeToDisplay() {
    const w = Math.floor(window.innerWidth * scale);
    const h = Math.floor(window.innerHeight * scale);
    renderer.setSize(w, h, false);
  }

  return { get scale() { return scale; }, markFrame, resizeToDisplay };
}

/**
 * Optimize a material (no illegal material.frustumCulled!).
 * Note: frustum culling is a property of Object3D (meshes), not materials.
 */
export function optimizeMaterial(material) {
  // Transparent materials are expensive; prefer alphaTest over true blending
  if (material.transparent) {
    material.alphaTest = material.alphaTest ?? 0.1;
    material.depthWrite = material.alphaTest < 0.5;
  } else {
    material.transparent = false;
    material.opacity = 1.0;
    material.depthWrite = true;
  }
  material.needsUpdate = true;
}

/**
 * Apply per-object optimizations (frustum culling, static flags, etc.).
 */
export function optimizeObject3D(object, { isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) } = {}) {
  object.traverse((child) => {
    if (!child.isMesh) return;

    // Frustum culling belongs on the mesh
    child.frustumCulled = true;

    const m = child.material;
    if (Array.isArray(m)) m.forEach(optimizeMaterial); else if (m) optimizeMaterial(m);

    // Shadows: off on mobile unless needed
    child.castShadow = !isMobile;
    child.receiveShadow = !isMobile;

    // Mark static meshes to freeze matrices
    if (!child.name.includes('dynamic') && !child.name.includes('animated')) {
      child.userData.static = true;
      child.matrixAutoUpdate = false;
      child.updateMatrix();
    }

    // Optional distance culling hint for your camera loop
    if (isMobile && child.userData.maxRenderDistance == null) child.userData.maxRenderDistance = 80;
  });
}

/**
 * Setup basic LOD levels. This duplicates objects for lower-detail shells.
 * For *real* simplification, plug a geometry simplifier (e.g. three-mesh-bvh + decimator) offline.
 */
export function setupLOD(object, options = {}) {
  const {
    highDetailDistance = 0,
    mediumDetailDistance = 50,
    lowDetailDistance = 100,
    hideDistance = 200,
    createMediumDetail = false,
    createLowDetail = false
  } = options;

  const lod = new LOD();
  lod.addLevel(object, highDetailDistance);

  if (createMediumDetail) {
    const mid = shallowSimplify(object, 0.5);
    lod.addLevel(mid, mediumDetailDistance);
  }
  if (createLowDetail) {
    const low = shallowSimplify(object, 0.25);
    lod.addLevel(low, lowDetailDistance);
  }

  lod.addLevel(new Object3D(), hideDistance);
  return lod;
}

function shallowSimplify(original, factor = 0.5) {
  const copy = original.clone(true);
  copy.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = false; child.receiveShadow = false;
    if (child.material) {
      const m = child.material.clone();
      m.transparent = false; // avoid blending on distant LODs
      m.depthWrite = true;
      child.material = m;
    }
  });
  return copy;
}

/**
 * Dispose of Three.js resources (deep traversal).
 */
export function disposeObject(root) {
  const seen = new Set();
  root.traverse((obj) => {
    if (obj.isMesh) {
      if (obj.geometry && !seen.has(obj.geometry)) { obj.geometry.dispose(); seen.add(obj.geometry); }
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.filter(Boolean).forEach((mat) => {
        // dispose common maps if they look uniquely owned
        ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','alphaMap','lightMap'].forEach((k)=>{
          const tex = mat[k];
          if (tex && !seen.has(tex)) { tex.dispose?.(); seen.add(tex); }
        });
        mat.dispose?.();
      });
    }
  });
}

/**
 * Scene-wide micro-optimizations.
 */
export function optimizeScene(scene, options = {}) {
  const {
    enableAdvancedCulling = true,
  } = options;

  scene.traverse((child) => {
    if (!child.isMesh) return;

    // Enable frustum culling and static flags if set by authoring
    child.frustumCulled = true;
    if (child.userData.static) {
      child.matrixAutoUpdate = false;
      child.updateMatrix();
    }

    if (enableAdvancedCulling) {
      if (child.userData.nonEssential && child.userData.maxRenderDistance == null) {
        child.userData.maxRenderDistance = 150;
      }
      if (child.userData.occluded) {
        child.visible = false; // you can toggle this based on camera/occluders
      }
    }
  });
}

/**
 * Distance-based culling utility (call from your render loop every N frames).
 */
export function updateDistanceCulling(camera, scene, frameCount = 0) {
  if (frameCount % 10 !== 0) return; // throttle work
  const camPos = camera.position;
  scene.traverse((child) => {
    if (child.isMesh && child.userData.maxRenderDistance) {
      const d = camPos.distanceTo(child.position);
      const visible = d <= child.userData.maxRenderDistance;
      if (child.visible !== visible) child.visible = visible;
    }
  });
}
export const optimizeRenderer = applyRendererDefaults;
