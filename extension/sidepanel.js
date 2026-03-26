const BACKEND_URL = 'http://localhost:3001';
const SECRET = 'sentinel-123'; // Hardcoded — no user input needed

// DOM Elements
const goalDisplay = document.getElementById('goal-display');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const statusCard = document.getElementById('status-card');
const scoreRingProgress = document.getElementById('score-ring-progress');
const scoreValue = document.getElementById('score-value');
const statusLabel = document.getElementById('status-label');
const pageTitle = document.getElementById('page-title');
const aiMessage = document.getElementById('ai-message');
const focusTimeEl = document.getElementById('focus-time');
const wastedTimeEl = document.getElementById('wasted-time');
const taskListEl = document.getElementById('task-list');
const suggestionText = document.getElementById('suggestion-text');
const strictModeBtn = document.getElementById('strict-mode-btn');
const speakBtn = document.getElementById('speak-btn');
const voiceWave = document.getElementById('voice-wave');
const micBtn = document.getElementById('mic-btn');
const addTaskBtn = document.getElementById('add-task-btn');

// Modal Elements
const sessionModal = document.getElementById('session-modal');
const modalTotalTime = document.getElementById('modal-total-time');
const modalFocusTime = document.getElementById('modal-focus-time');
const modalWastedTime = document.getElementById('modal-wasted-time');
const modalDistractions = document.getElementById('modal-distractions');
const newSessionBtn = document.getElementById('new-session-btn');

// Request microphone access on load (needed for speech recognition)
navigator.mediaDevices.getUserMedia({ audio: true })
  .then(() => console.log('[SENTINEL] MIC OK'))
  .catch(err => console.error('[SENTINEL] MIC ERROR', err));

function updateUI(state) {
  if (!state) return;

  goalDisplay.textContent = state.userGoal || 'Not Set (Use Popup)';

  // Focus score = focusTime / (focusTime + wastedTime) × 100
  // focusScore may be pre-computed by background, or we compute it here
  const totalTime = state.focusTime + state.wastedTime;
  let focusPercent;
  if (typeof state.focusScore === 'number') {
    focusPercent = state.focusScore;
  } else if (totalTime > 0) {
    focusPercent = Math.round((state.focusTime / totalTime) * 100);
  } else {
    focusPercent = null; // no data yet
  }

  progressBar.style.width = `${focusPercent ?? 0}%`;
  progressText.textContent = focusPercent !== null ? `${focusPercent}% FOCUS SCORE` : '—% FOCUS SCORE';

  const focusScoreDisplay = document.getElementById('focus-score-display');
  if (focusScoreDisplay) {
    focusScoreDisplay.textContent = focusPercent !== null ? `${focusPercent}%` : '—';
  }

  // Update Score Ring (page relevance score, separate from focus score)
  const score = state.currentPageScore;
  scoreValue.textContent = score;
  const offset = 283 - (score / 100 * 283);
  scoreRingProgress.style.strokeDashoffset = offset;

  // Update Time display (Xm Ys format)
  focusTimeEl.textContent = formatTime(state.focusTime);
  wastedTimeEl.textContent = formatTime(state.wastedTime);

  // Strict Mode
  strictModeBtn.textContent = `⚙️ STRICT: ${state.strictMode ? 'ON' : 'OFF'}`;
  if (state.strictMode) strictModeBtn.classList.add('active');
  else strictModeBtn.classList.remove('active');

  // Monitoring stopped banner
  if (state.isMonitoring === false) {
    statusLabel.textContent = 'STATUS: ⏸ MONITORING STOPPED';
    statusLabel.style.color = '#888';
  }

  // Render Tasks
  renderTasks(state.taskList || []);
}

function formatTime(ms) {
  // To make the UI feel alive, let's show seconds if under an hour, or just keep it simple with h/m/s
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  
  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  return `${m}m ${s}s`;
}

