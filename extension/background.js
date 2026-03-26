console.log('[SENTINEL] Background service worker initialized.');

const BACKEND_URL = 'http://localhost:3001';
const FALLBACK_SECRET = 'sentinel-123';

let state = {
  userGoal: '',
  strictMode: false,
  isMonitoring: false,   // ← must be explicitly started
  focusTime: 0,
  wastedTime: 0,
  sessionStart: Date.now(),
  distractionCount: 0,
  currentPageScore: 100,
  allowedSites: [],
  taskList: [],
  urlHistory: [],
  memoryLog: [],
  lastScanTime: Date.now(),
  secretKey: '',
  // Time-based enforcement
  distractionStartTime: null,
  warningShown: false,
  currentTaskURL: '',
  activeWarningTimer: null,
  // Single timer engine
  currentMode: 'neutral',
  lastSafeUrl: '',
  safeUrlHistory: [],
  currentPageType: 'neutral',
  lastTick: Date.now()
};

// Load state from storage
chrome.storage.local.get(['sentinelState', 'SENTINEL_SECRET', 'strictMode'], (result) => {
  if (result.sentinelState) {
    state = { ...state, ...result.sentinelState };
  }
  // Top-level strictMode key overrides sentinelState (more frequently updated)
  if (typeof result.strictMode === 'boolean') {
    state.strictMode = result.strictMode;
  }
  if (result.SENTINEL_SECRET) {
    state.secretKey = result.SENTINEL_SECRET;
  }
  // Safe default — ensure currentMode is always valid
  if (!state.currentMode) {
    state.currentMode = 'neutral';
  }
  state.lastTick = Date.now();
  console.log('[STRICT MODE]', state.strictMode);
});

// ─── SINGLE TIMER ENGINE ──────────────────────────────────────────────────────
setInterval(() => {
  if (!state.isMonitoring) return;

  if (state.currentMode === 'focus') {
    state.focusTime += 5000;
  } else if (state.currentMode === 'waste') {
    state.wastedTime += 5000;
  }

  // ─── Strict Mode 2-Minute Timer ─────────────────────────────────────────────
  if (state.strictMode) {
    if (state.currentMode === 'waste') {
      if (!state.activeWarningTimer) {
        state.activeWarningTimer = Date.now();
      } else if (Date.now() - state.activeWarningTimer >= 120000) {
        // Reset the timer since block is triggered
        state.activeWarningTimer = null;
      }
    } else {
      // Not a waste page, reset warning timer
      state.activeWarningTimer = null;
    }
  } else {
    state.activeWarningTimer = null; // Strict mode off, clear timer
  }
  // ────────────────────────────────────────────────────────────────────────────

  // Compute focus score for the UI
  const total = state.focusTime + state.wastedTime;
  const focusScore = total > 0 ? Math.round((state.focusTime / total) * 100) : null;
  state.focusScore = focusScore;

  chrome.storage.local.set({ sentinelState: state });
  // Send STATS_UPDATE
  chrome.runtime.sendMessage({
    type: 'STATS_UPDATE',
    focusTime: state.focusTime,
    wastedTime: state.wastedTime,
    score: focusScore
  }).catch(() => { });
}, 5000);

// Keep strictMode in sync whenever popup or sidepanel toggle changes it
async function enforceStrictMode(tabId, isStrict) {
  try {
    let targetTab = null;
    if (tabId) {
      targetTab = await chrome.tabs.get(tabId).catch(() => null);
    }
    if (!targetTab) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      targetTab = tabs[0];
    }
    if (targetTab && targetTab.id) {
      if (isStrict) {
        performScan(targetTab);
      } else {
        chrome.tabs.sendMessage(targetTab.id, { type: 'CLEAR_WARNING' }).catch(() => { });
      }
    }
  } catch (err) {
    console.error('[SENTINEL] enforceStrictMode error:', err);
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.strictMode) {
    state.strictMode = changes.strictMode.newValue;
    console.log('[STRICT MODE] Storage changed →', state.strictMode);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTabId = tabs[0] ? tabs[0].id : null;
      enforceStrictMode(activeTabId, state.strictMode);
    });
  }
});

