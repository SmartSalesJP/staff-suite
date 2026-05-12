const state = {
  user: null,
  permissions: [],
  view: "dashboard",
  users: [],
  sites: [],
  shifts: [],
  holidays: [],
  summary: null,
  selectedSettingsUserId: null,
  selectedUserPermissions: {},
  toast: "",
  undoId: null,
  editingUserId: null,
  selectedExpenseUserId: null,
  selectedPayslipUserId: null,
  salesTarget: Number(localStorage.getItem("salesTarget") || 2000000),
  exportModal: null,
  chatThreads: [],
  chatMessages: [],
  chatTasks: [],
  selectedChatThreadId: null,
  pendingAttachments: [],
  chatSearch: "",
  chatTagFilter: "",
  chatTaskMode: false,
  userIconDraft: "",
  announcements: [],
  lineGroups: [],
  announcementSearch: "",
  announcementTagFilter: "",
  calendarEvents: [],
  calendarSearch: "",
  calendarTagFilter: "",
};

const MAX_CHAT_ATTACHMENT_BYTES = 800_000;
const MAX_CHAT_ATTACHMENT_DATA_URL = 1_200_000;

const app = document.querySelector("#app");
let autoRefreshTimer = null;

const navItems = [
  ["dashboard", "概要", "⌂"],
  ["announcements", "お知らせ", "※"],
  ["calendar", "カレンダー", "▦"],
  ["shifts", "シフト", "◇"],
  ["holidays", "希望休", "○"],
  ["sites", "現場", "⌖"],
  ["users", "人材", "◎"],
  ["expenses", "経費申請", "＋"],
  ["expenseReview", "経費確認", "✓"],
  ["payslips", "給与明細", "￥"],
  ["sales", "売上試算表", "↗"],
  ["clock", "出退勤", "◷"],
  ["invoices", "請求書", "□"],
  ["chat", "チャット", "✉"],
  ["data", "データ", "▤"],
  ["settings", "設定", "⚙"],
];

function availableNavItems() {
  return navItems.filter(([key]) => {
    if (key === "sales") return canViewSales();
    if (key === "settings") return state.user?.role === "admin";
    if (key === "expenseReview") return state.user?.role === "admin";
    if (state.user?.role !== "admin" && ["invoices", "data"].includes(key)) return false;
    return true;
  });
}

function canViewSales() {
  return state.user?.role === "admin" || state.user?.employmentType === "employee";
}

function yen(value) {
  if (value === null || value === undefined || value === "") return "非表示";
  return `${Number(value).toLocaleString("ja-JP")}円`;
}

