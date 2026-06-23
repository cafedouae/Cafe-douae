/* ================================================================
   ÉTAT GLOBAL
================================================================ */
let currentUser = null;
let pinBuffer = "";
let selectedProfile = null;
let categories = [];
let products = [];
let cart = [];
let activeCat = "all";
let activeSection = "all"; // all / cafe / terrasse

const ROLES = { admin:"Admin", gerant:"Gérant", serveur:"Serveur" };
const MGR = ["admin","gerant"];
let totalsUnlocked = false; // serveurs must enter code to see ticket totals
const TERRASSE_CATS = ["tacos","crêpes","crepes","glaces","desserts","boissons fresh","matcha club","matcha"];

function stripA(s){ return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,""); }
function isTerrasseCat(name){ const n = stripA(name).toLowerCase(); return TERRASSE_CATS.some(t=>n.includes(stripA(t))); }
function catSection(catId){ const c = categories.find(x=>x.id===catId); return c&&isTerrasseCat(c.name)?"terrasse":"cafe"; }

/* ================================================================
   HELPERS
================================================================ */
function dh(n){ return (Number(n)||0).toFixed(2).replace(".",","+" DH"); }
function pad(n){ return String(n).padStart(2,"0"); }
function todayStr(d=new Date()){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function fmtTime(iso){ const d=new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtDate(iso){ const d=new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth()+1)}`; }
function getShift(iso){ const h=new Date(iso).getHours(); return h>=14?"🌆 Soir":"🌅 Matin"; }

function toast(msg, err=false){
  const t=document.getElementById("toast");
  t.textContent=msg; t.className="toast"+(err?" error":"");
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.add("hidden"),2800);
}
function openModal(html){
  document.getElementById("modal-inner").innerHTML=html;
  document.getElementById("modal-bg").classList.add("active");
}
function closeModal(){
  document.getElementById("modal-bg").classList.remove("active");
  document.getElementById("modal-inner").innerHTML="";
}
document.getElementById("modal-bg").addEventListener("click",e=>{ if(e.target.id==="modal-bg") closeModal(); });

/* clock */
function tickClock(){
  const d=new Date();
  document.getElementById("clock").textContent=`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
setInterval(tickClock,1000);

/* ================================================================
   ICONS
================================================================ */
const ICON_MAP = [
  [["cappuccino","macchiato","latte","café au lait","creme"],"🥛"],
  [["express","espresso","americano","ristretto","café","cafe"],"☕"],
  [["thé","the","infusion","tisane"],"🍵"],
  [["matcha"],"🍵"],
  [["smoothie","milkshake"],"🧋"],
  [["jus"],"🧃"],
  [["soda","coca","cola","sprite","limonade","boisson","peach","lemon","broud","broad"],"🥤"],
  [["eau"],"💧"],
  [["chocolat chaud"],"☕"],
  [["croissant"],"🥐"],
  [["sandwich","panini","club"],"🥪"],
  [["tacos"],"🌮"],
  [["crepe","crêpe"],"🥞"],
  [["beignet","donut"],"🍩"],
  [["gateau","gâteau","cake","cheesecake"],"🍰"],
  [["muffin","cupcake"],"🧁"],
  [["cookie","biscuit","brownie"],"🍪"],
  [["tarte"],"🥧"],
  [["glace","sorbet","boule"],"🍨"],
  [["salade"],"🥗"],
  [["pizza"],"🍕"],
  [["burger"],"🍔"],
];
const ICON_OPTS = ["☕","🥛","🍵","🧃","🧋","🥤","💧","🥐","🥪","🌮","🥞","🍩","🍰","🧁","🍪","🥧","🍨","🍦","🍕","🍔","🍽️","🫖","🥗","🍓","🍫","🍯","🍪","🧇","🥚","🥩","🌯","🫙"];
function getIcon(p){
  if(p.icon) return p.icon;
  const n = stripA(p.name||"").toLowerCase();
  for(const [kws,ic] of ICON_MAP){ if(kws.some(k=>n.includes(stripA(k)))) return ic; }
  const cn = stripA(categories.find(c=>c.id===p.category_id)?.name||"").toLowerCase();
  if(cn.includes("cafe")||cn.includes("boisson")&&!cn.includes("fresh")) return "☕";
  if(cn.includes("fresh")||cn.includes("boisson")) return "🥤";
  if(cn.includes("the")||cn.includes("matcha")) return "🍵";
  if(cn.includes("tacos")) return "🌮";
  if(cn.includes("crepe")) return "🥞";
  if(cn.includes("glace")) return "🍨";
  if(cn.includes("dessert")) return "🍰";
  if(cn.includes("patiss")) return "🥐";
  return "🍽️";
}

/* ================================================================
   LOGIN
================================================================ */
async function loadProfiles(){
  const {data,error}=await sb.from("employees").select("*").eq("active",true).order("name");
  if(error){ document.getElementById("profiles-grid").innerHTML=`<div class="empty">Erreur chargement. Vérifie Supabase.</div>`; return; }
  const grid=document.getElementById("profiles-grid");
  grid.innerHTML="";
  (data||[]).forEach(e=>{
    const card=document.createElement("button");
    card.className="profile-card";
    card.innerHTML=`<div class="av">${e.name.charAt(0).toUpperCase()}</div>
      <div class="pname">${e.name}</div>
      <div class="prole">${ROLES[e.role]||e.role}</div>`;
    card.onclick=()=>startPin(e);
    grid.appendChild(card);
  });
  if(!data||data.length===0) grid.innerHTML=`<div class="empty">Aucun profil trouvé.</div>`;
}
function startPin(emp){
  selectedProfile=emp;
  pinBuffer="";
  document.getElementById("pin-who-name").textContent=emp.name;
  document.getElementById("pin-err").textContent="";
  document.getElementById("profiles-grid").style.display="none";
  document.getElementById("pin-screen").classList.add("active");
  updateDots();
}
document.getElementById("pin-back").onclick=()=>{
  document.getElementById("pin-screen").classList.remove("active");
  document.getElementById("profiles-grid").style.display="flex";
};
function updateDots(){
  document.querySelectorAll(".pin-dot").forEach((d,i)=>d.classList.toggle("filled",i<pinBuffer.length));
}
function buildPinPad(){
  const keys=["1","2","3","4","5","6","7","8","9","⌫","0","✓"];
  const wrap=document.getElementById("pin-keys");
  wrap.innerHTML="";
  keys.forEach(k=>{
    const b=document.createElement("button");
    b.className="pin-key"; b.textContent=k;
    b.onclick=()=>handlePin(k);
    wrap.appendChild(b);
  });
}
function handlePin(k){
  if(k==="⌫"){ pinBuffer=pinBuffer.slice(0,-1); updateDots(); return; }
  if(k==="✓"){ tryLogin(); return; }
  if(pinBuffer.length<4){ pinBuffer+=k; updateDots(); }
  if(pinBuffer.length===4) setTimeout(tryLogin,100);
}
function tryLogin(){
  if(!selectedProfile) return;
  if(pinBuffer===selectedProfile.pin){
    currentUser={id:selectedProfile.id,name:selectedProfile.name,role:selectedProfile.role};
    localStorage.setItem("cdouae_user",JSON.stringify(currentUser));
    enterApp();
  } else {
    document.getElementById("pin-err").textContent="Code incorrect ✕";
    pinBuffer=""; updateDots();
  }
}
document.getElementById("btn-logout").onclick=logout;
function logout(){
  currentUser=null; cart=[]; totalsUnlocked=false;
  localStorage.removeItem("cdouae_user");
  document.getElementById("app").classList.remove("active");
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("pin-screen").classList.remove("active");
  document.getElementById("profiles-grid").style.display="flex";
  loadProfiles();
}

function enterApp(){
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app").classList.add("active");
  document.getElementById("who-name").textContent=currentUser.name;
  document.getElementById("who-role").textContent=`· ${ROLES[currentUser.role]||""}`;
  document.getElementById("rcp-wifi").textContent=`📶 Wifi : ${WIFI}`;
  applyRoles();
  switchView("caisse");
  loadCategories();
  loadProducts();
}
function applyRoles(){
  const full=MGR.includes(currentUser.role);
  document.querySelectorAll(".mgr-only").forEach(el=>el.style.display=full?"":"none");
}

/* ================================================================
   NAVIGATION
================================================================ */
const VIEW_TITLES={caisse:"Caisse",tickets:"Tickets",stock:"Stock",produits:"Menu & Produits",serveurs:"Serveurs",dashboard:"Statistiques"};
document.querySelectorAll("[data-view]").forEach(btn=>{
  btn.addEventListener("click",()=>switchView(btn.dataset.view));
});
function switchView(v){
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===v));
  document.querySelectorAll(".mn-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===v));
  document.querySelectorAll(".view").forEach(el=>el.classList.toggle("active",el.id==="view-"+v));
  document.getElementById("view-title").textContent=VIEW_TITLES[v]||v;
  if(v==="tickets") loadTickets();
  if(v==="stock") loadStock();
  if(v==="produits") loadProdTable();
  if(v==="serveurs") loadSrvTable();
  if(v==="dashboard") loadDashboard();
}

