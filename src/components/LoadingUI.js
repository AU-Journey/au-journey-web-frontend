// LoadingUI.js
class LoadingUI {
  /**
   * @param {Object} options
   * @param {boolean} [options.showNetwork=true]  Show network type hint (if supported)
   * @param {boolean} [options.useBackdrop=true]  Blurred backdrop overlay
   */
  constructor(options = {}) {
    const { showNetwork = true, useBackdrop = true } = options;

    // ---- Root overlay
    this.el = document.createElement('div');
    this.el.id = 'loading-ui-overlay';
    Object.assign(this.el.style, {
      position: 'fixed',
      inset: '0',
      width: '100vw',
      height: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: useBackdrop ? 'rgba(30,32,40,0.18)' : 'transparent',
      backdropFilter: useBackdrop ? 'blur(8px)' : 'none',
      WebkitBackdropFilter: useBackdrop ? 'blur(8px)' : 'none',
      zIndex: '9999',
      transition: 'opacity 0.35s cubic-bezier(.4,0,.2,1)',
      opacity: '0',
      pointerEvents: 'all',
      touchAction: 'none'
    });

    // ---- Card
    const card = document.createElement('div');
    card.className = 'loading-ui-card';
    card.innerHTML = `
      <div class="loading-ui-spinner" aria-hidden="true"></div>
      <div class="loading-ui-percent" aria-live="polite">0%</div>
      <div class="loading-ui-progress">
        <div class="loading-ui-bar" style="width:0%"></div>
      </div>
      <div class="loading-ui-text">Loading…</div>
      <div class="loading-ui-subtext" id="loading-ui-subtext"></div>
      <div class="loading-ui-net" id="loading-ui-net" style="display:none"></div>
    `;
    this.el.appendChild(card);

    // ---- Styles (scoped-ish)
    const style = document.createElement('style');
    style.textContent = `
      :root { --ui-primary: #646cff; --ui-primary-soft: rgba(100,108,255,0.18); --ui-bg-card: rgba(255,255,255,0.18); }
      #loading-ui-overlay .loading-ui-card {
        display:flex; flex-direction:column; align-items:center; gap:.9rem;
        padding: 2rem 2rem 1.6rem; border-radius: 20px;
        background: var(--ui-bg-card);
        box-shadow: 0 8px 32px rgba(31,38,135,0.18);
        border: 1px solid rgba(255,255,255,0.12);
        max-width: 88vw; width: 360px;
        animation: loading-ui-fadein .5s cubic-bezier(.4,0,.2,1);
      }
      #loading-ui-overlay .loading-ui-spinner {
        width: 48px; height: 48px; border-radius: 50%;
        border: 4px solid var(--ui-primary-soft);
        border-top: 4px solid var(--ui-primary);
        margin-top: .2rem;
        box-shadow: 0 2px 8px rgba(100,108,255,0.08);
        animation: loading-ui-spin 1.1s cubic-bezier(.4,0,.2,1) infinite;
      }
      #loading-ui-overlay .loading-ui-progress {
        width: 100%;
        height: 10px;
        border-radius: 999px;
        background: rgba(0,0,0,0.08);
        overflow: hidden;
      }
      #loading-ui-overlay .loading-ui-bar {
        height: 100%;
        background: linear-gradient(90deg, var(--ui-primary), #8a92ff);
        border-radius: 999px;
        transition: width .25s cubic-bezier(.4,0,.2,1);
      }
      #loading-ui-overlay .loading-ui-percent {
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif;
        font-size: 1.15rem; font-weight: 700; color: #232946; letter-spacing: .02em;
        text-shadow: 0 2px 8px #fff2;
      }
      #loading-ui-overlay .loading-ui-text {
        color: #232946; font-size: 1rem; font-weight: 600; letter-spacing:.02em;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif;
        opacity: .95; text-align:center;
      }
      #loading-ui-overlay .loading-ui-subtext {
        color: #232946; font-size: .9rem; opacity: .78; text-align:center; min-height: 1.2em;
      }
      #loading-ui-overlay .loading-ui-net {
        color: #232946; font-size: .8rem; opacity: .6; margin-top:.2rem; text-align:center;
      }
      @keyframes loading-ui-spin { from {transform: rotate(0deg);} to {transform: rotate(360deg);} }
      @keyframes loading-ui-fadein { from { opacity: 0; transform: translateY(10px);} to { opacity:1; transform: translateY(0);} }
      @media (prefers-reduced-motion: reduce) {
        #loading-ui-overlay .loading-ui-spinner { animation: none; }
        #loading-ui-overlay .loading-ui-card { animation: none; }
        #loading-ui-overlay .loading-ui-bar { transition: none; }
        #loading-ui-overlay { transition: none; }
      }
    `;
    document.head.appendChild(style);

    // ---- Refs
    this.bar = card.querySelector('.loading-ui-bar');
    this.percentEl = card.querySelector('.loading-ui-percent');
    this.textEl = card.querySelector('.loading-ui-text');
    this.subtextEl = card.querySelector('#loading-ui-subtext');
    this.netEl = card.querySelector('#loading-ui-net');

    // State
    this.progress = 0;
    this.visible = false;

    // Optional network hint
    if (showNetwork && navigator.connection) {
      const { effectiveType, downlink } = navigator.connection;
      this.netEl.style.display = 'block';
      this.netEl.textContent = `Network: ${effectiveType || 'unknown'}${downlink ? ` · ~${downlink}Mbps` : ''}`;
    }
  }

