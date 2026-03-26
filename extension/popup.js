// ============================================================
//  SENTINEL POPUP — complete state-driven rewrite
// ============================================================

let state = {
  currentTask: '',
  tasks: [],
  isRunning: false,
  isMonitoring: false,
  distractionCount: 0,
  strictMode: false
};

// Request microphone access
navigator.mediaDevices.getUserMedia({ audio: true }).catch(err => console.log("Mic error:", err));

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
    // Manually push to state and render so the UI updates
    state.currentTask = text;
    render();
  }
};

recognition.onerror = (e) => {
  console.log("Mic error:", e);
};

// ── DOM refs ──────────────────────────────────────────────
const goalInput = document.getElementById('goal-input');
const toggleSwitch = document.getElementById('toggle-switch');
const activateBtn = document.getElementById('activate-btn');
const openPanelBtn = document.getElementById('open-panel');
const missionFeedback = document.getElementById('mission-feedback');
const statusDot = document.querySelector('.live-dot');
const statusText = document.querySelector('.status-text');
const statusIndicator = document.querySelector('.status-indicator');
const taskInput = document.getElementById('task-input');
const addTaskBtn = document.getElementById('add-task-btn');
const popupTaskList = document.getElementById('popup-task-list');
const distractCount = document.getElementById('distraction-count');

// ── Render (single source of truth → DOM) ─────────────────
function render() {
  // Goal input
  goalInput.value = state.currentTask;
  goalInput.disabled = state.isRunning;

  // Mission feedback
  if (state.currentTask.trim()) {
    missionFeedback.classList.add('visible');
  } else {
    missionFeedback.classList.remove('visible');
  }

  // Main button
  const btnText = activateBtn.querySelector('.btn-text');
  if (state.isRunning) {
    btnText.textContent = 'STOP MONITORING';
    activateBtn.classList.add('stop-mode');
    activateBtn.classList.remove('success-state', 'loading');
  } else {
    btnText.textContent = 'START FOCUS';
    activateBtn.classList.remove('stop-mode', 'loading');
  }

  // Status indicator (header pill)
  if (state.isRunning) {
    statusDot.style.background = '#00ff88';
    statusDot.style.boxShadow = '0 0 8px #00ff88';
    statusText.textContent = 'LIVE';
    statusText.style.color = '#00ff88';
    statusIndicator.style.background = 'rgba(0,255,136,0.1)';
    statusIndicator.style.border = '1px solid rgba(0,255,136,0.3)';
  } else {
    statusDot.style.background = '#ff0000';
    statusDot.style.boxShadow = '0 0 8px #ff0000';
    statusText.textContent = 'STANDBY';
    statusText.style.color = '#ff3333';
    statusIndicator.style.background = 'rgba(255,0,0,0.1)';
    statusIndicator.style.border = '1px solid rgba(255,0,0,0.3)';
  }

  // Strict mode toggle
  if (state.strictMode) {
    toggleSwitch.classList.add('active');
  } else {
    toggleSwitch.classList.remove('active');
  }

  // Goal input style while running
  if (state.isRunning) {
    goalInput.style.opacity = '0.5';
    goalInput.style.cursor = 'not-allowed';
  } else {
    goalInput.style.opacity = '1';
    goalInput.style.cursor = 'text';
  }

  // Distraction count
  if (distractCount) {
    distractCount.textContent = state.distractionCount;
  }

  // Task list
  renderTasks();
}

// ── Task list renderer ─────────────────────────────────────
function renderTasks() {
  if (!popupTaskList) return;
  popupTaskList.innerHTML = '';

  if (state.tasks.length === 0) {
    popupTaskList.innerHTML = '<li class="task-empty">No tasks yet.</li>';
    return;
  }

  state.tasks.forEach(task => {
    const li = document.createElement('li');
    li.className = `popup-task-item${task.done ? ' done' : ''}`;
    li.innerHTML = `
      <input type="checkbox" data-id="${task.id}" ${task.done ? 'checked' : ''}>
      <span class="task-text">${escapeHtml(task.text)}</span>
      <button class="task-delete-btn" data-id="${task.id}" title="Delete task">✕</button>
    `;
    popupTaskList.appendChild(li);
  });

  // Checkbox toggle
  popupTaskList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', e => {
      const id = parseInt(e.target.getAttribute('data-id'));
      const task = state.tasks.find(t => t.id === id);
      if (task) {
        task.done = e.target.checked;
        chrome.runtime.sendMessage({ type: 'COMPLETE_TASK', id, done: task.done });
        render();
      }
    });
  });

  // Delete buttons
  popupTaskList.querySelectorAll('.task-delete-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = parseInt(e.currentTarget.getAttribute('data-id'));
      deleteTask(id);
    });
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Delete task — always via background → storage → state sync ─────────────
function deleteTask(id) {
  chrome.runtime.sendMessage({ type: 'DELETE_TASK', id }, (newState) => {
    if (newState && newState.taskList !== undefined) {
      // Sync from persisted background state
      state.tasks = newState.taskList;
      state.distractionCount = newState.distractionCount || 0;
    }
    render();
  });
}

