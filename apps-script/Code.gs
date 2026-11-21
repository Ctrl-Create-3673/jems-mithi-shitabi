/************************************************
 MITHI SHITABI 2026 — JSON API (Code.gs)
 Class 10 girls, Jamali English Medium School, Dholka.
 Frontend: GitHub Pages (index.html) calls this web app with fetch().

 One-time setup (in a NEW blank Google Sheet → Extensions → Apps Script):
 1. Paste this file as Code.gs and save.
 2. Run setupSheets() once. Then add team logins in the "Team" tab (ITS, Name, Role Staff/Admin, Password) and run selfCheck().
 4. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
************************************************/

const SESSION_HOURS = 12;
const STATUSES = ["Pending", "Partly paid", "Paid", "Cancelled"];
const MODES = ["Cash", "Online"];
const EXPENSE_TYPES = ["Food & catering", "Venue & setup", "Decoration", "Printing & cards", "Utensils & serving", "Transport", "Other"];

const BOOKING_HEADERS = ["Booking ID", "Created At", "Source", "Name", "Mobile", "ITS", "Thaals", "Cards", "Amount Due",
  "Status", "Paid Amount", "Payment Mode", "Payment Ref", "Received By", "Paid At", "Notes", "Updated At", "Updated By"];
const B = { id: 0, created: 1, source: 2, name: 3, mobile: 4, its: 5, thaals: 6, cards: 7, due: 8, status: 9,
  paid: 10, mode: 11, ref: 12, receivedBy: 13, paidAt: 14, notes: 15, updated: 16, updatedBy: 17 };
const TEAM_HEADERS = ["ITS", "Name", "Role", "Password"];
const EXPENSE_HEADERS = ["Expense ID", "Date", "Item", "Category", "Amount", "Paid By", "Note", "Added At", "Added By"];

/************************************************
 HTTP
************************************************/

function doGet() { return json({ ok: true, app: "Mithi Shitabi API" }); }

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: "Bad request." }); }
  try {
    const h = ACTIONS[req.action];
    if (!h) return json({ ok: false, error: "Unknown action." });
    const user = h.public ? null : requireSession(req.token, h.admin);
    return json(Object.assign({ ok: true }, h.run(req, user)));
  } catch (err) {
    return json({ ok: false, error: err.message, auth: err.auth === true });
  }
}

function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/************************************************
 SESSIONS
************************************************/

function requireSession(token, adminOnly) {
  const raw = token && CacheService.getScriptCache().get("s:" + token);
  if (!raw) { const e = new Error("Your session has ended. Please log in again."); e.auth = true; throw e; }
  const u = JSON.parse(raw);
  if (adminOnly && u.role !== "admin") throw new Error("Only the teacher in charge can do this.");
  return u;
}

/************************************************
 SHEET HELPERS
************************************************/

function tab(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); if (headers) sh.appendRow(headers); }
  return sh;
}

function settings() {
  const rows = tab("Settings", ["Key", "Value"]).getDataRange().getValues();
  const s = { thaalPrice: 2100, cardPrice: 300, thaalLimit: 0, bookingOpen: true };
  rows.slice(1).forEach(r => {
    const k = String(r[0]).trim();
    if (k === "Thaal Price") s.thaalPrice = Number(r[1]) || s.thaalPrice;
    if (k === "Card Price") s.cardPrice = Number(r[1]) || s.cardPrice;
    if (k === "Thaal Limit") s.thaalLimit = Number(r[1]) || 0;
    if (k === "Booking Open") s.bookingOpen = String(r[1]).toUpperCase() !== "NO";
  });
  return s;
}