  // ---- Public API

  show() {
    if (!document.body.contains(this.el)) {
      document.body.appendChild(this.el);
      // Allow initial layout before opacity transition
      requestAnimationFrame(() => { this.el.style.opacity = '1'; });
    } else {
      this.el.style.opacity = '1';
    }
    this.el.style.pointerEvents = 'all';
    this.visible = true;
  }

  hide() {
    this.el.style.opacity = '0';
    this.el.style.pointerEvents = 'none';
    this.visible = false;
    // Defer removal slightly to allow final paint
    setTimeout(() => {
      if (document.body.contains(this.el)) document.body.removeChild(this.el);
    }, 350);
  }

  /**
   * Set 0-100 progress (number or string)
   * @param {number} value
   */
  setProgress(value) {
    const v = Math.max(0, Math.min(100, Number(value) || 0));
    this.progress = v;
    if (this.bar) this.bar.style.width = `${v}%`;
    if (this.percentEl) this.percentEl.textContent = `${Math.round(v)}%`;
  }

  /**
   * Primary status text (e.g., “Loading map…”, “Optimizing textures…”)
   * @param {string} msg
   */
  setMessage(msg) {
    if (this.textEl) this.textEl.textContent = msg || 'Loading…';
  }

  /**
   * Secondary line (e.g., asset name / counts)
   * @param {string} msg
   */
  setSubMessage(msg) {
    if (this.subtextEl) this.subtextEl.textContent = msg || '';
  }

  /**
   * Convenient wiring for THREE.LoadingManager
   * @param {THREE.LoadingManager} loadingManager
   * @param {Object} [opts]
   * @param {string} [opts.label] Optional label to prefix
   */
  connectLoadingManager(loadingManager, opts = {}) {
    if (!loadingManager) return;
    const label = opts.label ? `${opts.label} ` : '';

    loadingManager.onStart = (url, loaded, total) => {
      this.setMessage(`${label}Preparing assets…`);
      this.setSubMessage('');
      this.setProgress(0);
      this.show();
    };

    loadingManager.onProgress = (url, loaded, total) => {
      const pct = total ? (loaded / total) * 100 : this.progress;
      this.setProgress(pct);
      const file = url?.split('/').pop() || 'asset';
      this.setSubMessage(`${loaded}/${total} • ${file}`);
      if (pct < 25) this.setMessage(`${label}Loading assets…`);
      else if (pct < 65) this.setMessage(`${label}Optimizing…`);
      else this.setMessage(`${label}Finalizing…`);
    };

    loadingManager.onLoad = () => {
      this.setProgress(100);
      this.setMessage('Ready');
      this.setSubMessage('');
      // Let it sit briefly; main scene may still be settling
      setTimeout(() => this.hide(), 250);
    };

    loadingManager.onError = (url) => {
      this.setMessage('Some assets failed to load');
      this.setSubMessage(url || 'unknown asset');
      // keep visible; caller decides when to hide
    };
  }
}

export default LoadingUI;
