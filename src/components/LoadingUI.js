class LoadingUI {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'loading-ui-overlay';
    this.el.innerHTML = `
      <div class="loading-ui-card">
        <div class="loading-ui-spinner"></div>
        <div class="loading-ui-text">Loading...</div>
      </div>
    `;
    this.el.style.position = 'fixed';
    this.el.style.top = '0';
    this.el.style.left = '0';
    this.el.style.width = '100vw';
    this.el.style.height = '100vh';
    this.el.style.display = 'flex';
    this.el.style.justifyContent = 'center';
    this.el.style.alignItems = 'center';
    this.el.style.background = 'rgba(30, 32, 40, 0.18)';
    this.el.style.backdropFilter = 'blur(8px)';
    this.el.style.zIndex = '9999';
    this.el.style.transition = 'opacity 0.4s cubic-bezier(.4,0,.2,1)';
    this.el.style.opacity = '0';
    this.el.style.pointerEvents = 'all';
    // Spinner and card style
    const style = document.createElement('style');
    style.textContent = `
      .loading-ui-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 2.5rem 2.5rem 2rem 2.5rem;
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.18);
        box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.18);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255,255,255,0.12);
        animation: loading-ui-fadein 0.7s cubic-bezier(.4,0,.2,1);
      }
      .loading-ui-spinner {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        border: 4px solid rgba(100, 108, 255, 0.18);
        border-top: 4px solid #646cff;
        animation: loading-ui-spin 1.1s cubic-bezier(.4,0,.2,1) infinite;
        margin-bottom: 1.5rem;
        box-shadow: 0 2px 8px 0 rgba(100,108,255,0.08);
      }
      @keyframes loading-ui-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      @keyframes loading-ui-fadein {
        from { opacity: 0; transform: translateY(16px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .loading-ui-text {
        color: #232946;
        font-size: 1.25rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        font-family: 'Inter', system-ui, sans-serif;
        text-shadow: 0 2px 8px #fff2;
        margin-top: 0.2rem;
        opacity: 0.92;
      }
    `;
    document.head.appendChild(style);
  }
  show() {
    if (!document.body.contains(this.el)) {
      document.body.appendChild(this.el);
    }
    setTimeout(() => {
      this.el.style.opacity = '1';
    }, 10);
    this.el.style.pointerEvents = 'all';
  }
  hide() {
    this.el.style.opacity = '0';
    this.el.style.pointerEvents = 'none';
    setTimeout(() => {
      if (document.body.contains(this.el)) {
        document.body.removeChild(this.el);
      }
    }, 400);
  }
}

export default LoadingUI; 