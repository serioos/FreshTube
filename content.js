(() => {
  'use strict';

  const DEFAULT_SETTINGS = {
    enabled: true,
    maxAgeValue: 1,
    maxAgeUnit: 'weeks', // hours | days | weeks | months | years
    scopes: {
      home: true,
      watchSidebar: true,
      subscriptions: false,
      search: false,
      channel: false
    },
    keepLiveAndUpcoming: true
  };

  const UNIT_TO_HOURS = {
    minutes: 1 / 60,
    hours: 1,
    days: 24,
    weeks: 24 * 7,
    months: 24 * 30,
    years: 24 * 365
  };

  const CARD_SELECTORS = [
    'ytd-rich-item-renderer',
    'ytd-compact-video-renderer',
    'ytd-video-renderer',
    'ytd-grid-video-renderer',
    'yt-lockup-view-model',
    'ytm-rich-item-renderer',
    'ytm-video-with-context-renderer',
    'ytm-compact-video-renderer'
  ].join(', ');

  const METADATA_SELECTORS = [
    '#metadata-line span',
    '#metadata-line',
    'span.inline-metadata-item',
    'span.ytd-video-meta-block',
    '#meta span',
    '#meta yt-formatted-string',
    'yt-content-metadata-view-model span',
    '.yt-content-metadata-view-model__metadata-text',
    '.yt-content-metadata-view-model-wiz__metadata-text',
    'yt-lockup-metadata-view-model span',
    'span.yt-core-attributed-string',
    '.ytm-badge-and-byline-item-byline',
    '[class*="metadata"] span',
    '[id*="metadata"] span'
  ].join(', ');

  const TITLE_EXCLUDE_SELECTOR =
    '#video-title, #video-title-link, h3, .yt-lockup-metadata-view-model__title, a#video-title';

  let settings = structuredClone(DEFAULT_SETTINGS);
  let hiddenCount = 0;
  let sweepScheduled = false;
  let observer = null;

  /**
   * Convert settings threshold into hours.
   */
  function getMaxAgeHours(cfg) {
    const val = Number(cfg.maxAgeValue);
    const mult = UNIT_TO_HOURS[cfg.maxAgeUnit] || UNIT_TO_HOURS.weeks;
    if (!Number.isFinite(val) || val <= 0) {
      return 24 * 7;
    }
    return val * mult;
  }

  /**
   * Parse a YouTube relative timestamp string into age in hours.
   * Supports both standard YouTube labels ("2 years ago", "Streamed 3 weeks ago")
   * and compact labels from extensions like Improve YouTube ("2y ago", "3mo ago", "2w ago", "5d ago", "4h ago", "15m ago").
   */
  function parseRelativeAgeHours(rawText) {
    if (!rawText) return null;
    const text = rawText.replace(/\s+/g, ' ').trim();
    if (!text) return null;

    if (/\b(just now|\d+\s*(?:seconds?|secs?|s)\s+ago)\b/i.test(text)) {
      return 0;
    }

    const match = text.match(
      /(?:^|[\s•·|▷,(\-/])(?:(?:streamed|premiered|uploaded|updated|aired)\s+)?(\d+)\s*(years?|yrs?|y|months?|mos?|mons?|M|weeks?|wks?|w|days?|d|hours?|hrs?|h|minutes?|mins?|min|m)\s+ago(?:\b|$)/i
    );
    if (!match) return null;

    const amount = parseInt(match[1], 10);
    if (!Number.isFinite(amount)) return null;

    const unitExact = match[2];
    const unitLower = unitExact.toLowerCase();

    // Case-sensitive disambiguation: uppercase "M" = months, lowercase "m" = minutes
    if (unitExact === 'M') return amount * 24 * 30;
    if (unitLower === 'm' || unitLower === 'min' || unitLower === 'mins' || unitLower === 'minute' || unitLower === 'minutes') {
      return amount / 60;
    }
    if (unitLower === 'h' || unitLower === 'hr' || unitLower === 'hrs' || unitLower === 'hour' || unitLower === 'hours') {
      return amount;
    }
    if (unitLower === 'd' || unitLower === 'day' || unitLower === 'days') {
      return amount * 24;
    }
    if (unitLower === 'w' || unitLower === 'wk' || unitLower === 'wks' || unitLower === 'week' || unitLower === 'weeks') {
      return amount * 24 * 7;
    }
    if (unitLower === 'mo' || unitLower === 'mos' || unitLower === 'mon' || unitLower === 'mons' || unitLower === 'month' || unitLower === 'months') {
      return amount * 24 * 30;
    }
    if (unitLower === 'y' || unitLower === 'yr' || unitLower === 'yrs' || unitLower === 'year' || unitLower === 'years') {
      return amount * 24 * 365;
    }
    return null;
  }

  /**
   * Parse an absolute upload date (e.g., "Nov 12, 2024", "12 Nov 2024", "2024-11-12")
   * in case an extension replaces relative dates with calendar dates.
   */
  function parseAbsoluteDateHours(rawText, nowMs = Date.now()) {
    if (!rawText) return null;
    const text = rawText.replace(/\s+/g, ' ').trim();
    if (!text) return null;

    const patterns = [
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}\b/i,
      /\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/i,
      /\b\d{4}-\d{2}-\d{2}\b/
    ];

    for (const re of patterns) {
      const m = text.match(re);
      if (m) {
        const parsed = Date.parse(m[0]);
        if (Number.isFinite(parsed) && parsed <= nowMs) {
          return (nowMs - parsed) / (1000 * 60 * 60);
        }
      }
    }
    return null;
  }

  function parseAnyAgeHours(rawText, nowMs = Date.now()) {
    const rel = parseRelativeAgeHours(rawText);
    if (rel !== null) return rel;
    return parseAbsoluteDateHours(rawText, nowMs);
  }

  /**
   * Detect if a video card represents an active live stream or scheduled premiere.
   */
  function isLiveOrUpcomingCard(card) {
    if (
      card.querySelector(
        '[overlay-style="LIVE"], [overlay-style="UPCOMING"], .badge-style-type-live-now, .badge-style-type-live-now-alternate, yt-thumbnail-badge-view-model .badge-shape-wiz--live'
      )
    ) {
      return true;
    }
    const text = (card.textContent || '').toLowerCase();
    if (/\bwatching now\b/.test(text) || /\bscheduled for\b/.test(text) || /\bpremieres\b/.test(text)) {
      return true;
    }
    return false;
  }

  /**
   * Determine which YouTube page type we are currently on.
   */
  function getCurrentPageType() {
    const path = window.location.pathname || '/';
    if (path === '/' || path === '/feed/recommended') return 'home';
    if (path.startsWith('/watch')) return 'watch';
    if (path.startsWith('/feed/subscriptions')) return 'subscriptions';
    if (path.startsWith('/results')) return 'search';
    if (
      path.startsWith('/@') ||
      path.startsWith('/channel/') ||
      path.startsWith('/c/') ||
      path.startsWith('/user/')
    ) {
      return 'channel';
    }
    return 'other';
  }

  /**
   * Decide whether a specific card element should be evaluated given the current page & scopes.
   */
  function isCardInActiveScope(card, pageType) {
    const scopes = settings.scopes || DEFAULT_SETTINGS.scopes;

    if (pageType === 'home') {
      return Boolean(scopes.home);
    }
    if (pageType === 'watch') {
      if (!scopes.watchSidebar) return false;
      // Exclude comments, playlist queue, and main player; allow sidebar & relocated related feeds
      if (card.closest('#comments, ytd-comments, ytd-playlist-panel-renderer, #movie_player')) {
        return false;
      }
      return true;
    }
    if (pageType === 'subscriptions') {
      return Boolean(scopes.subscriptions);
    }
    if (pageType === 'search') {
      return Boolean(scopes.search);
    }
    if (pageType === 'channel') {
      return Boolean(scopes.channel);
    }
    return false;
  }

  /**
   * Extract the video age (in hours) from a video card element.
   */
  function extractCardAgeHours(card) {
    // 1. Standard & modern YouTube metadata selectors (skipping title nodes)
    const metadataNodes = card.querySelectorAll(METADATA_SELECTORS);
    for (const node of metadataNodes) {
      if (node.closest && node.closest(TITLE_EXCLUDE_SELECTOR)) continue;
      const age = parseAnyAgeHours(node.textContent);
      if (age !== null) {
        return age;
      }
    }

    // 2. Fallback: aria-label on title link (often includes "... 2 years ago ...")
    const titleLink = card.querySelector(
      'a#video-title-link, a#video-title, a.yt-lockup-metadata-view-model__title, a[aria-label]'
    );
    if (titleLink) {
      const aria = titleLink.getAttribute('aria-label');
      const ageFromAria = parseRelativeAgeHours(aria);
      if (ageFromAria !== null) {
        return ageFromAria;
      }
    }

    // 3. Fallback for custom DOM structures injected by extensions (e.g., Improve YouTube):
    // scan non-title leaf elements inside the card
    const fallbackNodes = card.querySelectorAll('span, div, p, time, yt-formatted-string');
    for (const node of fallbackNodes) {
      if (node.children && node.children.length > 0) continue;
      if (node.closest && node.closest(TITLE_EXCLUDE_SELECTOR)) continue;
      const age = parseAnyAgeHours(node.textContent);
      if (age !== null) {
        return age;
      }
    }

    return null;
  }

  /**
   * Mark or unmark a card as hidden (both via data attribute and inline !important style
   * so other extensions' CSS rules cannot override it).
   */
  function setCardHidden(card, shouldHide) {
    if (shouldHide) {
      if (card.dataset.freshtubeHidden !== 'true') {
        card.dataset.freshtubeHidden = 'true';
      }
      if (card.style && card.style.getPropertyValue('display') !== 'none') {
        card.style.setProperty('display', 'none', 'important');
      }
    } else {
      if (card.dataset.freshtubeHidden) {
        delete card.dataset.freshtubeHidden;
        if (card.style && card.style.getPropertyValue('display') === 'none') {
          card.style.removeProperty('display');
        }
      }
    }
  }

  /**
   * Sweep the DOM and apply recency filtering.
   */
  function sweep() {
    sweepScheduled = false;
    const cards = document.querySelectorAll(CARD_SELECTORS);
    const pageType = getCurrentPageType();
    const maxAgeHours = getMaxAgeHours(settings);
    let count = 0;

    for (const card of cards) {
      try {
        // Avoid double-hiding nested yt-lockup-view-model inside ytd-rich-item-renderer
        if (
          card.tagName.toLowerCase() === 'yt-lockup-view-model' &&
          card.parentElement &&
          card.parentElement.closest('ytd-rich-item-renderer')
        ) {
          setCardHidden(card, false);
          continue;
        }

        if (!settings.enabled || !isCardInActiveScope(card, pageType)) {
          setCardHidden(card, false);
          continue;
        }

        if (settings.keepLiveAndUpcoming && isLiveOrUpcomingCard(card)) {
          setCardHidden(card, false);
          continue;
        }

        const ageHours = extractCardAgeHours(card);
        if (ageHours !== null && ageHours > maxAgeHours) {
          setCardHidden(card, true);
          count += 1;
        } else {
          setCardHidden(card, false);
        }
      } catch (_err) {
        // Never allow a single malformed node to interrupt the sweep
      }
    }

    hiddenCount = count;
  }

  function scheduleSweep() {
    if (sweepScheduled) return;
    sweepScheduled = true;
    window.requestAnimationFrame(sweep);
  }

  function mergeSettings(raw) {
    return {
      ...DEFAULT_SETTINGS,
      ...(raw || {}),
      scopes: {
        ...DEFAULT_SETTINGS.scopes,
        ...((raw && raw.scopes) || {})
      }
    };
  }

  function loadSettingsAndStart() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
        settings = mergeSettings(stored);
        scheduleSweep();
      });

      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync') return;
        const updated = { ...settings, scopes: { ...settings.scopes } };
        for (const [key, change] of Object.entries(changes)) {
          updated[key] = change.newValue;
        }
        settings = mergeSettings(updated);
        scheduleSweep();
      });
    } else {
      scheduleSweep();
    }

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message && message.type === 'FRESHTUBE_GET_STATUS') {
          sweep();
          sendResponse({
            hiddenCount,
            pageType: getCurrentPageType(),
            enabled: settings.enabled
          });
          return true;
        }
        return false;
      });
    }

    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      scheduleSweep();
    });
    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // Periodic fallback sweep for async DOM/text rewrites by other extensions
    if (typeof setInterval === 'function' && !(typeof globalThis !== 'undefined' && globalThis.__FRESHTUBE_TEST__)) {
      setInterval(() => {
        if (!document.hidden) {
          scheduleSweep();
        }
      }, 1500);
    }

    // YouTube SPA navigation events
    window.addEventListener('yt-navigate-finish', scheduleSweep);
    window.addEventListener('yt-page-data-updated', scheduleSweep);
    window.addEventListener('popstate', scheduleSweep);
  }

  // Expose parser for automated unit testing in Node/JSDOM environments if needed
  if (typeof globalThis !== 'undefined' && globalThis.__FRESHTUBE_TEST__) {
    globalThis.__FRESHTUBE_EXPORTS__ = {
      parseRelativeAgeHours,
      parseAbsoluteDateHours,
      parseAnyAgeHours,
      getMaxAgeHours,
      mergeSettings,
      DEFAULT_SETTINGS
    };
  }

  loadSettingsAndStart();
})();
