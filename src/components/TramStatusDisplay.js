class TramStatusDisplay {
  constructor() {
    this.container = null;
    this.statusElement = null;
    this.stopsElement = null;
    this.locationElement = null;
    this.isVisible = false;
    
    this.createUI();
  }
  
  createUI() {
    // Create main container
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 15px;
      border-radius: 10px;
      font-family: 'Arial', sans-serif;
      font-size: 14px;
      min-width: 300px;
      max-width: 400px;
      z-index: 1000;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
    `;
    
    // Create title
    const title = document.createElement('h3');
    title.textContent = '🚊 Tram Status';
    title.style.cssText = `
      margin: 0 0 10px 0;
      font-size: 16px;
      color: #ffd700;
    `;
    this.container.appendChild(title);
    
    // Create status section
    this.statusElement = document.createElement('div');
    this.statusElement.style.cssText = `
      margin-bottom: 10px;
      padding: 8px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 5px;
    `;
    this.container.appendChild(this.statusElement);
    
    // Create stops section
    const stopsTitle = document.createElement('div');
    stopsTitle.textContent = '📍 Tram Stops:';
    stopsTitle.style.cssText = `
      font-weight: bold;
      margin-bottom: 5px;
      color: #ffd700;
    `;
    this.container.appendChild(stopsTitle);
    
    this.stopsElement = document.createElement('div');
    this.stopsElement.style.cssText = `
      margin-bottom: 10px;
      font-size: 12px;
    `;
    this.container.appendChild(this.stopsElement);
    
    // Create location section
    this.locationElement = document.createElement('div');
    this.locationElement.style.cssText = `
      font-size: 11px;
      color: #cccccc;
      border-top: 1px solid rgba(255, 255, 255, 0.2);
      padding-top: 8px;
    `;
    this.container.appendChild(this.locationElement);
    
    // Create toggle button
    const toggleButton = document.createElement('button');
    toggleButton.textContent = '📍';
    toggleButton.style.cssText = `
      position: fixed;
      top: 20px;
      right: 430px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 5px;
      padding: 8px 12px;
      cursor: pointer;
      font-size: 16px;
      z-index: 1001;
    `;
    
    toggleButton.addEventListener('click', () => {
      this.toggle();
    });
    
    document.body.appendChild(toggleButton);
    
    // Initially hide the display
    this.container.style.display = 'none';
    document.body.appendChild(this.container);
  }
  
  updateStatus(statusData) {
    if (!statusData) return;
    
    // Update main status
    this.statusElement.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 5px;">
        Status: <span style="color: #4CAF50;">${statusData.currentStatus || 'Unknown'}</span>
      </div>
      <div style="margin-bottom: 3px;">
        ${statusData.is_moving ? '🚊 Moving' : '⏸️ Not moving'}
      </div>
      <div style="font-size: 12px; color: #cccccc;">
        Speed: ${statusData.speed_kmh || 0} km/h
      </div>
    `;
    
    // Update stops information
    if (statusData.stops_available) {
      let stopsHTML = '';
      statusData.stops_available.forEach((stop, index) => {
        let statusIcon = '⚪'; // Default
        let statusColor = '#666';
        
        if (statusData.current_stop === stop.name) {
          statusIcon = '🔵'; // Current stop
          statusColor = '#4CAF50';
        }
        
        stopsHTML += `
          <div style="margin: 2px 0; color: ${statusColor};">
            ${statusIcon} ${stop.name}
          </div>
        `;
      });
      this.stopsElement.innerHTML = stopsHTML;
    }
    
    // Update location information
    if (statusData.location) {
      this.locationElement.innerHTML = `
        <div>📍 Location: ${statusData.location.lat?.toFixed(6) || 'N/A'}, ${statusData.location.lng?.toFixed(6) || 'N/A'}</div>
        <div>🕒 Updated: ${new Date(statusData.timestamp || Date.now()).toLocaleTimeString()}</div>
        <div style="margin-top: 5px; font-size: 10px;">
          💡 Click map to get coordinates for new stops
        </div>
      `;
    }
  }
  
  show() {
    this.container.style.display = 'block';
    this.isVisible = true;
  }
  
  hide() {
    this.container.style.display = 'none';
    this.isVisible = false;
  }
  
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }
  
  // Method to highlight a specific stop
  highlightStop(stopName) {
    const stopElements = this.stopsElement.querySelectorAll('div');
    stopElements.forEach(element => {
      if (element.textContent.includes(stopName)) {
        element.style.backgroundColor = 'rgba(255, 193, 7, 0.3)';
        setTimeout(() => {
          element.style.backgroundColor = 'transparent';
        }, 2000);
      }
    });
  }
}

export default TramStatusDisplay; 