// ── Load state from background on popup open ──────────────
document.addEventListener('DOMContentLoaded', () => {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (bgState) => {
    if (bgState) {
      state.currentTask = bgState.userGoal || '';
      state.tasks = bgState.taskList || [];
      state.isRunning = bgState.isMonitoring || false;
      state.isMonitoring = bgState.isMonitoring || false;
      state.distractionCount = bgState.distractionCount || 0;
      state.strictMode = bgState.strictMode || false;
    }
    chrome.storage.local.get(['strictMode'], (res) => {
      if (typeof res.strictMode === 'boolean') {
        state.strictMode = res.strictMode;
      }
      render();
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.strictMode) {
      state.strictMode = changes.strictMode.newValue;
      render();
    }
  });

  // ── Goal input handler ───────────────────────────────────
  goalInput.addEventListener('input', () => {
    state.currentTask = goalInput.value;
    render();
  });

  const micBtn = document.getElementById("mic-btn");
  if (micBtn) {
    micBtn.addEventListener("click", startListening);
  }

  // ── Strict mode toggle ───────────────────────────────────
  toggleSwitch.addEventListener('click', () => {
    state.strictMode = !state.strictMode;
    chrome.storage.local.set({ strictMode: state.strictMode });
    chrome.runtime.sendMessage({ type: 'SET_STRICT_MODE', value: state.strictMode });
    render();
  });

  // ── Main button (START / STOP) ───────────────────────────
  activateBtn.addEventListener('click', () => {
    if (state.isRunning) {
      // ── STOP ──
      chrome.runtime.sendMessage({ type: 'STOP_MONITORING' }, () => {
        state.isRunning = false;
        state.isMonitoring = false;
        render();
      });
    } else {
      // ── START ──
      const goal = goalInput.value.trim();
      if (!goal) {
        goalInput.focus();
        goalInput.classList.add('input-error');
        setTimeout(() => goalInput.classList.remove('input-error'), 800);
        return;
      }
      state.currentTask = goal;

      const btnText = activateBtn.querySelector('.btn-text');
      const loadingText = activateBtn.querySelector('.loading-text');
      activateBtn.classList.add('loading');
      btnText.style.opacity = '0';
      if (loadingText) loadingText.style.opacity = '1';

      chrome.runtime.sendMessage({ type: 'SET_GOAL', goal }, () => {
        chrome.runtime.sendMessage({ type: 'SET_STRICT_MODE', value: state.strictMode }, () => {
          state.isRunning = true;
          state.isMonitoring = true;

          activateBtn.classList.remove('loading');
          if (loadingText) loadingText.style.opacity = '0';
          btnText.style.opacity = '1';
          render();
        });
      });
    }
  });

  // ── Add task (inline) ────────────────────────────────────
  function addTask() {
    const text = taskInput ? taskInput.value.trim() : '';
    if (!text) return;

    const newTask = { id: Date.now(), text, done: false };
    state.tasks.push(newTask);
    chrome.runtime.sendMessage({ type: 'ADD_TASK', text });
    taskInput.value = '';
    render();
  }

  if (addTaskBtn) {
    addTaskBtn.addEventListener('click', addTask);
  }

  if (taskInput) {
    taskInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') addTask();
    });
  }

  // ── Open sidepanel ───────────────────────────────────────
  openPanelBtn.addEventListener('click', () => {
    chrome.windows.getCurrent({ populate: true }, (win) => {
      chrome.sidePanel.open({ windowId: win.id });
    });
  });

  // ── Ripple effects ───────────────────────────────────────
  [activateBtn, openPanelBtn].forEach(btn => {
    btn.addEventListener('mousedown', function (e) {
      const ripple = document.createElement('div');
      ripple.classList.add('ripple');
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
      this.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
  });
});
