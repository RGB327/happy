const MOOD_EMOJI = {
  great: "😄",
  good: "🙂",
  meh: "😐",
  sad: "😢",
  angry: "😠",
};

const feedEl = document.getElementById("feed");
const emptyState = document.getElementById("emptyState");

let entries = []; // [{username, mood, message, created_at}]

function timeAgo(dateString) {
  // SQLite에서 오는 값("YYYY-MM-DD HH:MM:SS")은 UTC이지만 타임존 표기가 없어 보정한다.
  const normalized = dateString.includes("T")
    ? dateString
    : `${dateString.replace(" ", "T")}Z`;
  const diffMs = Date.now() - new Date(normalized).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderFeed(highlightUsername) {
  emptyState.classList.toggle("hidden", entries.length > 0);
  feedEl.innerHTML = "";

  entries.forEach((entry) => {
    const li = document.createElement("li");
    li.className = `mood-card mood-${entry.mood}`;
    if (entry.username === highlightUsername) li.classList.add("just-updated");
    li.innerHTML = `
      <span class="emoji">${MOOD_EMOJI[entry.mood] || "❔"}</span>
      <div class="name">${escapeHtml(entry.username)}</div>
      <div class="message">${escapeHtml(entry.message || "")}</div>
      <div class="time">${timeAgo(entry.created_at)}</div>
    `;
    feedEl.appendChild(li);
  });
}

function upsertEntry(entry) {
  const idx = entries.findIndex((e) => e.username === entry.username);
  if (idx >= 0) entries.splice(idx, 1);
  entries.unshift(entry);
  renderFeed(entry.username);
}

async function loadInitialFeed() {
  const res = await fetch("/api/mood/feed");
  entries = await res.json();
  renderFeed();
}

loadInitialFeed();

const socket = io();
socket.on("feed:init", (list) => {
  entries = list;
  renderFeed();
});
socket.on("mood:update", (entry) => upsertEntry(entry));

// 상대 시간 표시를 주기적으로 갱신
setInterval(() => renderFeed(), 30000);
