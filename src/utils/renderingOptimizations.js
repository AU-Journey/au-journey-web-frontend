/**
 * Rendering optimization utilities for Three.js
 */
import { PCFSoftShadowMap, LOD, Object3D, Mesh, Group } from 'three';

/**
 * Configure renderer for optimal performance
 * @param {WebGLRenderer} renderer - Three.js renderer instance
 */
export function optimizeRenderer(renderer) {
  // Enable hardware acceleration
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2 for performance
  
  // Shadow optimizations
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true; // Keep auto-update enabled for proper lighting
  
  // Additional optimizations
  renderer.powerPreference = "high-performance";
  renderer.antialias = true;
  renderer.stencil = false; // Disable if not needed
  renderer.depth = true;
}

/**
 * Optimize material for better performance and lighting
 * @param {Material} material - Three.js material
 */
export function optimizeMaterial(material) {
  // Handle transparent materials carefully for better visibility
  if (material.transparent) {
    material.alphaTest = material.alphaTest || 0.1; // Lower threshold for better grass visibility
    material.depthWrite = material.alphaTest < 0.5; // Enable depth writing for better sorting
  } else {
    // Ensure opaque materials are fully opaque for better lighting
    material.transparent = false;
    material.opacity = 1.0;
    material.depthWrite = true;
  }
  
  // Enable frustum culling for performance
  material.frustumCulled = true;
  
  // Ensure proper lighting calculation
  material.needsUpdate = true;
}

/**
 * Setup LOD (Level of Detail) for complex objects
 * @param {Object3D} object - Three.js object
 * @param {Object} options - LOD configuration options
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
  
  // High detail for close range
  lod.addLevel(object, highDetailDistance);
  
  // Medium detail clone for medium range
  if (createMediumDetail) {
    const mediumDetail = createSimplifiedVersion(object, 0.5);
    lod.addLevel(mediumDetail, mediumDetailDistance);
  }
  
  // Low detail for far range
  if (createLowDetail) {
    const lowDetail = createSimplifiedVersion(object, 0.25);
    lod.addLevel(lowDetail, lowDetailDistance);
  }
  
  // Hide for very far range
  lod.addLevel(new Object3D(), hideDistance);
  
  return lod;
}

/**
 * Create a simplified version of an object for LOD
 * @param {Object3D} originalObject - Original object
 * @param {number} simplificationFactor - Factor to reduce detail (0.1 - 1.0)
 */
function createSimplifiedVersion(originalObject, simplificationFactor = 0.5) {
  const simplified = originalObject.clone();
  
  simplified.traverse((child) => {
    if (child.isMesh && child.geometry) {
      // Disable shadows for simplified versions
      child.castShadow = false;
      child.receiveShadow = false;
      
      // Reduce material quality
      if (child.material) {
        const simplifiedMaterial = child.material.clone();
        simplifiedMaterial.shadowSide = 0; // No shadow
        simplifiedMaterial.transparent = false; // Remove transparency for speed
        child.material = simplifiedMaterial;
      }
    }
  });
  
  return simplified;
}

/**
 * Dispose of Three.js resources properly
 * @param {Object3D} object - Three.js object to dispose
 */
export function disposeObject(object) {
  if (object.geometry) {
    object.geometry.dispose();
  }
  
  if (object.material) {
    if (Array.isArray(object.material)) {
      object.material.forEach(material => material.dispose());
    } else {
      object.material.dispose();
    }
  }
  
  if (object.texture) {
    object.texture.dispose();
  }
}

/**
 * Optimize scene for better performance
 * @param {Scene} scene - Three.js scene
 * @param {Object} options - Optimization options
 */
export function optimizeScene(scene, options = {}) {
  const {
    enableBatching = true,
    enableAdvancedCulling = true,
    enableInstancedMeshes = false
  } = options;
  
  // Enable auto-clear for better performance
  scene.autoUpdate = false; // Update manually when needed
  
  // Collect meshes for potential batching
  const meshGroups = new Map();
  
  // Traverse and optimize all objects
  scene.traverse((child) => {
    if (child.isMesh) {
      // Enable frustum culling
      child.frustumCulled = true;
      
      // Optimize materials
      if (child.material) {
        optimizeMaterial(child.material);
      }
      
      // Set matrix auto update based on whether object moves
      if (child.userData.static) {
        child.matrixAutoUpdate = false;
        child.updateMatrix();
      }
      
      // Advanced culling for large scenes
      if (enableAdvancedCulling) {
        // Enable distance culling for non-essential objects
        if (child.userData.nonEssential) {
          child.userData.maxRenderDistance = child.userData.maxRenderDistance || 150;
        }
        
        // Enable occlusion culling hints
        if (child.userData.occluded) {
          child.visible = false; // Can be toggled based on camera position
        }
      }
      
      // Group similar meshes for potential batching
      if (enableBatching && child.userData.static) {
        const materialKey = getMaterialKey(child.material);
        if (!meshGroups.has(materialKey)) {
          meshGroups.set(materialKey, []);
        }
        meshGroups.get(materialKey).push(child);
      }
    }
  });
  
  // Apply batching optimizations
  if (enableBatching) {
    applyMeshBatching(meshGroups, scene);
  }
}

/**
 * Generate a key for material-based grouping
 * @param {Material} material - Three.js material
 */
function getMaterialKey(material) {
  return `${material.type}_${material.color ? material.color.getHex() : 'nocolor'}_${material.map ? material.map.uuid : 'notex'}`;
}

/**
 * Apply mesh batching optimizations
 * @param {Map} meshGroups - Grouped meshes by material
 * @param {Scene} scene - Three.js scene
 */
function applyMeshBatching(meshGroups, scene) {
  for (const [materialKey, meshes] of meshGroups) {
    // Only batch if we have multiple similar meshes
    if (meshes.length > 3) {
      // Note: In a real implementation, you'd merge geometries here
      // This is a placeholder for actual geometry merging logic
      batchMeshes(meshes, scene);
    }
  }
}

/**
 * Batch similar meshes together (simplified implementation)
 * @param {Array} meshes - Array of similar meshes
 * @param {Scene} scene - Three.js scene
 */
function batchMeshes(meshes, scene) {
  // This is a simplified batching approach
  // In production, you'd use BufferGeometryUtils.mergeBufferGeometries()
  
  meshes.forEach(mesh => {
    // Disable individual shadow casting for batched items to reduce draw calls
    if (meshes.length > 10) {
      mesh.castShadow = false;
    }
    
    // Mark as batched for debugging
    mesh.userData.batched = true;
  });
}

/**
 * Distance-based culling utility
 * @param {Camera} camera - Three.js camera
 * @param {Scene} scene - Three.js scene
 * @param {number} frameCount - Current frame count for throttling
 */
export function updateDistanceCulling(camera, scene, frameCount = 0) {
  // Only update every 10 frames to reduce computational overhead
  if (frameCount % 10 !== 0) return;
  
  const cameraPosition = camera.position;
  
  scene.traverse((child) => {
    if (child.isMesh && child.userData.maxRenderDistance) {
      const distance = cameraPosition.distanceTo(child.position);
      const shouldBeVisible = distance <= child.userData.maxRenderDistance;
      
      // Only change visibility if it's different to avoid unnecessary updates
      if (child.visible !== shouldBeVisible) {
        child.visible = shouldBeVisible;
      }
    }
  });
}