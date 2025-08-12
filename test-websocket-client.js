// Simple WebSocket client test for frontend
import WebSocketGPSService from './src/services/WebSocketGPSService.js';

console.log('🧪 Testing Frontend WebSocket GPS Service...');

// Create WebSocket GPS service
const gpsService = new WebSocketGPSService({
  serverUrl: 'ws://localhost:3000'
});

// Subscribe to GPS updates
const unsubscribeGPS = gpsService.onGPSUpdate((gpsData) => {
  console.log('📍 GPS Update received:', {
    lat: gpsData.current?.lat,
    lon: gpsData.current?.lon,
    source: gpsData.source,
    timestamp: new Date(gpsData.timestamp).toLocaleTimeString()
  });
});

// Subscribe to connection changes
const unsubscribeConnection = gpsService.onConnectionChange((connected) => {
  console.log('🔌 Connection status:', connected ? 'Connected' : 'Disconnected');
});

// Subscribe to errors
const unsubscribeError = gpsService.onError((error) => {
  console.log('❌ Error:', error);
});

// Test the getBothGPSPoints method
setTimeout(async () => {
  console.log('📍 Testing getBothGPSPoints...');
  try {
    const gpsData = await gpsService.getBothGPSPoints();
    console.log('GPS Data:', gpsData);
  } catch (error) {
    console.error('Error getting GPS data:', error);
  }
}, 3000);

// Test ping
setTimeout(() => {
  console.log('🏓 Testing ping...');
  gpsService.ping();
}, 5000);

// Cleanup after 10 seconds
setTimeout(() => {
  console.log('🧹 Cleaning up...');
  unsubscribeGPS();
  unsubscribeConnection();
  unsubscribeError();
  gpsService.disconnect();
  console.log('✅ Test completed');
}, 10000); 