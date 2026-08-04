/* ================================================================
   CAFÉ DOUAE — app.js (reconstruit pour tablette.html / pc.html /
   phone.html / index.html actuels)
   Tables réellement utilisées : employees, products, categories,
   tickets, ticket_items, stock_movements, app_settings, shift_closures
================================================================ */

/* ================================================================
   ÉTAT GLOBAL
================================================================ */
let currentUser = null;       // employé actif (server ou admin/gérant)
let isAdminSession = false;   // entré via l'espace admin ?
let categories = [];
let products = [];
let cart = [];
let activeCat = "all";
let activeSection = "all";    // all / cafe / terrasse
let adminPinBuffer = "";

const ROLES = { admin: "Admin", gerant: "Gérant", serveur: "Serveur" };
const MGR = ["admin", "gerant"];
const TERRASSE_CATS = ["tacos", "crêpes", "crepes", "glaces", "desserts", "boissons fresh", "matcha club", "matcha"];

function stripA(s) { return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function isTerrasseCat(name) { const n = stripA(name).toLowerCase(); return TERRASSE_CATS.some(t => n.includes(stripA(t))); }
function catSection(catId) { const c = categories.find(x => x.id === catId); return c && isTerrasseCat(c.name) ? "terrasse" : "cafe"; }
function sectionOfProduct(p) { return p && p.section ? p.section : catSection(p ? p.category_id : null); }

/* ================================================================
   HELPERS
================================================================ */
function dh(n) { return (Number(n) || 0).toFixed(2).replace(".", ",") + " DH"; }
function pad(n) { return String(n).padStart(2, "0"); }
function todayStr(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fmtTime(iso) { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtDate(iso) { const d = new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; }

// Jour commercial : 04h00 → 03h59 (une nuit qui déborde sur le lendemain
// compte encore dans la journée de la veille)
function commercialDayBounds(dayStr) {
  const start = new Date(dayStr + "T04:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setHours(3, 59, 59, 999);
  return { start, end };
}
function isMatin(iso) { const h = new Date(iso).getHours(); return h >= 8 && h < 14; }
function isSoir(iso) { return !isMatin(iso); }

function toast(msg, err = false) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.className = "toast" + (err ? " error" : "");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.add("hidden"), 2800);
  t.classList.remove("hidden");
}
function openModal(html) {
  document.getElementById("modal-inner").innerHTML = html;
  document.getElementById("modal-bg").classList.add("active");
}
function closeModal() {
  document.getElementById("modal-bg").classList.remove("active");
  document.getElementById("modal-inner").innerHTML = "";
}
document.getElementById("modal-bg").addEventListener("click", e => { if (e.target.id === "modal-bg") closeModal(); });

function tickClock() {
  const d = new Date();
  const s = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const s2 = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const el = id => document.getElementById(id);
  if (el("clock")) el("clock").textContent = s2;
  if (el("home-clock")) el("home-clock").textContent = s;
  if (el("cpt-clock")) el("cpt-clock").textContent = s;
}
setInterval(tickClock, 1000);

/* ================================================================
   ICÔNES (auto-détection par mot-clé, reprise telle quelle)
================================================================ */
const ICON_MAP = [
  [["cappuccino", "macchiato", "latte", "café au lait", "creme"], "🥛"],
  [["express", "espresso", "americano", "ristretto", "café", "cafe"], "☕"],
  [["thé", "the", "infusion", "tisane"], "🍵"],
  [["matcha"], "🍵"],
  [["smoothie", "milkshake"], "🧋"],
  [["jus"], "🧃"],
  [["soda", "coca", "cola", "sprite", "limonade", "boisson", "peach", "lemon", "broud", "broad"], "🥤"],
  [["eau"], "💧"],
  [["chocolat chaud"], "☕"],
  [["croissant"], "🥐"],
  [["sandwich", "panini", "club"], "🥪"],
  [["tacos"], "🌮"],
  [["crepe", "crêpe"], "🥞"],
  [["beignet", "donut"], "🍩"],
  [["gateau", "gâteau", "cake", "cheesecake"], "🍰"],
  [["muffin", "cupcake"], "🧁"],
  [["cookie", "biscuit", "brownie"], "🍪"],
  [["tarte"], "🥧"],
  [["glace", "sorbet", "boule"], "🍨"],
  [["salade"], "🥗"],
  [["pizza"], "🍕"],
  [["burger"], "🍔"],
];
const ICON_OPTS = ["☕", "🥛", "🍵", "🧃", "🧋", "🥤", "💧", "🥐", "🥪", "🌮", "🥞", "🍩", "🍰", "🧁", "🍪", "🥧", "🍨", "🍦", "🍕", "🍔", "🍽️", "🫖", "🥗", "🍓", "🍫", "🍯", "🧇", "🥚", "🥩", "🌯", "🫙"];
function getIcon(p) {
  if (p.icon) return p.icon;
  const n = stripA(p.name || "").toLowerCase();
  for (const [kws, ic] of ICON_MAP) { if (kws.some(k => n.includes(stripA(k)))) return ic; }
  const cn = stripA(categories.find(c => c.id === p.category_id)?.name || "").toLowerCase();
  if (cn.includes("cafe") || (cn.includes("boisson") && !cn.includes("fresh"))) return "☕";
  if (cn.includes("fresh") || cn.includes("boisson")) return "🥤";
  if (cn.includes("the") || cn.includes("matcha")) return "🍵";
  if (cn.includes("tacos")) return "🌮";
  if (cn.includes("crepe")) return "🥞";
  if (cn.includes("glace")) return "🍨";
  if (cn.includes("dessert")) return "🍰";
  if (cn.includes("patiss")) return "🥐";
  return "🍽️";
}

/* ================================================================
   ACCUEIL → CHOIX SERVEUR (rapide, sans code) / ESPACE ADMIN (PIN)
================================================================ */
function showScreen(id) {
  ["home-screen", "server-screen", "admin-login-screen"].forEach(s => {
    const el = document.getElementById(s);
    if (!el) return;
    if (s === "home-screen") el.style.display = (s === id) ? "" : "none";
    else el.classList.toggle("active", s === id);
  });
}

document.getElementById("btn-new-order").onclick = () => {
  showScreen("server-screen");
  loadServerGrid();
};
document.getElementById("server-back").onclick = () => showScreen("home-screen");

document.getElementById("btn-admin-link").onclick = () => {
  adminPinBuffer = "";
  document.getElementById("admin-pin-err").textContent = "";
  showScreen("admin-login-screen");
  buildAdminPinPad();
};
document.getElementById("admin-pin-back").onclick = () => showScreen("home-screen");

async function loadServerGrid() {
  const grid = document.getElementById("server-grid");
  grid.innerHTML = `<div class="empty">Chargement…</div>`;
  const { data, error } = await sb.from("employees").select("*").eq("active", true).order("name");
  if (error) { grid.innerHTML = `<div class="empty">Erreur de connexion. Vérifie Supabase.</div>`; return; }
  if (!data || !data.length) { grid.innerHTML = `<div class="empty">Aucun serveur actif — ajoute-les dans Paramètres.</div>`; return; }
  grid.innerHTML = "";
  data.forEach(e => {
    const card = document.createElement("button");
    card.className = "server-card";
    card.innerHTML = `<div class="av">${e.name.charAt(0).toUpperCase()}</div><div class="sn">${e.name}</div>`;
    card.onclick = () => {
      currentUser = { id: e.id, name: e.name, role: e.role };
      isAdminSession = false;
      enterApp();
    };
    grid.appendChild(card);
  });
}

function buildAdminPinPad() {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓"];
  const wrap = document.getElementById("admin-pin-keys");
  wrap.innerHTML = "";
  keys.forEach(k => {
    const b = document.createElement("button");
    b.className = "pin-key"; b.textContent = k;
    b.onclick = () => handleAdminPin(k);
    wrap.appendChild(b);
  });
  updateAdminDots();
}
function updateAdminDots() {
  document.querySelectorAll("#admin-login-screen .pin-dot").forEach((d, i) => d.classList.toggle("filled", i < adminPinBuffer.length));
}
function handleAdminPin(k) {
  if (k === "⌫") { adminPinBuffer = adminPinBuffer.slice(0, -1); updateAdminDots(); return; }
  if (k === "✓") { tryAdminLogin(); return; }
  if (adminPinBuffer.length < 4) { adminPinBuffer += k; updateAdminDots(); }
  if (adminPinBuffer.length === 4) setTimeout(tryAdminLogin, 100);
}
async function tryAdminLogin() {
  const { data } = await sb.from("employees").select("*")
    .eq("pin", adminPinBuffer).eq("active", true).in("role", MGR).maybeSingle();
  if (!data) {
    document.getElementById("admin-pin-err").textContent = "Code incorrect ✕";
    adminPinBuffer = ""; updateAdminDots();
    return;
  }
  currentUser = { id: data.id, name: data.name, role: data.role };
  isAdminSession = true;
  enterApp();
}

function enterApp() {
  showScreen(null);
  document.getElementById("app").classList.add("active");
  document.getElementById("current-server-label").textContent = currentUser.name;
  document.getElementById("admin-nav").style.display = isAdminSession ? "flex" : "none";
  loadCategories();
  loadProducts();
  switchView(isAdminSession ? "rapport" : "caisse");
  loadPcOrders();
  subscribePcOrders();
}

document.getElementById("btn-home").onclick = () => {
  currentUser = null; isAdminSession = false; cart = [];
  document.getElementById("app").classList.remove("active");
  document.getElementById("comptoir-screen").classList.remove("active");
  showScreen("home-screen");
};

/* ================================================================
   NAVIGATION (admin-nav)
================================================================ */
const VIEW_TITLES = { caisse: "Caisse", tickets: "Tickets", stock: "Stock", produits: "Menu & Produits", serveurs: "Serveurs", rapport: "Rapport", parametres: "Paramètres" };
document.querySelectorAll(".adm-tab[data-view]").forEach(btn => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});
function switchView(v) {
  document.querySelectorAll(".adm-tab[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  document.querySelectorAll(".view").forEach(el => el.classList.toggle("active", el.id === "view-" + v));
  document.getElementById("view-title").textContent = VIEW_TITLES[v] || v;
  if (v === "tickets") loadTickets();
  if (v === "stock") loadStock();
  if (v === "produits") loadProdTable();
  if (v === "serveurs") loadSrvTable();
  if (v === "rapport") { setRapportToday(); }
  if (v === "parametres") loadParametres();
}

/* ================================================================
   CAISSE — catégories & produits
================================================================ */
async function loadCategories() {
  const { data } = await sb.from("categories").select("*").order("sort_order");
  categories = data || [];
  renderCatTabs();
}
async function loadProducts() {
  const { data } = await sb.from("products").select("*").eq("active", true).order("name");
  products = data || [];
  renderProductGrid();
}
document.querySelectorAll(".section-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    activeSection = btn.dataset.sec;
    activeCat = "all";
    document.querySelectorAll(".section-tab").forEach(b => b.classList.toggle("active", b.dataset.sec === activeSection));
    renderCatTabs();
    renderProductGrid();
  });
});
function renderCatTabs() {
  const wrap = document.getElementById("cat-tabs");
  wrap.innerHTML = "";
  let visibleCats = categories;
  if (activeSection === "cafe") visibleCats = categories.filter(c => !isTerrasseCat(c.name));
  if (activeSection === "terrasse") visibleCats = categories.filter(c => isTerrasseCat(c.name));
  const allBtn = document.createElement("button");
  allBtn.className = "cat-tab" + (activeCat === "all" ? " active" : "");
  allBtn.textContent = "Tout";
  allBtn.onclick = () => { activeCat = "all"; renderCatTabs(); renderProductGrid(); };
  wrap.appendChild(allBtn);
  visibleCats.forEach(c => {
    const b = document.createElement("button");
    b.className = "cat-tab" + (activeCat === c.id ? " active" : "");
    b.textContent = c.name;
    b.onclick = () => { activeCat = c.id; renderCatTabs(); renderProductGrid(); };
    wrap.appendChild(b);
  });
}
function renderProductGrid() {
  const grid = document.getElementById("product-grid");

  if (activeSection === "all") {
    // Vue partagée : Café et Terrasse tapables en même temps, sans onglet
    document.getElementById("cat-tabs").style.display = "none";
    const cafeList = products.filter(p => sectionOfProduct(p) === "cafe");
    const terList = products.filter(p => sectionOfProduct(p) === "terrasse");
    grid.classList.add("split-view");
    grid.innerHTML = `
      <div class="split-col">
        <div class="split-col-title">☕ CAFÉ</div>
        <div class="split-col-grid" id="split-cafe"></div>
      </div>
      <div class="split-col">
        <div class="split-col-title">🏖️ TERRASSE</div>
        <div class="split-col-grid" id="split-terrasse"></div>
      </div>`;
    fillProductColumn(document.getElementById("split-cafe"), cafeList);
    fillProductColumn(document.getElementById("split-terrasse"), terList);
    return;
  }

  document.getElementById("cat-tabs").style.display = "";
  grid.classList.remove("split-view");
  let list = products;
  if (activeSection === "cafe") list = list.filter(p => sectionOfProduct(p) === "cafe");
  if (activeSection === "terrasse") list = list.filter(p => sectionOfProduct(p) === "terrasse");
  if (activeCat !== "all") list = list.filter(p => p.category_id === activeCat);
  if (!list.length) { grid.innerHTML = `<div class="empty">Aucun produit dans cette section.</div>`; return; }
  grid.innerHTML = "";
  fillProductColumn(grid, list);
}
function fillProductColumn(container, list) {
  if (!list.length) { container.innerHTML = `<div class="empty">Aucun produit.</div>`; return; }
  list.forEach(p => {
    const out = p.track_stock && p.stock_qty <= 0;
    const low = p.track_stock && p.stock_qty <= p.low_stock_threshold && !out;
    const card = document.createElement("button");
    card.className = "prod-card";
    card.disabled = out;
    card.innerHTML = `${low ? '<div class="low-dot"></div>' : ''}
      <div class="pico">${getIcon(p)}</div>
      <div class="pnm">${p.name}</div>
      <div class="ppr">${dh(p.price)}</div>`;
    card.onclick = () => addToCart(p);
    container.appendChild(card);
  });
}

