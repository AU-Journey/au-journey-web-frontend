// TramMovement.js
import { Vector3 } from 'three';
import gsap from 'gsap';
import WebSocketGPSService from '../services/WebSocketGPSService.js';

class TramMovement {
  constructor(tram, gpsTo3DCoords, gpsPoints = null, offset = new Vector3(0, 0, 0), gpsConfig = {}) {
    this.tram = tram;
    this.offset = offset;
    this.isMoving = false;
    this.baseHeight = -0.3; // Lowered to match initial placement
    this.currentTween = null;
    
    // Speed settings (units per second) - inspired by your smooth version
    this.tramSpeed = 10; // Slower speed for realistic tram movement
    this.rotationSpeed = 1; // Slower rotation for smoother turning
    
    // GPS service - WebSocket only
    this.webSocketGPS = new WebSocketGPSService(gpsConfig);
    
    // GPS tracking
    this.currentGPS = null;
    this.previousGPS = null;
    this.lastUpdateTime = 0;
    this.updateInterval = 2000; // Update every 2 seconds to reduce load
    
    // For fallback/initial positioning, use static GPS points if provided
    this.fallbackGPSPoints = gpsPoints;
    
    // Calculate coordinate system parameters
    // Use static points for coordinate system if available, otherwise use default center
    if (gpsPoints && gpsPoints.length > 0) {
      const firstPoint = gpsPoints[0];
      const lastPoint = gpsPoints[gpsPoints.length - 1];
      this.centerLat = (firstPoint.lat + lastPoint.lat) / 2;
      this.centerLon = (firstPoint.lon + lastPoint.lon) / 2;
    } else {
      // Default center coordinates (can be adjusted based on your area)
      this.centerLat = 13.612565; // Default to AU area
      this.centerLon = 100.836516;
    }
    this.scale = 100000;
    
    // Movement state
    this.isRealTimeMode = true;
    this.lastKnownPosition = null;
    this.lastStaleWarning = 0;
    this.lastConnectionLoss = null;
    
    // Start real-time GPS tracking
    this.startRealTimeTracking();
  }

  // Helper method to calculate position using same logic as GPS dots
  calculatePosition(lat, lon) {
    return {
      x: (lat - this.centerLat) * this.scale,
      y: this.baseHeight,
      z: (lon - this.centerLon) * this.scale
    };
  }

  async startRealTimeTracking() {
    if (!this.isRealTimeMode) return;
    
    console.log('🚊 Starting real-time GPS tracking with WebSocket...');
    
    // WebSocket event-driven approach
    this.setupWebSocketTracking();
  }
  
  setupWebSocketTracking() {
    console.log('🔌 Setting up WebSocket event-driven tracking...');
    
    // Subscribe to GPS updates
    this.unsubscribeGPS = this.webSocketGPS.onGPSUpdate((gpsData) => {
      this.handleGPSUpdate(gpsData);
    });
    
    // Subscribe to connection changes
    this.unsubscribeConnection = this.webSocketGPS.onConnectionChange((connected) => {
      console.log('🔌 WebSocket connection status:', connected ? 'Connected' : 'Disconnected');
      
      if (!connected) {
        console.log('⚠️ WebSocket disconnected, using simulation data...');
        this.handleConnectionLoss();
      } else {
        console.log('✅ WebSocket reconnected, resuming real-time tracking');
        this.handleConnectionRestored();
      }
    });
    
    // Subscribe to errors
    this.unsubscribeError = this.webSocketGPS.onError((error) => {
      console.warn('❌ WebSocket GPS error:', error);
    });
    
    // Request initial GPS data
    this.webSocketGPS.requestGPSData();
  }
  


  handleGPSUpdate(gpsData) {
    try {
      if (gpsData.current) {
        this.processGPSData(gpsData);
      } else {
        console.warn('⚠️ No current GPS data in WebSocket update');
        this.stopTramMovement();
      }
    } catch (error) {
      console.error('❌ Failed to handle GPS update:', error);
      this.stopTramMovement();
    }
  }
  
