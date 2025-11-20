/**
 * @name RelativeTimestamps
 * @version 2.1.1
 * @description Shows customizable live timestamps beside Discord messages. Includes settings, error logging, and visual improvements. Settings panel rebuilt for full readability on all themes.
 * @author ChatGPT
 */

const { BdApi } = window;

module.exports = class RelativeTimestamps {
  constructor() {
    this.injectedClass = "bd-rel-ts";
    this.markerAttr = "data-rel-ready";
    this.styleId = "bd-rel-ts-style";
    this.timer = null;
    this.observer = null;

    this.defaultSettings = {
      detailed: true,
      liveUpdate: true,
      showTooltip: true
    };

    // Ensure all keys exist even after older versions
    const loaded = BdApi.loadData("RelativeTimestamps", "settings") || {};
    this.settings = Object.assign({}, this.defaultSettings, loaded);
  }

  log(...args) { console.log("[RelativeTimestamps]", ...args); }
  error(...args) { console.error("[RelativeTimestamps]", ...args); }

  start() {
    try {
      this.log("Starting...");
      this.injectCSS();
      this.observe();
      this.processAll();
      if (this.settings.liveUpdate) this.startTimer();
      this.log("Plugin started successfully.");
    } catch (e) {
      this.error("Startup failed:", e);
    }
  }

  stop() {
    try {
      this.log("Stopping...");
      if (this.observer) this.observer.disconnect();
      clearInterval(this.timer);
      document.querySelectorAll(`.${this.injectedClass}`).forEach(e => e.remove());
      document.getElementById(this.styleId)?.remove();
      this.log("Stopped cleanly.");
    } catch (e) {
      this.error("Error during stop:", e);
    }
  }

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
  }

  startTimer() {
    clearInterval(this.timer);
    this.timer = setInterval(() => this.refreshAll(), 1000);
  }

  observe() {
    try {
      const root = document.querySelector("#app-mount") || document.body;
      if (!root) return;
      this.observer = new MutationObserver(mutations => {
        for (const m of mutations) {
          for (const n of m.addedNodes) {
            if (!(n instanceof Element)) continue;
            if (n.matches?.("time")) this.attach(n);
            else n.querySelectorAll?.("time")?.forEach(t => this.attach(t));
          }
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
    } catch (e) {
      this.error("Processing messages failed:", e);
    }
  }

  attach(timeEl) {
    try {
      if (timeEl.hasAttribute(this.markerAttr)) return;
      const dt = timeEl.getAttribute("datetime") || timeEl.getAttribute("title");
      if (!dt) return;
      const date = new Date(dt);
      if (isNaN(date)) return;

      const span = document.createElement("span");
      span.className = this.injectedClass;
      span.dataset.timestamp = date.toISOString();
      span.textContent = this.format(date);
      if (this.settings.showTooltip) span.title = date.toLocaleString();

      timeEl.after(span);
      timeEl.setAttribute(this.markerAttr, "true");
    } catch (e) {
      this.error("Attach failed:", e);
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
      this.error("Refresh failed:", e);
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
    } else {
      if (years) return `${years}y ago`;
      if (months) return `${months}mo ago`;
      if (days) return `${days}d ago`;
      if (hours) return `${hours}h ago`;
      if (minutes) return `${minutes}m ago`;
      return `${seconds}s ago`;
    }
  }

  /* ====== NEW settings panel (theme-proof) ====== */
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
        this.settings[key] = input.checked;
        BdApi.saveData("RelativeTimestamps", "settings", this.settings);

        // Apply live effects immediately
        if (key === "liveUpdate") {
          clearInterval(this.timer);
          if (this.settings.liveUpdate) this.startTimer();
        }
        if (key === "showTooltip" || key === "detailed") {
          this.refreshAll();
        }
        this.log(`Setting changed: ${key} = ${input.checked}`);
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
      this.settings = { ...this.defaultSettings };
      BdApi.saveData("RelativeTimestamps", "settings", this.settings);
      // Re-render the panel to reflect new states
      const newPanel = this.getSettingsPanel();
      panel.replaceWith(newPanel);
      this.refreshAll();
      clearInterval(this.timer);
      if (this.settings.liveUpdate) this.startTimer();
    });

    const testBtn = document.createElement("button");
    testBtn.className = "rel-btn brand";
    testBtn.textContent = "Preview text";
    testBtn.addEventListener("click", () => {
      BdApi.UI.showToast("Preview: text should be clearly readable on this theme.", {type: "info", timeout: 3000});
    });

    actions.append(resetBtn, testBtn);
    panel.append(actions);

    return panel;
  }
};
