import * as THREE from 'three';

class WeatherSystem {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    
    // Weather state
    this.currentWeather = null;
    
    // Weather API settings
    this.weatherUpdateInterval = 600000; // Update weather every 10 minutes
    this.lastWeatherUpdate = 0;
    
    // Bangkok coordinates (AU location) 33.52791096080619, -7.7703647327435705
    this.lat = 13.612;
    this.lon = 100.836;
    
    // Initialize weather
    this.initWeather();
  }
  
  async initWeather() {
    // Try to get weather from API, fallback to default if fails
    try {
      await this.fetchWeatherData();
    } catch (error) {
      console.warn('Weather API failed, using default weather:', error);
      this.setDefaultWeather();
    }
  }
  
  setDefaultWeather() {
    // Default to partly cloudy
    this.currentWeather = {
      main: 'Clouds',
      description: 'few clouds',
      clouds: 25,
      temp: 30
    };
    this.applyWeatherEffects();
  }
  
  async fetchWeatherData() {
    // Use a free weather API that doesn't require API key
    // Using wttr.in API which is free and doesn't require authentication
    try {
      const response = await fetch(`https://wttr.in/${this.lat},${this.lon}?format=j1`);
      if (!response.ok) throw new Error('Weather fetch failed');
      
      const data = await response.json();
      const current = data.current_condition[0];
      
      // Map wttr.in data to our format
      this.currentWeather = {
        main: this.mapWeatherCode(current.weatherCode),
        description: current.weatherDesc[0].value,
        clouds: parseInt(current.cloudcover) || 0,
        temp: parseInt(current.temp_C) || 25
      };
      
      this.applyWeatherEffects();
    } catch (error) {
      console.error('Weather API error:', error);
      this.setDefaultWeather();
    }
  }
  
  mapWeatherCode(code) {
    // Map wttr.in weather codes to simple categories
    const codeNum = parseInt(code);
    if (codeNum === 113) return 'Clear';
    if (codeNum >= 116 && codeNum <= 119) return 'Clouds';
    if (codeNum >= 176 && codeNum <= 377) return 'Rain';
    if (codeNum >= 200 && codeNum <= 232) return 'Thunderstorm';
    if (codeNum >= 248 && codeNum <= 260) return 'Fog';
    return 'Clouds';
  }
  
  applyWeatherEffects() {
    if (!this.currentWeather) return;
    
    // Only update sky color and lighting
    this.updateSkyColor();
    this.updateLighting();
  }
  
  updateSkyColor() {
    const weather = this.currentWeather.main;
    const cloudCoverage = this.currentWeather.clouds || 0;
    let skyColor;
    
    switch(weather) {
      case 'Clear':
        // Beautiful blue sky for sunny weather
        skyColor = 0x87CEEB;
        break;
      case 'Clouds':
        // Adjust sky color based on cloud coverage
        if (cloudCoverage < 30) {
          skyColor = 0xADD8E6; // Light blue for few clouds
        } else if (cloudCoverage < 60) {
          skyColor = 0xB0C4DE; // Light steel blue for moderate clouds
        } else {
          skyColor = 0x9CA9B3; // Grayish blue for heavy clouds
        }
        break;
      case 'Rain':
        skyColor = 0x708090; // Slate gray
        break;
      case 'Thunderstorm':
        skyColor = 0x4A5568; // Dark slate gray
        break;
      case 'Fog':
        skyColor = 0xC0C0C0; // Silver
        break;
      default:
        skyColor = 0xbfd1e5; // Default
    }
    
    // Smoothly transition to new color
    this.renderer.setClearColor(skyColor);
  }
  
  updateLighting() {
    // Find directional light and ambient light
    const directionalLight = this.scene.children.find(child => child.isDirectionalLight);
    const ambientLight = this.scene.children.find(child => child.isAmbientLight);
    
    if (!directionalLight || !ambientLight) return;
    
    const weather = this.currentWeather.main;
    const cloudCoverage = this.currentWeather.clouds || 0;
    
    // Subtle lighting adjustments based on weather
    switch(weather) {
      case 'Clear':
        // Bright and sunny
        directionalLight.intensity = 0.8;
        ambientLight.intensity = 0.6;
        break;
      case 'Clouds':
        // Adjust based on cloud coverage
        directionalLight.intensity = 0.8 - (cloudCoverage / 150); // Max reduction of ~0.53
        ambientLight.intensity = 0.6 + (cloudCoverage / 300); // Slight increase in ambient
        break;
      case 'Rain':
        // Darker, more ambient light
        directionalLight.intensity = 0.4;
        ambientLight.intensity = 0.7;
        break;
      case 'Thunderstorm':
        // Very dark
        directionalLight.intensity = 0.3;
        ambientLight.intensity = 0.7;
        break;
      case 'Fog':
        // Diffused light
        directionalLight.intensity = 0.5;
        ambientLight.intensity = 0.75;
        break;
    }
  }
  
  // Update weather periodically
  update(time) {
    // Periodically update weather
    if (time - this.lastWeatherUpdate > this.weatherUpdateInterval) {
      this.lastWeatherUpdate = time;
      this.fetchWeatherData();
    }
  }
  
  // Get current weather info for display
  getWeatherInfo() {
    if (!this.currentWeather) return null;
    
    return {
      description: this.currentWeather.description,
      temp: this.currentWeather.temp,
      clouds: this.currentWeather.clouds
    };
  }
}

export default WeatherSystem; 