function dateTime(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function timeOnly(value) {
  return new Date(value).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function dateInput(days = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dateTimeInput(days = 0, hour = 9, minute = 0) {
  return `${dateInput(days)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "通信に失敗しました。");
  return data;
}

function toast(message) {
  state.toast = message;
  render();
  setTimeout(() => {
    state.toast = "";
    render();
  }, 4000);
}

async function loadAll() {
  const [me, summary, users, sites, shifts, holidays, calendarEvents, announcements] = await Promise.all([
    api("/api/auth/me"),
    api("/api/summary"),
    api("/api/users"),
    api("/api/sites"),
    api("/api/shifts"),
    api("/api/holiday-requests"),
    api("/api/calendar-events"),
    api("/api/announcements"),
  ]);
  state.user = me.user;
  state.permissions = me.permissions;
  state.summary = summary;
  state.users = users.users;
  state.sites = sites.sites;
  state.shifts = shifts.shifts;
  state.holidays = holidays.holidayRequests;
  state.calendarEvents = calendarEvents.events;
  state.announcements = announcements.announcements;
  ensureAutoRefresh();
}

function ensureAutoRefresh() {
  if (autoRefreshTimer || !state.user) return;
  autoRefreshTimer = setInterval(async () => {
    if (!state.user) return;
    if (document.activeElement?.matches("input, select, textarea")) return;
    await loadAll();
    render();
  }, 60_000);
}

async function boot() {
  try {
    await loadAll();
  } catch {
    state.user = null;
  }
  render();
}

function render() {
  if (!state.user) {
    app.innerHTML = loginTemplate();
    bindLogin();
    return;
  }

  if (state.view === "sales" && !canViewSales()) state.view = "dashboard";
  if ((state.view === "settings" || state.view === "expenseReview") && state.user.role !== "admin") state.view = "dashboard";
  const nav = availableNavItems();
  if (!nav.some(([key]) => key === state.view)) state.view = "dashboard";
  const current = nav.find(([key]) => key === state.view) ?? nav[0];

  app.innerHTML = `
    <div class="shell ${state.user.role === "admin" ? "adminShell" : "memberShell"}">
      <aside class="sidebar">
        <div class="brandBlock">
          <img src="/smart-sales-logo.png" alt="Smart Sales" class="brandLogo">
          <div class="productName">Staff Suite</div>
        </div>
        <div class="profilePanel">
          <div class="profileName">${escapeHtml(state.user.name)}</div>
          <div class="profileRole">${state.user.role === "admin" ? "管理者" : "一般ユーザー"} / ${state.user.employmentType || "未設定"}</div>
        </div>
        <nav class="nav">
          ${nav.map(([key, label, icon]) => `
            <button type="button" class="${state.view === key ? "active" : ""}" data-view="${key}" title="${label}">
              <span class="navIcon">${icon}</span>
              <span>${label}</span>
            </button>
          `).join("")}
        </nav>
        <button class="secondary logoutButton" id="logout">ログアウト</button>
      </aside>
      <main class="main">
        <div class="topbar">
          <div>
            <p class="eyebrow">Smart Sales / Staff Suite</p>
            <h1>${current[1]}</h1>
          </div>
          <button id="refresh" class="secondary">更新</button>
        </div>
        ${viewTemplate()}
      </main>
    </div>
    ${state.toast ? `<div class="toast">${escapeHtml(state.toast)} ${state.undoId ? `<button id="undoButton" class="secondary">Undo</button>` : ""}</div>` : ""}
    ${exportModalTemplate()}
  `;
  bindShell();
}

function loginTemplate() {
  return `
    <div class="login">
      <section class="loginPanel">
        <img src="/smart-sales-logo.png" alt="Smart Sales" class="loginLogo">
        <h1>Staff Suite</h1>
        <p class="muted">人材・シフト・請求を一つにまとめる業務管理ツール</p>
        <form class="form" id="loginForm">
          <label>メールアドレス<input name="email" value="admin@example.com" autocomplete="email"></label>
          <label>パスワード<input name="password" type="password" value="password" autocomplete="current-password"></label>
          <button>ログイン</button>
        </form>
      </section>
    </div>
  `;
}

function viewTemplate() {
  if (state.view === "dashboard") return dashboardTemplate();
  if (state.view === "announcements") return announcementsTemplate();
  if (state.view === "calendar") return calendarTemplate();
  if (state.view === "shifts") return shiftsTemplate();
  if (state.view === "holidays") return holidaysTemplate();
  if (state.view === "sites") return sitesTemplate();
  if (state.view === "users") return usersTemplate();
  if (state.view === "expenses") return expensesTemplate();
  if (state.view === "expenseReview") return expenseReviewTemplate();
  if (state.view === "payslips") return payslipsTemplate();
  if (state.view === "sales") return salesTemplate();
  if (state.view === "clock") return clockTemplate();
  if (state.view === "invoices") return invoicesTemplate();
  if (state.view === "chat") return chatTemplate();
  if (state.view === "data") return dataTemplate();
  if (state.view === "settings") return settingsTemplate();
  return "";
}

function dashboardTemplate() {
  if (state.user.role !== "admin") return memberDashboardTemplate();
  return `
    <section class="heroBand">
      <div>
        <p class="eyebrow">Today</p>
        <h2>本日の稼働と申請状況</h2>
      </div>
      <div class="heroMetrics">
        ${metric("今日のシフト", state.summary.todayShiftCount)}
        ${metric("承認待ち現場", state.summary.pendingSiteCount)}
        ${metric("希望休申請", state.summary.pendingHolidayCount)}
      </div>
    </section>
    <section class="grid cols-2">
      <div class="card">
        <h2>表示可能な人材</h2>
        <div class="metric">${state.summary.visibleUserCount}</div>
        <p class="muted">${state.user.role === "admin" ? "管理者はすべてのユーザーを確認できます。" : "一般ユーザーは自分と、自分が登録した人材の範囲を確認できます。"}</p>
      </div>
      <div class="card">
        <h2>監査ログ</h2>
        ${(state.summary.recentAuditLogs || []).length ? state.summary.recentAuditLogs.map((log) => `<div class="listRow"><span class="badge">${log.action}</span><span>${log.targetTable}</span><span class="muted">${dateTime(log.createdAt)}</span></div>`).join("") : `<p class="muted">管理者のみ表示されます。</p>`}
      </div>
    </section>
  `;
}

function memberDashboardTemplate() {
  const ownShifts = state.shifts
    .filter((shift) => shift.userId === state.user.id || shift.userName === state.user.name)
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  const now = new Date();
  const upcoming = ownShifts.filter((shift) => new Date(shift.endAt) >= now).slice(0, 4);
  const nextShift = upcoming[0];
  const ownExpenses = state.summary?.expenseStats || { pending: 0, approved: 0, rejected: 0 };
  const recentAnnouncements = state.announcements.slice(0, 3);
  return `
    <section class="memberHero">
      <div>
        <p class="eyebrow">My Work</p>
        <h2>${escapeHtml(state.user.name)}さんの今日の確認</h2>
        <p class="muted">出勤、予定、申請をここからすぐ確認できます。</p>
      </div>
      <div class="memberHeroActions">
        <button type="button" data-view-shortcut="clock">出退勤</button>
        <button type="button" class="secondary" data-view-shortcut="expenses">経費申請</button>
        <button type="button" class="secondary" data-view-shortcut="chat">チャット</button>
      </div>
    </section>
    <section class="memberOverview">
      <div class="memberFocusCard">
        <span class="badge">次の予定</span>
        ${nextShift ? `
          <h3>${dateTime(nextShift.startAt)}</h3>
          <p>${escapeHtml(nextShift.siteName)}</p>
          <strong class="statusPill status-${nextShift.status}">${escapeHtml(nextShift.statusLabel)}</strong>
        ` : `
          <h3>予定はありません</h3>
          <p class="muted">新しい予定が入るとここに表示されます。</p>
        `}
      </div>
      ${metric("自分の予定", `${ownShifts.length}件`)}
      ${metric("経費 承認待ち", `${ownExpenses.pending || 0}件`)}
      ${metric("希望休 申請", `${state.holidays.filter((item) => item.userId === state.user.id).length}件`)}
    </section>
    <section class="grid cols-2">
      <div class="card">
        <div class="sectionHeader">
          <h2>直近の予定</h2>
          <button type="button" class="secondary" data-view-shortcut="calendar">カレンダー</button>
        </div>
        ${upcoming.length ? upcoming.map((shift) => `
          <div class="listRow">
            <div>
              <strong>${dateTime(shift.startAt)}</strong>
              <p>${escapeHtml(shift.siteName)} / ${escapeHtml(shift.statusLabel)}</p>
            </div>
            <span class="badge">${timeOnly(shift.startAt)}</span>
          </div>
        `).join("") : `<p class="muted">直近の予定はありません。</p>`}
      </div>
      <div class="card">
        <div class="sectionHeader">
          <h2>お知らせ</h2>
          <button type="button" class="secondary" data-view-shortcut="announcements">開く</button>
        </div>
        ${recentAnnouncements.length ? recentAnnouncements.map((item) => `
          <div class="listRow">
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <p>${escapeHtml(item.body).slice(0, 80)}</p>
            </div>
            <span class="badge">${dateTime(item.createdAt)}</span>
          </div>
        `).join("") : `<p class="muted">新しいお知らせはありません。</p>`}
      </div>
    </section>
    <section class="card">
      <h2>よく使う操作</h2>
      <div class="quickActionGrid">
        <button type="button" class="quickAction" data-view-shortcut="clock"><strong>出退勤</strong><span>今日の打刻</span></button>
        <button type="button" class="quickAction" data-view-shortcut="shifts"><strong>シフト</strong><span>予定を確認</span></button>
        <button type="button" class="quickAction" data-view-shortcut="holidays"><strong>希望休</strong><span>休みを申請</span></button>
        <button type="button" class="quickAction" data-view-shortcut="expenses"><strong>経費</strong><span>申請を保存</span></button>
        <button type="button" class="quickAction" data-view-shortcut="payslips"><strong>給与明細</strong><span>明細を確認</span></button>
        <button type="button" class="quickAction" data-view-shortcut="chat"><strong>チャット</strong><span>連絡とタスク</span></button>
      </div>
    </section>
  `;
}

function announcementsTemplate() {
  const allTags = [...new Set(state.announcements.flatMap((item) => item.tags || []))];
  const q = state.announcementSearch.trim().toLowerCase();
  const visibleAnnouncements = state.announcements.filter((item) => {
    const haystack = `${item.title} ${item.body} ${item.authorName} ${(item.tags || []).join(" ")}`.toLowerCase();
    return (!q || haystack.includes(q)) && (!state.announcementTagFilter || (item.tags || []).includes(state.announcementTagFilter));
  });
  return `
    <section class="grid announcementGrid">
      <div class="card">
        <h2>新規投稿</h2>
        <p class="muted">全ユーザーが確認できる掲示板です。投稿時にLINE通知先を選べます。</p>
        <form class="form" id="announcementForm">
          <label>タイトル<input name="title" placeholder="例: 明日の集合時間について"></label>
          <label>本文<textarea name="body" placeholder="共有したい内容を入力"></textarea></label>
          <label>タグ<input name="tags" placeholder="例: 重要 連絡"></label>
          <label>LINE通知先
            <select name="lineGroupId">
              <option value="">通知しない</option>
              ${state.lineGroups.map((group) => `<option value="${group.id}">${escapeHtml(group.name)}${group.hasWebhook ? "" : "（未設定）"}</option>`).join("")}
            </select>
          </label>
          <button>投稿</button>
        </form>
        ${state.user.role === "admin" ? `
          <div class="lineGroupBox">
            <h3>LINE通知先登録</h3>
            <form class="form compactForm" id="lineGroupForm">
              <label>グループ名<input name="name" placeholder="例: 全体連絡グループ"></label>
              <label>Webhook URL<input name="webhookUrl" placeholder="LINE通知用Webhook URL"></label>
              <button class="secondary">通知先を追加</button>
            </form>
          </div>
        ` : ""}
      </div>
      <div class="card boardPanel">
        <div class="sectionHeader">
          <div>
            <h2>掲示板</h2>
            <p class="muted">${visibleAnnouncements.length} / ${state.announcements.length} 件のお知らせ</p>
          </div>
          <button class="secondary" id="reloadAnnouncements">更新</button>
        </div>
        <div class="filterBar">
          <input id="announcementSearch" placeholder="検索" value="${escapeAttribute(state.announcementSearch)}">
          <select id="announcementTagFilter">
            <option value="">タグすべて</option>
            ${allTags.map((tag) => `<option value="${escapeAttribute(tag)}" ${selected(state.announcementTagFilter, tag)}>${escapeHtml(tag)}</option>`).join("")}
          </select>
        </div>
        <div class="announcementList">
          ${visibleAnnouncements.map((item) => `
            <article class="announcementItem" data-announcement-id="${item.id}" title="右クリックで削除">
              <div class="announcementMeta">
                <span>${escapeHtml(item.authorName)}</span>
                <span>${dateTime(item.createdAt)}</span>
                ${item.lineGroupName ? `<span>LINE: ${escapeHtml(item.lineGroupName)} / ${lineStatusLabel(item.lineStatus)}</span>` : ""}
              </div>
              <h3>${escapeHtml(item.title)}</h3>
              ${(item.tags || []).length ? `<div class="tagRow">${item.tags.map((tag) => `<span class="tagChip">#${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
              <p>${escapeHtml(item.body).replaceAll("\n", "<br>")}</p>
              ${item.lineMessage ? `<small>${escapeHtml(item.lineMessage)}</small>` : ""}
            </article>
          `).join("")}
          ${visibleAnnouncements.length ? "" : `<p class="muted">該当する投稿がありません。</p>`}
        </div>
      </div>
    </section>
  `;
}

function metric(label, value) {
  return `<div class="metricCard"><span>${label}</span><strong>${value}</strong></div>`;
}

function calendarTemplate() {
  const allTags = [...new Set(state.calendarEvents.flatMap((item) => item.tags || []))];
  const items = calendarItems();
  const days = groupCalendarItemsByDay(items);
  return `
    <section class="grid calendarWorkspace">
      <div class="card calendarFormPanel">
        <h2>新規予定</h2>
        <form class="form" id="calendarEventForm">
          <label>予定
            <select name="presetTitle">
              <option value="">記述式で入力</option>
              ${state.sites.map((site) => `<option value="${escapeAttribute(site.name)}">${escapeHtml(site.name)}</option>`).join("")}
              <option value="社内会議">社内会議</option>
              <option value="面談">面談</option>
              <option value="締切">締切</option>
            </select>
          </label>
          <label>予定名<input name="title" placeholder="予定を入力"></label>
          <label>開始<input name="startAt" type="datetime-local" required></label>
          <label>終了<input name="endAt" type="datetime-local"></label>
          <label>公開範囲
            <select name="visibility">
              <option value="public">全ユーザーに公開</option>
              <option value="private">非公開（自分のみ）</option>
            </select>
          </label>
          <label>タグ<input name="tags" placeholder="例: 重要 会議"></label>
          <button>予定を追加</button>
        </form>
      </div>
      <div class="card">
        <div class="sectionHeader">
          <div>
            <h2>予定カレンダー</h2>
            <p class="muted">シフトと公開予定をまとめて表示します。</p>
          </div>
          <span class="badge">${items.length} 件</span>
        </div>
        <div class="filterBar">
          <input id="calendarSearch" placeholder="検索" value="${escapeAttribute(state.calendarSearch)}">
          <select id="calendarTagFilter">
            <option value="">タグすべて</option>
            ${allTags.map((tag) => `<option value="${escapeAttribute(tag)}" ${selected(state.calendarTagFilter, tag)}>${escapeHtml(tag)}</option>`).join("")}
          </select>
        </div>
        <div class="calendar">
          ${days.map(([day, dayItems]) => `
            <div class="day">
              <strong>${day}</strong>
              ${dayItems.map((item) => calendarChip(item)).join("")}
            </div>`).join("")}
        </div>
      </div>
    </section>
  `;
}

function shiftsTemplate() {
  return `
    <section class="grid cols-2">
      <div class="card">
        <h2>シフト作成</h2>
        <form class="form" id="shiftForm" novalidate>
          <label>担当者<select name="userId">${state.users.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("")}</select></label>
          <label>現場<select name="siteId">${state.sites.filter((site) => site.status === "approved").map((site) => `<option value="${site.id}">${escapeHtml(site.name)}</option>`).join("")}</select></label>
          <label>開始日時<input name="startAt" type="datetime-local" value="${dateTimeInput(1, 9)}"></label>
          <label>終了日時<input name="endAt" type="datetime-local" value="${dateTimeInput(1, 18)}"></label>
          <label>単価上書き<input name="unitPriceOverride" type="number" min="0" placeholder="未入力なら既定単価"></label>
          <label>メモ<textarea name="memo"></textarea></label>
          <button>登録</button>
        </form>
      </div>
      <div class="card">
        <h2>一括登録</h2>
        ${state.user.role === "admin" ? bulkFormTemplate() : `<p class="muted">一括登録は管理者のみ利用できます。</p>`}
      </div>
    </section>
    <section class="card">
      <div class="sectionHeader">
        <h2>シフト一覧</h2>
        ${state.user.role === "admin" ? `<button class="danger" id="bulkDelete">表示中を一括削除</button>` : ""}
      </div>
      <div class="scheduleList">${state.shifts.map((shift) => shiftListRow(shift)).join("")}</div>
    </section>
  `;
}

function bulkFormTemplate() {
  return `
    <form class="form" id="bulkForm" novalidate>
      <label>担当者<select name="userId">${state.users.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("")}</select></label>
      <label>現場<select name="siteId">${state.sites.filter((site) => site.status === "approved").map((site) => `<option value="${site.id}">${escapeHtml(site.name)}</option>`).join("")}</select></label>
      <div class="grid cols-2">
        <label>開始日<input name="from" type="date" value="${dateInput(1)}"></label>
        <label>終了日<input name="to" type="date" value="${dateInput(7)}"></label>
      </div>
      <div class="grid cols-2">
        <label>開始時刻<input name="startTime" type="time" value="09:00" required></label>
        <label>終了時刻<input name="endTime" type="time" value="18:00" required></label>
      </div>
      <label>曜日<select name="weekday">
        <option value="1,2,3,4,5">平日</option>
        <option value="0,6">土日</option>
        <option value="0,1,2,3,4,5,6">毎日</option>
      </select></label>
      <button>一括登録</button>
    </form>
  `;
}

function groupShiftsByDay(shifts) {
  const map = new Map();
  for (const shift of shifts) {
    const day = new Intl.DateTimeFormat("ja-JP", { month: "2-digit", day: "2-digit", weekday: "short" }).format(new Date(shift.startAt));
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(shift);
  }
  return [...map.entries()].slice(0, 35);
}

function calendarItems() {
  const shiftItems = state.shifts.map((shift) => ({
    id: shift.id,
    type: "shift",
    startAt: shift.startAt,
    endAt: shift.endAt,
    title: `${shift.userName}`,
    subtitle: `${shift.siteName} / ${shift.statusLabel}`,
    status: shift.status,
    tags: [],
  }));
  const eventItems = state.calendarEvents.map((event) => ({
    id: event.id,
    type: "event",
    startAt: event.startAt,
    endAt: event.endAt,
    title: event.title,
    subtitle: event.visibility === "public" ? "全体公開" : "非公開",
    status: "event",
    tags: event.tags || [],
  }));
  const q = state.calendarSearch.trim().toLowerCase();
  return [...shiftItems, ...eventItems]
    .filter((item) => {
      const haystack = `${item.title} ${item.subtitle} ${(item.tags || []).join(" ")}`.toLowerCase();
      return (!q || haystack.includes(q)) && (!state.calendarTagFilter || (item.tags || []).includes(state.calendarTagFilter));
    })
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
}

function groupCalendarItemsByDay(items) {
  const map = new Map();
  for (const item of items) {
    const day = new Intl.DateTimeFormat("ja-JP", { month: "2-digit", day: "2-digit", weekday: "short" }).format(new Date(item.startAt));
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(item);
  }
  return [...map.entries()].slice(0, 35);
}

function shiftChip(shift) {
  return `
    <div class="shiftChip status-${shift.status}">
      <span>${timeOnly(shift.startAt)} ${escapeHtml(shift.userName)}</span>
      <small>${escapeHtml(shift.siteName)} / ${escapeHtml(shift.statusLabel)}</small>
    </div>
  `;
}

function calendarChip(item) {
  return `
    <div class="shiftChip status-${item.status}">
      <span>${timeOnly(item.startAt)} ${escapeHtml(item.title)}</span>
      <small>${escapeHtml(item.subtitle)}</small>
      ${(item.tags || []).length ? `<em>${item.tags.map((tag) => `#${escapeHtml(tag)}`).join(" ")}</em>` : ""}
    </div>
  `;
}

function shiftListRow(shift) {
  return `
    <div class="listRow shiftRow">
      <div>
        <strong>${escapeHtml(shift.userName)}</strong>
        <p>${escapeHtml(shift.siteName)} / ${dateTime(shift.startAt)} - ${timeOnly(shift.endAt)}</p>
      </div>
      <span class="badge status-${shift.status}">${escapeHtml(shift.statusLabel)}</span>
      <span>${yen(shift.visibleUnitPrice)}</span>
      ${state.user.role === "admin" ? `
        <div class="statusActions">
          <button class="secondary" data-shift-status="${shift.id}" data-status="clocked_in">出勤</button>
          <button class="secondary" data-shift-status="${shift.id}" data-status="late_clock_in">遅刻</button>
          <button class="secondary" data-shift-status="${shift.id}" data-status="cancelled">欠勤</button>
        </div>
      ` : ""}
    </div>
  `;
}

function holidaysTemplate() {
  return `
    <section class="grid cols-2">
      <div class="card">
        <h2>希望休申請</h2>
        <form class="form" id="holidayForm" novalidate>
          <label>日付<input type="date" name="date" value="${dateInput(1)}"></label>
          <label>理由<textarea name="reason"></textarea></label>
          <button>申請</button>
        </form>
      </div>
      <div class="card">
        <h2>申請一覧</h2>
        <table class="table">
          <thead><tr><th>日付</th><th>申請者</th><th>理由</th><th>状態</th><th></th></tr></thead>
          <tbody>
            ${state.holidays.map((item) => `
              <tr>
                <td>${item.date}</td>
                <td>${escapeHtml(item.userName || state.user.name)}</td>
                <td>${escapeHtml(item.reason || "")}</td>
                <td><span class="badge">${item.status}</span></td>
                <td>${state.user.role === "admin" && item.status === "pending" ? `<button data-holiday="${item.id}" data-status="approved">承認</button> <button class="danger" data-holiday="${item.id}" data-status="rejected">却下</button>` : ""}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function sitesTemplate() {
  return `
    <section class="grid cols-2">
      <div class="card">
        <h2>現場登録</h2>
        <form class="form" id="siteForm" novalidate>
          <label>現場名<input name="name" placeholder="例: 渋谷イベント会場"></label>
          <label>クライアント会社名<select id="clientCompanySelect">
            <option value="">直接入力</option>
            ${companyOptions()}
          </select></label>
          <label>会社名を入力<input id="clientCompanyInput" name="clientCompany"></label>
          <label>住所<input name="address"></label>
          <label>最寄り駅<input name="nearestStation"></label>
          ${state.user.role === "admin" ? `<label>案件単価<input name="projectUnitPrice" type="number" min="0"></label>` : ""}
          <label>備考<textarea name="memo"></textarea></label>
          <button>${state.user.role === "admin" ? "登録" : "承認申請"}</button>
        </form>
      </div>
      <div class="card">
        <h2>現場一覧</h2>
        <input id="siteSearch" placeholder="現場名・駅名で検索">
        <div id="siteList" style="margin-top:12px">${siteRows(state.sites)}</div>
      </div>
    </section>
  `;
}

function siteRows(sites) {
  return `
    <table class="table">
      <thead><tr><th>現場</th><th>駅</th><th>状態</th><th>案件単価</th></tr></thead>
      <tbody>${sites.map((site) => `
        <tr>
          <td>${escapeHtml(site.name)}<div class="muted">${escapeHtml(site.clientCompany || "")}</div></td>
          <td>${escapeHtml(site.nearestStation || "")}</td>
          <td><span class="badge">${site.status}</span></td>
          <td>${state.user.role === "admin" ? yen(site.projectUnitPrice) : "非表示"}</td>
        </tr>`).join("")}</tbody>
    </table>
  `;
}

function companyOptions() {
  const names = [...new Set(state.sites.map((site) => site.clientCompany).filter(Boolean))];
  return names.map((name) => `<option value="${escapeAttribute(name)}">${escapeHtml(name)}</option>`).join("");
}

function usersTemplate() {
  const editingUser = state.users.find((user) => user.id === state.editingUserId);
  const canAdminEditUsers = state.user.role === "admin";
  return `
    <section class="grid cols-2">
      <div class="card">
        <div class="sectionHeader">
          <h2>${editingUser ? "人材編集" : "人材登録"}</h2>
          ${editingUser ? `<button class="secondary" id="cancelUserEdit" type="button">新規登録に戻る</button>` : ""}
        </div>
        <form class="form" id="userForm">
          <label>氏名<input name="name" value="${escapeAttribute(editingUser?.name || "")}" required></label>
          <label>メール<input name="email" type="email" value="${escapeAttribute(editingUser?.email || "")}" required></label>
          ${canAdminEditUsers ? `<label>パスワード<input name="password" type="password" placeholder="${editingUser ? "変更する場合のみ入力" : "未入力なら password"}" autocomplete="new-password"></label>` : ""}
          <label>雇用形態<select name="employmentType">
            <option value="employee" ${selected(editingUser?.employmentType, "employee")}>社員</option>
            <option value="contractor" ${selected(editingUser?.employmentType, "contractor")}>個人事業主</option>
            <option value="part_time" ${selected(editingUser?.employmentType, "part_time")}>アルバイト</option>
          </select></label>
          ${state.user.role === "admin" ? `<label>基準単価<input name="defaultUnitPrice" type="number" min="0" value="${escapeAttribute(editingUser?.visibleUnitPrice ?? "")}"></label>` : ""}
          <label>親から見える単価<input name="parentVisibleUnitPrice" type="number" min="0" value="${escapeAttribute(editingUser?.visibleUnitPrice ?? "")}"></label>
          <label>時給<input name="hourlyRate" type="number" min="0" value="${escapeAttribute(editingUser?.hourlyRate ?? "")}"></label>
          <label>月給<input name="monthlySalary" type="number" min="0" value="${escapeAttribute(editingUser?.monthlySalary ?? "")}"></label>
          <label>インボイス番号<input name="invoiceNumber" value="${escapeAttribute(editingUser?.invoiceNumber || "")}"></label>
          <label>アイコン写真<input id="userIconFile" type="file" accept="image/*"></label>
          <input type="hidden" name="iconDataUrl" id="userIconDataUrl" value="${escapeAttribute(state.userIconDraft || editingUser?.iconDataUrl || "")}">
          <div id="userIconPreview" class="iconPreview">${userAvatar({ name: editingUser?.name || "未設定", iconDataUrl: state.userIconDraft || editingUser?.iconDataUrl || "" })}</div>
          <button>${editingUser ? "保存" : "登録"}</button>
        </form>
        ${!canAdminEditUsers ? `<p class="muted">一般ユーザーは人材情報を編集できません。</p>` : ""}
      </div>
      <div class="card">
        <h2>人材一覧</h2>
        <table class="table">
          <thead><tr><th>アイコン</th><th>氏名</th><th>雇用形態</th><th>見える単価</th><th>月給</th><th>親</th><th></th></tr></thead>
          <tbody>${state.users.map((user) => `
            <tr>
              <td>${userAvatar(user)}</td>
              <td>${escapeHtml(user.name)}<div class="muted">${escapeHtml(user.email)}</div></td>
              <td>${employmentLabel(user.employmentType)}</td>
              <td>${yen(user.visibleUnitPrice)}</td>
              <td>${user.monthlySalary ? yen(user.monthlySalary) : "-"}</td>
              <td>${escapeHtml(state.users.find((item) => item.id === user.parentUserId)?.name || "-")}</td>
              <td>${canAdminEditUsers ? `<button data-edit-user="${user.id}">編集</button>` : `<span class="muted">編集不可</span>`}</td>
            </tr>`).join("")}</tbody>
        </table>
      </div>
    </section>
  `;
}

function visibleExpenseRows(userId = "") {
  const rows = state.shifts.slice(0, 10).map((shift, index) => {
    const amount = index % 3 === 0 ? 1320 : index % 3 === 1 ? 880 : 2420;
    const category = index % 3 === 2 ? "交通費（車）" : "交通費（電車）";
    return {
      id: shift.id,
      userId: shift.userId,
      userName: shift.userName,
      siteName: shift.siteName,
      date: shift.startAt,
      category,
      amount,
      status: index % 4 === 0 ? "承認待ち" : "承認済み",
      warning: category === "交通費（車）" ? "駐車場代は対象外" : "",
    };
  });
  return userId ? rows.filter((row) => row.userId === userId) : rows;
}

function expenseDateAllowed(dateValue, siteId) {
  if (!dateValue || !siteId) return false;
  const target = new Date(`${dateValue}T00:00:00+09:00`);
  return state.shifts.some((shift) => {
    if (shift.siteId !== siteId) return false;
    const workDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(shift.startAt));
    const start = new Date(`${workDate}T00:00:00+09:00`);
    const deadline = new Date(start);
    deadline.setDate(deadline.getDate() + 5);
    return target >= start && target <= deadline;
  });
}

function currentPayslipUser() {
  const fallback = state.user.role === "admin" ? state.users[0] : state.user;
  const id = state.selectedPayslipUserId || fallback?.id;
  return state.users.find((user) => user.id === id) || fallback;
}

function monthlySalesRows() {
  const rows = new Map();
  for (const shift of state.shifts.filter((item) => item.status !== "cancelled")) {
    const month = new Intl.DateTimeFormat("ja-JP", { month: "short" }).format(new Date(shift.startAt));
    const current = rows.get(month) || { month, sales: 0, cost: 0 };
    const user = state.users.find((item) => item.id === shift.userId);
    const sales = Number(user?.visibleUnitPrice || shift.visibleUnitPrice || 0);
    current.sales += sales;
    current.cost += Math.round(sales * 0.62);
    rows.set(month, current);
  }
  return [...rows.values()].map((row) => ({ ...row, profit: row.sales - row.cost }));
}

function expensesTemplate() {
  return `
    <section class="grid cols-2">
      <div class="card">
        <h2>経費申請</h2>
        <form class="form" id="expenseForm" novalidate>
          <label>日付<input name="date" type="date" value="${dateInput()}"></label>
          <label>案件<select name="siteId">${state.sites.filter((site) => site.status === "approved").map((site) => `<option value="${site.id}">${escapeHtml(site.name)}</option>`).join("")}</select></label>
          <label>種別<select name="category"><option>交通費（電車）</option><option>交通費（車）</option><option>その他</option></select></label>
          <label>金額<input name="amount" type="number" min="0" placeholder="車の場合は 11円/km で計算"></label>
          <label>メモ<textarea name="memo" placeholder="駐車場代は申請対象外です"></textarea></label>
          <p class="notice compact">申請期限は稼働日から5日以内です。</p>
          <button>申請を保存</button>
        </form>
      </div>
      <div class="card">
        <h2>当月サマリー</h2>
        <div class="stackedStats">
          ${metric("申請中", 0)}
          ${metric("承認済み", 0)}
          ${metric("今月合計", "0円")}
        </div>
      </div>
    </section>
  `;
}

function expenseReviewTemplate() {
  const selectedUserId = state.selectedExpenseUserId || "";
  const rows = visibleExpenseRows(selectedUserId);
  return `
    <section class="card">
      <div class="sectionHeader">
        <div>
          <h2>経費確認</h2>
          <p class="muted">一般ユーザーごとに個別の経費を確認できます。</p>
        </div>
        <label class="compactSelect">スタッフ
          <select id="expenseUserSelect">
            <option value="">すべて</option>
            ${state.users.filter((user) => user.role !== "admin").map((user) => `<option value="${user.id}" ${selected(user.id, selectedUserId)}>${escapeHtml(user.name)}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="stackedStats">
        ${metric("承認待ち", rows.filter((row) => row.status === "承認待ち").length)}
        ${metric("重複警告", 0)}
        ${metric("駐車場代警告", rows.filter((row) => row.warning).length)}
      </div>
      <table class="table">
        <thead><tr><th>日付</th><th>スタッフ</th><th>案件</th><th>種別</th><th>金額</th><th>状態</th></tr></thead>
        <tbody>${rows.map((row) => `
          <tr>
            <td>${dateTime(row.date)}</td>
            <td>${escapeHtml(row.userName)}</td>
            <td>${escapeHtml(row.siteName)}</td>
            <td>${escapeHtml(row.category)}${row.warning ? `<div class="muted">${row.warning}</div>` : ""}</td>
            <td>${yen(row.amount)}</td>
            <td><span class="badge">${row.status}</span></td>
          </tr>
        `).join("")}</tbody>
      </table>
    </section>
  `;
}

function payslipsTemplate() {
  const user = currentPayslipUser();
  const shifts = state.shifts.filter((shift) => shift.userId === user?.id && shift.status !== "cancelled");
  const unitPrice = Number(user?.visibleUnitPrice || 0);
  const gross = unitPrice * shifts.length;
  const tax = Math.round(gross * 0.1021);
  return `
    <section class="grid cols-2">
      <div class="card">
        <div class="sectionHeader">
          <div>
            <h2>給与明細</h2>
            <p class="muted">雇用形態別の給与明細PDFを確認・出力するページです。</p>
          </div>
          ${state.user.role === "admin" ? `<label class="compactSelect">スタッフ<select id="payslipUserSelect">${state.users.map((item) => `<option value="${item.id}" ${selected(item.id, user?.id)}>${escapeHtml(item.name)}</option>`).join("")}</select></label>` : ""}
        </div>
        <div class="chipGrid">
          <span class="featureChip">今月の明細</span>
          <span class="featureChip">翌月末払い</span>
          <span class="featureChip">ロゴ・捺印対応</span>
        </div>
      </div>
      <div class="card documentPreview">
        <p class="eyebrow">Preview</p>
        <h2>給与明細プレビュー</h2>
        <div class="previewLine"><span>対象者</span><strong>${escapeHtml(user?.name || "-")}</strong></div>
        <div class="previewLine"><span>雇用形態</span><strong>${employmentLabel(user?.employmentType || "")}</strong></div>
        <div class="previewLine"><span>設定単価</span><strong>${yen(unitPrice)}</strong></div>
        <div class="previewLine"><span>稼働数</span><strong>${shifts.length}件</strong></div>
        <div class="previewLine total"><span>支給額</span><strong>${yen(gross)}</strong></div>
        <p class="muted">計算式: 設定単価 × 稼働日数</p>
        <div class="previewLine"><span>源泉目安</span><strong>${yen(tax)}</strong></div>
      </div>
    </section>
  `;
}

function salesTemplate() {
  const rows = monthlySalesRows();
  const max = Math.max(1, ...rows.map((row) => row.sales));
  const maxBar = Math.max(1, ...rows.flatMap((row) => [row.sales, row.cost, row.profit]));
  const totals = rows.reduce((sum, row) => ({
    sales: sum.sales + row.sales,
    cost: sum.cost + row.cost,
    profit: sum.profit + row.profit,
  }), { sales: 0, cost: 0, profit: 0 });
  const target = Number(state.salesTarget || 0);
  const targetDiff = totals.sales - target;
  if (state.user.role !== "admin") {
    return `
      <section class="card">
        <div class="sectionHeader">
          <div>
            <h2>売上試算表</h2>
            <p class="muted">全体の売上、目標、利益、目標との差額のみ表示します。</p>
          </div>
        </div>
        <div class="stackedStats">
          ${metric("全体売上", yen(totals.sales))}
          ${metric("目標売上", yen(target))}
          ${metric("利益", yen(totals.profit))}
        </div>
        <div class="metricCard">
          <span>目標との差額</span>
          <strong>${yen(targetDiff)}</strong>
        </div>
      </section>
    `;
  }
  return `
    <section class="card">
      <div class="sectionHeader">
        <div>
          <h2>売上試算表</h2>
          <p class="muted">月毎の売上・原価・粗利の推移を表示します。</p>
        </div>
        <label class="compactSelect">目標金額
          <input id="salesTargetInput" type="number" min="0" value="${escapeAttribute(target)}">
        </label>
      </div>
      <div class="stackedStats">
        ${metric("売上", yen(totals.sales))}
        ${metric("目標売上", yen(target))}
        ${metric("原価", yen(totals.cost))}
        ${metric("粗利", yen(totals.profit))}
      </div>
      <div class="metricCard">
        <span>目標との差額</span>
        <strong>${yen(targetDiff)}</strong>
      </div>
      <div class="trendChart">
        ${rows.map((row) => `
          <div class="trendRow">
            <span>${row.month}</span>
            <div class="trendTrack"><i style="width:${Math.max(8, Math.round((row.sales / max) * 100))}%"></i></div>
            <strong>${yen(row.sales)}</strong>
          </div>
        `).join("")}
      </div>
      <div class="salesBars">
        ${rows.map((row) => `
          <div class="salesBarMonth">
            <strong>${row.month}</strong>
            <div class="barLine"><span>売上</span><i class="barSales" style="width:${Math.max(6, Math.round((row.sales / maxBar) * 100))}%"></i><b>${yen(row.sales)}</b></div>
            <div class="barLine"><span>原価</span><i class="barCost" style="width:${Math.max(6, Math.round((row.cost / maxBar) * 100))}%"></i><b>${yen(row.cost)}</b></div>
            <div class="barLine"><span>粗利</span><i class="barProfit" style="width:${Math.max(6, Math.round((row.profit / maxBar) * 100))}%"></i><b>${yen(row.profit)}</b></div>
          </div>
        `).join("")}
      </div>
      <table class="table projectionTable">
        <thead><tr><th>月</th><th>売上</th><th>目標</th><th>原価</th><th>粗利</th><th>達成率</th><th>差額</th></tr></thead>
        <tbody>${rows.map((row) => `
          <tr>
            <td>${row.month}</td>
            <td>${yen(row.sales)}</td>
            <td>${yen(target)}</td>
            <td>${yen(row.cost)}</td>
            <td>${yen(row.profit)}</td>
            <td>${target ? Math.round((row.sales / target) * 100) : 0}%</td>
            <td>${yen(row.sales - target)}</td>
          </tr>
        `).join("")}</tbody>
      </table>
    </section>
  `;
}

function clockTemplate() {
  const ownShifts = (state.user.role === "admin" ? state.shifts : state.shifts.filter((shift) => shift.userName === state.user.name)).slice(0, 12);
  const statusOptions = [
    ["scheduled", "稼働前"],
    ["clocked_in", "出勤"],
    ["late_clock_in", "遅刻"],
    ["cancelled", "欠勤"],
  ];
  return `
    <section class="card">
      <h2>出退勤</h2>
      <p class="notice">出勤・退勤の通知時刻を保存します。管理者はスタッフ全員の打刻を確認できます。</p>
      <table class="table">
        <thead><tr><th>日時</th><th>スタッフ</th><th>現場</th><th>状態</th><th>打刻</th></tr></thead>
        <tbody>${ownShifts.map((shift) => `
          <tr>
            <td>${dateTime(shift.startAt)} - ${timeOnly(shift.endAt)}</td>
            <td>${escapeHtml(shift.userName)}</td>
            <td>${escapeHtml(shift.siteName)}</td>
            <td>
              ${state.user.role === "admin" ? `
                <select class="statusSelect status-${shift.status}" data-clock-status="${shift.id}" aria-label="状態">
                  ${statusOptions.map(([value, label]) => `<option value="${value}" ${selected(shift.status, value)}>${label}</option>`).join("")}
                </select>
              ` : `<span class="badge status-${shift.status}">${escapeHtml(shift.statusLabel)}</span>`}
            </td>
            <td>
              <div class="clockActions">
                <button data-clock-in="${shift.id}">出勤</button>
                <button data-clock-out="${shift.id}">退勤</button>
                ${state.user.role === "admin" ? `<button class="secondary" data-clock-absent="${shift.id}">欠勤</button>` : ""}
              </div>
            </td>
          </tr>`).join("")}</tbody>
      </table>
      ${ownShifts.length ? "" : `<p class="muted">打刻できるシフトがありません。</p>`}
    </section>
  `;
}

function invoicesTemplate() {
  const rows = state.shifts.filter((shift) => shift.status !== "cancelled").slice(0, 16);
  const total = rows.reduce((sum, shift) => {
    const user = state.users.find((item) => item.id === shift.userId);
    return sum + Number(user?.visibleUnitPrice || shift.visibleUnitPrice || 0);
  }, 0);
  return `
    <section class="grid cols-2">
      <div class="card">
        <h2>請求書</h2>
        <p class="muted">既存Excelフォーマット準拠の見積書・請求書を生成するページです。</p>
        <div class="chipGrid">
          <button class="secondary" id="invoiceExcel">Excel出力</button>
          <button class="secondary" id="invoicePdf">PDF出力</button>
          <span class="featureChip">T番号対応</span>
        </div>
      </div>
      <div class="card documentPreview invoicePaper">
        <p class="eyebrow">Preview</p>
        <h2>請求書プレビュー</h2>
        <div class="previewLine"><span>請求先</span><strong>${escapeHtml(state.sites[0]?.clientCompany || "-")}</strong></div>
        <div class="previewLine"><span>対象件数</span><strong>${rows.length}件</strong></div>
        <table class="table invoicePreviewTable">
          <tbody>${rows.slice(0, 5).map((shift, index) => `
            <tr><td>${index + 1}</td><td>${escapeHtml(shift.siteName)} / ${escapeHtml(shift.userName)}</td><td>${yen(state.users.find((item) => item.id === shift.userId)?.visibleUnitPrice || shift.visibleUnitPrice)}</td></tr>
          `).join("")}</tbody>
        </table>
        <div class="previewLine total"><span>小計</span><strong>${yen(total)}</strong></div>
        <div class="previewLine"><span>消費税</span><strong>${yen(Math.round(total * 0.1))}</strong></div>
        <div class="previewLine total"><span>請求額</span><strong>${yen(Math.round(total * 1.1))}</strong></div>
      </div>
    </section>
  `;
}

function chatTemplate() {
  const thread = state.chatThreads.find((item) => item.id === state.selectedChatThreadId) ?? state.chatThreads[0];
  const hasSelectedThread = Boolean(state.selectedChatThreadId && thread);
  const otherUsers = state.users.filter((user) => user.id !== state.user.id);
  const participantIds = thread?.participantIds ?? [];
  const taskUsers = state.users.filter((user) => participantIds.includes(user.id));
  const allTags = [...new Set(state.chatThreads.flatMap((item) => item.tags || []))];
  const q = state.chatSearch.trim().toLowerCase();
  const visibleThreads = state.chatThreads.filter((item) => {
    const haystack = `${item.name} ${item.participantNames?.join(" ")} ${(item.tags || []).join(" ")}`.toLowerCase();
    return (!q || haystack.includes(q)) && (!state.chatTagFilter || (item.tags || []).includes(state.chatTagFilter));
  });
  return `
    <section class="chatWorkspace ${hasSelectedThread ? "roomOpen" : "listOpen"}">
      <aside class="chatSidebar">
        <div class="chatPanelHeader">
          <strong>チャット</strong>
          <button type="button" class="secondary" id="newGroupChat">全体</button>
        </div>
        <div class="chatSearchBox">
          <input id="chatSearch" placeholder="検索" value="${escapeAttribute(state.chatSearch)}">
          <select id="chatTagFilter">
            <option value="">タグすべて</option>
            ${allTags.map((tag) => `<option value="${escapeAttribute(tag)}" ${selected(state.chatTagFilter, tag)}>${escapeHtml(tag)}</option>`).join("")}
          </select>
        </div>
        <div class="threadList">
          ${visibleThreads.map((item) => `
            <button type="button" class="threadButton ${item.id === thread?.id ? "active" : ""}" data-thread="${item.id}" title="右クリックで削除">
              ${avatarStack(item.participants || [], item.type === "group" ? "#" : item.name.slice(0, 1))}
              <span>
                <strong>${escapeHtml(item.name)}</strong>
                <small>${escapeHtml(item.participantNames?.join("、") || "")}</small>
                ${(item.tags || []).length ? `<em>${item.tags.map((tag) => `#${escapeHtml(tag)}`).join(" ")}</em>` : ""}
              </span>
            </button>
          `).join("")}
        </div>
        <form class="form compactForm directComposer" id="newDirectChat">
          <label>個人チャット
            <select name="participantId">
              ${otherUsers.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("")}
            </select>
          </label>
          <button>作成して開く</button>
        </form>
      </aside>
      <div class="chatMain">
        ${thread ? `
          <div class="chatHeader">
            <div>
              ${avatarStack(thread.participants || [], thread.type === "group" ? "#" : thread.name.slice(0, 1))}
              <h2>${escapeHtml(thread.name)}</h2>
              <p class="muted">${escapeHtml(thread.participantNames?.join("、") || "")}</p>
              <form id="threadTagForm" class="tagEditor">
                <input name="tag" placeholder="タグ追加" list="chatTagOptions">
                <button type="submit" class="secondary">追加</button>
                <datalist id="chatTagOptions">${allTags.map((tag) => `<option value="${escapeAttribute(tag)}"></option>`).join("")}</datalist>
              </form>
              <div class="tagRow">${(thread.tags || []).map((tag) => `<button type="button" class="tagChip" data-remove-tag="${escapeAttribute(tag)}">#${escapeHtml(tag)} ×</button>`).join("")}</div>
            </div>
            <div class="chatHeaderActions">
              <button class="secondary mobileBackButton" type="button" id="backToThreads">戻る</button>
              <button class="secondary" id="shareCalendar">カレンダー共有</button>
            </div>
          </div>
          <div class="messageList" id="chatMessages">
            ${state.chatMessages.map((message) => `
              ${messageBubbleTemplate(message)}
            `).join("")}
            ${state.chatMessages.length ? "" : `<p class="muted">まだメッセージがありません。</p>`}
          </div>
          <form class="chatComposer" id="chatForm">
            <textarea name="text" placeholder="メッセージ"></textarea>
            <p class="muted attachmentNotice">添付は1件800KB以下、最大4件まで送信できます。</p>
            <div class="composerActions">
              <label class="fileButton iconOnly" title="ファイル">＋<input id="chatFile" type="file" hidden></label>
              <button type="button" class="fileButton iconOnly taskModeButton ${state.chatTaskMode ? "active" : ""}" id="openTaskPanel" title="タスク"><img src="/task-icon.png" alt="タスク"></button>
              <span class="muted">${state.pendingAttachments.map((file) => file.name).join("、")}</span>
              <button>${state.chatTaskMode ? "タスクを送信" : "送信"}</button>
            </div>
          </form>
        ` : `<p class="muted">チャットを作成してください。</p>`}
      </div>
      <aside class="chatTaskPanel">
        <div class="chatPanelHeader">
          <strong>タスク管理</strong>
          <span class="badge">${state.chatTasks.length}件</span>
        </div>
        ${thread ? taskPanelTemplate(thread, taskUsers) : `<p class="muted">チャットを選択してください。</p>`}
      </aside>
    </section>
  `;
}

function taskPanelTemplate(thread, taskUsers) {
  return `
    <div class="taskList">
      ${state.chatTasks.map((task) => `
        <div class="taskItem task-${task.status}">
          <div>
            <h3>${escapeHtml(task.title)}</h3>
            <p>${escapeHtml(task.assigneeName)} / ${task.dueDate ? escapeHtml(task.dueDate) : "期限なし"}</p>
          </div>
          <select class="taskStatusSelect task-${task.status}" data-task-status="${task.id}" aria-label="タスク状態">
            <option value="requested" ${selected(task.status, "requested")}>依頼</option>
            <option value="in_progress" ${selected(task.status, "in_progress")}>進行中</option>
            <option value="done" ${selected(task.status, "done")}>完了</option>
          </select>
        </div>
      `).join("")}
      ${state.chatTasks.length ? "" : `<p class="muted">依頼中のタスクはありません。</p>`}
    </div>
    <form class="form compactForm" id="taskForm">
      <label>依頼内容<input name="title" placeholder="確認してほしい内容"></label>
      <label>担当者
        <select name="assigneeId">
          ${taskUsers.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("")}
        </select>
      </label>
      <label>期限<input name="dueDate" type="date"></label>
      <button>依頼</button>
    </form>
  `;
}

function messageBubbleTemplate(message) {
  const sender = state.users.find((user) => user.id === message.senderId);
  const isTask = String(message.text || "").startsWith("タスク依頼:");
  return `
    <div class="messageRow ${message.senderId === state.user.id ? "mine" : ""}">
      ${userAvatar(sender || { name: message.senderName, iconDataUrl: "" })}
      <div class="messageBubble ${message.senderId === state.user.id ? "mine" : ""} ${isTask ? "taskMessage" : ""}">
        <strong>${escapeHtml(message.senderName)}</strong>
        ${isTask ? `<h3>${escapeHtml(message.text.replace("タスク依頼:", "").trim())}</h3>` : `<p>${escapeHtml(message.text).replaceAll("\n", "<br>")}</p>`}
        ${message.attachments?.length ? `<div class="attachmentList">${message.attachments.map((file) => `
          <a class="attachmentChip" href="${escapeAttribute(file.dataUrl)}" download="${escapeAttribute(file.name)}">${escapeHtml(file.type.startsWith("image/") ? "写真" : "ファイル")}: ${escapeHtml(file.name)}</a>
        `).join("")}</div>` : ""}
      </div>
    </div>
  `;
}

function userAvatar(user, fallback = "") {
  const name = user?.name || fallback || "?";
  return user?.iconDataUrl
    ? `<span class="userAvatar" title="${escapeAttribute(name)}"><img src="${escapeAttribute(user.iconDataUrl)}" alt="${escapeAttribute(name)}" onerror="this.remove(); this.parentElement.classList.add('empty');"></span>`
    : `<span class="userAvatar empty" title="${escapeAttribute(name)}"><span>${escapeHtml(name.slice(0, 1))}</span></span>`;
}

function avatarStack(users, fallback = "#") {
  const list = users.slice(0, 5);
  return `<span class="avatarStack">${list.length ? list.map((user) => userAvatar(user)).join("") : `<span class="roomAvatar">${escapeHtml(fallback)}</span>`}</span>`;
}

function dataTemplate() {
  const rows = monthlySalesRows();
  const workCount = state.shifts.filter((shift) => shift.status === "clocked_in" || shift.status === "clocked_out").length;
  const absentCount = state.shifts.filter((shift) => shift.status === "cancelled").length;
  const lateCount = state.shifts.filter((shift) => shift.status === "late_clock_in" || shift.status === "late_clock_out").length;
  const totalSales = rows.reduce((sum, row) => sum + row.sales, 0);
  const totalProfit = rows.reduce((sum, row) => sum + row.profit, 0);
  const rate = state.shifts.length ? Math.round((workCount / state.shifts.length) * 100) : 0;
  return `
    <section class="card">
      <div class="sectionHeader">
        <div>
          <h2>データ分析</h2>
          <p class="muted">売上・稼働・経費の集計とCSV出力を行います。</p>
        </div>
        <button class="secondary" id="exportCsv">CSV出力</button>
      </div>
      <div class="stackedStats">
        ${metric("総売上", yen(totalSales))}
        ${metric("粗利", yen(totalProfit))}
        ${metric("稼働率", `${rate}%`)}
      </div>
      <table class="table">
        <thead><tr><th>月</th><th>売上</th><th>原価</th><th>粗利</th></tr></thead>
        <tbody>${rows.map((row) => `
          <tr><td>${row.month}</td><td>${yen(row.sales)}</td><td>${yen(row.cost)}</td><td>${yen(row.profit)}</td></tr>
        `).join("")}</tbody>
      </table>
      <div class="chipGrid">
        <span class="featureChip">出勤 ${workCount}件</span>
        <span class="featureChip">遅刻 ${lateCount}件</span>
        <span class="featureChip">欠勤 ${absentCount}件</span>
      </div>
    </section>
  `;
}

function settingsTemplate() {
  const selectedUserId = state.selectedSettingsUserId || state.users[0]?.id || "";
  const selectedUser = state.users.find((user) => user.id === selectedUserId);
  const permissions = state.selectedUserPermissions || {};
  const checked = (key) => permissions[key] === true ? "checked" : "";
  const value = (key, fallback = "") => permissions[key] ?? fallback;
  return `
    <section class="grid cols-2">
      <div class="card">
        <h2>ユーザー個別制限</h2>
        ${state.user.role === "admin" ? `
          <form class="form" id="permissionForm">
            <label>対象ユーザー
              <select id="settingsUserSelect" name="userId">
                ${state.users.map((user) => `<option value="${user.id}" ${selected(user.id, selectedUserId)}>${escapeHtml(user.name)} / ${escapeHtml(user.email)}</option>`).join("")}
              </select>
            </label>
            <div class="selectedUserCard">
              <strong>${escapeHtml(selectedUser?.name || "未選択")}</strong>
              <span>${escapeHtml(selectedUser?.role || "")} / ${employmentLabel(selectedUser?.employmentType || "")}</span>
            </div>
            <label class="settingRow"><span>案件単価の表示</span><input name="can_view_project_unit_price" type="checkbox" ${checked("can_view_project_unit_price")}></label>
            <label class="settingRow"><span>売上試算表の閲覧</span><input name="can_view_sales_projection" type="checkbox" ${checked("can_view_sales_projection")}></label>
            <label>稼働状況の閲覧範囲
              <select name="work_visibility_scope">
                <option value="self" ${selected(value("work_visibility_scope", "self"), "self")}>自分のみ</option>
                <option value="children" ${selected(value("work_visibility_scope", "self"), "children")}>自分と登録人材</option>
                <option value="all" ${selected(value("work_visibility_scope", "self"), "all")}>全員</option>
              </select>
            </label>
            <label class="settingRow"><span>請求書作成権限</span><input name="can_create_invoice" type="checkbox" ${checked("can_create_invoice")}></label>
            <label>データ分析のアクセス範囲
              <select name="analytics_scope">
                <option value="none" ${selected(value("analytics_scope", "none"), "none")}>なし</option>
                <option value="self" ${selected(value("analytics_scope", "none"), "self")}>自分のみ</option>
                <option value="children" ${selected(value("analytics_scope", "none"), "children")}>登録人材まで</option>
                <option value="all" ${selected(value("analytics_scope", "none"), "all")}>全体</option>
              </select>
            </label>
            <label>経費の月額上限<input name="monthly_expense_limit" type="number" min="0" value="${escapeAttribute(value("monthly_expense_limit", ""))}" placeholder="未入力なら制限なし"></label>
            <label class="settingRow"><span>出退勤位置情報の必須化</span><input name="requires_attendance_location" type="checkbox" ${checked("requires_attendance_location")}></label>
            <button>制限を保存</button>
          </form>
        ` : `<p class="muted">ユーザー個別制限の管理は管理者のみ利用できます。</p>`}
      </div>
      <div class="card">
        <h2>通知設定</h2>
        <p class="muted">Web Push、メール、LINE グループ連携の設定をここに集約します。</p>
        <label class="settingRow"><span>LINE グループ固定通知</span><input type="checkbox" checked></label>
      </div>
    </section>
  `;
}

function placeholderPage(title, description, chips) {
  return `
    <section class="card">
      <h2>${title}</h2>
      <p class="muted">${description}</p>
      <div class="chipGrid">${chips.map((chip) => `<span class="featureChip">${chip}</span>`).join("")}</div>
    </section>
  `;
}

function exportModalTemplate() {
  if (!state.exportModal) return "";
  const progress = Math.max(0, Math.min(100, state.exportModal.progress || 0));
  return `
    <div class="modalBackdrop">
      <section class="exportModal">
        <p class="eyebrow">Output</p>
        <h2>${escapeHtml(state.exportModal.title)}</h2>
        <p class="muted">${escapeHtml(state.exportModal.message || "")}</p>
        <div class="progressTrack"><i style="width:${progress}%"></i></div>
        <div class="progressText">${progress}%</div>
        ${state.exportModal.path ? `<p class="outputPath">${escapeHtml(state.exportModal.path)}</p>` : ""}
        ${state.exportModal.done ? `<button id="closeExportModal">閉じる</button>` : ""}
      </section>
    </div>
  `;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runInvoiceExport(kind) {
  const isExcel = kind === "excel";
  const title = isExcel ? "Excel出力中" : "PDF出力中";
  try {
    state.exportModal = { title, message: "テンプレートを準備しています。", progress: 12 };
    render();
    await sleep(260);
    state.exportModal = { title, message: "請求データを反映しています。", progress: 46 };
    render();
    const result = await api(isExcel ? "/api/invoices/save-excel" : "/api/invoices/save-pdf", { method: "POST" });
    state.exportModal = { title, message: "出力ファイルを保存しました。", progress: 82, path: result.path };
    render();
    await sleep(220);
    state.exportModal = { title: isExcel ? "Excel出力完了" : "PDF出力完了", message: "ファイルを作成しました。", progress: 100, path: result.path, done: true };
    render();
    openDownload(isExcel ? "/api/invoices/export-excel" : "/api/invoices/export-pdf");
  } catch (error) {
    state.exportModal = { title: "出力できませんでした", message: error.message, progress: 100, done: true };
    render();
  }
}

function downloadText(filename, text, type = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function openDownload(path) {
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.src = path;
  document.body.appendChild(frame);
  setTimeout(() => frame.remove(), 5000);
}

async function loadChat() {
  const result = await api("/api/chat/threads");
  state.chatThreads = result.threads;
  if (!state.selectedChatThreadId || !state.chatThreads.some((thread) => thread.id === state.selectedChatThreadId)) {
    state.selectedChatThreadId = state.chatThreads[0]?.id ?? null;
  }
  await loadChatMessages();
}

async function loadChatMessages() {
  if (!state.selectedChatThreadId) {
    state.chatMessages = [];
    state.chatTasks = [];
    return;
  }
  const result = await api(`/api/chat/messages?threadId=${encodeURIComponent(state.selectedChatThreadId)}`);
  state.chatMessages = result.messages;
  state.chatTasks = result.tasks;
}

function scrollChatToBottom() {
  requestAnimationFrame(() => {
    const list = document.querySelector("#chatMessages");
    if (list) list.scrollTop = list.scrollHeight;
  });
}

async function loadAnnouncements() {
  const [announcements, groups] = await Promise.all([
    api("/api/announcements"),
    api("/api/line-groups"),
  ]);
  state.announcements = announcements.announcements;
  state.lineGroups = groups.groups;
}

async function loadCalendarEvents() {
  const result = await api("/api/calendar-events");
  state.calendarEvents = result.events;
}

function readAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type || "application/octet-stream", dataUrl: reader.result });
    reader.onerror = () => reject(new Error("ファイルを読み込めませんでした。"));
    reader.readAsDataURL(file);
  });
}

function bindLogin() {
  document.querySelector("#loginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/auth/login", { method: "POST", body: Object.fromEntries(form) });
      await loadAll();
      render();
    } catch (error) {
      toast(error.message);
    }
  });
}

function bindShell() {
  document.querySelector(".nav")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    event.preventDefault();
    const nextView = button.dataset.view;
    if (!nextView || nextView === state.view) return;
    state.view = nextView;
    render();
    try {
      if (nextView === "settings" && state.user.role === "admin") await loadSelectedUserPermissions();
      if (nextView === "chat") {
        if (isMobileViewport()) state.selectedChatThreadId = null;
        await loadChat();
        if (isMobileViewport()) state.selectedChatThreadId = null;
      }
      if (nextView === "announcements") await loadAnnouncements();
      render();
    } catch (error) {
      toast(error.message);
    }
  });
  document.querySelectorAll("[data-view-shortcut]").forEach((button) => {
    button.addEventListener("click", async () => {
      const nextView = button.dataset.viewShortcut;
      if (!nextView) return;
      state.view = nextView;
      render();
      try {
        if (nextView === "chat") await loadChat();
        if (nextView === "announcements") await loadAnnouncements();
        render();
      } catch (error) {
        toast(error.message);
      }
    });
  });
  document.querySelector("#logout")?.addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST" });
    state.user = null;
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
    render();
  });
  document.querySelector("#refresh")?.addEventListener("click", async () => {
    await loadAll();
    if (state.view === "settings" && state.user.role === "admin") await loadSelectedUserPermissions();
    if (state.view === "chat") await loadChat();
    if (state.view === "announcements") await loadAnnouncements();
    toast("更新しました。");
  });
  document.querySelector("#undoButton")?.addEventListener("click", async () => {
    if (!state.undoId) return;
    await api("/api/shifts/undo-delete", { method: "POST", body: { undoId: state.undoId } });
    state.undoId = null;
    await loadAll();
    toast("Undo しました。");
  });
  document.querySelector("#closeExportModal")?.addEventListener("click", () => {
    state.exportModal = null;
    render();
  });
  bindForms();
  bindSettings();
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 760px)").matches;
}

function formObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function bindForms() {
  document.querySelector("#announcementForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/announcements", { method: "POST", body: formObject(event.currentTarget) });
      await loadAnnouncements();
      toast("お知らせを投稿しました。");
      render();
    } catch (error) {
      toast(error.message);
    }
  });

  document.querySelector("#lineGroupForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/line-groups", { method: "POST", body: formObject(event.currentTarget) });
      await loadAnnouncements();
      toast("LINE通知先を追加しました。");
      render();
    } catch (error) {
      toast(error.message);
    }
  });

  document.querySelector("#reloadAnnouncements")?.addEventListener("click", async () => {
    await loadAnnouncements();
    toast("お知らせを更新しました。");
    render();
  });

  document.querySelector("#announcementSearch")?.addEventListener("input", (event) => {
    state.announcementSearch = event.target.value;
    render();
  });
  document.querySelector("#announcementTagFilter")?.addEventListener("change", (event) => {
    state.announcementTagFilter = event.target.value;
    render();
  });
  document.querySelectorAll("[data-announcement-id]").forEach((item) => {
    item.addEventListener("contextmenu", async (event) => {
      event.preventDefault();
      if (!confirm("このお知らせを削除しますか？")) return;
      try {
        await api(`/api/announcements/${item.dataset.announcementId}`, { method: "DELETE" });
        await loadAnnouncements();
        toast("お知らせを削除しました。");
        render();
      } catch (error) {
        toast(error.message);
      }
    });
  });

  document.querySelector("#calendarEventForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const body = formObject(event.currentTarget);
      body.title = String(body.title || body.presetTitle || "").trim();
      delete body.presetTitle;
      await api("/api/calendar-events", { method: "POST", body });
      await loadCalendarEvents();
      toast("予定を追加しました。");
      render();
    } catch (error) {
      toast(error.message);
    }
  });

  document.querySelector("#calendarSearch")?.addEventListener("input", (event) => {
    state.calendarSearch = event.target.value;
    render();
  });
  document.querySelector("#calendarTagFilter")?.addEventListener("change", (event) => {
    state.calendarTagFilter = event.target.value;
    render();
  });

  document.querySelector("#shiftForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const body = formObject(event.currentTarget);
      if (!body.userId || !body.siteId || !body.startAt || !body.endAt) {
        toast("担当者・現場・開始日時・終了日時を入力してください。");
        return;
      }
      const result = await api("/api/shifts", { method: "POST", body });
      await loadAll();
      toast(result.warning || "シフトを登録しました。");
    } catch (error) {
      toast(error.message);
    }
  });

  document.querySelector("#bulkForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = formObject(event.currentTarget);
    if (!body.userId || !body.siteId || !body.from || !body.to || !body.startTime || !body.endTime) {
      toast("一括登録に必要な項目を入力してください。");
      return;
    }
    body.weekdays = body.weekday.split(",").map(Number);
    try {
      const result = await api("/api/shifts/bulk", { method: "POST", body });
      await loadAll();
      toast(`${result.shifts.length}件のシフトを一括登録しました。`);
    } catch (error) {
      toast(error.message);
    }
  });

  document.querySelector("#bulkDelete")?.addEventListener("click", async () => {
    if (!confirm("表示中のシフトを一括削除します。30秒以内なら Undo できます。")) return;
    const result = await api("/api/shifts/bulk-delete", { method: "POST", body: { shiftIds: state.shifts.map((shift) => shift.id) } });
    await loadAll();
    state.toast = "一括削除しました。";
    state.undoId = result.undoId;
    render();
    setTimeout(() => {
      state.undoId = null;
      if (state.toast === "一括削除しました。") render();
    }, 30_000);
  });

  document.querySelector("#holidayForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const body = formObject(event.currentTarget);
      if (!body.date) {
        toast("希望休の日付を入力してください。");
        return;
      }
      await api("/api/holiday-requests", { method: "POST", body });
      await loadAll();
      toast("希望休を申請しました。");
    } catch (error) {
      toast(error.message);
    }
  });

  document.querySelectorAll("[data-holiday]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/holiday-requests/${button.dataset.holiday}`, { method: "PATCH", body: { status: button.dataset.status } });
      await loadAll();
      toast("希望休を更新しました。");
    });
  });

  document.querySelector("#siteForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const body = formObject(event.currentTarget);
      if (!body.name?.trim()) {
        toast("現場名を入力してください。");
        return;
      }
      await api("/api/sites", { method: "POST", body });
      await loadAll();
      toast(state.user.role === "admin" ? "現場を登録しました。" : "現場を承認申請しました。");
    } catch (error) {
      toast(error.message);
    }
  });

  document.querySelector("#clientCompanySelect")?.addEventListener("change", (event) => {
    const input = document.querySelector("#clientCompanyInput");
    if (input && event.target.value) input.value = event.target.value;
  });

  document.querySelector("#siteSearch")?.addEventListener("input", (event) => {
    const q = event.target.value.trim().toLowerCase();
    const filtered = state.sites.filter((site) => `${site.name} ${site.nearestStation} ${site.clientCompany}`.toLowerCase().includes(q));
    document.querySelector("#siteList").innerHTML = siteRows(filtered);
  });

  document.querySelector("#userForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const body = formObject(event.currentTarget);
      if (state.editingUserId) {
        await api(`/api/users/${state.editingUserId}`, { method: "PATCH", body });
        state.editingUserId = null;
        state.userIconDraft = "";
        await loadAll();
        toast("人材情報を保存しました。");
        return;
      }
      await api("/api/users", { method: "POST", body });
      state.userIconDraft = "";
      await loadAll();
      toast("人材を登録しました。");
    } catch (error) {
      toast(error.message);
    }
  });

  document.querySelector("#cancelUserEdit")?.addEventListener("click", () => {
    state.editingUserId = null;
    state.userIconDraft = "";
    render();
  });

  document.querySelectorAll("[data-edit-user]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingUserId = button.dataset.editUser;
      state.userIconDraft = "";
      render();
    });
  });

  document.querySelector("#userIconFile")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 900_000) {
      event.target.value = "";
      state.userIconDraft = "";
      toast("アイコン画像は900KB以下の画像を選択してください。");
      return;
    }
    const attachment = await readAttachment(file);
    if (attachment.dataUrl.length > 1_200_000) {
      event.target.value = "";
      state.userIconDraft = "";
      toast("アイコン画像が大きすぎます。小さい画像を選択してください。");
      return;
    }
    state.userIconDraft = attachment.dataUrl;
    const hidden = document.querySelector("#userIconDataUrl");
    if (hidden) hidden.value = state.userIconDraft;
    const preview = document.querySelector("#userIconPreview");
    if (preview) preview.innerHTML = userAvatar({ name: "プレビュー", iconDataUrl: state.userIconDraft });
  });

  document.querySelectorAll("[data-shift-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/shifts/${button.dataset.shiftStatus}`, { method: "PATCH", body: { status: button.dataset.status } });
      await loadAll();
      toast("シフトステータスを更新しました。");
    });
  });

  document.querySelectorAll("[data-clock-status]").forEach((selectEl) => {
    selectEl.addEventListener("change", async () => {
      await api(`/api/shifts/${selectEl.dataset.clockStatus}`, { method: "PATCH", body: { status: selectEl.value } });
      await loadAll();
      toast("状態を更新しました。");
    });
  });

  document.querySelectorAll("[data-clock-in]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api("/api/attendances/clock-in", { method: "POST", body: { shiftId: button.dataset.clockIn } });
      await loadAll();
      toast("出勤を記録しました。");
    });
  });

  document.querySelectorAll("[data-clock-out]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api("/api/attendances/clock-out", { method: "POST", body: { shiftId: button.dataset.clockOut } });
      await loadAll();
      toast("退勤を記録しました。");
    });
  });

  document.querySelectorAll("[data-clock-absent]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/shifts/${button.dataset.clockAbsent}`, { method: "PATCH", body: { status: "cancelled" } });
      await loadAll();
      toast("欠勤に変更しました。");
    });
  });

  document.querySelector("#expenseForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const body = formObject(event.currentTarget);
    if (!expenseDateAllowed(body.date, body.siteId)) {
      toast("経費申請は稼働後5日以内の案件だけ保存できます。");
      return;
    }
    toast("経費申請を保存しました。");
  });

  document.querySelector("#expenseUserSelect")?.addEventListener("change", (event) => {
    state.selectedExpenseUserId = event.target.value;
    render();
  });

  document.querySelector("#payslipUserSelect")?.addEventListener("change", (event) => {
    state.selectedPayslipUserId = event.target.value;
    render();
  });

  document.querySelector("#salesTargetInput")?.addEventListener("change", (event) => {
    state.salesTarget = Math.max(0, Number(event.target.value || 0));
    localStorage.setItem("salesTarget", String(state.salesTarget));
    render();
  });

  document.querySelector("#exportCsv")?.addEventListener("click", () => {
    const header = ["日付", "スタッフ", "現場", "状態", "単価"].join(",");
    const rows = state.shifts.map((shift) => [
      dateTime(shift.startAt),
      shift.userName,
      shift.siteName,
      shift.statusLabel,
      shift.visibleUnitPrice ?? "",
    ].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","));
    downloadText("staff-data.csv", [header, ...rows].join("\n"));
  });

  document.querySelector("#invoiceExcel")?.addEventListener("click", async () => {
    await runInvoiceExport("excel");
  });

  document.querySelector("#invoicePdf")?.addEventListener("click", async () => {
    await runInvoiceExport("pdf");
  });

  bindChat();
}