function saveState() {
  chrome.storage.local.set({ sentinelState: state });
  chrome.runtime.sendMessage({ type: 'STATE_UPDATED', state }).catch(() => { });
}

function getEffectiveKey() {
  return state.secretKey || FALLBACK_SECRET;
}

function getEffectiveGoal() {
  return state.userGoal || 'general productivity';
}

function getRedirectUrl() {
  const last = state.lastSafeUrl || '';
  if (last && last.startsWith('http')) {
    return last;
  }
  return 'chrome://newtab';
}

// Setup alarm-based scan (every 15s — Chrome MV3 minimum is 1 minute, use tab events + content msgs instead)
chrome.alarms.create('scanPage', { periodInMinutes: 0.5 }); // 30 seconds fallback scan

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'scanPage') {
    performScan();
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    performScan(tab);
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab.status === 'complete') {
      performScan(tab);
    }
  });
});

// Always inject content script before sending a tab message
async function sendToTab(tabId, message) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    console.error('[SENTINEL] INJECTION FAILED:', err);
  }
}

async function getPageData(tabId) {
  try {
    // inject content script ALWAYS
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });

    // small delay to ensure script loads
    await new Promise(r => setTimeout(r, 300));

    // request data from content
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'GET_PAGE'
    });

    console.log('[SENTINEL] GOT PAGE:', response);
    return response;
  } catch (err) {
    console.error('[SENTINEL] SCRIPT NOT READY:', err);
    return null;
  }
}

async function performScan(targetTab = null) {
  if (!state.isMonitoring) return; // only run when user has started a session
  try {
    let tab = targetTab;
    if (!tab) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tab = tabs[0];
    }

    if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) return;

    // Add to history
    if (state.urlHistory[state.urlHistory.length - 1] !== tab.url) {
      state.urlHistory.push(tab.url);
      if (state.urlHistory.length > 10) state.urlHistory.shift();
    }

    const page = await getPageData(tab.id);
    if (!page) return;

    await analyzePageData(page, tab.id);
  } catch (error) {
    console.error('[SENTINEL] Scan error:', error);
  }
}

