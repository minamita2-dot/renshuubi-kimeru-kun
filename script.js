const APP_CONFIG = {
  passcode: "band1234",
  activeMemberStorageKey: "renshuubi-kimeru-kun-active-member-v2",
  timeSlots: ["18:00〜20:00", "19:00〜21:00", "20:00〜22:00", "21:00〜23:00"],
  weekdayLabels: ["日", "月", "火", "水", "木", "金", "土"],
  starterColors: ["#ffcf33", "#61d394", "#64b5f6", "#f28b82", "#c58cff", "#ff9f43"]
};

const firebaseConfig = {
  apiKey: "AIzaSyBKmMEX7yN5afMf6zQ4J2H9oiS-r3s45uQ",
  authDomain: "renshuubi-kimeru-kun-37b3a.firebaseapp.com",
  databaseURL: "https://renshuubi-kimeru-kun-37b3a-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "renshuubi-kimeru-kun-37b3a",
  storageBucket: "renshuubi-kimeru-kun-37b3a.firebasestorage.app",
  messagingSenderId: "185383393904",
  appId: "1:185383393904:web:f93495ba98306f80d732b5"
};

function createDefaultState() {
  const today = new Date();
  return {
    authenticated: false,
    currentYear: today.getFullYear(),
    currentMonth: today.getMonth(),
    activeMemberId: null,
    members: [],
    availability: {},
    dataReady: false,
    firebaseReady: false,
    connectionError: ""
  };
}

let state = createDefaultState();
let roomId = getOrCreateRoomId();
let database = null;
let roomRef = null;
let hasBoundEvents = false;

const elements = {
  passcodeScreen: document.getElementById("passcodeScreen"),
  passcodeForm: document.getElementById("passcodeForm"),
  passcodeInput: document.getElementById("passcodeInput"),
  passcodeError: document.getElementById("passcodeError"),
  app: document.getElementById("app"),
  systemStatus: document.getElementById("systemStatus"),
  roomIdLabel: document.getElementById("roomIdLabel"),
  copyShareUrlButton: document.getElementById("copyShareUrlButton"),
  shareStatus: document.getElementById("shareStatus"),
  logoutButton: document.getElementById("logoutButton"),
  resetButton: document.getElementById("resetButton"),
  memberPanel: document.getElementById("memberPanel"),
  memberNotice: document.getElementById("memberNotice"),
  memberForm: document.getElementById("memberForm"),
  memberNameInput: document.getElementById("memberNameInput"),
  memberColorInput: document.getElementById("memberColorInput"),
  memberList: document.getElementById("memberList"),
  activeMemberBadge: document.getElementById("activeMemberBadge"),
  candidateCount: document.getElementById("candidateCount"),
  candidateList: document.getElementById("candidateList"),
  copyCandidatesButton: document.getElementById("copyCandidatesButton"),
  copyStatus: document.getElementById("copyStatus"),
  prevMonthButton: document.getElementById("prevMonthButton"),
  nextMonthButton: document.getElementById("nextMonthButton"),
  calendarTitle: document.getElementById("calendarTitle"),
  calendarGrid: document.getElementById("calendarGrid")
};

state.activeMemberId = localStorage.getItem(getActiveMemberStorageKey());

