/* ================================================================
   ÉTAT GLOBAL
================================================================ */
let currentUser = null;        // {id, name, role}
let pinBuffer = "";
let selectedEmployeeForLogin = null;

let categories = [];
let products = [];
let cart = [];                 // [{product_id, name, price, qty, track_stock, stock_qty}]
let activeCategoryId = "all";

const ROLE_LABELS = { admin:"Administrateur", gerant:"Gérant", serveur:"Serveur" };
const FULL_ACCESS_ROLES = ["admin","gerant"];   // accès stats, menu/prix, stock, gestion des serveurs

/* ================================================================
   ICÔNES PRODUITS
   - si product.icon est défini, on l'utilise
   - sinon on devine à partir du nom, puis de la catégorie
================================================================ */
const ICON_OPTIONS = ["☕","🥛","🍵","🧃","🧋","🥤","💧","🍫","🥐","🥪","🍞","🥯","🍩","🍰","🧁","🍪","🥧","🍨","🍦","🥗","🍕","🍔","🌮","🍲","🍳","🥞","🧇","🍓","🍯","🧀","🍽️"];
const ICON_KEYWORD_MAP = [
  [["cappuccino","macchiato","latte","café au lait","café crème","creme"], "🥛"],
  [["express","expresso","espresso","café","cafe","americano","ristretto"], "☕"],
  [["thé","the infusion","infusion","tisane"], "🍵"],
  [["smoothie","milkshake"], "🧋"],
  [["jus"], "🧃"],
  [["soda","coca","cola","sprite","gazeuse","limonade","boisson"], "🥤"],
  [["eau"], "💧"],
  [["chocolat chaud","cacao"], "🍫"],
  [["croissant"], "🥐"],
  [["sandwich","panini","club"], "🥪"],
  [["baguette","pain"], "🍞"],
  [["bagel"], "🥯"],
  [["beignet","donut"], "🍩"],
  [["gateau","gâteau","cake","patisserie","pâtisserie"], "🍰"],
  [["muffin","cupcake"], "🧁"],
  [["cookie","biscuit"], "🍪"],
  [["tarte"], "🥧"],
  [["glace","sorbet"], "🍨"],
  [["salade"], "🥗"],
  [["pizza"], "🍕"],
  [["burger","hamburger"], "🍔"],
  [["tacos"], "🌮"],
  [["soupe","potage","tajine","plat"], "🍲"],
  [["oeuf","œuf","omelette"], "🍳"],
  [["pancake","crepe","crêpe"], "🥞"],
  [["gaufre"], "🧇"],
  [["fraise","fruit"], "🍓"],
  [["miel"], "🍯"],
  [["fromage"], "🧀"]
];
function stripAccents(s){ return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,""); }
function getProductIcon(p){
  if(p.icon) return p.icon;
  const name = stripAccents(p.name||"").toLowerCase();
  for(const [keywords, icon] of ICON_KEYWORD_MAP){
    if(keywords.some(k=> name.includes(stripAccents(k)))) return icon;
  }
  const catName = stripAccents(categories.find(c=> c.id===p.category_id)?.name || "").toLowerCase();
  if(catName.includes("cafe")) return "☕";
  if(catName.includes("boisson") || catName.includes("fresh")) return "🥤";
  if(catName.includes("the") || catName.includes("matcha")) return "🍵";
  if(catName.includes("patiss") || catName.includes("crepe")) return "🥐";
  if(catName.includes("tacos")) return "🌮";
  if(catName.includes("glace")) return "🍨";
  if(catName.includes("dessert")) return "🍰";
  if(catName.includes("sandwich") || catName.includes("plat")) return "🥪";
  return "🍽️";
}