function bindChat() {
  let swipeStartX = 0;
  document.querySelectorAll("[data-thread]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        state.selectedChatThreadId = button.dataset.thread;
        document.body.classList.add("mobileChatRoomOpen");
        state.pendingAttachments = [];
        await loadChatMessages();
        render();
        scrollChatToBottom();
      } catch (error) {
        toast(error.message);
      }
    });
    button.addEventListener("contextmenu", async (event) => {
      event.preventDefault();
      await deleteChatThread(button.dataset.thread);
    });
    button.addEventListener("pointerdown", (event) => {
      swipeStartX = event.clientX;
    });
    button.addEventListener("pointerup", async (event) => {
      if (event.clientX - swipeStartX > 90) await deleteChatThread(button.dataset.thread);
    });
  });

  document.querySelector("#backToThreads")?.addEventListener("click", () => {
    state.selectedChatThreadId = null;
    state.chatTaskMode = false;
    document.body.classList.remove("mobileChatRoomOpen");
    render();
  });

  document.querySelector("#openTaskPanel")?.addEventListener("click", () => {
    state.chatTaskMode = !state.chatTaskMode;
    render();
  });

  document.querySelector("#chatSearch")?.addEventListener("input", (event) => {
    state.chatSearch = event.target.value;
    render();
  });

  document.querySelector("#chatTagFilter")?.addEventListener("change", (event) => {
    state.chatTagFilter = event.target.value;
    render();
  });

  document.querySelector("#threadTagForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const tag = String(form.get("tag") || "").trim();
    if (!tag) return;
    await updateThreadTags([...new Set([...(currentThread()?.tags || []), tag])]);
  });

  document.querySelectorAll("[data-remove-tag]").forEach((button) => {
    button.addEventListener("click", async () => {
      await updateThreadTags((currentThread()?.tags || []).filter((tag) => tag !== button.dataset.removeTag));
    });
  });

  document.querySelector("#newDirectChat")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const form = new FormData(event.currentTarget);
      const participantId = form.get("participantId");
      const target = state.users.find((user) => user.id === participantId);
      const temp = {
        id: `tmp_${Date.now()}`,
        type: "direct",
        name: [state.user.name, target?.name].filter(Boolean).join(" / "),
        participantIds: [state.user.id, participantId],
        participantNames: [state.user.name, target?.name].filter(Boolean),
        participants: [state.user, target].filter(Boolean),
        tags: [],
      };
      state.chatThreads.unshift(temp);
      state.selectedChatThreadId = temp.id;
      document.body.classList.add("mobileChatRoomOpen");
      state.chatMessages = [];
      state.chatTasks = [];
      render();
      const result = await api("/api/chat/threads", { method: "POST", body: { type: "direct", participantIds: [participantId] } });
      state.selectedChatThreadId = result.thread.id;
      document.body.classList.add("mobileChatRoomOpen");
      await loadChat();
      toast("個人チャットを作成しました。");
      render();
      scrollChatToBottom();
    } catch (error) {
      toast(error.message);
    }
  });

  document.querySelector("#newGroupChat")?.addEventListener("click", async () => {
    try {
      const participantIds = state.users.map((user) => user.id);
      const temp = {
        id: `tmp_${Date.now()}`,
        type: "group",
        name: "グループチャット",
        participantIds,
        participantNames: state.users.map((user) => user.name),
        participants: state.users,
        tags: [],
      };
      state.chatThreads.unshift(temp);
      state.selectedChatThreadId = temp.id;
      document.body.classList.add("mobileChatRoomOpen");
      state.chatMessages = [];
      state.chatTasks = [];
      render();
      const result = await api("/api/chat/threads", { method: "POST", body: { type: "group", name: "グループチャット", participantIds } });
      state.selectedChatThreadId = result.thread.id;
      document.body.classList.add("mobileChatRoomOpen");
      await loadChat();
      toast("全体チャットを作成しました。");
      render();
      scrollChatToBottom();
    } catch (error) {
      toast(error.message);
    }
  });

  const attach = async (event) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;
      if (state.pendingAttachments.length >= 4) {
        toast("添付は最大4件までです。");
        event.target.value = "";
        return;
      }
      if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
        toast("添付ファイルは1件800KB以下にしてください。");
        event.target.value = "";
        return;
      }
      const attachment = await readAttachment(file);
      if (attachment.dataUrl.length > MAX_CHAT_ATTACHMENT_DATA_URL) {
        toast("添付ファイルが大きすぎます。小さい画像またはファイルを選択してください。");
        event.target.value = "";
        return;
      }
      state.pendingAttachments = [...state.pendingAttachments, attachment].slice(0, 4);
      event.target.value = "";
      toast(`${file.name} を添付しました。`);
      render();
    } catch (error) {
      toast(error.message);
    }
  };
  document.querySelector("#chatFile")?.addEventListener("change", attach);

  document.querySelector("#chatForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const form = new FormData(event.currentTarget);
      const text = String(form.get("text") || "").trim();
      if (!text && !state.pendingAttachments.length) {
        toast(state.chatTaskMode ? "依頼内容を入力してください。" : "メッセージかファイルを入力してください。");
        return;
      }
      if (state.chatTaskMode) {
        const thread = currentThread();
        const assigneeId = thread?.participantIds?.find((id) => id !== state.user.id) || thread?.participantIds?.[0] || state.user.id;
        const tempTask = {
          id: `tmp_${Date.now()}`,
          threadId: state.selectedChatThreadId,
          title: text,
          requesterId: state.user.id,
          assigneeId,
          assigneeName: state.users.find((user) => user.id === assigneeId)?.name || "",
          dueDate: "",
          status: "requested",
        };
        const tempMessage = {
          id: `tmp_msg_${Date.now()}`,
          threadId: state.selectedChatThreadId,
          senderId: state.user.id,
          senderName: state.user.name,
          text: `タスク依頼: ${text}`,
          attachments: [],
          createdAt: new Date().toISOString(),
        };
        state.chatTasks = [tempTask, ...state.chatTasks];
        state.chatMessages = [...state.chatMessages, tempMessage];
        state.chatTaskMode = false;
        state.pendingAttachments = [];
        render();
        scrollChatToBottom();
        await api("/api/chat/tasks", {
          method: "POST",
          body: { threadId: state.selectedChatThreadId, title: text, assigneeId, dueDate: "" },
        });
        await loadChatMessages();
        toast("タスクを送信しました。");
        render();
        scrollChatToBottom();
        return;
      }
      const tempMessage = {
        id: `tmp_${Date.now()}`,
        threadId: state.selectedChatThreadId,
        senderId: state.user.id,
        senderName: state.user.name,
        text,
        attachments: state.pendingAttachments,
        createdAt: new Date().toISOString(),
      };
      state.chatMessages = [...state.chatMessages, tempMessage];
      state.pendingAttachments = [];
      render();
      scrollChatToBottom();
      const result = await api("/api/chat/messages", {
        method: "POST",
        body: { threadId: state.selectedChatThreadId, text, attachments: tempMessage.attachments },
      });
      state.chatMessages = state.chatMessages.map((message) => message.id === tempMessage.id ? result.message : message);
      toast("メッセージを送信しました。");
      render();
      scrollChatToBottom();
    } catch (error) {
      toast(error.message);
    }
  });

  document.querySelector("#shareCalendar")?.addEventListener("click", async () => {
    try {
      await api("/api/chat/share-calendar", { method: "POST", body: { threadId: state.selectedChatThreadId } });
      await loadChatMessages();
      toast("カレンダーを共有しました。");
      render();
      scrollChatToBottom();
    } catch (error) {
      toast(error.message);
    }
  });

  document.querySelector("#taskForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const body = formObject(event.currentTarget);
      const tempTask = {
        id: `tmp_${Date.now()}`,
        threadId: state.selectedChatThreadId,
        title: body.title,
        requesterId: state.user.id,
        assigneeId: body.assigneeId,
        assigneeName: state.users.find((user) => user.id === body.assigneeId)?.name || "",
        dueDate: body.dueDate || "",
        status: "requested",
      };
      const tempMessage = {
        id: `tmp_msg_${Date.now()}`,
        threadId: state.selectedChatThreadId,
        senderId: state.user.id,
        senderName: state.user.name,
        text: `タスク依頼: ${body.title}`,
        attachments: [],
        createdAt: new Date().toISOString(),
      };
      state.chatTasks = [tempTask, ...state.chatTasks];
      state.chatMessages = [...state.chatMessages, tempMessage];
      render();
      scrollChatToBottom();
      await api("/api/chat/tasks", { method: "POST", body: { ...body, threadId: state.selectedChatThreadId } });
      await loadChatMessages();
      toast("タスクを依頼しました。");
      render();
      scrollChatToBottom();
    } catch (error) {
      toast(error.message);
    }
  });

  document.querySelectorAll("[data-task-confirm]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/chat/tasks/${button.dataset.taskConfirm}`, { method: "PATCH", body: { status: "done" } });
      await loadChatMessages();
      render();
    });
  });

  document.querySelectorAll("[data-task-status]").forEach((selectEl) => {
    selectEl.addEventListener("change", async () => {
      try {
        await api(`/api/chat/tasks/${selectEl.dataset.taskStatus}`, { method: "PATCH", body: { status: selectEl.value } });
        await loadChatMessages();
        toast("タスク状態を更新しました。");
        render();
      } catch (error) {
        toast(error.message);
      }
    });
  });
}