function getOrCreateRoomId() {
  const url = new URL(window.location.href);
  const existingRoomId = url.searchParams.get("room");

  if (existingRoomId && /^[a-zA-Z0-9_-]{3,60}$/.test(existingRoomId)) {
    return existingRoomId;
  }

  const newRoomId = `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  url.searchParams.set("room", newRoomId);
  window.history.replaceState({}, "", url.toString());
  return newRoomId;
}

function getInitialSharedData() {
  const today = new Date();
  return {
    members: {},
    availability: {},
    currentYear: today.getFullYear(),
    currentMonth: today.getMonth()
  };
}

function normalizeMembers(membersData) {
  if (!membersData) return [];

  if (Array.isArray(membersData)) {
    return membersData.filter(Boolean);
  }

  return Object.values(membersData).filter((member) => member && member.id);
}

function normalizeAvailability(availabilityData) {
  return availabilityData && typeof availabilityData === "object" ? availabilityData : {};
}

function applyRoomData(roomData) {
  const sharedData = roomData || getInitialSharedData();
  state.members = normalizeMembers(sharedData.members);
  state.availability = normalizeAvailability(sharedData.availability);
  state.currentYear = Number.isInteger(sharedData.currentYear)
    ? sharedData.currentYear
    : new Date().getFullYear();
  state.currentMonth = Number.isInteger(sharedData.currentMonth)
    ? sharedData.currentMonth
    : new Date().getMonth();

  if (state.activeMemberId && !state.members.some((member) => member.id === state.activeMemberId)) {
    state.activeMemberId = state.members[0]?.id || null;
    saveActiveMember();
  }

  state.dataReady = true;
}

function saveActiveMember() {
  if (state.activeMemberId) {
    localStorage.setItem(getActiveMemberStorageKey(), state.activeMemberId);
  } else {
    localStorage.removeItem(getActiveMemberStorageKey());
  }
}

function getActiveMemberStorageKey() {
  return `${APP_CONFIG.activeMemberStorageKey}:${roomId}`;
}

async function initFirebase() {
  elements.roomIdLabel.textContent = roomId;
  setSystemStatus("loading", "Firebaseに接続中...");
  setControlsDisabled(true);

  try {
    if (!window.firebase) {
      throw new Error("Firebase SDKを読み込めませんでした。");
    }

    firebase.initializeApp(firebaseConfig);
    await firebase.auth().signInAnonymously();
    database = firebase.database();
    roomRef = database.ref(`rooms/${roomId}`);
    await ensureRoomExists();
    subscribeRoom();
    subscribeConnectionState();
  } catch (error) {
    console.error("Firebase接続エラー", error);
    state.connectionError = "Firebaseに接続できませんでした。設定や通信環境を確認してください。";
    setSystemStatus("error", state.connectionError);
    render();
  }
}

async function ensureRoomExists() {
  const snapshot = await roomRef.once("value");
  if (!snapshot.exists()) {
    await roomRef.set(getInitialSharedData());
  }
}

function subscribeRoom() {
  roomRef.on("value", (snapshot) => {
    applyRoomData(snapshot.val());
    setSystemStatus("ready", "Firebase同期中");
    render();
  }, (error) => {
    console.error("データ読み込みエラー", error);
    state.connectionError = "予定データを読み込めませんでした。";
    setSystemStatus("error", state.connectionError);
    render();
  });
}

function subscribeConnectionState() {
  database.ref(".info/connected").on("value", (snapshot) => {
    if (!state.dataReady || state.connectionError) return;
    setSystemStatus(snapshot.val() ? "ready" : "loading", snapshot.val() ? "Firebase同期中" : "再接続中...");
  });
}

function setSystemStatus(type, message) {
  elements.systemStatus.textContent = message;
  elements.systemStatus.className = `system-status is-${type}`;
}

function canUseSharedData() {
  return state.dataReady && !state.connectionError && roomRef;
}

function setControlsDisabled(disabled) {
  [
    elements.resetButton,
    elements.memberNameInput,
    elements.memberColorInput,
    elements.copyCandidatesButton,
    elements.prevMonthButton,
    elements.nextMonthButton
  ].forEach((element) => {
    element.disabled = disabled;
  });

  elements.memberForm.querySelector("button").disabled = disabled;
}

function getMonthKey(year = state.currentYear, month = state.currentMonth) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function getDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function encodeSlot(slot) {
  return encodeURIComponent(slot).replace(/\./g, "%2E");
}

function makeMemberId() {
  return `member-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getActiveMember() {
  return state.members.find((member) => member.id === state.activeMemberId) || null;
}

function getAvailabilityFor(dateKey, slot) {
  const slotKey = encodeSlot(slot);
  const memberMap = state.availability?.[dateKey]?.[slotKey] || {};
  return Object.keys(memberMap).filter((memberId) => memberMap[memberId]);
}

async function addMember(name, color) {
  if (!canUseSharedData()) {
    showMemberNotice("まだデータ読み込み中です。少し待ってから追加してください。");
    return;
  }

  const member = {
    id: makeMemberId(),
    name,
    color
  };

  state.activeMemberId = member.id;
  saveActiveMember();
  hideMemberNotice();
  await roomRef.child(`members/${member.id}`).set(member);
}

async function deleteMember(memberId) {
  if (!canUseSharedData()) return;

  const member = state.members.find((item) => item.id === memberId);
  if (!member) return;

  const confirmed = confirm(`${member.name}さんを削除します。登録済みの参加可能データからも消えます。`);
  if (!confirmed) return;

  const updates = {};
  updates[`members/${memberId}`] = null;

  Object.keys(state.availability).forEach((dateKey) => {
    Object.keys(state.availability[dateKey]).forEach((slotKey) => {
      if (state.availability[dateKey][slotKey]?.[memberId]) {
        updates[`availability/${dateKey}/${slotKey}/${memberId}`] = null;
      }
    });
  });

  if (state.activeMemberId === memberId) {
    state.activeMemberId = state.members.find((item) => item.id !== memberId)?.id || null;
    saveActiveMember();
  }

  await roomRef.update(updates);
}

async function toggleAvailability(dateKey, slot) {
  if (!canUseSharedData()) {
    showMemberNotice("まだデータ読み込み中です。少し待ってから入力してください。");
    return;
  }

  const activeMember = getActiveMember();
  if (!activeMember) {
    showMemberNotice(
      state.members.length === 0
        ? "先にメンバーを追加してください。名前と色を決めると入力できます。"
        : "先に入力するメンバーを選んでください。メンバー名を押すと選択できます。"
    );
    return;
  }

  const slotKey = encodeSlot(slot);
  const selected = getAvailabilityFor(dateKey, slot).includes(activeMember.id);
  await roomRef.child(`availability/${dateKey}/${slotKey}/${activeMember.id}`).set(selected ? null : true);
}

function getCalendarDates(year, month) {
  const firstDate = new Date(year, month, 1);
  const startDate = new Date(firstDate);
  const mondayBasedDay = (firstDate.getDay() + 6) % 7;
  startDate.setDate(firstDate.getDate() - mondayBasedDay);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return date;
  });
}

