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
    
    // Bird's eye view settings
    this.birdEyePosition = new Vector3(0, 120, 0);
    this.birdEyeTarget = new Vector3(0, 0, 0);
    
    // Animation settings
    this.transitionDuration = 1.5;
    this.isTransitioning = false;
    
    // UI Container
    this.uiContainer = null;
    this.createUI();
    
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
      gap: 8px;
      z-index: 1000;
      padding-bottom: env(safe-area-inset-bottom, 0px);
    `;
    
    // Bird's Eye View Button - SwiftUI-inspired design
    this.birdEyeButton = document.createElement('button');
    this.birdEyeButton.innerHTML = '🦅';
    this.birdEyeButton.title = 'Bird\'s Eye View';
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
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    `;
    
    // Tram Follow Button - SwiftUI-inspired design
    this.tramFollowButton = document.createElement('button');
    this.tramFollowButton.innerHTML = '🚊';
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
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    `;
    
    // Add SwiftUI-like touch interactions
    [this.birdEyeButton, this.tramFollowButton].forEach(button => {
      // Touch events for iOS-like feedback
      button.addEventListener('touchstart', (e) => {
        e.preventDefault();
        button.style.transform = 'scale(0.95)';
        button.style.background = 'rgba(255, 255, 255, 0.8)';
      });
      
      button.addEventListener('touchend', (e) => {
        e.preventDefault();
        button.style.transform = 'scale(1)';
        button.style.background = 'rgba(255, 255, 255, 0.95)';
      });
      
      button.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        button.style.transform = 'scale(1)';
        button.style.background = 'rgba(255, 255, 255, 0.95)';
      });
      
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
    
    // Event listeners
    this.birdEyeButton.addEventListener('click', (e) => {
      e.preventDefault();
      this.setBirdEyeView();
    });
    
    this.tramFollowButton.addEventListener('click', (e) => {
      e.preventDefault();
      this.setTramFollow();
    });
    
    // Add buttons to container
    this.uiContainer.appendChild(this.birdEyeButton);
    this.uiContainer.appendChild(this.tramFollowButton);
    
    // Add to DOM
    document.body.appendChild(this.uiContainer);
    
    // Update button states
    this.updateButtonStates();
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
      activeButton.style.background = '#007AFF';
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
        // Restrict controls for top-down view
        this.controls.minDistance = 50;
        this.controls.maxDistance = 200;
        this.controls.maxPolarAngle = Math.PI / 6; // Only allow slight angle changes
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
    
    if (this.uiContainer && this.uiContainer.parentNode) {
      this.uiContainer.parentNode.removeChild(this.uiContainer);
    }
    
    // Kill any running animations
    gsap.killTweensOf(this.camera.position);
    gsap.killTweensOf(this.controls.target);
  }
}

export default CameraController;