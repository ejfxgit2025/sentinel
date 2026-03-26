console.log('[SENTINEL] CONTENT ACTIVE');

// Top-level state
let lastType = 'neutral';
let currentGoal = '';

// Keep goal updated
function syncGoal() {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
    if (state && state.userGoal) {
      currentGoal = state.userGoal;
    }
  });
}
syncGoal();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_PAGE') {
    sendResponse({
      url: window.location.href,
      title: document.title
    });
  } else if (request.type === 'SHOW_BORDER') {
    showBorder(request.level);
  } else if (request.type === 'CLEAR_WARNING') {
    clearWarning();
  } else if (request.type === 'STATE_UPDATED') {
    if (request.state && request.state.userGoal) {
      currentGoal = request.state.userGoal;
    }
  }
});

function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, "");
}

function getScore(goal, text) {
  if (!goal) return 0;

  const words = normalize(goal).split(" ").filter(w => w.trim() !== "");
  if (words.length === 0) return 0;

  const content = normalize(text);

  let match = 0;

  words.forEach(w => {
    if (w.length > 2 && content.includes(w)) {
      match++;
    } else if (w.length <= 2 && content.includes(` ${w} `)) { // somewhat handle short words
      match++;
    }
  });

  return (match / words.length) * 100;
}

function detectPage() {
  const title = document.title;
  const url = location.href;
  const goal = currentGoal || '';

  const combined = title + ' ' + url;
  const score = getScore(goal, combined);

  // Per spec: low risk → focus, medium/high risk → waste
  // Map keyword score: >= 50 → focus, < 50 → waste
  // If no goal set yet, treat as neutral (don't count anything)
  let type = 'neutral';
  if (goal.trim().length > 0) {
    type = score >= 50 ? 'focus' : 'waste';
  }

  sendClassification(type);
}

function sendClassification(type) {
  // Always send — don't gate on lastType so background is always in sync
  lastType = type;

  chrome.runtime.sendMessage({
    type: 'UPDATE_PAGE_TYPE',
    pageType: type
  }).catch(() => { });
}

// fast loop
setInterval(detectPage, 1500);

// Keep background worker alive
setInterval(() => {
  chrome.runtime.sendMessage({ type: "HEARTBEAT" }).catch(() => { });
}, 20000);

// 2. Instant Navigation Detection
let lastDetectedUrl = location.href;
setInterval(() => {
  if (location.href !== lastDetectedUrl) {
    lastDetectedUrl = location.href;
    detectPage();
  }
}, 500);
// ──────────────────────────────────────────────────────────────────────────────

// ─── Time-based enforcement ───────────────────────────────────────────────────
// Enforcement logic in content.js is now fully message-driven from background.js.
// We only keep the initialization wrapper to handle the AI score warning audio if needed.
(function initEnforcement() {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
    if (chrome.runtime.lastError || !state || !state.isMonitoring) return;

    const isDistraction = state.currentPageScore < 50;

    if (isDistraction) {
      if (!state.distractionStartTime) {
        // Notification handled by background; just a redundant safety check
      }
    }
  });
})();

// ─── Core distraction check ──────────────────────────────────────────────────
// Timer removed: background.js handles the 2-minute strict mode limit and sends BLOCK_AND_REDIRECT message.

// ─── SPA navigation detection (e.g. YouTube, Google) ─────────────────────────
let _lastSentinelUrl = location.href;
new MutationObserver(() => {
  if (location.href !== _lastSentinelUrl) {
    _lastSentinelUrl = location.href;
    // On SPA navigation, we rely on the normal tab updated events (which trigger background.js performScan)
  }
}).observe(document, { subtree: true, childList: true });

// ─── Warning Border System ────────────────────────────────────────────────────
function showBorder(level) {
  let border = document.getElementById('sentinel-border-warning');
  if (!border) {
    border = document.createElement('div');
    border.id = 'sentinel-border-warning';
    
    // Add pulsing animation style
    let style = document.getElementById('sentinel-border-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'sentinel-border-style';
      style.textContent = `
        @keyframes sentinelPulse {
          0% { box-shadow: inset 0 0 20px rgba(255,0,60,0.6); }
          50% { box-shadow: inset 0 0 80px rgba(255,0,60,1); }
          100% { box-shadow: inset 0 0 20px rgba(255,0,60,0.6); }
        }
        @keyframes sentinelPulseMedium {
          0% { box-shadow: inset 0 0 10px rgba(255,120,0,0.5); }
          50% { box-shadow: inset 0 0 40px rgba(255,120,0,0.9); }
          100% { box-shadow: inset 0 0 10px rgba(255,120,0,0.5); }
        }
      `;
      document.head.appendChild(style);
    }

    border.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 2147483647;
      box-sizing: border-box;
    `;
    document.documentElement.appendChild(border);
  }

  if (level === 'medium') {
    border.style.border = '4px solid rgba(255,120,0,0.8)';
    border.style.boxShadow = 'inset 0 0 30px rgba(255,120,0,0.7)';
    border.style.animation = 'sentinelPulseMedium 1s infinite';
  } else if (level === 'high') {
    border.style.border = '6px solid rgba(255,0,60,0.95)';
    border.style.boxShadow = 'inset 0 0 60px rgba(255,0,60,0.9)';
    border.style.animation = 'sentinelPulse 1s infinite';
  }
}

function clearWarning() {
  const border = document.getElementById('sentinel-border-warning');
  if (border) border.remove();
}

// ─── Voice helper ─────────────────────────────────────────────────────────────
function speak(text) {
  chrome.runtime.sendMessage({ type: 'PLAY_VOICE_CMD', text }).catch(() => { });
}
