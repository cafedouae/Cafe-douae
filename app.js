/* ================================================================
   ÉTAT GLOBAL
================================================================ */
let currentServer = null;   // server selected for THIS order (no persistent login)
let adminUser = null;       // admin/gerant logged in for admin area
let pinBuffer = "";
let categories = [];
let products = [];
let cart = [];
let activeCat = "all";
let activeSection = "all";

const ROLES = { admin:"Admin", gerant:"Gérant", serveur:"Serveur" };
const MGR = ["admin","gerant"];
const TERRASSE_CATS = ["tacos","crêpes","crepes","glaces","desserts","boissons fresh","matcha club","matcha"];
const PC_MODE = window.location.search.includes("pc") || window.FORCE_PC_MODE===true;
const COMPTOIR_MODE = window.location.search.includes("comptoir");

async function loadAppSettings(){
  try{
    const {data}=await sb.from("app_settings").select("*");
    if(data&&data.length){
      const shopRow=data.find(d=>d.key==="shop_name");
      const wifiRow=data.find(d=>d.key==="wifi_code");
      if(shopRow&&shopRow.value) SHOP=shopRow.value;
      if(wifiRow&&wifiRow.value) WIFI=wifiRow.value;
    }
    document.querySelectorAll(".home-logo .hn").forEach(el=>el.textContent=SHOP);
    document.querySelectorAll("#rcp-head .shop").forEach(el=>el.textContent=SHOP);
  }catch(e){ /* settings table not migrated yet — keep defaults */ }
}
function stripA(s){ return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,""); }

function isTerrasseCat(name){ const n=stripA(name).toLowerCase(); return TERRASSE_CATS.some(t=>n.includes(stripA(t))); }
function catSection(catId){ const c=categories.find(x=>x.id===catId); return c&&isTerrasseCat(c.name)?"terrasse":"cafe"; }
function itemSection(item){ const p=products.find(x=>x.id===item.product_id); return p&&catSection(p.category_id)==="terrasse"?"terrasse":"cafe"; }

