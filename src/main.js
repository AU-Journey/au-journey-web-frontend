import './style.css';
import SchoolMap from './components/SchoolMap';

const container = document.createElement('div');
container.style.width = '100vw';
container.style.height = '100vh';
document.body.appendChild(container);

const schoolMap = new SchoolMap(container);

// Add global test functions
window.startTramTracking = () => {
  schoolMap.tramStatusDisplay.show();
  
  let index = 0;
  const trackingInterval = setInterval(() => {
    if (index < schoolMap.gpsPoints.length) {
      const gps = schoolMap.gpsPoints[index];
      schoolMap.updateTramPositionFromLiveGPS(gps.lat, gps.lon);
      index++;
    } else {
      index = 0; // Loop back to start
    }
  }, 2000); // Move every 2 seconds for realistic tracking
  
  // Store interval ID for stopping
  window.tramTrackingInterval = trackingInterval;
  
  return trackingInterval;
};

window.stopTramTracking = () => {
  if (window.tramTrackingInterval) {
    clearInterval(window.tramTrackingInterval);
    window.tramTrackingInterval = null;
  }
};

window.testStopDetection = () => {
  const stops = [
    { name: 'MSM Building', lat: 13.612263, lon: 100.836828 },
    { name: 'IT Building', lat: 13.613051, lon: 100.834310 },
    { name: 'AU Mall', lat: 13.613202, lon: 100.833545 },
    { name: 'Queen of Sheba', lat: 13.614444, lon: 100.831560 }
  ];
  
  let stopIndex = 0;
  const testInterval = setInterval(() => {
    if (stopIndex < stops.length) {
      const stop = stops[stopIndex];
      schoolMap.updateTramPositionFromLiveGPS(stop.lat, stop.lon);
      stopIndex++;
    } else {
      clearInterval(testInterval);
    }
  }, 3000);
};

window.updateTramPos = (lat, lon) => {
  schoolMap.updateTramPositionFromLiveGPS(lat, lon);
};

// Auto-start status display after a short delay
setTimeout(() => {
  if (schoolMap.tramStatusDisplay) {
    schoolMap.tramStatusDisplay.show();
  }
}, 3000);
