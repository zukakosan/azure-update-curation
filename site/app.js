(() => {
  "use strict";

  const CATEGORY_META = {
    ga:         { label: "GA",         emoji: "✅" },
    preview:    { label: "Preview",    emoji: "🆕" },
    retirement: { label: "Retirement", emoji: "⚠️" },
    change:     { label: "Change",     emoji: "🔄" },
  };

  const entriesEl   = document.getElementById("entries");
  const statsEl     = document.getElementById("stats");
  const weekPicker  = document.getElementById("week-picker");
  const periodLabel = document.getElementById("period-label");

  let allEntries = [];

  // --- Init ---
  function init() {
    weekPicker.value = currentISOWeek();
    weekPicker.addEventListener("change", () => loadWeek(weekPicker.value));

    document.getElementById("filters").addEventListener("click", (e) => {
      if (!e.target.matches(".filter-btn")) return;
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      applyFilter(e.target.dataset.category);
    });

    loadWeek(weekPicker.value);
  }

  // --- Load JSON for a given ISO week (e.g. "2026-W12") ---
  async function loadWeek(weekStr) {
    entriesEl.innerHTML = '<p class="loading">読み込み中…</p>';
    statsEl.innerHTML = "";
    periodLabel.textContent = "";

    try {
      const resp = await fetch(`./data/weekly/${weekStr}.json`);
      if (!resp.ok) throw new Error(resp.status);
      const data = await resp.json();
      allEntries = data.entries || [];

      if (data.period) {
        periodLabel.textContent = `(${data.period.from} 〜 ${data.period.to})`;
      }

      render(allEntries);

      if (data.stats) {
        renderStatsFromObj(data.stats);
      } else {
        renderStats(allEntries);
      }
    } catch {
      entriesEl.innerHTML = `<p class="empty-state">📭 ${weekStr} のデータはまだありません</p>`;
    }
  }

  // --- Render cards ---
  function render(entries) {
    if (entries.length === 0) {
      entriesEl.innerHTML = '<p class="empty-state">📭 該当するエントリはありません</p>';
      return;
    }

    entriesEl.innerHTML = entries.map(e => {
      const meta = CATEGORY_META[e.category] || CATEGORY_META.change;
      const dateLabel = new Date(e.date).toLocaleDateString("ja-JP", {
        year: "numeric", month: "short", day: "numeric"
      });

      return `
        <article class="entry-card" data-category="${esc(e.category)}">
          <div class="entry-header">
            <span class="category-tag ${esc(e.category)}">${meta.emoji} ${meta.label}</span>
            <span class="entry-title">
              <a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a>
              ${e.actionRequired ? '<span class="action-badge">要対応</span>' : ""}
            </span>
          </div>
          <div class="entry-meta">
            <span>📅 ${dateLabel}</span>
          </div>
          <div class="entry-products">
            ${(e.products || []).map(p => `<span class="product-chip">${esc(p)}</span>`).join("")}
          </div>
          <p class="entry-summary">${esc(truncate(e.summary, 200))}</p>
        </article>`;
    }).join("");
  }

  // --- Stats from pre-computed stats object ---
  function renderStatsFromObj(stats) {
    statsEl.innerHTML = Object.entries(CATEGORY_META).map(([key, meta]) =>
      `<span class="stat-badge ${key}">${meta.emoji} ${meta.label}: ${stats[key] || 0}</span>`
    ).join("");
  }

  // --- Stats from entries (fallback) ---
  function renderStats(entries) {
    const counts = { ga: 0, preview: 0, retirement: 0, change: 0 };
    entries.forEach(e => { counts[e.category] = (counts[e.category] || 0) + 1; });
    renderStatsFromObj(counts);
  }

  // --- Filter ---
  function applyFilter(category) {
    document.querySelectorAll(".entry-card").forEach(card => {
      card.classList.toggle("hidden", category !== "all" && card.dataset.category !== category);
    });
  }

  // --- Helpers ---
  function currentISOWeek() {
    const now = new Date();
    const thu = new Date(now);
    thu.setDate(thu.getDate() - ((thu.getDay() + 6) % 7) + 3);
    const jan4 = new Date(thu.getFullYear(), 0, 4);
    const weekNum = Math.ceil(((thu - jan4) / 86400000 + jan4.getDay() + 1) / 7);
    return `${thu.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
  }

  function truncate(str, len) {
    return str && str.length > len ? str.slice(0, len) + "…" : (str || "");
  }

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
  }

  init();
})();