  async updateFromWebSocket() {
    try {
      const gpsData = await this.webSocketGPS.getBothGPSPoints();
      this.processGPSData(gpsData);
    } catch (error) {
      console.error('❌ Failed to update from WebSocket service:', error);
      this.stopTramMovement();
    }
  }
  
  processGPSData(gpsData) {
    if (gpsData.current) {
      // Check if GPS data is stale
      const isStale = this.webSocketGPS.isGPSDataStale ? 
        this.webSocketGPS.isGPSDataStale(gpsData.current.timestamp) : false;
      
      if (isStale) {
        // Only log staleness once to avoid spam
        if (!this.lastStaleWarning || Date.now() - this.lastStaleWarning > 30000) {
          console.warn('⏰ GPS data is stale - keeping tram stationary');
          this.lastStaleWarning = Date.now();
        }
        this.stopTramMovement();
        return;
      }
      
      // First time loading - position tram immediately at current GPS
      if (!this.currentGPS) {
        console.log('🎯 Initial tram positioning from GPS:', gpsData.source || 'unknown');
        this.currentGPS = gpsData.current;
        this.previousGPS = gpsData.previous || gpsData.current;
        
        // Position tram immediately at current GPS location
        this.positionTramImmediately(this.currentGPS.lat, this.currentGPS.lon);
        
        this.lastUpdateTime = Date.now();
        return;
      }
      
      // For subsequent updates, check if GPS coordinates have actually changed
      const hasChanged = this.webSocketGPS.hasGPSChanged ? 
        this.webSocketGPS.hasGPSChanged(gpsData.current, this.currentGPS) : true;
      
      if (!hasChanged) {
        // Don't log unchanged coordinates to reduce noise
        this.stopTramMovement();
        return;
      }
      
      // GPS has changed - update tram position with smooth movement
      this.previousGPS = { ...this.currentGPS };
      this.currentGPS = gpsData.current;
      
      // Update tram position with smooth movement
      this.updateTramPosition();
      
      this.lastUpdateTime = Date.now();
      
      // Only log movement in development
      if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        console.log('📍 Tram moving to:', {
          lat: this.currentGPS.lat.toFixed(6), 
          lon: this.currentGPS.lon.toFixed(6),
          source: gpsData.source || 'unknown'
        });
      }
    } else {
      console.warn('⚠️ No current GPS data - keeping tram stationary');
      this.stopTramMovement();
    }
  }



  // Position tram immediately at GPS coordinates (for initial loading)
  positionTramImmediately(lat, lon) {
    if (!this.tram) return;
    
    const position = this.calculatePosition(lat, lon);
    
    // Set position directly without animation
    this.tram.position.set(position.x, position.y, position.z);
    
    // Store last known position for fallback
    this.lastKnownPosition = position;
    
    console.log('📍 Tram positioned immediately at:', {
      lat: lat.toFixed(6),
      lon: lon.toFixed(6),
      x: position.x.toFixed(2),
      z: position.z.toFixed(2)
    });
  }

  updateTramPosition() {
    if (!this.tram || !this.currentGPS || !this.previousGPS) return;
    
    const currentPosition = this.calculatePosition(this.currentGPS.lat, this.currentGPS.lon);
    const previousPosition = this.calculatePosition(this.previousGPS.lat, this.previousGPS.lon);
    
    // Store last known position for fallback
    this.lastKnownPosition = currentPosition;
    
    // Calculate movement direction and distance
    const dx = currentPosition.x - previousPosition.x;
    const dz = currentPosition.z - previousPosition.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    // Skip if distance is too small
    if (distance < 0.5) {
      return;
    }
    
    // Stop current movement
    if (this.currentTween) {
      this.currentTween.kill();
    }
    
    // Calculate duration based on speed and distance (inspired by your smooth version)
    const duration = Math.max(1.0, distance / this.tramSpeed);
    
    // Calculate rotation to face movement direction
    const modelForwardOffset = -Math.PI / 2; // Adjust based on your model
    const targetRotation = Math.atan2(dx, dz) + modelForwardOffset;
    
    // Create timeline for movement (inspired by your smooth version)
    const tl = gsap.timeline();
    
    // Handle rotation first - make sure tram faces direction before moving
    const currentRotation = this.tram.rotation.y;
    let rotationDiff = targetRotation - currentRotation;
    
    // Handle rotation wrapping
    if (rotationDiff > Math.PI) rotationDiff -= 2 * Math.PI;
    if (rotationDiff < -Math.PI) rotationDiff += 2 * Math.PI;
    
    // Always rotate first if needed
    if (Math.abs(rotationDiff) > 0.05) {
      const rotationDuration = Math.min(1.0, Math.abs(rotationDiff) / this.rotationSpeed);
      tl.to(this.tram.rotation, {
        duration: rotationDuration,
        y: currentRotation + rotationDiff,
        ease: 'power2.inOut'
      });
    }
    
    // Move to target after rotation
    tl.to(this.tram.position, {
      duration: duration,
      x: currentPosition.x,
      y: currentPosition.y,
      z: currentPosition.z,
      ease: 'none', // Linear movement for consistent speed
      onComplete: () => {
        this.isMoving = false; // Mark as stationary when reached
      }
    });
    
    this.currentTween = tl;
    this.isMoving = true;
  }
  
  stopTramMovement() {
    // Stop any ongoing movement animations
    if (this.currentTween) {
      this.currentTween.kill();
      this.currentTween = null;
    }
    
    // Mark tram as not moving
    this.isMoving = false;
    
    // Movement stopped
  }

  calculateAndApplyMovement() {
    // This method is now handled by updateTramPosition()
    // Keeping for legacy compatibility
    this.updateTramPosition();
  }

  handleConnectionLoss() {
    console.warn('⚠️ WebSocket connection lost, maintaining last known position...');
    
    // Stop current movement but maintain position
    this.stopTramMovement();
    
    // Update connection status for UI
    this.lastConnectionLoss = Date.now();
  }

  handleConnectionRestored() {
    console.log('✅ WebSocket connection restored, requesting fresh GPS data...');
    
    // Request fresh GPS data
    if (this.webSocketGPS && this.webSocketGPS.isConnectionHealthy()) {
      this.webSocketGPS.requestGPSData();
    }
    
    this.lastConnectionLoss = null;
  }

  handleConnectionError() {
    console.warn('⚠️ WebSocket GPS unavailable, checking fallback options...');
    
    // Use last known position if available
    if (this.lastKnownPosition && this.tram) {
      console.log('📍 Using last known position for tram');
      return;
    }
    
    // If no GPS data at all, initialize with fallback GPS points
    if (!this.currentGPS && this.fallbackGPSPoints && this.fallbackGPSPoints.length > 0) {
      // Using fallback GPS data
      const firstPoint = this.fallbackGPSPoints[0];
      this.currentGPS = {
        lat: firstPoint.lat,
        lon: firstPoint.lon,
        timestamp: Date.now()
      };
      
      if (this.fallbackGPSPoints.length > 1) {
        const secondPoint = this.fallbackGPSPoints[1];
        this.previousGPS = {
          lat: secondPoint.lat,
          lon: secondPoint.lon,
          timestamp: Date.now() - 5000
        };
      }
      
      // Position tram at the first point
      this.updateTramPosition();
    }
    
    // Fallback to static GPS points if needed
    if (this.fallbackGPSPoints && this.fallbackGPSPoints.length > 0) {
      // Fallback mode available
    }
  }

  switchToFallbackMode() {
    this.isRealTimeMode = false;
    
    // Position tram at first fallback point
    if (this.fallbackGPSPoints && this.fallbackGPSPoints.length > 0) {
      const firstPoint = this.fallbackGPSPoints[0];
      const position = this.calculatePosition(firstPoint.lat, firstPoint.lon);
      
      if (this.tram) {
        gsap.to(this.tram.position, {
          duration: 2.0,
          x: position.x,
          y: position.y,
          z: position.z,
          ease: 'power2.out'
        });
      }
    }
  }

  // Legacy compatibility methods
  start() {
    console.log('🚊 Tram movement start requested - enabling real-time mode');
    
    if (!this.isRealTimeMode) {
      this.isRealTimeMode = true;
      this.startRealTimeTracking();
    }
  }

  stop() {
    console.log('🚊 Tram movement stop requested');
    this.isMoving = false;
    
    if (this.currentTween) {
      this.currentTween.kill();
      this.currentTween = null;
    }
    
    // Unsubscribe from WebSocket events
    if (this.unsubscribeGPS) {
      this.unsubscribeGPS();
      this.unsubscribeGPS = null;
    }
    
    if (this.unsubscribeConnection) {
      this.unsubscribeConnection();
      this.unsubscribeConnection = null;
    }
    
    if (this.unsubscribeError) {
      this.unsubscribeError();
      this.unsubscribeError = null;
    }
    
    this.isRealTimeMode = false;
  }

  // Method to update tram position from live GPS (legacy compatibility)
  updateFromLiveGPS(lat, lon) {
    if (!this.tram) return;
    
    // Create synthetic GPS data for smooth movement
    const newGPS = { 
      lat, 
      lon, 
      timestamp: new Date().toISOString() 
    };
    
    // Store current as previous for smooth movement
    if (this.currentGPS) {
      this.previousGPS = { ...this.currentGPS };
    } else {
      this.previousGPS = newGPS; // First time
    }
    
    this.currentGPS = newGPS;
    
    // Use the smooth movement system
    this.updateTramPosition();
    
    // Only log in development
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      console.log('📍 GPS updated via legacy method:', { lat, lon });
    }
  }

  // Method to set tram speed dynamically
  setSpeed(speed) {
    this.tramSpeed = Math.max(1, speed); // Minimum speed of 1
  }

  // Get current progress information
  getProgress() {
    const connectionStatus = this.webSocketGPS ? this.webSocketGPS.getConnectionStatus() : null;
    
    return {
      currentIndex: 0, // Not applicable in real-time mode
      totalPoints: this.fallbackGPSPoints ? this.fallbackGPSPoints.length : 0,
      isMoving: this.isRealTimeMode,
      progress: 100, // Always "complete" in real-time mode
      realTimeMode: this.isRealTimeMode,
      currentGPS: this.currentGPS,
      previousGPS: this.previousGPS,
      lastUpdateTime: this.lastUpdateTime,
      webSocketStatus: connectionStatus,
      connectionState: this.webSocketGPS ? this.webSocketGPS.getConnectionState() : 'not_initialized',
      isConnectionHealthy: this.webSocketGPS ? this.webSocketGPS.isConnectionHealthy() : false,
      lastConnectionLoss: this.lastConnectionLoss
    };
  }

  // Get WebSocket GPS service status
  getWebSocketStatus() {
    if (!this.webSocketGPS) {
      return {
        isConnected: false,
        hasCurrentGPS: false,
        hasPreviousGPS: false,
        connectionType: 'not_initialized',
        error: 'WebSocket service not initialized'
      };
    }
    
    try {
      return this.webSocketGPS.getConnectionStatus();
    } catch (error) {
      console.error('❌ Error getting WebSocket status:', error);
      return {
        isConnected: false,
        hasCurrentGPS: false,
        hasPreviousGPS: false,
        connectionType: 'error',
        error: error.message
      };
    }
  }

  // Configure WebSocket connection
  configureWebSocket(config) {
    if (this.webSocketGPS) {
      this.webSocketGPS.disconnect();
    }
    this.webSocketGPS = new WebSocketGPSService(config);
    if (this.isRealTimeMode) {
      this.startRealTimeTracking();
    }
  }

  // Cleanup
  dispose() {
    this.stop();
    
    if (this.webSocketGPS) {
      this.webSocketGPS.disconnect();
    }
    
    console.log('🚊 TramMovement disposed');
  }
}

export default TramMovement;