/* ================================================================
   PANIER
================================================================ */
function addToCart(p) {
  if (p.track_stock && p.stock_qty <= 0) { toast("Stock épuisé", true); return; }
  const ex = cart.find(c => c.pid === p.id);
  if (ex) {
    if (p.track_stock && ex.qty + 1 > p.stock_qty) { toast("Stock insuffisant", true); return; }
    ex.qty++;
  } else {
    cart.push({ pid: p.id, name: p.name, price: p.price, qty: 1, track: p.track_stock, stock: p.stock_qty, icon: getIcon(p) });
  }
  renderCart();
}
function changeQty(pid, d) {
  const item = cart.find(c => c.pid === pid);
  if (!item) return;
  const nq = item.qty + d;
  if (nq <= 0) { cart = cart.filter(c => c.pid !== pid); }
  else {
    const prod = products.find(p => p.id === pid);
    if (prod && prod.track_stock && nq > prod.stock_qty) { toast("Stock insuffisant", true); return; }
    item.qty = nq;
  }
  renderCart();
}
document.getElementById("btn-clear").onclick = () => { cart = []; renderCart(); };
document.getElementById("inp-discount").addEventListener("input", renderCart);

function cartSub() { return cart.reduce((s, c) => s + c.price * c.qty, 0); }
function renderCart() {
  const wrap = document.getElementById("rcp-items");
  const now = new Date();
  document.getElementById("rcp-meta").textContent = `${currentUser?.name || ""} — ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if (!cart.length) { wrap.innerHTML = `<div class="empty">Ticket vide</div>`; }
  else {
    wrap.innerHTML = cart.map(c => `
      <div class="rcp-line">
        <span style="font-size:15px;margin-right:4px;">${c.icon}</span>
        <span class="rl-name">${c.name}</span>
        <span class="rl-qty">
          <button class="ql-btn" onclick="changeQty(${c.pid},-1)">−</button>
          <span style="min-width:16px;text-align:center;font-size:13px;">${c.qty}</span>
          <button class="ql-btn" onclick="changeQty(${c.pid},1)">+</button>
        </span>
        <span class="rcp-price">${dh(c.price * c.qty)}</span>
        <button class="rm-btn" onclick="changeQty(${c.pid},-${c.qty})">✕</button>
      </div>`).join("");
  }
  const sub = cartSub();
  const disc = Math.min(Number(document.getElementById("inp-discount").value) || 0, sub);
  document.getElementById("rt-sub").textContent = dh(sub);
  document.getElementById("rt-disc").textContent = "−" + dh(disc);
  document.getElementById("rt-tot").textContent = dh(sub - disc);
}

/* ================================================================
   ENCAISSEMENT
================================================================ */
async function nextTkNum() {
  const ds = todayStr().replace(/-/g, "");
  const s = new Date(); s.setHours(0, 0, 0, 0);
  const { count } = await sb.from("tickets").select("*", { count: "exact", head: true }).gte("created_at", s.toISOString());
  return `T${ds}-${pad((count || 0) + 1)}`;
}
document.getElementById("btn-checkout").onclick = async () => {
  if (!cart.length) { toast("Ticket vide", true); return; }
  const btn = document.getElementById("btn-checkout");
  btn.disabled = true;
  try {
    const sub = cartSub();
    const disc = Math.min(Number(document.getElementById("inp-discount").value) || 0, sub);
    const total = sub - disc;
    const pay = document.getElementById("inp-payment").value;
    const tnum = await nextTkNum();
    const { data: tk, error: e1 } = await sb.from("tickets").insert({
      ticket_number: tnum, employee_id: currentUser.id, status: "payé",
      payment_method: pay, subtotal: sub, discount: disc, total
    }).select().single();
    if (e1) throw e1;
    await sb.from("ticket_items").insert(cart.map(c => ({
      ticket_id: tk.id, product_id: c.pid, product_name: c.name,
      unit_price: c.price, qty: c.qty, subtotal: c.price * c.qty
    })));
    for (const c of cart) {
      if (c.track) {
        const prod = products.find(p => p.id === c.pid);
        const ns = Math.max(0, (prod?.stock_qty || 0) - c.qty);
        await sb.from("products").update({ stock_qty: ns }).eq("id", c.pid);
        await sb.from("stock_movements").insert({ product_id: c.pid, type: "sortie", qty: c.qty, reason: "Vente " + tnum, employee_id: currentUser.id });
      }
    }
    printReceipt(tk, [...cart], sub, disc, total, pay);
    toast(`✓ ${tnum} — ${dh(total)}`);
    cart = [];
    document.getElementById("inp-discount").value = "";
    renderCart();
    await loadProducts();
  } catch (err) { console.error(err); toast("Erreur encaissement", true); }
  finally { btn.disabled = false; }
};
function printReceipt(tk, items, sub, disc, total, pay) {
  const d = new Date(tk.created_at || Date.now());
  document.getElementById("print-area").innerHTML = `
    <div style="text-align:center;margin-bottom:8px;">
      <div style="font-size:18px;font-weight:700;">${SHOP}</div>
      <div>${tk.ticket_number}</div>
      <div>Servi par : ${currentUser.name}</div>
      <div>${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} — ${pad(d.getHours())}:${pad(d.getMinutes())}</div>
    </div>
    <hr>
    ${items.map(i => `<div style="display:flex;justify-content:space-between;padding:3px 0;"><span>${i.qty}x ${i.name}</span><span>${dh(i.price * i.qty)}</span></div>`).join("")}
    <hr>
    <div style="display:flex;justify-content:space-between;"><span>Sous-total</span><span>${dh(sub)}</span></div>
    <div style="display:flex;justify-content:space-between;"><span>Remise</span><span>−${dh(disc)}</span></div>
    <div style="display:flex;justify-content:space-between;font-weight:700;font-size:14px;margin-top:4px;"><span>Total</span><span>${dh(total)}</span></div>
    <div style="margin-top:5px;">Paiement : ${pay}</div>
    <hr>
    <div style="text-align:center;">📶 Wifi : ${WIFI}</div>
    <div style="text-align:center;margin-top:5px;">Merci de votre visite !</div>`;
  window.print();
}

/* ================================================================
   PANNEAU "COMMANDES EN DIRECT" (pc-orders-panel)
================================================================ */
async function loadPcOrders() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const { data } = await sb.from("tickets").select("*,employees(name)")
    .eq("status", "payé").gte("created_at", start.toISOString())
    .order("created_at", { ascending: false }).limit(20);
  renderPcOrders(data || []);
}
function renderPcOrders(list) {
  const wrap = document.getElementById("pc-orders");
  const badge = document.getElementById("pc-count-badge");
  if (!wrap) return;
  if (badge) badge.textContent = list.length;
  if (!list.length) { wrap.innerHTML = `<div class="empty">Aucune vente aujourd'hui.</div>`; return; }
  wrap.innerHTML = list.map(t => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid var(--line,#eee);font-size:12.5px;">
      <div>
        <div style="font-weight:700;">${t.ticket_number}</div>
        <div style="color:var(--ink2,#888);font-size:11.5px;">${fmtTime(t.created_at)} · ${t.employees?.name || "—"}</div>
      </div>
      <div class="mono" style="font-weight:700;">${dh(t.total)}</div>
    </div>`).join("");
}
let pcOrdersChannel = null;
function subscribePcOrders() {
  if (pcOrdersChannel) return;
  pcOrdersChannel = sb.channel("pc-orders-" + Date.now())
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "tickets" }, () => loadPcOrders())
    .subscribe();
}

/* ================================================================
   TICKETS
================================================================ */
async function loadTickets() {
  const from = document.getElementById("tk-from").value;
  const to = document.getElementById("tk-to").value;
  let q = sb.from("tickets").select("*,employees(name)").order("created_at", { ascending: false }).limit(300);
  if (from) q = q.gte("created_at", from + "T00:00:00");
  if (to) q = q.lte("created_at", to + "T23:59:59");
  const { data } = await q;
  const tbody = document.querySelector("#tickets-table tbody");
  if (!data || !data.length) { tbody.innerHTML = `<tr><td colspan="7" class="empty">Aucun ticket sur cette période.</td></tr>`; return; }
  tbody.innerHTML = data.map(t => `
    <tr>
      <td class="mono" style="font-size:12px;">${t.ticket_number}</td>
      <td>${fmtTime(t.created_at)}</td>
      <td>${t.employees?.name || "—"}</td>
      <td class="mono">${dh(t.total)}</td>
      <td>${t.payment_method || "—"}</td>
      <td><span class="tag ${t.status === 'payé' ? 'tag-ok' : t.status === 'annulé' ? 'tag-warn' : 'tag-muted'}">${t.status}</span></td>
      <td><button class="btn btn-ghost btn-sm" onclick="viewTicket(${t.id})">Voir</button></td>
    </tr>`).join("");
}
document.getElementById("tk-filter").onclick = loadTickets;
document.getElementById("tk-today").onclick = () => {
  document.getElementById("tk-from").value = todayStr();
  document.getElementById("tk-to").value = todayStr();
  loadTickets();
};
async function viewTicket(id) {
  const { data: tk } = await sb.from("tickets").select("*,employees(name)").eq("id", id).single();
  const { data: items } = await sb.from("ticket_items").select("*").eq("ticket_id", id);
  openModal(`
    <h3>${tk.ticket_number}</h3>
    <div style="color:var(--text2,#888);font-size:13px;margin-bottom:12px;">${fmtTime(tk.created_at)} · ${tk.employees?.name || "—"} · ${tk.payment_method || ""}</div>
    <table>${(items || []).map(i => `<tr><td>${i.qty} × ${i.product_name}</td><td style="text-align:right;">${dh(i.subtotal)}</td></tr>`).join("")}</table>
    <div class="sep"></div>
    <div style="display:flex;justify-content:space-between;font-weight:700;font-size:16px;"><span>Total</span><span>${dh(tk.total)}</span></div>
    ${tk.status === "payé" ? `
    <div class="sep"></div>
    <div style="font-size:13px;color:var(--text2,#888);margin-bottom:8px;">Annulation réservée au gérant / admin — entrez votre code :</div>
    <div class="field"><label>Code PIN</label><input type="password" id="void-pin" maxlength="4" inputmode="numeric"></div>
    <div id="void-err" style="color:var(--rose,#c0392b);font-size:13px;min-height:16px;margin-top:4px;"></div>
    <div class="row" style="margin-top:14px;">
      <button class="btn btn-danger" onclick="confirmVoid(${tk.id})">Annuler le ticket</button>
      <button class="btn btn-ghost" onclick="closeModal()">Fermer</button>
    </div>` : `<div class="row" style="margin-top:14px;"><button class="btn btn-ghost" onclick="closeModal()">Fermer</button></div>`}
  `);
}
async function confirmVoid(id) {
  const pin = document.getElementById("void-pin").value.trim();
  const { data: approver } = await sb.from("employees").select("*").eq("pin", pin).eq("active", true).in("role", MGR).maybeSingle();
  if (!approver) { document.getElementById("void-err").textContent = "Code invalide ou non autorisé."; return; }
  const { data: items } = await sb.from("ticket_items").select("*").eq("ticket_id", id);
  for (const it of items || []) {
    const { data: p } = await sb.from("products").select("*").eq("id", it.product_id).single();
    if (p && p.track_stock) {
      await sb.from("products").update({ stock_qty: p.stock_qty + it.qty }).eq("id", p.id);
      await sb.from("stock_movements").insert({ product_id: p.id, type: "entree", qty: it.qty, reason: `Annulation — ${approver.name}`, employee_id: approver.id });
    }
  }
  await sb.from("tickets").update({ status: "annulé", note: `Annulé par ${approver.name}` }).eq("id", id);
  toast(`Ticket annulé (autorisé par ${approver.name})`);
  closeModal(); loadTickets(); loadProducts();
}
function openDeleteTicketPicker() {
  openModal(`
    <h3>Supprimer un ticket (test)</h3>
    <div class="field"><label>Numéro de ticket</label><input id="del-tk-num" placeholder="ex: T20260725-0001"></div>
    <div id="del-tk-err" style="color:var(--rose,#c0392b);font-size:13px;min-height:16px;"></div>
    <div class="row" style="margin-top:14px;">
      <button class="btn btn-danger" onclick="confirmDeleteTicket()">Supprimer définitivement</button>
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    </div>`);
}
async function confirmDeleteTicket() {
  const num = document.getElementById("del-tk-num").value.trim();
  const { data: tk } = await sb.from("tickets").select("*").eq("ticket_number", num).maybeSingle();
  if (!tk) { document.getElementById("del-tk-err").textContent = "Ticket introuvable."; return; }
  await sb.from("ticket_items").delete().eq("ticket_id", tk.id);
  await sb.from("tickets").delete().eq("id", tk.id);
  toast("Ticket supprimé"); closeModal(); loadTickets();
}

/* ================================================================
   STOCK
================================================================ */
async function loadStock() {
  const { data } = await sb.from("products").select("*,categories(name)").eq("track_stock", true).order("name");
  const tbody = document.querySelector("#stock-table tbody");
  if (!data || !data.length) { tbody.innerHTML = `<tr><td colspan="5" class="empty">Aucun produit suivi.</td></tr>`; return; }
  tbody.innerHTML = data.map(p => `
    <tr>
      <td>${getIcon(p)} ${p.name}</td>
      <td>${p.categories?.name || "—"}</td>
      <td class="mono">${p.stock_qty}</td>
      <td class="mono">${p.low_stock_threshold}</td>
      <td><span class="tag ${p.stock_qty <= p.low_stock_threshold ? 'tag-warn' : 'tag-ok'}">${p.stock_qty <= p.low_stock_threshold ? 'Bas' : 'OK'}</span></td>
    </tr>`).join("");
}
document.getElementById("btn-add-mvt").onclick = () => {
  const tp = products.filter(p => p.track_stock);
  openModal(`
    <h3>Mouvement de stock</h3>
    <div class="field"><label>Produit</label><select id="mv-p">${tp.map(p => `<option value="${p.id}">${p.name} (${p.stock_qty})</option>`).join("")}</select></div>
    <div class="field" style="margin-top:10px;"><label>Type</label>
      <select id="mv-t"><option value="entree">Entrée</option><option value="sortie">Sortie</option><option value="ajustement">Ajustement</option><option value="casse">Casse</option></select>
    </div>
    <div class="field" style="margin-top:10px;"><label>Quantité</label><input type="number" id="mv-q" min="0" step="1" value="1"></div>
    <div class="field" style="margin-top:10px;"><label>Raison</label><input type="text" id="mv-r" placeholder="Optionnel"></div>
    <div class="row" style="margin-top:16px;">
      <button class="btn btn-primary" onclick="saveMvt()">Valider</button>
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    </div>`);
};
async function saveMvt() {
  const pid = Number(document.getElementById("mv-p").value);
  const type = document.getElementById("mv-t").value;
  const qty = Number(document.getElementById("mv-q").value);
  const reason = document.getElementById("mv-r").value;
  if (!qty || qty < 0) { toast("Quantité invalide", true); return; }
  const prod = products.find(p => p.id === pid);
  let ns = prod.stock_qty;
  if (type === "entree") ns += qty;
  else if (type === "sortie" || type === "casse") ns = Math.max(0, ns - qty);
  else ns = qty;
  await sb.from("stock_movements").insert({ product_id: pid, type, qty, reason, employee_id: currentUser.id });
  await sb.from("products").update({ stock_qty: ns }).eq("id", pid);
  toast("Stock mis à jour"); closeModal(); await loadProducts(); loadStock();
}

/* ================================================================
   PRODUITS / MENU
================================================================ */
async function loadProdTable() {
  const { data } = await sb.from("products").select("*,categories(name)").order("name");
  const tbody = document.querySelector("#prod-table tbody");
  if (!data || !data.length) { tbody.innerHTML = `<tr><td colspan="6" class="empty">Aucun produit.</td></tr>`; return; }
  tbody.innerHTML = data.map(p => `
    <tr>
      <td style="font-size:18px;">${getIcon(p)}</td>
      <td>${p.name}</td>
      <td>${p.categories?.name || "—"}</td>
      <td class="mono">${dh(p.price)}</td>
      <td><span class="tag ${p.active ? 'tag-ok' : 'tag-muted'}">${p.active ? 'Actif' : 'Inactif'}</span></td>
      <td><button class="btn btn-ghost btn-sm" onclick="editProd(${p.id})">Modifier</button></td>
    </tr>`).join("");
}
document.getElementById("btn-add-prod").onclick = () => openProdForm(null);
async function editProd(id) {
  const { data } = await sb.from("products").select("*").eq("id", id).single();
  openProdForm(data);
}
function openProdForm(p) {
  openModal(`
    <h3>${p ? "Modifier" : "Nouveau"} produit</h3>
    <div class="field"><label>Nom</label><input id="pf-name" value="${p?.name || ''}"></div>
    <div class="field" style="margin-top:10px;"><label>Icône (optionnel — auto si vide)</label>
      <div id="icon-picker" style="display:flex;flex-wrap:wrap;gap:5px;padding:8px;background:var(--bg,#f7f7f7);border-radius:8px;max-height:120px;overflow:auto;">
        ${ICON_OPTS.map(ic => `<button type="button" onclick="pickIcon('${ic}')" style="width:34px;height:34px;font-size:18px;border-radius:7px;background:#fff;border:1.5px solid ${(p?.icon || "") == ic ? '#C8A040' : '#ddd'};cursor:pointer;">${ic}</button>`).join("")}
      </div>
      <input type="hidden" id="pf-icon" value="${p?.icon || ''}">
    </div>
    <div class="field" style="margin-top:10px;"><label>Catégorie</label>
      <select id="pf-cat">${categories.map(c => `<option value="${c.id}" ${p?.category_id === c.id ? 'selected' : ''}>${c.name}</option>`).join("")}</select>
    </div>
    <div class="field" style="margin-top:10px;">
      <label>Section</label>
      <div class="row" style="gap:8px;margin-top:4px;">
        <label style="flex:1;display:flex;align-items:center;gap:6px;border:1.5px solid var(--line,#ddd);border-radius:8px;padding:8px 10px;cursor:pointer;">
          <input type="radio" name="pf-section" value="cafe" ${(!p || sectionOfProduct(p) === "cafe") ? "checked" : ""}> ☕ Café
        </label>
        <label style="flex:1;display:flex;align-items:center;gap:6px;border:1.5px solid var(--line,#ddd);border-radius:8px;padding:8px 10px;cursor:pointer;">
          <input type="radio" name="pf-section" value="terrasse" ${p && sectionOfProduct(p) === "terrasse" ? "checked" : ""}> 🏖️ Terrasse
        </label>
      </div>
    </div>
    <div class="row" style="margin-top:10px;">
      <div class="field" style="flex:1;"><label>Prix (DH)</label><input type="number" id="pf-price" step="0.5" value="${p?.price || ''}"></div>
      <div class="field" style="flex:1;"><label>Coût (DH)</label><input type="number" id="pf-cost" step="0.5" value="${p?.cost || 0}"></div>
    </div>
    <label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13.5px;cursor:pointer;">
      <input type="checkbox" id="pf-active" ${(!p || p.active) ? 'checked' : ''}> Actif (visible en caisse)
    </label>
    <div class="row" style="margin-top:16px;">
      <button class="btn btn-primary" onclick="saveProd(${p?.id || 'null'})">Enregistrer</button>
      ${p ? `<button class="btn btn-danger" onclick="deactivateProd(${p.id})">Désactiver</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    </div>`);
}
function pickIcon(ic) {
  document.getElementById("pf-icon").value = ic;
  document.querySelectorAll("#icon-picker button").forEach(b => b.style.borderColor = b.textContent === ic ? '#C8A040' : '#ddd');
}
async function saveProd(id) {
  const payload = {
    name: document.getElementById("pf-name").value.trim(),
    icon: document.getElementById("pf-icon").value || null,
    category_id: Number(document.getElementById("pf-cat").value),
    section: document.querySelector('input[name="pf-section"]:checked')?.value || "cafe",
    price: Number(document.getElementById("pf-price").value) || 0,
    cost: Number(document.getElementById("pf-cost").value) || 0,
    active: document.getElementById("pf-active").checked
  };
  if (!payload.name) { toast("Nom requis", true); return; }
  const { error } = id !== 'null' && id ? await sb.from("products").update(payload).eq("id", id) : await sb.from("products").insert(payload);
  if (error) { toast("Erreur enregistrement", true); return; }
  toast("Produit enregistré"); closeModal(); loadProdTable(); loadProducts();
}
async function deactivateProd(id) {
  if (!confirm("Désactiver ce produit ?")) return;
  await sb.from("products").update({ active: false }).eq("id", id);
  toast("Produit désactivé"); closeModal(); loadProdTable(); loadProducts();
}
document.getElementById("btn-add-cat").onclick = () => {
  openModal(`
    <h3>Nouvelle catégorie</h3>
    <div class="field"><label>Nom</label><input id="cf-name" placeholder="ex: Smoothies"></div>
    <div class="row" style="margin-top:16px;">
      <button class="btn btn-primary" onclick="saveCat()">Créer</button>
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    </div>`);
};
async function saveCat() {
  const name = document.getElementById("cf-name").value.trim();
  if (!name) { toast("Nom requis", true); return; }
  await sb.from("categories").insert({ name, sort_order: categories.length + 1 });
  toast("Catégorie créée"); closeModal(); await loadCategories();
}
function openDeleteProductPicker() {
  openModal(`
    <h3>Supprimer un produit</h3>
    <div class="field"><label>Produit</label><select id="del-prod">${products.map(p => `<option value="${p.id}">${p.name}</option>`).join("")}</select></div>
    <div class="row" style="margin-top:16px;">
      <button class="btn btn-danger" onclick="confirmDeleteProduct()">Supprimer définitivement</button>
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    </div>`);
}
async function confirmDeleteProduct() {
  const id = Number(document.getElementById("del-prod").value);
  await sb.from("products").delete().eq("id", id);
  toast("Produit supprimé"); closeModal(); loadProducts(); loadProdTable();
}

/* ================================================================
   SERVEURS
================================================================ */
async function loadSrvTable() {
  const { data } = await sb.from("employees").select("*").order("name");
  const tbody = document.querySelector("#srv-table tbody");
  tbody.innerHTML = (data || []).map(e => `
    <tr>
      <td><b>${e.name}</b></td>
      <td>${ROLES[e.role] || e.role}</td>
      <td class="mono">${e.pin}</td>
      <td><span class="tag ${e.active ? 'tag-ok' : 'tag-muted'}">${e.active ? 'Actif' : 'Inactif'}</span></td>
      <td><button class="btn btn-ghost btn-sm" onclick="editSrv(${e.id})">Modifier</button></td>
    </tr>`).join("");
}
document.getElementById("btn-add-srv").onclick = () => openSrvForm(null);
async function editSrv(id) {
  const { data } = await sb.from("employees").select("*").eq("id", id).single();
  openSrvForm(data);
}
function openSrvForm(e) {
  openModal(`
    <h3>${e ? "Modifier" : "Nouveau"} serveur</h3>
    <div class="field"><label>Nom</label><input id="ef-name" value="${e?.name || ''}"></div>
    <div class="field" style="margin-top:10px;"><label>Rôle</label>
      <select id="ef-role">
        ${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${e?.role === k ? 'selected' : ''}>${v}</option>`).join("")}
      </select>
    </div>
    <div class="field" style="margin-top:10px;"><label>Code PIN (4 chiffres)</label><input id="ef-pin" maxlength="4" inputmode="numeric" value="${e?.pin || ''}"></div>
    <label style="display:flex;align-items:center;gap:8px;margin-top:10px;cursor:pointer;">
      <input type="checkbox" id="ef-active" ${(!e || e.active) ? 'checked' : ''}> Actif
    </label>
    <div class="row" style="margin-top:16px;">
      <button class="btn btn-primary" onclick="saveSrv(${e?.id || 'null'})">Enregistrer</button>
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    </div>`);
}
async function saveSrv(id) {
  const payload = {
    name: document.getElementById("ef-name").value.trim(),
    role: document.getElementById("ef-role").value,
    pin: document.getElementById("ef-pin").value.trim(),
    active: document.getElementById("ef-active").checked
  };
  if (!payload.name || payload.pin.length !== 4) { toast("Nom et PIN (4 chiffres) requis", true); return; }
  const { error } = id !== 'null' && id ? await sb.from("employees").update(payload).eq("id", id) : await sb.from("employees").insert(payload);
  if (error) { toast("Erreur enregistrement", true); return; }
  toast("Serveur enregistré"); closeModal(); loadSrvTable();
}
function openDeleteServerPicker() {
  openModal(`
    <h3>Supprimer un serveur</h3>
    <div class="field"><label>Serveur</label><select id="del-srv">${(products.length ? '' : '')}</select></div>
    <div class="row" style="margin-top:16px;">
      <button class="btn btn-danger" onclick="confirmDeleteServer()">Supprimer définitivement</button>
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    </div>`);
  sb.from("employees").select("*").order("name").then(({ data }) => {
    const sel = document.getElementById("del-srv");
    sel.innerHTML = (data || []).map(e => `<option value="${e.id}">${e.name}</option>`).join("");
  });
}
async function confirmDeleteServer() {
  const id = Number(document.getElementById("del-srv").value);
  await sb.from("employees").delete().eq("id", id);
  toast("Serveur supprimé"); closeModal(); loadSrvTable();
}

/* ================================================================
   RAPPORT — jour / mois, Café & Terrasse, par serveur
   + NOUVEAU : clôture de shift (rapport Z)
================================================================ */
function toggleRapportMode() {
  const mode = document.getElementById("rp-mode").value;
  document.getElementById("rp-day-wrap").style.display = mode === "jour" ? "" : "none";
  document.getElementById("rp-month-wrap").style.display = mode === "mois" ? "" : "none";
  document.getElementById("rp-month-chart-card").style.display = mode === "mois" ? "" : "none";
}
function setRapportToday() {
  document.getElementById("rp-mode").value = "jour";
  document.getElementById("rp-from").value = todayStr();
  toggleRapportMode();
  loadRapport();
}
function setRapportYesterday() {
  document.getElementById("rp-mode").value = "jour";
  const y = new Date(); y.setDate(y.getDate() - 1);
  document.getElementById("rp-from").value = todayStr(y);
  toggleRapportMode();
  loadRapport();
}

function ensureClotureBlock() {
  let el = document.getElementById("rp-cloture");
  if (el) return el;
  el = document.createElement("div");
  el.className = "card";
  el.id = "rp-cloture";
  const anchor = document.getElementById("rp-servers").closest(".card");
  anchor.parentNode.insertBefore(el, anchor);
  return el;
}

async function loadRapport() {
  const mode = document.getElementById("rp-mode").value;

  if (mode === "mois") {
    const mv = document.getElementById("rp-month").value || todayStr().slice(0, 7);
    const [yr, mo] = mv.split("-").map(Number);
    const monthStart = new Date(yr, mo - 1, 1);
    const monthEnd = new Date(yr, mo, 0, 23, 59, 59);
    document.getElementById("rp-date-label").textContent = monthStart.toLocaleString("fr-FR", { month: "long", year: "numeric" });

    const { data: tks } = await sb.from("tickets").select("*,employees(name)")
      .eq("status", "payé").gte("created_at", monthStart.toISOString()).lte("created_at", monthEnd.toISOString())
      .limit(10000);
    const all = tks || [];
    await renderRapportTotals(all, "Ce mois");

    const daysInMonth = monthEnd.getDate();
    const bars = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${yr}-${pad(mo)}-${pad(d)}`;
      const val = all.filter(t => todayStr(new Date(t.created_at)) === ds).reduce((s, t) => s + Number(t.total), 0);
      bars.push({ lbl: String(d), val });
    }
    const maxBar = Math.max(...bars.map(b => b.val), 1);
    document.getElementById("rp-month-bars").innerHTML = bars.map(b => `
      <div class="bar-col">
        <div class="bar-val" style="font-size:9px;">${b.val > 0 ? Math.round(b.val) : ''}</div>
        <div class="bar-fill" style="height:${Math.max(2, (b.val / maxBar) * 110)}px;"></div>
        <div class="bar-lbl">${b.lbl}</div>
      </div>`).join("");
    document.getElementById("rp-cloture").innerHTML = `<p style="font-size:13px;color:var(--ink2,#888);">La clôture de shift se fait en mode "Par jour".</p>`;
    return;
  }

  // Mode "jour" — jour commercial 04h00 → 03h59
  const day = document.getElementById("rp-from").value || todayStr();
  const { start, end } = commercialDayBounds(day);
  const dayDate = new Date(day + "T12:00:00");
  document.getElementById("rp-date-label").textContent = dayDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const { data: tks } = await sb.from("tickets").select("*,employees(name)")
    .eq("status", "payé").gte("created_at", start.toISOString()).lte("created_at", end.toISOString())
    .order("created_at", { ascending: true }).limit(10000);
  const all = tks || [];
  await renderRapportTotals(all, day);
  await renderCloture(day, all);
}