/* ================================================================
   CAISSE
================================================================ */
async function loadCategories(){
  const {data}=await sb.from("categories").select("*").order("sort_order");
  categories=data||[];
  renderSectionTabs();
  renderCatTabs();
}
async function loadProducts(){
  const {data}=await sb.from("products").select("*").eq("active",true).order("name");
  products=data||[];
  renderProductGrid();
}

/* Section tabs */
document.querySelectorAll(".section-tab").forEach(btn=>{
  btn.addEventListener("click",()=>{
    activeSection=btn.dataset.sec;
    activeCat="all";
    document.querySelectorAll(".section-tab").forEach(b=>b.classList.toggle("active",b.dataset.sec===activeSection));
    renderCatTabs();
    renderProductGrid();
  });
});
function renderSectionTabs(){}

function renderCatTabs(){
  const wrap=document.getElementById("cat-tabs");
  wrap.innerHTML="";
  // filter cats by section
  let visibleCats = categories;
  if(activeSection==="cafe") visibleCats=categories.filter(c=>!isTerrasseCat(c.name));
  if(activeSection==="terrasse") visibleCats=categories.filter(c=>isTerrasseCat(c.name));

  const allBtn=document.createElement("button");
  allBtn.className="cat-tab"+(activeCat==="all"?" active":"");
  allBtn.textContent="Tout";
  allBtn.onclick=()=>{ activeCat="all"; renderCatTabs(); renderProductGrid(); };
  wrap.appendChild(allBtn);

  visibleCats.forEach(c=>{
    const b=document.createElement("button");
    b.className="cat-tab"+(activeCat===c.id?" active":"");
    b.textContent=c.name;
    b.onclick=()=>{ activeCat=c.id; renderCatTabs(); renderProductGrid(); };
    wrap.appendChild(b);
  });
}