/* ================================================================
   HELPERS
================================================================ */
function money(n){ return (Number(n)||0).toFixed(2).replace(".",",") + " DH"; }
function pad(n){ return String(n).padStart(2,"0"); }
function todayStr(d=new Date()){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function fmtDateTime(iso){
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtDateShort(iso){
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}`;
}
function toast(msg, isError=false){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.toggle("error", isError);
  t.classList.remove("hidden");
  clearTimeout(t._timer);
  t._timer = setTimeout(()=> t.classList.add("hidden"), 2800);
}
function openModal(html){
  document.getElementById("modal-content").innerHTML = html;
  document.getElementById("modal-bg").classList.add("active");
}
function closeModal(){
  document.getElementById("modal-bg").classList.remove("active");
  document.getElementById("modal-content").innerHTML = "";
}
document.getElementById("modal-bg").addEventListener("click", (e)=>{
  if(e.target.id === "modal-bg") closeModal();
});

/* ================================================================
   HORLOGE
================================================================ */
function tickClock(){
  const d = new Date();
  document.getElementById("clock").textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
setInterval(tickClock, 1000);

/* ================================================================
   LOGIN
================================================================ */
async function loadEmployeesForLogin(){
  const { data, error } = await sb.from("employees").select("*").eq("active", true).order("name");
  if(error){ toast("Erreur chargement employés", true); return; }
  const grid = document.getElementById("employee-grid");
  grid.innerHTML = "";
  data.forEach(emp=>{
    const card = document.createElement("button");
    card.className = "employee-card";
    card.innerHTML = `<div class="avatar">${emp.name.charAt(0).toUpperCase()}</div><div>${emp.name}</div><div class="role">${ROLE_LABELS[emp.role]||emp.role}</div>`;
    card.onclick = ()=> startPin(emp);
    grid.appendChild(card);
  });
  if(data.length === 0){
    grid.innerHTML = `<div class="empty-state">Aucun employé. Vérifie ta config Supabase / schema.sql.</div>`;
  }
}
function startPin(emp){
  selectedEmployeeForLogin = emp;
  pinBuffer = "";
  renderPinDots();
  document.getElementById("employee-grid").style.display = "none";
  document.getElementById("pin-pad").classList.add("active");
  document.getElementById("pin-error").textContent = "";
}
document.getElementById("pin-back").onclick = ()=>{
  document.getElementById("pin-pad").classList.remove("active");
  document.getElementById("employee-grid").style.display = "flex";
};
function renderPinDots(){
  const dots = document.querySelectorAll("#pin-dots span");
  dots.forEach((d,i)=> d.classList.toggle("filled", i < pinBuffer.length));
}
function buildPinKeys(){
  const keys = ["1","2","3","4","5","6","7","8","9","⌫","0","OK"];
  const wrap = document.getElementById("pin-keys");
  wrap.innerHTML = "";
  keys.forEach(k=>{
    const btn = document.createElement("button");
    btn.className = "pin-key";
    btn.textContent = k;
    btn.onclick = ()=> handlePinKey(k);
    wrap.appendChild(btn);
  });
}
function handlePinKey(k){
  if(k === "⌫"){ pinBuffer = pinBuffer.slice(0,-1); renderPinDots(); return; }
  if(k === "OK"){ attemptLogin(); return; }
  if(pinBuffer.length < 4){ pinBuffer += k; renderPinDots(); }
  if(pinBuffer.length === 4) setTimeout(attemptLogin, 120);
}
function attemptLogin(){
  if(!selectedEmployeeForLogin) return;
  if(pinBuffer === selectedEmployeeForLogin.pin){
    currentUser = { id:selectedEmployeeForLogin.id, name:selectedEmployeeForLogin.name, role:selectedEmployeeForLogin.role };
    localStorage.setItem("cafe_pos_user", JSON.stringify(currentUser));
    enterApp();
  } else {
    document.getElementById("pin-error").textContent = "Code incorrect";
    pinBuffer = "";
    renderPinDots();
  }
}
document.getElementById("logout-btn").onclick = ()=>{
  currentUser = null;
  localStorage.removeItem("cafe_pos_user");
  document.getElementById("app").classList.remove("active");
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("pin-pad").classList.remove("active");
  document.getElementById("employee-grid").style.display = "flex";
  cart = [];
};

function enterApp(){
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app").classList.add("active");
  document.getElementById("who-name").textContent = currentUser.name;
  document.getElementById("who-role").textContent = ROLE_LABELS[currentUser.role] || currentUser.role;
  applyRoleVisibility();
  switchView("caisse");
  loadCategories();
  loadProducts();
}
function applyRoleVisibility(){
  const full = FULL_ACCESS_ROLES.includes(currentUser.role);
  document.querySelectorAll(".admin-only, .role-restricted").forEach(el=> el.style.display = full ? "" : "none");
}

/* ================================================================
   NAVIGATION
================================================================ */
document.querySelectorAll(".nav-btn").forEach(btn=>{
  btn.addEventListener("click", ()=> switchView(btn.dataset.view));
});
const VIEW_TITLES = { caisse:"Caisse", tickets:"Tickets", stock:"Stock", produits:"Menu & Produits", employes:"Serveurs", dashboard:"Statistiques" };
function switchView(view){
  document.querySelectorAll(".nav-btn").forEach(b=> b.classList.toggle("active", b.dataset.view===view));
  document.querySelectorAll(".view").forEach(v=> v.classList.toggle("active", v.id === "view-"+view));
  document.getElementById("view-title").textContent = VIEW_TITLES[view] || view;
  if(view === "tickets") loadTickets();
  if(view === "stock") loadStock();
  if(view === "produits") loadProductsTable();
  if(view === "employes") loadEmployeesTable();
  if(view === "dashboard") loadDashboard();
}

/* ================================================================
   CAISSE — chargement catégories / produits
================================================================ */
async function loadCategories(){
  const { data, error } = await sb.from("categories").select("*").order("sort_order");
  if(error){ toast("Erreur catégories", true); return; }
  categories = data;
  renderCatTabs();
}
function renderCatTabs(){
  const wrap = document.getElementById("cat-tabs");
  wrap.innerHTML = "";
  const allTab = document.createElement("button");
  allTab.className = "cat-tab" + (activeCategoryId==="all" ? " active":"");
  allTab.textContent = "Tout";
  allTab.onclick = ()=>{ activeCategoryId="all"; renderCatTabs(); renderProductGrid(); };
  wrap.appendChild(allTab);
  categories.forEach(c=>{
    const tab = document.createElement("button");
    tab.className = "cat-tab" + (activeCategoryId===c.id ? " active":"");
    tab.textContent = c.name;
    tab.onclick = ()=>{ activeCategoryId=c.id; renderCatTabs(); renderProductGrid(); };
    wrap.appendChild(tab);
  });
}
async function loadProducts(){
  const { data, error } = await sb.from("products").select("*").eq("active", true).order("name");
  if(error){ toast("Erreur produits", true); return; }
  products = data;
  renderProductGrid();
}
function renderProductGrid(){
  const grid = document.getElementById("product-grid");
  grid.innerHTML = "";
  let list = products;
  if(activeCategoryId !== "all") list = list.filter(p=> p.category_id === activeCategoryId);
  if(list.length === 0){ grid.innerHTML = `<div class="empty-state">Aucun produit dans cette catégorie.</div>`; return; }
  list.forEach(p=>{
    const lowStock = p.track_stock && p.stock_qty <= p.low_stock_threshold;
    const outOfStock = p.track_stock && p.stock_qty <= 0;
    const card = document.createElement("button");
    card.className = "prod-card";
    card.disabled = outOfStock;
    card.innerHTML = `${lowStock && !outOfStock ? '<span class="plow" title="Stock bas"></span>' : ''}
      <div class="picon">${getProductIcon(p)}</div>
      <div class="pname">${p.name}</div>
      <div class="pprice">${money(p.price)}</div>`;
    card.onclick = ()=> addToCart(p);
    grid.appendChild(card);
  });
}

/* ================================================================
   PANIER / TICKET
================================================================ */
function addToCart(p){
  if(p.track_stock && p.stock_qty <= 0){ toast("Stock épuisé", true); return; }
  const existing = cart.find(c=> c.product_id === p.id);
  if(existing){
    if(p.track_stock && existing.qty + 1 > p.stock_qty){ toast("Stock insuffisant", true); return; }
    existing.qty += 1;
  } else {
    cart.push({ product_id:p.id, name:p.name, price:p.price, qty:1, track_stock:p.track_stock, stock_qty:p.stock_qty, icon:getProductIcon(p) });
  }
  renderCart();
}
function changeQty(productId, delta){
  const item = cart.find(c=> c.product_id === productId);
  if(!item) return;
  const product = products.find(p=> p.id === productId);
  const newQty = item.qty + delta;
  if(newQty <= 0){ cart = cart.filter(c=> c.product_id !== productId); }
  else if(product && product.track_stock && newQty > product.stock_qty){ toast("Stock insuffisant", true); return; }
  else { item.qty = newQty; }
  renderCart();
}
function removeFromCart(productId){
  cart = cart.filter(c=> c.product_id !== productId);
  renderCart();
}
document.getElementById("btn-clear-cart").onclick = ()=>{ cart = []; renderCart(); };

function cartSubtotal(){ return cart.reduce((s,c)=> s + c.price*c.qty, 0); }
function renderCart(){
  const wrap = document.getElementById("receipt-items");
  const now = new Date();
  document.getElementById("receipt-meta").textContent = `${currentUser ? currentUser.name : ""} — ${now.toLocaleDateString("fr-FR")} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if(cart.length === 0){
    wrap.innerHTML = `<div class="empty-state">Ticket vide. Sélectionne des produits.</div>`;
  } else {
    wrap.innerHTML = cart.map(c=> `
      <div class="receipt-line">
        <span class="rl-name">${c.icon||""} ${c.name}</span>
        <span class="rl-qty">
          <button onclick="changeQty(${c.product_id},-1)">−</button>
          <span>${c.qty}</span>
          <button onclick="changeQty(${c.product_id},1)">+</button>
        </span>
        <span>${money(c.price*c.qty)}</span>
        <span class="rl-rm" onclick="removeFromCart(${c.product_id})" title="Retirer">✕</span>
      </div>`).join("");
  }
  const subtotal = cartSubtotal();
  const discount = Math.min(Number(document.getElementById("discount-input").value)||0, subtotal);
  document.getElementById("rt-subtotal").textContent = money(subtotal);
  document.getElementById("rt-discount").textContent = "− " + money(discount);
  document.getElementById("rt-total").textContent = money(subtotal - discount);
}
document.getElementById("discount-input").addEventListener("input", renderCart);

/* ================================================================
   ENCAISSEMENT
================================================================ */
async function nextTicketNumber(){
  const dStr = todayStr().replace(/-/g,"");
  const start = new Date(); start.setHours(0,0,0,0);
  const { count } = await sb.from("tickets").select("*", { count:"exact", head:true }).gte("created_at", start.toISOString());
  return `T${dStr}-${pad((count||0)+1)}`;
}

document.getElementById("btn-checkout").onclick = async ()=>{
  if(cart.length === 0){ toast("Le ticket est vide", true); return; }
  const btn = document.getElementById("btn-checkout");
  btn.disabled = true;
  try{
    const subtotal = cartSubtotal();
    const discount = Math.min(Number(document.getElementById("discount-input").value)||0, subtotal);
    const total = subtotal - discount;
    const payment_method = document.getElementById("payment-method").value;
    const ticket_number = await nextTicketNumber();

    const { data: ticket, error: tErr } = await sb.from("tickets").insert({
      ticket_number, employee_id: currentUser.id, status:"payé",
      payment_method, subtotal, discount, total
    }).select().single();
    if(tErr) throw tErr;

    const items = cart.map(c=> ({
      ticket_id: ticket.id, product_id: c.product_id, product_name: c.name,
      unit_price: c.price, qty: c.qty, subtotal: c.price*c.qty
    }));
    const { error: iErr } = await sb.from("ticket_items").insert(items);
    if(iErr) throw iErr;

    // décrémenter le stock des produits suivis
    for(const c of cart){
      if(c.track_stock){
        await sb.from("stock_movements").insert({ product_id:c.product_id, type:"sortie", qty:c.qty, reason:"Vente "+ticket_number, employee_id:currentUser.id });
        const prod = products.find(p=> p.id === c.product_id);
        const newStock = Math.max(0, (prod.stock_qty||0) - c.qty);
        await sb.from("products").update({ stock_qty:newStock }).eq("id", c.product_id);
      }
    }

    toast(`Ticket ${ticket_number} encaissé — ${money(total)}`);
    printReceipt(ticket, cart, subtotal, discount, total, payment_method);
    cart = [];
    document.getElementById("discount-input").value = "";
    renderCart();
    await loadProducts();
  } catch(err){
    console.error(err);
    toast("Erreur lors de l'encaissement", true);
  } finally {
    btn.disabled = false;
  }
};

function printReceipt(ticket, items, subtotal, discount, total, paymentMethod){
  const area = document.getElementById("print-area");
  const d = new Date(ticket.created_at || Date.now());
  area.innerHTML = `
    <div style="text-align:center;">
      <h2 style="margin:0;">${SHOP_NAME}</h2>
      <div>${ticket.ticket_number}</div>
      <div>Servi par : ${currentUser.name}</div>
      <div>${todayStr(d).split("-").reverse().join("/")} — ${pad(d.getHours())}:${pad(d.getMinutes())}</div>
    </div>
    <hr>
    ${items.map(i=> `<div style="display:flex;justify-content:space-between;"><span>${i.qty} x ${i.name}</span><span>${money(i.price*i.qty)}</span></div>`).join("")}
    <hr>
    <div style="display:flex;justify-content:space-between;"><span>Sous-total</span><span>${money(subtotal)}</span></div>
    <div style="display:flex;justify-content:space-between;"><span>Remise</span><span>${money(discount)}</span></div>
    <div style="display:flex;justify-content:space-between;font-weight:bold;"><span>Total</span><span>${money(total)}</span></div>
    <div style="margin-top:6px;">Paiement : ${paymentMethod}</div>
    <div style="text-align:center;margin-top:10px;">📶 Wifi : ${WIFI_CODE}</div>
    <div style="text-align:center;margin-top:6px;">Merci de votre visite !</div>
  `;
  window.print();
}

/* ================================================================
   TICKETS — historique
================================================================ */
async function loadTickets(){
  const from = document.getElementById("tk-from").value;
  const to = document.getElementById("tk-to").value;
  let query = sb.from("tickets").select("*, employees(name)").order("created_at", { ascending:false }).limit(200);
  if(from) query = query.gte("created_at", from+"T00:00:00");
  if(to) query = query.lte("created_at", to+"T23:59:59");
  const { data, error } = await query;
  if(error){ toast("Erreur tickets", true); return; }
  const tbody = document.querySelector("#tickets-table tbody");
  if(data.length === 0){ tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Aucun ticket sur cette période.</td></tr>`; return; }
  const counts = await Promise.all(data.map(t=> sb.from("ticket_items").select("*", {count:"exact", head:true}).eq("ticket_id", t.id)));
  tbody.innerHTML = data.map((t,i)=> `
    <tr>
      <td class="mono">${t.ticket_number}</td>
      <td>${fmtDateTime(t.created_at)}</td>
      <td>${t.employees ? t.employees.name : "—"}</td>
      <td>${counts[i].count ?? "—"}</td>
      <td>${t.payment_method||"—"}</td>
      <td class="mono">${money(t.total)}</td>
      <td><span class="tag ${t.status==='payé'?'ok':t.status==='annulé'?'warn':'muted'}">${t.status}</span></td>
      <td><button class="btn ghost sm" onclick="viewTicket(${t.id})">Voir</button></td>
    </tr>`).join("");
}
document.getElementById("tk-filter").onclick = loadTickets;
document.getElementById("tk-today").onclick = ()=>{
  document.getElementById("tk-from").value = todayStr();
  document.getElementById("tk-to").value = todayStr();
  loadTickets();
};

async function viewTicket(ticketId){
  const { data: ticket } = await sb.from("tickets").select("*, employees(name)").eq("id", ticketId).single();
  const { data: items } = await sb.from("ticket_items").select("*").eq("ticket_id", ticketId);
  const canVoid = ticket.status === "payé";
  openModal(`
    <h3>${ticket.ticket_number}</h3>
    <div style="color:var(--cream-dim);font-size:13px;margin-bottom:10px;">${fmtDateTime(ticket.created_at)} · ${ticket.employees?ticket.employees.name:"—"} · ${ticket.payment_method||""}</div>
    <table>${items.map(i=> `<tr><td>${i.qty} x ${i.product_name}</td><td style="text-align:right;">${money(i.subtotal)}</td></tr>`).join("")}</table>
    <div style="display:flex;justify-content:space-between;margin-top:10px;font-weight:700;"><span>Total</span><span>${money(ticket.total)}</span></div>
    <div style="display:flex;gap:8px;margin-top:18px;">
      ${canVoid ? `<button class="btn danger" onclick="askVoidPin(${ticket.id})">Annuler le ticket</button>` : ""}
      <button class="btn ghost" onclick="closeModal()">Fermer</button>
    </div>
  `);
}

function askVoidPin(ticketId){
  openModal(`
    <h3>Annulation du ticket</h3>
    <p style="color:var(--cream-dim);font-size:13.5px;margin-top:-6px;">Réservée au gérant ou à l'admin. Saisis ton code pour confirmer.</p>
    <div class="field"><label>Code (4 chiffres)</label><input type="password" id="void-pin" maxlength="4" inputmode="numeric" autofocus></div>
    <div id="void-pin-error" style="color:var(--brick);font-size:13px;min-height:18px;margin-top:4px;"></div>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button class="btn danger" onclick="confirmVoidTicket(${ticketId})">Confirmer l'annulation</button>
      <button class="btn ghost" onclick="closeModal()">Annuler</button>
    </div>
  `);
  document.getElementById("void-pin").focus();
}

async function confirmVoidTicket(ticketId){
  const pin = document.getElementById("void-pin").value.trim();
  const { data: approver } = await sb.from("employees").select("*")
    .eq("pin", pin).eq("active", true).in("role", ["admin","gerant"]).maybeSingle();
  if(!approver){
    document.getElementById("void-pin-error").textContent = "Code invalide ou non autorisé à annuler.";
    return;
  }
  const { data: items } = await sb.from("ticket_items").select("*").eq("ticket_id", ticketId);
  for(const it of items){
    const { data: prod } = await sb.from("products").select("*").eq("id", it.product_id).single();
    if(prod && prod.track_stock){
      await sb.from("products").update({ stock_qty: prod.stock_qty + it.qty }).eq("id", prod.id);
      await sb.from("stock_movements").insert({ product_id:prod.id, type:"entree", qty:it.qty, reason:`Annulation ticket — autorisée par ${approver.name}`, employee_id:approver.id });
    }
  }
  await sb.from("tickets").update({ status:"annulé", note:`Annulé par ${approver.name}` }).eq("id", ticketId);
  toast(`Ticket annulé — autorisé par ${approver.name}`);
  closeModal();
  loadTickets();
  loadProducts();
}

/* ================================================================
   STOCK
================================================================ */
async function loadStock(){
  const { data, error } = await sb.from("products").select("*, categories(name)").eq("track_stock", true).order("name");
  if(error){ toast("Erreur stock", true); return; }
  const tbody = document.querySelector("#stock-table tbody");
  if(data.length === 0){ tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Aucun produit suivi en stock.</td></tr>`; return; }
  tbody.innerHTML = data.map(p=>{
    const low = p.stock_qty <= p.low_stock_threshold;
    return `<tr>
      <td>${p.name}</td>
      <td>${p.categories?p.categories.name:"—"}</td>
      <td class="mono">${p.stock_qty} ${p.unit}</td>
      <td class="mono">${p.low_stock_threshold}</td>
      <td><span class="tag ${low?'warn':'ok'}">${low?'Stock bas':'OK'}</span></td>
    </tr>`;
  }).join("");
}
document.getElementById("btn-add-movement").onclick = async ()=>{
  const trackedProducts = products.filter(p=> p.track_stock);
  openModal(`
    <h3>Mouvement de stock</h3>
    <div class="field"><label>Produit</label>
      <select id="mv-product">${trackedProducts.map(p=> `<option value="${p.id}">${p.name} (stock: ${p.stock_qty})</option>`).join("")}</select>
    </div>
    <div class="field" style="margin-top:10px;"><label>Type</label>
      <select id="mv-type">
        <option value="entree">Entrée (réception)</option>
        <option value="sortie">Sortie manuelle</option>
        <option value="ajustement">Ajustement (= nouvelle valeur)</option>
        <option value="casse">Casse / perte</option>
      </select>
    </div>
    <div class="field" style="margin-top:10px;"><label>Quantité</label><input type="number" id="mv-qty" min="0" step="0.5" value="1"></div>
    <div class="field" style="margin-top:10px;"><label>Raison (optionnel)</label><input type="text" id="mv-reason" placeholder="ex: livraison fournisseur"></div>
    <div style="display:flex;gap:8px;margin-top:18px;">
      <button class="btn" onclick="submitStockMovement()">Valider</button>
      <button class="btn ghost" onclick="closeModal()">Annuler</button>
    </div>
  `);
};
async function submitStockMovement(){
  const productId = Number(document.getElementById("mv-product").value);
  const type = document.getElementById("mv-type").value;
  const qty = Number(document.getElementById("mv-qty").value);
  const reason = document.getElementById("mv-reason").value;
  if(!qty || qty < 0){ toast("Quantité invalide", true); return; }
  const prod = products.find(p=> p.id === productId);
  let newStock = prod.stock_qty;
  if(type === "entree") newStock += qty;
  else if(type === "sortie" || type === "casse") newStock = Math.max(0, newStock - qty);
  else if(type === "ajustement") newStock = qty;

  await sb.from("stock_movements").insert({ product_id:productId, type, qty, reason, employee_id:currentUser.id });
  await sb.from("products").update({ stock_qty:newStock }).eq("id", productId);
  toast("Stock mis à jour");
  closeModal();
  await loadProducts();
  loadStock();
}

/* ================================================================
   PRODUITS / CATÉGORIES (admin & gerant)
================================================================ */
async function loadProductsTable(){
  const { data, error } = await sb.from("products").select("*, categories(name)").order("name");
  if(error){ toast("Erreur produits", true); return; }
  const tbody = document.querySelector("#products-table tbody");
  if(data.length === 0){ tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Aucun produit. Crée ton premier produit.</td></tr>`; return; }
  tbody.innerHTML = data.map(p=> `
    <tr>
      <td style="font-size:18px;">${getProductIcon(p)}</td>
      <td>${p.name}</td>
      <td>${p.categories?p.categories.name:"—"}</td>
      <td class="mono">${money(p.price)}</td>
      <td class="mono">${money(p.cost)}</td>
      <td>${p.track_stock?"Oui":"Non"}</td>
      <td><span class="tag ${p.active?'ok':'muted'}">${p.active?'Actif':'Inactif'}</span></td>
      <td><button class="btn ghost sm" onclick="editProduct(${p.id})">Modifier</button></td>
    </tr>`).join("");
}
document.getElementById("btn-add-product").onclick = ()=> openProductForm(null);
async function editProduct(id){
  const { data } = await sb.from("products").select("*").eq("id", id).single();
  openProductForm(data);
}
function openProductForm(p){
  const isEdit = !!p;
  const currentIcon = p ? (p.icon || "") : "";
  openModal(`
    <h3>${isEdit?"Modifier":"Nouveau"} produit</h3>
    <div class="field"><label>Nom</label><input id="pf-name" value="${p?p.name:''}"></div>
    <div class="field" style="margin-top:10px;"><label>Icône ${currentIcon?'':'(automatique selon le nom)'}</label>
      <div id="icon-picker" class="icon-picker">${ICON_OPTIONS.map(ic=> `<button type="button" class="icon-opt ${currentIcon===ic?'selected':''}" data-icon="${ic}" onclick="selectIcon('${ic}')">${ic}</button>`).join("")}</div>
      <input type="hidden" id="pf-icon" value="${currentIcon}">
    </div>
    <div class="field" style="margin-top:10px;"><label>Catégorie</label>
      <select id="pf-cat">${categories.map(c=> `<option value="${c.id}" ${p&&p.category_id===c.id?'selected':''}>${c.name}</option>`).join("")}</select>
    </div>
    <div class="grid-row" style="margin-top:10px;">
      <div class="field" style="flex:1;"><label>Prix de vente (DH)</label><input type="number" id="pf-price" step="0.5" value="${p?p.price:''}"></div>
      <div class="field" style="flex:1;"><label>Coût matière (DH)</label><input type="number" id="pf-cost" step="0.5" value="${p?p.cost:0}"></div>
    </div>
    <div class="grid-row" style="margin-top:10px;align-items:center;">
      <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;"><input type="checkbox" id="pf-track" ${p&&p.track_stock?'checked':''}> Suivre le stock (optionnel)</label>
    </div>
    <div class="grid-row" style="margin-top:10px;">
      <div class="field" style="flex:1;"><label>Stock actuel</label><input type="number" id="pf-stock" step="0.5" value="${p?p.stock_qty:0}"></div>
      <div class="field" style="flex:1;"><label>Seuil stock bas</label><input type="number" id="pf-threshold" step="0.5" value="${p?p.low_stock_threshold:5}"></div>
    </div>
    <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;margin-top:10px;"><input type="checkbox" id="pf-active" ${!p||p.active?'checked':''}> Actif (visible en caisse)</label>
    <div style="display:flex;gap:8px;margin-top:18px;">
      <button class="btn" onclick="saveProduct(${p?p.id:'null'})">Enregistrer</button>
      ${isEdit?'<button class="btn danger" onclick="deactivateProduct('+p.id+')">Désactiver</button>':''}
      <button class="btn ghost" onclick="closeModal()">Annuler</button>
    </div>
  `);
}
function selectIcon(ic){
  document.getElementById("pf-icon").value = ic;
  document.querySelectorAll("#icon-picker .icon-opt").forEach(btn=> btn.classList.toggle("selected", btn.dataset.icon===ic));
}
async function saveProduct(id){
  const payload = {
    name: document.getElementById("pf-name").value.trim(),
    icon: document.getElementById("pf-icon").value || null,
    category_id: Number(document.getElementById("pf-cat").value),
    price: Number(document.getElementById("pf-price").value)||0,
    cost: Number(document.getElementById("pf-cost").value)||0,
    track_stock: document.getElementById("pf-track").checked,
    stock_qty: Number(document.getElementById("pf-stock").value)||0,
    low_stock_threshold: Number(document.getElementById("pf-threshold").value)||0,
    active: document.getElementById("pf-active").checked
  };
  if(!payload.name){ toast("Le nom est requis", true); return; }
  const { error } = id ? await sb.from("products").update(payload).eq("id", id) : await sb.from("products").insert(payload);
  if(error){ toast("Erreur enregistrement", true); return; }
  toast("Produit enregistré");
  closeModal();
  loadProductsTable();
  loadProducts();
}
async function deactivateProduct(id){
  if(!confirm("Désactiver ce produit ? Il n'apparaîtra plus en caisse.")) return;
  await sb.from("products").update({ active:false }).eq("id", id);
  toast("Produit désactivé");
  closeModal();
  loadProductsTable();
  loadProducts();
}
document.getElementById("btn-add-category").onclick = ()=>{
  openModal(`
    <h3>Nouvelle catégorie</h3>
    <div class="field"><label>Nom</label><input id="cf-name" placeholder="ex: Smoothies"></div>
    <div style="display:flex;gap:8px;margin-top:18px;">
      <button class="btn" onclick="saveCategory()">Créer</button>
      <button class="btn ghost" onclick="closeModal()">Annuler</button>
    </div>
  `);
};
async function saveCategory(){
  const name = document.getElementById("cf-name").value.trim();
  if(!name){ toast("Nom requis", true); return; }
  const { error } = await sb.from("categories").insert({ name, sort_order: categories.length+1 });
  if(error){ toast("Erreur création catégorie", true); return; }
  toast("Catégorie créée");
  closeModal();
  await loadCategories();
}

/* ================================================================
   EMPLOYÉS (admin & gerant)
================================================================ */
async function loadEmployeesTable(){
  const { data, error } = await sb.from("employees").select("*").order("name");
  if(error){ toast("Erreur équipe", true); return; }
  const tbody = document.querySelector("#employees-table tbody");
  tbody.innerHTML = data.map(e=> `
    <tr>
      <td>${e.name}</td>
      <td>${ROLE_LABELS[e.role]||e.role}</td>
      <td class="mono">${e.pin}</td>
      <td><span class="tag ${e.active?'ok':'muted'}">${e.active?'Actif':'Inactif'}</span></td>
      <td><button class="btn ghost sm" onclick="editEmployee(${e.id})">Modifier</button></td>
    </tr>`).join("");
}
document.getElementById("btn-add-employee").onclick = ()=> openEmployeeForm(null);
async function editEmployee(id){
  const { data } = await sb.from("employees").select("*").eq("id", id).single();
  openEmployeeForm(data);
}
function openEmployeeForm(e){
  const isEdit = !!e;
  openModal(`
    <h3>${isEdit?"Modifier":"Nouveau"} serveur</h3>
    <div class="field"><label>Nom</label><input id="ef-name" value="${e?e.name:''}"></div>
    <div class="field" style="margin-top:10px;"><label>Rôle</label>
      <select id="ef-role">
        ${Object.entries(ROLE_LABELS).map(([k,v])=> `<option value="${k}" ${e&&e.role===k?'selected':''}>${v}</option>`).join("")}
      </select>
    </div>
    <div class="field" style="margin-top:10px;"><label>Code PIN (4 chiffres)</label><input id="ef-pin" maxlength="4" value="${e?e.pin:''}"></div>
    <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;margin-top:10px;"><input type="checkbox" id="ef-active" ${!e||e.active?'checked':''}> Actif</label>
    <div style="display:flex;gap:8px;margin-top:18px;">
      <button class="btn" onclick="saveEmployee(${e?e.id:'null'})">Enregistrer</button>
      <button class="btn ghost" onclick="closeModal()">Annuler</button>
    </div>
  `);
}
async function saveEmployee(id){
  const payload = {
    name: document.getElementById("ef-name").value.trim(),
    role: document.getElementById("ef-role").value,
    pin: document.getElementById("ef-pin").value.trim(),
    active: document.getElementById("ef-active").checked
  };
  if(!payload.name || payload.pin.length !== 4){ toast("Nom et PIN (4 chiffres) requis", true); return; }
  const { error } = id ? await sb.from("employees").update(payload).eq("id", id) : await sb.from("employees").insert(payload);
  if(error){ toast("Erreur enregistrement", true); return; }
  toast("Serveur enregistré");
  closeModal();
  loadEmployeesTable();
}

/* ================================================================
   DASHBOARD
================================================================ */
async function loadDashboard(){
  const startToday = new Date(); startToday.setHours(0,0,0,0);
  const { data: todayTickets } = await sb.from("tickets").select("total").eq("status","payé").gte("created_at", startToday.toISOString());
  const todayRev = (todayTickets||[]).reduce((s,t)=> s+Number(t.total), 0);
  document.getElementById("kpi-today-rev").textContent = money(todayRev);
  document.getElementById("kpi-today-count").textContent = (todayTickets||[]).length;
  document.getElementById("kpi-avg-ticket").textContent = money(todayTickets&&todayTickets.length ? todayRev/todayTickets.length : 0);

  const { data: lowStockProducts } = await sb.from("products").select("id").eq("track_stock",true).eq("active",true);
  const { data: allTrackedProducts } = await sb.from("products").select("stock_qty, low_stock_threshold").eq("track_stock",true).eq("active",true);
  const lowCount = (allTrackedProducts||[]).filter(p=> p.stock_qty <= p.low_stock_threshold).length;
  document.getElementById("kpi-low-stock").textContent = lowCount;

  // 7 derniers jours
  const start7 = new Date(); start7.setDate(start7.getDate()-6); start7.setHours(0,0,0,0);
  const { data: week } = await sb.from("tickets").select("total, created_at").eq("status","payé").gte("created_at", start7.toISOString());
  const days = [];
  for(let i=6;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); days.push(d); }
  const revByDay = days.map(d=> {
    const sum = (week||[]).filter(t=> todayStr(new Date(t.created_at)) === todayStr(d)).reduce((s,t)=> s+Number(t.total),0);
    return { label: fmtDateShort(d), value: sum };
  });
  const maxRev = Math.max(...revByDay.map(r=>r.value), 1);
  document.getElementById("chart-revenue").innerHTML = revByDay.map(r=> `
    <div class="bar-col">
      <div class="bar-val">${r.value>0?Math.round(r.value):''}</div>
      <div class="bar" style="height:${Math.max(4,(r.value/maxRev)*120)}px;"></div>
      <div class="bar-lbl">${r.label}</div>
    </div>`).join("");

  // 30 derniers jours — items pour top produits / catégories / employés
  const start30 = new Date(); start30.setDate(start30.getDate()-29); start30.setHours(0,0,0,0);
  const { data: tickets30 } = await sb.from("tickets").select("id, employee_id, employees(name)").eq("status","payé").gte("created_at", start30.toISOString());
  const ticketIds = (tickets30||[]).map(t=>t.id);
  let items30 = [];
  if(ticketIds.length){
    const { data } = await sb.from("ticket_items").select("product_id, product_name, qty, subtotal, ticket_id").in("ticket_id", ticketIds.slice(0,500));
    items30 = data||[];
  }
  // top produits
  const byProduct = {};
  items30.forEach(it=>{ byProduct[it.product_name] = (byProduct[it.product_name]||0) + Number(it.qty); });
  const topProducts = Object.entries(byProduct).sort((a,b)=>b[1]-a[1]).slice(0,6);
  document.getElementById("top-products").innerHTML = topProducts.length ? topProducts.map(([name,qty])=> `
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line);font-size:13.5px;">
      <span>${name}</span><span class="mono" style="color:var(--caramel);">${qty}</span>
    </div>`).join("") : `<div class="empty-state">Pas encore de ventes.</div>`;

  // ventes par catégorie — besoin de mapper product_id -> categorie et section
  const prodCatMap = {};
  const prodSectionMap = {};
  const TERRASSE_CATS = ["tacos","crêpes","crepes","glaces","desserts","boissons fresh","matcha"];
  products.forEach(p=> {
    const catName = categories.find(c=>c.id===p.category_id)?.name || "Autre";
    prodCatMap[p.id] = catName;
    const catLower = catName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    prodSectionMap[p.id] = TERRASSE_CATS.some(t=> catLower.includes(t)) ? "🏖️ Terrasse" : "☕ Café";
  });

  // section breakdown Café / Terrasse
  const bySection = { "☕ Café": 0, "🏖️ Terrasse": 0 };
  items30.forEach(it=>{ const sec = prodSectionMap[it.product_id] || "☕ Café"; bySection[sec] = (bySection[sec]||0) + Number(it.subtotal); });
  const totalSec = Object.values(bySection).reduce((a,b)=>a+b,0) || 1;
  document.getElementById("section-breakdown").innerHTML = Object.entries(bySection).map(([name,total])=> {
    const pct = Math.round((total/totalSec)*100);
    return `<div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:5px;"><span>${name}</span><span class="mono" style="color:var(--caramel);">${money(total)} (${pct}%)</span></div>
      <div style="background:var(--roast-2);border-radius:4px;height:8px;"><div style="background:var(--copper);height:8px;border-radius:4px;width:${pct}%;"></div></div>
    </div>`;
  }).join("");

  const byCat = {};
  items30.forEach(it=>{ const cat = prodCatMap[it.product_id] || "Autre"; byCat[cat] = (byCat[cat]||0) + Number(it.subtotal); });
  const catEntries = Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  document.getElementById("cat-breakdown").innerHTML = catEntries.length ? catEntries.map(([name,total])=> `
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line);font-size:13.5px;">
      <span>${name}</span><span class="mono" style="color:var(--caramel);">${money(total)}</span>
    </div>`).join("") : `<div class="empty-state">Pas encore de ventes.</div>`;

  // ventes par employé
  const ticketEmpMap = {};
  (tickets30||[]).forEach(t=> ticketEmpMap[t.id] = t.employees?t.employees.name:"—");
  const byEmp = {};
  items30.forEach(it=>{ const emp = ticketEmpMap[it.ticket_id] || "—"; byEmp[emp] = (byEmp[emp]||0) + Number(it.subtotal); });
  const empEntries = Object.entries(byEmp).sort((a,b)=>b[1]-a[1]);
  document.getElementById("emp-breakdown").innerHTML = empEntries.length ? empEntries.map(([name,total])=> `
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line);font-size:13.5px;">
      <span>${name}</span><span class="mono" style="color:var(--caramel);">${money(total)}</span>
    </div>`).join("") : `<div class="empty-state">Pas encore de ventes.</div>`;
}

/* ================================================================
   INIT
================================================================ */
(function init(){
  buildPinKeys();
  tickClock();
  document.getElementById("receipt-wifi").textContent = "📶 Wifi : " + WIFI_CODE;
  document.getElementById("tk-from").value = todayStr();
  document.getElementById("tk-to").value = todayStr();
  loadEmployeesForLogin();

  const saved = localStorage.getItem("cafe_pos_user");
  if(saved){
    try{ currentUser = JSON.parse(saved); enterApp(); } catch(e){}
  }
})();
