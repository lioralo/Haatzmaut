const state = {
  users: [
    { fullName: "מנהל מערכת", phone: "0500000000", email: "admin@clinic.org", chatShortcut: "@admin", role: "מנהל", team: "אדמיניסטרציה" },
    { fullName: "ד" + '"' + "ר לוי", phone: "0500000001", email: "levy@clinic.org", chatShortcut: "@levy", role: "פסיכולוג", team: "מבוגרים" }
  ],
  credentials: { admin: "admin123", staff: "staff123" },
  rooms: [
    { name: "חדר 1", tags: ["טיפול ילדים", "ציוד אבחוני"] },
    { name: "חדר 2", tags: ["טיפול קבוצתי"] },
    { name: "חדר 3", tags: ["טיפול מבוגרים", "ציוד אבחוני"] },
    { name: "חדר 4", tags: ["חדר משחק"] }
  ],
  baseTemplate: [
    { room: "חדר 1", hour: "09:00", staff: "נועה כהן", duration: 60, team: "ילדים" },
    { room: "חדר 2", hour: "10:00", staff: "יואב בר", duration: 60, team: "מבוגרים" },
    { room: "חדר 3", hour: "11:00", staff: "מאיה לוי", duration: 90, team: "מבוגרים" }
  ],
  schedule: [],
  requests: [],
  meetings: [],
  resources: [],
  issues: [],
  notifications: [],
  selectedTags: new Set(),
  hours: ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"]
};

const byId = (id) => document.getElementById(id);
const weekStart = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const fmtDate = (date) => date.toLocaleDateString("he-IL");
const activeWeek = weekStart();

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      values.push(value.trim());
      value = "";
    } else {
      value += ch;
    }
  }
  values.push(value.trim());
  return values;
}

function initScheduleFromTemplate() {
  state.schedule = state.baseTemplate.map((entry) => ({ ...entry, weekStart: fmtDate(activeWeek), oneTime: false, source: "base" }));
}

function updateWeekLabels() {
  const end = new Date(activeWeek);
  end.setDate(end.getDate() + 6);
  byId("weekLabel").textContent = `שבוע נוכחי: ${fmtDate(activeWeek)} - ${fmtDate(end)}`;

  const nextSunday = new Date();
  const daysUntilNextSunday = ((7 - nextSunday.getDay()) % 7) || 7;
  nextSunday.setDate(nextSunday.getDate() + daysUntilNextSunday);
  byId("meetingDate").textContent = `הישיבה הקרובה: ${fmtDate(nextSunday)} (יום ראשון)`;
}

function showTab(tabId) {
  document.querySelectorAll(".tab-content").forEach((tab) => tab.classList.add("hidden"));
  document.querySelectorAll(".tabs button").forEach((btn) => btn.classList.remove("active"));
  byId(tabId).classList.remove("hidden");
  document.querySelector(`[data-tab='${tabId}']`).classList.add("active");
}

function renderTagFilters() {
  const container = byId("tagFilters");
  container.innerHTML = "";
  [...new Set(state.rooms.flatMap((r) => r.tags))].forEach((tag) => {
    const label = document.createElement("label");
    label.className = "chip";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = state.selectedTags.has(tag);
    cb.addEventListener("change", () => {
      cb.checked ? state.selectedTags.add(tag) : state.selectedTags.delete(tag);
      renderRoomOptions();
      renderOccupancy();
    });
    label.append(cb, document.createTextNode(` ${tag}`));
    container.append(label);
  });
}

function roomAllowed(roomName) {
  if (state.selectedTags.size === 0) return true;
  const room = state.rooms.find((r) => r.name === roomName);
  if (!room) return false;
  return [...state.selectedTags].every((tag) => room.tags.includes(tag));
}

function renderRoomOptions() {
  const select = byId("requestRoom");
  const options = state.rooms.filter((r) => roomAllowed(r.name));
  select.innerHTML = options.map((r) => `<option>${r.name}</option>`).join("") || "<option>אין חדר זמין</option>";
}

