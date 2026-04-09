// ==UserScript==
// @name         YouTube Cleaner — No Shorts, No Ads, No Sidebar + SponsorBlock UI
// @namespace    https://github.com/youtube-cleaner
// @version      8.3
// @description  Removes Shorts, ads, Up Next sidebar, clutter. Adds Danish comment toggle button, SponsorBlock settings UI, player badge, seek bar markers and skip button.
// @author       PG
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  //  State
  // ─────────────────────────────────────────────────────────────

  const COMMENTS_STORAGE_KEY = 'ytCleanerCommentsHidden_v1';
  const SB_STORAGE_KEY = 'ytCleanerSponsorBlockSettings_v3';

  function loadCommentsHidden() {
    try {
      return localStorage.getItem(COMMENTS_STORAGE_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function saveCommentsHidden(value) {
    try {
      localStorage.setItem(COMMENTS_STORAGE_KEY, value ? '1' : '0');
    } catch (_) {}
  }

  let commentsHidden = loadCommentsHidden();
  let cleanScheduled = false;
  let lastUrl = location.href;

  // ─────────────────────────────────────────────────────────────
  //  Small DOM helpers
  // ─────────────────────────────────────────────────────────────

  function create(tag, props = {}, children = []) {
    const el = document.createElement(tag);

    for (const [key, value] of Object.entries(props)) {
      if (value == null) continue;

      if (key === 'className') {
        el.className = value;
      } else if (key === 'textContent') {
        el.textContent = value;
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(el.style, value);
      } else if (key === 'dataset' && typeof value === 'object') {
        Object.assign(el.dataset, value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key in el) {
        try {
          el[key] = value;
        } catch (_) {
          el.setAttribute(key, String(value));
        }
      } else {
        el.setAttribute(key, String(value));
      }
    }

    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      if (child == null) continue;
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else {
        el.appendChild(child);
      }
    }

    return el;
  }

  function clearChildren(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function createSvgIcon(pathD, { width = 24, height = 24, viewBox = '0 0 24 24' } = {}) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('xmlns', ns);
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', pathD);
    svg.appendChild(path);

    return svg;
  }

  function debounceFrame(fn) {
    let queued = false;
    return function (...args) {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        fn(...args);
      });
    };
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  // ─────────────────────────────────────────────────────────────
  //  Icons
  // ─────────────────────────────────────────────────────────────

  const EYE_OPEN_PATH =
    'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5ZM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5Zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3Z';

  const EYE_OFF_PATH =
    'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75C21.27 7.61 17 4.5 12 4.5c-1.24 0-2.43.2-3.54.57l2.16 2.16C11.21 7.13 11.6 7 12 7ZM2 4.27l2.28 2.28.46.46A11.8 11.8 0 001 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27ZM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2Zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01Z';

  const SB_SHIELD_PATH =
    'M12 2 4 5v6c0 5.05 3.4 9.78 8 11 4.6-1.22 8-5.95 8-11V5l-8-3Zm0 2.1 6 2.25V11c0 4.04-2.57 7.92-6 9.1-3.43-1.18-6-5.06-6-9.1V6.35L12 4.1Z';

  const SB_GEAR_PATH =
    'M19.14 12.94c.04-.31.06-.62.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.09 7.09 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.23-1.13.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.62-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.4 1.05.71 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.23 1.13-.54 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z';

  const SB_SKIP_PATH =
    'M6 6v12l8.5-6L6 6Zm10 0h2v12h-2V6Z';

  // ─────────────────────────────────────────────────────────────
  //  SponsorBlock settings
  // ─────────────────────────────────────────────────────────────

  const SB_CATEGORY_META = {
    sponsor: {
      label: 'Sponsor',
      color: '#00d400',
      defaultMode: 'auto',
      description: 'Betalte sponsorsegmenter'
    },
    selfpromo: {
      label: 'Selvpromovering',
      color: '#ffd600',
      defaultMode: 'manual',
      description: 'Egen promo / unpaid promo'
    },
    interaction: {
      label: 'Like / subscribe',
      color: '#00bcd4',
      defaultMode: 'manual',
      description: 'Call to action'
    },
    intro: {
      label: 'Intro',
      color: '#ff9800',
      defaultMode: 'manual',
      description: 'Introsekvenser'
    },
    outro: {
      label: 'Outro',
      color: '#9c27b0',
      defaultMode: 'manual',
      description: 'Outro / credits'
    },
    preview: {
      label: 'Preview / recap',
      color: '#2196f3',
      defaultMode: 'manual',
      description: 'Preview og recap'
    },
    hook: {
      label: 'Hook',
      color: '#ff4081',
      defaultMode: 'manual',
      description: 'Hook / teaser'
    },
    poi_highlight: {
      label: 'Højdepunkt',
      color: '#ffffff',
      defaultMode: 'manual',
      description: 'Spring til highlight'
    },
    filler: {
      label: 'Filler',
      color: '#9e9e9e',
      defaultMode: 'off',
      description: 'Aggressiv kategori'
    },
    music_offtopic: {
      label: 'Ikke-musik',
      color: '#8bc34a',
      defaultMode: 'off',
      description: 'Ikke-musikdele i musikvideoer'
    },
    exclusive_access: {
      label: 'Exclusive access',
      color: '#f44336',
      defaultMode: 'off',
      description: 'Hele videoen er label’et'
    }
  };

  const SB_DEFAULT_SETTINGS = {
    enabled: true,
    showToast: true,
    showSeekBarSegments: true,
    showSkipButton: true,
    showMenuEntry: true,
    showPlayerChromeButton: true,
    categoryModes: Object.fromEntries(
      Object.entries(SB_CATEGORY_META).map(([key, meta]) => [key, meta.defaultMode])
    )
  };

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function normalizeSBSettings(raw) {
    const out = deepClone(SB_DEFAULT_SETTINGS);
    if (!raw || typeof raw !== 'object') return out;

    for (const key of ['enabled', 'showToast', 'showSeekBarSegments', 'showSkipButton', 'showMenuEntry', 'showPlayerChromeButton']) {
      if (typeof raw[key] === 'boolean') out[key] = raw[key];
    }

    if (raw.categoryModes && typeof raw.categoryModes === 'object') {
      for (const key of Object.keys(SB_CATEGORY_META)) {
        const value = raw.categoryModes[key];
        if (value === 'off' || value === 'manual' || value === 'auto') {
          out.categoryModes[key] = value;
        }
      }
    }

    return out;
  }

  function loadSBSettings() {
    try {
      const raw = localStorage.getItem(SB_STORAGE_KEY);
      if (!raw) return deepClone(SB_DEFAULT_SETTINGS);
      return normalizeSBSettings(JSON.parse(raw));
    } catch (_) {
      return deepClone(SB_DEFAULT_SETTINGS);
    }
  }

  function saveSBSettings() {
    try {
      localStorage.setItem(SB_STORAGE_KEY, JSON.stringify(sbSettings));
    } catch (_) {}
  }

  let sbSettings = loadSBSettings();

  const sponsorState = {
    currentVideoId: '',
    fetchedForVideoId: '',
    fetching: false,
    segments: [],
    fetchError: '',
    activeMuteSegment: null,
    muteRestoreState: null,
    manualMuteSegmentUUID: '',
    lastHandledUUID: '',
    lastHandledAt: 0,
    lastAutoPoiUUID: '',
    reportedUUIDs: new Set(),
    tickTimer: null,
    markersRenderedForKey: '',
    lastDuration: 0,
    playerBadgeState: 'idle'
  };

  // ─────────────────────────────────────────────────────────────
  //  CSS
  // ─────────────────────────────────────────────────────────────

  const CSS = `
    /* ── SHORTS ──────────────────────────────────────────────── */
    ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]),
    ytd-rich-shelf-renderer[is-shorts],
    ytd-rich-shelf-renderer[has-shorts],
    ytd-reel-shelf-renderer,
    ytd-item-section-renderer:has(ytd-reel-shelf-renderer),
    ytm-shorts-lockup-view-model,
    ytm-shorts-lockup-view-model-v2,
    ytd-rich-item-renderer:has(ytm-shorts-lockup-view-model),
    ytd-rich-item-renderer:has(a[href*="/shorts/"]),
    ytd-video-renderer:has(a[href*="/shorts/"]),
    ytd-grid-video-renderer:has(a[href*="/shorts/"]),
    ytd-compact-video-renderer:has(a[href*="/shorts/"]),
    ytd-horizontal-card-list-renderer,
    ytd-mini-guide-entry-renderer:has(a[href="/shorts/"]),
    ytd-guide-entry-renderer:has(a[href="/shorts/"]),
    yt-tab-shape[tab-title="Shorts"] {
      display: none !important;
    }

    /* ── VIDEO ADS ────────────────────────────────────────────── */
    .video-ads,
    .ytp-ad-module,
    .ytp-ad-overlay-container,
    .ytp-ad-text-overlay,
    .ytp-ad-image-overlay,
    .ytp-ad-skip-button-container,
    .ytp-ad-skip-button-modern,
    .ytp-ad-progress,
    .ytp-ad-progress-list,
    .ytp-ad-persistent-progress-bar-container,
    .ytp-ad-action-interstitial,
    .ytp-ad-player-overlay,
    .ytp-ad-player-overlay-instream-info,
    #player-ads {
      display: none !important;
    }

    /* ── IN-FEED ADS ──────────────────────────────────────────── */
    ytd-ad-slot-renderer,
    ytd-in-feed-ad-layout-renderer,
    ytd-display-ad-renderer,
    ytd-action-companion-ad-renderer,
    ytd-video-masthead-ad-v3-renderer,
    ytd-companion-slot-renderer,
    ytd-promoted-sparkles-web-renderer,
    ytd-promoted-video-renderer,
    ytd-search-pyv-renderer,
    ytd-banner-promo-renderer,
    ytd-rich-item-renderer:has(ytd-ad-slot-renderer),
    ytd-rich-item-renderer:has([is-promoted]),
    ytd-item-section-renderer:has(ytd-ad-slot-renderer),
    #masthead-ad,
    square-image-layout-view-model,
    ad-slot-renderer {
      display: none !important;
    }

    /* ── UP NEXT SIDEBAR ──────────────────────────────────────── */
    ytd-watch-next-secondary-results-renderer,
    #secondary.ytd-watch-flexy,
    #secondary-inner.ytd-watch-flexy {
      display: none !important;
    }

    #primary.ytd-watch-flexy {
      max-width: 100% !important;
      margin-right: 0 !important;
    }

    /* ── FEED CLUTTER ─────────────────────────────────────────── */
    ytd-radio-renderer,
    ytd-mix-renderer,
    ytd-shelf-renderer,
    ytd-merch-shelf-renderer,
    ytd-ticket-shelf-renderer {
      display: none !important;
    }

    /* ── UPSELLS ──────────────────────────────────────────────── */
    ytd-mealbar-promo-renderer,
    #mealbar-promo-renderer,
    ytd-premium-yva-upsell-renderer,
    ytd-interstitial-promo-renderer,
    ytd-sponsor-button-renderer,
    #super-thanks-button {
      display: none !important;
    }

    /* ── VIDEO OVERLAYS ───────────────────────────────────────── */
    .ytp-endscreen-content,
    .ytp-cards-teaser,
    .ytp-autonav-endscreen,
    #cinematics {
      display: none !important;
    }

    /* ── COMMENT TOGGLE BUTTON ────────────────────────────────── */
    #yt-comment-toggle-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      margin-left: 12px;
      padding: 0;
      height: auto;
      min-height: 0;
      border: none;
      border-radius: 0;
      background: transparent;
      color: var(--yt-spec-text-primary, #0f0f0f);
      font-family: "Roboto", "Arial", sans-serif;
      font-size: 17px;
      font-weight: 400;
      line-height: 1;
      cursor: pointer;
      white-space: nowrap;
      vertical-align: middle;
      flex-shrink: 0;
      align-self: center;
      box-shadow: none;
      appearance: none;
      -webkit-appearance: none;
      position: relative;
      top: -1px;
    }

    #yt-comment-toggle-btn:hover,
    #yt-comment-toggle-btn:focus,
    #yt-comment-toggle-btn:active {
      background: transparent;
      box-shadow: none;
      outline: none;
    }

    #yt-comment-toggle-btn svg {
      width: 24px;
      height: 24px;
      flex-shrink: 0;
      fill: currentColor;
      pointer-events: none;
      position: relative;
      top: 0;
    }

    #yt-comment-toggle-btn span {
      pointer-events: none;
      line-height: 1;
    }

    html[dark] #yt-comment-toggle-btn,
    ytd-app[is-dark-theme] #yt-comment-toggle-btn {
      color: #fff;
      background: transparent;
    }

    /* ── SPONSORBLOCK ACCOUNT MENU ENTRY ─────────────────────── */
    #yt-cleaner-sb-menu-entry {
      display: flex;
      align-items: center;
      gap: 16px;
      min-height: 40px;
      padding: 8px 16px;
      margin: 0 8px;
      border-radius: 10px;
      color: var(--yt-spec-text-primary, #0f0f0f);
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
    }

    #yt-cleaner-sb-menu-entry:hover {
      background: rgba(0,0,0,0.06);
    }

    html[dark] #yt-cleaner-sb-menu-entry,
    ytd-app[is-dark-theme] #yt-cleaner-sb-menu-entry {
      color: #fff;
    }

    html[dark] #yt-cleaner-sb-menu-entry:hover,
    ytd-app[is-dark-theme] #yt-cleaner-sb-menu-entry:hover {
      background: rgba(255,255,255,0.08);
    }

    #yt-cleaner-sb-menu-entry-icon {
      width: 24px;
      height: 24px;
      flex: 0 0 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: inherit;
    }

    #yt-cleaner-sb-menu-entry-icon svg {
      width: 24px;
      height: 24px;
      fill: currentColor;
    }

    #yt-cleaner-sb-menu-entry-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    #yt-cleaner-sb-menu-entry-label {
      font-family: "Roboto", "Arial", sans-serif;
      font-size: 14px;
      font-weight: 400;
      line-height: 1.4;
    }

    #yt-cleaner-sb-menu-entry-subtitle {
      font-family: "Roboto", "Arial", sans-serif;
      font-size: 12px;
      opacity: 0.72;
      line-height: 1.35;
    }

    /* ── SPONSORBLOCK PLAYER BADGE ───────────────────────────── */
    #yt-cleaner-sb-player-btn {
      display: inline-flex;
      align-items: center;
      gap: 0;
      min-width: 0;
      height: 36px;
      padding: 0 8px;
      border: none;
      background: transparent;
      color: #fff;
      cursor: pointer;
      font-family: "Roboto", "Arial", sans-serif;
      font-size: 13px;
      font-weight: 500;
      line-height: 1;
      opacity: 0.96;
      overflow: hidden;
      transition: opacity 0.15s ease;
    }

    #yt-cleaner-sb-player-btn:hover,
    #yt-cleaner-sb-player-btn:focus-visible {
      opacity: 1;
    }

    #yt-cleaner-sb-player-btn svg {
      width: 18px;
      height: 18px;
      fill: currentColor;
      flex: 0 0 auto;
      pointer-events: none;
    }

    #yt-cleaner-sb-player-status-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #888;
      flex: 0 0 auto;
      margin-left: 6px;
      pointer-events: none;
    }

    #yt-cleaner-sb-player-text {
      max-width: 0;
      opacity: 0;
      overflow: hidden;
      white-space: nowrap;
      pointer-events: none;
      margin-left: 0;
      transition: max-width 0.18s ease, opacity 0.14s ease, margin-left 0.18s ease;
    }

    #yt-cleaner-sb-player-btn:hover #yt-cleaner-sb-player-text,
    #yt-cleaner-sb-player-btn:focus-visible #yt-cleaner-sb-player-text {
      max-width: 90px;
      opacity: 1;
      margin-left: 7px;
    }

    #yt-cleaner-sb-player-btn[data-status="loading"] #yt-cleaner-sb-player-status-dot {
      background: #ffb300;
    }

    #yt-cleaner-sb-player-btn[data-status="ready"] #yt-cleaner-sb-player-status-dot {
      background: #00d400;
    }

    #yt-cleaner-sb-player-btn[data-status="none"] #yt-cleaner-sb-player-status-dot {
      background: #9e9e9e;
    }

    #yt-cleaner-sb-player-btn[data-status="error"] #yt-cleaner-sb-player-status-dot {
      background: #ff5252;
    }

    #yt-cleaner-sb-player-btn[data-status="off"] #yt-cleaner-sb-player-status-dot {
      background: #616161;
    }

    /* ── SPONSORBLOCK SETTINGS MODAL ─────────────────────────── */
    #yt-cleaner-sb-settings-overlay {
      position: fixed;
      inset: 0;
      z-index: 999999;
      background: rgba(0,0,0,0.58);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      box-sizing: border-box;
    }

    #yt-cleaner-sb-settings-modal {
      width: min(900px, calc(100vw - 48px));
      max-height: min(88vh, 920px);
      overflow: auto;
      border-radius: 20px;
      background: #fff;
      color: #0f0f0f;
      box-shadow: 0 20px 56px rgba(0,0,0,0.34);
      font-family: "Roboto", "Arial", sans-serif;
    }

    html[dark] #yt-cleaner-sb-settings-modal,
    ytd-app[is-dark-theme] #yt-cleaner-sb-settings-modal {
      background: #212121;
      color: #fff;
    }

    .yt-cleaner-sb-modal-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 24px 24px 18px;
      position: sticky;
      top: 0;
      background: inherit;
      z-index: 1;
      border-bottom: 1px solid rgba(0,0,0,0.08);
    }

    html[dark] .yt-cleaner-sb-modal-header,
    ytd-app[is-dark-theme] .yt-cleaner-sb-modal-header {
      border-bottom-color: rgba(255,255,255,0.08);
    }

    .yt-cleaner-sb-modal-title-wrap {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
    }

    .yt-cleaner-sb-modal-icon {
      width: 30px;
      height: 30px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
    }

    .yt-cleaner-sb-modal-icon svg {
      width: 30px;
      height: 30px;
      fill: currentColor;
    }

    .yt-cleaner-sb-modal-title {
      font-size: 20px;
      font-weight: 500;
      line-height: 1.2;
    }

    .yt-cleaner-sb-modal-subtitle {
      margin-top: 5px;
      font-size: 13px;
      opacity: 0.76;
      line-height: 1.45;
    }

    .yt-cleaner-sb-close-btn,
    .yt-cleaner-sb-primary-btn,
    .yt-cleaner-sb-secondary-btn {
      border: none;
      border-radius: 999px;
      cursor: pointer;
      font-family: inherit;
    }

    .yt-cleaner-sb-close-btn {
      padding: 10px 14px;
      background: rgba(0,0,0,0.08);
      color: inherit;
      font-size: 14px;
      line-height: 1;
      flex: 0 0 auto;
    }

    html[dark] .yt-cleaner-sb-close-btn,
    ytd-app[is-dark-theme] .yt-cleaner-sb-close-btn {
      background: rgba(255,255,255,0.10);
    }

    .yt-cleaner-sb-content {
      padding: 20px 24px 8px;
    }

    .yt-cleaner-sb-section {
      margin-bottom: 24px;
    }

    .yt-cleaner-sb-section-title {
      font-size: 15px;
      font-weight: 500;
      margin: 0 0 12px;
    }

    .yt-cleaner-sb-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }

    @media (max-width: 760px) {
      .yt-cleaner-sb-grid {
        grid-template-columns: 1fr;
      }
    }

    .yt-cleaner-sb-card {
      border: 1px solid rgba(0,0,0,0.09);
      border-radius: 16px;
      padding: 15px 15px 14px;
      background: rgba(0,0,0,0.02);
    }

    html[dark] .yt-cleaner-sb-card,
    ytd-app[is-dark-theme] .yt-cleaner-sb-card {
      border-color: rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.04);
    }

    .yt-cleaner-sb-toggle-row,
    .yt-cleaner-sb-category-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .yt-cleaner-sb-category-row {
      align-items: flex-start;
    }

    .yt-cleaner-sb-label-wrap {
      min-width: 0;
      flex: 1 1 auto;
    }

    .yt-cleaner-sb-label {
      font-size: 14px;
      font-weight: 500;
      line-height: 1.45;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .yt-cleaner-sb-desc {
      margin-top: 4px;
      font-size: 12px;
      opacity: 0.74;
      line-height: 1.45;
    }

    .yt-cleaner-sb-color-dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      display: inline-block;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.2) inset;
      flex: 0 0 auto;
    }

    html[dark] .yt-cleaner-sb-color-dot,
    ytd-app[is-dark-theme] .yt-cleaner-sb-color-dot {
      box-shadow: 0 0 0 1px rgba(255,255,255,0.22) inset;
    }

    .yt-cleaner-sb-switch {
      width: 44px;
      height: 24px;
      position: relative;
      flex: 0 0 auto;
    }

    .yt-cleaner-sb-switch input {
      opacity: 0;
      width: 0;
      height: 0;
      position: absolute;
    }

    .yt-cleaner-sb-switch-track {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.18);
      border-radius: 999px;
      transition: background 0.15s ease;
    }

    html[dark] .yt-cleaner-sb-switch-track,
    ytd-app[is-dark-theme] .yt-cleaner-sb-switch-track {
      background: rgba(255,255,255,0.18);
    }

    .yt-cleaner-sb-switch-thumb {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 18px;
      height: 18px;
      border-radius: 999px;
      background: #fff;
      transition: transform 0.15s ease;
      box-shadow: 0 1px 3px rgba(0,0,0,0.22);
    }

    .yt-cleaner-sb-switch input:checked + .yt-cleaner-sb-switch-track {
      background: #3ea6ff;
    }

    .yt-cleaner-sb-switch input:checked + .yt-cleaner-sb-switch-track .yt-cleaner-sb-switch-thumb {
      transform: translateX(20px);
    }

    .yt-cleaner-sb-select {
      border: 1px solid rgba(0,0,0,0.16);
      border-radius: 10px;
      padding: 8px 12px;
      min-width: 116px;
      background: #fff;
      color: #0f0f0f;
      font-family: inherit;
      font-size: 13px;
      outline: none;
      flex: 0 0 auto;
    }

    html[dark] .yt-cleaner-sb-select,
    ytd-app[is-dark-theme] .yt-cleaner-sb-select {
      background: #2c2c2c;
      color: #fff;
      border-color: rgba(255,255,255,0.14);
    }

    .yt-cleaner-sb-note {
      font-size: 12px;
      opacity: 0.74;
      line-height: 1.55;
      margin-top: 4px;
    }

    .yt-cleaner-sb-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 0 24px 24px;
      position: sticky;
      bottom: 0;
      background: inherit;
      border-top: 1px solid rgba(0,0,0,0.08);
      padding-top: 16px;
    }

    html[dark] .yt-cleaner-sb-footer,
    ytd-app[is-dark-theme] .yt-cleaner-sb-footer {
      border-top-color: rgba(255,255,255,0.08);
    }

    .yt-cleaner-sb-primary-btn,
    .yt-cleaner-sb-secondary-btn {
      padding: 10px 16px;
      font-size: 14px;
      font-weight: 500;
      line-height: 1;
    }

    .yt-cleaner-sb-primary-btn {
      background: #3ea6ff;
      color: #00111f;
    }

    .yt-cleaner-sb-secondary-btn {
      background: rgba(0,0,0,0.08);
      color: inherit;
    }

    html[dark] .yt-cleaner-sb-secondary-btn,
    ytd-app[is-dark-theme] .yt-cleaner-sb-secondary-btn {
      background: rgba(255,255,255,0.10);
    }

    /* ── SPONSORBLOCK TOAST ───────────────────────────────────── */
    #yt-cleaner-sb-toast {
      position: fixed;
      left: 50%;
      bottom: 84px;
      transform: translateX(-50%);
      z-index: 999999;
      pointer-events: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 12px;
      background: rgba(15,15,15,0.88);
      color: #fff;
      font-family: "Roboto", "Arial", sans-serif;
      font-size: 14px;
      font-weight: 500;
      line-height: 1.2;
      opacity: 0;
      transition: opacity 0.18s ease;
      box-shadow: 0 8px 28px rgba(0,0,0,0.32);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }

    #yt-cleaner-sb-toast[data-show="true"] {
      opacity: 1;
    }

    /* ── SPONSORBLOCK SKIP BUTTON ─────────────────────────────── */
    #yt-cleaner-sb-skip-btn {
      position: absolute;
      right: 88px;
      bottom: 72px;
      z-index: 70;
      display: none;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border: none;
      border-radius: 999px;
      background: rgba(15,15,15,0.92);
      color: #fff;
      font-family: "Roboto", "Arial", sans-serif;
      font-size: 13px;
      font-weight: 500;
      line-height: 1;
      cursor: pointer;
      box-shadow: 0 8px 20px rgba(0,0,0,0.28);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }

    #yt-cleaner-sb-skip-btn svg {
      width: 18px;
      height: 18px;
      fill: currentColor;
      flex: 0 0 auto;
      pointer-events: none;
    }

    #yt-cleaner-sb-skip-btn[data-show="true"] {
      display: inline-flex;
    }

    @media (max-width: 900px) {
      #yt-cleaner-sb-skip-btn {
        right: 16px;
        bottom: 76px;
      }
    }

    /* ── SPONSORBLOCK SEEK BAR SEGMENTS ───────────────────────── */
    .ytp-progress-list {
      position: relative !important;
      z-index: 1 !important;
      overflow: visible !important;
    }

    .ytp-scrubber-container {
      position: relative !important;
      z-index: 5 !important;
    }

    #yt-cleaner-sb-marker-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 3;
      display: block;
    }

    .yt-cleaner-sb-marker {
      position: absolute;
      top: 1px;
      height: calc(100% - 2px);
      border-radius: 999px;
      opacity: 0.88;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.22);
    }

    .yt-cleaner-sb-marker.yt-cleaner-sb-point {
      width: 4px;
      min-width: 4px;
      transform: translateX(-2px);
      border-radius: 3px;
      opacity: 1;
    }

    .yt-cleaner-sb-marker.yt-cleaner-sb-full {
      opacity: 0.28;
    }
  `;

  function injectCSS() {
    if (document.getElementById('yt-cleaner-styles')) return;
    const style = document.createElement('style');
    style.id = 'yt-cleaner-styles';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  injectCSS();
  document.addEventListener('DOMContentLoaded', injectCSS, { once: true });

  // ─────────────────────────────────────────────────────────────
  //  Redirect /shorts/
  // ─────────────────────────────────────────────────────────────

  function redirectShorts() {
    if (!window.location.pathname.startsWith('/shorts/')) return;
    const id = window.location.pathname.replace('/shorts/', '').split('?')[0];
    if (!id) return;
    window.location.replace('https://www.youtube.com/watch?v=' + id);
  }

  // ─────────────────────────────────────────────────────────────
  //  Comment toggle
  // ─────────────────────────────────────────────────────────────

  function updateCommentButton(btn) {
    if (!btn) return;

    const label = commentsHidden ? 'Vis kommentarer' : 'Skjul kommentarer';
    const icon = createSvgIcon(commentsHidden ? EYE_OPEN_PATH : EYE_OFF_PATH);
    const text = create('span', {
      textContent: label,
      style: {
        fontSize: '17px',
        fontWeight: '400'
      }
    });

    clearChildren(btn);
    btn.appendChild(icon);
    btn.appendChild(text);
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', String(commentsHidden));
  }

  function getCommentsRoot() {
    return document.querySelector('ytd-comments');
  }

  function getSortMenu() {
    return (
      document.querySelector('ytd-comments-header-renderer yt-dropdown-menu') ||
      document.querySelector('#comments ytd-comments-header-renderer yt-dropdown-menu')
    );
  }

  function getCommentBodyTargets() {
    const root = getCommentsRoot();
    if (!root) return [];

    const targets = [];
    const contents = root.querySelector('#contents');
    const continuation = root.querySelector('#continuation');
    const teaser = root.querySelector('#comment-teaser');
    const simplebox = root.querySelector('ytd-comment-simplebox-renderer');
    const sharedSimplebox = root.querySelector('#create-comment');
    const pager = root.querySelector('ytd-continuation-item-renderer');

    if (contents) targets.push(contents);
    if (continuation) targets.push(continuation);
    if (teaser) targets.push(teaser);
    if (simplebox) targets.push(simplebox);
    if (sharedSimplebox) targets.push(sharedSimplebox);
    if (pager) targets.push(pager);

    return [...new Set(targets)];
  }

  function applyCommentVisibility() {
    for (const el of getCommentBodyTargets()) {
      if (commentsHidden) {
        el.style.setProperty('display', 'none', 'important');
      } else {
        el.style.removeProperty('display');
      }
    }
  }

  function toggleComments() {
    commentsHidden = !commentsHidden;
    saveCommentsHidden(commentsHidden);
    applyCommentVisibility();
    const btn = document.getElementById('yt-comment-toggle-btn');
    if (btn) updateCommentButton(btn);
  }

  function injectToggleButton() {
    if (!window.location.pathname.startsWith('/watch')) return;

    const sortMenu = getSortMenu();
    if (!sortMenu) return;

    let btn = document.getElementById('yt-comment-toggle-btn');

    if (btn && btn.isConnected) {
      const desiredParent = sortMenu.parentElement || sortMenu;
      if (btn.parentElement !== desiredParent) {
        sortMenu.insertAdjacentElement('afterend', btn);
      }
      updateCommentButton(btn);
      return;
    }

    btn = create('button', {
      id: 'yt-comment-toggle-btn',
      type: 'button',
      onclick: toggleComments
    });

    updateCommentButton(btn);
    sortMenu.insertAdjacentElement('afterend', btn);
  }

  // ─────────────────────────────────────────────────────────────
  //  SponsorBlock helpers
  // ─────────────────────────────────────────────────────────────

  function getCurrentVideoId() {
    const url = new URL(location.href);

    if (url.pathname === '/watch') {
      return url.searchParams.get('v') || '';
    }

    if (url.pathname.startsWith('/shorts/')) {
      return url.pathname.replace('/shorts/', '').split('/')[0] || '';
    }

    return '';
  }

  function getVideoElement() {
    return document.querySelector('video.html5-main-video, video');
  }

  function getPlayerElement() {
    return document.querySelector('.html5-video-player');
  }

  function getPlayerChromeHost() {
    return (
      document.querySelector('.ytp-right-controls-left') ||
      document.querySelector('.ytp-right-controls')
    );
  }

  function getSBMode(category) {
    return sbSettings.categoryModes[category] || SB_CATEGORY_META[category]?.defaultMode || 'off';
  }

  function getEnabledSBCategories() {
    return Object.keys(SB_CATEGORY_META).filter(category => getSBMode(category) !== 'off');
  }

  function sbLabel(category) {
    return SB_CATEGORY_META[category]?.label || category;
  }

  function sbColor(category) {
    return SB_CATEGORY_META[category]?.color || '#3ea6ff';
  }

  function setPlayerBadge(status, text = 'SB') {
    sponsorState.playerBadgeState = status;

    const btn = document.getElementById('yt-cleaner-sb-player-btn');
    if (!btn) return;

    btn.dataset.status = status;

    let title = 'SponsorBlock';
    if (status === 'loading') title = 'SponsorBlock: loading';
    if (status === 'ready') title = `SponsorBlock: ${sponsorState.segments.length} segmenter`;
    if (status === 'none') title = 'SponsorBlock: ingen segmenter';
    if (status === 'error') title = `SponsorBlock: ${sponsorState.fetchError || 'error'}`;
    if (status === 'off') title = 'SponsorBlock: slået fra';

    btn.title = title;

    const textNode = btn.querySelector('#yt-cleaner-sb-player-text');
    if (textNode) textNode.textContent = text;
  }

  function injectPlayerBadge() {
    const existing = document.getElementById('yt-cleaner-sb-player-btn');

    if (!sbSettings.showPlayerChromeButton || !window.location.pathname.startsWith('/watch')) {
      if (existing) existing.remove();
      return;
    }

    const host = getPlayerChromeHost();
    if (!host) return;

    const settingsBtn = document.querySelector('.ytp-settings-button');
    if (existing && existing.isConnected) {
      if (settingsBtn && existing.nextSibling !== settingsBtn) {
        host.insertBefore(existing, settingsBtn);
      } else if (!existing.parentElement || existing.parentElement !== host) {
        host.appendChild(existing);
      }
      return;
    }

    const btn = create('button', {
      id: 'yt-cleaner-sb-player-btn',
      type: 'button',
      title: 'SponsorBlock',
      onclick: openSBSettingsModal
    }, [
      createSvgIcon(SB_SHIELD_PATH, { width: 18, height: 18 }),
      create('span', { id: 'yt-cleaner-sb-player-status-dot' }),
      create('span', { id: 'yt-cleaner-sb-player-text', textContent: 'SB' })
    ]);

    if (settingsBtn) {
      host.insertBefore(btn, settingsBtn);
    } else {
      host.appendChild(btn);
    }

    setPlayerBadge(sponsorState.playerBadgeState || 'idle', 'SB');
  }

  function showSponsorToast(message) {
    if (!sbSettings.enabled || !sbSettings.showToast) return;

    let toast = document.getElementById('yt-cleaner-sb-toast');
    if (!toast) {
      toast = create('div', { id: 'yt-cleaner-sb-toast' });
      document.documentElement.appendChild(toast);
    }

    toast.textContent = message;
    toast.setAttribute('data-show', 'true');

    clearTimeout(showSponsorToast._timer);
    showSponsorToast._timer = setTimeout(() => {
      toast.setAttribute('data-show', 'false');
    }, 1400);
  }

  async function sha256Hex(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function clearSponsorUI() {
    const markerLayer = document.getElementById('yt-cleaner-sb-marker-layer');
    if (markerLayer) markerLayer.remove();

    const skipBtn = document.getElementById('yt-cleaner-sb-skip-btn');
    if (skipBtn) {
      skipBtn.removeAttribute('data-show');
      skipBtn.style.display = 'none';
      skipBtn.onclick = null;
    }
  }

  function restoreMuteState(video) {
    if (!video) return;
    if (sponsorState.activeMuteSegment && sponsorState.muteRestoreState !== null) {
      video.muted = sponsorState.muteRestoreState;
    }
    sponsorState.activeMuteSegment = null;
    sponsorState.muteRestoreState = null;
    sponsorState.manualMuteSegmentUUID = '';
  }

  function resetSponsorState() {
    const video = getVideoElement();
    restoreMuteState(video);

    sponsorState.currentVideoId = '';
    sponsorState.fetchedForVideoId = '';
    sponsorState.fetching = false;
    sponsorState.segments = [];
    sponsorState.fetchError = '';
    sponsorState.lastHandledUUID = '';
    sponsorState.lastHandledAt = 0;
    sponsorState.lastAutoPoiUUID = '';
    sponsorState.reportedUUIDs.clear();
    sponsorState.markersRenderedForKey = '';
    sponsorState.lastDuration = 0;
    sponsorState.playerBadgeState = 'idle';

    clearSponsorUI();
    setPlayerBadge('idle', 'SB');
  }

  function normalizeSponsorSegmentsFromResponse(data, videoId) {
    if (!Array.isArray(data)) return [];

    const out = [];
    const seen = new Set();

    for (const videoEntry of data) {
      if (!videoEntry || videoEntry.videoID !== videoId || !Array.isArray(videoEntry.segments)) continue;

      for (const item of videoEntry.segments) {
        if (!item || !Array.isArray(item.segment)) continue;

        const start = Number(item.segment[0] || 0);
        const endRaw = Number(item.segment[1] || 0);
        const category = String(item.category || '');
        const actionType = String(item.actionType || 'skip');
        const UUID = String(item.UUID || '');

        if (!UUID || seen.has(UUID)) continue;
        seen.add(UUID);

        const isPoint = actionType === 'poi' || Math.abs(endRaw - start) < 0.001;
        const end = isPoint ? start : endRaw;

        out.push({
          UUID,
          category,
          actionType,
          start: Math.max(0, start),
          end: Math.max(0, end),
          votes: Number(item.votes || 0),
          locked: Number(item.locked || 0),
          description: typeof item.description === 'string' ? item.description : '',
          videoDuration: Number(item.videoDuration || 0),
          isPoint
        });
      }
    }

    return out.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return a.end - b.end;
    });
  }

  function buildSponsorFetchUrls(prefix, categories) {
    const actionTypes = ['skip', 'mute', 'full', 'poi'];

    const url1 = new URL(`https://sponsor.ajay.app/api/skipSegments/${prefix}`);
    url1.searchParams.set('service', 'YouTube');
    for (const category of categories) url1.searchParams.append('category', category);
    for (const actionType of actionTypes) url1.searchParams.append('actionType', actionType);

    const url2 = new URL(`https://sponsor.ajay.app/api/skipSegments/${prefix}`);
    url2.searchParams.set('service', 'YouTube');
    for (const category of categories) url2.searchParams.append('categories', category);
    for (const actionType of actionTypes) url2.searchParams.append('actionTypes', actionType);

    const url3 = new URL(`https://sponsor.ajay.app/api/skipSegments/${prefix}`);
    url3.searchParams.set('service', 'YouTube');
    url3.searchParams.set('categories', JSON.stringify(categories));
    url3.searchParams.set('actionTypes', JSON.stringify(actionTypes));

    return [url1, url2, url3];
  }

  async function fetchSponsorSegments(videoId) {
    if (!videoId || !sbSettings.enabled) {
      sponsorState.segments = [];
      sponsorState.fetchError = '';
      renderSponsorMarkers();
      return;
    }

    const categories = getEnabledSBCategories();
    if (!categories.length) {
      sponsorState.segments = [];
      sponsorState.fetchError = '';
      sponsorState.fetchedForVideoId = videoId;
      setPlayerBadge('none', 'SB');
      renderSponsorMarkers();
      return;
    }

    if (sponsorState.fetching) return;
    if (sponsorState.fetchedForVideoId === videoId) return;

    sponsorState.fetching = true;
    sponsorState.fetchError = '';
    setPlayerBadge('loading', 'SB');

    try {
      const hash = await sha256Hex(videoId);
      const prefix = hash.slice(0, 4);
      const urls = buildSponsorFetchUrls(prefix, categories);

      let successData = null;
      let lastError = null;

      for (const url of urls) {
        const response = await fetch(url.toString(), {
          method: 'GET',
          credentials: 'omit'
        });

        if (response.status === 404) {
          sponsorState.segments = [];
          sponsorState.fetchError = '';
          sponsorState.fetchedForVideoId = videoId;
          sponsorState.currentVideoId = videoId;
          sponsorState.markersRenderedForKey = '';
          renderSponsorMarkers();
          updateSkipButton(null);
          setPlayerBadge('none', 'SB');
          sponsorState.fetching = false;
          return;
        }

        if (response.ok) {
          successData = await response.json();
          lastError = null;
          break;
        }

        lastError = new Error(`SponsorBlock HTTP ${response.status}`);
        if (response.status !== 400) break;
      }

      if (!successData) {
        throw lastError || new Error('SponsorBlock request failed');
      }

      sponsorState.segments = normalizeSponsorSegmentsFromResponse(successData, videoId);
      sponsorState.fetchError = '';
      sponsorState.fetchedForVideoId = videoId;
      sponsorState.currentVideoId = videoId;
      sponsorState.markersRenderedForKey = '';
      renderSponsorMarkers();

      if (sponsorState.segments.length) {
        setPlayerBadge('ready', 'SB');
      } else {
        setPlayerBadge('none', 'SB');
      }
    } catch (error) {
      sponsorState.segments = [];
      sponsorState.fetchError = String(error && error.message ? error.message : error);
      sponsorState.fetchedForVideoId = videoId;
      sponsorState.currentVideoId = videoId;
      sponsorState.markersRenderedForKey = '';
      renderSponsorMarkers();
      setPlayerBadge('error', 'SB');
      console.debug('[YouTube Cleaner] SponsorBlock fetch failed:', error);
    } finally {
      sponsorState.fetching = false;
    }
  }

  function reportSponsorViewed(uuid) {
    if (!uuid || sponsorState.reportedUUIDs.has(uuid)) return;
    sponsorState.reportedUUIDs.add(uuid);

    const url = new URL('https://sponsor.ajay.app/api/viewedVideoSponsorTime');
    url.searchParams.set('UUID', uuid);

    fetch(url.toString(), {
      method: 'POST',
      credentials: 'omit',
      keepalive: true
    }).catch(() => {});
  }

  function getMarkerHost() {
    const host =
      document.querySelector('.ytp-chapter-hover-container .ytp-progress-list') ||
      document.querySelector('.ytp-progress-list') ||
      document.querySelector('.ytp-progress-bar');

    if (!host) return null;

    const computed = getComputedStyle(host);
    if (computed.position === 'static') {
      host.style.position = 'relative';
    }

    host.style.overflow = 'visible';
    return host;
  }

  function removeMarkerLayer() {
    const existing = document.getElementById('yt-cleaner-sb-marker-layer');
    if (existing) existing.remove();
  }

  function getMarkerRenderKey(duration) {
    const visible = sponsorState.segments
      .filter(seg => getSBMode(seg.category) !== 'off')
      .map(seg => `${seg.UUID}:${seg.start}:${seg.end}:${seg.category}:${seg.actionType}`)
      .join('|');

    return `${duration}|${sbSettings.showSeekBarSegments}|${visible}`;
  }

  function renderSponsorMarkers() {
    const host = getMarkerHost();
    const video = getVideoElement();
    const existing = document.getElementById('yt-cleaner-sb-marker-layer');

    if (!host || !video || !Number.isFinite(video.duration) || video.duration <= 0 || !sbSettings.enabled || !sbSettings.showSeekBarSegments) {
      removeMarkerLayer();
      sponsorState.markersRenderedForKey = '';
      return;
    }

    const key = getMarkerRenderKey(video.duration);

    if (
      sponsorState.markersRenderedForKey === key &&
      existing &&
      existing.parentElement === host
    ) {
      return;
    }

    sponsorState.markersRenderedForKey = key;
    removeMarkerLayer();

    const layer = create('div', { id: 'yt-cleaner-sb-marker-layer' });

    for (const seg of sponsorState.segments) {
      if (getSBMode(seg.category) === 'off') continue;

      const color = sbColor(seg.category);

      if (seg.isPoint) {
        const leftPct = clamp((seg.start / video.duration) * 100, 0, 100);

        const marker = create('div', {
          className: 'yt-cleaner-sb-marker yt-cleaner-sb-point',
          title: sbLabel(seg.category),
          style: {
            left: `${leftPct}%`,
            background: color
          }
        });

        layer.appendChild(marker);
        continue;
      }

      const start = clamp(seg.start / video.duration, 0, 1);
      const end = clamp(seg.end / video.duration, 0, 1);

      let leftPct = start * 100;
      let widthPct = (end - start) * 100;

      if (seg.actionType === 'full') {
        leftPct = 0;
        widthPct = 100;
      }

      if (widthPct <= 0) continue;

      const marker = create('div', {
        className: `yt-cleaner-sb-marker ${seg.actionType === 'full' ? 'yt-cleaner-sb-full' : ''}`,
        title: sbLabel(seg.category),
        style: {
          left: `${leftPct}%`,
          width: `${widthPct}%`,
          background: color
        }
      });

      layer.appendChild(marker);
    }

    host.appendChild(layer);
  }

  function getSeekableManualSegment(currentTime) {
    for (const seg of sponsorState.segments) {
      const mode = getSBMode(seg.category);
      if (mode !== 'manual') continue;

      if (seg.actionType === 'poi') {
        if (currentTime + 0.2 < seg.start) return seg;
        continue;
      }

      if (seg.actionType === 'full') {
        if (currentTime < 3) return seg;
        continue;
      }

      if (currentTime >= seg.start && currentTime < seg.end) {
        return seg;
      }
    }
    return null;
  }

  function getAutoSegment(currentTime) {
    for (const seg of sponsorState.segments) {
      const mode = getSBMode(seg.category);
      if (mode !== 'auto') continue;

      if (seg.actionType === 'poi') {
        if (currentTime > 0.25 && currentTime + 0.1 < seg.start) return seg;
        continue;
      }

      if (seg.actionType === 'full') {
        if (currentTime < 3) return seg;
        continue;
      }

      if (currentTime >= Math.max(0, seg.start - 0.12) && currentTime < seg.end - 0.03) {
        return seg;
      }
    }
    return null;
  }

  function getActiveMuteSegment(currentTime) {
    for (const seg of sponsorState.segments) {
      if (seg.actionType !== 'mute') continue;
      if (getSBMode(seg.category) !== 'auto' && sponsorState.manualMuteSegmentUUID !== seg.UUID) continue;

      if (currentTime >= seg.start && currentTime < seg.end) {
        return seg;
      }
    }
    return null;
  }

  function beginMutedSegment(video, segment) {
    if (!video || !segment) return;

    if (sponsorState.activeMuteSegment && sponsorState.activeMuteSegment.UUID === segment.UUID) {
      if (!video.muted) video.muted = true;
      return;
    }

    if (!sponsorState.activeMuteSegment) {
      sponsorState.muteRestoreState = video.muted;
    }

    sponsorState.activeMuteSegment = segment;
    video.muted = true;
  }

  function endMutedSegment(video) {
    if (!video || !sponsorState.activeMuteSegment) return;

    if (sponsorState.muteRestoreState !== null) {
      video.muted = sponsorState.muteRestoreState;
    }

    reportSponsorViewed(sponsorState.activeMuteSegment.UUID);
    sponsorState.activeMuteSegment = null;
    sponsorState.muteRestoreState = null;
    sponsorState.manualMuteSegmentUUID = '';
  }

  function executeSegmentAction(segment) {
    const video = getVideoElement();
    if (!video || !segment) return;

    if (segment.actionType === 'mute') {
      sponsorState.manualMuteSegmentUUID = segment.UUID;
      beginMutedSegment(video, segment);
      showSponsorToast(`SponsorBlock: muted ${sbLabel(segment.category)}`);
      return;
    }

    if (segment.actionType === 'poi') {
      sponsorState.lastHandledUUID = segment.UUID;
      sponsorState.lastHandledAt = Date.now();
      sponsorState.lastAutoPoiUUID = segment.UUID;
      video.currentTime = Math.max(0, segment.start);
      showSponsorToast(`SponsorBlock: til ${sbLabel(segment.category).toLowerCase()}`);
      reportSponsorViewed(segment.UUID);
      return;
    }

    if (segment.actionType === 'full') {
      sponsorState.lastHandledUUID = segment.UUID;
      sponsorState.lastHandledAt = Date.now();

      const nextBtn = document.querySelector('.ytp-next-button:not([aria-disabled="true"])');
      if (nextBtn) {
        nextBtn.click();
        showSponsorToast('SponsorBlock: sprang video over');
      } else if (Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = Math.max(0, video.duration - 0.2);
        showSponsorToast('SponsorBlock: sprang til slutningen');
      }

      reportSponsorViewed(segment.UUID);
      return;
    }

    const now = Date.now();
    if (sponsorState.lastHandledUUID === segment.UUID && (now - sponsorState.lastHandledAt) < 900) {
      return;
    }

    sponsorState.lastHandledUUID = segment.UUID;
    sponsorState.lastHandledAt = now;

    const duration = Number.isFinite(video.duration) ? video.duration : segment.end;
    const target = clamp(segment.end + 0.01, 0, duration || segment.end + 0.01);

    if (target > video.currentTime) {
      video.currentTime = target;
      showSponsorToast(`SponsorBlock: sprang ${sbLabel(segment.category).toLowerCase()} over`);
      reportSponsorViewed(segment.UUID);
    }
  }

  function updateSkipButton(segment) {
    let btn = document.getElementById('yt-cleaner-sb-skip-btn');

    if (!sbSettings.enabled || !sbSettings.showSkipButton) {
      if (btn) {
        btn.removeAttribute('data-show');
        btn.style.display = 'none';
      }
      return;
    }

    const player = getPlayerElement();
    if (!player) return;

    if (!btn) {
      btn = create('button', {
        id: 'yt-cleaner-sb-skip-btn',
        type: 'button'
      });
      player.appendChild(btn);
    }

    if (!segment) {
      btn.removeAttribute('data-show');
      btn.style.display = 'none';
      btn.onclick = null;
      return;
    }

    clearChildren(btn);
    btn.appendChild(createSvgIcon(SB_SKIP_PATH, { width: 18, height: 18 }));

    let label = 'Spring over';
    if (segment.actionType === 'poi') {
      label = 'Til højdepunkt';
    } else if (segment.actionType === 'mute') {
      label = `Mute ${sbLabel(segment.category).toLowerCase()}`;
    } else if (segment.actionType === 'full') {
      label = 'Spring video over';
    } else {
      label = `Spring ${sbLabel(segment.category).toLowerCase()} over`;
    }

    btn.appendChild(create('span', { textContent: label }));
    btn.onclick = () => executeSegmentAction(segment);
    btn.setAttribute('data-show', 'true');
    btn.style.display = 'inline-flex';
  }

  function sponsorTick() {
    const video = getVideoElement();
    const videoId = getCurrentVideoId();

    if (!videoId || !video || !window.location.pathname.startsWith('/watch')) {
      updateSkipButton(null);
      removeMarkerLayer();
      sponsorState.markersRenderedForKey = '';
      injectPlayerBadge();
      setPlayerBadge('idle', 'SB');
      return;
    }

    injectPlayerBadge();

    if (!sbSettings.enabled) {
      updateSkipButton(null);
      removeMarkerLayer();
      sponsorState.markersRenderedForKey = '';
      setPlayerBadge('off', 'SB');
      return;
    }

    if (videoId !== sponsorState.fetchedForVideoId && !sponsorState.fetching) {
      fetchSponsorSegments(videoId);
    }

    if (Number.isFinite(video.duration) && video.duration > 0 && sponsorState.lastDuration !== video.duration) {
      sponsorState.lastDuration = video.duration;
      sponsorState.markersRenderedForKey = '';
      renderSponsorMarkers();
    }

    const currentTime = Number(video.currentTime || 0);
    if (!Number.isFinite(currentTime)) return;

    const activeMute = getActiveMuteSegment(currentTime);
    if (activeMute) {
      beginMutedSegment(video, activeMute);
    } else if (sponsorState.activeMuteSegment) {
      endMutedSegment(video);
    }

    if (!video.seeking) {
      const autoSeg = getAutoSegment(currentTime);
      if (autoSeg) {
        if (autoSeg.actionType === 'poi') {
          if (sponsorState.lastAutoPoiUUID !== autoSeg.UUID) {
            executeSegmentAction(autoSeg);
          }
        } else if (autoSeg.actionType !== 'mute') {
          executeSegmentAction(autoSeg);
        }
      }
    }

    const manualSeg = getSeekableManualSegment(currentTime);
    updateSkipButton(manualSeg);

    if (sponsorState.fetchError) {
      setPlayerBadge('error', 'SB');
    } else if (sponsorState.fetching) {
      setPlayerBadge('loading', 'SB');
    } else if (!sponsorState.segments.length) {
      setPlayerBadge('none', 'SB');
    } else {
      setPlayerBadge('ready', `SB: ${sponsorState.segments.length}`);
    }
  }

  function startSponsorTicker() {
    if (sponsorState.tickTimer) return;
    sponsorState.tickTimer = window.setInterval(sponsorTick, 150);
  }

  // ─────────────────────────────────────────────────────────────
  //  SponsorBlock settings modal
  // ─────────────────────────────────────────────────────────────

  function closeSBSettingsModal() {
    const overlay = document.getElementById('yt-cleaner-sb-settings-overlay');
    if (overlay) overlay.remove();
  }

  function openSBSettingsModal() {
    closeSBSettingsModal();

    const overlay = create('div', {
      id: 'yt-cleaner-sb-settings-overlay',
      onclick: (e) => {
        if (e.target === overlay) closeSBSettingsModal();
      }
    });

    const modal = create('div', {
      id: 'yt-cleaner-sb-settings-modal',
      role: 'dialog',
      ariaModal: 'true'
    });

    const header = create('div', { className: 'yt-cleaner-sb-modal-header' });
    const titleWrap = create('div', { className: 'yt-cleaner-sb-modal-title-wrap' });

    const modalIcon = create('div', { className: 'yt-cleaner-sb-modal-icon' }, [
      createSvgIcon(SB_GEAR_PATH, { width: 30, height: 30 })
    ]);

    const titleBlock = create('div', {}, [
      create('div', {
        className: 'yt-cleaner-sb-modal-title',
        textContent: 'SponsorBlock'
      }),
      create('div', {
        className: 'yt-cleaner-sb-modal-subtitle',
        textContent: sponsorState.fetchError
          ? `Status: error (${sponsorState.fetchError})`
          : sponsorState.fetching
            ? 'Status: loading'
            : sponsorState.segments.length
              ? `Status: ${sponsorState.segments.length} segmenter på denne video`
              : 'Status: ingen segmenter på denne video'
      })
    ]);

    titleWrap.appendChild(modalIcon);
    titleWrap.appendChild(titleBlock);

    const closeBtn = create('button', {
      className: 'yt-cleaner-sb-close-btn',
      type: 'button',
      textContent: 'Luk',
      onclick: closeSBSettingsModal
    });

    header.appendChild(titleWrap);
    header.appendChild(closeBtn);

    const content = create('div', { className: 'yt-cleaner-sb-content' });

    const generalSection = create('div', { className: 'yt-cleaner-sb-section' }, [
      create('div', { className: 'yt-cleaner-sb-section-title', textContent: 'Generelt' })
    ]);

    const generalGrid = create('div', { className: 'yt-cleaner-sb-grid' });
    const toggleRefs = {};

    const toggles = [
      ['enabled', 'Aktivér SponsorBlock', 'Tænd/sluk hele SponsorBlock-laget'],
      ['showPlayerChromeButton', 'Vis SB i player chrome', 'Fast indikator ved siden af Indstillinger-knappen'],
      ['showSeekBarSegments', 'Vis segmenter på seek bar', 'Farvede markeringer i playerens tidslinje'],
      ['showSkipButton', 'Vis skip-knap', 'Vis manuel skip-knap når et segment er aktivt'],
      ['showToast', 'Vis toast-beskeder', 'Korte beskeder når noget bliver sprunget over'],
      ['showMenuEntry', 'Vis menu-entry', 'Vis SponsorBlock i kontomenuen']
    ];

    for (const [key, label, desc] of toggles) {
      const input = create('input', {
        type: 'checkbox',
        checked: !!sbSettings[key]
      });
      toggleRefs[key] = input;

      const card = create('div', { className: 'yt-cleaner-sb-card' }, [
        create('div', { className: 'yt-cleaner-sb-toggle-row' }, [
          create('div', { className: 'yt-cleaner-sb-label-wrap' }, [
            create('div', { className: 'yt-cleaner-sb-label', textContent: label }),
            create('div', { className: 'yt-cleaner-sb-desc', textContent: desc })
          ]),
          create('label', { className: 'yt-cleaner-sb-switch' }, [
            input,
            create('span', { className: 'yt-cleaner-sb-switch-track' }, [
              create('span', { className: 'yt-cleaner-sb-switch-thumb' })
            ])
          ])
        ])
      ]);

      generalGrid.appendChild(card);
    }

    generalSection.appendChild(generalGrid);

    const categorySection = create('div', { className: 'yt-cleaner-sb-section' }, [
      create('div', { className: 'yt-cleaner-sb-section-title', textContent: 'Kategorier' })
    ]);

    const categoryGrid = create('div', { className: 'yt-cleaner-sb-grid' });
    const categoryRefs = {};

    for (const [key, meta] of Object.entries(SB_CATEGORY_META)) {
      const select = create('select', { className: 'yt-cleaner-sb-select' }, [
        create('option', { value: 'off', textContent: 'Fra' }),
        create('option', { value: 'manual', textContent: 'Manuel' }),
        create('option', { value: 'auto', textContent: 'Auto' })
      ]);
      select.value = getSBMode(key);
      categoryRefs[key] = select;

      const card = create('div', { className: 'yt-cleaner-sb-card' }, [
        create('div', { className: 'yt-cleaner-sb-category-row' }, [
          create('div', { className: 'yt-cleaner-sb-label-wrap' }, [
            create('div', { className: 'yt-cleaner-sb-label' }, [
              create('span', {
                className: 'yt-cleaner-sb-color-dot',
                style: { background: meta.color }
              }),
              create('span', { textContent: meta.label })
            ]),
            create('div', { className: 'yt-cleaner-sb-desc', textContent: meta.description })
          ]),
          select
        ])
      ]);

      categoryGrid.appendChild(card);
    }

    categorySection.appendChild(categoryGrid);

    const noteSection = create('div', { className: 'yt-cleaner-sb-section' }, [
      create('div', { className: 'yt-cleaner-sb-section-title', textContent: 'Info' }),
      create('div', {
        className: 'yt-cleaner-sb-note',
        textContent: 'Denne userscript-version giver runtime-UI, player badge, markeringer, skip-knap og indstillinger. Submit, voting og konto-flow fra den fulde extension er ikke med.'
      })
    ]);

    content.appendChild(generalSection);
    content.appendChild(categorySection);
    content.appendChild(noteSection);

    const footer = create('div', { className: 'yt-cleaner-sb-footer' });

    const resetBtn = create('button', {
      className: 'yt-cleaner-sb-secondary-btn',
      type: 'button',
      textContent: 'Standard',
      onclick: () => {
        sbSettings = deepClone(SB_DEFAULT_SETTINGS);
        saveSBSettings();
        closeSBSettingsModal();
        openSBSettingsModal();
        sponsorState.fetchedForVideoId = '';
        sponsorState.markersRenderedForKey = '';
        queueClean();
        fetchSponsorSegments(getCurrentVideoId());
      }
    });

    const saveBtn = create('button', {
      className: 'yt-cleaner-sb-primary-btn',
      type: 'button',
      textContent: 'Gem',
      onclick: () => {
        const next = deepClone(sbSettings);

        for (const [key, input] of Object.entries(toggleRefs)) {
          next[key] = !!input.checked;
        }

        for (const [key, select] of Object.entries(categoryRefs)) {
          next.categoryModes[key] = select.value;
        }

        sbSettings = normalizeSBSettings(next);
        saveSBSettings();

        sponsorState.fetchedForVideoId = '';
        sponsorState.markersRenderedForKey = '';
        sponsorState.fetchError = '';

        queueClean();
        fetchSponsorSegments(getCurrentVideoId());
        renderSponsorMarkers();
        injectPlayerBadge();
        closeSBSettingsModal();
      }
    });

    footer.appendChild(resetBtn);
    footer.appendChild(saveBtn);

    modal.appendChild(header);
    modal.appendChild(content);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.documentElement.appendChild(overlay);

    const escHandler = (e) => {
      if (e.key === 'Escape') {
        closeSBSettingsModal();
        document.removeEventListener('keydown', escHandler, true);
      }
    };

    document.addEventListener('keydown', escHandler, true);
  }

  // ─────────────────────────────────────────────────────────────
  //  SponsorBlock account menu entry
  // ─────────────────────────────────────────────────────────────

  function getAccountMenuItemsContainer() {
    const candidates = document.querySelectorAll('div#items.style-scope.yt-multi-page-menu-section-renderer');
    for (const el of candidates) {
      const menu = el.closest('ytd-multi-page-menu-renderer, tp-yt-paper-dialog, ytd-popup-container');
      if (!menu) continue;

      const rect = menu.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return el;
      }
    }
    return null;
  }

  function injectSBMenuEntry() {
    const existing = document.getElementById('yt-cleaner-sb-menu-entry');

    if (!sbSettings.showMenuEntry) {
      if (existing) existing.remove();
      return;
    }

    const container = getAccountMenuItemsContainer();
    if (!container) return;

    if (existing && existing.parentElement === container) return;
    if (existing) existing.remove();

    const subtitle = !sbSettings.enabled
      ? 'Slået fra'
      : sponsorState.fetchError
        ? 'Error'
        : sponsorState.fetching
          ? 'Loader…'
          : sponsorState.segments.length
            ? `${sponsorState.segments.length} segmenter`
            : 'Ingen segmenter';

    const entry = create('div', {
      id: 'yt-cleaner-sb-menu-entry',
      role: 'button',
      tabIndex: 0,
      onclick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        openSBSettingsModal();
      },
      onkeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openSBSettingsModal();
        }
      }
    }, [
      create('div', { id: 'yt-cleaner-sb-menu-entry-icon' }, [
        createSvgIcon(SB_GEAR_PATH, { width: 24, height: 24 })
      ]),
      create('div', { id: 'yt-cleaner-sb-menu-entry-text' }, [
        create('div', { id: 'yt-cleaner-sb-menu-entry-label', textContent: 'SponsorBlock' }),
        create('div', { id: 'yt-cleaner-sb-menu-entry-subtitle', textContent: subtitle })
      ])
    ]);

    container.appendChild(entry);
  }

  // ─────────────────────────────────────────────────────────────
  //  Cleaner
  // ─────────────────────────────────────────────────────────────

  const SELECTORS = [
    'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
    'ytd-rich-shelf-renderer[is-shorts]',
    'ytd-reel-shelf-renderer',
    'ytm-shorts-lockup-view-model',
    'ytm-shorts-lockup-view-model-v2',
    'ytd-ad-slot-renderer',
    'ytd-in-feed-ad-layout-renderer',
    'ytd-promoted-video-renderer',
    'ytd-banner-promo-renderer',
    'square-image-layout-view-model',
    'ytd-watch-next-secondary-results-renderer',
    'ytd-merch-shelf-renderer',
    'ytd-shelf-renderer',
    'ytd-radio-renderer',
    'ytd-mix-renderer',
    'ytd-mealbar-promo-renderer',
    'ytd-premium-yva-upsell-renderer'
  ];

  function hide(el) {
    if (el) el.style.setProperty('display', 'none', 'important');
  }

  function cleanDOM() {
    injectCSS();
    redirectShorts();

    for (const sel of SELECTORS) {
      try {
        document.querySelectorAll(sel).forEach(hide);
      } catch (_) {}
    }

    document.querySelectorAll('ytd-mini-guide-entry-renderer, ytd-guide-entry-renderer').forEach(el => {
      if (el.querySelector('a[href="/shorts/"]')) hide(el);
    });

    document.querySelectorAll('a[href*="/shorts/"]').forEach(a => {
      const card = a.closest(
        'ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer'
      );
      if (card) hide(card);
    });

    document.querySelectorAll('[is-promoted]').forEach(el => {
      const card = el.closest('ytd-rich-item-renderer');
      if (card) hide(card);
    });

    hide(document.querySelector('#secondary.ytd-watch-flexy'));
    hide(document.querySelector('ytd-watch-next-secondary-results-renderer'));
    hide(document.querySelector('#secondary-inner.ytd-watch-flexy'));

    const primary = document.querySelector('#primary.ytd-watch-flexy');
    if (primary) {
      primary.style.setProperty('max-width', '100%', 'important');
      primary.style.setProperty('margin-right', '0', 'important');
    }

    injectToggleButton();
    applyCommentVisibility();

    injectSBMenuEntry();
    injectPlayerBadge();

    sponsorState.markersRenderedForKey = '';
    renderSponsorMarkers();
  }

  const scheduleClean = debounceFrame(() => {
    cleanScheduled = false;
    cleanDOM();
  });

  function queueClean() {
    if (cleanScheduled) return;
    cleanScheduled = true;
    scheduleClean();
  }

  const rerenderSponsorMarkersSoon = debounceFrame(() => {
    sponsorState.markersRenderedForKey = '';
    renderSponsorMarkers();
  });

  // ─────────────────────────────────────────────────────────────
  //  Navigation handling
  // ─────────────────────────────────────────────────────────────

  function onRouteChange(force = false) {
    if (!force && location.href === lastUrl) return;
    lastUrl = location.href;

    resetSponsorState();

    queueClean();
    setTimeout(queueClean, 250);
    setTimeout(queueClean, 1000);
    setTimeout(queueClean, 2500);

    const videoId = getCurrentVideoId();
    if (videoId && sbSettings.enabled) {
      setTimeout(() => {
        fetchSponsorSegments(videoId);
      }, 300);
    } else {
      setPlayerBadge('idle', 'SB');
    }
  }

  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function (...args) {
    const result = originalPushState(...args);
    onRouteChange();
    return result;
  };

  history.replaceState = function (...args) {
    const result = originalReplaceState(...args);
    onRouteChange();
    return result;
  };

  window.addEventListener('popstate', onRouteChange);
  document.addEventListener('yt-navigate-finish', () => onRouteChange(true), true);
  document.addEventListener('yt-page-data-updated', () => onRouteChange(true), true);

  // ─────────────────────────────────────────────────────────────
  //  Boot / observers
  // ─────────────────────────────────────────────────────────────

  new MutationObserver(() => {
    queueClean();
    rerenderSponsorMarkersSoon();
  }).observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  document.addEventListener('DOMContentLoaded', () => {
    queueClean();
    setTimeout(queueClean, 500);
    setTimeout(queueClean, 1500);
    setTimeout(queueClean, 3000);
  });

  window.addEventListener('load', () => {
    queueClean();
    setTimeout(queueClean, 1000);
    setTimeout(queueClean, 3000);
  });

  window.addEventListener('resize', () => {
    sponsorState.markersRenderedForKey = '';
    renderSponsorMarkers();
  });

  // ─────────────────────────────────────────────────────────────
  //  Initial run
  // ─────────────────────────────────────────────────────────────

  redirectShorts();
  queueClean();
  startSponsorTicker();

  const initialVideoId = getCurrentVideoId();
  if (initialVideoId && sbSettings.enabled) {
    setTimeout(() => {
      fetchSponsorSegments(initialVideoId);
    }, 300);
  } else {
    setPlayerBadge('idle', 'SB');
  }
})();