function renderProductGrid(){
  const grid=document.getElementById("product-grid");
  let list=products;
  // section filter
  if(activeSection==="cafe") list=list.filter(p=>catSection(p.category_id)==="cafe");
  if(activeSection==="terrasse") list=list.filter(p=>catSection(p.category_id)==="terrasse");
  // category filter
  if(activeCat!=="all") list=list.filter(p=>p.category_id===activeCat);

  if(!list.length){ grid.innerHTML=`<div class="empty">Aucun produit dans cette section.</div>`; return; }
  grid.innerHTML="";
  list.forEach(p=>{
    const out=p.track_stock&&p.stock_qty<=0;
    const low=p.track_stock&&p.stock_qty<=p.low_stock_threshold&&!out;
    const card=document.createElement("button");
    card.className="prod-card";
    card.disabled=out;
    card.innerHTML=`${low?'<div class="low-dot"></div>':''}
      <div class="pico">${getIcon(p)}</div>
      <div class="pnm">${p.name}</div>
      <div class="ppr">${dh(p.price)}</div>`;
    card.onclick=()=>addToCart(p);
    grid.appendChild(card);
  });
}

/* ================================================================
   CART
================================================================ */
function addToCart(p){
  if(p.track_stock&&p.stock_qty<=0){ toast("Stock épuisé",true); return; }
  const ex=cart.find(c=>c.pid===p.id);
  if(ex){
    if(p.track_stock&&ex.qty+1>p.stock_qty){ toast("Stock insuffisant",true); return; }
    ex.qty++;
  } else {
    cart.push({pid:p.id,name:p.name,price:p.price,qty:1,track:p.track_stock,stock:p.stock_qty,icon:getIcon(p)});
  }
  renderCart();
}
function changeQty(pid,d){
  const item=cart.find(c=>c.pid===pid);
  if(!item) return;
  const nq=item.qty+d;
  if(nq<=0){ cart=cart.filter(c=>c.pid!==pid); }
  else {
    const prod=products.find(p=>p.id===pid);
    if(prod&&prod.track_stock&&nq>prod.stock_qty){ toast("Stock insuffisant",true); return; }
    item.qty=nq;
  }
  renderCart();
}
document.getElementById("btn-clear").onclick=()=>{ cart=[]; renderCart(); };
document.getElementById("inp-discount").addEventListener("input",renderCart);