function stamp(d) { return d instanceof Date ? Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm") : String(d || ""); }
function day(d) { return d instanceof Date ? Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd") : String(d || ""); }
function clean(v, max) { return String(v == null ? "" : v).trim().slice(0, max || 200); }
function int(v, min, max, label) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(label + " must be a whole number from " + min + " to " + max + ".");
  return n;
}
function mobile(v) {
  const m = String(v || "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(m)) throw new Error("Enter a 10-digit mobile number.");
  return m;
}
function statusFor(due, paid, current) {
  if (current === "Cancelled") return "Cancelled";
  return paid <= 0 ? "Pending" : paid >= due ? "Paid" : "Partly paid";
}

function readBookings() {
  return tab("Bookings", BOOKING_HEADERS).getDataRange().getValues().slice(1).map((r, i) => ({
    row: i + 2, id: String(r[B.id]), created: stamp(r[B.created]), source: String(r[B.source]), name: String(r[B.name]),
    mobile: String(r[B.mobile]), its: String(r[B.its]), thaals: Number(r[B.thaals]) || 0, cards: Number(r[B.cards]) || 0,
    due: Number(r[B.due]) || 0, status: String(r[B.status]), paid: Number(r[B.paid]) || 0, mode: String(r[B.mode]),
    ref: String(r[B.ref]), receivedBy: String(r[B.receivedBy]), paidAt: stamp(r[B.paidAt]), notes: String(r[B.notes]),
    updated: stamp(r[B.updated]), updatedBy: String(r[B.updatedBy])
  })).filter(b => b.id);
}

function readExpenses() {
  return tab("Expenses", EXPENSE_HEADERS).getDataRange().getValues().slice(1).map((r, i) => ({
    row: i + 2, id: String(r[0]), date: day(r[1]), item: String(r[2]), category: String(r[3]), amount: Number(r[4]) || 0,
    paidBy: String(r[5]), note: String(r[6]), added: stamp(r[7]), addedBy: String(r[8])
  })).filter(x => x.id);
}

function bookedThaals(list) { return list.filter(b => b.status !== "Cancelled").reduce((s, b) => s + b.thaals, 0); }

function findRow(sh, id) {
  const ids = sh.getLastRow() < 2 ? [] : sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  throw new Error("Booking " + id + " not found. Refresh and try again.");
}

function newId(prefix) {
  return prefix + "-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "ddHHmm") + "-" +
    Math.floor(Math.random() * 900 + 100);
}

// Any change may alter prices or thaals left, so it also clears the cached event summary.
function log(user, action) {
  CacheService.getScriptCache().remove("event");
  tab("Audit Log", ["Timestamp", "User", "Action"]).appendRow([new Date(), user, action]);
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* Creates a booking row. Used by the public form and by staff. */
function createBooking(req, source, by) {
  const s = settings();
  const name = clean(req.name, 80);
  if (name.length < 2) throw new Error("Enter the name for the booking.");
  const mob = mobile(req.mobile);
  const thaals = int(req.thaals || 0, 0, 20, "Thaals"), cards = int(req.cards || 0, 0, 50, "Cards");
  if (!thaals && !cards) throw new Error("Book at least one thaal or one card.");
  return withLock(() => {
    const list = readBookings();
    if (s.thaalLimit && bookedThaals(list) + thaals > s.thaalLimit) {
      const left = Math.max(0, s.thaalLimit - bookedThaals(list));
      throw new Error(left ? "Only " + left + " thaal" + (left === 1 ? "" : "s") + " left." : "All thaals are booked.");
    }
    const due = thaals * s.thaalPrice + cards * s.cardPrice;
    const id = newId("MS");
    const now = new Date();
    tab("Bookings", BOOKING_HEADERS).appendRow([id, now, source, name, mob, clean(req.its, 12), thaals, cards, due,
      "Pending", 0, MODES.indexOf(req.mode) >= 0 ? req.mode : "", "", "", "", clean(req.notes, 300), now, by]);
    log(by, "New booking " + id + ": " + thaals + " thaal, " + cards + " card");
    return { id: id, due: due, thaals: thaals, cards: cards };
  });
}

/************************************************
 ACTIONS
************************************************/

const ACTIONS = {
  /* ---- public ---- */
  event: { public: true, run: function () {
    const cache = CacheService.getScriptCache(), hit = cache.get("event");
    if (hit) return JSON.parse(hit);
    const s = settings(), list = readBookings();
    const booked = bookedThaals(list);
    const out = { thaalPrice: s.thaalPrice, cardPrice: s.cardPrice, thaalLimit: s.thaalLimit, bookingOpen: s.bookingOpen,
      thaalsLeft: s.thaalLimit ? Math.max(0, s.thaalLimit - booked) : null };
    cache.put("event", JSON.stringify(out), 30);
    return out;
  } },

  book: { public: true, run: function (req) {
    if (req.website) throw new Error("Bad request."); // honeypot field, hidden from people
    const s = settings();
    if (!s.bookingOpen) throw new Error("Online booking is closed. Please contact the Class 10 girls.");
    const key = "m:" + String(req.mobile || "").replace(/\D/g, "").slice(-10);
    const cache = CacheService.getScriptCache();
    if (cache.get(key)) throw new Error("A booking from this number was just made. Wait a minute before booking again.");
    const r = createBooking(req, "Parent form", "Parent form");
    cache.put(key, "1", 60);
    return r;
  } },

  lookup: { public: true, run: function (req) {
    const id = clean(req.id, 30).toUpperCase(), mob = String(req.mobile || "").replace(/\D/g, "").slice(-10);
    const b = readBookings().find(x => x.id.toUpperCase() === id && x.mobile.slice(-10) === mob);
    if (!b) throw new Error("No booking matches that ID and mobile number.");
    return { booking: { id: b.id, name: b.name, thaals: b.thaals, cards: b.cards, due: b.due, paid: b.paid, status: b.status, created: b.created } };
  } },

  staffLogin: { public: true, run: function (req) {
    const its = clean(req.its, 20), pw = String(req.code || "").trim();
    if (!its || !pw) throw new Error("Enter your ITS number and password.");
    Utilities.sleep(400); // slows password guessing
    // Display values keep ITS numbers and passwords as typed, even if the cells hold numbers.
    const row = tab("Team", TEAM_HEADERS).getDataRange().getDisplayValues().slice(1).find(r => String(r[0]).trim() === its);
    if (!row || !String(row[3]).trim() || String(row[3]).trim() !== pw) throw new Error("That ITS number and password don't match.");
    const role = String(row[2]).trim().toLowerCase() === "admin" ? "admin" : "staff";
    const name = String(row[1]).trim() || its;
    const user = { role: role, name: name, its: its };
    const token = Utilities.getUuid();
    CacheService.getScriptCache().put("s:" + token, JSON.stringify(user), SESSION_HOURS * 3600);
    log(name, "Logged in (" + role + ")");
    return { token: token, user: user };
  } },

  /* ---- staff ---- */
  dashboard: { run: function () {
    const s = settings(), list = readBookings(), live = list.filter(b => b.status !== "Cancelled"), exp = readExpenses();
    const sum = (arr, f) => arr.reduce((t, x) => t + f(x), 0);
    const byMode = {}; live.forEach(b => { if (b.paid) byMode[b.mode || "Not set"] = (byMode[b.mode || "Not set"] || 0) + b.paid; });
    const byStatus = {}; list.forEach(b => { byStatus[b.status] = (byStatus[b.status] || 0) + 1; });
    const byCat = {}; exp.forEach(x => { byCat[x.category] = (byCat[x.category] || 0) + x.amount; });
    return { settings: s, stats: {
      bookings: live.length, thaals: sum(live, b => b.thaals), cards: sum(live, b => b.cards),
      due: sum(live, b => b.due), collected: sum(live, b => b.paid), expenses: sum(exp, x => x.amount)
    }, byMode: byMode, byStatus: byStatus, byCategory: byCat };
  } },

  bookings: { run: function () { return { bookings: readBookings().reverse(), statuses: STATUSES, modes: MODES }; } },

  addBooking: { run: function (req, u) { return createBooking(req, "Staff", u.name); } },

  editBooking: { run: function (req, u) {
    const s = settings();
    const name = clean(req.name, 80); if (name.length < 2) throw new Error("Enter the name for the booking.");
    const mob = mobile(req.mobile);
    const thaals = int(req.thaals, 0, 20, "Thaals"), cards = int(req.cards, 0, 50, "Cards");
    return withLock(() => {
      const sh = tab("Bookings", BOOKING_HEADERS), row = findRow(sh, req.id);
      const cur = sh.getRange(row, 1, 1, BOOKING_HEADERS.length).getValues()[0];
      const others = readBookings().filter(b => b.id !== req.id);
      if (s.thaalLimit && cur[B.status] !== "Cancelled" && bookedThaals(others) + thaals > s.thaalLimit) throw new Error("That goes over the thaal limit.");
      const due = thaals * s.thaalPrice + cards * s.cardPrice, paid = Number(cur[B.paid]) || 0;
      sh.getRange(row, B.name + 1, 1, 6).setValues([[name, mob, clean(req.its, 12), thaals, cards, due]]);
      sh.getRange(row, B.status + 1).setValue(statusFor(due, paid, cur[B.status]));
      sh.getRange(row, B.notes + 1, 1, 3).setValues([[clean(req.notes, 300), new Date(), u.name]]);
      log(u.name, "Edited booking " + req.id);
      return {};
    });
  } },

  recordPayment: { run: function (req, u) {
    const amount = Number(req.amount);
    if (!(amount > 0) || amount > 200000) throw new Error("Enter the amount received.");
    if (MODES.indexOf(req.mode) < 0) throw new Error("Choose Cash or Online.");
    if (req.mode === "Online" && !clean(req.ref, 60)) throw new Error("Enter the UPI or transaction reference.");
    return withLock(() => {
      const sh = tab("Bookings", BOOKING_HEADERS), row = findRow(sh, req.id);
      const cur = sh.getRange(row, 1, 1, BOOKING_HEADERS.length).getValues()[0];
      if (cur[B.status] === "Cancelled") throw new Error("This booking is cancelled. Restore it before recording a payment.");
      const paid = (Number(cur[B.paid]) || 0) + amount, due = Number(cur[B.due]) || 0;
      const ref = [String(cur[B.ref] || ""), clean(req.ref, 60)].filter(Boolean).join(", ");
      const mode = cur[B.mode] && cur[B.mode] !== req.mode && cur[B.paid] > 0 ? "Cash + Online" : req.mode;
      const now = new Date();
      sh.getRange(row, B.status + 1, 1, 6).setValues([[statusFor(due, paid, ""), paid, mode, ref, u.name, now]]);
      sh.getRange(row, B.updated + 1, 1, 2).setValues([[now, u.name]]);
      log(u.name, "Payment ₹" + amount + " (" + req.mode + ") for " + req.id);
      return { paid: paid, status: statusFor(due, paid, "") };
    });
  } },

  setCancelled: { run: function (req, u) {
    return withLock(() => {
      const sh = tab("Bookings", BOOKING_HEADERS), row = findRow(sh, req.id);
      const cur = sh.getRange(row, 1, 1, BOOKING_HEADERS.length).getValues()[0];
      const status = req.cancel ? "Cancelled" : statusFor(Number(cur[B.due]) || 0, Number(cur[B.paid]) || 0, "");
      if (!req.cancel) {
        const s = settings();
        if (s.thaalLimit && bookedThaals(readBookings()) + (Number(cur[B.thaals]) || 0) > s.thaalLimit) throw new Error("Not enough thaals left to restore this booking.");
      }
      sh.getRange(row, B.status + 1).setValue(status);
      sh.getRange(row, B.updated + 1, 1, 2).setValues([[new Date(), u.name]]);
      log(u.name, (req.cancel ? "Cancelled " : "Restored ") + req.id);
      return { status: status };
    });
  } },

  expenses: { run: function () { return { expenses: readExpenses().reverse(), categories: EXPENSE_TYPES }; } },

  addExpense: { run: function (req, u) {
    const item = clean(req.item, 100), amount = Number(req.amount), date = clean(req.date, 10);
    if (item.length < 2) throw new Error("Enter what the money was spent on.");
    if (!(amount > 0) || amount > 500000) throw new Error("Enter the amount spent.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose the date.");
    const cat = EXPENSE_TYPES.indexOf(req.category) >= 0 ? req.category : "Other";
    tab("Expenses", EXPENSE_HEADERS).appendRow([newId("EX"), date, item, cat, amount, clean(req.paidBy, 60) || u.name, clean(req.note, 200), new Date(), u.name]);
    log(u.name, "Expense ₹" + amount + " for " + item);
    return {};
  } },

  deleteExpense: { admin: true, run: function (req, u) {
    return withLock(() => {
      const sh = tab("Expenses", EXPENSE_HEADERS), row = findRow(sh, req.id);
      const item = sh.getRange(row, 3).getValue(), amount = sh.getRange(row, 5).getValue();
      sh.deleteRow(row);
      log(u.name, "Deleted expense " + req.id + " (" + item + ", ₹" + amount + ")");
      return {};
    });
  } },

  saveSettings: { admin: true, run: function (req, u) {
    const limit = int(req.thaalLimit || 0, 0, 2000, "Thaal limit");
    const tp = int(req.thaalPrice, 1, 100000, "Thaal price"), cp = int(req.cardPrice, 0, 100000, "Card price");
    const sh = tab("Settings", ["Key", "Value"]);
    sh.getRange(2, 1, 4, 2).setValues([["Thaal Price", tp], ["Card Price", cp], ["Thaal Limit", limit], ["Booking Open", req.bookingOpen ? "YES" : "NO"]]);
    log(u.name, "Settings: limit " + (limit || "none") + ", booking " + (req.bookingOpen ? "open" : "closed"));
    return {};
  } },

  audit: { admin: true, run: function () {
    const rows = tab("Audit Log", ["Timestamp", "User", "Action"]).getDataRange().getValues().slice(1).slice(-150).reverse();
    return { log: rows.map(r => ({ time: stamp(r[0]), user: String(r[1]), action: String(r[2]) })) };
  } }
};

/************************************************
 ONE-TIME SETUP: run from the editor.
************************************************/

function setupSheets() {
  const style = (sh, n) => { sh.getRange(1, 1, 1, n).setFontWeight("bold").setBackground("#1e3567").setFontColor("#ffffff"); sh.setFrozenRows(1); };
  const b = tab("Bookings", BOOKING_HEADERS); style(b, BOOKING_HEADERS.length);
  b.getRange(2, B.status + 1, b.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build());
  b.getRange(2, B.due + 1, b.getMaxRows() - 1, 1).setNumberFormat("₹#,##0");
  b.getRange(2, B.paid + 1, b.getMaxRows() - 1, 1).setNumberFormat("₹#,##0");
  b.getRange(2, B.mobile + 1, b.getMaxRows() - 1, 2).setNumberFormat("@");
  const e = tab("Expenses", EXPENSE_HEADERS); style(e, EXPENSE_HEADERS.length);
  e.getRange(2, 5, e.getMaxRows() - 1, 1).setNumberFormat("₹#,##0");
  e.getRange(2, 4, e.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(EXPENSE_TYPES, true).build());
  const s = tab("Settings", ["Key", "Value"]); style(s, 2);
  if (s.getLastRow() < 5) s.getRange(2, 1, 4, 2).setValues([["Thaal Price", 2100], ["Card Price", 300], ["Thaal Limit", 0], ["Booking Open", "YES"]]);
  style(tab("Audit Log", ["Timestamp", "User", "Action"]), 3);
  const t = tab("Team", TEAM_HEADERS); style(t, TEAM_HEADERS.length);
  t.getRange(2, 1, t.getMaxRows() - 1, 4).setNumberFormat("@");
  t.getRange(2, 3, t.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["Staff", "Admin"], true).build());
  const def = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sheet1");
  if (def && def.getLastRow() === 0) SpreadsheetApp.getActiveSpreadsheet().deleteSheet(def);
}

/************************************************
 SELF-CHECK: run from the editor; throws if something is wrong.
************************************************/

function selfCheck() {
  const team = tab("Team", TEAM_HEADERS).getDataRange().getDisplayValues().slice(1).filter(r => r[0] && r[3]);
  if (!team.length) throw new Error("Add at least one login in the Team tab (ITS, Name, Role, Password).");
  if (!team.some(r => String(r[2]).toLowerCase() === "admin")) throw new Error("Make at least one Team row an Admin.");
  if (statusFor(2100, 0, "") !== "Pending" || statusFor(2100, 1000, "") !== "Partly paid" || statusFor(2100, 2100, "") !== "Paid") throw new Error("Status rule broken.");
  const s = settings();
  Logger.log("OK: thaal ₹%s, card ₹%s, limit %s, booking %s, %s bookings so far", s.thaalPrice, s.cardPrice, s.thaalLimit || "none", s.bookingOpen ? "open" : "closed", readBookings().length);
}