function renderTasks(tasks) {
  taskListEl.innerHTML = '';
  if (!tasks || tasks.length === 0) {
    taskListEl.innerHTML = '<div style="color:#555;font-size:12px;text-align:center;padding:8px 0;">No tasks added yet.</div>';
    return;
  }
  tasks.forEach(task => {
    const div = document.createElement('div');
    div.className = `task-item ${task.done ? 'done' : ''}`;
    div.style.cssText = 'display:flex;align-items:center;gap:8px;';
    div.innerHTML = `
      <input type="checkbox" ${task.done ? 'checked' : ''} data-id="${task.id}">
      <span style="flex:1;">${task.text.replace(/</g,'&lt;')}</span>
      <button class="task-del-btn" data-id="${task.id}" style="background:none;border:none;color:#555;cursor:pointer;font-size:13px;padding:0 2px;" title="Delete">✕</button>
    `;
    taskListEl.appendChild(div);
  });

  taskListEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = parseInt(e.target.getAttribute('data-id'));
      chrome.runtime.sendMessage({ type: 'COMPLETE_TASK', id, done: e.target.checked });
    });
  });

  taskListEl.querySelectorAll('.task-del-btn').forEach(btn => {
    btn.addEventListener('mouseenter', e => e.target.style.color = '#ff6b6b');
    btn.addEventListener('mouseleave', e => e.target.style.color = '#555');
    btn.addEventListener('click', e => {
      const id = parseInt(e.currentTarget.getAttribute('data-id'));
      chrome.runtime.sendMessage({ type: 'DELETE_TASK', id });
      // Remove locally for instant feedback
      e.currentTarget.closest('.task-item').remove();
    });
  });
}

// Listen for updates from background
chrome.runtime.onMessage.addListener((request) => {
  if (request.type === 'STATE_UPDATED') {
    updateUI(request.state);
  } else if (request.type === 'STATS_UPDATE') {
    focusTimeEl.textContent = formatTime(request.focusTime);
    wastedTimeEl.textContent = formatTime(request.wastedTime);
    const totalTime = request.focusTime + request.wastedTime;
    let focusPercent;
    if (typeof request.score === 'number') {
      focusPercent = request.score;
    } else if (totalTime > 0) {
      focusPercent = Math.round((request.focusTime / totalTime) * 100);
    } else {
      focusPercent = null;
    }
    progressBar.style.width = `${focusPercent ?? 0}%`;
    progressText.textContent = focusPercent !== null ? `${focusPercent}% FOCUS SCORE` : '—% FOCUS SCORE';
    const focusScoreDisplay = document.getElementById('focus-score-display');
    if (focusScoreDisplay) {
        focusScoreDisplay.textContent = focusPercent !== null ? `${focusPercent}%` : '—';
    }
  } else if (request.type === 'ANALYSIS_RESULT') {
    handleAnalysis(request.analysis);
  } else if (request.type === 'AI_RESULT') {
    // Primary message type sent by background after each page analysis
    console.log('[SENTINEL] UI UPDATED', request.data);
    handleAnalysis(request.data);
  } else if (request.type === 'PLAY_VOICE_CMD') {
    speakMessage(request.text);
  }
});

// Initial load
chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
  updateUI(state);
  chrome.storage.local.get(['strictMode'], (res) => {
    if (typeof res.strictMode === 'boolean' && state) {
      state.strictMode = res.strictMode;
      updateUI(state);
    }
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.strictMode) {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
       if (state) {
         state.strictMode = changes.strictMode.newValue;
         updateUI(state);
       }
    });
  }
});

// Handle new analysis
function handleAnalysis(analysis) {
  if (!analysis || !analysis.status) return;

  statusCard.setAttribute('data-status', analysis.status);

  let statusIcon = '⚪';
  if (analysis.status === 'aligned') statusIcon = '✅';
  if (analysis.status === 'warning') statusIcon = '⚠️';
  if (analysis.status === 'off-track') statusIcon = '⛔';

  statusLabel.textContent = `STATUS: ${statusIcon} ${analysis.status.toUpperCase()}`;

  // Typewriter effect reset
  aiMessage.classList.remove('typewriter');
  void aiMessage.offsetWidth; // trigger reflow
  aiMessage.textContent = analysis.message || '';
  aiMessage.classList.add('typewriter');

  // Update score ring
  if (typeof analysis.score === 'number') {
    scoreValue.textContent = analysis.score;
    const offset = 283 - (analysis.score / 100 * 283);
    scoreRingProgress.style.strokeDashoffset = offset;
  }

  // Update page title — prefer payload value (available instantly), fall back to tabs API
  if (analysis.pageTitle) {
    pageTitle.textContent = analysis.pageTitle;
  } else {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) pageTitle.textContent = tabs[0].title || tabs[0].url;
    });
  }
}