function currentThread() {
  return state.chatThreads.find((thread) => thread.id === state.selectedChatThreadId);
}

async function updateThreadTags(tags) {
  const thread = currentThread();
  if (!thread || thread.id.startsWith("tmp_")) return;
  thread.tags = tags;
  state.chatThreads = state.chatThreads.map((item) => item.id === thread.id ? thread : item);
  render();
  try {
    const result = await api(`/api/chat/threads/${thread.id}`, { method: "PATCH", body: { tags } });
    state.chatThreads = state.chatThreads.map((item) => item.id === thread.id ? result.thread : item);
    render();
  } catch (error) {
    toast(error.message);
  }
}

async function deleteChatThread(threadId) {
  const thread = state.chatThreads.find((item) => item.id === threadId);
  if (!thread) return;
  if (!confirm(`${thread.name} を削除しますか？`)) return;
  state.chatThreads = state.chatThreads.filter((item) => item.id !== threadId);
  if (state.selectedChatThreadId === threadId) {
    state.selectedChatThreadId = state.chatThreads[0]?.id ?? null;
    await loadChatMessages();
  }
  render();
  if (threadId.startsWith("tmp_")) return;
  try {
    await api(`/api/chat/threads/${threadId}`, { method: "DELETE" });
    toast("トークルームを削除しました。");
  } catch (error) {
    toast(error.message);
    await loadChat();
    render();
  }
}

