/**
 * @name RelativeTimestamps
 * @version 2.1.2
 * @description Shows customizable live timestamps beside Discord messages. Includes settings, error logging, and visual improvements. Settings panel rebuilt for full readability on all themes.
 * @author ChatGPT
 */

/**
 * Fix for newer BetterDiscord builds:
 * - BdApi.loadData/saveData may be removed; use BdApi.Data.load/save instead.
 * - This plugin supports both APIs for backwards compatibility.
 */

const PLUGIN_NAME = "RelativeTimestamps";

module.exports = class RelativeTimestamps {
  constructor() {
    // --- Runtime flags ---
    this.DEBUG = true; // set false if you want less console output

    // --- DOM markers ---
    this.injectedClass = "bd-rel-ts";
    this.markerAttr = "data-rel-ready";
    this.styleId = "bd-rel-ts-style";

    // --- Runtime handles ---
    this.timer = null;
    this.observer = null;

    // --- Settings ---
    this.defaultSettings = {
      detailed: true,
      liveUpdate: true,
      showTooltip: true
    };

    // --- BetterDiscord API (robust) ---
    this.BdApiRef = this._getBdApi();
    this.api = this._getBoundApi(this.BdApiRef, PLUGIN_NAME);

    // Load settings safely (never throw in constructor)
    this.settings = { ...this.defaultSettings };
    this._loadSettings();
  }

  /* ===========================
   *  Logging helpers
   * =========================== */
  _ts() { return new Date().toISOString(); }

  log(...args) {
    if (!this.DEBUG) return;
    console.log(`[${PLUGIN_NAME}]`, ...args);
  }

  warn(...args) {
    console.warn(`[${PLUGIN_NAME}]`, ...args);
  }

  error(...args) {
    console.error(`[${PLUGIN_NAME}]`, ...args);
  }

  toast(message, type = "info", timeout = 3000) {
    try {
      // Newer BD: api.UI.showToast
      const ui = this.api?.UI ?? this.BdApiRef?.UI;
      if (ui?.showToast) return ui.showToast(message, { type, timeout });

      // Older BD: BdApi.showToast
      const st = this.api?.showToast ?? this.BdApiRef?.showToast;
      if (typeof st === "function") return st(message, { type, timeout });
    } catch (e) {
      this.warn("Toast failed:", e);
    }
  }

  /* ===========================
   *  BetterDiscord API helpers
   * =========================== */
  _getBdApi() {
    // BetterDiscord exposes BdApi on window/globalThis
    const bd = globalThis.BdApi ?? (typeof window !== "undefined" ? window.BdApi : null);
    if (!bd) this.warn("BdApi not found. Plugin will run with limited features.");
    return bd;
  }

  _getBoundApi(BdApiRef, pluginName) {
    // Docs: you can create a bound instance via new BdApi("PluginName")
    // but in some builds BdApi might be an object instead of a constructor.
    if (!BdApiRef) return null;

    if (typeof BdApiRef === "function") {
      try {
        return new BdApiRef(pluginName);
      } catch (e) {
        this.warn("Failed to create bound BdApi instance, falling back to global BdApi:", e);
      }
    }

    return BdApiRef; // object form / legacy form
  }

  _dataLoad(pluginName, key) {
    // Prefer new API: BdApi.Data.load
    try {
      const data = this.api?.Data ?? this.BdApiRef?.Data;
      if (data?.load) {
        // Bound instances typically accept only (key); unbound accept (pluginName, key)
        try {
          return data.load(key);
        } catch {
          return data.load(pluginName, key);
        }
      }
    } catch (e) {
      this.warn("BdApi.Data.load failed:", e);
    }

    // Fallback old API: BdApi.loadData
    try {
      const ld = this.api?.loadData ?? this.BdApiRef?.loadData;
      if (typeof ld === "function") return ld(pluginName, key);
    } catch (e) {
      this.warn("BdApi.loadData failed:", e);
    }

    // Last-ditch fallback: localStorage (keeps plugin usable even if BD API changes again)
    try {
      const raw = localStorage.getItem(`${pluginName}:${key}`);
      return raw ? JSON.parse(raw) : undefined;
    } catch (e) {
      this.warn("localStorage load fallback failed:", e);
      return undefined;
    }
  }

  _dataSave(pluginName, key, value) {
    // Prefer new API: BdApi.Data.save
    try {
      const data = this.api?.Data ?? this.BdApiRef?.Data;
      if (data?.save) {
        try {
          data.save(key, value);
          return true;
        } catch {
          data.save(pluginName, key, value);
          return true;
        }
      }
    } catch (e) {
      this.warn("BdApi.Data.save failed:", e);
    }

    // Fallback old API: BdApi.saveData
    try {
      const sd = this.api?.saveData ?? this.BdApiRef?.saveData;
      if (typeof sd === "function") {
        sd(pluginName, key, value);
        return true;
      }
    } catch (e) {
      this.warn("BdApi.saveData failed:", e);
    }

    // Last-ditch fallback: localStorage
    try {
      localStorage.setItem(`${pluginName}:${key}`, JSON.stringify(value));
      return true;
    } catch (e) {
      this.warn("localStorage save fallback failed:", e);
      return false;
    }
  }

  _loadSettings() {
    try {
      const loaded = this._dataLoad(PLUGIN_NAME, "settings");
      const safeObj = (loaded && typeof loaded === "object" && !Array.isArray(loaded)) ? loaded : {};
      this.settings = Object.assign({}, this.defaultSettings, safeObj);
      this.log("Settings loaded:", this.settings);
    } catch (e) {
      this.error("Settings load failed; using defaults:", e);
      this.settings = { ...this.defaultSettings };
    }
  }

  _saveSettings() {
    try {
      const ok = this._dataSave(PLUGIN_NAME, "settings", this.settings);
      this.log("Settings saved:", ok ? "ok" : "failed", this.settings);
      return ok;
    } catch (e) {
      this.error("Settings save failed:", e);
      return false;
    }
  }

  /* ===========================
   *  BetterDiscord lifecycle
   * =========================== */
  start() {
    try {
      this.log("Starting at", this._ts());
      this.injectCSS();
      this.observe();
      this.processAll();
      if (this.settings.liveUpdate) this.startTimer();
      this.toast("RelativeTimestamps: enabled", "success", 2500);
      this.log("Plugin started successfully.");
    } catch (e) {
      this.error("Startup failed:", e);
      this.toast("RelativeTimestamps: failed to start (check console)", "error", 4000);
    }
  }

  stop() {
    try {
      this.log("Stopping at", this._ts());

      if (this.observer) this.observer.disconnect();
      this.observer = null;

      if (this.timer) clearInterval(this.timer);
      this.timer = null;

      // Remove injected spans
      document.querySelectorAll(`.${this.injectedClass}`).forEach(e => e.remove());

      // Remove marker attr so restart works without needing a full reload
      document.querySelectorAll(`time[${this.markerAttr}]`).forEach(t => t.removeAttribute(this.markerAttr));

      // Remove injected CSS
      document.getElementById(this.styleId)?.remove();

      this.toast("RelativeTimestamps: disabled", "info", 2000);
      this.log("Stopped cleanly.");
    } catch (e) {
      this.error("Error during stop:", e);
    }
  }

  /* ===========================
   *  Core logic
   * =========================== */
  injectCSS() {
    if (document.getElementById(this.styleId)) return;
    const s = document.createElement("style");
    s.id = this.styleId;
    s.textContent = `
      /* ====== Timestamp chip ====== */
      .${this.injectedClass} {
        margin-left: 6px;
        font-size: 12px;
        opacity: 0.75;
        color: var(--text-normal, #c9ccd1);
        cursor: default;
        transition: opacity 0.2s ease;
        user-select: none;
      }
      .${this.injectedClass}:hover { opacity: 1; }

      /* ====== Settings: robust, theme-aware, high-contrast ====== */
      /* Scope all rules under our panel container to avoid interference. */
      .rel-settings-root {
        display: grid;
        gap: 12px;
        padding: 12px;
        background: var(--background-secondary, rgba(0,0,0,0.3));
        border: 1px solid var(--background-tertiary, rgba(255,255,255,0.08));
        border-radius: 10px;
      }

      .rel-settings-header {
        font-weight: 700;
        font-size: 18px;
        color: var(--header-primary, var(--text-normal, #fff)) !important;
        margin: 0 0 4px 0;
      }

      /* Use BetterDiscord's setting item structure for consistent spacing/typography */
      .rel-settings-root .bd-setting-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 12px 10px;
        background: var(--background-primary, transparent);
        border: 1px solid var(--background-tertiary, rgba(255,255,255,0.08));
        border-radius: 8px;
      }

      .rel-settings-root .bd-setting-item:hover {
        background: var(--background-modifier-hover, rgba(255,255,255,0.03));
      }

      .rel-setting-texts {
        min-width: 0;
      }

      .rel-setting-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-normal, #e3e5e8) !important;
        line-height: 1.35;
        margin: 0 0 2px 0;
      }

      .rel-setting-note {
        font-size: 12px;
        color: var(--text-muted, #9ca3af) !important;
        line-height: 1.35;
        margin: 0;
      }

      /* Accessible checkbox with theme accent */
      .rel-switch {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .rel-switch input[type="checkbox"] {
        accent-color: var(--brand-500, #5865f2);
        width: 20px;
        height: 20px;
        cursor: pointer;
      }

      .rel-divider {
        height: 1px;
        background: var(--background-tertiary, rgba(255,255,255,0.08));
        margin: 6px 0;
      }

      .rel-row-end {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }

      .rel-btn {
        appearance: none;
        border: 1px solid var(--background-tertiary, rgba(255,255,255,0.12));
        background: var(--background-floating, #2b2d31);
        color: var(--text-normal, #fff);
        padding: 8px 10px;
        border-radius: 8px;
        font-size: 14px;
        cursor: pointer;
      }
      .rel-btn:hover {
        background: var(--background-modifier-hover, rgba(255,255,255,0.06));
      }
      .rel-btn.brand {
        border-color: transparent;
        background: var(--brand-500, #5865f2);
        color: #fff;
      }
      .rel-btn.brand:hover {
        filter: brightness(1.05);
      }

      /* Hard fallbacks for extreme custom themes */
      .theme-dark .rel-settings-root,
      body.theme-dark .rel-settings-root { color: #fff !important; }
      .theme-light .rel-settings-root,
      body.theme-light .rel-settings-root { color: #000 !important; }

      /* Maintain readability even if a theme lowers opacity on text */
      .rel-settings-root * { opacity: 1 !important; }
    `;
    document.head.appendChild(s);
    this.log("CSS injected.");
  }

  startTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.refreshAll(), 1000);
    this.log("Timer started (1s).");
  }

  observe() {
    try {
      const root = document.querySelector("#app-mount") || document.body;
      if (!root) return;

      if (this.observer) this.observer.disconnect();

      this.observer = new MutationObserver(mutations => {
        try {
          for (const m of mutations) {
            for (const n of m.addedNodes) {
              if (!(n instanceof Element)) continue;
              if (n.matches?.("time")) this.attach(n);
              else n.querySelectorAll?.("time")?.forEach(t => this.attach(t));
            }
          }
        } catch (e) {
          this.warn("MutationObserver callback error:", e);
        }
      });

      this.observer.observe(root, { childList: true, subtree: true });
      this.log("MutationObserver active.");
    } catch (e) {
      this.error("Observer setup failed:", e);
    }
  }

  processAll() {
    try {
      document.querySelectorAll("time").forEach(t => this.attach(t));
      this.log("Initial scan complete.");
    } catch (e) {
      this.error("Processing messages failed:", e);
    }
  }

  attach(timeEl) {
    try {
      if (!(timeEl instanceof Element)) return;

      // If we've already processed this exact <time>, don't do it again
      if (timeEl.hasAttribute(this.markerAttr)) return;

      // Discord uses datetime; some tooltips expose "title"
      const dt = timeEl.getAttribute("datetime") || timeEl.getAttribute("title");
      if (!dt) return;

      const date = new Date(dt);
      if (Number.isNaN(date.getTime())) return;

      // Avoid duplicates: if the next sibling is already our chip, update it instead of inserting
      const next = timeEl.nextElementSibling;
      if (next?.classList?.contains(this.injectedClass)) {
        next.dataset.timestamp = date.toISOString();
        next.textContent = this.format(date);
        if (this.settings.showTooltip) next.title = date.toLocaleString();
        else next.removeAttribute("title");
        timeEl.setAttribute(this.markerAttr, "true");
        return;
      }

      const span = document.createElement("span");
      span.className = this.injectedClass;
      span.dataset.timestamp = date.toISOString();
      span.textContent = this.format(date);
      if (this.settings.showTooltip) span.title = date.toLocaleString();

      // Safer than .after() if Discord changes prototypes (very rare but possible)
      if (typeof timeEl.after === "function") timeEl.after(span);
      else timeEl.parentNode?.insertBefore(span, timeEl.nextSibling);

      timeEl.setAttribute(this.markerAttr, "true");
    } catch (e) {
      this.warn("Attach failed:", e);
    }
  }

  refreshAll() {
    try {
      const now = new Date();
      document.querySelectorAll(`.${this.injectedClass}`).forEach(el => {
        const ts = el.dataset.timestamp;
        if (!ts) return;
        el.textContent = this.format(new Date(ts), now);
      });
    } catch (e) {
      this.warn("Refresh failed:", e);
    }
  }

  format(date, now = new Date()) {
    let diff = Math.floor((now - date) / 1000);
    if (diff < 0) diff = 0;

    const years = Math.floor(diff / 31536000); diff %= 31536000;
    const months = Math.floor(diff / 2592000); diff %= 2592000;
    const days = Math.floor(diff / 86400); diff %= 86400;
    const hours = Math.floor(diff / 3600); diff %= 3600;
    const minutes = Math.floor(diff / 60);
    const seconds = diff % 60;

    if (this.settings.detailed) {
      const parts = [];
      if (years) parts.push(`${years} year${years !== 1 ? "s" : ""}`);
      if (months) parts.push(`${months} month${months !== 1 ? "s" : ""}`);
      if (days) parts.push(`${days} day${days !== 1 ? "s" : ""}`);
      if (hours) parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
      if (minutes) parts.push(`${minutes} minute${minutes !== 1 ? "s" : ""}`);
      if (seconds || !parts.length) parts.push(`${seconds} second${seconds !== 1 ? "s" : ""}`);
      return parts.join(" ") + " ago";
    }

    if (years) return `${years}y ago`;
    if (months) return `${months}mo ago`;
    if (days) return `${days}d ago`;
    if (hours) return `${hours}h ago`;
    if (minutes) return `${minutes}m ago`;
    return `${seconds}s ago`;
  }

  /* ===========================
   *  Settings panel
   * =========================== */
  getSettingsPanel() {
    const panel = document.createElement("div");
    panel.className = "rel-settings-root";

    const header = document.createElement("div");
    header.className = "rel-settings-header";
    header.textContent = "RelativeTimestamps Settings";
    panel.appendChild(header);

    const mkSwitchRow = (title, note, key) => {
      const row = document.createElement("div");
      row.className = "bd-setting-item";

      const textWrap = document.createElement("div");
      textWrap.className = "rel-setting-texts";

      const titleEl = document.createElement("div");
      titleEl.className = "rel-setting-title";
      titleEl.textContent = title;

      const noteEl = document.createElement("div");
      noteEl.className = "rel-setting-note";
      noteEl.textContent = note;

      textWrap.append(titleEl, noteEl);

      const controlWrap = document.createElement("div");
      controlWrap.className = "rel-switch";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!this.settings[key];
      input.setAttribute("aria-label", title);

      input.addEventListener("change", () => {
        try {
          this.settings[key] = input.checked;
          this._saveSettings();

          // Apply live effects immediately
          if (key === "liveUpdate") {
            if (this.timer) clearInterval(this.timer);
            this.timer = null;
            if (this.settings.liveUpdate) this.startTimer();
          }

          if (key === "showTooltip" || key === "detailed") {
            // Update existing chips immediately
            document.querySelectorAll(`.${this.injectedClass}`).forEach(el => {
              const ts = el.dataset.timestamp;
              if (!ts) return;
              const d = new Date(ts);
              el.textContent = this.format(d);
              if (this.settings.showTooltip) el.title = d.toLocaleString();
              else el.removeAttribute("title");
            });
          }

          this.log(`Setting changed: ${key} = ${input.checked}`);
        } catch (e) {
          this.error("Setting change failed:", e);
        }
      });

      controlWrap.appendChild(input);
      row.append(textWrap, controlWrap);
      return row;
    };

    panel.append(
      mkSwitchRow(
        "Detailed timestamps",
        "Example: “5 minutes 22 seconds ago” instead of “5m ago”.",
        "detailed"
      ),
      mkSwitchRow(
        "Live update every second",
        "Keeps relative timestamps ticking in real time.",
        "liveUpdate"
      ),
      mkSwitchRow(
        "Show full date on hover",
        "Display the exact local datetime as a tooltip.",
        "showTooltip"
      ),
      (() => {
        const div = document.createElement("div");
        div.className = "rel-divider";
        return div;
      })()
    );

    // Actions row
    const actions = document.createElement("div");
    actions.className = "rel-row-end";

    const resetBtn = document.createElement("button");
    resetBtn.className = "rel-btn";
    resetBtn.textContent = "Reset to defaults";
    resetBtn.addEventListener("click", () => {
      try {
        this.settings = { ...this.defaultSettings };
        this._saveSettings();

        // Re-render the panel to reflect new states
        const newPanel = this.getSettingsPanel();
        panel.replaceWith(newPanel);

        this.refreshAll();

        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        if (this.settings.liveUpdate) this.startTimer();

        this.toast("RelativeTimestamps: settings reset", "success", 2500);
      } catch (e) {
        this.error("Reset failed:", e);
      }
    });

    const testBtn = document.createElement("button");
    testBtn.className = "rel-btn brand";
    testBtn.textContent = "Preview text";
    testBtn.addEventListener("click", () => {
      this.toast("Preview: text should be clearly readable on this theme.", "info", 3000);
    });

    actions.append(resetBtn, testBtn);
    panel.append(actions);

    return panel;
  }
};
