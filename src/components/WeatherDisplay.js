class WeatherDisplay {
  constructor() {
    this.element = null;
    this.createDisplay();
  }
  
  createDisplay() {
    this.element = document.createElement('div');
    this.element.className = 'weather-display';
    this.element.innerHTML = `
      <div class="weather-icon">🌤️</div>
      <div class="weather-info">
        <div class="weather-desc">Loading weather...</div>
        <div class="weather-temp"></div>
      </div>
    `;
    
    document.body.appendChild(this.element);
  }
  
  update(weatherInfo) {
    if (!weatherInfo) return;
    
    const descElement = this.element.querySelector('.weather-desc');
    const tempElement = this.element.querySelector('.weather-temp');
    const iconElement = this.element.querySelector('.weather-icon');
    
    descElement.textContent = weatherInfo.description;
    if (weatherInfo.temp !== undefined) {
      tempElement.textContent = `${weatherInfo.temp}°C`;
    }
    
    // Update icon based on description
    iconElement.textContent = this.getWeatherIcon(weatherInfo.description);
  }
  
  getWeatherIcon(description) {
    const desc = description.toLowerCase();
    if (desc.includes('clear') || desc.includes('sunny')) return '☀️';
    if (desc.includes('cloud')) return '☁️';
    if (desc.includes('rain')) return '🌧️';
    if (desc.includes('storm')) return '⛈️';
    if (desc.includes('fog') || desc.includes('mist')) return '🌫️';
    if (desc.includes('snow')) return '❄️';
    return '🌤️'; // default partly cloudy
  }
  
  hide() {
    if (this.element) {
      this.element.style.display = 'none';
    }
  }
  
  show() {
    if (this.element) {
      this.element.style.display = 'flex';
    }
  }
}

export default WeatherDisplay; 