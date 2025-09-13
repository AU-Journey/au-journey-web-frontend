import { Vector3 } from 'three';
import gsap from 'gsap';

class CameraController {
  constructor(camera, controls, scene) {
    this.camera = camera;
    this.controls = controls;
    this.scene = scene;
    
    // Camera modes: 'free', 'bird-eye', 'tram-follow'
    this.currentMode = 'free';
    this.previousMode = 'free';
    
    // Store original settings for restoration
    this.originalPosition = this.camera.position.clone();
    this.originalTarget = this.controls.target.clone();
    this.originalMinDistance = this.controls.minDistance;
    this.originalMaxDistance = this.controls.maxDistance;
    this.originalMaxPolarAngle = this.controls.maxPolarAngle;
    
    // Tram following settings
    this.tramObjects = [];
    this.currentTramIndex = 0;
    this.followOffset = new Vector3(0, 30, 60); // Y: height, Z: behind
    this.tramFollowMinDistance = 15;
    this.tramFollowMaxDistance = 80;
    
    // Bird's eye view settings - centered on map with slight angle  
    this.birdEyePosition = new Vector3(53.69, 300, 50);  // Angled view - moved camera back and lower
    this.birdEyeTarget = new Vector3(53.69, 0, -55.24);  // Keep target at map center
    
    // Animation settings
    this.transitionDuration = 1.5;
    this.isTransitioning = false;
    
    // UI Container
    this.uiContainer = null;
    this.createUI();
    
    // Debug mode for position finding
    this.debugMode = false;
    this.setupDebugTouch();
    
    // Update trams periodically
    this.updateTramObjectsInterval = setInterval(() => {
      this.updateTramObjects();
    }, 1000);
  }
  
