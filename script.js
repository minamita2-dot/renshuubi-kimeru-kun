const APP_CONFIG = {
  passcode: "narutan",
  adminPasscode: "admin",
  activeMemberStorageKey: "renshuubi-kimeru-kun-active-member-v2",
  pinPattern: /^\d{6}$/,
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
    role: null,
    pendingMemberId: null,
    pendingPinResetMemberId: null,
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
  roleScreen: document.getElementById("roleScreen"),
  passcodeForm: document.getElementById("passcodeForm"),
  passcodeInput: document.getElementById("passcodeInput"),
  passcodeError: document.getElementById("passcodeError"),
  adminLoginForm: document.getElementById("adminLoginForm"),
  adminPasscodeInput: document.getElementById("adminPasscodeInput"),
  adminError: document.getElementById("adminError"),
  roleMemberList: document.getElementById("roleMemberList"),
  memberPinForm: document.getElementById("memberPinForm"),
  pinMemberName: document.getElementById("pinMemberName"),
  roleMemberPinInput: document.getElementById("roleMemberPinInput"),
  pinCancelButton: document.getElementById("pinCancelButton"),
  pinError: document.getElementById("pinError"),
  app: document.getElementById("app"),
  connectionPanel: document.getElementById("connectionPanel"),
  systemStatus: document.getElementById("systemStatus"),
  roomIdLabel: document.getElementById("roomIdLabel"),
  copyShareUrlButton: document.getElementById("copyShareUrlButton"),
  shareStatus: document.getElementById("shareStatus"),
  logoutButton: document.getElementById("logoutButton"),
  resetButton: document.getElementById("resetButton"),
  memberPanel: document.getElementById("memberPanel"),
  modeHelp: document.getElementById("modeHelp"),
  memberNotice: document.getElementById("memberNotice"),
  memberForm: document.getElementById("memberForm"),
  memberNameInput: document.getElementById("memberNameInput"),
  memberColorInput: document.getElementById("memberColorInput"),
  memberPinAdminInput: document.getElementById("memberPinAdminInput"),
  memberList: document.getElementById("memberList"),
  activeMemberBadge: document.getElementById("activeMemberBadge"),
  adminPinResetForm: document.getElementById("adminPinResetForm"),
  resetPinMemberName: document.getElementById("resetPinMemberName"),
  resetPinInput: document.getElementById("resetPinInput"),
  resetPinCancelButton: document.getElementById("resetPinCancelButton"),
  resetPinStatus: document.getElementById("resetPinStatus"),
  memberSelfTools: document.getElementById("memberSelfTools"),
  togglePinChangeButton: document.getElementById("togglePinChangeButton"),
  pinChangeForm: document.getElementById("pinChangeForm"),
  currentPinInput: document.getElementById("currentPinInput"),
  newPinInput: document.getElementById("newPinInput"),
  newPinConfirmInput: document.getElementById("newPinConfirmInput"),
  pinChangeCancelButton: document.getElementById("pinChangeCancelButton"),
  pinChangeStatus: document.getElementById("pinChangeStatus"),
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
    if (state.role === "member") {
      state.role = null;
      state.pendingMemberId = null;
      state.activeMemberId = null;
      saveActiveMember();
      state.dataReady = true;
      return;
    }

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

function isAdminMode() {
  return state.role === "admin";
}

function isMemberMode() {
  return state.role === "member";
}

function enterAdminMode() {
  state.role = "admin";
  state.pendingMemberId = null;
  clearPinChangeForm();

  if (!getActiveMember()) {
    state.activeMemberId = state.members[0]?.id || null;
    saveActiveMember();
  }

  hideRoleErrors();
  render();
}

function selectRoleMember(memberId) {
  const member = getMemberById(memberId);
  if (!member) return;

  state.pendingMemberId = memberId;
  elements.pinMemberName.textContent = `${member.name}さんのPINを入力してください`;
  elements.memberPinForm.hidden = false;
  elements.roleMemberPinInput.value = "";
  elements.pinError.textContent = "";
  elements.roleMemberPinInput.focus();
}

function enterMemberMode(memberId) {
  state.role = "member";
  state.pendingMemberId = null;
  state.pendingPinResetMemberId = null;
  state.activeMemberId = memberId;
  saveActiveMember();
  hideRoleErrors();
  hidePinResetForm();
  render();
}

function hideRoleErrors() {
  elements.adminError.textContent = "";
  elements.pinError.textContent = "";
  elements.memberPinForm.hidden = true;
  elements.roleMemberPinInput.value = "";
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
  const adminDisabled = disabled || !isAdminMode();
  const memberDisabled = disabled || !isMemberMode();

  [
    elements.memberNameInput,
    elements.memberColorInput,
    elements.memberPinAdminInput,
    elements.resetPinInput,
    elements.copyCandidatesButton,
    elements.copyShareUrlButton,
    elements.resetButton
  ].forEach((element) => {
    element.disabled = adminDisabled;
  });

  [
    elements.prevMonthButton,
    elements.nextMonthButton
  ].forEach((element) => {
    element.disabled = disabled;
  });

  elements.memberForm.querySelector("button").disabled = adminDisabled;
  elements.adminPinResetForm.querySelectorAll("button").forEach((button) => {
    button.disabled = adminDisabled;
  });
  elements.pinChangeForm.querySelectorAll("input, button").forEach((element) => {
    element.disabled = memberDisabled;
  });
  elements.memberForm.hidden = !isAdminMode();
  elements.resetButton.hidden = !isAdminMode();
  elements.connectionPanel.hidden = isMemberMode();
  elements.memberSelfTools.hidden = !isMemberMode() || !getActiveMember();
  elements.copyCandidatesButton.closest(".candidate-actions").hidden = !isAdminMode();
  elements.copyShareUrlButton.closest(".share-actions").hidden = !isAdminMode();

  if (!isAdminMode()) {
    hidePinResetForm();
  }

  if (!isMemberMode()) {
    clearPinChangeForm();
  }
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

async function hashPin(pin) {
  if (!window.crypto || !window.crypto.subtle) {
    throw new Error("Web Crypto API is not available");
  }

  const encoded = new TextEncoder().encode(pin);
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyMemberPin(member, inputPin) {
  if (member.pinHash) {
    return await hashPin(inputPin) === member.pinHash;
  }

  // 旧バージョンで平文保存されていたPINとの互換性を残します。
  if (typeof member.pin === "string") {
    return inputPin === member.pin;
  }

  return inputPin === "";
}

async function saveMemberPinHash(memberId, pin) {
  const pinHash = await hashPin(pin);
  await roomRef.child(`members/${memberId}`).update({
    pinHash,
    pin: null
  });
}

function getActiveMember() {
  return state.members.find((member) => member.id === state.activeMemberId) || null;
}

function getAvailabilityFor(dateKey, slot) {
  const slotKey = encodeSlot(slot);
  const memberMap = state.availability?.[dateKey]?.[slotKey] || {};
  return Object.keys(memberMap).filter((memberId) => memberMap[memberId]);
}

async function addMember(name, color, pin) {
  if (!canUseSharedData()) {
    showMemberNotice("まだデータ読み込み中です。少し待ってから追加してください。");
    return false;
  }

  if (!isAdminMode()) {
    showMemberNotice("メンバー追加は管理者だけができます。");
    return false;
  }

  if (!APP_CONFIG.pinPattern.test(pin)) {
    showMemberNotice("PINは半角数字6桁で入力してください。");
    elements.memberPinAdminInput.focus();
    return false;
  }

  let pinHash = "";
  try {
    pinHash = await hashPin(pin);
  } catch (error) {
    console.error("PINハッシュ化エラー", error);
    showMemberNotice("PINを安全に保存できませんでした。ブラウザを更新してもう一度試してください。");
    return false;
  }

  const member = {
    id: makeMemberId(),
    name,
    color,
    pinHash
  };

  state.activeMemberId = member.id;
  saveActiveMember();
  hideMemberNotice();
  await roomRef.child(`members/${member.id}`).set(member);
  return true;
}

async function deleteMember(memberId) {
  if (!canUseSharedData() || !isAdminMode()) return;

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
  elements.roleScreen.hidden = true;
  elements.app.hidden = true;
  elements.passcodeInput.value = "";
  elements.passcodeError.textContent = "";
  setTimeout(() => elements.passcodeInput.focus(), 0);
}

function showRoleScreen() {
  elements.passcodeScreen.hidden = true;
  elements.roleScreen.hidden = false;
  elements.app.hidden = true;
  renderRoleMemberList();
}

function showApp() {
  elements.passcodeScreen.hidden = true;
  elements.roleScreen.hidden = true;
  elements.app.hidden = false;
}

function renderRoleMemberList() {
  if (!state.dataReady) {
    elements.roleMemberList.innerHTML = '<p class="empty-state">Firebaseからメンバーを読み込み中です。</p>';
    elements.memberPinForm.hidden = true;
    return;
  }

  if (state.members.length === 0) {
    elements.roleMemberList.innerHTML = '<p class="empty-state">まだメンバーが登録されていません。管理者として入って追加してください。</p>';
    elements.memberPinForm.hidden = true;
    return;
  }

  elements.roleMemberList.innerHTML = state.members.map((member) => `
    <button class="role-member-button" type="button" data-role-member-id="${member.id}">
      <span class="member-dot" style="background:${member.color}"></span>
      <span class="member-name">${escapeHtml(member.name)}</span>
    </button>
  `).join("");
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

  elements.activeMemberBadge.classList.toggle("is-admin-mode", isAdminMode());
  elements.activeMemberBadge.classList.toggle("is-member-mode", isMemberMode());
  elements.activeMemberBadge.style.background = "";
  elements.activeMemberBadge.style.color = "";

  if (isAdminMode()) {
    elements.activeMemberBadge.textContent = "管理者モード";
    elements.modeHelp.innerHTML = '<span class="mode-help-primary">管理者モードです。</span><span class="mode-help-note">メンバー追加・削除、PIN再設定、共有URLコピー、全データリセットができます。</span>';
    elements.modeHelp.hidden = false;
  } else if (isMemberMode() && activeMember) {
    elements.activeMemberBadge.textContent = `メンバーモード：${activeMember.name}`;
    elements.activeMemberBadge.style.background = activeMember.color;
    elements.activeMemberBadge.style.color = getReadableTextColor(activeMember.color);
    elements.modeHelp.textContent = `${activeMember.name}さんとして入力中です。自分の予定だけ変更できます。`;
    elements.modeHelp.hidden = false;
  } else {
    elements.activeMemberBadge.textContent = "未選択";
    elements.modeHelp.hidden = true;
  }

  if (!state.dataReady) {
    elements.memberList.innerHTML = '<p class="empty-state">Firebaseからデータを読み込み中です。</p>';
    renderPinResetForm();
    renderMemberSelfTools();
    return;
  }

  if (state.members.length === 0) {
    elements.memberList.innerHTML = '<p class="empty-state">まずはメンバーを追加してください。追加した人を選ぶと、カレンダーに入力できます。</p>';
    renderPinResetForm();
    renderMemberSelfTools();
    return;
  }

  elements.memberList.innerHTML = state.members.map((member) => {
    const isActive = member.id === state.activeMemberId;
    return `
      <div class="member-item ${isActive ? "is-active" : ""}">
        <button class="member-select" type="button" data-member-id="${member.id}" ${!isAdminMode() ? "disabled" : ""}>
          <span class="member-dot" style="background:${member.color}"></span>
          <span class="member-name">${escapeHtml(member.name)}</span>
        </button>
        ${isAdminMode() ? `
          <div class="member-admin-actions">
            <button class="reset-pin-button" type="button" data-reset-pin-member-id="${member.id}">PIN再設定</button>
            <button class="delete-member" type="button" data-delete-member-id="${member.id}" aria-label="${escapeHtml(member.name)}さんを削除">×</button>
          </div>
        ` : ""}
      </div>
    `;
  }).join("");

  renderPinResetForm();
  renderMemberSelfTools();
}

function renderPinResetForm() {
  if (!isAdminMode() || !state.dataReady || !state.pendingPinResetMemberId) {
    elements.adminPinResetForm.hidden = true;
    return;
  }

  const member = getMemberById(state.pendingPinResetMemberId);
  if (!member) {
    hidePinResetForm();
    return;
  }

  elements.resetPinMemberName.textContent = `${member.name}さんのPINを再設定`;
  elements.adminPinResetForm.hidden = false;
}

function hidePinResetForm() {
  state.pendingPinResetMemberId = null;
  elements.adminPinResetForm.hidden = true;
  elements.resetPinInput.value = "";
  elements.resetPinStatus.textContent = "";
}

function renderMemberSelfTools() {
  const activeMember = getActiveMember();
  elements.memberSelfTools.hidden = !isMemberMode() || !activeMember || !state.dataReady;

  if (!isMemberMode() || !activeMember) {
    clearPinChangeForm();
  }
}

function clearPinChangeForm() {
  elements.pinChangeForm.hidden = true;
  elements.currentPinInput.value = "";
  elements.newPinInput.value = "";
  elements.newPinConfirmInput.value = "";
  elements.pinChangeStatus.style.color = "";
  elements.pinChangeStatus.textContent = "";
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
  if (!state.authenticated) {
    showPasscodeScreen();
  } else if (!state.role) {
    showRoleScreen();
  } else {
    showApp();
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
    state.role = null;
    state.pendingMemberId = null;
    render();
  });

  elements.adminLoginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const passcode = elements.adminPasscodeInput.value.trim();

    if (passcode !== APP_CONFIG.adminPasscode) {
      elements.adminError.textContent = "管理者パスコードが違います。";
      return;
    }

    elements.adminPasscodeInput.value = "";
    enterAdminMode();
  });

  elements.roleMemberList.addEventListener("click", (event) => {
    const memberButton = event.target.closest("[data-role-member-id]");
    if (!memberButton) return;
    selectRoleMember(memberButton.dataset.roleMemberId);
  });

  elements.memberPinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const member = getMemberById(state.pendingMemberId);
    if (!member) {
      elements.pinError.textContent = "メンバーが見つかりません。";
      return;
    }

    const inputPin = elements.roleMemberPinInput.value.trim();

    try {
      const pinMatched = await verifyMemberPin(member, inputPin);
      if (!pinMatched) {
        elements.pinError.textContent = "PINが違います。";
        return;
      }
    } catch (error) {
      console.error("PIN確認エラー", error);
      elements.pinError.textContent = "PINを確認できませんでした。ブラウザを更新してもう一度試してください。";
      return;
    }

    enterMemberMode(member.id);
  });

  elements.pinCancelButton.addEventListener("click", () => {
    state.pendingMemberId = null;
    elements.memberPinForm.hidden = true;
    elements.pinError.textContent = "";
    elements.roleMemberPinInput.value = "";
  });

  elements.logoutButton.addEventListener("click", () => {
    state.authenticated = false;
    state.role = null;
    state.pendingMemberId = null;
    render();
  });

  elements.copyShareUrlButton.addEventListener("click", async () => {
    if (!isAdminMode()) return;

    try {
      await copyTextToClipboard(window.location.href);
      setShareStatus("共有URLをコピーしました");
    } catch (error) {
      console.warn("共有URLコピーに失敗しました。", error);
      setShareStatus("共有URLのコピーに失敗しました");
    }
  });

  elements.resetButton.addEventListener("click", async () => {
    if (!canUseSharedData() || !isAdminMode()) return;

    const confirmed = confirm("全データをリセットします。メンバーと入力済み予定も消えます。よろしいですか？");
    if (!confirmed) return;

    state.activeMemberId = null;
    saveActiveMember();
    await roomRef.set(getInitialSharedData());
  });

  elements.copyCandidatesButton.addEventListener("click", async () => {
    if (!isAdminMode()) return;

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
    const pin = elements.memberPinAdminInput.value.trim();

    if (!name) {
      alert("メンバー名を入力してください。");
      elements.memberNameInput.focus();
      return;
    }

    const added = await addMember(name, color, pin);
    if (!added) return;

    elements.memberNameInput.value = "";
    elements.memberPinAdminInput.value = "";
    elements.memberColorInput.value = APP_CONFIG.starterColors[state.members.length % APP_CONFIG.starterColors.length];
    elements.memberNameInput.focus();
  });

  elements.memberList.addEventListener("click", async (event) => {
    const selectButton = event.target.closest("[data-member-id]");
    const deleteButton = event.target.closest("[data-delete-member-id]");
    const resetPinButton = event.target.closest("[data-reset-pin-member-id]");

    if (resetPinButton) {
      if (!isAdminMode()) return;
      state.pendingPinResetMemberId = resetPinButton.dataset.resetPinMemberId;
      elements.resetPinInput.value = "";
      elements.resetPinStatus.textContent = "";
      renderPinResetForm();
      elements.resetPinInput.focus();
      return;
    }

    if (deleteButton) {
      if (!isAdminMode()) return;
      await deleteMember(deleteButton.dataset.deleteMemberId);
      return;
    }

    if (selectButton) {
      if (!isAdminMode()) return;
      state.activeMemberId = selectButton.dataset.memberId;
      saveActiveMember();
      hideMemberNotice();
      renderMemberList();
      renderCalendar();
    }
  });

  elements.adminPinResetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!canUseSharedData() || !isAdminMode()) return;

    const member = getMemberById(state.pendingPinResetMemberId);
    const newPin = elements.resetPinInput.value.trim();

    if (!member) {
      elements.resetPinStatus.textContent = "メンバーが見つかりません。";
      return;
    }

    if (!APP_CONFIG.pinPattern.test(newPin)) {
      elements.resetPinStatus.textContent = "PINは半角数字6桁で入力してください。";
      elements.resetPinInput.focus();
      return;
    }

    try {
      await saveMemberPinHash(member.id, newPin);
      hidePinResetForm();
      showMemberNotice(`${member.name}さんのPINを再設定しました。`);
    } catch (error) {
      console.error("PIN再設定エラー", error);
      elements.resetPinStatus.textContent = "PINを再設定できませんでした。もう一度試してください。";
    }
  });

  elements.resetPinCancelButton.addEventListener("click", () => {
    hidePinResetForm();
  });

  elements.togglePinChangeButton.addEventListener("click", () => {
    elements.pinChangeForm.hidden = !elements.pinChangeForm.hidden;
    elements.pinChangeStatus.textContent = "";

    if (!elements.pinChangeForm.hidden) {
      elements.currentPinInput.focus();
    }
  });

  elements.pinChangeCancelButton.addEventListener("click", () => {
    clearPinChangeForm();
  });

  elements.pinChangeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!canUseSharedData() || !isMemberMode()) return;

    const activeMember = getActiveMember();
    const currentPin = elements.currentPinInput.value.trim();
    const newPin = elements.newPinInput.value.trim();
    const newPinConfirm = elements.newPinConfirmInput.value.trim();

    elements.pinChangeStatus.style.color = "";

    if (!activeMember) {
      elements.pinChangeStatus.textContent = "メンバー情報が見つかりません。";
      return;
    }

    if (!APP_CONFIG.pinPattern.test(newPin)) {
      elements.pinChangeStatus.textContent = "新しいPINは半角数字6桁で入力してください。";
      elements.newPinInput.focus();
      return;
    }

    if (newPin !== newPinConfirm) {
      elements.pinChangeStatus.textContent = "新しいPINと確認用PINが一致しません。";
      elements.newPinConfirmInput.focus();
      return;
    }

    try {
      const currentPinMatched = await verifyMemberPin(activeMember, currentPin);
      if (!currentPinMatched) {
        elements.pinChangeStatus.textContent = "現在のPINが違います。";
        elements.currentPinInput.focus();
        return;
      }

      await saveMemberPinHash(activeMember.id, newPin);
      elements.currentPinInput.value = "";
      elements.newPinInput.value = "";
      elements.newPinConfirmInput.value = "";
      elements.pinChangeStatus.style.color = "#2e6b3f";
      elements.pinChangeStatus.textContent = "PINを変更しました";
    } catch (error) {
      console.error("PIN変更エラー", error);
      elements.pinChangeStatus.textContent = "PINを変更できませんでした。もう一度試してください。";
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