async function renderRapportTotals(all, periodLabel) {
  const ids = all.map(t => t.id);
  let items = [];
  const LOT = 200;
  for (let i = 0; i < ids.length; i += LOT) {
    const lot = ids.slice(i, i + LOT);
    const { data } = await sb.from("ticket_items").select("*").in("ticket_id", lot);
    if (data) items = items.concat(data);
  }
  const bySection = { cafe: { matin: 0, soir: 0 }, terrasse: { matin: 0, soir: 0 } };
  const ticketsBySection = { cafe: new Set(), terrasse: new Set() };
  items.forEach(it => {
    const prod = products.find(p => p.id === it.product_id);
    const sec = prod ? sectionOfProduct(prod) : "cafe";
    const tk = all.find(t => t.id === it.ticket_id);
    if (!tk) return;
    const val = Number(it.subtotal);
    if (isMatin(tk.created_at)) bySection[sec].matin += val;
    else if (isSoir(tk.created_at)) bySection[sec].soir += val;
    ticketsBySection[sec].add(tk.id);
  });
  const cafeTotal = bySection.cafe.matin + bySection.cafe.soir;
  const terTotal = bySection.terrasse.matin + bySection.terrasse.soir;

  document.getElementById("rp-cafe-matin").textContent = dh(bySection.cafe.matin);
  document.getElementById("rp-cafe-soir").textContent = dh(bySection.cafe.soir);
  document.getElementById("rp-cafe-total").textContent = dh(cafeTotal);
  document.getElementById("rp-ter-matin").textContent = dh(bySection.terrasse.matin);
  document.getElementById("rp-ter-soir").textContent = dh(bySection.terrasse.soir);
  document.getElementById("rp-ter-total").textContent = dh(terTotal);
  document.getElementById("rp-grand-total").textContent = dh(cafeTotal + terTotal);
  document.getElementById("rp-nb-label").textContent = `${all.length} ticket${all.length > 1 ? "s" : ""}`;

  const bySrv = {};
  all.forEach(t => {
    const n = t.employees?.name || "—";
    if (!bySrv[n]) bySrv[n] = { cafe: 0, terrasse: 0, cnt: 0 };
    bySrv[n].cnt++;
  });
  items.forEach(it => {
    const tk = all.find(t => t.id === it.ticket_id);
    if (!tk) return;
    const n = tk.employees?.name || "—";
    const prod = products.find(p => p.id === it.product_id);
    const sec = prod ? sectionOfProduct(prod) : "cafe";
    if (!bySrv[n]) bySrv[n] = { cafe: 0, terrasse: 0, cnt: 0 };
    bySrv[n][sec] += Number(it.subtotal);
  });
  const srvEntries = Object.entries(bySrv).sort((a, b) => (b[1].cafe + b[1].terrasse) - (a[1].cafe + a[1].terrasse));
  const maxSrv = Math.max(...srvEntries.map(([, v]) => v.cafe + v.terrasse), 1);
  document.getElementById("rp-servers").innerHTML = srvEntries.length ? srvEntries.map(([name, v]) => {
    const total = v.cafe + v.terrasse;
    const pct = Math.round((total / maxSrv) * 100);
    return `<div class="prog-item">
      <div class="prog-hd"><span><b>${name}</b> <span style="color:var(--text3,#999);font-size:12px;">(${v.cnt} tickets)</span></span><span class="mono" style="color:var(--copper,#C8A040);">${dh(total)}</span></div>
      <div class="prog-bar"><div class="prog-fill" style="width:${pct}%"></div></div>
      <div style="display:flex;gap:14px;font-size:11.5px;color:var(--text3,#999);margin-top:3px;">
        <span>☕ Café : ${dh(v.cafe)}</span>
        <span>🏖️ Terrasse : ${dh(v.terrasse)}</span>
      </div>
    </div>`;
  }).join("") : `<div class="empty">Pas encore de données pour ${periodLabel}.</div>`;

  renderDetailSection("rp-detail-cafe", "☕ Détail Café par serveur", srvEntries, "cafe", "rp-servers");
  renderDetailSection("rp-detail-terrasse", "🏖️ Détail Terrasse par serveur", srvEntries, "terrasse", "rp-detail-cafe");
}

