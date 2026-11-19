const root = document.documentElement;
const themeToggle = document.getElementById("themeToggle");
const toast = document.getElementById("toast");
const pageNames = {
  dashboard: "Overview", tasks: "My tasks", focus: "Focus room",
  subjects: "Subjects", notes: "Notes", analytics: "Analytics", settings: "Settings"
};

function renderIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove("show"), 2400);
}

function applyTheme(theme) {
  root.dataset.theme = theme;
  localStorage.setItem("studora-theme", theme);
  const icon = theme === "dark" ? "sun" : "moon";
  themeToggle.innerHTML = `<i data-lucide="${icon}"></i>`;
  themeToggle.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#0c0e14" : "#f4f5fa";
  renderIcons();
}

const savedTheme = localStorage.getItem("studora-theme") || "dark";
applyTheme(savedTheme);
themeToggle.addEventListener("click", () => {
  applyTheme(root.dataset.theme === "dark" ? "light" : "dark");
  showToast(`${root.dataset.theme === "dark" ? "Dark" : "Light"} appearance enabled`);
});

function updateDateAndGreeting() {
  const now = new Date();
  document.getElementById("todayDate").textContent = now.toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short"
  });
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  document.getElementById("greeting").innerHTML = `${greeting}, Rajit<span class="wave">✦</span>`;
}
updateDateAndGreeting();

function setPage(page) {
  const name = pageNames[page] || "Overview";
  document.getElementById("breadcrumbCurrent").textContent = name;
  document.querySelectorAll("[data-page]").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  if (page !== "dashboard") {
    showToast(`${name} module is coming in Stage ${page === "tasks" ? "2" : page === "focus" ? "3" : page === "subjects" || page === "notes" ? "4" : "5"}.`);
  } else {
    showToast("You're back at your overview.");
  }
}

document.querySelectorAll("[data-page]").forEach(button => {
  button.addEventListener("click", () => setPage(button.dataset.page));
});

["quickAdd", "addTaskInline"].forEach(id => {
  document.getElementById(id).addEventListener("click", () => {
    showToast("Task manager arrives in Stage 2. Your workspace is ready!");
  });
});

document.getElementById("sidebarMore").addEventListener("click", () => {
  showToast("Workspace options will be available soon.");
});

renderIcons();
