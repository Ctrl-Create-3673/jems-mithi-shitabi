/* Mithi Shitabi: public invite + booking, and the Class 10 organisers' records (bookings, payments, expenses). */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var CFG = window.MS_CONFIG, EV = CFG.event;
  var DEMO = !CFG.API_URL || /[?&]demo\b/.test(location.search);
  var state = { token: null, user: null, event: null, bookings: [], expenses: [], editing: null, paying: null };

  /* ---------- helpers ---------- */
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function icon(id) { var ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg"), u = document.createElementNS(ns, "use"); s.setAttribute("class", "ic"); s.setAttribute("aria-hidden", "true"); u.setAttribute("href", "#" + id); s.appendChild(u); return s; }
  function rs(n) { return "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN"); }
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function store(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function busy(btn, on) { if (btn) { btn.disabled = on; btn.classList.toggle("is-busy", on); } }
  function say(node, msg) { node.textContent = msg || ""; node.hidden = !msg; }
  var tt; function toast(m) { var t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove("show"); }, 3200); }
  function chip(status) { return el("span", "chip st-" + status.toLowerCase().replace(/[^a-z]+/g, "-"), status); }

  function api(action, data) {
    var body = Object.assign({ action: action, token: state.token }, data || {});
    var call = DEMO ? window.MS_MOCK(body) : fetch(CFG.API_URL, { method: "POST", body: JSON.stringify(body), redirect: "follow" })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); });
    return call.catch(function () { return { ok: false, error: "Can't reach the server. Check your connection and try again." }; })
      .then(function (res) { if (res.ok) return res; if (res.auth) logout(true); throw new Error(res.error || "Something went wrong."); });
  }

  function confirmDlg(title, text, yes) {
    var d = $("#confirm-dlg"); $("#confirm-title").textContent = title; $("#confirm-text").textContent = text; $("#confirm-yes").textContent = yes;
    d.showModal(); $("#confirm-no").focus();
    return new Promise(function (resolve) {
      $("#confirm-yes").onclick = function () { d.close(); resolve(true); };
      $("#confirm-no").onclick = function () { d.close(); resolve(false); };
      d.oncancel = function () { resolve(false); };
    });
  }
  $$("[data-close]").forEach(function (b) { b.addEventListener("click", function () { b.closest("dialog").close(); }); });

  $("#theme").addEventListener("click", function () {
    var t = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = t; try { localStorage.setItem("ms-theme", t); } catch (e) {}
  });
  $("#demo-tag").hidden = !DEMO;

  /* ---------- static event content ---------- */
  $$("[data-ev]").forEach(function (n) { n.textContent = EV[n.dataset.ev]; });
  function fillMenu(ol) {
    ol.textContent = "";
    EV.menu.forEach(function (m, i) { var li = el("li"); li.style.setProperty("--i", i); li.appendChild(el("span", "course", m[0])); if (m[1] !== m[0]) li.appendChild(el("b", null, m[1])); ol.appendChild(li); });
  }
  fillMenu($("#menu")); $$("[data-menu]").forEach(fillMenu);
  EV.contacts.forEach(function (c) {
    var li = el("li"), a = el("a", "contact"); a.href = "tel:+91" + c[1];
    a.appendChild(icon("i-phone")); var t = el("span"); t.appendChild(el("b", null, c[0])); t.appendChild(el("small", null, c[1].replace(/(\d{5})(\d{5})/, "$1 $2"))); a.appendChild(t);
    li.appendChild(a); $("#contacts").appendChild(li);
  });

  // Countdown to the event
  function tick() {
    var ms = new Date(EV.date) - new Date(), box = $("#countdown");
    if (ms <= 0) { box.textContent = ""; box.appendChild(el("p", "muted", "The event has begun. Thank you for your support.")); return; }
    var parts = [["days", Math.floor(ms / 864e5)], ["hours", Math.floor(ms / 36e5) % 24], ["minutes", Math.floor(ms / 6e4) % 60]];
    box.textContent = "";
    parts.forEach(function (p) { var d = el("div", "cd"); d.appendChild(el("b", null, String(p[1]))); d.appendChild(el("small", null, p[0])); box.appendChild(d); });
  }
  tick(); setInterval(tick, 30000);

  function loadEvent() {
    try { var cached = JSON.parse(localStorage.getItem("ms-event")); if (cached) showEvent(cached); } catch (err) {}
    return api("event").then(function (e) {
      try { localStorage.setItem("ms-event", JSON.stringify(e)); } catch (err) {}
      showEvent(e);
    }).catch(function () {});
  }
  function showEvent(e) {
      state.event = e;
      $("#thaal-price").textContent = rs(e.thaalPrice); $("#card-price").textContent = rs(e.cardPrice);
      $("#c-thaal-price").textContent = rs(e.thaalPrice) + " each"; $("#c-card-price").textContent = rs(e.cardPrice) + " each";
      $("#left-box").hidden = e.thaalsLeft == null; if (e.thaalsLeft != null) $("#thaals-left").textContent = e.thaalsLeft;
      var closed = !e.bookingOpen || e.thaalsLeft === 0;
      $("#closed-note").hidden = !closed;
      if (e.thaalsLeft === 0) $("#closed-note").textContent = "All thaals are booked. You can still call the girls to ask about cards.";
      $$('.invite a[href="#book"]').forEach(function (a) { a.hidden = closed; });
      bookTotal();
  }

  /* ---------- booking (parents) ---------- */
  var counts = { thaals: 1, cards: 0 };
  $$("[data-counter]").forEach(function (box) {
    var key = box.dataset.counter, max = key === "thaals" ? 20 : 50;
    $$("[data-step]", box).forEach(function (b) {
      b.addEventListener("click", function () { counts[key] = Math.min(max, Math.max(0, counts[key] + Number(b.dataset.step))); $("output", box).textContent = counts[key]; bookTotal(); });
    });
  });
  function bookTotal() {
    var e = state.event || { thaalPrice: 2100, cardPrice: 300 };
    $("#b-total").textContent = rs(counts.thaals * e.thaalPrice + counts.cards * e.cardPrice);
  }
  $("#book-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var name = $("#b-name").value.trim(), mob = $("#b-mobile").value.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
    if (name.length < 2) { say($("#book-alert"), "Enter your name."); return $("#b-name").focus(); }
    if (!/^[6-9]\d{9}$/.test(mob)) { say($("#book-alert"), "Enter a 10-digit mobile number."); return $("#b-mobile").focus(); }
    if (!counts.thaals && !counts.cards) return say($("#book-alert"), "Choose at least one thaal or one card.");
    var btn = $("button[type=submit]", this); busy(btn, true); say($("#book-alert"));
    api("book", { name: name, mobile: mob, its: $("#b-its").value.trim(), thaals: counts.thaals, cards: counts.cards,
      mode: $('input[name="b-mode"]:checked').value, notes: $("#b-notes").value.trim(), website: $("#b-website").value })
      .then(function (r) {
        $("#done-id").textContent = r.id;
        $("#done-summary").textContent = r.thaals + " thaal" + (r.thaals === 1 ? "" : "s") + ", " + r.cards + " card" + (r.cards === 1 ? "" : "s") + " · Total " + rs(r.due) + ". Please pay one of the Class 10 girls to confirm.";
        $("#s-id").value = r.id; $("#s-mobile").value = mob;
        $("#book-form").hidden = true; $("#book-done").hidden = false; $("#book-done").focus();
        loadEvent();
      }).catch(function (e) { say($("#book-alert"), e.message); }).finally(function () { busy(btn, false); });
  });
  $("#copy-id").addEventListener("click", function () {
    var id = $("#done-id").textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(id) : Promise.reject()).then(function () { toast("Booking ID copied."); })
      .catch(function () { var r = document.createRange(); r.selectNodeContents($("#done-id")); var s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  });
  $("#book-again").addEventListener("click", function () {
    $("#book-form").reset(); counts = { thaals: 1, cards: 0 }; $("#b-thaals").textContent = "1"; $("#b-cards").textContent = "0"; bookTotal();
    $("#book-done").hidden = true; $("#book-form").hidden = false; $("#b-name").focus();
  });

  /* ---------- status lookup ---------- */
  $("#status-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var btn = $("button[type=submit]", this), out = $("#status-result"); out.textContent = ""; say($("#status-alert"));
    if (!$("#s-id").value.trim() || !$("#s-mobile").value.trim()) return say($("#status-alert"), "Enter your booking ID and mobile number.");
    busy(btn, true);
    api("lookup", { id: $("#s-id").value.trim(), mobile: $("#s-mobile").value }).then(function (r) {
      var b = r.booking, card = el("div", "status-card");
      var head = el("div", "panel-head"); head.appendChild(el("b", "ticket-id", b.id)); head.appendChild(chip(b.status)); card.appendChild(head);
      var dl = el("dl", "kv");
      [["Name", b.name], ["Thaals", b.thaals], ["Cards", b.cards], ["Total", rs(b.due)], ["Paid", rs(b.paid)], ["Balance", rs(Math.max(0, b.due - b.paid))]]
        .forEach(function (p) { dl.appendChild(el("dt", null, p[0])); dl.appendChild(el("dd", null, String(p[1]))); });
      card.appendChild(dl);
      card.appendChild(el("p", "muted small", b.status === "Paid" ? "Your booking is confirmed. See you on " + EV.dateText + "." : b.status === "Cancelled" ? "This booking was cancelled. Call the Class 10 girls if this is a mistake." : "Please pay the balance to one of the Class 10 girls to confirm your booking."));
      out.appendChild(card);
    }).catch(function (e) { say($("#status-alert"), e.message); }).finally(function () { busy(btn, false); });
  });

  /* ---------- staff login ---------- */
  $("#login-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var btn = $("button[type=submit]", this); busy(btn, true); say($("#login-alert"));
    api("staffLogin", { its: $("#l-name").value.trim(), code: $("#l-code").value }).then(function (r) {
      state.token = r.token; state.user = r.user; store("ms-session", JSON.stringify(r));
      $("#l-code").value = ""; startStaff(); location.hash = "#dash";
    }).catch(function (e) { say($("#login-alert"), e.message); }).finally(function () { busy(btn, false); });
  });
  function startStaff() {
    $("#who").hidden = false; $("#who").textContent = state.user.name + (state.user.role === "admin" ? " · Admin" : "");
    $("#logout").hidden = false; buildNav();
  }
  function logout(expired) {
    state.token = state.user = null; store("ms-session", null);
    $("#who").hidden = $("#logout").hidden = true; buildNav();
    location.hash = "#staff";
    if (expired) say($("#login-alert"), "Your session has ended. Please log in again.");
  }
  $("#logout").addEventListener("click", function () { confirmDlg("Log out?", "You'll need the team code to log in again.", "Log out").then(function (y) { if (y) { logout(); toast("Logged out."); } }); });

  /* ---------- navigation ---------- */
  var PUBLIC_NAV = [["invite", "Invite", "i-home"], ["book", "Book", "i-plus"], ["status", "My booking", "i-search"], ["staff", "Team", "i-lock"]];
  var STAFF_NAV = [["dash", "Dashboard", "i-home"], ["bookings", "Bookings", "i-list"], ["expenses", "Expenses", "i-receipt"], ["invite", "Invite", "i-calendar"]];
  function buildNav() {
    var items = state.user ? STAFF_NAV.slice() : PUBLIC_NAV;
    if (state.user && state.user.role === "admin") items.splice(3, 0, ["settings", "Settings", "i-gear"]);
    [$("#top-nav"), $("#bottom-nav")].forEach(function (nav) {
      nav.textContent = "";
      items.forEach(function (it) { var a = el("a"); a.href = "#" + it[0]; a.dataset.nav = it[0]; a.appendChild(icon(it[2])); a.appendChild(el("span", null, it[1])); nav.appendChild(a); });
    });
    markNav();
  }
  function markNav() { var v = view(); $$("[data-nav]").forEach(function (a) { if (a.dataset.nav === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); }); }
  var STAFF_VIEWS = { dash: 1, bookings: 1, expenses: 1, settings: 1 };
  var TITLES = { invite: "Invite", book: "Book a thaal", status: "My booking", staff: "Team login", dash: "Dashboard", bookings: "Bookings", expenses: "Expenses", settings: "Settings" };
  function view() {
    var v = location.hash.slice(1) || "invite";
    if (!TITLES[v]) v = "invite";
    if (STAFF_VIEWS[v] && !state.user) v = "staff";
    if (v === "settings" && state.user.role !== "admin") v = "dash";
    if (v === "staff" && state.user) v = "dash";
    return v;
  }
  function route() {
    var v = view();
    $$("[data-view]").forEach(function (s) { s.hidden = s.dataset.view !== v; });
    document.title = TITLES[v] + " · Mithi Shitabi · JEMS";
    markNav();
    var load = { dash: loadDash, bookings: loadBookings, expenses: loadExpenses, settings: loadSettings }[v];
    if (load) load();
    if (v === "invite" || v === "book") loadEvent(); // keep thaals left and prices current
    $("#main").focus({ preventScroll: true }); window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  $$("[data-refresh]").forEach(function (b) { b.addEventListener("click", route); });

  /* ---------- dashboard ---------- */
  function bars(box, map, fmt, order) {
    box.textContent = "";
    var keys = (order || Object.keys(map)).filter(function (k) { return map[k]; });
    var max = Math.max.apply(null, keys.map(function (k) { return map[k]; }).concat(1));
    if (!keys.length) return box.appendChild(el("p", "muted small", "Nothing yet."));
    keys.forEach(function (k, i) {
      var row = el("div", "bar-row"); row.style.setProperty("--i", i);
      row.appendChild(el("span", null, k)); var t = el("span", "bar-track"), f = el("span", "bar-fill"); t.appendChild(f); row.appendChild(t);
      row.appendChild(el("b", null, fmt ? fmt(map[k]) : String(map[k]))); box.appendChild(row);
      requestAnimationFrame(function () { f.style.width = (map[k] / max * 100) + "%"; });
    });
  }
  function loadDash() {
    api("dashboard").then(function (d) {
      var s = d.stats, box = $("#stats"); box.textContent = "";
      [["Thaals booked", s.thaals, d.settings.thaalLimit ? "of " + d.settings.thaalLimit : "no limit set"], ["Cards", s.cards, "sold"], ["Bookings", s.bookings, "not cancelled"], ["Still to collect", rs(Math.max(0, s.due - s.collected)), "from families", "warn"]]
        .forEach(function (x) { var c = el("div", "stat" + (x[3] ? " " + x[3] : "")); c.appendChild(el("span", "k", x[0])); c.appendChild(el("b", null, String(x[1]))); c.appendChild(el("small", "muted", x[2])); box.appendChild(c); });
      var m = $("#money"); m.textContent = "";
      var pct = s.due ? Math.round(s.collected / s.due * 100) : 0;
      var prog = el("div", "progress"); prog.setAttribute("role", "progressbar"); prog.setAttribute("aria-label", "Money collected"); prog.setAttribute("aria-valuenow", pct); prog.setAttribute("aria-valuemin", 0); prog.setAttribute("aria-valuemax", 100);
      var fill = el("span"); prog.appendChild(fill); m.appendChild(prog); m.appendChild(el("p", "muted small", pct + "% of the money due has been collected."));
      requestAnimationFrame(function () { fill.style.width = pct + "%"; });
      var dl = el("dl", "kv money");
      [["Total due", rs(s.due)], ["Collected", rs(s.collected)], ["Expenses", "− " + rs(s.expenses)], ["Cash in hand after expenses", rs(s.collected - s.expenses)], ["Expected surplus when all paid", rs(s.due - s.expenses)]]
        .forEach(function (p, i) { dl.appendChild(el("dt", null, p[0])); dl.appendChild(el("dd", i === 3 ? "strong" : null, p[1])); });
      m.appendChild(dl);
      bars($("#by-status"), d.byStatus, null, ["Pending", "Partly paid", "Paid", "Cancelled"]);
      bars($("#by-mode"), d.byMode, rs);
    }).catch(function (e) { toast(e.message); });
  }

  /* ---------- bookings ---------- */
  function loadBookings() {
    $("#bk-count").textContent = "Loading…";
    api("bookings").then(function (r) {
      state.bookings = r.bookings;
      var sel = $("#bk-status"); if (sel.options.length < 2) r.statuses.forEach(function (s) { var o = el("option", null, s); o.value = s; sel.appendChild(o); });
      renderBookings();
    }).catch(function (e) { $("#bk-count").textContent = e.message; });
  }
  function filteredBookings() {
    var q = $("#bk-q").value.trim().toLowerCase(), st = $("#bk-status").value;
    return state.bookings.filter(function (b) { return (!st || b.status === st) && (!q || [b.id, b.name, b.mobile, b.its].join(" ").toLowerCase().indexOf(q) >= 0); });
  }
  function renderBookings() {
    var list = filteredBookings(), body = $("#bk-body"); body.textContent = "";
    list.forEach(function (b) {
      var tr = el("tr"); if (b.status === "Cancelled") tr.className = "is-cancelled";
      var idc = el("td"); idc.appendChild(el("b", "mono block", b.id)); idc.appendChild(el("span", "muted small", b.created + " · " + b.source)); tr.appendChild(idc);
      var nm = el("td"); nm.appendChild(el("span", "strong block", b.name)); var tel = el("a", "small", b.mobile); tel.href = "tel:+91" + b.mobile; nm.appendChild(tel); if (b.notes) nm.appendChild(el("span", "muted small block", b.notes)); tr.appendChild(nm);
      tr.appendChild(el("td", "num", String(b.thaals))); tr.appendChild(el("td", "num", String(b.cards)));
      tr.appendChild(el("td", "num", rs(b.due)));
      var pd = el("td", "num"); pd.appendChild(el("span", "block", rs(b.paid))); if (b.mode) pd.appendChild(el("span", "muted small", b.mode + (b.receivedBy ? " · " + b.receivedBy : ""))); tr.appendChild(pd);
      var stc = el("td"); stc.appendChild(chip(b.status)); tr.appendChild(stc);
      var act = el("td", "row-actions");
      if (b.status !== "Cancelled" && b.status !== "Paid") act.appendChild(btn("Payment", "btn primary xs", "i-wallet", function () { openPay(b); }));
      act.appendChild(iconBtn("i-edit", "Edit booking " + b.id, function () { openBooking(b); }));
      act.appendChild(iconBtn(b.status === "Cancelled" ? "i-refresh" : "i-trash", (b.status === "Cancelled" ? "Restore " : "Cancel ") + b.id, function () { toggleCancel(b); }, b.status !== "Cancelled"));
      tr.appendChild(act); body.appendChild(tr);
    });
    if (!list.length) { var tr = el("tr"), td = el("td", "empty", state.bookings.length ? "No bookings match." : "No bookings yet."); td.colSpan = 8; tr.appendChild(td); body.appendChild(tr); }
    var live = list.filter(function (b) { return b.status !== "Cancelled"; });
    $("#bk-count").textContent = list.length + " bookings · " + live.reduce(function (s, b) { return s + b.thaals; }, 0) + " thaals · " + rs(live.reduce(function (s, b) { return s + b.paid; }, 0)) + " collected";
  }
  function btn(label, cls, ic, fn) { var b = el("button", cls); b.type = "button"; b.appendChild(icon(ic)); b.appendChild(document.createTextNode(label)); b.addEventListener("click", fn); return b; }
  function iconBtn(ic, label, fn, danger) { var b = el("button", "icon-btn sm" + (danger ? " danger" : "")); b.type = "button"; b.setAttribute("aria-label", label); b.title = label; b.appendChild(icon(ic)); b.addEventListener("click", fn); return b; }
  ["bk-q", "bk-status"].forEach(function (id) { $("#" + id).addEventListener("input", renderBookings); });

  function toggleCancel(b) {
    var cancel = b.status !== "Cancelled";
    confirmDlg(cancel ? "Cancel this booking?" : "Restore this booking?", b.id + " · " + b.name + " · " + b.thaals + " thaals. " + (cancel ? "It stays in the sheet marked Cancelled and stops counting." : "It will count again."), cancel ? "Cancel booking" : "Restore")
      .then(function (y) { if (y) api("setCancelled", { id: b.id, cancel: cancel }).then(function () { toast(cancel ? "Booking cancelled." : "Booking restored."); loadBookings(); }).catch(function (e) { toast(e.message); }); });
  }

  function openBooking(b) {
    state.editing = b || null;
    $("#bk-dlg-title").textContent = b ? "Edit " + b.id : "Add booking";
    $("#d-name").value = b ? b.name : ""; $("#d-mobile").value = b ? b.mobile : ""; $("#d-its").value = b ? b.its : "";
    $("#d-thaals").value = b ? b.thaals : 1; $("#d-cards").value = b ? b.cards : 0; $("#d-notes").value = b ? b.notes : "";
    say($("#bk-dlg-alert")); $("#bk-dlg").showModal(); $("#d-name").focus();
  }
  $("#bk-add").addEventListener("click", function () { openBooking(null); });
  $("#bk-dlg-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var b = $("button[type=submit]", this); busy(b, true);
    var data = { name: $("#d-name").value, mobile: $("#d-mobile").value, its: $("#d-its").value, thaals: Number($("#d-thaals").value), cards: Number($("#d-cards").value), notes: $("#d-notes").value };
    var call = state.editing ? api("editBooking", Object.assign({ id: state.editing.id }, data)) : api("addBooking", data);
    call.then(function (r) { $("#bk-dlg").close(); toast(state.editing ? "Booking updated." : "Booking " + r.id + " added."); loadBookings(); })
      .catch(function (e) { say($("#bk-dlg-alert"), e.message); }).finally(function () { busy(b, false); });
  });

  function openPay(b) {
    state.paying = b;
    $("#pay-who").textContent = b.id + " · " + b.name + " · due " + rs(b.due) + ", paid " + rs(b.paid);
    $("#p-amount").value = Math.max(0, b.due - b.paid); $("#p-ref").value = "";
    $('input[name="p-mode"][value="Cash"]').checked = true; $("#p-ref-field").hidden = true;
    say($("#pay-alert")); $("#pay-dlg").showModal(); $("#p-amount").select();
  }
  $$('input[name="p-mode"]').forEach(function (r) { r.addEventListener("change", function () { $("#p-ref-field").hidden = r.value !== "Online" || !r.checked; }); });
  $("#pay-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var b = $("button[type=submit]", this), amount = Number($("#p-amount").value), mode = $('input[name="p-mode"]:checked').value;
    if (!(amount > 0)) return say($("#pay-alert"), "Enter the amount received.");
    if (mode === "Online" && !$("#p-ref").value.trim()) { say($("#pay-alert"), "Enter the UPI or transaction reference."); return $("#p-ref").focus(); }
    busy(b, true);
    api("recordPayment", { id: state.paying.id, amount: amount, mode: mode, ref: $("#p-ref").value.trim() })
      .then(function (r) { $("#pay-dlg").close(); toast(rs(amount) + " saved · " + r.status + "."); loadBookings(); })
      .catch(function (e) { say($("#pay-alert"), e.message); }).finally(function () { busy(b, false); });
  });

  $("#bk-csv").addEventListener("click", function () {
    csv("mithi-shitabi-bookings", [["Booking ID", "Created", "Source", "Name", "Mobile", "ITS", "Thaals", "Cards", "Due", "Paid", "Balance", "Status", "Mode", "Reference", "Received by", "Notes"]]
      .concat(filteredBookings().map(function (b) { return [b.id, b.created, b.source, b.name, b.mobile, b.its, b.thaals, b.cards, b.due, b.paid, Math.max(0, b.due - b.paid), b.status, b.mode, b.ref, b.receivedBy, b.notes]; })));
  });
  function csv(name, rows) {
    var text = rows.map(function (r) { return r.map(function (c) { var s = String(c == null ? "" : c); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }).join(","); }).join("\r\n");
    var a = el("a"); a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv" })); a.download = name + "-" + today() + ".csv";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  /* ---------- expenses ---------- */
  $("#ex-date").value = today(); $("#ex-date").max = today();
  function loadExpenses() {
    api("expenses").then(function (r) {
      state.expenses = r.expenses;
      var cat = $("#ex-cat"); if (!cat.options.length) r.categories.forEach(function (c) { var o = el("option", null, c); o.value = c; cat.appendChild(o); });
      var body = $("#ex-body"), byCat = {}, total = 0; body.textContent = "";
      r.expenses.forEach(function (x) {
        byCat[x.category] = (byCat[x.category] || 0) + x.amount; total += x.amount;
        var tr = el("tr");
        tr.appendChild(el("td", "nowrap", x.date));
        var it = el("td"); it.appendChild(el("span", "strong block", x.item)); if (x.note) it.appendChild(el("span", "muted small", x.note)); tr.appendChild(it);
        tr.appendChild(el("td", null, x.category)); tr.appendChild(el("td", "num", rs(x.amount))); tr.appendChild(el("td", null, x.paidBy));
        var act = el("td", "row-actions");
        if (state.user.role === "admin") act.appendChild(iconBtn("i-trash", "Delete expense " + x.item, function () {
          confirmDlg("Delete this expense?", x.item + " · " + rs(x.amount) + ". This removes it from the sheet.", "Delete").then(function (y) { if (y) api("deleteExpense", { id: x.id }).then(function () { toast("Expense deleted."); loadExpenses(); }).catch(function (e) { toast(e.message); }); });
        }, true));
        tr.appendChild(act); body.appendChild(tr);
      });
      if (!r.expenses.length) { var tr = el("tr"), td = el("td", "empty", "No expenses yet."); td.colSpan = 6; tr.appendChild(td); body.appendChild(tr); }
      $("#ex-total").textContent = rs(total);
      bars($("#ex-cats"), byCat, rs);
    }).catch(function (e) { toast(e.message); });
  }
  $("#ex-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var b = $("button[type=submit]", this); busy(b, true); say($("#ex-alert"));
    api("addExpense", { item: $("#ex-item").value, category: $("#ex-cat").value, amount: Number($("#ex-amount").value), date: $("#ex-date").value, paidBy: $("#ex-by").value, note: $("#ex-note").value })
      .then(function () { toast("Expense added."); $("#ex-item").value = $("#ex-amount").value = $("#ex-note").value = ""; $("#ex-item").focus(); loadExpenses(); })
      .catch(function (e) { say($("#ex-alert"), e.message); }).finally(function () { busy(b, false); });
  });
  $("#ex-csv").addEventListener("click", function () {
    csv("mithi-shitabi-expenses", [["Date", "Item", "Category", "Amount", "Paid by", "Note", "Added by"]].concat(state.expenses.map(function (x) { return [x.date, x.item, x.category, x.amount, x.paidBy, x.note, x.addedBy]; })));
  });

  /* ---------- settings (teacher in charge) ---------- */
  function loadSettings() {
    api("dashboard").then(function (d) {
      var s = d.settings; $("#set-open").checked = s.bookingOpen; $("#set-limit").value = s.thaalLimit; $("#set-tp").value = s.thaalPrice; $("#set-cp").value = s.cardPrice;
    }).catch(function (e) { toast(e.message); });
    loadLog();
  }
  function loadLog() {
    api("audit").then(function (r) {
      var ul = $("#log"); ul.textContent = "";
      r.log.forEach(function (x) { var li = el("li"); li.appendChild(el("span", "muted small", x.time + " · " + x.user)); li.appendChild(el("span", null, x.action)); ul.appendChild(li); });
      if (!r.log.length) ul.appendChild(el("li", "muted", "No activity yet."));
    }).catch(function (e) { toast(e.message); });
  }
  $("#log-refresh").addEventListener("click", loadLog);
  $("#set-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var b = $("button[type=submit]", this); busy(b, true); say($("#set-alert"));
    api("saveSettings", { bookingOpen: $("#set-open").checked, thaalLimit: Number($("#set-limit").value || 0), thaalPrice: Number($("#set-tp").value), cardPrice: Number($("#set-cp").value) })
      .then(function () { toast("Settings saved."); loadEvent(); loadLog(); }).catch(function (e) { say($("#set-alert"), e.message); }).finally(function () { busy(b, false); });
  });

  /* ---------- start ---------- */
  var saved = store("ms-session");
  if (saved) { try { var s = JSON.parse(saved); state.token = s.token; state.user = s.user; startStaff(); } catch (e) { store("ms-session", null); } }
  buildNav(); route();
})();