async function analyzePageData(pageData, tabId) {
  try {
    console.log('[SENTINEL] RECEIVED PAGE DATA — calling backend for:', pageData.url);

    const effectiveKey = getEffectiveKey();
    const effectiveGoal = getEffectiveGoal();

    const res = await fetch(`${BACKEND_URL}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sentinel-key': effectiveKey
      },
      body: JSON.stringify({
        url: pageData.url,
        pageTitle: pageData.title,
        pageText: pageData.text,
        userGoal: effectiveGoal,
        strictMode: state.strictMode,
        history: state.urlHistory.slice(-3)
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[SENTINEL] Backend returned error:', res.status, errText);
      return;
    }

    const analysis = await res.json();
    console.log('[SENTINEL] BACKEND RESULT:', analysis.score, analysis.status, analysis.message);
    console.log('[STRICT MODE]', state.strictMode);
    console.log('[ANALYSIS RESULT]', analysis);

    state.currentPageScore = analysis.score;

    const status = (analysis.status || '').toLowerCase();
    
    // Map: aligned -> focus, warning -> waste, off-track -> waste
    if (status === 'aligned') {
      state.currentMode = 'focus';
      if (state.distractionStartTime !== null) {
        state.distractionStartTime = null;
        state.warningShown = false;
        saveState();
      }
    } else if (status === 'warning' || status === 'off-track') {
      state.currentMode = 'waste';
    }

    if (status === 'off-track') {
      state.distractionCount++; // keep existing stat logic
    }

    if (state.strictMode === true) {
      if (status === 'aligned') {
        state.lastSafeUrl = pageData.url;
        chrome.storage.local.set({ lastSafeUrl: pageData.url });
        sendToTab(tabId, { type: 'CLEAR_WARNING' });
      } else if (status === 'warning') {
        sendToTab(tabId, { type: 'SHOW_BORDER', level: 'medium' });
      } else if (status === 'off-track') {
        sendToTab(tabId, { type: 'SHOW_BORDER', level: 'high' });
        setTimeout(() => {
          if (state.lastSafeUrl) {
            chrome.tabs.update(tabId, { url: state.lastSafeUrl });
          }
        }, 1200);
      }
    } else {
      // STRICT MODE = OFF
      if (status === 'aligned') {
        sendToTab(tabId, { type: 'CLEAR_WARNING' });
      } else if (status === 'warning') {
        sendToTab(tabId, { type: 'SHOW_BORDER', level: 'medium' });
      } else if (status === 'off-track') {
        sendToTab(tabId, { type: 'SHOW_BORDER', level: 'high' });
      }
    }

    // Log memory
    state.memoryLog.push({ url: pageData.url, score: analysis.score, timestamp: Date.now() });
    if (state.memoryLog.length > 100) state.memoryLog.shift();

    saveState();

    // Send AI_RESULT to sidepanel (includes pageTitle for display)
    const resultPayload = { ...analysis, pageTitle: pageData.title };
    chrome.runtime.sendMessage({ type: 'AI_RESULT', data: resultPayload }).catch(() => { });

  } catch (error) {
    console.error('[SENTINEL] Analyze page data error:', error);
  }
}

async function playVoice(text) {
  chrome.runtime.sendMessage({ type: 'PLAY_VOICE_CMD', text }).catch(() => { });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_STATE') {
    sendResponse(state);
  } else if (request.type === 'SET_GOAL') {
    state.userGoal = request.goal;
    state.currentTaskURL = request.taskURL || '';
    state.isMonitoring = true;
    state.sessionStart = Date.now();
    state.focusTime = 0;
    state.wastedTime = 0;
    state.distractionCount = 0;
    state.distractionStartTime = null;
    state.warningShown = false;
    saveState();
    sendResponse({ success: true });
  } else if (request.type === 'SET_STRICT_MODE') {
    const value = request.value !== undefined ? request.value : request.strictMode;
    state.strictMode = value;
    chrome.storage.local.set({ strictMode: value });
    saveState();

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTabId = tabs[0] ? tabs[0].id : null;
      enforceStrictMode(activeTabId, value);
    });

    sendResponse({ success: true });
  } else if (request.type === 'SET_SECRET') {
    state.secretKey = request.secret;
    chrome.storage.local.set({ SENTINEL_SECRET: request.secret });
    sendResponse({ success: true });
  } else if (request.type === 'ADD_TASK') {
    state.taskList.push({ id: Date.now(), text: request.text, done: false });
    saveState();
    sendResponse({ success: true });
  } else if (request.type === 'COMPLETE_TASK') {
    const task = state.taskList.find(t => t.id === request.id);
    if (task) task.done = request.done;
    saveState();
    sendResponse({ success: true });
  } else if (request.type === 'STOP_MONITORING') {
    state.isMonitoring = false;
    saveState();
    sendResponse({ success: true });
  } else if (request.type === 'START_DISTRACTION_TIMER') {
    if (state.distractionStartTime === null) {
      state.distractionStartTime = request.time;
      state.warningShown = true;
      saveState();
    }
    sendResponse({ success: true });
  } else if (request.type === 'RESET_TIMER') {
    state.distractionStartTime = null;
    state.warningShown = false;
    saveState();
    sendResponse({ success: true });
  } else if (request.type === 'UPDATE_PAGE_TYPE') {
    state.currentMode = request.pageType;
    sendResponse({ success: true });
  } else if (request.type === 'RESET_SESSION') {
    state.focusTime = 0;
    state.wastedTime = 0;
    state.sessionStart = Date.now();
    state.distractionCount = 0;
    state.distractionStartTime = null;
    state.warningShown = false;
    state.currentMode = 'neutral';
    saveState();
    sendResponse({ success: true });
  } else if (request.type === 'DELETE_TASK') {
    state.taskList = state.taskList.filter(t => t.id !== request.id);
    saveState();
    sendResponse(state); // return full state so popup can sync
  }
  return true;
});