  createUI() {
    // Create UI container positioned at bottom right - vertical layout for SwiftUI-like design
    // Positioned above mobile tab bar area
    this.uiContainer = document.createElement('div');
    this.uiContainer.style.cssText = `
      position: fixed;
      bottom: 100px;
      right: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      z-index: 1000;
      padding-bottom: env(safe-area-inset-bottom, 0px);
      pointer-events: auto;
    `;
    
    // Add mobile-specific optimizations via media query
    const style = document.createElement('style');
    style.textContent = `
      @media (max-width: 768px), (hover: none) {
        .camera-control-button {
          min-width: 52px !important;
          min-height: 52px !important;
          width: 52px !important;
          height: 52px !important;
          font-size: 20px !important;
          margin: 4px 0 !important;
        }
        .camera-controls-container {
          bottom: 120px !important;
          right: 15px !important;
          gap: 16px !important;
        }
      }
      
      @media (max-width: 480px) {
        .camera-controls-container {
          bottom: 140px !important;
          right: 10px !important;
        }
      }
    `;
    document.head.appendChild(style);
    
    // Bird's Eye View Button - SwiftUI-inspired design
    this.birdEyeButton = document.createElement('button');
    this.birdEyeButton.title = 'Bird\'s Eye View';
    this.birdEyeButton.className = 'camera-control-button';
    this.birdEyeButton.style.cssText = `
      background: rgba(255, 255, 255, 0.95);
      color: #007AFF;
      border: none;
      border-radius: 12px;
      padding: 0;
      cursor: pointer;
      font-size: 18px;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      transition: all 0.2s ease;
      width: 54px;
      height: 54px;
      min-width: 54px;
      min-height: 54px;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-tap-highlight-color: transparent;
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
      touch-action: manipulation;
    `;

    const mapImg = document.createElement('img');
    mapImg.src = '/src/components/svg_assets/map.svg'; // update path
    mapImg.alt = '';
    mapImg.width = 24;
    mapImg.height = 24;
    mapImg.style.pointerEvents = 'none';
    this.birdEyeButton.appendChild(mapImg);
    
    // Tram Follow Button - SwiftUI-inspired design
    this.tramFollowButton = document.createElement('button');
    this.tramFollowButton.className = 'camera-control-button';
    this.tramFollowButton.title = 'Follow Tram';
    this.tramFollowButton.style.cssText = `
      background: rgba(255, 255, 255, 0.95);
      color: #007AFF;
      border: none;
      border-radius: 12px;
      padding: 0;
      cursor: pointer;
      font-size: 18px;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      transition: all 0.2s ease;
      width: 54px;
      height: 54px;
      min-width: 54px;
      min-height: 54px;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-tap-highlight-color: transparent;
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
      touch-action: manipulation;
    `;

    const tramImg = document.createElement('img');
    tramImg.src = '/src/components/svg_assets/tram.svg'; // update path
    tramImg.alt = '';
    tramImg.width = 24;
    tramImg.height = 24;
    tramImg.style.pointerEvents = 'none';
    this.tramFollowButton.appendChild(tramImg);
    
    // Add SwiftUI-like touch interactions
    [this.birdEyeButton, this.tramFollowButton].forEach(button => {
      // Touch events for iOS-like feedback - using passive listeners where possible
      button.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        button.style.transform = 'scale(0.95)';
        button.style.background = 'rgba(255, 255, 255, 0.8)';
      }, { passive: false });
      
      button.addEventListener('touchend', (e) => {
        button.style.transform = 'scale(1)';
        button.style.background = 'rgba(255, 255, 255, 0.95)';
        // Stop event propagation to prevent conflicts with Three.js controls
        e.stopPropagation();
        // Trigger click event for better mobile compatibility
        setTimeout(() => {
          if (e.target === button && !e.defaultPrevented) {
            button.click();
          }
        }, 10);
      }, { passive: false });
      
      button.addEventListener('touchcancel', (e) => {
        button.style.transform = 'scale(1)';
        button.style.background = 'rgba(255, 255, 255, 0.95)';
      }, { passive: true });
      
      // Mouse events for desktop testing
      button.addEventListener('mousedown', () => {
        button.style.transform = 'scale(0.95)';
        button.style.background = 'rgba(255, 255, 255, 0.8)';
      });
      
      button.addEventListener('mouseup', () => {
        button.style.transform = 'scale(1)';
        button.style.background = 'rgba(255, 255, 255, 0.95)';
      });
      
      button.addEventListener('mouseleave', () => {
        button.style.transform = 'scale(1)';
        button.style.background = 'rgba(255, 255, 255, 0.95)';
      });
    });
    
    // Event listeners - improved for mobile compatibility
    this.birdEyeButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.setBirdEyeView();
    });
    
    this.tramFollowButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.setTramFollow();
    });
    
    // Add class to container for media queries
    this.uiContainer.className = 'camera-controls-container';
    
    // Add buttons to container
    this.uiContainer.appendChild(this.birdEyeButton);
    this.uiContainer.appendChild(this.tramFollowButton);
    
    // Add to DOM
    document.body.appendChild(this.uiContainer);
    
    // Update button states
    this.updateButtonStates();
  }
  
  // Update bird's eye view target with calculated map center
  updateBirdEyeTarget(mapCenter) {
    if (!mapCenter) return;
    
    // Update the target to the calculated map center
    this.birdEyeTarget.copy(mapCenter);
    
    // Position camera above the center at the same relative height
    this.birdEyePosition.set(mapCenter.x, 350, mapCenter.z);
  }
  
  updateButtonStates() {
    // Reset all buttons to default SwiftUI state
    [this.birdEyeButton, this.tramFollowButton].forEach(button => {
      button.style.background = 'rgba(255, 255, 255, 0.95)';
      button.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
    });
    
    // Highlight active button with SwiftUI-style selection
    let activeButton;
    switch (this.currentMode) {
      case 'bird-eye':
        activeButton = this.birdEyeButton;
        break;
      case 'tram-follow':
        activeButton = this.tramFollowButton;
        break;
      case 'free':
      default:
        // Default to no active button when in free mode
        break;
    }
    
    if (activeButton) {
      activeButton.style.background = '#444444';
      activeButton.style.color = 'white';
      activeButton.style.boxShadow = '0 4px 12px rgba(0, 122, 255, 0.3)';
    }
  }
  
  updateTramObjects() {
    // Clear previous trams
    this.tramObjects = [];
    
    // Get tram directly from SchoolMap instance - this is the main tram.fbx object
    if (window.schoolMapInstance && window.schoolMapInstance.tram) {
      this.tramObjects.push(window.schoolMapInstance.tram);
    }
    
    // If we're in tram follow mode and no trams available, switch to bird's eye view
    if (this.currentMode === 'tram-follow' && this.tramObjects.length === 0) {
      this.setBirdEyeView();
    }
    
    // Update button states to show current tram count
    this.updateButtonStates();
  }
  
  setBirdEyeView() {
    if (this.isTransitioning || this.currentMode === 'bird-eye') return;
    
    this.previousMode = this.currentMode;
    this.currentMode = 'bird-eye';
    this.isTransitioning = true;
    
    // Animate camera to bird's eye position
    const timeline = gsap.timeline({
      onComplete: () => {
        this.isTransitioning = false;
        // Optimize controls for bird's eye exploration
        // Calculate current distance as maximum to prevent zooming out further
        const currentDistance = this.camera.position.distanceTo(this.controls.target);
        this.controls.minDistance = 30; // Allow zooming in for detail exploration
        this.controls.maxDistance = Math.max(currentDistance, 350); // Prevent zooming out beyond current view
        this.controls.maxPolarAngle = Math.PI / 2.5; // Allow reasonable angle changes (72 degrees)
        this.controls.enableRotate = true;
      }
    });
    
    timeline.to(this.camera.position, {
      duration: this.transitionDuration,
      x: this.birdEyePosition.x,
      y: this.birdEyePosition.y,
      z: this.birdEyePosition.z,
      ease: 'power2.out'
    });
    
    timeline.to(this.controls.target, {
      duration: this.transitionDuration,
      x: this.birdEyeTarget.x,
      y: this.birdEyeTarget.y,
      z: this.birdEyeTarget.z,
      ease: 'power2.out',
      onUpdate: () => this.controls.update()
    }, '<');
    
    this.updateButtonStates();
  }
  
  setTramFollow() {
    if (this.isTransitioning) return;
    
    this.updateTramObjects();
    
    if (this.tramObjects.length === 0) {
      return;
    }
    
    if (this.currentMode === 'tram-follow') {
      // If already following tram, switch back to bird's eye view
      this.setBirdEyeView();
      return;
    }
    
    // Enter tram follow mode
    this.previousMode = this.currentMode;
    this.currentMode = 'tram-follow';
    this.currentTramIndex = 0;
    
    this.followCurrentTram();
  }
  
  followCurrentTram() {
    if (this.tramObjects.length === 0) return;
    
    const tram = this.tramObjects[this.currentTramIndex];
    if (!tram) return;
    
    this.isTransitioning = true;
    
    // Calculate camera position behind and above the tram
    const tramPosition = tram.position.clone();
    const cameraPosition = tramPosition.clone().add(this.followOffset);
    
    // Animate camera to follow position
    const timeline = gsap.timeline({
      onComplete: () => {
        this.isTransitioning = false;
        // Set up controls for tram following
        this.controls.minDistance = this.tramFollowMinDistance;
        this.controls.maxDistance = this.tramFollowMaxDistance;
        this.controls.maxPolarAngle = Math.PI / 2.1; // Restore normal angle limits
        this.controls.enableRotate = true;
      }
    });
    
    timeline.to(this.camera.position, {
      duration: this.transitionDuration,
      x: cameraPosition.x,
      y: cameraPosition.y,
      z: cameraPosition.z,
      ease: 'power2.out'
    });
    
    timeline.to(this.controls.target, {
      duration: this.transitionDuration,
      x: tramPosition.x,
      y: tramPosition.y,
      z: tramPosition.z,
      ease: 'power2.out',
      onUpdate: () => this.controls.update()
    }, '<');
    
    this.updateButtonStates();
  }
  
  
  // Update method to be called in the animation loop for tram following
  update() {
    if (this.currentMode === 'tram-follow' && !this.isTransitioning && this.tramObjects.length > 0) {
      const tram = this.tramObjects[this.currentTramIndex];
      if (tram) {
        // Smoothly update controls target to follow the tram
        const tramPosition = tram.position.clone();
        this.controls.target.lerp(tramPosition, 0.05); // Smooth following
        this.controls.update();
      }
    }
  }
  
  // Get current camera mode
  getCurrentMode() {
    return this.currentMode;
  }
  
  // Check if transitioning
  getIsTransitioning() {
    return this.isTransitioning;
  }
  
  // Dispose method for cleanup
  dispose() {
    if (this.updateTramObjectsInterval) {
      clearInterval(this.updateTramObjectsInterval);
    }
    
    if (this.debugUpdateInterval) {
      clearInterval(this.debugUpdateInterval);
    }
    
    if (this.debugInfo && this.debugInfo.parentNode) {
      this.debugInfo.parentNode.removeChild(this.debugInfo);
    }
    
    if (this.uiContainer && this.uiContainer.parentNode) {
      this.uiContainer.parentNode.removeChild(this.uiContainer);
    }
    
    // Kill any running animations
    gsap.killTweensOf(this.camera.position);
    gsap.killTweensOf(this.controls.target);
  }
  
  // Debug function to help find map center
  setupDebugTouch() {
    if (!this.debugMode) return;
    
    // Create debug info display
    this.debugInfo = document.createElement('div');
    this.debugInfo.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 10px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 12px;
      z-index: 1001;
      pointer-events: none;
      white-space: pre-line;
    `;
    document.body.appendChild(this.debugInfo);
    
    // Add touch/click listener to canvas
    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('click', (e) => {
        this.logCurrentPosition(e);
      });
      
      canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.logCurrentPosition(e);
      });
    }
    
    // Update debug info continuously
    this.debugUpdateInterval = setInterval(() => {
      this.updateDebugInfo();
    }, 100);
    
    console.log('Debug mode enabled! Click/touch anywhere on the map to log position info.');
  }
  
  logCurrentPosition(e) {
    const cameraPos = this.camera.position;
    const target = this.controls.target;
    
    console.log('=== POSITION DEBUG INFO ===');
    console.log('Camera Position:', `x: ${cameraPos.x.toFixed(2)}, y: ${cameraPos.y.toFixed(2)}, z: ${cameraPos.z.toFixed(2)}`);
    console.log('Camera Target:', `x: ${target.x.toFixed(2)}, y: ${target.y.toFixed(2)}, z: ${target.z.toFixed(2)}`);
    console.log('Distance from target:', this.camera.position.distanceTo(target).toFixed(2));
    console.log('===========================');
    
    // Flash the debug info
    if (this.debugInfo) {
      this.debugInfo.style.background = 'rgba(255, 255, 255, 0.9)';
      this.debugInfo.style.color = 'black';
      setTimeout(() => {
        this.debugInfo.style.background = 'rgba(0, 0, 0, 0.8)';
        this.debugInfo.style.color = 'white';
      }, 200);
    }
  }
  
  updateDebugInfo() {
    if (!this.debugInfo) return;
    
    const cameraPos = this.camera.position;
    const target = this.controls.target;
    const distance = this.camera.position.distanceTo(target);
    
    this.debugInfo.textContent = 
      `DEBUG MODE - Click to log position
Camera: ${cameraPos.x.toFixed(1)}, ${cameraPos.y.toFixed(1)}, ${cameraPos.z.toFixed(1)}
Target: ${target.x.toFixed(1)}, ${target.y.toFixed(1)}, ${target.z.toFixed(1)}
Distance: ${distance.toFixed(1)}
Mode: ${this.currentMode}`;
  }
}


export default CameraController;