// Voice System
async function speakMessage(text) {
  if (!text) return;
  try {
    voiceWave.classList.add('active');
    const response = await fetch(`${BACKEND_URL}/api/voice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sentinel-key': SECRET
      },
      body: JSON.stringify({ text })
    });

    if (!response.ok) throw new Error('Voice API failed');

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    console.log('[SENTINEL] VOICE PLAYING');
    audio.onended = () => {
      voiceWave.classList.remove('active');
      URL.revokeObjectURL(audioUrl);
    };

    audio.play().catch(() => {
      console.log('[SENTINEL] Audio blocked — user interaction needed first');
      voiceWave.classList.remove('active');
    });
  } catch (error) {
    console.error('[SENTINEL] Voice error:', error);
    voiceWave.classList.remove('active');
  }
}

if (speakBtn) {
  speakBtn.addEventListener('click', () => {
    if (aiMessage && aiMessage.textContent) {
      speakMessage(aiMessage.textContent);
    }
  });
}

// Suggestion System
document.getElementById('get-suggestion-btn').addEventListener('click', async () => {
  suggestionText.textContent = 'Analyzing...';
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, async (state) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sentinel-key': SECRET
        },
        body: JSON.stringify({
          goal: state.userGoal,
          focusTime: state.focusTime,
          wastedTime: state.wastedTime,
          completedTasks: state.taskList.filter(t => t.done).map(t => t.text)
        })
      });
      const data = await response.json();
      suggestionText.innerHTML = `
        <strong>${data.nextStep}</strong><br>
        <span style="opacity:0.7; font-size:0.75rem;">"${data.motivation}"</span>
      `;
    } catch (error) {
      suggestionText.textContent = 'Failed to get suggestion.';
    }
  });
});

// Add Task
if (addTaskBtn) {
  addTaskBtn.addEventListener('click', () => {
    const text = prompt('Enter new task:');
    if (text) {
      chrome.runtime.sendMessage({ type: 'ADD_TASK', text });
    }
  });
}

// Strict Mode Toggle
if (strictModeBtn) {
  strictModeBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
      const newValue = !state.strictMode;
      chrome.storage.local.set({ strictMode: newValue });
      chrome.runtime.sendMessage({ type: 'SET_STRICT_MODE', value: newValue });
    });
  });
}

// Session End Logic
const logoEl = document.querySelector('.logo');
if (logoEl) {
  logoEl.addEventListener('dblclick', () => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
      if (modalTotalTime) modalTotalTime.textContent = formatTime(state.focusTime + state.wastedTime);
      if (modalFocusTime) modalFocusTime.textContent = formatTime(state.focusTime);
      if (modalWastedTime) modalWastedTime.textContent = formatTime(state.wastedTime);
      if (modalDistractions) modalDistractions.textContent = state.distractionCount;
      if (sessionModal) sessionModal.style.display = 'flex';
    });
  });
}

if (newSessionBtn) {
  newSessionBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'RESET_SESSION' }, () => {
      if (sessionModal) sessionModal.style.display = 'none';
    });
  });
}

// Mic System (Web Speech API)
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.lang = "en-US";
recognition.continuous = false;

function startListening() {
  recognition.start();
}

recognition.onresult = (event) => {
  const text = event.results[0][0].transcript;
  
  // Put text into goal input
  const goalInput = document.getElementById("goal-input");
  if (goalInput) {
    goalInput.value = text;
  } else {
    // Sidepanel logic: updating goal directly in background
    chrome.runtime.sendMessage({ type: 'SET_GOAL', goal: text }, () => {
      chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => updateUI(state));
    });
  }
};

recognition.onerror = (e) => {
  console.log("Mic error:", e);
};

if (micBtn) {
  micBtn.addEventListener("click", startListening);
}

