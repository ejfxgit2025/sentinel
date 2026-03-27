# 🚀 Sentinel — AI Focus Guardian

> Control your focus. Or lose it.

Sentinel is an **AI-powered Chrome extension** that monitors your browsing behavior in real-time, detects distractions, and forces you back to your learning goal.

Built for **#ElevenHacks** using:

* 🔍 Firecrawl (web analysis)
* 🧠 OpenRouter AI (decision engine)
* 🔊 ElevenLabs (voice feedback)

---

# 🎯 PROBLEM

Most people:

* Open YouTube → “just 1 video”
* End up wasting hours 😵

There is **no system that actively forces focus**.

---

# 💡 SOLUTION

Sentinel acts like a **real-time AI guardian**:

* Watches what you browse
* Understands your goal
* Detects distraction instantly
* Warns → blocks → redirects

---

# ⚡ FEATURES

### 🧠 AI Page Analysis

* Every page is analyzed
* Classified as:

  * ✅ Aligned
  * ⚠️ Warning
  * ❌ Off-track

---

### 🔥 Strict Mode (Core Feature)

* ON → **no distraction allowed**
* OFF → only tracking

**Strict Mode behavior:**

* Warning → glowing border + alert
* Off-track → forced redirect back to goal

---

### 🚨 Smart Warning System

* Red / Orange animated border
* Runs directly on the current page
* No page replacement (user sees mistake)

---

### 🔁 Smart Redirect Logic

* If user keeps wasting time:
  → Automatically returns to last goal-related page
* No useless redirects like `chrome://newtab`

---

### ⏱ Focus Tracking System

* Tracks:

  * Focus Time
  * Wasted Time
  * Score %

---

### 🎤 Voice Assistant (ElevenLabs)

* Click **SPEAK** button to hear feedback
* No auto-speaking (non-annoying UX)

Examples:

* “Good progress, keep going.”
* “This is not related to your goal.”

---

### 🎙 Microphone Input

* Speak your goal instead of typing

---

### ✅ Task System

* Add / remove tasks
* Stay aligned with daily goals

---

### 📊 Real-time Dashboard

* Status:

  * Aligned / Warning / Off-track
* Score indicator
* Live feedback

---

# 🧠 HOW IT WORKS

1. User sets a goal
   → e.g. *“Learn HTML”*

2. Sentinel monitors browsing

3. AI analyzes page content

4. Decision:

   * Relevant → allow
   * Slightly off → warn
   * Distracting → block

5. Strict Mode enforces behavior

6. Focus score updates live

---

# 🛠 TECH STACK

### Frontend (Extension)

* JavaScript
* Chrome Extension APIs
* Content Scripts + Background Scripts

### Backend

* Node.js (Express)
* OpenRouter API (AI reasoning)
* Firecrawl API (web content extraction)

### Voice

* ElevenLabs API

---

# 📂 PROJECT STRUCTURE

```
project/
 ├── index.html
 ├── style.css
 ├── script.js
 ├── explain.mp4
 ├── README.md

 ├── extension/
 │    ├── manifest.json
 │    ├── background.js
 │    ├── content.js
 │    ├── popup.html
 │    ├── popup.js
 │    ├── sidepanel.html
 │    ├── sidepanel.js

 ├── backend/
 │    ├── server.js
 │    ├── routes/
 │    │     ├── analyze.js
 │    │     ├── suggest.js
 │    │     ├── voice.js
```

---

# ⚙️ INSTALLATION

## 1. Clone project

```
git clone <your-repo>
cd project
```

---

## 2. Start backend

```
cd backend
npm install
npm start
```

---

## 3. Load extension in Chrome

1. Open Chrome
2. Go to: `chrome://extensions/`
3. Enable **Developer Mode**
4. Click **Load Unpacked**
5. Select `extension/` folder

---

## 4. Done ✅

---

# 🧠 USE CASE

Sentinel works for any goal.
🎯 Example:
Goal: “Learn HTML”
(or trading, studying, coding — anything)
🟢 You open a relevant page
→ ✅ Allowed
→ You stay focused
(Example: HTML docs, tutorials, even a relevant YouTube lesson)
🟠 You open a weak / partially relevant page
→ ⚠️ Warning appears
→ Glowing border shows
→ “This is not strongly related to your goal.”
🔴 You open clearly unrelated content
→ 🚫 Off-track detected
(Example: entertainment videos, random browsing, social media scrolling)
→ If Strict Mode = OFF
→ ⚠️ Only warning
→ You still have control
→ If Strict Mode = ON
→ 🚫 Full-screen intervention
→ “This is NOT your goal.”
→ ⏳ Short delay
→ 🔁 Forced back to your last productive page
🎯 RESULT
• You stay aware (normal mode)
• Or fully controlled (strict mode)
Sentinel doesn’t just track…
👉 It evaluates relevance and enforces focus when you choose.

---

# 🚀 FUTURE IDEAS

* AI study planner
* Habit tracking system
* Multi-goal switching
* Mobile browser version

---

# 📢 HACKATHON SUBMISSION

Tag:

* @firecrawl
* @elevenlabs

Hashtag:
**#ElevenHacks**

---

# 🔥 FINAL LINE

> Sentinel doesn’t just help you focus…
> It forces you to win.

---