/* ================================================================
   HELPERS
================================================================ */
function dh(n){ return (Number(n)||0).toFixed(2).replace(".",",")+" DH"; }
function pad(n){ return String(n).padStart(2,"0"); }
function todayStr(d=new Date()){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function fmtTime(iso){ const d=new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtDateTime(iso){ const d=new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} à ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtDate(iso){ const d=new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth()+1)}`; }
function isSoir(iso){ const h=new Date(iso).getHours(); return h>=14||h<4; }
function isMatin(iso){ const h=new Date(iso).getHours(); return h>=8&&h<14; }
// "Journée commerciale" : tout ce qui se passe avant 4h du matin appartient encore à la veille (le café ferme à 4h)
function businessDate(iso){
  const d=new Date(iso);
  if(d.getHours()<4){ d.setDate(d.getDate()-1); }
  return todayStr(d);
}

function toast(msg,err=false){
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

function tickClockGlobal(){
  const d=new Date();
  const s=`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const c1=document.getElementById("clock"); if(c1) c1.textContent=s.slice(0,5);
  const c2=document.getElementById("home-clock"); if(c2) c2.textContent=s;
  const c3=document.getElementById("cpt-clock"); if(c3) c3.textContent=s;
}
setInterval(tickClockGlobal,1000);

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
const ICON_OPTS = ["☕","🥛","🍵","🧃","🧋","🥤","💧","🥐","🥪","🌮","🥞","🍩","🍰","🧁","🍪","🥧","🍨","🍦","🍕","🍔","🍽️","🫖","🥗","🍓","🍫","🍯","🧇","🥚","🥩","🌯"];
function getIcon(p){
  if(p.icon) return p.icon;
  const n=stripA(p.name||"").toLowerCase();
  for(const [kws,ic] of ICON_MAP){ if(kws.some(k=>n.includes(stripA(k)))) return ic; }
  const cn=stripA(categories.find(c=>c.id===p.category_id)?.name||"").toLowerCase();
  if(cn.includes("cafe")) return "☕";
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
   HOME SCREEN FLOW
================================================================ */
function showHome(){
  currentServer=null;
  cart=[];
  document.getElementById("home-screen").classList.remove("hidden");
  document.getElementById("server-screen").classList.remove("active");
  document.getElementById("admin-login-screen").classList.remove("active");
  document.getElementById("app").classList.remove("active");
}
function hideHome(){ document.getElementById("home-screen").classList.add("hidden"); }

document.getElementById("btn-new-order").onclick=async()=>{
  // Show server screen immediately — no blank page
  hideHome();
  document.getElementById("server-screen").classList.add("active");
  // Load servers in background (non-blocking)
  loadServersForPicker();
};
document.getElementById("server-back").onclick=()=>{
  document.getElementById("server-screen").classList.remove("active");
  document.getElementById("home-screen").classList.remove("hidden");
};
document.getElementById("btn-home").onclick=()=>{
  showHome();
};

async function loadServersForPicker(){
  const grid=document.getElementById("server-grid");
  // Show spinner immediately while loading
  grid.innerHTML=`<div style="text-align:center;padding:40px;color:var(--ink2);font-size:14px;">
    <div style="font-size:30px;margin-bottom:10px;">⏳</div>Chargement...</div>`;
  let data = _preloadedServers;
  if(!data){
    const res=await sb.from("employees").select("*").eq("active",true).eq("role","serveur").order("name");
    data = res.data || [];
    _preloadedServers = data;
  } else {
    // Refresh preloaded data in background for next time
    sb.from("employees").select("*").eq("active",true).eq("role","serveur").order("name").then(r=>{_preloadedServers=r.data||[];});
  }
  grid.innerHTML="";
  (data||[]).forEach(e=>{
    const card=document.createElement("button");
    card.className="server-card";
    card.innerHTML=`<div class="av">${e.name.charAt(0).toUpperCase()}</div><div class="sn">${e.name}</div>`;
    card.onclick=()=>selectServerForOrder(e);
    grid.appendChild(card);
  });
  if(!data||!data.length) grid.innerHTML=`<div class="empty">Aucun serveur. Demande à l'admin d'en ajouter.</div>`;
}
function selectServerForOrder(emp){
  currentServer={id:emp.id,name:emp.name,role:emp.role};
  document.getElementById("server-screen").classList.remove("active");
  enterCaisseOnly();
}

/* Caisse-only mode: simple POS for the selected server, no admin nav */
function enterCaisseOnly(){
  document.getElementById("app").classList.add("active");
  document.getElementById("admin-nav").style.display="none";
  document.getElementById("current-server-label").textContent="👤 "+currentServer.name;
  document.getElementById("rcp-wifi").textContent=`📶 Wifi : ${WIFI}`;
  if(PC_MODE){
    document.getElementById("pc-orders-panel").style.display="flex";
    initPcPanel();
  }
  switchView("caisse");
  loadCategories();
  loadProducts();
}

/* ================================================================
   ADMIN LOGIN
================================================================ */
document.getElementById("btn-admin-link").onclick=()=>{
  hideHome();
  pinBuffer="";
  updateAdminDots();
  document.getElementById("admin-pin-err").textContent="";
  document.getElementById("admin-login-screen").classList.add("active");
};
document.getElementById("admin-pin-back").onclick=()=>{
  document.getElementById("admin-login-screen").classList.remove("active");
  document.getElementById("home-screen").classList.remove("hidden");
};
function updateAdminDots(){
  document.querySelectorAll("#admin-login-screen .pin-dot").forEach((d,i)=>d.classList.toggle("filled",i<pinBuffer.length));
}
function buildAdminPinPad(){
  const keys=["1","2","3","4","5","6","7","8","9","⌫","0","✓"];
  const wrap=document.getElementById("admin-pin-keys");
  wrap.innerHTML="";
  keys.forEach(k=>{
    const b=document.createElement("button");
    b.className="pin-key"; b.textContent=k;
    b.onclick=()=>handleAdminPin(k);
    wrap.appendChild(b);
  });
}
function handleAdminPin(k){
  if(k==="⌫"){ pinBuffer=pinBuffer.slice(0,-1); updateAdminDots(); return; }
  if(k==="✓"){ tryAdminLogin(); return; }
  if(pinBuffer.length<4){ pinBuffer+=k; updateAdminDots(); }
  if(pinBuffer.length===4) setTimeout(tryAdminLogin,100);
}
async function tryAdminLogin(){
  const {data}=await sb.from("employees").select("*").eq("pin",pinBuffer).eq("active",true).in("role",["admin","gerant"]).maybeSingle();
  if(!data){
    document.getElementById("admin-pin-err").textContent="Code invalide ou non autorisé";
    pinBuffer=""; updateAdminDots();
    return;
  }
  adminUser={id:data.id,name:data.name,role:data.role};
  document.getElementById("admin-login-screen").classList.remove("active");
  enterAdminArea();
}
function enterAdminArea(){
  document.getElementById("app").classList.add("active");
  document.getElementById("admin-nav").style.display="flex";
  document.getElementById("current-server-label").textContent="🔑 "+adminUser.name;
  document.getElementById("rcp-wifi").textContent=`📶 Wifi : ${WIFI}`;
  loadCategories();
  loadProducts();
  switchView("rapport");
}

/* ================================================================
   NAVIGATION (admin area only)
================================================================ */
const VIEW_TITLES={caisse:"Caisse",tickets:"Tickets",stock:"Stock",produits:"Menu",serveurs:"Serveurs",rapport:"Rapport",parametres:"Paramètres"};
document.querySelectorAll(".adm-tab").forEach(btn=>{
  btn.addEventListener("click",()=>switchView(btn.dataset.view));
});
function switchView(v){
  document.querySelectorAll(".adm-tab").forEach(b=>b.classList.toggle("active",b.dataset.view===v));
  document.querySelectorAll(".view").forEach(el=>el.classList.toggle("active",el.id==="view-"+v));
  document.getElementById("view-title").textContent=VIEW_TITLES[v]||v;
  if(v==="tickets") loadTickets();
  if(v==="stock") loadStock();
  if(v==="produits") loadProdTable();
  if(v==="serveurs") loadSrvTable();
  if(v==="rapport") loadRapport();
  if(v==="parametres") loadParametres();
  if(v==="caisse"){ loadCategories(); loadProducts(); }
}

/* ================================================================
   CAISSE
================================================================ */
async function loadCategories(){
  const {data}=await sb.from("categories").select("*").order("sort_order");
  categories=data||[];
  renderCatTabs();
}
async function loadProducts(){
  const {data}=await sb.from("products").select("*").eq("active",true).order("name");
  products=data||[];
  renderProductGrid();
}
document.querySelectorAll(".section-tab").forEach(btn=>{
  btn.addEventListener("click",()=>{
    activeSection=btn.dataset.sec; activeCat="all";
    document.querySelectorAll(".section-tab").forEach(b=>b.classList.toggle("active",b.dataset.sec===activeSection));
    renderCatTabs(); renderProductGrid();
  });
});
function renderCatTabs(){
  const wrap=document.getElementById("cat-tabs");
  wrap.innerHTML="";
  let visibleCats=categories;
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
  if(activeSection==="cafe") list=list.filter(p=>catSection(p.category_id)==="cafe");
  if(activeSection==="terrasse") list=list.filter(p=>catSection(p.category_id)==="terrasse");
  if(activeCat!=="all") list=list.filter(p=>p.category_id===activeCat);
  if(!list.length){ grid.innerHTML=`<div class="empty">Aucun produit dans cette section.</div>`; return; }
  grid.innerHTML="";
  list.forEach(p=>{
    const out=p.track_stock&&p.stock_qty<=0;
    const low=p.track_stock&&p.stock_qty<=p.low_stock_threshold&&!out;
    const isTer=catSection(p.category_id)==="terrasse";
    const card=document.createElement("button");
    card.className="prod-card"+(isTer?" is-ter":"");
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
  const srvName=currentServer?currentServer.name:(adminUser?adminUser.name:"");
  document.getElementById("rcp-meta").textContent=`${srvName} — ${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
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
  const activeUser = currentServer || adminUser;
  if(!activeUser){ toast("Aucun serveur sélectionné",true); return; }
  const btn=document.getElementById("btn-checkout");
  btn.disabled=true;
  try{
    const sub=cartSub();
    const disc=Math.min(Number(document.getElementById("inp-discount").value)||0,sub);
    const total=sub-disc;
    const pay=document.getElementById("inp-payment").value;
    const tnum=await nextTkNum();
    const {data:tk,error:e1}=await sb.from("tickets").insert({
      ticket_number:tnum,employee_id:activeUser.id,status:"payé",
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
        await sb.from("stock_movements").insert({product_id:c.pid,type:"sortie",qty:c.qty,reason:"Vente "+tnum,employee_id:activeUser.id});
      }
    }
    printReceipt(tk,[...cart],sub,disc,total,pay,activeUser.name);
    toast(`✓ ${tnum} — ${dh(total)}`);
    cart=[];
    document.getElementById("inp-discount").value="";
    renderCart();
    await loadProducts();
    // Preload for next order (runs in background while showing receipt)
    preloadServers();
    // If in simple server flow (not admin/pc), go back to home after a short delay
    if(currentServer && !PC_MODE){
      setTimeout(()=>{ showHome(); }, 1400);
    }
  }catch(err){ console.error(err); toast("Erreur encaissement",true); }
  finally{ btn.disabled=false; }
};

function buildTicketHTML(num,server,dateStr,itemsArr,sub,disc,total,pay,label){
  return `<div class="ticket-copy">
    <div style="text-align:center;margin-bottom:7px;">
      <div style="font-size:16px;font-weight:700;">${SHOP}</div>
      <div>${num}</div><div>${server}</div><div>${dateStr}</div>
    </div>
    <hr>
    ${itemsArr}
    <hr>
    <div style="display:flex;justify-content:space-between;font-size:11px;"><span>Sous-total</span><span>${sub}</span></div>
    <div style="display:flex;justify-content:space-between;font-size:11px;"><span>Remise</span><span>-${disc}</span></div>
    <div style="display:flex;justify-content:space-between;font-weight:700;font-size:13px;margin-top:3px;border-top:1px solid #000;padding-top:3px;"><span>TOTAL</span><span>${total}</span></div>
    <div style="font-size:11px;margin-top:4px;">Paiement : ${pay}</div>
    <hr>
    <div style="text-align:center;font-size:11px;">Wifi : ${WIFI}</div>
    <div style="text-align:center;font-size:10px;margin-top:3px;">${label}</div>
    <div style="text-align:center;font-size:11px;margin-top:4px;">Merci !</div>
  </div>`;
}
function printReceipt(tk,items,sub,disc,total,pay,serverName){
  const d=new Date(tk.created_at||Date.now());
  const dateStr=`${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const itemsHTML=items.map(i=>`<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:11px;"><span>${i.qty}x ${i.name}</span><span>${dh(i.price*i.qty)}</span></div>`).join("");
  const copy1=buildTicketHTML(tk.ticket_number,serverName,dateStr,itemsHTML,dh(sub),dh(disc),dh(total),pay,"★ CLIENT ★");
  const cut=`<div class="ticket-cut">- - - - - DECOUPER ICI - - - - -</div>`;
  const copy2=buildTicketHTML(tk.ticket_number,serverName,dateStr,itemsHTML,dh(sub),dh(disc),dh(total),pay,"★ CAFE ★");
  document.getElementById("print-area").innerHTML=copy1+cut+copy2;
  window.print();
}

/* ================================================================
   TICKETS (admin)
================================================================ */
async function loadTickets(){
  const from=document.getElementById("tk-from").value;
  const to=document.getElementById("tk-to").value;
  let q=sb.from("tickets").select("*,employees(name)").order("created_at",{ascending:false}).limit(300);
  // Journée commerciale : un jour "from" commence à 4h du matin (pas à minuit),
  // car tout ce qui se passe avant 4h appartient encore à la soirée précédente.
  if(from) q=q.gte("created_at",from+"T04:00:00");
  if(to){ const nd=new Date(to+"T00:00:00"); nd.setDate(nd.getDate()+1); q=q.lte("created_at",todayStr(nd)+"T03:59:59"); }
  const {data}=await q;
  const tbody=document.querySelector("#tickets-table tbody");
  if(!data||!data.length){ tbody.innerHTML=`<tr><td colspan="8" class="empty">Aucun ticket.</td></tr>`; return; }
  const ids=data.map(t=>t.id);
  const {data:allItems}=await sb.from("ticket_items").select("*").in("ticket_id",ids.length?ids:[0]);
  tbody.innerHTML=data.map(t=>{
    const items=(allItems||[]).filter(i=>i.ticket_id===t.id);
    const hasCafe=items.some(i=>itemSection(i)==="cafe");
    const hasTer=items.some(i=>itemSection(i)==="terrasse");
    let secBadge="—";
    if(hasCafe&&hasTer) secBadge=`<span class="tag tag-cafe">☕</span> <span class="tag tag-ter">🏖️</span>`;
    else if(hasTer) secBadge=`<span class="tag tag-ter">🏖️ Terrasse</span>`;
    else if(hasCafe) secBadge=`<span class="tag tag-cafe">☕ Café</span>`;
    return `<tr>
      <td class="mono" style="font-size:12px;">${t.ticket_number}</td>
      <td>${fmtTime(t.created_at)}</td>
      <td>${t.employees?.name||"—"}</td>
      <td>${secBadge}</td>
      <td class="mono">${dh(t.total)}</td>
      <td>${t.payment_method||"—"}</td>
      <td><span class="tag ${t.status==='payé'?'tag-ok':t.status==='annulé'?'tag-warn':'tag-muted'}">${t.status}</span></td>
      <td><button class="btn btn-ghost btn-sm" onclick="viewTicket(${t.id})">Voir</button></td>
    </tr>`;
  }).join("");
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
  openModal(`
    <h3>${tk.ticket_number}</h3>
    <div style="color:var(--ink2);font-size:13px;margin-bottom:12px;">${fmtDateTime(tk.created_at)} · ${tk.employees?.name||"—"} · ${tk.payment_method||""}</div>
    <table>${(items||[]).map(i=>`<tr><td>${i.qty} × ${i.product_name}</td><td style="text-align:right;">${dh(i.subtotal)}</td></tr>`).join("")}</table>
    <div class="sep"></div>
    <div style="display:flex;justify-content:space-between;font-weight:700;font-size:16px;"><span>Total</span><span>${dh(tk.total)}</span></div>
    ${tk.status==="payé"?`
    <div class="sep"></div>
    <div style="font-size:13px;color:var(--ink2);margin-bottom:8px;">Annulation réservée au gérant/admin :</div>
    <div class="field"><label>Code PIN</label><input type="password" id="void-pin" maxlength="4" inputmode="numeric"></div>
    <div id="void-err" style="color:var(--red);font-size:13px;min-height:16px;margin-top:4px;"></div>
    <div class="row" style="margin-top:14px;">
      <button class="btn btn-danger" onclick="confirmVoid(${tk.id})">Annuler le ticket</button>
      <button class="btn btn-ghost" onclick="closeModal()">Fermer</button>
    </div>` : `<div class="row" style="margin-top:14px;"><button class="btn btn-ghost" onclick="closeModal()">Fermer</button></div>`}
  `);
}
async function confirmVoid(id){
  const pin=document.getElementById("void-pin").value.trim();
  const {data:approver}=await sb.from("employees").select("*").eq("pin",pin).eq("active",true).in("role",["admin","gerant"]).maybeSingle();
  if(!approver){ document.getElementById("void-err").textContent="Code invalide."; return; }
  const {data:items}=await sb.from("ticket_items").select("*").eq("ticket_id",id);
  for(const it of items||[]){
    const {data:p}=await sb.from("products").select("*").eq("id",it.product_id).single();
    if(p&&p.track_stock){
      await sb.from("products").update({stock_qty:p.stock_qty+it.qty}).eq("id",p.id);
      await sb.from("stock_movements").insert({product_id:p.id,type:"entree",qty:it.qty,reason:`Annulation — ${approver.name}`,employee_id:approver.id});
    }
  }
  await sb.from("tickets").update({status:"annulé",note:`Annulé par ${approver.name}`}).eq("id",id);
  toast(`Ticket annulé — ${approver.name}`);
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
  await sb.from("stock_movements").insert({product_id:pid,type,qty,reason,employee_id:(adminUser?adminUser.id:null)});
  await sb.from("products").update({stock_qty:ns}).eq("id",pid);
  toast("Stock mis à jour"); closeModal(); await loadProducts(); loadStock();
}

/* ================================================================
   PRODUITS / MENU
================================================================ */
async function loadProdTable(){
  const {data}=await sb.from("products").select("*,categories(name)").order("name");
  const tbody=document.querySelector("#prod-table tbody");
  if(!data||!data.length){ tbody.innerHTML=`<tr><td colspan="7" class="empty">Aucun produit.</td></tr>`; return; }
  tbody.innerHTML=data.map(p=>{
    const sec=catSection(p.category_id);
    return `<tr>
      <td style="font-size:18px;">${getIcon(p)}</td>
      <td>${p.name}</td>
      <td>${p.categories?.name||"—"}</td>
      <td><span class="tag ${sec==='terrasse'?'tag-ter':'tag-cafe'}">${sec==='terrasse'?'🏖️ Terrasse':'☕ Café'}</span></td>
      <td class="mono">${dh(p.price)}</td>
      <td><span class="tag ${p.active?'tag-ok':'tag-muted'}">${p.active?'Actif':'Inactif'}</span></td>
      <td><button class="btn btn-ghost btn-sm" onclick="editProd(${p.id})">Modifier</button></td>
    </tr>`;
  }).join("");
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
      <div id="icon-picker" class="icon-picker">
        ${ICON_OPTS.map(ic=>`<button type="button" onclick="pickIcon('${ic}')" class="icon-opt ${ (p?.icon||"")===ic?'selected':''}">${ic}</button>`).join("")}
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
  document.querySelectorAll("#icon-picker .icon-opt").forEach(b=>b.classList.toggle("selected",b.textContent===ic));
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
    <div class="field" style="margin-top:10px;">
      <label>Section</label>
      <select id="cf-section">
        <option value="cafe">☕ Café</option>
        <option value="terrasse">🏖️ Terrasse</option>
      </select>
    </div>
    <div class="row" style="margin-top:16px;">
      <button class="btn btn-primary" onclick="saveCat()">Créer</button>
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    </div>`);
};
async function saveCat(){
  let name=document.getElementById("cf-name").value.trim();
  const section=document.getElementById("cf-section").value;
  if(!name){ toast("Nom requis",true); return; }
  // tag terrasse categories so isTerrasseCat() detects them automatically if not an obvious keyword
  if(section==="terrasse" && !isTerrasseCat(name)) name=name+" (Terrasse)";
  await sb.from("categories").insert({name,sort_order:categories.length+1});
  toast("Catégorie créée"); closeModal(); await loadCategories();
}

/* ================================================================
   SERVEURS (admin)
================================================================ */
async function loadSrvTable(){
  const {data}=await sb.from("employees").select("*").order("name");
  const tbody=document.querySelector("#srv-table tbody");
  tbody.innerHTML=(data||[]).map(e=>`
    <tr>
      <td><b>${e.name}</b></td>
      <td>${ROLES[e.role]||e.role}</td>
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
    <div class="field" style="margin-top:10px;"><label>Code PIN (4 chiffres) ${e&&e.role==='serveur'?'— optionnel pour serveur':''}</label><input id="ef-pin" maxlength="4" inputmode="numeric" value="${e?.pin||''}"></div>
    <label style="display:flex;align-items:center;gap:8px;margin-top:10px;cursor:pointer;">
      <input type="checkbox" id="ef-active" ${(!e||e.active)?'checked':''}> Actif
    </label>
    <div class="row" style="margin-top:16px;">
      <button class="btn btn-primary" onclick="saveSrv(${e?.id||'null'})">Enregistrer</button>
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    </div>`);
}
async function saveSrv(id){
  const role=document.getElementById("ef-role").value;
  let pin=document.getElementById("ef-pin").value.trim();
  // serveurs don't strictly need a pin in the new flow (selected by tap), but admin/gerant need one
  if(MGR.includes(role) && pin.length!==4){ toast("Code PIN (4 chiffres) requis pour Admin/Gérant",true); return; }
  if(!pin) pin="0000"; // placeholder if none set for simple servers
  const payload={
    name:document.getElementById("ef-name").value.trim(),
    role, pin,
    active:document.getElementById("ef-active").checked
  };
  if(!payload.name){ toast("Nom requis",true); return; }
  const {error}=id!=='null'&&id?await sb.from("employees").update(payload).eq("id",id):await sb.from("employees").insert(payload);
  if(error){ toast("Erreur enregistrement",true); return; }
  toast("Serveur enregistré"); closeModal(); loadSrvTable();
}

/* ================================================================
   RAPPORT
================================================================ */
function setRapportToday(){
  document.getElementById("rp-mode").value="jour";
  toggleRapportMode();
  document.getElementById("rp-from").value=todayStr();
  loadRapport();
}
function setRapportYesterday(){
  document.getElementById("rp-mode").value="jour";
  toggleRapportMode();
  const y=new Date(); y.setDate(y.getDate()-1);
  document.getElementById("rp-from").value=todayStr(y);
  loadRapport();
}
function toggleRapportMode(){
  const mode=document.getElementById("rp-mode").value;
  document.getElementById("rp-day-wrap").style.display=mode==="jour"?"":"none";
  document.getElementById("rp-month-wrap").style.display=mode==="mois"?"":"none";
  document.getElementById("rp-month-chart-card").style.display=mode==="mois"?"":"none";
  document.getElementById("rp-yesterday-btn").style.display=mode==="jour"?"":"none";
  const ml=mode==="mois";
  document.getElementById("rp-cafe-matin-label").textContent=ml?"🌅 Matin (total mois)":"🌅 Matin";
  document.getElementById("rp-cafe-soir-label").textContent=ml?"🌆 Soir (total mois)":"🌆 Soir";
  document.getElementById("rp-ter-matin-label").textContent=ml?"🌅 Matin (total mois)":"🌅 Matin";
  document.getElementById("rp-ter-soir-label").textContent=ml?"🌆 Soir (total mois)":"🌆 Soir";
}

async function loadRapport(){
  const mode=document.getElementById("rp-mode").value;
  if(mode==="mois") return loadRapportMonth();
  return loadRapportDay();
}

/* ───────── MODE JOUR — journée commerciale (8h → 4h le lendemain) ───────── */
async function loadRapportDay(){
  const day=document.getElementById("rp-from").value;
  if(!day){ toast("Sélectionne un jour",true); return; }
  const dayDate=new Date(day+"T12:00:00");
  document.getElementById("rp-date-label").textContent=dayDate.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"});

  const from=day+"T04:00:00"; // la journée commerciale commence à 4h du matin (pas minuit)
  const nextDay=new Date(day); nextDay.setDate(nextDay.getDate()+1);
  const to=todayStr(nextDay)+"T03:59:59"; // ...et se termine à 4h du matin le lendemain

  const {data:tks}=await sb.from("tickets").select("*,employees(name)").eq("status","payé")
    .gte("created_at",from).lte("created_at",to).order("created_at",{ascending:true}).limit(10000);

  if(!tks||!tks.length){
    ["rp-cafe-matin","rp-cafe-soir","rp-cafe-total","rp-ter-matin","rp-ter-soir","rp-ter-total","rp-grand-total"]
      .forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent="0 DH"; });
    document.getElementById("rp-nb-label").textContent="Aucun ticket";
    document.getElementById("rp-servers").innerHTML=`<div class="empty">Aucune vente ce jour.</div>`;
    document.getElementById("rapport-content").innerHTML="";
    return;
  }

  const ids=tks.map(t=>t.id);
  // Batch IDs to avoid URL length limit (max 200 per request)
  let allItems=[];
  for(let i=0;i<ids.length;i+=200){
    const chunk=ids.slice(i,i+200);
    const {data:chunk_items}=await sb.from("ticket_items").select("*").in("ticket_id",chunk);
    if(chunk_items) allItems=[...allItems,...chunk_items];
  }
  const data=tks.map(t=>({...t,items:(allItems||[]).filter(i=>i.ticket_id===t.id)}));

  let cafeMatin=0,cafeSoir=0,terMatin=0,terSoir=0;
  data.forEach(t=>{
    const mat=isMatin(t.created_at), soir=isSoir(t.created_at);
    t.items.forEach(i=>{
      const v=Number(i.subtotal), sec=itemSection(i);
      if(sec==="cafe"){ if(mat) cafeMatin+=v; if(soir) cafeSoir+=v; }
      else { if(mat) terMatin+=v; if(soir) terSoir+=v; }
    });
  });
  const cafeTotal=cafeMatin+cafeSoir, terTotal=terMatin+terSoir;
  document.getElementById("rp-cafe-matin").textContent=dh(cafeMatin);
  document.getElementById("rp-cafe-soir").textContent=dh(cafeSoir);
  document.getElementById("rp-cafe-total").textContent=dh(cafeTotal);
  document.getElementById("rp-ter-matin").textContent=dh(terMatin);
  document.getElementById("rp-ter-soir").textContent=dh(terSoir);
  document.getElementById("rp-ter-total").textContent=dh(terTotal);
  document.getElementById("rp-grand-total").textContent=dh(cafeTotal+terTotal);
  document.getElementById("rp-nb-label").textContent=`${data.length} ticket${data.length>1?"s":""} · ☕ ${dh(cafeTotal)} · 🏖️ ${dh(terTotal)}`;

  renderServerBreakdown(data);
  renderRapportDetail(data);
}

/* ───────── MODE MOIS — total + détail jour par jour ───────── */
async function loadRapportMonth(){
  const mv=document.getElementById("rp-month").value;
  if(!mv){ toast("Sélectionne un mois",true); return; }
  const [yr,mo]=mv.split("-").map(Number);
  const monthStart=new Date(yr,mo-1,1);
  const monthLabel=monthStart.toLocaleDateString("fr-FR",{month:"long",year:"numeric"});
  document.getElementById("rp-date-label").textContent=monthLabel.charAt(0).toUpperCase()+monthLabel.slice(1);

  // Étendre la requête jusqu'à 4h du matin après le dernier jour du mois (journée commerciale)
  const from=`${yr}-${pad(mo)}-01T04:00:00`;
  const lastDay=new Date(yr,mo,0).getDate();
  const afterMonth=new Date(yr,mo-1,lastDay); afterMonth.setDate(afterMonth.getDate()+1);
  const to=todayStr(afterMonth)+"T03:59:59";

  const {data:tks}=await sb.from("tickets").select("*,employees(name)").eq("status","payé")
    .gte("created_at",from).lte("created_at",to).order("created_at",{ascending:true}).limit(10000);

  if(!tks||!tks.length){
    ["rp-cafe-matin","rp-cafe-soir","rp-cafe-total","rp-ter-matin","rp-ter-soir","rp-ter-total","rp-grand-total"]
      .forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent="0 DH"; });
    document.getElementById("rp-nb-label").textContent="Aucun ticket";
    document.getElementById("rp-servers").innerHTML=`<div class="empty">Aucune vente ce mois.</div>`;
    document.getElementById("rapport-content").innerHTML="";
    document.getElementById("rp-month-bars").innerHTML="";
    return;
  }

  const ids=tks.map(t=>t.id);
  // Batch IDs to avoid URL length limit (max 200 per request)
  let allItems=[];
  for(let i=0;i<ids.length;i+=200){
    const chunk=ids.slice(i,i+200);
    const {data:chunk_items}=await sb.from("ticket_items").select("*").in("ticket_id",chunk);
    if(chunk_items) allItems=[...allItems,...chunk_items];
  }
  const data=tks.map(t=>({...t,items:(allItems||[]).filter(i=>i.ticket_id===t.id),bizDate:businessDate(t.created_at)}));

  // Totaux du mois (Matin/Soir cumulés, peu utile en vue mois mais on garde la cohérence des cartes)
  let cafeMatin=0,cafeSoir=0,terMatin=0,terSoir=0;
  data.forEach(t=>{
    const mat=isMatin(t.created_at), soir=isSoir(t.created_at);
    t.items.forEach(i=>{
      const v=Number(i.subtotal), sec=itemSection(i);
      if(sec==="cafe"){ if(mat) cafeMatin+=v; if(soir) cafeSoir+=v; }
      else { if(mat) terMatin+=v; if(soir) terSoir+=v; }
    });
  });
  const cafeTotal=cafeMatin+cafeSoir, terTotal=terMatin+terSoir;
  document.getElementById("rp-cafe-matin").textContent=dh(cafeMatin);
  document.getElementById("rp-cafe-soir").textContent=dh(cafeSoir);
  document.getElementById("rp-cafe-total").textContent=dh(cafeTotal);
  document.getElementById("rp-ter-matin").textContent=dh(terMatin);
  document.getElementById("rp-ter-soir").textContent=dh(terSoir);
  document.getElementById("rp-ter-total").textContent=dh(terTotal);
  document.getElementById("rp-grand-total").textContent=dh(cafeTotal+terTotal);
  document.getElementById("rp-nb-label").textContent=`${data.length} ticket${data.length>1?"s":""} sur le mois · ☕ ${dh(cafeTotal)} · 🏖️ ${dh(terTotal)}`;

  // Graphique par jour du mois (regroupé par journée commerciale)
  const byDay={};
  for(let d=1; d<=lastDay; d++){ byDay[`${yr}-${pad(mo)}-${pad(d)}`]=0; }
  data.forEach(t=>{ if(byDay[t.bizDate]!==undefined) byDay[t.bizDate]+=Number(t.total); });
  const bars=Object.entries(byDay).map(([date,val])=>({lbl:date.split("-")[2],val}));
  const maxBar=Math.max(...bars.map(b=>b.val),1);
  document.getElementById("rp-month-bars").innerHTML=bars.map(b=>`
    <div class="bar-col">
      <div class="bar-val">${b.val>0?Math.round(b.val):''}</div>
      <div class="bar-fill" style="height:${Math.max(2,(b.val/maxBar)*120)}px;"></div>
      <div class="bar-lbl">${b.lbl}</div>
    </div>`).join("");

  renderServerBreakdown(data);
  renderRapportDetailGroupedByDay(data);
}

function renderServerBreakdown(data){
  const srvMap={};
  data.forEach(t=>{
    const srv=t.employees?.name||"—";
    if(!srvMap[srv]) srvMap[srv]={cafe:0,ter:0,cafeMatin:0,cafeSoir:0,terMatin:0,terSoir:0,tickets:0};
    srvMap[srv].tickets++;
    const mat=isMatin(t.created_at), soir=isSoir(t.created_at);
    t.items.forEach(i=>{
      const v=Number(i.subtotal), sec=itemSection(i);
      if(sec==="terrasse"){ srvMap[srv].ter+=v; if(mat) srvMap[srv].terMatin+=v; if(soir) srvMap[srv].terSoir+=v; }
      else { srvMap[srv].cafe+=v; if(mat) srvMap[srv].cafeMatin+=v; if(soir) srvMap[srv].cafeSoir+=v; }
    });
  });
  document.getElementById("rp-servers").innerHTML=Object.entries(srvMap).sort((a,b)=>(b[1].cafe+b[1].ter)-(a[1].cafe+a[1].ter)).map(([name,v])=>`
    <div style="padding:14px;background:var(--bg);border-radius:14px;margin-bottom:9px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-weight:800;font-size:15px;">👤 ${name}</div>
        <div style="font-weight:800;font-size:17px;" class="mono">${dh(v.cafe+v.ter)}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
        <div style="background:var(--surface);border-radius:10px;padding:10px 12px;border-left:3px solid var(--orange);">
          <div style="font-weight:800;color:var(--orange-d);margin-bottom:6px;">☕ Café</div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;"><span style="color:var(--ink2);">🌅 Matin</span><span class="mono">${dh(v.cafeMatin)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;"><span style="color:var(--ink2);">🌆 Soir</span><span class="mono">${dh(v.cafeSoir)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:5px 0;border-top:1px solid var(--line);margin-top:4px;font-weight:800;"><span>Total</span><span class="mono" style="color:var(--orange-d);">${dh(v.cafe)}</span></div>
        </div>
        <div style="background:var(--surface);border-radius:10px;padding:10px 12px;border-left:3px solid var(--teal);">
          <div style="font-weight:800;color:var(--teal-d);margin-bottom:6px;">🏖️ Terrasse</div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;"><span style="color:var(--ink2);">🌅 Matin</span><span class="mono">${dh(v.terMatin)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;"><span style="color:var(--ink2);">🌆 Soir</span><span class="mono">${dh(v.terSoir)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:5px 0;border-top:1px solid var(--line);margin-top:4px;font-weight:800;"><span>Total</span><span class="mono" style="color:var(--teal-d);">${dh(v.ter)}</span></div>
        </div>
      </div>
      <div style="text-align:right;font-size:11px;color:var(--ink3);margin-top:6px;">${v.tickets} ticket${v.tickets>1?"s":""} · Moy. ${dh((v.cafe+v.ter)/v.tickets)}/ticket</div>
    </div>`).join("");
}

function renderRapportDetail(data){
  const wrap=document.getElementById("rapport-content");
  if(!data.length){ wrap.innerHTML=`<div class="empty">Aucune donnée.</div>`; return; }
  const sections=[{key:"cafe",label:"☕ Café",color:"var(--orange-d)"},{key:"terrasse",label:"🏖️ Terrasse",color:"var(--teal-d)"}];
  wrap.innerHTML=sections.map(sec=>{
    const shifts=[{label:"🌅 Matin (8h–14h)",filter:t=>isMatin(t.created_at)},{label:"🌆 Soir (14h–04h)",filter:t=>isSoir(t.created_at)}];
    const shiftBlocks=shifts.map(shift=>{
      const tickets=data.filter(shift.filter).filter(t=>t.items.some(i=>itemSection(i)===sec.key));
      if(!tickets.length) return `<div style="color:var(--ink3);font-size:13px;padding:10px 0;">${shift.label} — Aucune vente</div>`;
      const shiftTotal=tickets.reduce((s,t)=>s+t.items.filter(i=>itemSection(i)===sec.key).reduce((x,i)=>x+Number(i.subtotal),0),0);
      const rows=tickets.map(t=>{
        const secItems=t.items.filter(i=>itemSection(i)===sec.key);
        const secTotal=secItems.reduce((s,i)=>s+Number(i.subtotal),0);
        return `<div style="background:var(--bg);border-radius:10px;padding:11px 13px;margin-bottom:7px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <div style="display:flex;gap:10px;align-items:center;">
              <span class="mono" style="font-size:11px;font-weight:800;">${t.ticket_number}</span>
              <span style="font-size:12px;color:var(--ink2);">${fmtDate(t.created_at)} à ${fmtTime(t.created_at)} · ${t.employees?.name||"—"}</span>
            </div>
            <span class="mono" style="font-weight:800;">${dh(secTotal)}</span>
          </div>
          ${secItems.map(i=>`
            <div style="display:flex;justify-content:space-between;font-size:12.5px;padding:3px 0;border-top:1px dashed var(--line);">
              <span>${i.qty}× ${i.product_name}</span>
              <span class="mono" style="color:var(--ink2);">${dh(i.unit_price)} = <b>${dh(i.subtotal)}</b></span>
            </div>`).join("")}
        </div>`;
      }).join("");
      return `<div style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;padding:6px 0;border-bottom:1px solid var(--line);margin-bottom:8px;">
          <span style="color:var(--ink2);">${shift.label}</span><span class="mono">${dh(shiftTotal)}</span>
        </div>${rows}
      </div>`;
    }).join("");
    const secTotal=data.reduce((s,t)=>s+t.items.filter(i=>itemSection(i)===sec.key).reduce((x,i)=>x+Number(i.subtotal),0),0);
    return `<div class="card" style="border-top:4px solid ${sec.color};margin-bottom:0;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <h3 class="disp" style="margin:0;font-size:17px;color:${sec.color};">${sec.label}</h3>
        <span class="disp" style="font-size:23px;font-weight:800;color:${sec.color};">${dh(secTotal)}</span>
      </div>${shiftBlocks}
    </div>`;
  }).join("");
}

/* Détail en mode Mois : groupé par journée commerciale, du plus récent au plus ancien */
function renderRapportDetailGroupedByDay(data){
  const wrap=document.getElementById("rapport-content");
  if(!data.length){ wrap.innerHTML=`<div class="empty">Aucune donnée.</div>`; return; }
  const byDay={};
  data.forEach(t=>{ if(!byDay[t.bizDate]) byDay[t.bizDate]=[]; byDay[t.bizDate].push(t); });
  const sortedDays=Object.keys(byDay).sort((a,b)=>b.localeCompare(a));
  wrap.innerHTML=`<div class="card"><h3 class="disp" style="margin:0 0 14px;font-size:16px;">📋 Détail jour par jour</h3>` +
    sortedDays.map(day=>{
      const tickets=byDay[day];
      const dayLabel=new Date(day+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"});
      let cafeT=0,terT=0;
      tickets.forEach(t=>t.items.forEach(i=>{ itemSection(i)==="terrasse"?terT+=Number(i.subtotal):cafeT+=Number(i.subtotal); }));
      return `<div style="padding:12px 14px;background:var(--bg);border-radius:12px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-weight:700;font-size:13.5px;text-transform:capitalize;">${dayLabel}</div>
          <div style="display:flex;gap:10px;align-items:center;">
            <span class="tag tag-cafe">☕ ${dh(cafeT)}</span>
            <span class="tag tag-ter">🏖️ ${dh(terT)}</span>
            <span class="mono" style="font-weight:800;">${dh(cafeT+terT)}</span>
          </div>
        </div>
      </div>`;
    }).join("") + `</div>`;
}


/* ================================================================
   PC SPLIT MODE — LIVE ORDERS PANEL
================================================================ */
let pcOrders=[];
async function initPcPanel(){
  await loadPcOrders();
  sb.channel("pc-live-"+Date.now())
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"tickets"},async(payload)=>{
      const tk=payload.new;
      if(tk.status!=="payé") return;
      if(pcOrders.find(o=>o.id===tk.id)) return;
      const {data:items}=await sb.from("ticket_items").select("*").eq("ticket_id",tk.id);
      const {data:emp}=await sb.from("employees").select("name").eq("id",tk.employee_id).single();
      const order={id:tk.id,ticket_number:tk.ticket_number,server:emp?.name||"—",
        time:new Date(tk.created_at),items:items||[],total:tk.total,discount:tk.discount||0,
        payment:tk.payment_method,comptoir_status:tk.comptoir_status||"pending",isNew:true};
      if(order.comptoir_status==="servi") return;
      pcOrders.unshift(order);
      renderPcPanel();
      playBeep();
      setTimeout(()=>{order.isNew=false;renderPcPanel();},8000);
    }).subscribe();
}
async function loadPcOrders(){
  const start=new Date(); start.setHours(0,0,0,0);
  const {data:tks}=await sb.from("tickets").select("*,employees(name)")
    .eq("status","payé").gte("created_at",start.toISOString()).order("created_at",{ascending:false});
  if(!tks||!tks.length){ renderPcPanel(); return; }
  const ids=tks.map(t=>t.id);
  // Batch IDs to avoid URL length limit (max 200 per request)
  let allItems=[];
  for(let i=0;i<ids.length;i+=200){
    const chunk=ids.slice(i,i+200);
    const {data:chunk_items}=await sb.from("ticket_items").select("*").in("ticket_id",chunk);
    if(chunk_items) allItems=[...allItems,...chunk_items];
  }
  pcOrders=tks.filter(t=>t.comptoir_status!=="servi").map(t=>({
    id:t.id,ticket_number:t.ticket_number,server:t.employees?.name||"—",
    time:new Date(t.created_at),items:(allItems||[]).filter(i=>i.ticket_id===t.id),
    total:t.total,discount:t.discount||0,payment:t.payment_method,
    comptoir_status:t.comptoir_status||"pending",isNew:false
  }));
  renderPcPanel();
}
function renderPcPanel(){
  const wrap=document.getElementById("pc-orders");
  if(!wrap) return;
  const pending=pcOrders.filter(o=>o.comptoir_status!=="servi");
  const badge=document.getElementById("pc-count-badge");
  if(badge) badge.textContent=pending.length;
  if(!pending.length){ wrap.innerHTML=`<div class="empty" style="padding:30px 10px;">✓ Aucune commande en attente</div>`; return; }
  wrap.innerHTML=pending.map(o=>`
    <div class="pc-card${o.isNew?" new-ord":""}">
      <div class="pc-card-hd"><span class="pc-num">${o.ticket_number}</span><span class="pc-time">${pad(o.time.getHours())}:${pad(o.time.getMinutes())}</span></div>
      <div class="pc-srv">👤 ${o.server}</div>
      ${o.items.map(i=>`<div class="pc-item"><span>${i.qty}× ${i.product_name}</span><span>${dh(i.subtotal)}</span></div>`).join("")}
      <div class="pc-tot"><span>Total</span><span style="color:var(--green);">${dh(o.total)}</span></div>
      <button class="pc-btn" onclick="pcPrint(${o.id})">🖨️ Imprimer + Servi</button>
    </div>`).join("");
}
async function pcPrint(orderId){
  const o=pcOrders.find(x=>x.id===orderId);
  if(!o) return;
  const d=o.time;
  function pcTicketHTML(label){return `
    <div style="text-align:center;margin-bottom:8px;">
      <div style="font-size:18px;font-weight:700;">${SHOP}</div>
      <div>${o.ticket_number}</div>
      <div>Servi par : ${o.server}</div>
      <div>${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} — ${pad(d.getHours())}:${pad(d.getMinutes())}</div>
    </div><hr>
    ${o.items.map(i=>`<div style="display:flex;justify-content:space-between;padding:3px 0;"><span>${i.qty}x ${i.product_name}</span><span>${dh(i.subtotal)}</span></div>`).join("")}
    <hr>
    ${o.discount>0?`<div style="display:flex;justify-content:space-between;"><span>Remise</span><span>-${dh(o.discount)}</span></div>`:""}
    <div style="display:flex;justify-content:space-between;font-weight:700;font-size:14px;"><span>Total</span><span>${dh(o.total)}</span></div>
    <div style="margin-top:5px;">Paiement : ${o.payment}</div>
    <hr><div style="text-align:center;">Wifi : ${WIFI}</div>
    <div style="text-align:center;margin-top:3px;font-size:10px;">${label}</div>
    <div style="text-align:center;margin-top:5px;">Merci de votre visite !</div>`;}
  document.getElementById("print-area").innerHTML=
    pcTicketHTML("--- CLIENT ---")+
    `<div style="page-break-after:always;border-top:1px dashed #000;margin:8px 0;"></div>`+
    pcTicketHTML("--- CAFE ---");
  window.print();
  await sb.from("tickets").update({comptoir_status:"servi"}).eq("id",orderId);
  o.comptoir_status="servi";
  renderPcPanel();
}
function playBeep(){
  try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    [880,1100].forEach((freq,i)=>{
      const osc=ctx.createOscillator(); const gain=ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value=freq; osc.type="sine";
      const t=ctx.currentTime+i*0.18;
      gain.gain.setValueAtTime(0.25,t);
      gain.gain.exponentialRampToValueAtTime(0.001,t+0.25);
      osc.start(t); osc.stop(t+0.28);
    });
  }catch(e){}
}

/* ================================================================
   COMPTOIR KDS (kitchen display)
================================================================ */
let comptoirOrders=[];
function openComptoir(){
  window.open(window.location.origin+window.location.pathname+"?comptoir","_blank");
}
async function initComptoir(){
  document.getElementById("home-screen").classList.add("hidden");
  document.getElementById("comptoir-screen").classList.add("active");
  await loadComptoirOrders();
  sb.channel("comptoir-"+Date.now())
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"tickets"},async(payload)=>{
      const tk=payload.new;
      if(tk.status!=="payé") return;
      if(comptoirOrders.find(o=>o.id===tk.id)) return;
      const {data:items}=await sb.from("ticket_items").select("*").eq("ticket_id",tk.id);
      const {data:emp}=await sb.from("employees").select("name").eq("id",tk.employee_id).single();
      const order={id:tk.id,ticket_number:tk.ticket_number,server:emp?.name||"—",time:new Date(tk.created_at),
        items:items||[],discount:tk.discount||0,total:tk.total||0,payment:tk.payment_method||"—",
        isNew:true,comptoir_status:tk.comptoir_status||"pending"};
      if(order.comptoir_status==="servi") return;
      comptoirOrders.unshift(order);
      renderComptoir(); playBeep();
      setTimeout(()=>{order.isNew=false;renderComptoir();},8000);
    }).subscribe();
}
async function loadComptoirOrders(){
  const start=new Date(); start.setHours(0,0,0,0);
  const {data:tks}=await sb.from("tickets").select("*,employees(name)").eq("status","payé")
    .gte("created_at",start.toISOString()).order("created_at",{ascending:false});
  if(!tks||!tks.length){ renderComptoir(); return; }
  const ids=tks.map(t=>t.id);
  // Batch IDs to avoid URL length limit (max 200 per request)
  let allItems=[];
  for(let i=0;i<ids.length;i+=200){
    const chunk=ids.slice(i,i+200);
    const {data:chunk_items}=await sb.from("ticket_items").select("*").in("ticket_id",chunk);
    if(chunk_items) allItems=[...allItems,...chunk_items];
  }
  comptoirOrders=tks.filter(t=>t.comptoir_status!=="servi").map(t=>({
    id:t.id,ticket_number:t.ticket_number,server:t.employees?.name||"—",time:new Date(t.created_at),
    items:(allItems||[]).filter(i=>i.ticket_id===t.id),discount:t.discount||0,total:t.total||0,
    payment:t.payment_method||"—",isNew:false,comptoir_status:t.comptoir_status||"pending"
  }));
  renderComptoir();
}
function renderComptoir(){
  const grid=document.getElementById("cpt-grid");
  const countEl=document.getElementById("cpt-count");
  const pending=comptoirOrders.filter(o=>o.comptoir_status!=="servi");
  if(countEl) countEl.textContent=`${pending.length} commande${pending.length>1?"s":""} en attente`;
  if(!pending.length){ grid.innerHTML=`<div class="cpt-empty"><div class="big">✓</div><p>Aucune commande en attente</p></div>`; return; }
  grid.innerHTML=pending.map(o=>`
    <div class="cpt-card${o.isNew?" new":""}" id="cpt-${o.id}">
      <div class="cpt-head"><span class="cpt-num">${o.ticket_number}</span>${o.isNew?'<span class="cpt-badge">NOUVEAU</span>':''}<span class="cpt-time">${pad(o.time.getHours())}:${pad(o.time.getMinutes())}</span></div>
      <div class="cpt-srv">👤 ${o.server}</div>
      <div class="cpt-items">${o.items.map(i=>`
        <div class="cpt-item">
          <span class="cpt-item-n">${i.product_name}</span>
          <span style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:11px;color:#9CA8B8;font-family:'JetBrains Mono',monospace;">${dh(i.unit_price)}</span>
            <span class="cpt-item-q">×${i.qty}</span>
          </span>
        </div>`).join("")}</div>
      <div class="cpt-divider">
        ${o.discount>0?`<div style="display:flex;justify-content:space-between;font-size:12px;color:#9CA8B8;"><span>Remise</span><span>−${dh(o.discount)}</span></div>`:''}
        <div class="cpt-total"><span>Total</span><span style="color:#22C55E;">${dh(o.total)}</span></div>
        <div class="cpt-pay">💳 ${o.payment}</div>
      </div>
      <div class="cpt-btns">
        <button class="cpt-btn-print" onclick="printComptoirTicket(${o.id})">🖨️ Imprimer</button>
        <button class="cpt-btn-servi" onclick="markServi(${o.id})">✓ Servi</button>
      </div>
    </div>`).join("");
}
async function markServi(orderId){
  await sb.from("tickets").update({comptoir_status:"servi"}).eq("id",orderId);
  const order=comptoirOrders.find(o=>o.id===orderId);
  if(order) order.comptoir_status="servi";
  renderComptoir();
}
function printComptoirTicket(orderId){
  const o=comptoirOrders.find(x=>x.id===orderId);
  if(!o) return;
  const d=o.time;
  document.getElementById("print-area").innerHTML=`
    <div style="text-align:center;margin-bottom:8px;">
      <div style="font-size:18px;font-weight:700;">${SHOP}</div>
      <div>${o.ticket_number}</div>
      <div>Servi par : ${o.server}</div>
      <div>${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} — ${pad(d.getHours())}:${pad(d.getMinutes())}</div>
    </div><hr>
    ${o.items.map(i=>`<div style="display:flex;justify-content:space-between;padding:3px 0;"><span>${i.qty}x ${i.product_name}</span><span>${dh(i.subtotal)}</span></div>`).join("")}
    <hr>
    ${o.discount>0?`<div style="display:flex;justify-content:space-between;"><span>Remise</span><span>−${dh(o.discount)}</span></div>`:''}
    <div style="display:flex;justify-content:space-between;font-weight:700;font-size:14px;"><span>Total</span><span>${dh(o.total)}</span></div>
    <div style="margin-top:5px;">Paiement : ${o.payment}</div>
    <hr><div style="text-align:center;">📶 Wifi : ${WIFI}</div>
    <div style="text-align:center;margin-top:5px;">Merci de votre visite !</div>`;
  window.print();
  markServi(orderId);
}

/* ================================================================
   PARAMÈTRES — TOUT MODIFIABLE
================================================================ */
async function loadParametres(){
  document.getElementById("set-shop-name").value=SHOP;
  document.getElementById("set-wifi").value=WIFI;
  renderSettingsCategories();
}
async function saveSettings(){
  const shop=document.getElementById("set-shop-name").value.trim();
  const wifi=document.getElementById("set-wifi").value.trim();
  if(!shop){ toast("Le nom du café est requis",true); return; }
  try{
    await sb.from("app_settings").upsert({key:"shop_name",value:shop},{onConflict:"key"});
    await sb.from("app_settings").upsert({key:"wifi_code",value:wifi},{onConflict:"key"});
    SHOP=shop; WIFI=wifi;
    document.querySelectorAll(".home-logo .hn").forEach(el=>el.textContent=SHOP);
    document.querySelectorAll("#rcp-head .shop").forEach(el=>el.textContent=SHOP);
    document.getElementById("rcp-wifi").textContent=`📶 Wifi : ${WIFI}`;
    toast("Réglages enregistrés");
  }catch(e){
    toast("Erreur : exécute d'abord la migration SQL settings_migration.sql",true);
  }
}

function renderSettingsCategories(){
  const wrap=document.getElementById("settings-categories");
  if(!categories.length){ wrap.innerHTML=`<div class="empty">Aucune catégorie.</div>`; return; }
  wrap.innerHTML=categories.map(c=>{
    const sec=isTerrasseCat(c.name)?"terrasse":"cafe";
    const count=products.filter(p=>p.category_id===c.id).length;
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:11px 14px;background:var(--bg);border-radius:12px;margin-bottom:8px;">
      <div>
        <span style="font-weight:700;">${c.name}</span>
        <span class="tag ${sec==='terrasse'?'tag-ter':'tag-cafe'}" style="margin-left:8px;">${sec==='terrasse'?'🏖️':'☕'}</span>
        <span style="font-size:11.5px;color:var(--ink3);margin-left:8px;">${count} produit${count>1?'s':''}</span>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-ghost btn-sm" onclick="renameCategory(${c.id},'${c.name.replace(/'/g,"\\'")}')">Renommer</button>
        <button class="btn btn-danger btn-sm" onclick="deleteCategory(${c.id},${count})">Supprimer</button>
      </div>
    </div>`;
  }).join("");
}
function renameCategory(id,oldName){
  openModal(`
    <h3>Renommer la catégorie</h3>
    <div class="field"><label>Nom</label><input id="rc-name" value="${oldName}"></div>
    <div class="row" style="margin-top:16px;">
      <button class="btn btn-primary" onclick="saveCategoryRename(${id})">Enregistrer</button>
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    </div>`);
}
async function saveCategoryRename(id){
  const name=document.getElementById("rc-name").value.trim();
  if(!name){ toast("Nom requis",true); return; }
  await sb.from("categories").update({name}).eq("id",id);
  toast("Catégorie renommée"); closeModal();
  await loadCategories(); await loadProducts(); renderSettingsCategories();
}
async function deleteCategory(id,count){
  if(count>0){ toast(`Impossible : ${count} produit(s) utilisent cette catégorie. Supprime-les ou change-les d'abord.`,true); return; }
  if(!confirm("Supprimer définitivement cette catégorie ?")) return;
  await sb.from("categories").delete().eq("id",id);
  toast("Catégorie supprimée");
  await loadCategories(); renderSettingsCategories();
}

/* ─── Suppression définitive de produits ─── */
async function openDeleteProductPicker(){
  const {data}=await sb.from("products").select("*").order("name");
  openModal(`
    <h3>🗑️ Supprimer un produit</h3>
    <p style="font-size:12.5px;color:var(--ink2);margin-bottom:12px;">Suppression définitive (différent de "Désactiver"). Les ventes passées restent dans l'historique.</p>
    <div class="field"><label>Produit</label>
      <select id="del-prod-select">${(data||[]).map(p=>`<option value="${p.id}">${p.name}</option>`).join("")}</select>
    </div>
    <div class="row" style="margin-top:16px;">
      <button class="btn btn-danger" onclick="confirmDeleteProduct()">Supprimer définitivement</button>
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    </div>`);
}
async function confirmDeleteProduct(){
  const id=Number(document.getElementById("del-prod-select").value);
  if(!confirm("Confirmer la suppression définitive de ce produit ?")) return;
  await sb.from("products").delete().eq("id",id);
  toast("Produit supprimé"); closeModal();
  await loadProducts(); loadProdTable();
}

/* ─── Suppression définitive de serveurs ─── */
async function openDeleteServerPicker(){
  const {data}=await sb.from("employees").select("*").order("name");
  openModal(`
    <h3>🗑️ Supprimer un serveur</h3>
    <p style="font-size:12.5px;color:var(--ink2);margin-bottom:12px;">L'historique des ventes de ce serveur reste conservé.</p>
    <div class="field"><label>Serveur</label>
      <select id="del-srv-select">${(data||[]).map(e=>`<option value="${e.id}">${e.name} (${ROLES[e.role]||e.role})</option>`).join("")}</select>
    </div>
    <div class="row" style="margin-top:16px;">
      <button class="btn btn-danger" onclick="confirmDeleteServer()">Supprimer définitivement</button>
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    </div>`);
}
async function confirmDeleteServer(){
  const id=Number(document.getElementById("del-srv-select").value);
  if(!confirm("Confirmer la suppression définitive de ce serveur ?")) return;
  await sb.from("employees").delete().eq("id",id);
  toast("Serveur supprimé"); closeModal();
  loadSrvTable();
}

/* ─── Suppression définitive de tickets (corrections d'erreurs de caisse) ─── */
async function openDeleteTicketPicker(){
  const {data}=await sb.from("tickets").select("*,employees(name)").order("created_at",{ascending:false}).limit(50);
  openModal(`
    <h3>🗑️ Supprimer un ticket</h3>
    <p style="font-size:12.5px;color:var(--ink2);margin-bottom:12px;">⚠️ Suppression totale (différent d'Annuler) — à utiliser uniquement pour corriger une erreur de caisse. Affecte les statistiques.</p>
    <div class="field"><label>Ticket (50 derniers)</label>
      <select id="del-tk-select">${(data||[]).map(t=>`<option value="${t.id}">${t.ticket_number} — ${fmtTime(t.created_at)} — ${t.employees?.name||"—"} — ${dh(t.total)}</option>`).join("")}</select>
    </div>
    <div class="row" style="margin-top:16px;">
      <button class="btn btn-danger" onclick="confirmDeleteTicket()">Supprimer définitivement</button>
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    </div>`);
}
async function confirmDeleteTicket(){
  const id=Number(document.getElementById("del-tk-select").value);
  if(!confirm("Confirmer la suppression DÉFINITIVE de ce ticket et de ses lignes ?")) return;
  await sb.from("ticket_items").delete().eq("ticket_id",id);
  await sb.from("tickets").delete().eq("id",id);
  toast("Ticket supprimé"); closeModal();
  loadTickets();
}


(function init(){
  loadAppSettings();
  if(COMPTOIR_MODE){ initComptoir(); return; }
  buildAdminPinPad();
  tickClockGlobal();
  document.getElementById("tk-from").value=todayStr();
  document.getElementById("tk-to").value=todayStr();
  document.getElementById("rp-from").value=todayStr();
  document.getElementById("rp-month").value=todayStr().slice(0,7);
  showHome();
})();
