// WebSocket-based GPS Service
// Replaces HTTP polling with real-time WebSocket connection

import { io } from 'socket.io-client';

class WebSocketGPSService {
  constructor(config = {}) {
    // WebSocket configuration
    this.config = {
      serverUrl: config.serverUrl || this.getDefaultServerUrl(),
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 5000,
      ...config
    };
    
    this.socket = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 5;
    
    // GPS data cache
    this.currentGPS = null;
    this.previousGPS = null;
    
    // Event callbacks
    this.onGPSUpdateCallbacks = [];
    this.onConnectionChangeCallbacks = [];
    this.onErrorCallbacks = [];
    
    // Fallback simulation data
    this.initializeSimulationData();
    
    console.log('🔌 WebSocket GPS Service: Initializing...');
    console.log('🌐 Server URL:', this.config.serverUrl);
    
    // Initialize connection
    this.connect();
  }
  
  getDefaultServerUrl() {
    // Detect environment and use appropriate server URL
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      
      if (hostname === 'localhost') {
        return 'ws://localhost:3000';
      } else {
        // Production: Use environment variable first
        const backendUrl = import.meta.env.VITE_BACKEND_URL;
        if (backendUrl) {
          return backendUrl.replace('https://', 'wss://').replace('http://', 'ws://');
        }
        
        // DigitalOcean App Platform URLs
        // Using your actual backend URL
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//au-journey-web-backend-gk6n3.ondigitalocean.app`;
      }
    }
    return 'ws://localhost:3000';
  }
  
  connect() {
    if (this.socket) {
      this.socket.disconnect();
    }
    
    console.log('🔌 Attempting WebSocket connection to:', this.config.serverUrl);
    
    this.socket = io(this.config.serverUrl, {
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      autoConnect: true,
      reconnection: this.config.reconnection,
      reconnectionAttempts: this.config.reconnectionAttempts,
      reconnectionDelay: this.config.reconnectionDelay,
      timeout: this.config.timeout
    });
    
    this.setupEventHandlers();
  }
  
  setupEventHandlers() {
    // Connection events
    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected:', this.socket.id);
      this.isConnected = true;
      this.connectionAttempts = 0;
      this.notifyConnectionChange(true);
      
      // Request initial GPS data
      this.requestGPSData();
    });
    
    this.socket.on('disconnect', (reason) => {
      console.log('🔌 WebSocket disconnected:', reason);
      this.isConnected = false;
      this.notifyConnectionChange(false);
      
      if (reason === 'io server disconnect') {
        // Server initiated disconnect - try to reconnect
        setTimeout(() => this.connect(), 1000);
      }
    });
    
    this.socket.on('connect_error', (error) => {
      console.warn('❌ WebSocket connection error:', error.message);
      this.connectionAttempts++;
      
      if (this.connectionAttempts >= this.maxConnectionAttempts) {
        console.warn('⚠️ Max connection attempts reached, falling back to simulation');
        this.notifyError('Connection failed, using simulation data');
      }
    });
    
    // GPS data events
    this.socket.on('welcome', (data) => {
      console.log('👋 Server welcome:', data.message);
    });
    
    this.socket.on('gps-data', (data) => {
      console.log('📍 GPS data received via request:', data);
      this.processGPSData(data, 'websocket-request');
    });
    
    this.socket.on('gps-data-update', (data) => {
      console.log('📡 GPS data broadcast received:', data);
      this.processGPSData(data, 'websocket-broadcast');
    });
    
    this.socket.on('gps-error', (error) => {
      console.warn('❌ GPS data error:', error);
      this.notifyError(error.message || 'GPS data error');
    });
    
    // Utility events
    this.socket.on('pong', (data) => {
      console.log('🏓 Pong received, latency:', Date.now() - data.timestamp, 'ms');
    });
  }
  
  processGPSData(gpsData, source) {
    if (!this.isValidGPSData(gpsData.c) || !this.isValidGPSData(gpsData.p)) {
      console.warn('⚠️ Invalid GPS data received:', gpsData);
      return;
    }
    
    // Store previous GPS
    this.previousGPS = this.currentGPS ? { ...this.currentGPS } : null;
    
    // Parse and store current GPS
    this.currentGPS = {
      lat: parseFloat(gpsData.c.lat),
      lon: parseFloat(gpsData.c.lon),
      timestamp: gpsData.c.t || new Date().toISOString()
    };
    
    // Update previous GPS if provided
    if (gpsData.p) {
      this.previousGPS = {
        lat: parseFloat(gpsData.p.lat),
        lon: parseFloat(gpsData.p.lon),
        timestamp: gpsData.p.t || new Date(Date.now() - 5000).toISOString()
      };
    }
    
    // Notify callbacks
    this.notifyGPSUpdate({
      current: this.currentGPS,
      previous: this.previousGPS,
      status: gpsData.s || 'active',
      source: source,
      timestamp: Date.now()
    });
  }
  
  requestGPSData() {
    if (this.isConnected && this.socket) {
      this.socket.emit('request-gps-data');
    } else {
      console.warn('⚠️ Cannot request GPS data - not connected');
    }
  }
  
  // Public API methods (maintain compatibility with existing code)
  async getBothGPSPoints() {
    if (this.isConnected && this.currentGPS) {
      return {
        current: this.currentGPS,
        previous: this.previousGPS,
        fromCache: false,
        timestamp: Date.now(),
        status: 'active',
        source: 'websocket'
      };
    } else {
      // Fallback to simulation
      return this.getSimulationData();
    }
  }
  
  hasGPSChanged(newGPS, oldGPS) {
    if (!oldGPS || !newGPS) return true;
    
    const latDiff = Math.abs(newGPS.lat - oldGPS.lat);
    const lonDiff = Math.abs(newGPS.lon - oldGPS.lon);
    const threshold = 0.000001; // Very small change threshold
    
    return latDiff > threshold || lonDiff > threshold;
  }
  
  isGPSDataStale(timestamp, staleThresholdMs = 60000) {
    if (!timestamp) return true;
    
    const dataTime = new Date(timestamp).getTime();
    const now = Date.now();
    
    return (now - dataTime) > staleThresholdMs;
  }
  
  // Event subscription methods
  onGPSUpdate(callback) {
    this.onGPSUpdateCallbacks.push(callback);
    return () => {
      const index = this.onGPSUpdateCallbacks.indexOf(callback);
      if (index > -1) this.onGPSUpdateCallbacks.splice(index, 1);
    };
  }
  
  onConnectionChange(callback) {
    this.onConnectionChangeCallbacks.push(callback);
    return () => {
      const index = this.onConnectionChangeCallbacks.indexOf(callback);
      if (index > -1) this.onConnectionChangeCallbacks.splice(index, 1);
    };
  }
  
  onError(callback) {
    this.onErrorCallbacks.push(callback);
    return () => {
      const index = this.onErrorCallbacks.indexOf(callback);
      if (index > -1) this.onErrorCallbacks.splice(index, 1);
    };
  }
  
  // Notification methods
  notifyGPSUpdate(data) {
    this.onGPSUpdateCallbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Error in GPS update callback:', error);
      }
    });
  }
  
  notifyConnectionChange(connected) {
    this.onConnectionChangeCallbacks.forEach(callback => {
      try {
        callback(connected);
      } catch (error) {
        console.error('Error in connection change callback:', error);
      }
    });
  }
  
  notifyError(error) {
    this.onErrorCallbacks.forEach(callback => {
      try {
        callback(error);
      } catch (error) {
        console.error('Error in error callback:', error);
      }
    });
  }
  
  // Utility methods
  ping() {
    if (this.isConnected && this.socket) {
      this.socket.emit('ping');
    }
  }
  
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
  }
  
  // Simulation fallback (existing code)
  initializeSimulationData() {
    this.currentGPS = {
      lat: 13.612441,
      lon: 100.836478,
      timestamp: new Date().toISOString()
    };
    
    this.previousGPS = {
      lat: 13.612412,
      lon: 100.836585,
      timestamp: new Date(Date.now() - 5000).toISOString()
    };
  }
  
  getSimulationData() {
    return {
      current: this.currentGPS,
      previous: this.previousGPS,
      fromCache: false,
      timestamp: Date.now(),
      status: 'simulated',
      source: 'simulation'
    };
  }
  
  isValidGPSData(data) {
    if (!data) return false;
    
    const lat = typeof data.lat === 'number' ? data.lat : parseFloat(data.lat);
    const lon = typeof data.lon === 'number' ? data.lon : parseFloat(data.lon);
    
    return !isNaN(lat) && !isNaN(lon) &&
           lat >= -90 && lat <= 90 &&
           lon >= -180 && lon <= 180;
  }

  // Connection status and management methods
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      hasCurrentGPS: this.currentGPS !== null,
      hasPreviousGPS: this.previousGPS !== null,
      connectionAttempts: this.connectionAttempts,
      maxConnectionAttempts: this.maxConnectionAttempts,
      lastUpdateTime: this.currentGPS ? this.currentGPS.timestamp : null,
      environment: 'browser',
      connectionType: this.isConnected ? 'websocket' : 'simulation',
      serverUrl: this.config.serverUrl,
      socketId: this.socket ? this.socket.id : null
    };
  }

  // Check if connection is healthy
  isConnectionHealthy() {
    return this.isConnected && this.socket && this.socket.connected;
  }

  // Get connection state for debugging
  getConnectionState() {
    if (!this.socket) return 'not_initialized';
    if (this.socket.connected) return 'connected';
    if (this.socket.connecting) return 'connecting';
    if (this.socket.disconnected) return 'disconnected';
    return 'unknown';
  }

  // Force reconnection
  forceReconnect() {
    console.log('🔄 Forcing WebSocket reconnection...');
    if (this.socket) {
      this.socket.disconnect();
    }
    setTimeout(() => this.connect(), 1000);
  }

  // Check if GPS data is stale
  isGPSDataStale(timestamp, maxAgeMs = 60000) {
    if (!timestamp) return true;
    
    const now = new Date();
    const gpsTime = new Date(timestamp);
    const age = now - gpsTime;
    
    return age > maxAgeMs;
  }

  // Check if GPS coordinates have changed
  hasGPSChanged(current, previous) {
    if (!current || !previous) return true;
    
    const tolerance = 0.000005; // roughly 0.5 meter in GPS coordinates
    const latDiff = Math.abs(current.lat - previous.lat);
    const lonDiff = Math.abs(current.lon - previous.lon);
    
    return latDiff > tolerance || lonDiff > tolerance;
  }
}

export default WebSocketGPSService; 