function ensureDetailBlock(id, afterId) {
  let el = document.getElementById(id);
  if (el) return el;
  el = document.createElement("div");
  el.className = "card";
  el.id = id;
  const anchor = document.getElementById(afterId).closest(".card") || document.getElementById(afterId);
  anchor.parentNode.insertBefore(el, anchor.nextSibling);
  return el;
}
function renderDetailSection(blockId, title, srvEntries, key, afterId) {
  const el = ensureDetailBlock(blockId, afterId);
  const filtered = srvEntries.filter(([, v]) => v[key] > 0).sort((a, b) => b[1][key] - a[1][key]);
  const max = Math.max(...filtered.map(([, v]) => v[key]), 1);
  el.innerHTML = `
    <h3 class="disp" style="margin:0 0 12px;font-size:15px;">${title}</h3>
    ${filtered.length ? filtered.map(([name, v]) => {
      const pct = Math.round((v[key] / max) * 100);
      return `<div class="prog-item">
        <div class="prog-hd"><span><b>${name}</b></span><span class="mono" style="color:var(--copper,#C8A040);">${dh(v[key])}</span></div>
        <div class="prog-bar"><div class="prog-fill" style="width:${pct}%"></div></div>
      </div>`;
    }).join("") : `<div class="empty">Aucune vente ${key === "cafe" ? "Café" : "Terrasse"} sur cette période.</div>`}`;
}

