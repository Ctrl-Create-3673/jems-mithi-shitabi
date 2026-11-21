/* Demo backend: the same actions as apps-script/Code.gs, kept in this browser. Loaded only without API_URL or with ?demo. */
(function () {
  "use strict";
  var KEY = "ms-demo-v1", SKEY = "ms-demo-sessions";
  var STATUSES = ["Pending", "Partly paid", "Paid", "Cancelled"], MODES = ["Cash", "Online"];
  var CATS = ["Food & catering", "Venue & setup", "Decoration", "Printing & cards", "Utensils & serving", "Transport", "Other"];
  function get(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function put(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function now() { var d = new Date(), p = function (n) { return String(n).padStart(2, "0"); }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()); }
  var db = get(KEY, null);
  if (!db) {
    db = { settings: { thaalPrice: 2100, cardPrice: 300, thaalLimit: 0, bookingOpen: true }, bookings: [], expenses: [], log: [] };
    [["Sample Parent A", "9800000001", 2, 2, 4800, "Cash"], ["Sample Parent B", "9800000002", 1, 0, 2100, "Online"], ["Sample Parent C", "9800000003", 1, 3, 1000, "Cash"], ["Sample Parent D", "9800000004", 3, 0, 0, ""]]
      .forEach(function (r, i) {
        var due = r[2] * 2100 + r[3] * 300;
        db.bookings.push({ id: "MS-2009" + i + "-10" + i, created: "2026-11-2" + i + " 18:30", source: i % 2 ? "Staff" : "Parent form", name: r[0], mobile: r[1], its: "", thaals: r[2], cards: r[3], due: due,
          status: r[4] <= 0 ? "Pending" : r[4] >= due ? "Paid" : "Partly paid", paid: r[4], mode: r[5], ref: r[5] === "Online" ? "UPI 4521" : "", receivedBy: r[4] ? "Demo Girl" : "", paidAt: r[4] ? "2026-11-21 19:00" : "", notes: "", updated: "", updatedBy: "" });
      });
    db.expenses.push({ id: "EX-1", date: "2026-11-20", item: "Printing invitation cards", category: "Printing & cards", amount: 1200, paidBy: "Demo Girl", note: "", added: "2026-11-20 17:00", addedBy: "Demo Girl" });
    put(KEY, db);
  }
  var sessions = get(SKEY, {}, true);
  function fail(m, auth) { var e = new Error(m); e.auth = auth; throw e; }
  function need(tok, admin) { var u = sessions[tok]; if (!u) fail("Your session has ended. Please log in again.", true); if (admin && u.role !== "admin") fail("Only the teacher in charge can do this."); return u; }
  function mobile(v) { var m = String(v || "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, ""); if (!/^[6-9]\d{9}$/.test(m)) fail("Enter a 10-digit mobile number."); return m; }
  function int(v, lo, hi, label) { var n = Number(v); if (!Number.isInteger(n) || n < lo || n > hi) fail(label + " must be a whole number from " + lo + " to " + hi + "."); return n; }
  function statusFor(due, paid, cur) { return cur === "Cancelled" ? "Cancelled" : paid <= 0 ? "Pending" : paid >= due ? "Paid" : "Partly paid"; }
  function booked(list) { return list.filter(function (b) { return b.status !== "Cancelled"; }).reduce(function (s, b) { return s + b.thaals; }, 0); }
  function find(id) { var b = db.bookings.find(function (x) { return x.id === id; }); if (!b) fail("Booking " + id + " not found. Refresh and try again."); return b; }
  function log(u, a) { db.log.push({ time: now(), user: u, action: a }); }
  function create(q, source, by) {
    var s = db.settings, name = String(q.name || "").trim(); if (name.length < 2) fail("Enter the name for the booking.");
    var m = mobile(q.mobile), t = int(q.thaals || 0, 0, 20, "Thaals"), c = int(q.cards || 0, 0, 50, "Cards");
    if (!t && !c) fail("Book at least one thaal or one card.");
    if (s.thaalLimit && booked(db.bookings) + t > s.thaalLimit) { var left = Math.max(0, s.thaalLimit - booked(db.bookings)); fail(left ? "Only " + left + " thaals left." : "All thaals are booked."); }
    var id = "MS-" + String(Date.now()).slice(-6) + "-" + Math.floor(Math.random() * 900 + 100), due = t * s.thaalPrice + c * s.cardPrice;
    db.bookings.push({ id: id, created: now(), source: source, name: name, mobile: m, its: String(q.its || ""), thaals: t, cards: c, due: due, status: "Pending", paid: 0, mode: MODES.indexOf(q.mode) >= 0 ? q.mode : "", ref: "", receivedBy: "", paidAt: "", notes: String(q.notes || ""), updated: now(), updatedBy: by });
    log(by, "New booking " + id); return { id: id, due: due, thaals: t, cards: c };
  }
  var A = {
    event: function () { var s = db.settings; return { thaalPrice: s.thaalPrice, cardPrice: s.cardPrice, thaalLimit: s.thaalLimit, bookingOpen: s.bookingOpen, thaalsLeft: s.thaalLimit ? Math.max(0, s.thaalLimit - booked(db.bookings)) : null }; },
    book: function (q) { if (q.website) fail("Bad request."); if (!db.settings.bookingOpen) fail("Online booking is closed. Please contact the Class 10 girls."); return create(q, "Parent form", "Parent form"); },
    lookup: function (q) { var b = db.bookings.find(function (x) { return x.id.toUpperCase() === String(q.id || "").trim().toUpperCase() && x.mobile === String(q.mobile || "").replace(/\D/g, "").slice(-10); }); if (!b) fail("No booking matches that ID and mobile number."); return { booking: b }; },
    staffLogin: function (q) {
      var role = q.code === "teacher" ? "admin" : q.code === "girls" ? "staff" : ""; if (!role) fail("That code isn't right.");
      if (String(q.name || "").trim().length < 2) fail("Enter your name so records show who did what.");
      var tok = Math.random().toString(36).slice(2); sessions[tok] = { role: role, name: q.name.trim() }; put(SKEY, sessions); return { token: tok, user: sessions[tok] };
    },
    dashboard: function () {
      var live = db.bookings.filter(function (b) { return b.status !== "Cancelled"; }), sum = function (a, f) { return a.reduce(function (t, x) { return t + f(x); }, 0); };
      var byMode = {}, byStatus = {}, byCat = {};
      live.forEach(function (b) { if (b.paid) byMode[b.mode || "Not set"] = (byMode[b.mode || "Not set"] || 0) + b.paid; });
      db.bookings.forEach(function (b) { byStatus[b.status] = (byStatus[b.status] || 0) + 1; });
      db.expenses.forEach(function (x) { byCat[x.category] = (byCat[x.category] || 0) + x.amount; });
      return { settings: db.settings, stats: { bookings: live.length, thaals: sum(live, function (b) { return b.thaals; }), cards: sum(live, function (b) { return b.cards; }), due: sum(live, function (b) { return b.due; }), collected: sum(live, function (b) { return b.paid; }), expenses: sum(db.expenses, function (x) { return x.amount; }) }, byMode: byMode, byStatus: byStatus, byCategory: byCat };
    },
    bookings: function () { return { bookings: db.bookings.slice().reverse(), statuses: STATUSES, modes: MODES }; },
    addBooking: function (q, u) { return create(q, "Staff", u.name); },
    editBooking: function (q, u) {
      var b = find(q.id), s = db.settings, name = String(q.name || "").trim(); if (name.length < 2) fail("Enter the name for the booking.");
      var t = int(q.thaals, 0, 20, "Thaals"), c = int(q.cards, 0, 50, "Cards");
      if (s.thaalLimit && b.status !== "Cancelled" && booked(db.bookings.filter(function (x) { return x !== b; })) + t > s.thaalLimit) fail("That goes over the thaal limit.");
      Object.assign(b, { name: name, mobile: mobile(q.mobile), its: String(q.its || ""), thaals: t, cards: c, due: t * s.thaalPrice + c * s.cardPrice, notes: String(q.notes || ""), updated: now(), updatedBy: u.name });
      b.status = statusFor(b.due, b.paid, b.status); log(u.name, "Edited booking " + b.id); return {};
    },
    recordPayment: function (q, u) {
      var b = find(q.id), amt = Number(q.amount); if (!(amt > 0)) fail("Enter the amount received."); if (MODES.indexOf(q.mode) < 0) fail("Choose Cash or Online.");
      if (q.mode === "Online" && !String(q.ref || "").trim()) fail("Enter the UPI or transaction reference.");
      if (b.status === "Cancelled") fail("This booking is cancelled. Restore it before recording a payment.");
      b.mode = b.mode && b.paid > 0 && b.mode !== q.mode ? "Cash + Online" : q.mode; b.paid += amt; b.ref = [b.ref, String(q.ref || "").trim()].filter(Boolean).join(", ");
      Object.assign(b, { status: statusFor(b.due, b.paid, ""), receivedBy: u.name, paidAt: now(), updated: now(), updatedBy: u.name });
      log(u.name, "Payment ₹" + amt + " (" + q.mode + ") for " + b.id); return { paid: b.paid, status: b.status };
    },
    setCancelled: function (q, u) {
      var b = find(q.id);
      if (!q.cancel && db.settings.thaalLimit && booked(db.bookings) + b.thaals > db.settings.thaalLimit) fail("Not enough thaals left to restore this booking.");
      b.status = q.cancel ? "Cancelled" : statusFor(b.due, b.paid, ""); b.updated = now(); b.updatedBy = u.name; log(u.name, (q.cancel ? "Cancelled " : "Restored ") + b.id); return { status: b.status };
    },
    expenses: function () { return { expenses: db.expenses.slice().reverse(), categories: CATS }; },
    addExpense: function (q, u) {
      if (String(q.item || "").trim().length < 2) fail("Enter what the money was spent on."); if (!(Number(q.amount) > 0)) fail("Enter the amount spent."); if (!/^\d{4}-\d{2}-\d{2}$/.test(q.date || "")) fail("Choose the date.");
      db.expenses.push({ id: "EX-" + Date.now(), date: q.date, item: q.item.trim(), category: CATS.indexOf(q.category) >= 0 ? q.category : "Other", amount: Number(q.amount), paidBy: q.paidBy || u.name, note: q.note || "", added: now(), addedBy: u.name });
      log(u.name, "Expense ₹" + q.amount + " for " + q.item); return {};
    },
    deleteExpense: function (q, u) { db.expenses = db.expenses.filter(function (x) { return x.id !== q.id; }); log(u.name, "Deleted expense " + q.id); return {}; },
    saveSettings: function (q, u) { db.settings = { thaalLimit: int(q.thaalLimit || 0, 0, 2000, "Thaal limit"), thaalPrice: int(q.thaalPrice, 1, 100000, "Thaal price"), cardPrice: int(q.cardPrice, 0, 100000, "Card price"), bookingOpen: !!q.bookingOpen }; log(u.name, "Saved settings"); return {}; },
    audit: function () { return { log: db.log.slice(-150).reverse() }; }
  };
  var PUBLIC = { event: 1, book: 1, lookup: 1, staffLogin: 1 }, ADMIN = { deleteExpense: 1, saveSettings: 1, audit: 1 };
  window.MS_MOCK = function (req) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        try { var u = PUBLIC[req.action] ? null : need(req.token, ADMIN[req.action]); var out = A[req.action](req, u); put(KEY, db); resolve(Object.assign({ ok: true }, out)); }
        catch (e) { resolve({ ok: false, error: e.message, auth: !!e.auth }); }
      }, 300);
    });
  };
})();