function isSameDate(dateA, dateB) {
  return dateA.getFullYear() === dateB.getFullYear()
    && dateA.getMonth() === dateB.getMonth()
    && dateA.getDate() === dateB.getDate();
}

function isSlotComplete(memberIds) {
  return state.members.length > 0 && state.members.every((member) => memberIds.includes(member.id));
}

function getMemberById(memberId) {
  return state.members.find((member) => member.id === memberId) || null;
}

function getReadableDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return {
    label: `${month}/${day}（${APP_CONFIG.weekdayLabels[date.getDay()]}）`,
    date
  };
}

function getWeekdayLabel(date) {
  return APP_CONFIG.weekdayLabels[date.getDay()];
}

function getMonthlyCandidates() {
  const monthKey = getMonthKey();
  const candidates = [];

  Object.keys(state.availability)
    .filter((dateKey) => dateKey.startsWith(monthKey))
    .sort()
    .forEach((dateKey) => {
      APP_CONFIG.timeSlots.forEach((slot) => {
        const memberIds = getAvailabilityFor(dateKey, slot);
        if (isSlotComplete(memberIds)) {
          candidates.push({ dateKey, slot });
        }
      });
    });

  return candidates;
}

function createCandidateCopyText(candidates) {
  const candidateLines = candidates.map((candidate) => {
    const readable = getReadableDate(candidate.dateKey);
    return `・${readable.label}${candidate.slot}`;
  });

  return [
    "練習候補日です！",
    "",
    ...candidateLines,
    "",
    "どれかでスタジオ取ります！"
  ].join("\n");
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    const copied = document.execCommand("copy");
    if (!copied) {
      throw new Error("copy command failed");
    }
  } finally {
    document.body.removeChild(textarea);
  }
}

function setCopyStatus(message) {
  elements.copyStatus.textContent = message;
}

function setShareStatus(message) {
  elements.shareStatus.textContent = message;
}

function showPasscodeScreen() {
  elements.passcodeScreen.hidden = false;
  elements.app.hidden = true;
  elements.passcodeInput.value = "";
  elements.passcodeError.textContent = "";
  setTimeout(() => elements.passcodeInput.focus(), 0);
}

function showApp() {
  elements.passcodeScreen.hidden = true;
  elements.app.hidden = false;
}

function showMemberNotice(message) {
  elements.memberNotice.textContent = message;
  elements.memberNotice.hidden = false;
  elements.memberPanel.classList.add("needs-attention");
  elements.memberPanel.scrollIntoView({ behavior: "smooth", block: "start" });

  if (state.members.length === 0) {
    elements.memberNameInput.focus();
  }
}

function hideMemberNotice() {
  elements.memberNotice.textContent = "";
  elements.memberNotice.hidden = true;
  elements.memberPanel.classList.remove("needs-attention");
}

