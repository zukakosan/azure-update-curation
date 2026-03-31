(() => {
  "use strict";

  const OFFICIAL_CATEGORY_META = {
    ga:         { label: "GA",         emoji: "✅" },
    preview:    { label: "Preview",    emoji: "🆕" },
    retirement: { label: "Retirement", emoji: "⚠️" },
    change:     { label: "Change",     emoji: "🔄" },
  };

  const COMMUNITY_CATEGORY_META = {
    ai:         { label: "AI",         emoji: "🤖" },
    devops:     { label: "DevOps",     emoji: "🔧" },
    security:   { label: "Security",   emoji: "🔒" },
    network:    { label: "Network",    emoji: "🌐" },
    database:   { label: "Database",   emoji: "🗄️" },
    container:  { label: "Container",  emoji: "📦" },
    serverless: { label: "Serverless", emoji: "⚡" },
    storage:    { label: "Storage",    emoji: "💾" },
    other:      { label: "Other",      emoji: "🏷️" },
  };

  const SOURCE_META = {
    zenn:  { label: "Zenn",  color: "#3ea8ff" },
    qiita: { label: "Qiita", color: "#55c500" },
  };

  const entriesEl   = document.getElementById("entries");
  const statsEl     = document.getElementById("stats");
  const weekPicker  = document.getElementById("week-picker");
  const periodLabel = document.getElementById("period-label");
  const filtersOfficial  = document.getElementById("filters-official");
  const filtersCommunity = document.getElementById("filters-community");

  let currentTab = "official";

  // --- Init ---
  function init() {
    weekPicker.value = currentISOWeek();
    weekPicker.addEventListener("change", () => loadCurrentTab());

    // Tab switching
    document.getElementById("tab-bar").addEventListener("click", (e) => {
      if (!e.target.matches(".tab-btn")) return;
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      currentTab = e.target.dataset.tab;

      filtersOfficial.classList.toggle("hidden", currentTab !== "official");
      filtersCommunity.classList.toggle("hidden", currentTab !== "community");

      // Reset filter buttons
      [filtersOfficial, filtersCommunity].forEach(el =>
        el.querySelectorAll(".filter-btn").forEach((b, i) =>
          b.classList.toggle("active", i === 0)
        )
      );

      loadCurrentTab();
    });

    // Filters (both sections)
    [filtersOfficial, filtersCommunity].forEach(el =>
      el.addEventListener("click", (e) => {
        if (!e.target.matches(".filter-btn")) return;
        el.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
        e.target.classList.add("active");
        applyFilter(e.target.dataset.category);
      })
    );

    loadCurrentTab();
  }

  function loadCurrentTab() {
    if (currentTab === "community") {
      loadCommunity(weekPicker.value);
    } else {
      loadOfficial(weekPicker.value);
    }
  }

  // --- Load official Azure updates ---
  async function loadOfficial(weekStr) {
    entriesEl.innerHTML = '<p class="loading">読み込み中…</p>';
    statsEl.innerHTML = "";
    periodLabel.textContent = "";

    try {
      const resp = await fetch(`./data/weekly/${weekStr}.json`);
      if (!resp.ok) throw new Error(resp.status);
      const data = await resp.json();

      if (data.period) {
        periodLabel.textContent = `(${data.period.from} 〜 ${data.period.to})`;
      }

      renderOfficial(data.entries || []);
      renderStatsFromObj(data.stats || {}, OFFICIAL_CATEGORY_META);
    } catch {
      entriesEl.innerHTML = `<p class="empty-state">📭 ${weekStr} のデータはまだありません</p>`;
    }
  }

  // --- Load community articles ---
  async function loadCommunity(weekStr) {
    entriesEl.innerHTML = '<p class="loading">読み込み中…</p>';
    statsEl.innerHTML = "";
    periodLabel.textContent = "";

    try {
      const resp = await fetch(`./data/community/${weekStr}.json`);
      if (!resp.ok) throw new Error(resp.status);
      const data = await resp.json();

      if (data.period) {
        periodLabel.textContent = `(${data.period.from} 〜 ${data.period.to})`;
      }

      renderCommunity(data.entries || []);
      renderStatsFromObj(data.stats || {}, COMMUNITY_CATEGORY_META);
    } catch {
      entriesEl.innerHTML = `<p class="empty-state">📭 ${weekStr} のコミュニティ記事はまだありません</p>`;
    }
  }

  // --- Render official update cards ---
  function renderOfficial(entries) {
    if (entries.length === 0) {
      entriesEl.innerHTML = '<p class="empty-state">📭 該当するエントリはありません</p>';
      return;
    }

    entriesEl.innerHTML = entries.map(e => {
      const meta = OFFICIAL_CATEGORY_META[e.category] || OFFICIAL_CATEGORY_META.change;
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

  // --- Render community article cards ---
  function renderCommunity(entries) {
    if (entries.length === 0) {
      entriesEl.innerHTML = '<p class="empty-state">📭 該当する記事はありません</p>';
      return;
    }

    entriesEl.innerHTML = entries.map(e => {
      const meta = COMMUNITY_CATEGORY_META[e.category] || COMMUNITY_CATEGORY_META.other;
      const src  = SOURCE_META[e.source] || { label: e.source, color: "#888" };
      const dateLabel = new Date(e.date).toLocaleDateString("ja-JP", {
        year: "numeric", month: "short", day: "numeric"
      });

      return `
        <article class="entry-card" data-category="${esc(e.category)}">
          <div class="entry-header">
            <span class="category-tag ${esc(e.category)}">${meta.emoji} ${meta.label}</span>
            <span class="source-badge" style="--source-color:${src.color}">${esc(src.label)}</span>
            <span class="entry-title">
              <a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a>
            </span>
          </div>
          <div class="entry-meta">
            <span>📅 ${dateLabel}</span>
            <span>✍️ ${esc(e.author || "")}</span>
          </div>
          <div class="entry-products">
            ${(e.tags || []).map(t => `<span class="product-chip">${esc(t)}</span>`).join("")}
          </div>
          <p class="entry-summary">${esc(truncate(e.summary, 200))}</p>
        </article>`;
    }).join("");
  }

  // --- Stats ---
  function renderStatsFromObj(stats, categoryMeta) {
    statsEl.innerHTML = Object.entries(categoryMeta).map(([key, meta]) =>
      `<span class="stat-badge ${key}">${meta.emoji} ${meta.label}: ${stats[key] || 0}</span>`
    ).join("");
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
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
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
