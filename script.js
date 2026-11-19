"use strict";

/* ---------------- helpers ---------------- */
const root = document.documentElement;
const pageContent = document.getElementById("pageContent");
const STORAGE_KEY = "studora-data-v1";
const PROFILE_KEY = "studora-profile-v1";
const THEME_KEY = "studora-theme";

/* Paste your Google OAuth 2.0 Web Client ID here to enable sign-in.
   Setup steps are in README.txt. */
const GOOGLE_CLIENT_ID = "768601915660-5r7ji0d100hc8relo2pli87bsl07ej1h.apps.googleusercontent.com";
let googleTokenClient = null;

const pad2 = (n) => String(n).padStart(2, "0");
const uid = () => Math.random().toString(36).slice(2, 9);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function isoDate(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
const todayKey = () => isoDate();

function parseDate(key) {
  return new Date(key + "T00:00:00");
}

function shortDate(key) {
  return parseDate(key).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function formatTime(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

function formatMinutes(mins) {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${pad2(m % 60)}m`;
}

const TONES = {
  green: { cls: "tone-green", grad: "linear-gradient(90deg,#6cf3a8,#23c96c)" },
  violet: { cls: "tone-violet", grad: "linear-gradient(90deg,#c8bfff,#8b77f1)" },
  rose: { cls: "tone-rose", grad: "linear-gradient(90deg,#ffc2cb,#f0708a)" },
  amber: { cls: "tone-amber", grad: "linear-gradient(90deg,#ffd79b,#e9a64f)" },
  sky: { cls: "tone-sky", grad: "linear-gradient(90deg,#a5ccff,#5f9df2)" },
};
const TONE_KEYS = Object.keys(TONES);

/* ---------------- state ---------------- */
function defaultState() {
  return {
    user: null,
    dailyGoal: 6,
    focusGoal: 120,
    subjects: [],
    tasks: [],
    notes: [],
    focusLog: {},
    sessionLog: {},
    activity: {},
  };
}

const DEMO_TASK_TITLES = new Set([
  "Revise yesterday's physics notes",
  "Solve 20 chemistry MCQs",
  "Skim the biology chapter summary",
  "Plan tomorrow's study goals",
]);
const DEMO_SUBJECT_IDS = new Set(["phy", "chem", "bio"]);
const DEMO_NOTE_TITLE = "Welcome to STUDORA";

function accountKey(user) {
  return user && user.sub ? `${STORAGE_KEY}:${user.sub}` : null;
}

function readProfile() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_KEY));
    return raw && typeof raw === "object" && raw.sub ? raw : null;
  } catch {
    return null;
  }
}

function writeProfile(user) {
  try {
    if (user && user.sub) localStorage.setItem(PROFILE_KEY, JSON.stringify(user));
    else localStorage.removeItem(PROFILE_KEY);
  } catch {
    /* storage can be unavailable in private modes */
  }
}

function cleanSavedData(raw) {
  if (!raw || typeof raw !== "object") return null;
  const base = defaultState();
  const tasks = Array.isArray(raw.tasks) ? raw.tasks.filter((task) => !DEMO_TASK_TITLES.has(task.title)) : [];
  const subjects = Array.isArray(raw.subjects) ? raw.subjects.filter((subject) => !DEMO_SUBJECT_IDS.has(subject.id)) : [];
  const notes = Array.isArray(raw.notes) ? raw.notes.filter((note) => note.title !== DEMO_NOTE_TITLE) : [];
  return {
    ...base,
    ...raw,
    user: null,
    tasks,
    subjects,
    notes,
    focusLog: raw.focusLog && typeof raw.focusLog === "object" ? raw.focusLog : {},
    sessionLog: raw.sessionLog && typeof raw.sessionLog === "object" ? raw.sessionLog : {},
    activity: raw.activity && typeof raw.activity === "object" ? raw.activity : {},
  };
}

function loadState() {
  const profile = readProfile();
  if (!profile) return defaultState();
  try {
    const stored = JSON.parse(localStorage.getItem(accountKey(profile)) || "null");
    const data = cleanSavedData(stored) || defaultState();
    data.user = profile;
    return data;
  } catch {
    return { ...defaultState(), user: profile };
  }
}

function saveState() {
  const key = accountKey(state.user);
  if (!key) return; // signed-out sessions stay in memory only
  try {
    localStorage.setItem(key, JSON.stringify(state));
    writeProfile(state.user);
  } catch {
    /* storage can be unavailable in private modes */
  }
}

function hasStudyData(snapshot) {
  return snapshot.tasks.length > 0 || snapshot.subjects.length > 0 || snapshot.notes.length > 0
    || Object.keys(snapshot.focusLog).length > 0
    || Object.keys(snapshot.sessionLog).length > 0
    || Object.keys(snapshot.activity).length > 0;
}

function takeLegacyData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    localStorage.removeItem(STORAGE_KEY);
    return cleanSavedData(JSON.parse(raw));
  } catch {
    return null;
  }
}

let state = loadState();
let currentPage = "dashboard";
let taskFilter = "today";
let noteSaveTimer = null;
let taskRefreshTimer = null;

/* ---------------- chrome ---------------- */
const PAGE_NAMES = {
  dashboard: "Overview",
  tasks: "My tasks",
  focus: "Focus room",
  subjects: "Subjects",
  notes: "Notes",
  analytics: "Analytics",
  settings: "Settings",
};

const themeToggle = document.getElementById("themeToggle");
const toastEl = document.getElementById("toast");
const navTaskCount = document.getElementById("navTaskCount");
const streakDays = document.getElementById("streakDays");
const streakHint = document.getElementById("streakHint");
const profileName = document.getElementById("profileName");
const profileMeta = document.getElementById("profileMeta");
const profileInitial = document.getElementById("profileInitial");
const topAvatar = document.getElementById("topAvatar");
const todayDateEl = document.getElementById("todayDate");
const breadcrumbCurrent = document.getElementById("breadcrumbCurrent");

function renderIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toastEl.classList.remove("show"), 2600);
}

function applyTheme(theme) {
  root.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  themeToggle.innerHTML = `<i data-lucide="${theme === "dark" ? "sun" : "moon"}"></i>`;
  themeToggle.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === "dark" ? "#060a08" : "#eaf1ea";
  document.querySelectorAll("[data-theme-choice]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.themeChoice === theme);
  });
  renderIcons();
}

const savedTheme = (() => {
  try { return localStorage.getItem(THEME_KEY) || "dark"; } catch { return "dark"; }
})();
applyTheme(savedTheme);

themeToggle.addEventListener("click", () => {
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  showToast(`${cap(next)} appearance enabled`);
});

function computeStreak() {
  const cursor = new Date();
  if (!state.activity[isoDate(cursor)]) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (state.activity[isoDate(cursor)]) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function subjectAverage() {
  if (!state.subjects.length) return 0;
  const total = state.subjects.reduce((sum, s) => {
    const pct = s.chapters > 0 ? Math.min(100, (s.done / s.chapters) * 100) : 0;
    return sum + pct;
  }, 0);
  return Math.round(total / state.subjects.length);
}

function subjectById(id) {
  return state.subjects.find((s) => s.id === id) || null;
}

function displayName() {
  return (state.user && state.user.name ? state.user.name : "").trim() || "Student";
}

function greetingName() {
  if (state.user) {
    const given = (state.user.given || "").trim();
    if (given) return given;
    const first = (state.user.name || "").trim().split(/\s+/)[0];
    if (first) return first;
  }
  return "Student";
}

function userInitial() {
  return (displayName().charAt(0) || "S").toUpperCase();
}

function googleGSvg() {
  return `<svg class="g-icon" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.28-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;
}

function avatarHtml(user) {
  if (user && user.picture) {
    return `<img src="${esc(user.picture)}" alt="${esc(user.name || "Profile picture")}">`;
  }
  return esc(((user && user.name ? user.name : "Student").charAt(0) || "S").toUpperCase());
}

function paintAvatar(el, user) {
  el.innerHTML = avatarHtml(user);
  el.classList.toggle("has-photo", Boolean(user && user.picture));
}

document.addEventListener("error", (event) => {
  const img = event.target;
  if (!(img instanceof HTMLImageElement)) return;
  const holder = img.closest(".avatar");
  if (!holder) return;
  holder.classList.remove("has-photo");
  holder.textContent = userInitial();
}, true);

function updateChrome() {
  const open = state.tasks.filter((t) => !t.done).length;
  navTaskCount.textContent = pad2(open);
  const streak = computeStreak();
  streakDays.textContent = `${streak} day${streak === 1 ? "" : "s"} streak`;
  streakHint.textContent = state.activity[todayKey()]
    ? "You showed up today."
    : streak > 0
      ? "One task keeps it alive."
      : "Finish a task to begin.";
  profileName.textContent = displayName();
  profileMeta.textContent = state.user && state.user.email ? state.user.email : "Sign in to save";
  paintAvatar(profileInitial, state.user);
  paintAvatar(topAvatar, state.user);
  topAvatar.setAttribute("aria-label", state.user ? "Profile and settings" : "Sign in with Google");
  todayDateEl.textContent = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/* ---------------- google account ---------------- */
function signInWithGoogle() {
  if (!GOOGLE_CLIENT_ID) {
    showToast("Google sign-in isn't configured yet — add your Client ID (see README).");
    return;
  }
  if (!googleTokenClient) {
    showToast("Google sign-in is still loading. Try again in a moment.");
    return;
  }
  googleTokenClient.requestAccessToken({ prompt: "select_account" });
}

async function handleGoogleToken(response) {
  if (!response || response.error) {
    showToast("Google sign-in was cancelled.");
    return;
  }
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${response.access_token}` },
    });
    if (!res.ok) throw new Error("Could not load profile");
    const profile = await res.json();
    const user = {
      sub: profile.sub || "",
      name: profile.name || profile.email || "Student",
      given: profile.given_name || "",
      email: profile.email || "",
      picture: profile.picture || "",
    };
    let saved = null;
    try {
      saved = cleanSavedData(JSON.parse(localStorage.getItem(accountKey(user)) || "null"));
    } catch {
      saved = null;
    }
    if (!saved) {
      saved = (hasStudyData(state) ? state : takeLegacyData()) || defaultState();
    }
    localStorage.removeItem(STORAGE_KEY);
    saved.user = user;
    state = saved;
    saveState();
    updateChrome();
    renderPage();
    showToast(saved.tasks.length || saved.notes.length || saved.subjects.length
      ? `Welcome back, ${greetingName()}!`
      : `Welcome, ${greetingName()}!`);
  } catch {
    showToast("Couldn't load your Google profile. Please try again.");
  }
}

function signOutGoogle() {
  clearTimeout(noteSaveTimer);
  noteSaveTimer = null;
  clearTimeout(taskRefreshTimer);
  taskRefreshTimer = null;
  clearInterval(timer.interval);
  timer.interval = null;
  timer.running = false;
  timer.remaining = timer.duration;
  writeProfile(null);
  state = defaultState();
  taskFilter = "today";
  updateChrome();
  renderPage();
  showToast("Signed out. Sign in to see your saved tasks again.");
}

function initGoogle() {
  if (!GOOGLE_CLIENT_ID || googleTokenClient) return;
  if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
    initGoogle.attempts = (initGoogle.attempts || 0) + 1;
    if (initGoogle.attempts < 12) setTimeout(initGoogle, 500);
    return;
  }
  try {
    googleTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "openid profile email",
      callback: handleGoogleToken,
    });
  } catch {
    googleTokenClient = null;
  }
}

/* ---------------- focus timer ---------------- */
const MODES = {
  focus: { minutes: 25, label: "Focus session", state: "Ready to focus" },
  deep: { minutes: 50, label: "Deep work", state: "Ready for deep work" },
  break: { minutes: 5, label: "Short break", state: "Time to breathe" },
};

const timer = { mode: "focus", duration: 25 * 60, remaining: 25 * 60, running: false, endAt: 0, interval: null };
const RING_CIRCUMFERENCE = 2 * Math.PI * 104;

function timerStateLabel() {
  if (timer.running) return timer.mode === "break" ? "On a break" : "In session";
  return MODES[timer.mode].state;
}

function ringMarkup(compact = false) {
  const fraction = timer.duration > 0 ? Math.max(0, Math.min(1, timer.remaining / timer.duration)) : 0;
  const offset = (RING_CIRCUMFERENCE * (1 - fraction)).toFixed(2);
  return `<div class="ring-wrap${compact ? " compact" : ""}">
    <svg class="ring" viewBox="0 0 240 240" aria-hidden="true">
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#6cf3a8"></stop>
          <stop offset="100%" stop-color="#b3a6ff"></stop>
        </linearGradient>
      </defs>
      <circle class="ring-track" cx="120" cy="120" r="104"></circle>
      <circle class="ring-progress js-ring" cx="120" cy="120" r="104"
        style="stroke-dasharray:${RING_CIRCUMFERENCE.toFixed(2)};stroke-dashoffset:${offset}"></circle>
    </svg>
    <div class="ring-center">
      <span class="ring-label js-ring-state">${timerStateLabel()}</span>
      <strong class="ring-time js-timer-time">${formatTime(timer.remaining)}</strong>
      <span class="ring-mode">${MODES[timer.mode].label}</span>
    </div>
  </div>`;
}

function updateTimerUI() {
  const fraction = timer.duration > 0 ? Math.max(0, Math.min(1, timer.remaining / timer.duration)) : 0;
  const offset = (RING_CIRCUMFERENCE * (1 - fraction)).toFixed(2);
  document.querySelectorAll(".js-ring").forEach((el) => { el.style.strokeDashoffset = offset; });
  document.querySelectorAll(".js-timer-time").forEach((el) => { el.textContent = formatTime(timer.remaining); });
  document.querySelectorAll(".js-ring-state").forEach((el) => { el.textContent = timerStateLabel(); });
}

function startTimer() {
  if (timer.running) return;
  if (timer.remaining <= 0.5) timer.remaining = timer.duration;
  timer.endAt = Date.now() + timer.remaining * 1000;
  timer.running = true;
  clearInterval(timer.interval);
  timer.interval = setInterval(tickTimer, 250);
  updateTimerUI();
  if (currentPage === "focus" || currentPage === "dashboard") renderPage();
  showToast(timer.mode === "break" ? "Break started — breathe." : "Focus session started. You've got this.");
}

function pauseTimer() {
  if (!timer.running) return;
  timer.remaining = Math.max(0, (timer.endAt - Date.now()) / 1000);
  timer.running = false;
  clearInterval(timer.interval);
  timer.interval = null;
  updateTimerUI();
  if (currentPage === "focus" || currentPage === "dashboard") renderPage();
  showToast("Session paused.");
}

function resetTimer() {
  timer.running = false;
  clearInterval(timer.interval);
  timer.interval = null;
  timer.duration = MODES[timer.mode].minutes * 60;
  timer.remaining = timer.duration;
  updateTimerUI();
  if (currentPage === "focus" || currentPage === "dashboard") renderPage();
}

function setTimerMode(mode) {
  if (!MODES[mode] || mode === timer.mode) return;
  timer.running = false;
  clearInterval(timer.interval);
  timer.interval = null;
  timer.mode = mode;
  timer.duration = MODES[mode].minutes * 60;
  timer.remaining = timer.duration;
  updateTimerUI();
  if (currentPage === "focus" || currentPage === "dashboard") renderPage();
}

function tickTimer() {
  timer.remaining = Math.max(0, (timer.endAt - Date.now()) / 1000);
  if (timer.remaining <= 0) {
    completeSession();
    return;
  }
  updateTimerUI();
}

function completeSession() {
  clearInterval(timer.interval);
  timer.interval = null;
  timer.running = false;
  const finishedMode = timer.mode;
  const minutes = Math.round(timer.duration / 60);
  timer.remaining = timer.duration;

  if (finishedMode !== "break") {
    const t = todayKey();
    state.focusLog[t] = (state.focusLog[t] || 0) + minutes;
    state.sessionLog[t] = (state.sessionLog[t] || 0) + 1;
    state.activity[t] = true;
    saveState();
    updateChrome();
    showToast(`Session complete — ${minutes} focus minutes logged.`);
  } else {
    showToast("Break finished. Ready when you are.");
  }

  updateTimerUI();
  if (["focus", "dashboard", "analytics"].includes(currentPage)) renderPage();
}

/* ---------------- task helpers ---------------- */
function dueLabel(key) {
  if (!key) return "No date";
  const t = todayKey();
  if (key === t) return "Today";
  const tomorrow = isoDate(new Date(Date.now() + 86400000));
  if (key === tomorrow) return "Tomorrow";
  if (key < t) return `Overdue · ${shortDate(key)}`;
  return shortDate(key);
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

function sortTasks(list) {
  return [...list].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const p = (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
    if (p !== 0) return p;
    return (a.due || "9999") < (b.due || "9999") ? -1 : 1;
  });
}

function taskRow(task) {
  const sub = subjectById(task.subject);
  return `<div class="task${task.done ? " done" : ""}" data-task="${task.id}">
    <button class="check${task.done ? " done" : ""}" data-action="toggle-task" data-id="${task.id}"
      aria-label="${task.done ? "Mark task incomplete" : "Mark task complete"}" aria-pressed="${task.done}">
      <i data-lucide="check"></i>
    </button>
    <div class="task-info">
      <span class="task-title">${esc(task.title)}</span>
      <span class="task-meta">
        ${sub ? `<i data-lucide="${sub.icon}"></i><span class="subject-part">${esc(sub.name)}</span><b class="dot">·</b>` : ""}
        <span>${dueLabel(task.due)}</span>
      </span>
    </div>
    <span class="chip ${task.priority}">${cap(task.priority)}</span>
    <button class="task-del" data-action="delete-task" data-id="${task.id}" aria-label="Delete task">
      <i data-lucide="trash-2"></i>
    </button>
  </div>`;
}

function emptyBlock(icon, title, text) {
  return `<div class="empty">
    <span class="empty-icon"><i data-lucide="${icon}"></i></span>
    <strong>${title}</strong>
    <p>${text}</p>
  </div>`;
}

function toggleTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  task.done = !task.done;
  task.doneOn = task.done ? todayKey() : null;
  if (task.done) state.activity[todayKey()] = true;
  saveState();
  updateChrome();

  const row = document.querySelector(`[data-task="${id}"]`);
  const canUpdateInPlace = row && (currentPage === "dashboard" || currentPage === "tasks");
  if (canUpdateInPlace) {
    row.classList.toggle("done", task.done);
    const check = row.querySelector(".check");
    if (check) {
      check.classList.toggle("done", task.done);
      check.setAttribute("aria-pressed", String(task.done));
      check.setAttribute("aria-label", task.done ? "Mark task incomplete" : "Mark task complete");
    }
    clearTimeout(taskRefreshTimer);
    taskRefreshTimer = setTimeout(() => {
      if (currentPage === "dashboard" || currentPage === "tasks") renderPage();
    }, 380);
  } else {
    renderPage();
  }
  showToast(task.done ? "Task complete — one step further." : "Task reopened.");
}

function deleteTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  saveState();
  updateChrome();
  renderPage();
  showToast("Task removed.");
}

/* ---------------- dialogs ---------------- */
const taskDialog = document.getElementById("taskDialog");
const taskForm = document.getElementById("taskForm");
const taskTitle = document.getElementById("taskTitle");
const taskSubject = document.getElementById("taskSubject");
const taskPriority = document.getElementById("taskPriority");
const taskDue = document.getElementById("taskDue");
const subjectDialog = document.getElementById("subjectDialog");
const subjectForm = document.getElementById("subjectForm");
const subjectName = document.getElementById("subjectName");
const subjectChapters = document.getElementById("subjectChapters");

function openTaskDialog() {
  taskSubject.innerHTML = `<option value="">General study</option>` +
    state.subjects.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("");
  taskDue.value = todayKey();
  taskForm.reset();
  taskDue.value = todayKey();
  taskPriority.value = "medium";
  taskDialog.showModal();
  renderIcons();
  setTimeout(() => taskTitle.focus(), 60);
}

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = taskTitle.value.trim();
  if (!title) return;
  state.tasks.unshift({
    id: uid(),
    title,
    subject: taskSubject.value || null,
    priority: taskPriority.value,
    due: taskDue.value || todayKey(),
    done: false,
    doneOn: null,
  });
  saveState();
  updateChrome();
  taskDialog.close();
  renderPage();
  showToast(state.user ? "Task added to your plan." : "Added for this session — sign in to save it.");
});

function openSubjectDialog() {
  subjectForm.reset();
  subjectChapters.value = 12;
  subjectDialog.showModal();
  renderIcons();
  setTimeout(() => subjectName.focus(), 60);
}

subjectForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = subjectName.value.trim();
  if (!name) return;
  const chapters = Math.max(1, Math.min(200, parseInt(subjectChapters.value, 10) || 12));
  state.subjects.push({
    id: uid(),
    name,
    icon: "book-open",
    tone: TONE_KEYS[state.subjects.length % TONE_KEYS.length],
    chapters,
    done: 0,
  });
  saveState();
  subjectDialog.close();
  renderPage();
  showToast(`${name} added to your subjects.`);
});

document.querySelectorAll("[data-close-dialog]").forEach((btn) => {
  btn.addEventListener("click", () => btn.closest("dialog").close());
});
document.querySelectorAll("dialog.sheet").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

/* ---------------- pages ---------------- */
const QUOTES = [
  { text: "Great things are done by a series of small things brought together.", author: "Vincent van Gogh" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "The expert in anything was once a beginner.", author: "Helen Hayes" },
  { text: "Little by little, one travels far.", author: "J. R. R. Tolkien" },
  { text: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln" },
];

function dayOfYear() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now - start) / 86400000);
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function statCard({ icon, tone, caption, value, footLeft, footRight, progress, barClass = "", trendClass = "trend-flat" }) {
  return `<article class="stat">
    <div class="stat-top">
      <span class="stat-icon ${tone}"><i data-lucide="${icon}"></i></span>
      <span class="stat-caption">${caption}</span>
      <i class="stat-menu" data-lucide="more-horizontal"></i>
    </div>
    <div class="stat-value">${value}</div>
    <div class="stat-foot">
      <span class="trend ${trendClass}">${footLeft}</span>
      <span>${footRight}</span>
    </div>
    <div class="mini-track"><span class="mini-fill ${barClass}" style="width:${Math.max(0, Math.min(100, progress))}%"></span></div>
  </article>`;
}

function dashboardPage() {
  const t = todayKey();
  const todayTasks = state.tasks.filter((task) => task.due === t);
  const doneToday = todayTasks.filter((task) => task.done).length;
  const openToday = todayTasks.length - doneToday;
  const focusToday = state.focusLog[t] || 0;
  const streak = computeStreak();
  const avg = subjectAverage();
  const quote = QUOTES[dayOfYear() % QUOTES.length];
  const list = sortTasks(todayTasks).slice(0, 5);
  const focusH = Math.floor(focusToday / 60);
  const focusM = focusToday % 60;
  const activeSubjects = state.subjects.slice(0, 3);

  return `<div class="page">
    <div class="page-head">
      <div>
        <div class="eyebrow"><span class="eyebrow-dot"></span>Your personal study space</div>
        <h1>${greeting()}, ${esc(greetingName())}<span class="wave">✦</span></h1>
        <p class="subheading">A little progress every day adds up to big results.</p>
      </div>
      <div class="head-actions">
        ${state.user ? "" : `<button class="btn btn-google" data-action="google-signin">${googleGSvg()} Sign in with Google</button>`}
        <button class="btn btn-primary" data-action="new-task"><i data-lucide="plus"></i> Quick add task</button>
      </div>
    </div>

    <div class="stats-grid">
      ${statCard({
        icon: "list-checks", tone: "tone-green", caption: "Daily tasks",
        value: `${pad2(openToday)}<span class="stat-unit">left</span>`,
        footLeft: `<i data-lucide="check-check"></i> ${doneToday} done today`,
        footRight: `goal ${state.dailyGoal}`,
        progress: (doneToday / Math.max(1, state.dailyGoal)) * 100,
        trendClass: doneToday ? "trend-up" : "trend-flat",
      })}
      ${statCard({
        icon: "clock-3", tone: "tone-violet", caption: "Focus time",
        value: `${pad2(focusH)}<span class="stat-unit">h</span> ${pad2(focusM)}<span class="stat-unit">m</span>`,
        footLeft: `<i data-lucide="target"></i> Goal ${Math.round(state.focusGoal / 60)}h`,
        footRight: focusToday >= state.focusGoal ? "Goal reached" : `${Math.max(0, state.focusGoal - focusToday)}m to go`,
        progress: (focusToday / Math.max(1, state.focusGoal)) * 100,
        barClass: "is-violet",
        trendClass: focusToday > 0 ? "trend-up" : "trend-flat",
      })}
      ${statCard({
        icon: "flame", tone: "tone-amber", caption: "Study streak",
        value: `${streak}<span class="stat-unit">${streak === 1 ? "day" : "days"}</span>`,
        footLeft: `<i data-lucide="sparkles"></i> ${streak > 0 ? "Keep it alive" : "Start today"}`,
        footRight: "Personal best",
        progress: Math.min(100, (streak / 7) * 100),
        barClass: "is-amber",
        trendClass: streak > 0 ? "trend-up" : "trend-flat",
      })}
      ${statCard({
        icon: "library", tone: "tone-sky", caption: "Subjects",
        value: `${state.subjects.length}<span class="stat-unit">active</span>`,
        footLeft: `<i data-lucide="book-open"></i> ${avg}% average`,
        footRight: "Chapters tracked",
        progress: avg,
        barClass: "is-sky",
      })}
    </div>

    <div class="grid-main">
      <section class="card">
        <div class="card-head">
          <div>
            <p class="kicker">Stay on track</p>
            <h2>Today's plan</h2>
            <p class="card-desc">${todayTasks.length
              ? `${doneToday} of ${todayTasks.length} done — keep your priorities close.`
              : state.tasks.length
                ? "Nothing scheduled for today. Enjoy the breathing room."
                : "A fresh start. Add your first task below."}</p>
          </div>
          <button class="link-btn" data-action="go-tasks">View all <i data-lucide="arrow-up-right"></i></button>
        </div>
        ${list.length
          ? `<div class="task-list">${list.map(taskRow).join("")}</div>`
          : state.tasks.length
            ? emptyBlock("coffee", "A clean slate", "Nothing is due today. Add a task when you're ready.")
            : emptyBlock("sparkles", "Your day is open", "Add a task to get going — even one small step counts.")}
        <button class="task-add" data-action="new-task"><i data-lucide="plus"></i> Add a task to your day</button>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <p class="kicker">Make it count</p>
            <h2>Focus room</h2>
            <p class="card-desc">One thing at a time.</p>
          </div>
          <span class="eyebrow-dot"></span>
        </div>
        <div class="focus-preview">${ringMarkup(true)}</div>
        <button class="btn btn-primary" style="width:100%" data-action="go-focus">
          <i data-lucide="${timer.running ? "timer" : "play"}"></i>
          ${timer.running ? "Back to your session" : "Enter focus room"}
        </button>
        <p class="focus-time-row"><i data-lucide="headphones"></i> Find your flow. Ignore the noise.</p>
      </section>
    </div>

    <div class="grid-bottom">
      <section class="card">
        <div class="card-head">
          <div><p class="kicker">Your learning</p><h2>My subjects</h2></div>
          <button class="link-btn" data-action="go-subjects">View all <i data-lucide="arrow-up-right"></i></button>
        </div>
        ${activeSubjects.length
          ? `<div class="mini-subjects">${activeSubjects.map((s) => {
              const pct = s.chapters ? Math.min(100, Math.round((s.done / s.chapters) * 100)) : 0;
              return `<div class="mini-subject">
                <span class="subject-icon ${TONES[s.tone]?.cls || "tone-green"}"><i data-lucide="${s.icon}"></i></span>
                <div class="mini-subject-info">
                  <strong>${esc(s.name)}</strong>
                  <div class="mini-track"><span class="mini-fill" style="width:${pct}%;background:${TONES[s.tone]?.grad || ""}"></span></div>
                </div>
                <span class="mini-subject-pct">${pct}%</span>
              </div>`;
            }).join("")}</div>`
          : emptyBlock("library", "No subjects yet", "Add your first subject to start tracking chapters.")}
      </section>

      <section class="quote-card">
        <div class="quote-mark">“</div>
        <div class="quote-label">A thought to keep</div>
        <blockquote>${quote.text}</blockquote>
        <span class="quote-author">— ${quote.author}</span>
        <div class="quote-decoration"><span></span><span></span><span></span></div>
      </section>
    </div>
  </div>`;
}

function tasksPage() {  const t = todayKey();
  const counts = {
    today: state.tasks.filter((task) => task.due === t).length,
    upcoming: state.tasks.filter((task) => task.due > t).length,
    done: state.tasks.filter((task) => task.done).length,
    all: state.tasks.length,
  };
  const filters = [
    ["today", "Today"],
    ["upcoming", "Upcoming"],
    ["done", "Completed"],
    ["all", "All tasks"],
  ];
  const filtered = state.tasks.filter((task) => {
    if (taskFilter === "today") return task.due === t;
    if (taskFilter === "upcoming") return task.due > t;
    if (taskFilter === "done") return task.done;
    return true;
  });
  const list = taskFilter === "done"
    ? [...filtered].sort((a, b) => (b.doneOn || "").localeCompare(a.doneOn || ""))
    : sortTasks(filtered);
  const emptyText = {
    today: "Nothing due today. Add a task to shape your day.",
    upcoming: "No upcoming tasks yet. Planning ahead helps.",
    done: "Completed tasks will collect here.",
    all: "Your task list is empty. Start with one small step.",
  }[taskFilter];

  return `<div class="page">
    <div class="page-head">
      <div>
        <div class="eyebrow"><span class="eyebrow-dot"></span>Everything in one place</div>
        <h1>My tasks</h1>
        <p class="subheading">Small, clear steps beat big, vague plans.</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-primary" data-action="new-task"><i data-lucide="plus"></i> New task</button>
      </div>
    </div>

    <div class="filter-bar" role="group" aria-label="Filter tasks">
      ${filters.map(([key, label]) => `<button class="filter${taskFilter === key ? " active" : ""}" data-action="set-filter" data-filter="${key}">${label}</button>`).join("")}
      <span class="filter-count">${counts.all} total · ${counts.done} done</span>
    </div>

    <section class="card task-manager">
      ${list.length
        ? `<div class="task-list">${list.map(taskRow).join("")}</div>`
        : emptyBlock("list-checks", "All clear", emptyText)}
    </section>
  </div>`;
}

function focusPage() {
  const t = todayKey();
  const focusToday = state.focusLog[t] || 0;
  const sessions = state.sessionLog[t] || 0;
  const goalPct = Math.min(100, Math.round((focusToday / Math.max(1, state.focusGoal)) * 100));
  const presets = [
    ["focus", "25 min"],
    ["deep", "50 min"],
    ["break", "5 min break"],
  ];

  return `<div class="page">
    <div class="page-head">
      <div>
        <div class="eyebrow"><span class="eyebrow-dot"></span>Protect your attention</div>
        <h1>Focus room</h1>
        <p class="subheading">Close the tabs, set a timer, and give one thing your full attention.</p>
      </div>
    </div>

    <div class="focus-layout">
      <section class="card focus-stage">
        ${ringMarkup(false)}
        <div class="presets" role="group" aria-label="Timer length">
          ${presets.map(([key, label]) => `<button class="preset${timer.mode === key ? " active" : ""}" data-action="set-mode" data-mode="${key}">${label}</button>`).join("")}
        </div>
        <div class="timer-controls">
          ${timer.running
            ? `<button class="btn btn-primary" data-action="pause-timer"><i data-lucide="pause"></i> Pause session</button>`
            : `<button class="btn btn-primary" data-action="start-timer"><i data-lucide="play"></i> Start focusing</button>`}
          <button class="icon-btn" data-action="reset-timer" aria-label="Reset timer"><i data-lucide="rotate-ccw"></i></button>
        </div>
        <p class="focus-foot">Sessions log automatically when the timer ends. Breaks don't count.</p>
      </section>

      <aside class="card">
        <div class="card-head">
          <div><p class="kicker">Today</p><h2>Your focus log</h2></div>
        </div>
        <div class="side-stats">
          <div class="side-stat">
            <span class="side-stat-icon tone-green"><i data-lucide="clock-3"></i></span>
            <div><strong>${formatMinutes(focusToday)}</strong><p>Focused today</p></div>
          </div>
          <div class="side-stat">
            <span class="side-stat-icon tone-violet"><i data-lucide="layers"></i></span>
            <div><strong>${sessions} session${sessions === 1 ? "" : "s"}</strong><p>Completed today</p></div>
          </div>
          <div class="side-stat">
            <span class="side-stat-icon tone-amber"><i data-lucide="flame"></i></span>
            <div><strong>${computeStreak()} day streak</strong><p>Keep showing up</p></div>
          </div>
        </div>
        <div style="margin-top:16px">
          <div class="stat-foot"><span>Daily goal</span><span>${focusToday} / ${state.focusGoal} min</span></div>
          <div class="mini-track"><span class="mini-fill" style="width:${goalPct}%"></span></div>
        </div>
        <div class="tip-card">
          <strong>Try this</strong>
          <p>Put your phone in another room, pick one task from today's plan, and start a single 25-minute session. Momentum follows action.</p>
        </div>
      </aside>
    </div>
  </div>`;
}

function subjectsPage() {
  return `<div class="page">
    <div class="page-head">
      <div>
        <div class="eyebrow"><span class="eyebrow-dot"></span>Your learning areas</div>
        <h1>Subjects</h1>
        <p class="subheading">Track chapters as you finish them and watch the progress add up.</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-primary" data-action="new-subject"><i data-lucide="plus"></i> Add subject</button>
      </div>
    </div>

    ${state.subjects.length
      ? `<div class="subjects-grid">
      ${state.subjects.map((s) => {
        const pct = s.chapters ? Math.min(100, Math.round((s.done / s.chapters) * 100)) : 0;
        const tone = TONES[s.tone] || TONES.green;
        return `<article class="subject">
          <div class="subject-top">
            <span class="subject-icon ${tone.cls}"><i data-lucide="${s.icon}"></i></span>
            <div class="subject-title">
              <strong>${esc(s.name)}</strong>
              <span>${s.done} of ${s.chapters} chapters</span>
            </div>
            <button class="icon-btn tiny" data-action="delete-subject" data-id="${s.id}" aria-label="Remove ${esc(s.name)}">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
          <div>
            <div class="subject-bar"><span style="width:${pct}%;background:${tone.grad}"></span></div>
            <div class="subject-foot" style="margin-top:9px">
              <span class="subject-pct"><b>${pct}%</b> complete</span>
              <div class="chapter-btns">
                <button class="chapter-btn" data-action="chapter" data-id="${s.id}" data-delta="-1" aria-label="Remove a chapter"><i data-lucide="minus"></i></button>
                <button class="chapter-btn" data-action="chapter" data-id="${s.id}" data-delta="1" aria-label="Mark a chapter done"><i data-lucide="plus"></i></button>
              </div>
            </div>
          </div>
        </article>`;
      }).join("")}
      <button class="subject-add" data-action="new-subject">
        <i data-lucide="plus"></i>
        Add another subject
      </button>
    </div>`
      : emptyBlock("library", "No subjects yet", "Add your first subject to start tracking chapters.")}
  </div>`;
}

function notesPage() {
  return `<div class="page">
    <div class="page-head">
      <div>
        <div class="eyebrow"><span class="eyebrow-dot"></span>Think it, keep it</div>
        <h1>Notes</h1>
        <p class="subheading">Quick notes and revision thoughts, saved right in your browser.</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-primary" data-action="new-note"><i data-lucide="plus"></i> New note</button>
      </div>
    </div>

    ${state.notes.length
      ? `<div class="notes-grid">${state.notes.map(noteCard).join("")}</div>`
      : emptyBlock("notebook-pen", "No notes yet", "Write down a formula, a question, or a thought worth keeping.")}
  </div>`;
}

function noteCard(note) {
  const words = note.body.trim() ? note.body.trim().split(/\s+/).length : 0;
  return `<article class="note" data-note="${note.id}">
    <div class="note-head">
      <input class="note-title" value="${esc(note.title)}" placeholder="Untitled note" maxlength="60"
        aria-label="Note title" data-note-field="title" data-id="${note.id}">
      <button class="note-del" data-action="delete-note" data-id="${note.id}" aria-label="Delete note">
        <i data-lucide="trash-2"></i>
      </button>
    </div>
    <textarea class="note-body" placeholder="Start typing…" aria-label="Note body"
      data-note-field="body" data-id="${note.id}">${esc(note.body)}</textarea>
    <div class="note-foot"><span class="note-edited">Edited ${timeAgo(note.updated)}</span><span>${words} word${words === 1 ? "" : "s"}</span></div>
  </article>`;
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function lastSevenDays() {
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = isoDate(date);
    days.push({
      key,
      label: date.toLocaleDateString("en-US", { weekday: "short" }),
      focus: state.focusLog[key] || 0,
      tasks: state.tasks.filter((task) => task.doneOn === key).length,
    });
  }
  return days;
}

function barChart(days, valueKey, modifier = "") {
  const max = Math.max(1, ...days.map((d) => d[valueKey]));
  const today = todayKey();
  return `<div class="chart-bars">${days.map((d) => {
    const value = d[valueKey];
    const height = value > 0 ? Math.max(6, Math.round((value / max) * 100)) : 0;
    return `<div class="bar-col">
      <div class="bar-visual"><span class="bar-fill ${modifier}${value === 0 ? " zero" : ""}" style="height:${height}%"></span></div>
      <span class="bar-day${d.key === today ? " today" : ""}">${d.label}</span>
    </div>`;
  }).join("")}</div>`;
}

function analyticsPage() {
  const days = lastSevenDays();
  const weekFocus = days.reduce((sum, d) => sum + d.focus, 0);
  const weekTasks = days.reduce((sum, d) => sum + d.tasks, 0);
  const best = days.reduce((a, b) => (b.focus > a.focus ? b : a), days[0]);
  const totalChapters = state.subjects.reduce((sum, s) => sum + s.chapters, 0);
  const doneChapters = state.subjects.reduce((sum, s) => sum + s.done, 0);

  return `<div class="page">
    <div class="page-head">
      <div>
        <div class="eyebrow"><span class="eyebrow-dot"></span>Last seven days</div>
        <h1>Analytics</h1>
        <p class="subheading">A gentle look at how your week is going.</p>
      </div>
    </div>

    <div class="stats-grid">
      ${statCard({ icon: "clock-3", tone: "tone-violet", caption: "Focus this week", value: `${weekFocus}<span class="stat-unit">min</span>`, footLeft: `<i data-lucide="target"></i> Goal ${state.focusGoal * 7} min`, footRight: "Across all sessions", progress: (weekFocus / Math.max(1, state.focusGoal * 7)) * 100, barClass: "is-violet" })}
      ${statCard({ icon: "check-check", tone: "tone-green", caption: "Tasks completed", value: `${weekTasks}<span class="stat-unit">task${weekTasks === 1 ? "" : "s"}</span>`, footLeft: `<i data-lucide="trending-up"></i> This week`, footRight: `${state.tasks.filter((t) => !t.done).length} still open`, progress: Math.min(100, weekTasks * 12) })}
      ${statCard({ icon: "flame", tone: "tone-amber", caption: "Current streak", value: `${computeStreak()}<span class="stat-unit">day${computeStreak() === 1 ? "" : "s"}</span>`, footLeft: `<i data-lucide="sparkles"></i> Personal best`, footRight: "Keep going", progress: Math.min(100, computeStreak() * 14), barClass: "is-amber" })}
      ${statCard({ icon: "library", tone: "tone-sky", caption: "Chapter progress", value: `${doneChapters}<span class="stat-unit">of ${totalChapters}</span>`, footLeft: `<i data-lucide="book-open"></i> Overall`, footRight: `${totalChapters ? Math.round((doneChapters / totalChapters) * 100) : 0}% complete`, progress: totalChapters ? (doneChapters / totalChapters) * 100 : 0, barClass: "is-sky" })}
    </div>

    <div class="analytics-grid">
      <section class="card">
        <div class="card-head">
          <div><p class="kicker">Focus minutes</p><h2>Time in the zone</h2></div>
          <span class="legend"><span class="legend-dot"></span>minutes</span>
        </div>
        ${barChart(days, "focus")}
        <p class="card-desc" style="margin-top:14px">${best.focus > 0 ? `Best day so far: ${best.label} with ${best.focus} minutes.` : "Complete a focus session to start the chart."}</p>
      </section>

      <section class="card">
        <div class="card-head">
          <div><p class="kicker">Momentum</p><h2>Tasks completed</h2></div>
        </div>
        ${barChart(days, "tasks", "is-violet")}
        <p class="card-desc" style="margin-top:14px">${weekTasks > 0 ? `${weekTasks} task${weekTasks === 1 ? "" : "s"} finished in the last seven days.` : "Tick off a task to see your progress here."}</p>
      </section>
    </div>

    <section class="card" style="margin-top:18px">
      <div class="card-head">
        <div><p class="kicker">By subject</p><h2>Chapter completion</h2></div>
        <button class="link-btn" data-action="go-subjects">Manage <i data-lucide="arrow-up-right"></i></button>
      </div>
      ${state.subjects.length
        ? `<div class="side-stats">${state.subjects.map((s) => {
            const pct = s.chapters ? Math.min(100, Math.round((s.done / s.chapters) * 100)) : 0;
            const tone = TONES[s.tone] || TONES.green;
            return `<div class="side-stat">
              <span class="side-stat-icon ${tone.cls}"><i data-lucide="${s.icon}"></i></span>
              <div>
                <div class="stat-foot" style="margin-bottom:6px"><strong style="font-size:12.5px">${esc(s.name)}</strong><span>${s.done}/${s.chapters} chapters</span></div>
                <div class="mini-track" style="margin-top:0"><span class="mini-fill" style="width:${pct}%;background:${tone.grad}"></span></div>
              </div>
              <strong style="font-size:13px">${pct}%</strong>
            </div>`;
          }).join("")}</div>`
        : emptyBlock("library", "No subjects yet", "Add subjects to track reading progress.")}
    </section>
  </div>`;
}

function settingsPage() {
  const user = state.user;
  return `<div class="page">
    <div class="page-head">
      <div>
        <div class="eyebrow"><span class="eyebrow-dot"></span>Make it yours</div>
        <h1>Settings</h1>
        <p class="subheading">Sign in to save your tasks. Signed out, the workspace stays empty.</p>
      </div>
    </div>

    <div class="settings-grid">
      <section class="card span-2">
        <div class="card-head">
          <div><p class="kicker">Account</p><h2>Google account</h2></div>
          ${user ? `<button class="btn btn-ghost btn-sm" data-action="google-signout"><i data-lucide="log-out"></i> Sign out</button>` : ""}
        </div>
        <div class="account-row">
          <span class="avatar account-avatar${user && user.picture ? " has-photo" : ""}">${user ? avatarHtml(user) : "S"}</span>
          <div class="account-copy">
            ${user
              ? `<strong>${esc(displayName())}</strong><span>${esc(user.email || "Google account")} · Signed in</span>`
              : `<strong>You're browsing as Student</strong><span>Sign in with Google to load and save your tasks, name and profile photo.</span>`}
          </div>
          ${user ? "" : `<button class="btn btn-google" data-action="google-signin">${googleGSvg()} Sign in with Google</button>`}
        </div>
        ${!user && !GOOGLE_CLIENT_ID ? `<p class="setup-note">Developer note: paste your Google OAuth Web Client ID into <b>GOOGLE_CLIENT_ID</b> in script.js — the exact steps are in README.txt.</p>` : ""}
      </section>

      <section class="card">
        <div class="card-head"><div><p class="kicker">Study goals</p><h2>Daily targets</h2></div></div>
        <form class="settings-form" id="settingsForm">
          <div class="field-row">
            <label class="field"><span>Daily task goal</span><input id="settingTasks" type="number" min="1" max="30" value="${state.dailyGoal}"></label>
            <label class="field"><span>Daily focus goal (min)</span><input id="settingFocus" type="number" min="15" max="600" step="15" value="${state.focusGoal}"></label>
          </div>
          <p class="card-desc">These targets drive the progress rings on your dashboard.</p>
          <div><button class="btn btn-primary" type="submit"><i data-lucide="check"></i> Save goals</button></div>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><div><p class="kicker">Appearance</p><h2>Light or dark</h2></div></div>
        <div class="segmented" role="group" aria-label="Color theme">
          <button class="segment" data-action="set-theme" data-theme-choice="light"><i data-lucide="sun"></i> Light</button>
          <button class="segment" data-action="set-theme" data-theme-choice="dark"><i data-lucide="moon"></i> Dark</button>
        </div>
        <p class="card-desc" style="margin-top:14px">Your choice is remembered for the next visit.</p>
        <div style="margin-top:22px">
          <div class="stat-foot"><span>Chapter progress</span><span>${subjectAverage()}% overall</span></div>
          <div class="mini-track"><span class="mini-fill" style="width:${subjectAverage()}%"></span></div>
        </div>
      </section>

      <section class="card danger-zone span-2">
        <div class="card-head"><div><p class="kicker">Data</p><h2>Reset workspace</h2></div></div>
        <p>This clears the tasks, notes, subjects, focus history and goals saved for your Google account. Your theme and sign-in stay.</p>
        <button class="btn-danger" data-action="reset-data"><i data-lucide="rotate-ccw"></i> Reset all data</button>
      </section>
    </div>
  </div>`;
}

const PAGES = {
  dashboard: dashboardPage,
  tasks: tasksPage,
  focus: focusPage,
  subjects: subjectsPage,
  notes: notesPage,
  analytics: analyticsPage,
  settings: settingsPage,
};

function renderPage() {
  pageContent.innerHTML = PAGES[currentPage]();
  renderIcons();
  updateTimerUI();
  applyThemeStateToSegments();
}

function applyThemeStateToSegments() {
  document.querySelectorAll("[data-theme-choice]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.themeChoice === root.dataset.theme);
  });
}

function navigate(page) {
  if (!PAGES[page]) page = "dashboard";
  currentPage = page;
  document.querySelectorAll("[data-page]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === page);
  });
  breadcrumbCurrent.textContent = PAGE_NAMES[page];
  document.title = `${PAGE_NAMES[page]} · STUDORA`;
  renderPage();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-page]").forEach((btn) => {
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    navigate(btn.dataset.page);
  });
});

/* ---------------- page interactions ---------------- */
pageContent.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) return;
  const { action, id } = trigger.dataset;
  switch (action) {
    case "new-task":
      openTaskDialog();
      break;
    case "go-tasks":
      navigate("tasks");
      break;
    case "go-focus":
      navigate("focus");
      break;
    case "go-subjects":
      navigate("subjects");
      break;
    case "toggle-task":
      toggleTask(id);
      break;
    case "delete-task":
      deleteTask(id);
      break;
    case "set-filter":
      taskFilter = trigger.dataset.filter;
      renderPage();
      break;
    case "start-timer":
      startTimer();
      break;
    case "pause-timer":
      pauseTimer();
      break;
    case "reset-timer":
      resetTimer();
      break;
    case "set-mode":
      setTimerMode(trigger.dataset.mode);
      break;
    case "new-note":
      createNote();
      break;
    case "delete-note":
      deleteNote(id);
      break;
    case "new-subject":
      openSubjectDialog();
      break;
    case "delete-subject":
      deleteSubject(id);
      break;
    case "chapter":
      adjustChapter(id, Number(trigger.dataset.delta));
      break;
    case "set-theme":
      applyTheme(trigger.dataset.themeChoice);
      showToast(`${cap(trigger.dataset.themeChoice)} appearance enabled`);
      break;
    case "reset-data":
      resetData();
      break;
    case "google-signin":
      signInWithGoogle();
      break;
    case "google-signout":
      signOutGoogle();
      break;
    default:
      break;
  }
});

pageContent.addEventListener("submit", (event) => {
  if (event.target.id !== "settingsForm") return;
  event.preventDefault();
  const dailyGoal = Math.max(1, Math.min(30, parseInt(document.getElementById("settingTasks").value, 10) || 6));
  const focusGoal = Math.max(15, Math.min(600, parseInt(document.getElementById("settingFocus").value, 10) || 120));
  state.dailyGoal = dailyGoal;
  state.focusGoal = focusGoal;
  saveState();
  updateChrome();
  renderPage();
  showToast("Goals saved.");
});

pageContent.addEventListener("input", (event) => {
  const field = event.target.closest("[data-note-field]");
  if (!field) return;
  const note = state.notes.find((n) => n.id === field.dataset.id);
  if (!note) return;
  if (field.dataset.noteField === "title") note.title = field.value;
  else note.body = field.value;
  note.updated = Date.now();
  const card = field.closest(".note");
  const words = note.body.trim() ? note.body.trim().split(/\s+/).length : 0;
  const edited = card.querySelector(".note-edited");
  if (edited) edited.textContent = "Edited just now";
  const wordEl = card.querySelector(".note-foot span:last-child");
  if (wordEl) wordEl.textContent = `${words} word${words === 1 ? "" : "s"}`;
  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(saveState, 350);
});

function createNote() {
  const note = { id: uid(), title: "", body: "", updated: Date.now() };
  state.notes.unshift(note);
  saveState();
  renderPage();
  const firstTitle = pageContent.querySelector(".note-title");
  if (firstTitle) firstTitle.focus();
}

function deleteNote(id) {
  state.notes = state.notes.filter((n) => n.id !== id);
  saveState();
  renderPage();
  showToast("Note deleted.");
}

function adjustChapter(id, delta) {
  const subject = subjectById(id);
  if (!subject) return;
  const next = Math.max(0, Math.min(subject.chapters, subject.done + delta));
  if (next === subject.done) return;
  subject.done = next;
  saveState();
  renderPage();
  if (next === subject.chapters) showToast(`${subject.name} complete — well done.`);
}

function deleteSubject(id) {
  const subject = subjectById(id);
  if (!subject) return;
  const confirmed = window.confirm(`Remove ${subject.name}? Tasks linked to it will be kept as general study.`);
  if (!confirmed) return;
  state.subjects = state.subjects.filter((s) => s.id !== id);
  state.tasks.forEach((task) => {
    if (task.subject === id) task.subject = null;
  });
  saveState();
  renderPage();
  showToast(`${subject.name} removed.`);
}

function resetData() {
  const confirmed = window.confirm("Reset all tasks, notes, subjects, and focus history? This can't be undone.");
  if (!confirmed) return;
  const keepUser = state.user;
  state = defaultState();
  state.user = keepUser;
  taskFilter = "today";
  timer.mode = "focus";
  timer.duration = 25 * 60;
  timer.remaining = timer.duration;
  timer.running = false;
  clearInterval(timer.interval);
  timer.interval = null;
  saveState();
  updateChrome();
  navigate("dashboard");
  showToast("Workspace reset. Fresh start.");
}

document.getElementById("sidebarMore").addEventListener("click", () => {
  showToast("Everything is saved locally in this browser.");
});
topAvatar.addEventListener("click", () => {
  if (state.user) navigate("settings");
  else signInWithGoogle();
});

/* ---------------- boot ---------------- */
updateChrome();
renderPage();
initGoogle();
window.addEventListener("load", initGoogle);