function renderMemberList() {
  const activeMember = getActiveMember();

  elements.activeMemberBadge.textContent = activeMember ? `入力中：${activeMember.name}` : "未選択";
  elements.activeMemberBadge.style.background = activeMember ? activeMember.color : "";
  elements.activeMemberBadge.style.color = activeMember ? getReadableTextColor(activeMember.color) : "";

  if (!state.dataReady) {
    elements.memberList.innerHTML = '<p class="empty-state">Firebaseからデータを読み込み中です。</p>';
    return;
  }

  if (state.members.length === 0) {
    elements.memberList.innerHTML = '<p class="empty-state">まずはメンバーを追加してください。追加した人を選ぶと、カレンダーに入力できます。</p>';
    return;
  }

  elements.memberList.innerHTML = state.members.map((member) => {
    const isActive = member.id === state.activeMemberId;
    return `
      <div class="member-item ${isActive ? "is-active" : ""}">
        <button class="member-select" type="button" data-member-id="${member.id}">
          <span class="member-dot" style="background:${member.color}"></span>
          <span class="member-name">${escapeHtml(member.name)}</span>
        </button>
        <button class="delete-member" type="button" data-delete-member-id="${member.id}" aria-label="${escapeHtml(member.name)}さんを削除">×</button>
      </div>
    `;
  }).join("");
}

function renderCalendar() {
  const dates = getCalendarDates(state.currentYear, state.currentMonth);
  const today = new Date();

  elements.calendarTitle.textContent = `${state.currentYear}年 ${state.currentMonth + 1}月`;
  elements.calendarGrid.innerHTML = dates.map((date) => {
    const dateKey = getDateKey(date);
    const isOutside = date.getMonth() !== state.currentMonth;
    const isToday = isSameDate(date, today);
    const day = date.getDay();
    const dayClasses = [
      "day-cell",
      isOutside ? "is-outside" : "",
      day === 6 ? "is-saturday" : "",
      day === 0 ? "is-sunday" : "",
      isToday ? "is-today" : ""
    ].filter(Boolean).join(" ");

    return `
      <article class="${dayClasses}">
        <div class="day-header">
          <span class="day-number">${date.getDate()}<span class="day-weekday">（${getWeekdayLabel(date)}）</span></span>
          ${isToday ? '<span class="today-label">今日</span>' : ""}
        </div>
        <div class="slot-list">
          ${APP_CONFIG.timeSlots.map((slot) => renderSlotButton(dateKey, slot)).join("")}
        </div>
      </article>
    `;
  }).join("");
}

function renderSlotButton(dateKey, slot) {
  const memberIds = getAvailabilityFor(dateKey, slot);
  const isComplete = isSlotComplete(memberIds);
  const isSelected = state.activeMemberId && memberIds.includes(state.activeMemberId);
  const className = [
    "slot-button",
    isSelected ? "is-selected" : "",
    isComplete ? "is-complete" : ""
  ].filter(Boolean).join(" ");

  return `
    <button class="${className}" type="button" data-date-key="${dateKey}" data-slot="${slot}" ${!state.dataReady ? "disabled" : ""}>
      <span class="slot-time">
        <span>${slot}</span>
        ${isComplete ? '<span class="complete-label">全員OK</span>' : ""}
      </span>
      <span class="attendee-row">
        ${renderAttendeeChips(memberIds)}
      </span>
    </button>
  `;
}

function renderAttendeeChips(memberIds) {
  const members = memberIds
    .map(getMemberById)
    .filter(Boolean);

  if (members.length === 0) {
    return '<span class="attendee-chip is-empty">まだなし</span>';
  }

  return members.map((member) => `
    <span class="attendee-chip" style="background:${member.color}; color:${getReadableTextColor(member.color)}">
      <span class="mini-dot" style="background:${member.color}"></span>
      ${escapeHtml(member.name)}
    </span>
  `).join("");
}

function renderCandidates() {
  const candidates = getMonthlyCandidates();
  elements.candidateCount.textContent = `${candidates.length}件`;
  setCopyStatus("");

  if (!state.dataReady) {
    elements.candidateList.innerHTML = '<p class="empty-state">候補日を読み込み中です。</p>';
    return;
  }

  if (state.members.length === 0) {
    elements.candidateList.innerHTML = '<p class="empty-state">メンバーを追加すると、全員OKの候補がここに出ます。</p>';
    return;
  }

  if (candidates.length === 0) {
    elements.candidateList.innerHTML = '<p class="empty-state">今月はまだ全員OKの時間帯がありません。</p>';
    return;
  }

  elements.candidateList.innerHTML = candidates.map((candidate) => {
    const readable = getReadableDate(candidate.dateKey);
    return `
      <div class="candidate-item">
        <span class="candidate-date">${readable.label}</span>
        <span class="candidate-time">${candidate.slot}</span>
      </div>
    `;
  }).join("");
}