async function renderCloture(day, allTickets) {
  const el = ensureClotureBlock();
  const total = allTickets.reduce((s, t) => s + Number(t.total), 0);
  const { data: closures } = await sb.from("shift_closures").select("*").eq("jour_commercial", day);
  const matinC = (closures || []).find(c => c.shift === "Matin");
  const soirC = (closures || []).find(c => c.shift === "Soir");

  function block(shiftName, closure) {
    if (closure) {
      return `<div style="flex:1;background:var(--bg,#f7f7f7);border-radius:10px;padding:12px;">
        <div style="font-size:12px;color:var(--ink2,#888);">${shiftName}</div>
        <div style="font-weight:700;color:var(--sage,#4a7a58);">✓ Clôturé — ${dh(closure.total)} · ${closure.tickets} tickets</div>
      </div>`;
    }
    return `<div style="flex:1;background:var(--bg,#f7f7f7);border-radius:10px;padding:12px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <div style="font-size:12px;color:var(--ink2,#888);">${shiftName} — pas encore clôturé</div>
      <button class="btn btn-primary btn-sm" onclick="cloturerShift('${day}','${shiftName}')">Clôturer</button>
    </div>`;
  }
  el.innerHTML = `
    <h3 class="disp" style="margin:0 0 12px;font-size:16px;">🔒 Clôture de shift</h3>
    <div class="row" style="gap:10px;">
      ${block("Matin", matinC)}
      ${block("Soir", soirC)}
    </div>`;
}

