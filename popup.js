(() => {
  'use strict';

  const DEFAULT_SETTINGS = {
    enabled: true,
    maxAgeValue: 1,
    maxAgeUnit: 'weeks',
    scopes: {
      home: true,
      watchSidebar: true,
      subscriptions: false,
      search: false,
      channel: false
    },
    keepLiveAndUpcoming: true
  };

  const els = {
    enabledToggle: document.getElementById('enabledToggle'),
    maxAgeValue: document.getElementById('maxAgeValue'),
    maxAgeUnit: document.getElementById('maxAgeUnit'),
    summaryHint: document.getElementById('summaryHint'),
    scopeHome: document.getElementById('scopeHome'),
    scopeWatchSidebar: document.getElementById('scopeWatchSidebar'),
    scopeSubscriptions: document.getElementById('scopeSubscriptions'),
    scopeSearch: document.getElementById('scopeSearch'),
    scopeChannel: document.getElementById('scopeChannel'),
    keepLiveAndUpcoming: document.getElementById('keepLiveAndUpcoming'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    saveIndicator: document.getElementById('saveIndicator'),
    resetBtn: document.getElementById('resetBtn'),
    presetButtons: Array.from(document.querySelectorAll('.preset-btn'))
  };

  function formatUnitLabel(value, unit) {
    const singular = unit.replace(/s$/, '');
    return value === 1 ? singular : unit;
  }

  function updateSummaryAndPresets() {
    const val = Math.max(1, parseInt(els.maxAgeValue.value, 10) || 1);
    const unit = els.maxAgeUnit.value;

    if (!els.enabledToggle.checked) {
      els.summaryHint.textContent = 'Filtering is currently paused.';
    } else {
      els.summaryHint.textContent = `Hiding recommendations older than ${val} ${formatUnitLabel(val, unit)}.`;
    }

    for (const btn of els.presetButtons) {
      const matches =
        Number(btn.dataset.value) === val && btn.dataset.unit === unit;
      btn.classList.toggle('selected', matches);
    }
  }

  function collectSettings() {
    const parsedVal = parseInt(els.maxAgeValue.value, 10);
    return {
      enabled: els.enabledToggle.checked,
      maxAgeValue: Number.isFinite(parsedVal) && parsedVal >= 1 ? parsedVal : 1,
      maxAgeUnit: els.maxAgeUnit.value,
      scopes: {
        home: els.scopeHome.checked,
        watchSidebar: els.scopeWatchSidebar.checked,
        subscriptions: els.scopeSubscriptions.checked,
        search: els.scopeSearch.checked,
        channel: els.scopeChannel.checked
      },
      keepLiveAndUpcoming: els.keepLiveAndUpcoming.checked
    };
  }

  function applySettingsToUI(cfg) {
    els.enabledToggle.checked = Boolean(cfg.enabled);
    els.maxAgeValue.value = cfg.maxAgeValue;
    els.maxAgeUnit.value = cfg.maxAgeUnit;
    els.scopeHome.checked = Boolean(cfg.scopes.home);
    els.scopeWatchSidebar.checked = Boolean(cfg.scopes.watchSidebar);
    els.scopeSubscriptions.checked = Boolean(cfg.scopes.subscriptions);
    els.scopeSearch.checked = Boolean(cfg.scopes.search);
    els.scopeChannel.checked = Boolean(cfg.scopes.channel);
    els.keepLiveAndUpcoming.checked = Boolean(cfg.keepLiveAndUpcoming);
    updateSummaryAndPresets();
  }

  function refreshActiveTabStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.url || !/^https:\/\/(www|m)\.youtube\.com\//.test(tab.url)) {
        els.statusDot.className = 'status-dot';
        els.statusText.textContent = 'Open YouTube to see live filter status';
        return;
      }

      chrome.tabs.sendMessage(tab.id, { type: 'FRESHTUBE_GET_STATUS' }, (resp) => {
        if (chrome.runtime.lastError || !resp) {
          els.statusDot.className = 'status-dot';
          els.statusText.textContent = 'Reload this YouTube tab to activate';
          return;
        }
        if (!resp.enabled) {
          els.statusDot.className = 'status-dot paused';
          els.statusText.textContent = 'Paused on this YouTube tab';
          return;
        }
        els.statusDot.className = 'status-dot active';
        const n = resp.hiddenCount || 0;
        els.statusText.textContent =
          n === 1
            ? 'Active — 1 old video hidden on this tab'
            : `Active — ${n} old videos hidden on this tab`;
      });
    });
  }

  let saveTimer = null;
  function saveSettings() {
    const cfg = collectSettings();
    updateSummaryAndPresets();
    chrome.storage.sync.set(cfg, () => {
      els.saveIndicator.textContent = 'Saved';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        els.saveIndicator.textContent = 'Saved automatically';
      }, 1200);
      setTimeout(refreshActiveTabStatus, 120);
    });
  }

  // Bind events
  for (const btn of els.presetButtons) {
    btn.addEventListener('click', () => {
      els.maxAgeValue.value = btn.dataset.value;
      els.maxAgeUnit.value = btn.dataset.unit;
      saveSettings();
    });
  }

  [
    els.enabledToggle,
    els.maxAgeUnit,
    els.scopeHome,
    els.scopeWatchSidebar,
    els.scopeSubscriptions,
    els.scopeSearch,
    els.scopeChannel,
    els.keepLiveAndUpcoming
  ].forEach((el) => el.addEventListener('change', saveSettings));

  els.maxAgeValue.addEventListener('input', () => {
    const val = parseInt(els.maxAgeValue.value, 10);
    if (Number.isFinite(val) && val >= 1) {
      saveSettings();
    }
  });

  els.resetBtn.addEventListener('click', () => {
    applySettingsToUI(DEFAULT_SETTINGS);
    saveSettings();
  });

  // Initialize
  chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
    const merged = {
      ...DEFAULT_SETTINGS,
      ...stored,
      scopes: {
        ...DEFAULT_SETTINGS.scopes,
        ...(stored.scopes || {})
      }
    };
    applySettingsToUI(merged);
    refreshActiveTabStatus();
  });
})();