function cartSub(){ return cart.reduce((s,c)=>s+c.price*c.qty,0); }
function renderCart(){
  const wrap=document.getElementById("rcp-items");
  const now=new Date();
  document.getElementById("rcp-meta").textContent=`${currentUser?.name||""} — ${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  if(!cart.length){ wrap.innerHTML=`<div class="empty">Ticket vide</div>`; }
  else {
    wrap.innerHTML=cart.map(c=>`
      <div class="rcp-line">
        <span style="font-size:15px;margin-right:4px;">${c.icon}</span>
        <span class="rl-name">${c.name}</span>
        <span class="rl-qty">
          <button class="ql-btn" onclick="changeQty(${c.pid},-1)">−</button>
          <span style="min-width:16px;text-align:center;font-size:13px;">${c.qty}</span>
          <button class="ql-btn" onclick="changeQty(${c.pid},1)">+</button>
        </span>
        <span class="rcp-price">${dh(c.price*c.qty)}</span>
        <button class="rm-btn" onclick="changeQty(${c.pid},-${c.qty})">✕</button>
      </div>`).join("");
  }
  const sub=cartSub();
  const disc=Math.min(Number(document.getElementById("inp-discount").value)||0,sub);
  document.getElementById("rt-sub").textContent=dh(sub);
  document.getElementById("rt-disc").textContent="−"+dh(disc);
  document.getElementById("rt-tot").textContent=dh(sub-disc);
}

/* ================================================================
   ENCAISSEMENT
================================================================ */
async function nextTkNum(){
  const ds=todayStr().replace(/-/g,"");
  const s=new Date(); s.setHours(0,0,0,0);
  const {count}=await sb.from("tickets").select("*",{count:"exact",head:true}).gte("created_at",s.toISOString());
  return `T${ds}-${pad((count||0)+1)}`;
}

document.getElementById("btn-checkout").onclick=async()=>{
  if(!cart.length){ toast("Ticket vide",true); return; }
  const btn=document.getElementById("btn-checkout");
  btn.disabled=true;
  try{
    const sub=cartSub();
    const disc=Math.min(Number(document.getElementById("inp-discount").value)||0,sub);
    const total=sub-disc;
    const pay=document.getElementById("inp-payment").value;
    const tnum=await nextTkNum();
    const {data:tk,error:e1}=await sb.from("tickets").insert({
      ticket_number:tnum,employee_id:currentUser.id,status:"payé",
      payment_method:pay,subtotal:sub,discount:disc,total
    }).select().single();
    if(e1) throw e1;
    await sb.from("ticket_items").insert(cart.map(c=>({
      ticket_id:tk.id,product_id:c.pid,product_name:c.name,
      unit_price:c.price,qty:c.qty,subtotal:c.price*c.qty
    })));
    for(const c of cart){
      if(c.track){
        const prod=products.find(p=>p.id===c.pid);
        const ns=Math.max(0,(prod?.stock_qty||0)-c.qty);
        await sb.from("products").update({stock_qty:ns}).eq("id",c.pid);
        await sb.from("stock_movements").insert({product_id:c.pid,type:"sortie",qty:c.qty,reason:"Vente "+tnum,employee_id:currentUser.id});
      }
    }
    printReceipt(tk,[...cart],sub,disc,total,pay);
    toast(`✓ ${tnum} — ${dh(total)}`);
    cart=[];
    document.getElementById("inp-discount").value="";
    renderCart();
    await loadProducts();
  }catch(err){ console.error(err); toast("Erreur encaissement",true); }
  finally{ btn.disabled=false; }
};

function printReceipt(tk,items,sub,disc,total,pay){
  const d=new Date(tk.created_at||Date.now());
  document.getElementById("print-area").innerHTML=`
    <div style="text-align:center;margin-bottom:8px;">
      <div style="font-size:18px;font-weight:700;">${SHOP}</div>
      <div>${tk.ticket_number}</div>
      <div>Servi par : ${currentUser.name}</div>
      <div>${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} — ${pad(d.getHours())}:${pad(d.getMinutes())}</div>
    </div>
    <hr>
    ${items.map(i=>`<div style="display:flex;justify-content:space-between;padding:3px 0;"><span>${i.qty}x ${i.name}</span><span>${dh(i.price*i.qty)}</span></div>`).join("")}
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
   TICKETS
================================================================ */
async function loadTickets(){
  const from=document.getElementById("tk-from").value;
  const to=document.getElementById("tk-to").value;
  let q=sb.from("tickets").select("*,employees(name)").order("created_at",{ascending:false}).limit(300);
  if(from) q=q.gte("created_at",from+"T00:00:00");
  if(to)   q=q.lte("created_at",to+"T23:59:59");
  const {data}=await q;

  // Update totals column header
  const canSeeTotal = MGR.includes(currentUser.role) || totalsUnlocked;
  const th = document.getElementById("th-total");
  if(th){
    if(MGR.includes(currentUser.role)){
      th.innerHTML="Total";
    } else if(totalsUnlocked){
      th.innerHTML=`Total <button onclick="lockTotals()" style="font-size:10px;background:var(--rose);color:#fff;border:none;border-radius:4px;padding:2px 6px;cursor:pointer;margin-left:4px;">🔒 Verrouiller</button>`;
    } else {
      th.innerHTML=`Total <button onclick="askUnlockTotals()" style="font-size:10px;background:var(--copper);color:#fff;border:none;border-radius:4px;padding:2px 6px;cursor:pointer;margin-left:4px;">🔑 Voir</button>`;
    }
  }

  const tbody=document.querySelector("#tickets-table tbody");
  if(!data||!data.length){ tbody.innerHTML=`<tr><td colspan="7" class="empty">Aucun ticket.</td></tr>`; return; }
  tbody.innerHTML=data.map(t=>`
    <tr>
      <td class="mono" style="font-size:12px;">${t.ticket_number}</td>
      <td>${fmtTime(t.created_at)}</td>
      <td>${t.employees?.name||"—"}</td>
      <td class="mono">${canSeeTotal ? dh(t.total) : '<span style="color:var(--text3);letter-spacing:.1em;">••••</span>'}</td>
      <td>${t.payment_method||"—"}</td>
      <td><span class="tag ${t.status==='payé'?'tag-ok':t.status==='annulé'?'tag-warn':'tag-muted'}">${t.status}</span></td>
      <td><button class="btn btn-ghost btn-sm" onclick="viewTicket(${t.id})">Voir</button></td>
    </tr>`).join("");
}

function askUnlockTotals(){
  openModal(`
    <h3>🔑 Accès aux totaux</h3>
    <p style="color:var(--text2);font-size:13.5px;margin-top:-6px;">Entrez le code d'un gérant ou admin pour révéler les totaux.</p>
    <div class="field"><label>Code PIN</label><input type="password" id="unlock-pin" maxlength="4" inputmode="numeric" autofocus></div>
    <div id="unlock-err" style="color:var(--rose);font-size:13px;min-height:16px;margin-top:4px;"></div>
    <div class="row" style="margin-top:14px;">
      <button class="btn btn-primary" onclick="confirmUnlockTotals()">Confirmer</button>
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    </div>`);
  setTimeout(()=>document.getElementById("unlock-pin")?.focus(),100);
}
async function confirmUnlockTotals(){
  const pin=document.getElementById("unlock-pin").value.trim();
  const {data:approver}=await sb.from("employees").select("*").eq("pin",pin).eq("active",true).in("role",["admin","gerant"]).maybeSingle();
  if(!approver){ document.getElementById("unlock-err").textContent="Code invalide ou non autorisé."; return; }
  totalsUnlocked=true;
  toast(`Totaux déverrouillés — ${approver.name}`);
  closeModal();
  loadTickets();
}
function lockTotals(){
  totalsUnlocked=false;
  loadTickets();
}
document.getElementById("tk-filter").onclick=loadTickets;
document.getElementById("tk-today").onclick=()=>{
  document.getElementById("tk-from").value=todayStr();
  document.getElementById("tk-to").value=todayStr();
  loadTickets();
};

async function viewTicket(id){
  const {data:tk}=await sb.from("tickets").select("*,employees(name)").eq("id",id).single();
  const {data:items}=await sb.from("ticket_items").select("*").eq("ticket_id",id);
  const canSeeTotal = MGR.includes(currentUser.role) || totalsUnlocked;
  openModal(`
    <h3>${tk.ticket_number}</h3>
    <div style="color:var(--text2);font-size:13px;margin-bottom:12px;">${fmtTime(tk.created_at)} · ${tk.employees?.name||"—"} · ${tk.payment_method||""}</div>
    <table>${(items||[]).map(i=>`<tr><td>${i.qty} × ${i.product_name}</td><td style="text-align:right;">${canSeeTotal?dh(i.subtotal):'••••'}</td></tr>`).join("")}</table>
    <div class="sep"></div>
    <div style="display:flex;justify-content:space-between;font-weight:700;font-size:16px;"><span>Total</span><span>${canSeeTotal?dh(tk.total):'<span style="color:var(--text3)">🔒 Code requis</span>'}</span></div>
    ${tk.status==="payé"?`
    <div class="sep"></div>
    <div style="font-size:13px;color:var(--text2);margin-bottom:8px;">Annulation réservée au gérant / admin — entrez votre code :</div>
    <div class="field"><label>Code PIN</label><input type="password" id="void-pin" maxlength="4" inputmode="numeric"></div>
    <div id="void-err" style="color:var(--rose);font-size:13px;min-height:16px;margin-top:4px;"></div>
    <div class="row" style="margin-top:14px;">
      <button class="btn btn-danger" onclick="confirmVoid(${tk.id})">Annuler le ticket</button>
      <button class="btn btn-ghost" onclick="closeModal()">Fermer</button>
    </div>` : `<div class="row" style="margin-top:14px;"><button class="btn btn-ghost" onclick="closeModal()">Fermer</button></div>`}
  `);
}

async function confirmVoid(id){
  const pin=document.getElementById("void-pin").value.trim();
  const {data:approver}=await sb.from("employees").select("*").eq("pin",pin).eq("active",true).in("role",["admin","gerant"]).maybeSingle();
  if(!approver){ document.getElementById("void-err").textContent="Code invalide ou non autorisé."; return; }
  const {data:items}=await sb.from("ticket_items").select("*").eq("ticket_id",id);
  for(const it of items||[]){
    const {data:p}=await sb.from("products").select("*").eq("id",it.product_id).single();
    if(p&&p.track_stock){
      await sb.from("products").update({stock_qty:p.stock_qty+it.qty}).eq("id",p.id);
      await sb.from("stock_movements").insert({product_id:p.id,type:"entree",qty:it.qty,reason:`Annulation — ${approver.name}`,employee_id:approver.id});
    }
  }
  await sb.from("tickets").update({status:"annulé",note:`Annulé par ${approver.name}`}).eq("id",id);
  toast(`Ticket annulé (autorisé par ${approver.name})`);
  closeModal(); loadTickets(); loadProducts();
}

/* ================================================================
   STOCK
================================================================ */
async function loadStock(){
  const {data}=await sb.from("products").select("*,categories(name)").eq("track_stock",true).order("name");
  const tbody=document.querySelector("#stock-table tbody");
  if(!data||!data.length){ tbody.innerHTML=`<tr><td colspan="5" class="empty">Aucun produit suivi.</td></tr>`; return; }
  tbody.innerHTML=data.map(p=>`
    <tr>
      <td>${getIcon(p)} ${p.name}</td>
      <td>${p.categories?.name||"—"}</td>
      <td class="mono">${p.stock_qty}</td>
      <td class="mono">${p.low_stock_threshold}</td>
      <td><span class="tag ${p.stock_qty<=p.low_stock_threshold?'tag-warn':'tag-ok'}">${p.stock_qty<=p.low_stock_threshold?'Bas':'OK'}</span></td>
    </tr>`).join("");
}
document.getElementById("btn-add-mvt").onclick=()=>{
  const tp=products.filter(p=>p.track_stock);
  openModal(`
    <h3>Mouvement de stock</h3>
    <div class="field"><label>Produit</label><select id="mv-p">${tp.map(p=>`<option value="${p.id}">${p.name} (${p.stock_qty})</option>`).join("")}</select></div>
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
async function saveMvt(){
  const pid=Number(document.getElementById("mv-p").value);
  const type=document.getElementById("mv-t").value;
  const qty=Number(document.getElementById("mv-q").value);
  const reason=document.getElementById("mv-r").value;
  if(!qty||qty<0){ toast("Quantité invalide",true); return; }
  const prod=products.find(p=>p.id===pid);
  let ns=prod.stock_qty;
  if(type==="entree") ns+=qty;
  else if(type==="sortie"||type==="casse") ns=Math.max(0,ns-qty);
  else ns=qty;
  await sb.from("stock_movements").insert({product_id:pid,type,qty,reason,employee_id:currentUser.id});
  await sb.from("products").update({stock_qty:ns}).eq("id",pid);
  toast("Stock mis à jour"); closeModal(); await loadProducts(); loadStock();
}

/* ================================================================
   PRODUITS / MENU
================================================================ */
async function loadProdTable(){
  const {data}=await sb.from("products").select("*,categories(name)").order("name");
  const tbody=document.querySelector("#prod-table tbody");
  if(!data||!data.length){ tbody.innerHTML=`<tr><td colspan="6" class="empty">Aucun produit.</td></tr>`; return; }
  tbody.innerHTML=data.map(p=>`
    <tr>
      <td style="font-size:18px;">${getIcon(p)}</td>
      <td>${p.name}</td>
      <td>${p.categories?.name||"—"}</td>
      <td class="mono">${dh(p.price)}</td>
      <td><span class="tag ${p.active?'tag-ok':'tag-muted'}">${p.active?'Actif':'Inactif'}</span></td>
      <td><button class="btn btn-ghost btn-sm" onclick="editProd(${p.id})">Modifier</button></td>
    </tr>`).join("");
}
document.getElementById("btn-add-prod").onclick=()=>openProdForm(null);
async function editProd(id){
  const {data}=await sb.from("products").select("*").eq("id",id).single();
  openProdForm(data);
}
function openProdForm(p){
  openModal(`
    <h3>${p?"Modifier":"Nouveau"} produit</h3>
    <div class="field"><label>Nom</label><input id="pf-name" value="${p?.name||''}"></div>
    <div class="field" style="margin-top:10px;"><label>Icône (optionnel — auto si vide)</label>
      <div id="icon-picker" style="display:flex;flex-wrap:wrap;gap:5px;padding:8px;background:var(--bg);border-radius:var(--r);max-height:120px;overflow:auto;">
        ${ICON_OPTS.map(ic=>`<button type="button" onclick="pickIcon('${ic}')" style="width:34px;height:34px;font-size:18px;border-radius:7px;background:var(--surface);border:1.5px solid ${(p?.icon||"")==ic?'var(--copper)':'var(--border)'};cursor:pointer;touch-action:manipulation;">${ic}</button>`).join("")}
      </div>
      <input type="hidden" id="pf-icon" value="${p?.icon||''}">
    </div>
    <div class="field" style="margin-top:10px;"><label>Catégorie</label>
      <select id="pf-cat">${categories.map(c=>`<option value="${c.id}" ${p?.category_id===c.id?'selected':''}>${c.name}</option>`).join("")}</select>
    </div>
    <div class="row" style="margin-top:10px;">
      <div class="field" style="flex:1;"><label>Prix (DH)</label><input type="number" id="pf-price" step="0.5" value="${p?.price||''}"></div>
      <div class="field" style="flex:1;"><label>Coût (DH)</label><input type="number" id="pf-cost" step="0.5" value="${p?.cost||0}"></div>
    </div>
    <label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13.5px;cursor:pointer;">
      <input type="checkbox" id="pf-active" ${(!p||p.active)?'checked':''}> Actif (visible en caisse)
    </label>
    <div class="row" style="margin-top:16px;">
      <button class="btn btn-primary" onclick="saveProd(${p?.id||'null'})">Enregistrer</button>
      ${p?`<button class="btn btn-danger" onclick="deactivateProd(${p.id})">Désactiver</button>`:''}
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    </div>`);
}
function pickIcon(ic){
  document.getElementById("pf-icon").value=ic;
  document.querySelectorAll("#icon-picker button").forEach(b=>b.style.borderColor=b.textContent===ic?'var(--copper)':'var(--border)');
}
async function saveProd(id){
  const payload={
    name:document.getElementById("pf-name").value.trim(),
    icon:document.getElementById("pf-icon").value||null,
    category_id:Number(document.getElementById("pf-cat").value),
    price:Number(document.getElementById("pf-price").value)||0,
    cost:Number(document.getElementById("pf-cost").value)||0,
    active:document.getElementById("pf-active").checked
  };
  if(!payload.name){ toast("Nom requis",true); return; }
  const {error}=id!=='null'&&id?await sb.from("products").update(payload).eq("id",id):await sb.from("products").insert(payload);
  if(error){ toast("Erreur enregistrement",true); return; }
  toast("Produit enregistré"); closeModal(); loadProdTable(); loadProducts();
}
async function deactivateProd(id){
  if(!confirm("Désactiver ce produit ?")) return;
  await sb.from("products").update({active:false}).eq("id",id);
  toast("Produit désactivé"); closeModal(); loadProdTable(); loadProducts();
}
document.getElementById("btn-add-cat").onclick=()=>{
  openModal(`
    <h3>Nouvelle catégorie</h3>
    <div class="field"><label>Nom</label><input id="cf-name" placeholder="ex: Smoothies"></div>
    <div class="row" style="margin-top:16px;">
      <button class="btn btn-primary" onclick="saveCat()">Créer</button>
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    </div>`);
};
async function saveCat(){
  const name=document.getElementById("cf-name").value.trim();
  if(!name){ toast("Nom requis",true); return; }
  await sb.from("categories").insert({name,sort_order:categories.length+1});
  toast("Catégorie créée"); closeModal(); await loadCategories();
}

/* ================================================================
   SERVEURS
================================================================ */
async function loadSrvTable(){
  const {data}=await sb.from("employees").select("*").order("name");
  const tbody=document.querySelector("#srv-table tbody");
  tbody.innerHTML=(data||[]).map(e=>`
    <tr>
      <td><b>${e.name}</b></td>
      <td>${ROLES[e.role]||e.role}</td>
      <td class="mono">${e.pin}</td>
      <td><span class="tag ${e.active?'tag-ok':'tag-muted'}">${e.active?'Actif':'Inactif'}</span></td>
      <td><button class="btn btn-ghost btn-sm" onclick="editSrv(${e.id})">Modifier</button></td>
    </tr>`).join("");
}
document.getElementById("btn-add-srv").onclick=()=>openSrvForm(null);
async function editSrv(id){
  const {data}=await sb.from("employees").select("*").eq("id",id).single();
  openSrvForm(data);
}
function openSrvForm(e){
  openModal(`
    <h3>${e?"Modifier":"Nouveau"} serveur</h3>
    <div class="field"><label>Nom</label><input id="ef-name" value="${e?.name||''}"></div>
    <div class="field" style="margin-top:10px;"><label>Rôle</label>
      <select id="ef-role">
        ${Object.entries(ROLES).map(([k,v])=>`<option value="${k}" ${e?.role===k?'selected':''}>${v}</option>`).join("")}
      </select>
    </div>
    <div class="field" style="margin-top:10px;"><label>Code PIN (4 chiffres)</label><input id="ef-pin" maxlength="4" inputmode="numeric" value="${e?.pin||''}"></div>
    <label style="display:flex;align-items:center;gap:8px;margin-top:10px;cursor:pointer;">
      <input type="checkbox" id="ef-active" ${(!e||e.active)?'checked':''}> Actif
    </label>
    <div class="row" style="margin-top:16px;">
      <button class="btn btn-primary" onclick="saveSrv(${e?.id||'null'})">Enregistrer</button>
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    </div>`);
}
async function saveSrv(id){
  const payload={
    name:document.getElementById("ef-name").value.trim(),
    role:document.getElementById("ef-role").value,
    pin:document.getElementById("ef-pin").value.trim(),
    active:document.getElementById("ef-active").checked
  };
  if(!payload.name||payload.pin.length!==4){ toast("Nom et PIN (4 chiffres) requis",true); return; }
  const {error}=id!=='null'&&id?await sb.from("employees").update(payload).eq("id",id):await sb.from("employees").insert(payload);
  if(error){ toast("Erreur enregistrement",true); return; }
  toast("Serveur enregistré"); closeModal(); loadSrvTable();
}

/* ================================================================
   DASHBOARD — STATS COMPLÈTES
================================================================ */
async function loadDashboard(){
  const now=new Date();
  const todayStart=new Date(now); todayStart.setHours(0,0,0,0);
  const weekStart=new Date(now); weekStart.setDate(now.getDate()-6); weekStart.setHours(0,0,0,0);
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
  const start30=new Date(now); start30.setDate(now.getDate()-29); start30.setHours(0,0,0,0);

  // All paid tickets last 30 days
  const {data:tks30}=await sb.from("tickets").select("*,employees(name)").eq("status","payé").gte("created_at",start30.toISOString());
  const all30=tks30||[];

  // KPIs
  const todayTks=all30.filter(t=>new Date(t.created_at)>=todayStart);
  const weekTks=all30.filter(t=>new Date(t.created_at)>=weekStart);
  const todayRev=todayTks.reduce((s,t)=>s+Number(t.total),0);
  const weekRev=weekTks.reduce((s,t)=>s+Number(t.total),0);
  const monthRev=all30.filter(t=>new Date(t.created_at)>=monthStart).reduce((s,t)=>s+Number(t.total),0);
  document.getElementById("kpi-today").textContent=dh(todayRev);
  document.getElementById("kpi-week").textContent=dh(weekRev);
  document.getElementById("kpi-month").textContent=dh(monthRev);
  document.getElementById("kpi-tickets").textContent=todayTks.length;
  document.getElementById("kpi-avg").textContent=dh(todayTks.length?todayRev/todayTks.length:0);

  // Low stock
  const {data:prods}=await sb.from("products").select("stock_qty,low_stock_threshold").eq("track_stock",true).eq("active",true);
  document.getElementById("kpi-low").textContent=(prods||[]).filter(p=>p.stock_qty<=p.low_stock_threshold).length;

  // 7 jours bar chart
  const days=[];
  for(let i=6;i>=0;i--){ const d=new Date(now); d.setDate(d.getDate()-i); days.push(d); }
  const revByDay=days.map(d=>{
    const s=todayStr(d);
    return { lbl:fmtDate(d), val:all30.filter(t=>todayStr(new Date(t.created_at))===s).reduce((x,t)=>x+Number(t.total),0) };
  });
  const maxR=Math.max(...revByDay.map(r=>r.val),1);
  document.getElementById("chart-7days").innerHTML=revByDay.map(r=>`
    <div class="bar-col">
      <div class="bar-val">${r.val>0?Math.round(r.val):''}</div>
      <div class="bar-fill" style="height:${Math.max(3,(r.val/maxR)*110)}px;"></div>
      <div class="bar-lbl">${r.lbl}</div>
    </div>`).join("");

  // Get ticket items for detail stats
  const tkIds=all30.map(t=>t.id);
  let items30=[];
  if(tkIds.length){
    const {data}=await sb.from("ticket_items").select("*").in("ticket_id",tkIds.slice(0,500));
    items30=data||[];
  }

  // Section breakdown
  const prodCatMap={}, prodSecMap={};
  products.forEach(p=>{
    const cat=categories.find(c=>c.id===p.category_id);
    prodCatMap[p.id]=cat?.name||"Autre";
    prodSecMap[p.id]=cat&&isTerrasseCat(cat.name)?"🏖️ Terrasse":"☕ Café";
  });
  const bySec={"☕ Café":0,"🏖️ Terrasse":0};
  items30.forEach(it=>{ const s=prodSecMap[it.product_id]||"☕ Café"; bySec[s]=(bySec[s]||0)+Number(it.subtotal); });
  const totSec=Object.values(bySec).reduce((a,b)=>a+b,0)||1;
  document.getElementById("section-stats").innerHTML=Object.entries(bySec).map(([name,val])=>{
    const pct=Math.round((val/totSec)*100);
    return `<div class="prog-item">
      <div class="prog-hd"><span>${name}</span><span class="mono" style="color:var(--copper);">${dh(val)} (${pct}%)</span></div>
      <div class="prog-bar"><div class="prog-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join("");

  // By server
  const tkEmpMap={};
  all30.forEach(t=>tkEmpMap[t.id]=t.employees?.name||"—");
  const bySrv={};
  all30.forEach(t=>{ const n=t.employees?.name||"—"; if(!bySrv[n]) bySrv[n]={rev:0,cnt:0}; bySrv[n].rev+=Number(t.total); bySrv[n].cnt++; });
  const srvEntries=Object.entries(bySrv).sort((a,b)=>b[1].rev-a[1].rev);
  const maxSrv=Math.max(...srvEntries.map(([,v])=>v.rev),1);
  document.getElementById("stats-servers").innerHTML=srvEntries.length?srvEntries.map(([name,v])=>{
    const pct=Math.round((v.rev/maxSrv)*100);
    return `<div class="prog-item">
      <div class="prog-hd"><span><b>${name}</b> <span style="color:var(--text3);font-size:12px;">(${v.cnt} tickets)</span></span><span class="mono" style="color:var(--copper);">${dh(v.rev)}</span></div>
      <div class="prog-bar"><div class="prog-fill" style="width:${pct}%"></div></div>
      <div style="font-size:11px;color:var(--text3);margin-top:2px;">Moy. ${dh(v.rev/v.cnt)} / ticket</div>
    </div>`;
  }).join(""):`<div class="empty">Pas encore de données.</div>`;

  // By shift (Matin 8h-14h / Soir 14h-23h)
  const byShift={"🌅 Matin (8h–14h)":{rev:0,cnt:0},"🌆 Soir (14h–23h)":{rev:0,cnt:0}};
  all30.forEach(t=>{
    const h=new Date(t.created_at).getHours();
    const key=h>=8&&h<14?"🌅 Matin (8h–14h)":h>=14?"🌆 Soir (14h–23h)":null;
    if(key){ byShift[key].rev+=Number(t.total); byShift[key].cnt++; }
  });
  const maxShift=Math.max(...Object.values(byShift).map(v=>v.rev),1);
  document.getElementById("stats-shifts").innerHTML=Object.entries(byShift).map(([name,v])=>{
    const pct=Math.round((v.rev/maxShift)*100);
    return `<div class="prog-item">
      <div class="prog-hd"><span><b>${name}</b> <span style="color:var(--text3);font-size:12px;">${v.cnt} tickets</span></span><span class="mono" style="color:var(--copper);">${dh(v.rev)}</span></div>
      <div class="prog-bar"><div class="prog-fill" style="width:${pct}%;background:${name.includes("Matin")?"#C8A040":"var(--copper)"}"></div></div>
    </div>`;
  }).join("");

  // Top products
  const byProd={};
  items30.forEach(it=>{ byProd[it.product_name]=(byProd[it.product_name]||{qty:0,rev:0}); byProd[it.product_name].qty+=Number(it.qty); byProd[it.product_name].rev+=Number(it.subtotal); });
  const topP=Object.entries(byProd).sort((a,b)=>b[1].qty-a[1].qty).slice(0,7);
  document.getElementById("stats-top").innerHTML=topP.length?topP.map(([name,v])=>`
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--bg2);font-size:13px;">
      <span>${name}</span><span class="mono" style="color:var(--copper);">${v.qty}× · ${dh(v.rev)}</span>
    </div>`).join(""):`<div class="empty">Pas encore de données.</div>`;

  // By category
  const byCat={};
  items30.forEach(it=>{ const c=prodCatMap[it.product_id]||"Autre"; byCat[c]=(byCat[c]||0)+Number(it.subtotal); });
  const catE=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  const maxCat=Math.max(...catE.map(([,v])=>v),1);
  document.getElementById("stats-cats").innerHTML=catE.length?catE.map(([name,val])=>{
    const pct=Math.round((val/maxCat)*100);
    return `<div class="prog-item">
      <div class="prog-hd"><span>${name}</span><span class="mono" style="color:var(--copper);">${dh(val)}</span></div>
      <div class="prog-bar"><div class="prog-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join(""):`<div class="empty">Pas encore de données.</div>`;
}

/* ================================================================
   INIT
================================================================ */
(function init(){
  buildPinPad(); tickClock();
  document.getElementById("tk-from").value=todayStr();
  document.getElementById("tk-to").value=todayStr();
  document.getElementById("rcp-wifi").textContent=`📶 Wifi : ${WIFI}`;
  loadProfiles();
  const saved=localStorage.getItem("cdouae_user");
  if(saved){ try{ currentUser=JSON.parse(saved); enterApp(); }catch(e){} }
})();