async function cloturerShift(day, shift) {
  const { start: dayStart, end: dayEnd } = commercialDayBounds(day);
  const { data: tks } = await sb.from("tickets").select("*").eq("status", "payé")
    .gte("created_at", dayStart.toISOString()).lte("created_at", dayEnd.toISOString()).limit(10000);
  const filtered = (tks || []).filter(t => shift === "Matin" ? isMatin(t.created_at) : isSoir(t.created_at));
  const total = filtered.reduce((s, t) => s + Number(t.total), 0);

  const { error } = await sb.from("shift_closures").upsert({
    jour_commercial: day, shift, total, tickets: filtered.length, closed_by: currentUser?.id || null
  }, { onConflict: "jour_commercial,shift" });
  if (error) { toast("Erreur lors de la clôture : " + error.message, true); return; }
  toast(`Shift ${shift} clôturé — ${dh(total)}`);
  loadRapport();
}

/* ================================================================
   PARAMÈTRES
================================================================ */
async function loadParametres() {
  document.getElementById("set-shop-name").value = SHOP;
  document.getElementById("set-wifi").value = WIFI;
  try {
    const { data } = await sb.from("app_settings").select("*").limit(1).maybeSingle();
    if (data) {
      if (data.shop_name) document.getElementById("set-shop-name").value = data.shop_name;
      if (data.wifi) document.getElementById("set-wifi").value = data.wifi;
    }
  } catch (e) { /* colonnes différentes selon l'installation — pas bloquant */ }
  renderSettingsCategories();
}
function renderSettingsCategories() {
  const wrap = document.getElementById("settings-categories");
  if (!categories.length) { wrap.innerHTML = `<div class="empty">Aucune catégorie.</div>`; return; }
  wrap.innerHTML = categories.map(c => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line,#eee);">
      <input value="${c.name}" onblur="renameCategorie(${c.id}, this.value)" style="flex:1;border:1px solid var(--line,#ddd);border-radius:6px;padding:6px 8px;">
      <button class="btn btn-danger btn-sm" onclick="deleteCategorie(${c.id})">Supprimer</button>
    </div>`).join("");
}
async function renameCategorie(id, name) {
  name = name.trim();
  if (!name) return;
  await sb.from("categories").update({ name }).eq("id", id);
  await loadCategories();
  renderSettingsCategories();
}
async function deleteCategorie(id) {
  const { count } = await sb.from("products").select("*", { count: "exact", head: true }).eq("category_id", id);
  if (count && count > 0) { toast("Catégorie utilisée par des produits — impossible à supprimer", true); return; }
  await sb.from("categories").delete().eq("id", id);
  toast("Catégorie supprimée");
  await loadCategories();
  renderSettingsCategories();
}
async function saveSettings() {
  const shop_name = document.getElementById("set-shop-name").value.trim();
  const wifi = document.getElementById("set-wifi").value.trim();
  try {
    const { data: existing } = await sb.from("app_settings").select("*").limit(1).maybeSingle();
    if (existing) await sb.from("app_settings").update({ shop_name, wifi }).eq("id", existing.id);
    else await sb.from("app_settings").insert({ shop_name, wifi });
    SHOP = shop_name || SHOP;
    WIFI = wifi || WIFI;
    toast("Paramètres enregistrés");
  } catch (e) {
    toast("Enregistré localement — vérifie les colonnes de app_settings pour la sauvegarde en base", true);
    SHOP = shop_name || SHOP;
    WIFI = wifi || WIFI;
  }
}

/* ================================================================
   COMPTOIR (écran cuisine)
================================================================ */
let comptoirOrders = [];
let comptoirChannel = null;

function openComptoir() {
  document.getElementById("app").classList.remove("active");
  const screen = document.getElementById("comptoir-screen");
  screen.classList.add("active");
  if (!document.getElementById("cpt-back-btn")) {
    const back = document.createElement("button");
    back.id = "cpt-back-btn";
    back.textContent = "← Retour";
    back.style.cssText = "position:absolute;top:16px;right:20px;background:#1E3A5F;color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;z-index:10;";
    back.onclick = closeComptoir;
    document.getElementById("cpt-header").appendChild(back);
  }
  loadComptoirOrders();
  if (!comptoirChannel) {
    comptoirChannel = sb.channel("comptoir-" + Date.now())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tickets" }, async (payload) => {
        const tk = payload.new;
        if (tk.status !== "payé") return;
        if (comptoirOrders.find(o => o.id === tk.id)) return;
        const { data: items } = await sb.from("ticket_items").select("*").eq("ticket_id", tk.id);
        const { data: emp } = await sb.from("employees").select("name").eq("id", tk.employee_id).single();
        const order = { id: tk.id, ticket_number: tk.ticket_number, server: emp?.name || "—", time: new Date(tk.created_at), items: items || [], discount: tk.discount || 0, total: tk.total || 0, payment: tk.payment_method || "—", isNew: true, comptoir_status: tk.comptoir_status || "pending" };
        if (order.comptoir_status === "servi") return;
        comptoirOrders.unshift(order);
        renderComptoir();
        playBeep();
        setTimeout(() => { order.isNew = false; renderComptoir(); }, 8000);
      })
      .subscribe();
  }
}
function closeComptoir() {
  document.getElementById("comptoir-screen").classList.remove("active");
  document.getElementById("app").classList.add("active");
}
async function loadComptoirOrders() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const { data: tks } = await sb.from("tickets").select("*,employees(name)")
    .eq("status", "payé").gte("created_at", start.toISOString()).order("created_at", { ascending: false }).limit(10000);
  if (!tks || !tks.length) { renderComptoir(); return; }
  const ids = tks.map(t => t.id);
  let allItems = [];
  const LOT = 200;
  for (let i = 0; i < ids.length; i += LOT) {
    const { data } = await sb.from("ticket_items").select("*").in("ticket_id", ids.slice(i, i + LOT));
    if (data) allItems = allItems.concat(data);
  }
  comptoirOrders = tks.filter(t => t.comptoir_status !== "servi").map(t => ({
    id: t.id, ticket_number: t.ticket_number, server: t.employees?.name || "—", time: new Date(t.created_at),
    items: allItems.filter(i => i.ticket_id === t.id), discount: t.discount || 0, total: t.total || 0,
    payment: t.payment_method || "—", isNew: false, comptoir_status: t.comptoir_status || "pending"
  }));
  renderComptoir();
}
function renderComptoir() {
  const grid = document.getElementById("cpt-grid");
  const countEl = document.getElementById("cpt-count");
  const pending = comptoirOrders.filter(o => o.comptoir_status !== "servi");
  if (countEl) countEl.textContent = `${pending.length} commande${pending.length > 1 ? "s" : ""} en attente`;
  if (!pending.length) { grid.innerHTML = `<div class="cpt-empty"><div class="big">✓</div><p>Aucune commande en attente</p></div>`; return; }
  grid.innerHTML = pending.map(o => `
    <div class="cpt-card${o.isNew ? " new" : ""}" id="cpt-${o.id}">
      <div class="cpt-head">
        <span class="cpt-num">${o.ticket_number}</span>
        ${o.isNew ? '<span class="cpt-badge">NOUVEAU</span>' : ''}
        <span class="cpt-time">${pad(o.time.getHours())}:${pad(o.time.getMinutes())}</span>
      </div>
      <div class="cpt-server">👤 ${o.server}</div>
      <div class="cpt-items">
        ${o.items.map(i => `
          <div class="cpt-item">
            <span class="cpt-item-name">${i.product_name}</span>
            <span style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:12px;color:#81C784;font-family:'JetBrains Mono',monospace;">${dh(i.unit_price)}</span>
              <span class="cpt-item-qty">×${i.qty}</span>
              <span style="font-size:12px;color:#A5D6A7;font-family:'JetBrains Mono',monospace;min-width:60px;text-align:right;">${dh(i.subtotal)}</span>
            </span>
          </div>`).join("")}
      </div>
      <div style="border-top:1px dashed #2E7D32;margin-top:4px;padding-top:8px;display:flex;flex-direction:column;gap:3px;">
        ${o.discount > 0 ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:#81C784;"><span>Remise</span><span>−${dh(o.discount)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;color:#fff;">
          <span>Total</span><span style="color:#4CAF50;">${dh(o.total)}</span>
        </div>
        <div style="font-size:11px;color:#4CAF50;margin-top:2px;">💳 ${o.payment || '—'}</div>
      </div>
      <div style="display:flex;gap:8px;margin-top:4px;">
        <button class="cpt-btn-servi" style="background:#1565C0;" onclick="printComptoirTicket(${o.id})">🖨️ Imprimer</button>
        <button class="cpt-btn-servi" onclick="markServi(${o.id})">✓ Servi</button>
      </div>
    </div>`).join("");
}
async function markServi(orderId) {
  await sb.from("tickets").update({ comptoir_status: "servi" }).eq("id", orderId);
  const order = comptoirOrders.find(o => o.id === orderId);
  if (order) order.comptoir_status = "servi";
  renderComptoir();
}
function printComptoirTicket(orderId) {
  const o = comptoirOrders.find(x => x.id === orderId);
  if (!o) return;
  const d = o.time;
  const area = document.getElementById("print-area");
  area.innerHTML = `
    <div style="text-align:center;margin-bottom:8px;">
      <div style="font-size:18px;font-weight:700;">${SHOP}</div>
      <div>${o.ticket_number}</div>
      <div>Servi par : ${o.server}</div>
      <div>${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} — ${pad(d.getHours())}:${pad(d.getMinutes())}</div>
    </div>
    <hr>
    ${o.items.map(i => `<div style="display:flex;justify-content:space-between;padding:3px 0;">
      <span>${i.qty}x ${i.product_name}</span><span>${dh(i.subtotal)}</span>
    </div>`).join("")}
    <hr>
    <div style="display:flex;justify-content:space-between;"><span>Sous-total</span><span>${dh(o.total + (o.discount || 0))}</span></div>
    ${o.discount > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Remise</span><span>−${dh(o.discount)}</span></div>` : ''}
    <div style="display:flex;justify-content:space-between;font-weight:700;font-size:14px;margin-top:4px;"><span>Total</span><span>${dh(o.total)}</span></div>
    <div style="margin-top:5px;">Paiement : ${o.payment}</div>
    <hr>
    <div style="text-align:center;">📶 Wifi : ${WIFI}</div>
    <div style="text-align:center;margin-top:5px;">Merci de votre visite !</div>`;
  window.print();
  markServi(orderId);
}
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1100].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.start(t); osc.stop(t + 0.28);
    });
  } catch (e) { }
}

/* ================================================================
   INIT
================================================================ */
/* ================================================================
   STYLE — vue partagée Café / Terrasse (injecté, aucune modif HTML requise)
================================================================ */
(function injectSplitViewStyle() {
  const style = document.createElement("style");
  style.textContent = `
    #product-grid.split-view { display:flex; gap:14px; align-items:flex-start; }
    .split-col { flex:1; min-width:0; }
    .split-col-title { font-weight:800; font-size:13px; letter-spacing:.04em; margin-bottom:8px; padding-bottom:6px; border-bottom:2px solid var(--copper,#C8A040); }
    .split-col-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(90px,1fr)); gap:8px; }
  `;
  document.head.appendChild(style);
})();

(function init() {
  tickClock();
  document.getElementById("tk-from").value = todayStr();
  document.getElementById("tk-to").value = todayStr();
  document.getElementById("rp-from").value = todayStr();
  document.getElementById("rp-month").value = todayStr().slice(0, 7);
  showScreen("home-screen");
})();