function bindSettings() {
  const selectEl = document.querySelector("#settingsUserSelect");
  selectEl?.addEventListener("change", async () => {
    state.selectedSettingsUserId = selectEl.value;
    await loadSelectedUserPermissions();
    render();
  });

  document.querySelector("#permissionForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const userId = form.get("userId");
    const permissions = {
      can_view_project_unit_price: form.get("can_view_project_unit_price") === "on",
      can_view_sales_projection: form.get("can_view_sales_projection") === "on",
      work_visibility_scope: form.get("work_visibility_scope"),
      can_create_invoice: form.get("can_create_invoice") === "on",
      analytics_scope: form.get("analytics_scope"),
      monthly_expense_limit: form.get("monthly_expense_limit") ? Number(form.get("monthly_expense_limit")) : null,
      requires_attendance_location: form.get("requires_attendance_location") === "on",
    };
    const result = await api("/api/user-permissions", { method: "PATCH", body: { userId, permissions } });
    state.selectedUserPermissions = result.permissions;
    toast("ユーザー個別制限を保存しました。");
  });
}

async function loadSelectedUserPermissions() {
  if (state.user?.role !== "admin") return;
  const userId = state.selectedSettingsUserId || state.users[0]?.id;
  if (!userId) return;
  state.selectedSettingsUserId = userId;
  const result = await api(`/api/user-permissions?userId=${encodeURIComponent(userId)}`);
  state.selectedUserPermissions = result.permissions;
}

function employmentLabel(value) {
  return { employee: "社員", contractor: "個人事業主", part_time: "アルバイト" }[value] ?? value;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function selected(current, value) {
  return current === value ? "selected" : "";
}

function lineStatusLabel(status) {
  return {
    sent: "通知済み",
    skipped: "未設定",
    failed: "失敗",
    none: "通知なし",
  }[status] ?? "通知なし";
}

boot();