function render() {
  if (state.authenticated) {
    showApp();
  } else {
    showPasscodeScreen();
  }

  setControlsDisabled(!state.dataReady || Boolean(state.connectionError));
  renderMemberList();
  renderCalendar();
  renderCandidates();
}

function getReadableTextColor(hexColor) {
  const normalized = hexColor.replace("#", "");
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
  return brightness > 140 ? "#111111" : "#ffffff";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bindEvents() {
  if (hasBoundEvents) return;
  hasBoundEvents = true;

  elements.passcodeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const passcode = elements.passcodeInput.value.trim();

    if (passcode !== APP_CONFIG.passcode) {
      elements.passcodeError.textContent = "パスコードが違います。";
      return;
    }

    state.authenticated = true;
    render();
  });

  elements.logoutButton.addEventListener("click", () => {
    state.authenticated = false;
    render();
  });

  elements.copyShareUrlButton.addEventListener("click", async () => {
    try {
      await copyTextToClipboard(window.location.href);
      setShareStatus("共有URLをコピーしました");
    } catch (error) {
      console.warn("共有URLコピーに失敗しました。", error);
      setShareStatus("共有URLのコピーに失敗しました");
    }
  });

  elements.resetButton.addEventListener("click", async () => {
    if (!canUseSharedData()) return;

    const confirmed = confirm("全データをリセットします。メンバーと入力済み予定も消えます。よろしいですか？");
    if (!confirmed) return;

    state.activeMemberId = null;
    saveActiveMember();
    await roomRef.set(getInitialSharedData());
  });

  elements.copyCandidatesButton.addEventListener("click", async () => {
    const candidates = getMonthlyCandidates();

    if (candidates.length === 0) {
      setCopyStatus("コピーできる候補日がありません");
      return;
    }

    try {
      await copyTextToClipboard(createCandidateCopyText(candidates));
      setCopyStatus("コピーしました");
    } catch (error) {
      console.warn("候補日のコピーに失敗しました。", error);
      setCopyStatus("コピーに失敗しました");
    }
  });

  elements.memberForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = elements.memberNameInput.value.trim();
    const color = elements.memberColorInput.value;

    if (!name) {
      alert("メンバー名を入力してください。");
      elements.memberNameInput.focus();
      return;
    }

    await addMember(name, color);
    elements.memberNameInput.value = "";
    elements.memberColorInput.value = APP_CONFIG.starterColors[state.members.length % APP_CONFIG.starterColors.length];
    elements.memberNameInput.focus();
  });

  elements.memberList.addEventListener("click", async (event) => {
    const selectButton = event.target.closest("[data-member-id]");
    const deleteButton = event.target.closest("[data-delete-member-id]");

    if (deleteButton) {
      await deleteMember(deleteButton.dataset.deleteMemberId);
      return;
    }

    if (selectButton) {
      state.activeMemberId = selectButton.dataset.memberId;
      saveActiveMember();
      hideMemberNotice();
      renderMemberList();
      renderCalendar();
    }
  });

  elements.calendarGrid.addEventListener("click", async (event) => {
    const slotButton = event.target.closest("[data-date-key][data-slot]");
    if (!slotButton) return;
    await toggleAvailability(slotButton.dataset.dateKey, slotButton.dataset.slot);
  });

  elements.prevMonthButton.addEventListener("click", async () => {
    if (!canUseSharedData()) return;

    const previousMonth = new Date(state.currentYear, state.currentMonth - 1, 1);
    await roomRef.update({
      currentYear: previousMonth.getFullYear(),
      currentMonth: previousMonth.getMonth()
    });
  });

  elements.nextMonthButton.addEventListener("click", async () => {
    if (!canUseSharedData()) return;

    const nextMonth = new Date(state.currentYear, state.currentMonth + 1, 1);
    await roomRef.update({
      currentYear: nextMonth.getFullYear(),
      currentMonth: nextMonth.getMonth()
    });
  });
}

bindEvents();
render();
initFirebase();