function renderOccupancy() {
  const table = byId("occupancyTable");
  const rooms = state.rooms.filter((r) => roomAllowed(r.name));
  table.innerHTML = `
    <thead>
      <tr>
        <th>שעה</th>
        ${rooms.map((room) => `<th>${room.name}<br><small>${room.tags.join(" • ")}</small></th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${state.hours.map((hour) => {
        const row = rooms.map((room) => {
          const entry = state.schedule.find((s) => s.room === room.name && s.hour === hour);
          if (!entry) return `<td><button data-room='${room.name}' data-hour='${hour}' class='report-issue'>דיווח תקלה</button></td>`;
          return `<td>
            <div><strong>${entry.staff}</strong></div>
            <div>${entry.duration} דקות</div>
            ${entry.oneTime ? "<span class='badge'>חד-פעמי</span>" : ""}
            <div class='cell-actions'><button data-room='${room.name}' data-hour='${hour}' class='report-issue'>דיווח תקלה</button></div>
          </td>`;
        }).join("");
        return `<tr><th>${hour}</th>${row}</tr>`;
      }).join("")}
    </tbody>`;

  table.querySelectorAll(".report-issue").forEach((btn) => {
    btn.addEventListener("click", () => {
      const details = prompt("תיאור התקלה:");
      if (!details) return;
      state.issues.unshift({ room: btn.dataset.room, hour: btn.dataset.hour, details, createdAt: new Date().toLocaleString("he-IL") });
      addNotification(`נפתחה תקלה ב${btn.dataset.room} בשעה ${btn.dataset.hour}: ${details}`, true);
      renderIssues();
    });
  });
}

function addNotification(text, critical = false) {
  state.notifications.unshift({ text, critical, at: new Date().toLocaleString("he-IL") });
  renderNotifications();
}

function renderRequests() {
  const list = byId("requestsList");
  if (state.requests.length === 0) {
    list.innerHTML = "<p>אין בקשות ממתינות.</p>";
    return;
  }

  list.innerHTML = state.requests.map((r) => `
    <div class='notice'>
      <div><strong>${r.staff}</strong> ביקש/ה ${r.room} בשעה ${r.hour} (${r.duration} דק')</div>
      <div>צוות: ${r.team} | ${r.reason}</div>
      <button data-id='${r.id}' data-action='approve'>אישור</button>
      <button data-id='${r.id}' data-action='deny'>דחייה</button>
    </div>
  `).join("");

  list.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const req = state.requests.find((r) => r.id === Number(btn.dataset.id));
      if (!req) return;
      state.requests = state.requests.filter((r) => r.id !== req.id);
      const approved = btn.dataset.action === "approve";
      if (approved) {
        state.schedule = state.schedule.filter((s) => !(s.room === req.room && s.hour === req.hour));
        state.schedule.push({ room: req.room, hour: req.hour, staff: req.staff, duration: req.duration, team: req.team, oneTime: req.oneTime, source: "request" });
      }
      addNotification(`בקשת שינוי עבור ${req.staff} ${approved ? "אושרה" : "נדחתה"}. נשלח עדכון דוא"ל ארגוני.`, true);
      renderRequests();
      renderOccupancy();
    });
  });
}

function renderUsers() {
  byId("usersTable").innerHTML = `
    <table>
      <thead><tr><th>שם מלא</th><th>טלפון</th><th>דוא"ל</th><th>קיצור תקשורת</th><th>תפקיד</th><th>צוות</th></tr></thead>
      <tbody>
      ${state.users.map((u) => `<tr><td>${u.fullName}</td><td>${u.phone}</td><td>${u.email}</td><td>${u.chatShortcut}</td><td>${u.role}</td><td>${u.team}</td></tr>`).join("")}
      </tbody>
    </table>`;
}

function renderMeetings() {
  const box = byId("meetingList");
  box.innerHTML = state.meetings.length
    ? state.meetings.map((m) => `<div class='notice'><strong>${m.team}</strong>: ${m.agenda}<br><small>קבצים: ${m.files.join(", ") || "ללא"}</small></div>`).join("")
    : "<p>לא נוספו ישיבות עדיין.</p>";
}

function renderResources() {
  const box = byId("resourceList");
  box.innerHTML = state.resources.length
    ? state.resources.map((r) => `<div class='notice'><strong>${r.title}</strong> (${r.type})<br>${r.content}</div>`).join("")
    : "<p>אין משאבים משותפים כרגע.</p>";
}

function renderIssues() {
  const box = byId("issueQueue");
  box.innerHTML = state.issues.length
    ? state.issues.map((i) => `<div class='notice'><strong>${i.room}</strong> (${i.hour}) - ${i.details}<br><small>${i.createdAt}</small></div>`).join("")
    : "<p>אין תקלות פתוחות.</p>";
}

function renderNotifications() {
  const box = byId("notificationsList");
  box.innerHTML = state.notifications.length
    ? state.notifications.map((n) => `<div class='notice'>${n.critical ? "🔔 " : ""}${n.text}<br><small>${n.at}</small></div>`).join("")
    : "<p>אין התראות.</p>";
}

function loadScheduleFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result || "").trim();
      let records = [];
      if (file.name.toLowerCase().endsWith(".json")) {
        records = JSON.parse(text);
      } else {
        const [header, ...rows] = text.split(/\r?\n/).filter(Boolean);
        const columns = parseCsvLine(header);
        records = rows.map((line) => {
          const values = parseCsvLine(line);
          return Object.fromEntries(columns.map((col, idx) => [col, values[idx]]));
        });
      }
      state.schedule = records.map((r) => ({
        room: r.room,
        hour: r.hour,
        staff: r.staff,
        duration: Number(r.duration || 60),
        team: r.team || "מבוגרים",
        oneTime: String(r.oneTime || "false") === "true"
      }));
      renderOccupancy();
      addNotification("נטען לו\"ז בסיס חדש מקובץ.");
    } catch (e) {
      alert(`פורמט קובץ לא תקין. יש להשתמש ב-CSV/JSON תקניים. פרטים: ${e.message || "שגיאה לא ידועה"}`);
    }
  };
  reader.readAsText(file);
}

function bindEvents() {
  byId("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const u = byId("username").value.trim();
    const p = byId("password").value;
    if (state.credentials[u] === p) {
      sessionStorage.setItem("clinic_user", u);
      byId("activeUser").textContent = `מחובר: ${u}`;
      byId("loginSection").classList.add("hidden");
      byId("appSection").classList.remove("hidden");
      byId("sessionBar").classList.remove("hidden");
      byId("loginError").classList.add("hidden");
      return;
    }
    byId("loginError").classList.remove("hidden");
  });

  byId("logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem("clinic_user");
    byId("appSection").classList.add("hidden");
    byId("sessionBar").classList.add("hidden");
    byId("loginSection").classList.remove("hidden");
  });

  document.querySelectorAll(".tabs button").forEach((btn) => btn.addEventListener("click", () => showTab(btn.dataset.tab)));
  byId("scheduleUpload").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) loadScheduleFile(file);
  });

  byId("requestForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const request = {
      id: Date.now(),
      team: byId("requestTeam").value,
      room: byId("requestRoom").value,
      hour: byId("requestHour").value,
      staff: byId("requestStaff").value.trim(),
      duration: Number(byId("requestDuration").value),
      oneTime: byId("requestOneTime").checked,
      reason: byId("requestReason").value.trim()
    };
    state.requests.unshift(request);
    byId("requestForm").reset();
    renderRequests();
    addNotification("נוצרה בקשת שינוי חדשה לאישור מנהל.", true);
  });

  byId("userForm").addEventListener("submit", (e) => {
    e.preventDefault();
    state.users.push({
      fullName: byId("fullName").value.trim(),
      phone: byId("phone").value.trim(),
      email: byId("email").value.trim(),
      chatShortcut: byId("chatShortcut").value.trim(),
      role: byId("role").value.trim(),
      team: byId("team").value
    });
    byId("userForm").reset();
    renderUsers();
  });

  byId("meetingForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const files = [...byId("meetingFiles").files].map((f) => f.name);
    const meeting = { team: byId("meetingTeam").value, agenda: byId("meetingAgenda").value.trim(), files };
    state.meetings.unshift(meeting);
    byId("meetingForm").reset();
    renderMeetings();
    addNotification("הועלה סדר יום/חומר חדש למודול ישיבות צוות.", true);
  });

  byId("resourceForm").addEventListener("submit", (e) => {
    e.preventDefault();
    state.resources.unshift({ title: byId("resourceTitle").value.trim(), type: byId("resourceType").value, content: byId("resourceUrl").value.trim() });
    byId("resourceForm").reset();
    renderResources();
  });
}

function initialize() {
  initScheduleFromTemplate();
  updateWeekLabels();
  renderTagFilters();
  renderRoomOptions();
  byId("requestHour").innerHTML = state.hours.map((h) => `<option>${h}</option>`).join("");
  renderOccupancy();
  renderRequests();
  renderUsers();
  renderMeetings();
  renderResources();
  renderIssues();
  renderNotifications();
  bindEvents();

  const loggedInUser = sessionStorage.getItem("clinic_user");
  if (loggedInUser) {
    byId("activeUser").textContent = `מחובר: ${loggedInUser}`;
    byId("loginSection").classList.add("hidden");
    byId("appSection").classList.remove("hidden");
    byId("sessionBar").classList.remove("hidden");
  }
}

initialize();
