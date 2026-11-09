const g=id=>document.getElementById(id);
// Un producto está agotado si lo marcaste manualmente, o si controlas unidades y llegaron a 0
function estaAgotado(p){ return p.stock==='agotado' || (typeof p.cantidad==='number' && p.cantidad<=0); }
// Un producto se OCULTA de la tienda cuando sus unidades llegan a 0 (vuelve solo al añadir stock). En el panel siempre se ve.
function estaOculto(p){ return p.oculto===true || (typeof p.cantidad==='number' && p.cantidad<=0); }
const fmt=n=>'$'+n.toLocaleString('es-CO');
// Escapar HTML para prevenir XSS en textos de clientes (comentarios, reseñas)
function escHtml(s){
  if(s===null||s===undefined)return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
const SHEET_URL='https://script.google.com/macros/s/AKfycbxABFBCg7p0ocZdnoR4klAQSyfofPv7dZ1TsBvnP6L1bo2g9OYjRHoOxzDN4R4l1zr-/exec';
const CATALOGO_URL='https://script.google.com/macros/s/AKfycbzAqFU6wgs8tm0LvHh9R9wely5XwMYftMzOtue-W7TGl39-JNyN2Tn4rPQt0kNPyirXBQ/exec';

// ══ FIREBASE ══
const firebaseConfig={apiKey:"AIzaSyAhIgmilAz_pAbfEZE2-0pbWYpRIxsgJWk",authDomain:"artemisa-beauty.firebaseapp.com",projectId:"artemisa-beauty",storageBucket:"artemisa-beauty.firebasestorage.app",messagingSenderId:"596884326781",appId:"1:596884326781:web:4238d59b755e9903dce414"};
firebase.initializeApp(firebaseConfig);
const fdb=firebase.firestore();

// ══ CONFIG EMAILJS ══
const EMAILJS_CONFIG={
  publicKey:'SJG7q7kqEVOUlWRPN',
  serviceId:'service_xhneu62',
  templatePedido:'template_e78ll0l',
  templateEstado:'template_j5dagv3',
  templateNewsletter:'' // ← Pega aquí el ID de tu plantilla de newsletter (ej: template_xxxx) para enviar correos masivos
};
try{ if(window.emailjs) emailjs.init(EMAILJS_CONFIG.publicKey); }catch(e){console.error('EmailJS init:',e);}

// Correos del dueño que reciben el aviso de pedido nuevo
const ADMIN_NOTIF_EMAILS=['jeison72@hotmail.es','contactoartemisajyc@gmail.com'];
async function enviarCorreoPedidoNuevo(datos){
  if(!window.emailjs)return;
  for(const dest of ADMIN_NOTIF_EMAILS){
    try{
      await emailjs.send(EMAILJS_CONFIG.serviceId,EMAILJS_CONFIG.templatePedido,{
        cliente:datos.nombre,
        telefono:datos.telefono,
        email:dest,
        correo_cliente:datos.email||'No proporcionado',
        direccion:datos.direccion,
        productos:datos.productos,
        total:datos.total
      });
    }catch(e){console.error('Error correo pedido a '+dest+':',e);}
  }
}

async function enviarCorreoEstado(email,cliente,estado,mensaje,productos,total){
  if(!window.emailjs||!email)return;
  try{
    await emailjs.send(EMAILJS_CONFIG.serviceId,EMAILJS_CONFIG.templateEstado,{
      email,cliente,estado,mensaje:mensaje||'',
      productos:productos||'',
      total:total||''
    });
  }catch(e){console.error('Error correo estado:',e);}
}

async function cargarProductosFirebase(){
  // Intentar usar caché primero (para ahorrar lecturas de Firebase)
  try{
    const cache=localStorage.getItem('ab_productos_cache');
    const cacheTime=localStorage.getItem('ab_productos_cache_time');
    const CACHE_MINUTOS=5;
    if(cache&&cacheTime&&(Date.now()-parseInt(cacheTime))<CACHE_MINUTOS*60000){
      products=JSON.parse(cache);
      nextId=Math.max(...products.map(p=>p.id||0),0)+1;
      renderStoreGrid('Todos');renderDestacados();renderAdminTable();updateDash();escanearImagenes();
      updateBrandFilters();updateSubcatFilters();checkProductUrl();
      return; // usó caché, no consulta Firebase
    }
  }catch(e){}
  // Si no hay caché válido, consultar Firebase
  try{
    const snap=await fdb.collection('productos').get();
    if(!snap.empty){
      products=snap.docs.map(d=>({...d.data()}));
      nextId=Math.max(...products.map(p=>p.id||0),0)+1;
      // Guardar en caché
      try{
        localStorage.setItem('ab_productos_cache',JSON.stringify(products));
        localStorage.setItem('ab_productos_cache_time',String(Date.now()));
      }catch(e){}
      renderStoreGrid('Todos');
      renderDestacados();
      renderAdminTable();
      updateDash();
      escanearImagenes();
      updateBrandFilters();
      updateSubcatFilters();
      checkProductUrl();
    }
  }catch(e){console.error('Firebase error:',e)}
}
function limpiarCacheProductos(){
  try{
    localStorage.removeItem('ab_productos_cache');
    localStorage.removeItem('ab_productos_cache_time');
  }catch(e){}
}
async function guardarProductoFirebase(prod){
  try{await fdb.collection('productos').doc(String(prod.id)).set(prod);limpiarCacheProductos();}
  catch(e){showToast('Error guardando: '+e.message,'error')}
}
async function borrarProductoFirebase(id){
  try{await fdb.collection('productos').doc(String(id)).delete();limpiarCacheProductos();}
  catch(e){console.error('Error borrando:',e)}
}
async function guardarContenidoFirebase(){
  const gv=id=>g(id)?.value||'';
  const d={tag:gv('c-tag'),title:gv('c-title'),desc:gv('c-desc'),btn1:gv('c-btn1'),btn2:gv('c-btn2'),aboutSub:gv('c-about-sub'),aboutDesc:gv('c-about-desc'),s1n:gv('c-s1n'),s1l:gv('c-s1l'),s2n:gv('c-s2n'),s2l:gv('c-s2l'),s3n:gv('c-s3n'),s3l:gv('c-s3l'),s4n:gv('c-s4n'),s4l:gv('c-s4l'),heroMedia:gv('c-hero-media'),aboutMedia:gv('c-about-media')};
  try{await fdb.collection('config').doc('contenido').set(d);showToast('Guardado en la nube ✓','success')}
  catch(e){showToast('Error al guardar','error')}
}
async function cargarContenidoFirebase(){
  try{
    const doc=await fdb.collection('config').doc('contenido').get();
    if(!doc.exists)return;
    const d=doc.data();
    const map={'c-tag':'tag','c-title':'title','c-desc':'desc','c-btn1':'btn1','c-btn2':'btn2','c-about-sub':'aboutSub','c-about-desc':'aboutDesc','c-s1n':'s1n','c-s1l':'s1l','c-s2n':'s2n','c-s2l':'s2l','c-s3n':'s3n','c-s3l':'s3l','c-s4n':'s4n','c-s4l':'s4l'};
    Object.entries(map).forEach(([id,key])=>{if(g(id)&&d[key])g(id).value=d[key]});
    if(d.heroMedia){if(g('c-hero-media'))g('c-hero-media').value=d.heroMedia;aplicarHeroMedia(d.heroMedia);}
    if(d.aboutMedia){if(g('c-about-media'))g('c-about-media').value=d.aboutMedia;aplicarAboutMedia(d.aboutMedia);}
    // En el panel, refleja los campos en la vista previa; en la tienda, pinta directo desde Firebase (sin borrar lo que venga vacío)
    if(g('c-s1n')) applyContent(); else pintarContenidoTienda(d);
  }catch(e){console.error('Error contenido:',e)}
}
async function guardarColoresFirebase(){
  aplicarColores();
  const c1=g('cfg-color1')?.value||'#b5516a',c2=g('cfg-color2')?.value||'#c9a96e';
  try{await fdb.collection('config').doc('colores').set({color1:c1,color2:c2});showToast('Colores guardados ✓','success')}
  catch(e){showToast('Error al guardar colores','error')}
}

// ══ CONFIG DE ENVÍOS ══
function renderEnviosConfig(){
  const cont=g('cfg-envios-lista');if(!cont)return;
  if(g('cfg-envio-gratis'))g('cfg-envio-gratis').value=ENVIO_GRATIS_DESDE||0;
  cont.innerHTML=Object.keys(COSTOS_ENVIO).map(d=>`
    <div style="display:flex;align-items:center;gap:6px">
      <span style="font-size:11px;flex:1;color:var(--gray)">${d}</span>
      <input type="number" value="${COSTOS_ENVIO[d]}" data-depto="${d}" class="cfg-envio-input" style="width:90px;border:1px solid var(--border);padding:6px 8px;font-size:12px">
    </div>`).join('');
}

async function guardarEnviosFirebase(){
  // Leer los inputs
  document.querySelectorAll('.cfg-envio-input').forEach(inp=>{
    const d=inp.getAttribute('data-depto');
    COSTOS_ENVIO[d]=parseInt(inp.value)||0;
  });
  ENVIO_GRATIS_DESDE=parseInt(g('cfg-envio-gratis').value)||0;
  try{
    await fdb.collection('config').doc('envios').set({costos:COSTOS_ENVIO,gratisDesde:ENVIO_GRATIS_DESDE});
    showToast('Costos de envío guardados ✓','success');
  }catch(e){showToast('Error al guardar envíos','error')}
}

async function cargarEnviosFirebase(){
  try{
    const d=await fdb.collection('config').doc('envios').get();
    if(d.exists){
      const data=d.data();
      if(data.costos){
        // Migrar nombres antiguos (ej. "Antioquia (Medellín)") a los limpios nuevos
        const limpio={};
        for(const k in data.costos){
          let n=k.replace(/\s*\(.*\)\s*$/,'').trim();
          const ren={'Bogotá':'Bogotá D.C.','Valle':'Valle del Cauca','N. de Santander':'Norte de Santander','San Andrés':'San Andrés y Providencia'};
          limpio[ren[n]||n]=data.costos[k];
        }
        COSTOS_ENVIO=Object.assign({},COSTOS_ENVIO_DEFAULT,limpio);
      }
      if(typeof data.gratisDesde==='number')ENVIO_GRATIS_DESDE=data.gratisDesde;
    }
  }catch(e){}
}
async function cargarColoresFirebase(){
  try{
    const doc=await fdb.collection('config').doc('colores').get();
    if(!doc.exists)return;
    const {color1,color2}=doc.data();
    if(g('cfg-color1'))g('cfg-color1').value=color1;
    if(g('cfg-color2'))g('cfg-color2').value=color2;
    document.documentElement.style.setProperty('--primary',color1);
    document.documentElement.style.setProperty('--gold',color2);
  }catch(e){console.error('Error colores:',e)}
}

// ══ DATOS ══
const EMOJIS=['✨','💄','🧴','🧖','💆','👁️','🌸','🚿','🎨','🌺','💅','🪞','🧼','💊','🌿','🍃','💋','🎀','🫧','🩷'];
let products=[
  {id:1,name:'Sérum Vitamina C',cat:'Skincare',price:89900,oldPrice:120000,img:null,emoji:'✨',badge:'Sale',stars:'★★★★★',desc:''},
  {id:2,name:'Base de Maquillaje HD',cat:'Maquillaje',price:65000,oldPrice:null,img:null,emoji:'💄',badge:'New',stars:'★★★★★',desc:''},
  {id:3,name:'Mascarilla Hidratante',cat:'Skincare',price:45000,oldPrice:null,img:null,emoji:'🧖',badge:null,stars:'★★★★☆',desc:''},
  {id:4,name:'Aceite Capilar Argan',cat:'Cabello',price:52000,oldPrice:70000,img:null,emoji:'💆',badge:'Sale',stars:'★★★★★',desc:''},
  {id:5,name:'Contorno de Ojos',cat:'Skincare',price:78000,oldPrice:null,img:null,emoji:'👁️',badge:'New',stars:'★★★★★',desc:''},
  {id:6,name:'Paleta de Sombras',cat:'Maquillaje',price:95000,oldPrice:null,img:null,emoji:'🎨',badge:null,stars:'★★★★☆',desc:''},
  {id:7,name:'Crema Corporal Rosa',cat:'Corporal',price:38000,oldPrice:null,img:null,emoji:'🌸',badge:null,stars:'★★★★★',desc:''},
  {id:8,name:'Shampoo Nutritivo',cat:'Cabello',price:32000,oldPrice:42000,img:null,emoji:'🚿',badge:'Sale',stars:'★★★★☆',desc:''},
];
let nextId=9,editId=null,selEmoji='✨',cart=[],photoMode='file',currentImg=null,currentCat='Todos';

// ══ TIENDA ══
function imgHtml(p){
  const onload="this.classList.add('visible');var c=this.closest('.card-img');if(c)c.classList.add('cargada')";
  if(p.img&&p.img.startsWith('http'))return`<img src="${p.img}" loading="lazy" style="width:100%;height:100%;object-fit:cover" onload="${onload}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';var c=this.closest('.card-img');if(c)c.classList.add('cargada')"><span style="display:none;width:100%;height:100%;align-items:center;justify-content:center;font-size:72px">${p.emoji||'✨'}</span>`;
  if(p.img&&p.img.startsWith('data'))return`<img src="${p.img}" loading="lazy" style="width:100%;height:100%;object-fit:cover" onload="${onload}">`;
  return`<span style="font-size:72px">${p.emoji||'✨'}</span>`;
}
let currentBrand='Todas', currentSubcat='Todos';

// Marca como visibles las fotos que ya estaban en caché (para que no queden invisibles)
function marcarImagenesCargadas(){
  document.querySelectorAll('.card-img-inner img').forEach(im=>{
    if(im.complete && im.naturalWidth>0){ im.classList.add('visible'); const c=im.closest('.card-img'); if(c)c.classList.add('cargada'); }
  });
}
// Animación de aparición de textos/tarjetas al bajar la página
let _revObs=null;
function activarReveal(){
  const sel='.section-eyebrow,.section-title,.about-text,.about h2,.about p,.newsletter h2,.newsletter p,.product-card,.review-card';
  // Sin soporte de sensor: mostrar todo de una (nunca ocultar)
  if(!('IntersectionObserver' in window)){ document.querySelectorAll(sel).forEach(el=>el.classList.add('reveal','in')); return; }
  if(!_revObs){
    _revObs=new IntersectionObserver((ents)=>{
      ents.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); _revObs.unobserve(e.target); } });
    },{threshold:0.1, rootMargin:'0px 0px -30px 0px'});
  }
  const vh=window.innerHeight||document.documentElement.clientHeight||800;
  document.querySelectorAll(sel).forEach(el=>{
    if(!el.classList.contains('reveal')){
      el.classList.add('reveal');
      const r=el.getBoundingClientRect();
      // Si ya está visible en pantalla al cargar: mostrarlo de una (mismo frame, sin parpadeo)
      if(r.top < vh*0.95 && r.bottom > -40){ el.classList.add('in'); }
      else { _revObs.observe(el); }
    }
  });
  // Red de seguridad: si por lo que sea algo queda oculto, mostrarlo tras 1.4s
  clearTimeout(window._revFail);
  window._revFail=setTimeout(()=>{document.querySelectorAll('.reveal:not(.in)').forEach(el=>{el.classList.add('in');try{_revObs.unobserve(el)}catch(e){}});},1400);
}

function cardHtml(p){
  const ago=estaAgotado(p);
  return `
    <div class="product-card" onclick="${ago?'':('openProductDetail('+p.id+')')}" style="${ago?'opacity:.65':''}">
      ${ago?'<div class="card-badge" style="background:#888">❌ Agotado</div>':(p.stock==='preventa'?'<div class="card-badge" style="background:#d4930a">⏳ Preventa</div>':(p.badge?`<div class="card-badge ${p.badge}">${p.badge}</div>`:''))}
      <div class="card-img"><div class="card-img-inner">${imgHtml(p)}</div></div>
      <div class="card-body">
        <div class="card-cat">${p.cat}${p.subcat?' · '+p.subcat:''}</div>
        <div class="card-name">${p.name}</div>
        <div class="card-stars">${p.stars}</div>
        <div class="card-footer">
          <div class="card-price">${p.oldPrice?`<span class="card-old">${fmt(p.oldPrice)}</span>`:''}${fmt(p.price)}</div>
          ${ago?'<div style="padding:6px 14px;border-radius:20px;background:#eee;color:#999;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase">Agotado</div>':`<button class="card-add" onclick="event.stopPropagation();addCart(${p.id})">+</button>`}
        </div>
      </div>
    </div>`;
}

function renderDestacados(){
  const grid=g('destacados-grid');if(!grid)return;
  const visibles=products.filter(p=>!estaOculto(p));
  let dest=visibles.filter(p=>p.destacado);
  // Si no hay marcados, mostrar los primeros 4 automáticamente
  if(!dest.length)dest=visibles.slice(0,4);
  else dest=dest.slice(0,4);
  grid.innerHTML=dest.length?dest.map(cardHtml).join(''):`<p style="grid-column:1/-1;text-align:center;padding:60px;color:var(--gray)">Aún no hay productos</p>`;
  marcarImagenesCargadas();activarReveal();
}

function verCatalogoCompleto(){
  g('vista-destacados').style.display='none';
  g('vista-catalogo').style.display='block';
  renderStoreGrid('Todos');
  document.getElementById('catalogo').scrollIntoView({behavior:'smooth'});
}
function volverInicio(){
  g('vista-catalogo').style.display='none';
  g('vista-destacados').style.display='block';
  renderDestacados();
  document.getElementById('inicio').scrollIntoView({behavior:'smooth'});
}

function renderStoreGrid(cat){
  currentCat=cat;
  if(!g('store-grid'))return;
  let list=(cat==='Todos'?[...products]:products.filter(p=>p.cat===cat)).filter(p=>!estaOculto(p));
  if(currentBrand&&currentBrand!=='Todas')list=list.filter(p=>p.brand&&p.brand.toLowerCase().includes(currentBrand.toLowerCase()));
  if(currentSubcat&&currentSubcat!=='Todos'){
    // "Buscar por necesidad": busca en subcategoría, nombre, descripción y ficha (sin tildes, singular/plural)
    const terms=normTxt(currentSubcat).split(' ').filter(Boolean);
    const coincide=(hay,t)=>hay.includes(t)||(t.length>3&&t.endsWith('s')&&hay.includes(t.slice(0,-1)))||(t.length>2&&hay.includes(t+'s'));
    list=list.filter(p=>{const hay=normTxt([p.subcat,p.name,p.cat,p.brand,p.desc,p.ficha].filter(Boolean).join(' '));return terms.every(t=>coincide(hay,t));});
  }
  g('store-grid').innerHTML=list.length?list.map(cardHtml).join(''):`<p style="grid-column:1/-1;text-align:center;padding:60px;color:var(--gray)">No hay productos en esta categoría</p>`;
  marcarImagenesCargadas();activarReveal();
}
function filterCat(cat,btn){
  document.querySelectorAll('#cat-filters .cat-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderStoreGrid(cat);
}
// ── Menú lateral de categorías ──
function abrirMenuCat(){
  const list=g('cat-drawer-list');
  let html=`<a onclick="irACategoria('Todos')">Todos los productos</a>`;
  html+=(typeof categorias!=='undefined'?categorias:['Skincare','Maquillaje','Cabello','Corporal']).map(c=>`<a onclick="irACategoria('${c.replace(/'/g,"\\'")}')">${c}</a>`).join('');
  html+=`<a class="drawer-sec" onclick="irASeccion('nosotros')">Nosotros</a>`;
  html+=`<a class="drawer-sec" onclick="irASeccion('contacto')">Contacto</a>`;
  list.innerHTML=html;
  g('cat-drawer').classList.add('open');g('cat-drawer-overlay').classList.add('open');document.body.style.overflow='hidden';
}
function cerrarMenuCat(){g('cat-drawer').classList.remove('open');g('cat-drawer-overlay').classList.remove('open');document.body.style.overflow='';}
function irASeccion(id){cerrarMenuCat();const el=document.getElementById(id);if(el)el.scrollIntoView({behavior:'smooth'});}
function irACategoria(cat){
  cerrarMenuCat();
  g('vista-destacados').style.display='none';
  g('vista-catalogo').style.display='block';
  currentBrand='Todas';currentSubcat='Todos';
  const sb=g('subcat-search');if(sb)sb.value='';const bs=g('brand-search');if(bs)bs.value='';
  document.querySelectorAll('#cat-filters .cat-btn').forEach(b=>b.classList.toggle('active',b.textContent.trim()===cat));
  renderStoreGrid(cat);
  const c=document.getElementById('catalogo');if(c)c.scrollIntoView({behavior:'smooth'});
}
function filterBrand(brand){
  currentBrand=(!brand||brand.trim()==='')?'Todas':brand.trim();
  renderStoreGrid(currentCat);
}
function filterSubcat(subcat){
  currentSubcat=(!subcat||subcat.trim()==='')?'Todos':subcat.trim();
  renderStoreGrid(currentCat);
}
function updateBrandFilters(){
  const brands=[...new Set(products.filter(p=>p.brand).map(p=>p.brand))];
  const dl=document.getElementById('brand-list');
  const row=document.getElementById('brand-filter-row');
  if(!dl)return;
  if(!brands.length){if(row)row.style.display='none';return}
  if(row)row.style.display='flex';
  dl.innerHTML=`<option value="Todas">`+brands.map(b=>`<option value="${b}">`).join('');
}
function updateSubcatFilters(){
  const subs=[...new Set(products.filter(p=>p.subcat).map(p=>p.subcat))];
  const dl=document.getElementById('subcat-list');
  const row=document.getElementById('subcat-filter-row');
  if(!dl)return;
  if(!subs.length){if(row)row.style.display='none';return}
  if(row)row.style.display='flex';
  dl.innerHTML=`<option value="Todos">`+subs.map(s=>`<option value="${s}">`).join('');
}
// Colores
const colorMap={
// Básicos
'negro':'#1a1a1a','blanco':'#F5F5F5','gris':'#808080','gray':'#808080','gris claro':'#C4C4C4','gris oscuro':'#404040',
'rojo':'#C0392B','azul':'#2980B9','verde':'#27AE60','amarillo':'#F0C030','naranja':'#E8781A','morado':'#8E44AD',
'rosa':'#E8859A','café':'#6B3A2A','cafe':'#6B3A2A','marron':'#7B3F2A','marrón':'#7B3F2A',
'dorado':'#C9A96E','plateado':'#C0C0C0','bronce':'#B08D57',
// Tonos de piel / base de maquillaje (claro a oscuro)
'porcelana':'#F5E6DC','marfil':'#F3E4D4','beige claro':'#EAD3B8','beige':'#E8C9A0','nude':'#E0B896',
'natural':'#D8B894','arena':'#D4B48C','durazno':'#F0C0A0','miel':'#D4A574','dorado medio':'#C89A5E',
'canela':'#B87F52','caramelo':'#C68642','avellana':'#A87848','almendra':'#9C6B3C','moka':'#7A4E2E',
'chocolate':'#5A3620','cacao':'#4A2C1A','café oscuro':'#3D2415','ébano':'#2E1C12',
'nude rosado':'#E4BBA8','nude beige':'#DBB595','tostado':'#B08256','bronceado':'#C08850',
// Rosas y rojos
'rosa palo':'#DDB8B8','rosa empolvado':'#D4A5A5','rosa viejo':'#C88B8B','rosa chicle':'#F080A0',
'palo de rosa':'#C99',  'coral':'#E8856A','salmón':'#FA8072','salmon':'#FA8072','fucsia':'#E040A0',
'magenta':'#CC2288','cereza':'#C02040','vino':'#800040','vino tinto':'#6B1020','borgoña':'#722F37',
'rojo cereza':'#9B1B2A','carmesí':'#960018','rubí':'#9B111E','frambuesa':'#C73E5A',
// Malvas, lilas, morados
'malva':'#C8A0B4','lila':'#C4B0D4','lavanda':'#C5B8D4','lavanda pálido':'#C5B8D4','lavanda palido':'#C5B8D4',
'violeta':'#8B5FBF','púrpura':'#7B3F98','uva':'#5E2D79','ciruela':'#8E4585',
// Azules y verdes
'azul marino':'#1A2A5A','marino':'#1A2A5A','azul cielo':'#7EC8E3','celeste':'#87CEEB','turquesa':'#40C0C0',
'aguamarina':'#7FD4C0','menta':'#98D8B0','esmeralda':'#009874','verde oliva':'#808040','oliva':'#808040',
'verde militar':'#4B5320','verde agua':'#A0D8C8','jade':'#00A86B','pino':'#2A5040',
// Beiges, cremas, tierras
'crema':'#F5ECD8','perla':'#F0EDE8','hueso':'#E8E0D0','vainilla':'#F3E5AB','trigo':'#D4B886',
'camel':'#C19A6B','taupe':'#B09080','topo':'#8B7D6B','arcilla':'#B5651D','terracota':'#C17A5A',
'ocre':'#CC7722','mostaza':'#D4A017','tierra':'#8B5A2B',
'gris lino':'#C8C4BE','beige arena':'#D4C0A0','beige rosado':'#E5C8B8',
// Tintes de cabello (gama completa)
'rubio':'#D4A840','rubio claro':'#E6C878','rubio oscuro':'#B8923C','rubio ceniza':'#C4B896','rubio dorado':'#D4AA50',
'rubio platino':'#EDE4CC','rubio miel':'#C99A4E','rubio arena':'#CDB482','rubio cobrizo':'#C87D42',
'castaño':'#5C3010','castaño claro':'#7B4520','castaño oscuro':'#3A1E0C','castaño medio':'#4E2C14',
'castaño ceniza':'#5A4636','castaño dorado':'#6B4423','castaño cobrizo':'#7A3B1E','castaño chocolate':'#3D2415',
'cobrizo':'#B8642A','cobre':'#B87333','caoba':'#6B2A1A','caoba rojizo':'#7B241C','rojo intenso':'#A01810',
'rojo fuego':'#C41E10','pelirrojo':'#B55020','platino':'#EDE4D4','platinado':'#EDE4D4',
'gris plata':'#C0C0C0','plata':'#C8C8C8','gris humo':'#8A8A8A','negro azulado':'#151828',
'negro intenso':'#0D0D0D','café natural':'#4A2E1C',
// Esmaltes vibrantes
'nude esmalte':'#E4C4B0','rosa nude':'#E8C0C0','rojo clásico':'#C41E3A','rojo pasión':'#B01030',
'negro mate':'#1C1C1C','blanco perla':'#F8F4EC','azul rey':'#1E40AF','verde neón':'#39FF14',
'amarillo neón':'#FFFF33','naranja neón':'#FF6600','rosa neón':'#FF6EC7','morado neón':'#BF00FF',
'glitter dorado':'#D4AF37','glitter plateado':'#C0C0C0','holográfico':'#D8C8E8','nacarado':'#F0E8E0'
};
function getColorHex(n){
  if(!n)return null;
  const norm=s=>s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const key=n.toLowerCase().trim();
  // 1. Coincidencia exacta
  if(colorMap[key])return colorMap[key];
  // 2. Sin acentos
  const nk=norm(n);
  for(const [k,v] of Object.entries(colorMap)){ if(norm(k)===nk)return v; }
  // 3. Quitar números y códigos de tinte (ej "7-77 Rubio Medio" -> "rubio medio")
  const limpio=norm(n).replace(/[0-9\-\.]/g,'').trim();
  if(limpio){
    for(const [k,v] of Object.entries(colorMap)){ if(norm(k)===limpio)return v; }
    // 4. Coincidencia parcial: si el nombre del color aparece en el texto
    for(const [k,v] of Object.entries(colorMap)){ if(limpio.includes(norm(k))&&norm(k).length>3)return v; }
  }
  return null;
}
function selectColor(color,el){
  document.querySelectorAll('#product-detail-modal .color-swatch').forEach(s=>{s.style.border='2px solid transparent';s.style.transform='scale(1)'});
  el.style.border='2px solid #1a1a1a';el.style.transform='scale(1.15)';
  const lb=document.getElementById('sel-color-lb');if(lb)lb.textContent=color;
  window._selectedColor=color;
}
function openProductDetail(id){
  const p=products.find(x=>x.id===id);if(!p)return;
  window._selectedColor=null;window._pdQty=1;
  const galeria=(p.imgs&&p.imgs.length)?p.imgs:(p.img?[p.img]:[]);
  const principal=galeria[0]||null;
  const imgHt=principal
    ?`<img id="pd-main-img" src="${principal}" style="width:100%;height:100%;object-fit:contain;object-position:center;display:block" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span style="display:none;width:100%;height:100%;align-items:center;justify-content:center;font-size:100px">${p.emoji||'✨'}</span>`
    :`<span style="font-size:100px">${p.emoji||'✨'}</span>`;
  // Tira de miniaturas si hay más de una foto
  const thumbsHt=(galeria.length>1)
    ?`<div class="pd-thumbs">${galeria.map((u,i)=>`<img src="${u}" class="pd-thumb${i===0?' active':''}" onclick="cambiarFotoPrincipal(this,'${u.replace(/'/g,"\\'")}')">`).join('')}</div>`
    :'';
  // Mensaje de WhatsApp: link a MI propia página del producto (nunca el link externo de la foto del proveedor)
  const waMiLink='\n'+getProductUrl(p.id);
  const waTexto='Hola, me interesa este producto de Artemisa Beauty:\n*'+p.name+'* - '+fmt(p.price)+waMiLink;
  const waLink='https://wa.me/573107809662?text='+encodeURIComponent(waTexto);
  // Colores: preferir la lista estructurada (paleta + nombre); si no, el texto antiguo
  let colorPares=[];
  if(Array.isArray(p.coloresLista)&&p.coloresLista.length){
    colorPares=p.coloresLista.filter(c=>c&&c.name).map(c=>({name:c.name,hex:c.hex||getColorHex(c.name)||'#dddddd'}));
  }else if(p.colors){
    colorPares=p.colors.split(',').map(s=>s.trim()).filter(Boolean).map(nm=>({name:nm,hex:getColorHex(nm)}));
  }
  let colorHtml='';
  if(colorPares.length){
    const swatches=colorPares.map(c=>{
      const bg=c.hex||'#ddd';
      const inner=(!c.hex)?`<span style="font-size:9px;color:#555;display:flex;align-items:center;justify-content:center;height:100%;padding:2px;text-align:center;line-height:1">${c.name}</span>`:'';
      return`<div class="color-swatch" style="width:36px;height:36px;border-radius:6px;cursor:pointer;border:2px solid transparent;transition:all .2s;background:${bg};flex-shrink:0" title="${c.name}" onclick="selectColor('${c.name.replace(/'/g,"\\'")}',this)">${inner}</div>`;
    }).join('');
    colorHtml=`<div style="margin:14px 0 8px"><div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--gray);margin-bottom:6px;font-weight:600">Color: <span id="sel-color-lb" style="color:var(--primary)">Selecciona un color</span></div><div style="display:flex;gap:8px;flex-wrap:wrap">${swatches}</div></div>`;
  }
  g('product-detail-body').innerHTML=`
    <div class="pd-col-img">
      <div class="pd-img" id="pd-img-zoom" style="position:relative;overflow:hidden;cursor:crosshair">${imgHt}${principal?'<div style="position:absolute;bottom:12px;right:12px;background:rgba(0,0,0,.55);color:#fff;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;pointer-events:none;z-index:2">🔍</div>':''}</div>
      ${thumbsHt}
    </div>
    <div class="pd-info">
      <div class="pd-cat">${p.cat}</div>
      <div class="pd-name">${p.name}</div>
      <div class="pd-stars">${p.stars}</div>
      <div class="pd-price">${p.oldPrice?`<span class="pd-old">${fmt(p.oldPrice)}</span>`:''} ${fmt(p.price)}</div>
      ${p.tamano?`<div style="font-size:12px;color:var(--gray);margin:2px 0 6px">Presentación: <strong style="color:var(--black)">${escHtml(p.tamano)}</strong></div>`:''}
      <div style="margin:6px 0 10px"><addi-widget price="${p.price}" ally-slug="artemisabellezajyc-ecommerce"></addi-widget></div>
      ${colorHtml}
      <div id="pd-text-wrap" class="pd-collapse">
        <div class="pd-desc">${p.desc||'<em>Sin descripción aún.</em>'}</div>
        ${p.ficha?`<div style="margin-top:14px"><div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--gray);margin-bottom:6px;font-weight:600">Ficha técnica</div><ul style="margin:0;padding-left:18px;font-size:13px;color:#444;line-height:1.7">${p.ficha.split(/\n+/).map(l=>l.trim()).filter(Boolean).map(l=>`<li>${escHtml(l)}</li>`).join('')}</ul></div>`:''}
      </div>
      <button id="pd-toggle" onclick="togglePdText()" style="display:none">Mostrar más ▾</button>
      <div style="display:flex;align-items:center;gap:14px;margin:16px 0 4px">
        <span style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--gray);font-weight:600">Cantidad</span>
        <div style="display:inline-flex;align-items:center;border:1px solid var(--border);border-radius:30px;overflow:hidden">
          <button onclick="cambiarPdQty(-1)" style="border:none;background:var(--light);width:38px;height:38px;font-size:20px;cursor:pointer;color:var(--black)">−</button>
          <span id="pd-qty" style="min-width:40px;text-align:center;font-weight:600;font-size:15px">1</span>
          <button onclick="cambiarPdQty(1)" style="border:none;background:var(--light);width:38px;height:38px;font-size:20px;cursor:pointer;color:var(--black)">+</button>
        </div>
      </div>
      <div class="pd-actions">
        <button class="pd-btn-cart" onclick="addCartWithColor(${p.id})">🛒 Agregar al carrito</button>
        <a class="pd-btn-wa" href="${waLink}" target="_blank">💬 Pedir por WhatsApp</a>
        <button onclick="compartirProducto(${p.id})" style="width:100%;padding:11px;background:var(--light);color:var(--black);border:1px solid var(--border);cursor:pointer;font-family:var(--sans);font-size:12px;letter-spacing:.06em;text-transform:uppercase;font-weight:500">🔗 Compartir</button>
      </div>
    </div>`;
  g('product-detail-modal').classList.add('open');
  // Colapsar texto largo: mostrar botón solo si el texto es largo
  setTimeout(()=>{
    const tw=g('pd-text-wrap'),tg=g('pd-toggle');
    if(tw&&tg){ if(tw.scrollHeight>tw.clientHeight+12){ tg.style.display='inline-block'; } else { tw.classList.add('open'); tg.style.display='none'; } }
  },60);
  activarLente();
}
function togglePdText(){
  const tw=g('pd-text-wrap'),tg=g('pd-toggle');if(!tw)return;
  const open=tw.classList.toggle('open');
  if(tg)tg.textContent=open?'Mostrar menos ▴':'Mostrar más ▾';
}
function cambiarPdQty(delta){
  window._pdQty=Math.max(1,(window._pdQty||1)+delta);
  const el=g('pd-qty');if(el)el.textContent=window._pdQty;
}
function addCartWithColor(id){
  const p=products.find(x=>x.id===id);
  if(!p)return;
  if(estaAgotado(p)){showToast('Este producto está agotado','error');return;}
  const cols=(Array.isArray(p.coloresLista)&&p.coloresLista.length)?p.coloresLista.filter(c=>c&&c.name).map(c=>c.name):(p.colors?p.colors.split(',').map(c=>c.trim()).filter(Boolean):[]);
  if(cols.length&&!window._selectedColor){showToast('Selecciona un color primero','error');return}
  const qty=Math.max(1,window._pdQty||1);
  const key=String(id)+'_'+(window._selectedColor||'');
  const ex=cart.find(x=>x._cartKey===key);
  if(ex)ex.qty+=qty;
  else cart.push({...p,selectedColor:window._selectedColor||null,qty:qty,_cartKey:key});
  updateCartUI();
  showToast('✓ '+qty+' × '+p.name+(window._selectedColor?' - '+window._selectedColor:'')+ ' añadido','success');
  closeProductDetail();
}
function closeProductDetail(){g('product-detail-modal').classList.remove('open')}
function cambiarFotoPrincipal(el,url){
  const main=g('pd-main-img');if(!main)return;
  main.style.transform='scale(1)';main.style.display='block';main.src=url;
  document.querySelectorAll('.pd-thumb').forEach(t=>t.classList.remove('active'));
  if(el)el.classList.add('active');
}
// Avisa si alguna foto extra del formulario no carga
function chequearFotosExtra(ta){
  const urls=ta.value.split(/[\n|]+/).map(s=>s.trim()).filter(Boolean);
  urls.forEach(u=>{
    if(!/^https?:\/\//.test(u))return;
    const im=new Image();
    im.onerror=()=>showToast('⚠️ Una foto no cargó, revisa el enlace','error');
    im.src=u;
  });
}
function abrirZoom(src){if(!src)return;const ov=g('zoom-overlay');g('zoom-img').src=src;ov.style.display='flex';}
function cerrarZoom(){g('zoom-overlay').style.display='none';}
function activarLente(){
  const cont=g('pd-img-zoom');if(!cont)return;
  const img=cont.querySelector('img');if(!img)return;
  function mover(clientX,clientY){
    const r=cont.getBoundingClientRect();
    const x=Math.max(0,Math.min(100,((clientX-r.left)/r.width)*100));
    const y=Math.max(0,Math.min(100,((clientY-r.top)/r.height)*100));
    img.style.transformOrigin=`${x}% ${y}%`;
    img.style.transform='scale(2.2)';
  }
  function soltar(){img.style.transform='scale(1)';}
  // Mouse (PC)
  cont.addEventListener('mousemove',e=>mover(e.clientX,e.clientY));
  cont.addEventListener('mouseleave',soltar);
  // Táctil (móvil): mantener presionado y arrastrar para hacer zoom
  cont.addEventListener('touchstart',e=>{e.preventDefault();const t=e.touches[0];mover(t.clientX,t.clientY);},{passive:false});
  cont.addEventListener('touchmove',e=>{e.preventDefault();const t=e.touches[0];mover(t.clientX,t.clientY);},{passive:false});
  cont.addEventListener('touchend',soltar);
}


// ══ SEARCH ══
// Normaliza texto: minúsculas, sin tildes/acentos y sin espacios extra
function normTxt(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();}
function openSearch(){g('search-overlay').classList.add('open');g('search-input').focus();g('search-results').innerHTML=''}
function closeSearch(){g('search-overlay').classList.remove('open');g('search-input').value=''}
function doSearch(q){
  const res=g('search-results');
  if(!q.trim()){res.innerHTML='';return}
  // Busca por varias palabras, ignorando tildes y mayúsculas, en nombre, categoría, subcategoría, marca, descripción y ficha técnica
  const terms=normTxt(q).split(' ').filter(Boolean);
  // Coincide aunque sea singular/plural (shampoo ↔ shampoos, crema ↔ cremas)
  const coincide=(hay,t)=>hay.includes(t)||(t.length>3&&t.endsWith('s')&&hay.includes(t.slice(0,-1)))||(t.length>2&&hay.includes(t+'s'));
  const found=products.filter(p=>{
    if(estaOculto(p))return false;
    const hay=normTxt([p.name,p.cat,p.subcat,p.brand,p.desc,p.ficha].filter(Boolean).join(' '));
    return terms.every(t=>coincide(hay,t));
  });
  if(!found.length){res.innerHTML='<div class="sr-empty">No se encontraron productos para "'+q+'"</div>';return}
  res.innerHTML=found.map(p=>`
    <div class="sr-item" onclick="closeSearch();openProductDetail(${p.id})">
      <div class="sr-img">${p.img?`<img src="${p.img}">`:(p.emoji||'✨')}</div>
      <div><div class="sr-name">${p.name}</div><div class="sr-meta">${p.cat} · ${fmt(p.price)}</div></div>
    </div>`).join('');
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeSearch();closeProductDetail()}});

// ══ CART ══
function addCart(id){
  const p=products.find(x=>x.id===id);
  if(!p)return;
  if(estaAgotado(p)){showToast('Este producto está agotado','error');return;}
  const key=String(id)+'_';
  const ex=cart.find(x=>x._cartKey===key);
  if(ex)ex.qty++;else cart.push({...p,qty:1,_cartKey:key,selectedColor:null});
  updateCartUI();showToast('✓ '+p.name+' añadido','success');
}
function rmCart(key){cart=cart.filter(x=>(x._cartKey||x.id)!==key);updateCartUI()}
function chQty(key,d){const i=cart.find(x=>(x._cartKey||x.id)===(typeof key==='number'?key:key));if(!i)return;i.qty+=d;if(i.qty<=0)rmCart(key);else updateCartUI()}
function updateCartUI(){
  try{localStorage.setItem('artemisa_cart',JSON.stringify(cart))}catch(e){}
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0),count=cart.reduce((s,i)=>s+i.qty,0);
  g('cart-count').textContent=count;
  const el=g('cart-items'),ftr=g('cart-ftr');
  if(!cart.length){el.innerHTML='<div class="cart-empty"><span>🛍️</span><p>Tu carrito está vacío</p></div>';ftr.style.display='none';return}
  el.innerHTML=cart.map(i=>`<div class="c-item"><div class="c-img">${i.img?`<img src="${i.img}">`:(i.emoji||'✨')}</div><div class="c-info"><div class="c-name">${i.name}${i.selectedColor?` <span style="font-size:10px;color:var(--gray)">- ${i.selectedColor}</span>`:''}</div><div class="c-price">${fmt(i.price)}</div><div class="c-qty"><button class="q-btn" onclick="chQty('${i._cartKey||i.id}',-1)">−</button><span class="q-num">${i.qty}</span><button class="q-btn" onclick="chQty('${i._cartKey||i.id}',1)">+</button></div></div><button class="rm-btn" onclick="rmCart('${i._cartKey||i.id}')">×</button></div>`).join('');
  if(g('c-sub'))g('c-sub').textContent=fmt(total);
  if(g('c-sub-cart'))g('c-sub-cart').textContent=fmt(total);
  ftr.style.display='block';
  llenarDeptos();
  calcularEnvio(); // recalcula total con envío si ya eligió depto
}
function toggleCart(){g('cart-sidebar').classList.toggle('open');g('cart-overlay').classList.toggle('open');llenarDeptos();}
function abrirCheckout(){
  if(!cart.length){showToast('El carrito está vacío','error');return}
  // cerrar el carrito lateral y abrir el modal de datos
  g('cart-sidebar').classList.remove('open');
  g('cart-overlay').classList.remove('open');
  g('ck-overlay').classList.add('open');
  document.body.style.overflow='hidden';
  llenarDeptos();calcularEnvio();
}
function cerrarCheckout(){
  g('ck-overlay').classList.remove('open');
  document.body.style.overflow='';
}

// ══ CATALOGO SHEET ══
async function enviarACatalogoSheet(prod){
  try{
    const url=CATALOGO_URL+
      '?accion=addCatalogo'+
      '&id='+encodeURIComponent(prod.id)+
      '&nombre='+encodeURIComponent(prod.name)+
      '&descripcion='+encodeURIComponent(prod.desc||'')+
      '&precio='+encodeURIComponent(prod.price)+
      '&categoria='+encodeURIComponent(prod.cat)+
      '&foto='+encodeURIComponent(prod.img||'')+
      '&badge='+encodeURIComponent(prod.badge||'')+
      '&estrellas='+encodeURIComponent(prod.stars||'★★★★★');
    await new Promise((resolve)=>{
      const img=new Image();
      img.onload=img.onerror=resolve;
      img.src=url;
      setTimeout(resolve,4000);
    });
  }catch(e){console.error('Error Sheet catálogo:',e)}
}

// ══ ENVÍO POR DEPARTAMENTO (costos reales de la tabla VTEX) ══
const COSTOS_ENVIO_DEFAULT={"Bogotá D.C.":9000,"Cundinamarca":13500,"Boyacá":14000,"Caldas":14500,"Antioquia":15000,"Valle del Cauca":15000,"Risaralda":15000,"Quindío":15000,"Tolima":15000,"Huila":15000,"Santander":15000,"Meta":15000,"Casanare":15000,"Cesar":15000,"Córdoba":15000,"Magdalena":15000,"La Guajira":15000,"Caquetá":15000,"Guainía":15000,"Sucre":16000,"Norte de Santander":17000,"Atlántico":18000,"Bolívar":18000,"Cauca":18000,"Nariño":18000,"Chocó":18000,"Guaviare":18000,"Putumayo":19000,"Arauca":20500,"Amazonas":40000,"Vaupés":40000,"Vichada":40000,"San Andrés y Providencia":45000};
const MUNICIPIOS={"Bogotá D.C.":["Bogotá D.C."],"Amazonas":["Leticia","Puerto Nariño"],"Antioquia":["Abejorral","Abriaquí","Alejandría","Amagá","Amalfi","Andes","Angelópolis","Angostura","Anorí","Anzá","Apartadó","Arboletes","Argelia","Armenia","Barbosa","Bello","Belmira","Betania","Betulia","Briceño","Buriticá","Cáceres","Caicedo","Caldas","Campamento","Cañasgordas","Caracolí","Caramanta","Carepa","Carolina del Príncipe","Caucasia","Chigorodó","Cisneros","Ciudad Bolívar","Cocorná","Concepción","Concordia","Copacabana","Dabeiba","Donmatías","Ebéjico","El Bagre","El Carmen de Viboral","El Peñol","El Retiro","El Santuario","Entrerríos","Envigado","Fredonia","Frontino","Giraldo","Girardota","Gómez Plata","Granada","Guadalupe","Guarne","Guatapé","Heliconia","Hispania","Itagüí","Ituango","Jardín","Jericó","La Ceja","La Estrella","La Pintada","La Unión","Liborina","Maceo","Marinilla","Medellín","Montebello","Murindó","Mutatá","Nariño","Nechí","Necoclí","Olaya","Peque","Pueblorrico","Puerto Berrío","Puerto Nare","Puerto Triunfo","Remedios","Rionegro","Sabanalarga","Sabaneta","Salgar","San Andrés de Cuerquia","San Carlos","San Francisco","San Jerónimo","San José de la Montaña","San Juan de Urabá","San Luis","San Pedro de Urabá","San Pedro de los Milagros","San Rafael","San Roque","San Vicente","Santa Bárbara","Santa Fe de Antioquia","Santa Rosa de Osos","Santo Domingo","Segovia","Sonsón","Sopetrán","Támesis","Tarazá","Tarso","Titiribí","Toledo","Turbo","Uramita","Urrao","Valdivia","Valparaíso","Vegachí","Venecia","Vigía del Fuerte","Yalí","Yarumal","Yolombó","Yondó","Zaragoza"],"Arauca":["Arauca","Arauquita","Cravo Norte","Fortul","Puerto Rondón","Saravena","Tame"],"Atlántico":["Baranoa","Barranquilla","Campo de la Cruz","Candelaria","Galapa","Juan de Acosta","Luruaco","Malambo","Manatí","Palmar de Varela","Piojó","Polonuevo","Ponedera","Puerto Colombia","Repelón","Sabanagrande","Sabanalarga","Santa Lucía","Santo Tomás","Soledad","Suán","Tubará","Usiacurí"],"Bolívar":["Achí","Altos del Rosario","Arenal","Arjona","Arroyohondo","Barranco de Loba","Brazuelo de Papayal","Calamar","Cantagallo","Cartagena de Indias","Cicuco","Clemencia","Córdoba","El Carmen de Bolívar","El Guamo","El Peñón","Hatillo de Loba","Magangué","Mahates","Margarita","María la Baja","Mompós","Montecristo","Morales","Norosí","Pinillos","Regidor","Río Viejo","San Cristóbal","San Estanislao","San Fernando","San Jacinto del Cauca","San Jacinto","San Juan Nepomuceno","San Martín de Loba","San Pablo","Santa Catalina","Santa Rosa","Santa Rosa del Sur","Simití","Soplaviento","Talaigua Nuevo","Tiquisio","Turbaco","Turbaná","Villanueva","Zambrano"],"Boyacá":["Almeida","Aquitania","Arcabuco","Belén","Berbeo","Betéitiva","Boavita","Boyacá","Briceño","Buenavista","Busbanzá","Caldas","Campohermoso","Cerinza","Chinavita","Chiquinquirá","Chíquiza","Chiscas","Chita","Chitaraque","Chivatá","Chivor","Ciénega","Cómbita","Coper","Corrales","Covarachía","Cubará","Cucaita","Cuítiva","Duitama","El Cocuy","El Espino","Firavitoba","Floresta","Gachantivá","Gámeza","Garagoa","Guacamayas","Guateque","Guayatá","Güicán","Iza","Jenesano","Jericó","La Capilla","La Uvita","La Victoria","Labranzagrande","Macanal","Maripí","Miraflores","Mongua","Monguí","Moniquirá","Motavita","Muzo","Nobsa","Nuevo Colón","Oicatá","Otanche","Pachavita","Páez","Paipa","Pajarito","Panqueba","Pauna","Paya","Paz del Río","Pesca","Pisba","Puerto Boyacá","Quípama","Ramiriquí","Ráquira","Rondón","Saboyá","Sáchica","Samacá","San Eduardo","San José de Pare","San Luis de Gaceno","San Mateo","San Miguel de Sema","San Pablo de Borbur","Santa María","Santa Rosa de Viterbo","Santa Sofía","Santana","Sativanorte","Sativasur","Siachoque","Soatá","Socha","Socotá","Sogamoso","Somondoco","Sora","Soracá","Sotaquirá","Susacón","Sutamarchán","Sutatenza","Tasco","Tenza","Tibaná","Tibasosa","Tinjacá","Tipacoque","Toca","Togüí","Tópaga","Tota","Tunja","Tununguá","Turmequé","Tuta","Tutazá","Úmbita","Ventaquemada","Villa de Leyva","Viracachá","Zetaquira"],"Caldas":["Aguadas","Anserma","Aranzazu","Belalcázar","Chinchiná","Filadelfia","La Dorada","La Merced","Manizales","Manzanares","Marmato","Marquetalia","Marulanda","Neira","Norcasia","Pácora","Palestina","Pensilvania","Riosucio","Risaralda","Salamina","Samaná","San José","Supía","Victoria","Villamaría","Viterbo"],"Caquetá":["Albania","Belén de los Andaquíes","Cartagena del Chairá","Curillo","El Doncello","El Paujil","Florencia","La Montañita","Milán","Morelia","Puerto Rico","San José del Fragua","San Vicente del Caguán","Solano","Solita","Valparaíso"],"Casanare":["Aguazul","Chámeza","Hato Corozal","La Salina","Maní","Monterrey","Nunchía","Orocué","Paz de Ariporo","Pore","Recetor","Sabanalarga","Sácama","San Luis de Palenque","Támara","Tauramena","Trinidad","Villanueva","Yopal"],"Cauca":["Almaguer","Argelia","Balboa","Bolívar","Buenos Aires","Cajibío","Caldono","Caloto","Corinto","El Tambo","Florencia","Guachené","Guapí","Inzá","Jambaló","La Sierra","La Vega","López de Micay","Mercaderes","Miranda","Morales","Padilla","Páez","Patía","Piamonte","Piendamó","Popayán","Puerto Tejada","Puracé","Rosas","San Sebastián","Santa Rosa","Santander de Quilichao","Silvia","Sotará","Suárez","Sucre","Timbío","Timbiquí","Toribío","Totoró","Villa Rica"],"Cesar":["Aguachica","Agustín Codazzi","Astrea","Becerril","Bosconia","Chimichagua","Chiriguaná","Curumaní","El Copey","El Paso","Gamarra","González","La Gloria (Cesar)","La Jagua de Ibirico","La Paz","Manaure Balcón del Cesar","Pailitas","Pelaya","Pueblo Bello","Río de Oro","San Alberto","San Diego","San Martín","Tamalameque","Valledupar"],"Chocó":["Acandí","Alto Baudó","Bagadó","Bahía Solano","Bajo Baudó","Bojayá","Cantón de San Pablo","Cértegui","Condoto","El Atrato","El Carmen de Atrato","El Carmen del Darién","Istmina","Juradó","Litoral de San Juan","Lloró","Medio Atrato","Medio Baudó","Medio San Juan","Nóvita","Nuquí","Quibdó","Río Iró","Río Quito","Riosucio","San José del Palmar","Sipí","Tadó","Unión Panamericana","Unguía"],"Cundinamarca":["Agua de Dios","Albán","Anapoima","Anolaima","Apulo","Arbeláez","Beltrán","Bituima","Bogotá","Bojacá","Cabrera","Cachipay","Cajicá","Caparrapí","Cáqueza","Carmen de Carupa","Chaguaní","Chía","Chipaque","Choachí","Chocontá","Cogua","Cota","Cucunubá","El Colegio","El Peñón","El Rosal","Facatativá","Fómeque","Fosca","Funza","Fúquene","Fusagasugá","Gachalá","Gachancipá","Gachetá","Gama","Girardot","Granada","Guachetá","Guaduas","Guasca","Guataquí","Guatavita","Guayabal de Síquima","Guayabetal","Gutiérrez","Jerusalén","Junín","La Calera","La Mesa","La Palma","La Peña","La Vega","Lenguazaque","Machetá","Madrid","Manta","Medina","Mosquera","Nariño","Nemocón","Nilo","Nimaima","Nocaima","Pacho","Paime","Pandi","Paratebueno","Pasca","Puerto Salgar","Pulí","Quebradanegra","Quetame","Quipile","Ricaurte","San Antonio del Tequendama","San Bernardo","San Cayetano","San Francisco","San Juan de Rioseco","Sasaima","Sesquilé","Sibaté","Silvania","Simijaca","Soacha","Sopó","Subachoque","Suesca","Supatá","Susa","Sutatausa","Tabio","Tausa","Tena","Tenjo","Tibacuy","Tibirita","Tocaima","Tocancipá","Topaipí","Ubalá","Ubaque","Ubaté","Une","Útica","Venecia","Vergara","Vianí","Villagómez","Villapinzón","Villeta","Viotá","Yacopí","Zipacón","Zipaquirá"],"Córdoba":["Ayapel","Buenavista","Canalete","Cereté","Chimá","Chinú","Ciénaga de Oro","Cotorra","La Apartada","Lorica","Los Córdobas","Momil","Montelíbano","Montería","Moñitos","Planeta Rica","Pueblo Nuevo","Puerto Escondido","Puerto Libertador","Purísima","Sahagún","San Andrés de Sotavento","San Antero","San Bernardo del Viento","San Carlos","San José de Uré","San Pelayo","Tierralta","Tuchín","Valencia"],"Guainía":["Inírida"],"Guaviare":["Calamar","El Retorno","Miraflores","San José del Guaviare"],"Huila":["Acevedo","Agrado","Aipe","Algeciras","Altamira","Baraya","Campoalegre","Colombia","El Pital","Elías","Garzón","Gigante","Guadalupe","Hobo","Íquira","Isnos","La Argentina","La Plata","Nátaga","Neiva","Oporapa","Paicol","Palermo","Palestina","Pitalito","Rivera","Saladoblanco","San Agustín","Santa María","Suaza","Tarqui","Tello","Teruel","Tesalia","Timaná","Villavieja","Yaguará"],"La Guajira":["Albania","Barrancas","Dibulla","Distracción","El Molino","Fonseca","Hatonuevo","La Jagua del Pilar","Maicao","Manaure","Riohacha","San Juan del Cesar","Uribia","Urumita","Villanueva"],"Magdalena":["Algarrobo","Aracataca","Ariguaní","Cerro de San Antonio","Chibolo","Chibolo","Ciénaga","Concordia","El Banco","El Piñón","El Retén","Fundación","Guamal","Nueva Granada","Pedraza","Pijiño del Carmen","Pivijay","Plato","Pueblo Viejo","Remolino","Sabanas de San Ángel","Salamina","San Sebastián de Buenavista","San Zenón","Santa Ana","Santa Bárbara de Pinto","Santa Marta","Sitionuevo","Tenerife","Zapayán","Zona Bananera"],"Meta":["Acacías","Barranca de Upía","Cabuyaro","Castilla la Nueva","Cubarral","Cumaral","El Calvario","El Castillo","El Dorado","Fuente de Oro","Granada","Guamal","La Macarena","La Uribe","Lejanías","Mapiripán","Mesetas","Puerto Concordia","Puerto Gaitán","Puerto Lleras","Puerto López","Puerto Rico","Restrepo","San Carlos de Guaroa","San Juan de Arama","San Juanito","San Martín","Villavicencio","Vista Hermosa"],"Nariño":["Aldana","Ancuyá","Arboleda","Barbacoas","Belén","Buesaco","Chachagüí","Colón","Consacá","Contadero","Córdoba","Cuaspud","Cumbal","Cumbitara","El Charco","El Peñol","El Rosario","El Tablón","El Tambo","Francisco Pizarro","Funes","Guachucal","Guaitarilla","Gualmatán","Iles","Imués","Ipiales","La Cruz","La Florida","La Llanada","La Tola","La Unión","Leiva","Linares","Los Andes","Magüí Payán","Mallama","Mosquera","Nariño","Olaya Herrera","Ospina","Pasto","Policarpa","Potosí","Providencia","Puerres","Pupiales","Ricaurte","Roberto Payán","Samaniego","San Bernardo","San José de Albán","San Lorenzo","San Pablo","San Pedro de Cartago","Sandoná","Santa Bárbara","Santacruz","Sapuyes","Taminango","Tangua","Tumaco","Túquerres","Yacuanquer"],"Norte de Santander":["Ábrego","Arboledas","Bochalema","Bucarasica","Cáchira","Cácota","Chinácota","Chitagá","Convención","Cúcuta","Cucutilla","Duranía","El Carmen","El Tarra","El Zulia","Gramalote","Hacarí","Herrán","La Esperanza","La Playa de Belén","Labateca","Los Patios","Lourdes","Mutiscua","Ocaña","Pamplona","Pamplonita","Puerto Santander","Ragonvalia","Salazar de Las Palmas","San Calixto","San Cayetano","Santiago","Santo Domingo de Silos","Sardinata","Teorama","Tibú","Toledo","Villa Caro","Villa del Rosario"],"Putumayo":["Colón","Mocoa","Orito","Puerto Asís","Puerto Caicedo","Puerto Guzmán","Puerto Leguízamo","San Francisco","San Miguel","Santiago","Sibundoy","Valle del Guamuez","Villagarzón"],"Quindío":["Armenia","Buenavista","Calarcá","Circasia","Córdoba","Filandia","Génova","La Tebaida","Montenegro","Pijao","Quimbaya","Salento"],"Risaralda":["Apía","Balboa","Belén de Umbría","Dosquebradas","Guática","La Celia","La Virginia","Marsella","Mistrató","Pereira","Pueblo Rico","Quinchía","Santa Rosa de Cabal","Santuario"],"San Andrés y Providencia":["Providencia y Santa Catalina Islas","San Andrés"],"Santander":["Aguada","Albania","Aratoca","Barbosa","Barichara","Barrancabermeja","Betulia","Bolívar","Bucaramanga","Cabrera","California","Capitanejo","Carcasí","Cepitá","Cerrito","Charalá","Charta","Chima","Chipatá","Cimitarra","Concepción","Confines","Contratación","Coromoro","Curití","El Carmen de Chucurí","El Guacamayo","El Peñón","El Playón","El Socorro","Encino","Enciso","Florián","Floridablanca","Galán","Gámbita","Girón","Guaca","Guadalupe","Guapotá","Guavatá","Güepsa","Hato","Jesús María","Jordán","La Belleza","La Paz","Landázuri","Lebrija","Los Santos","Macaravita","Málaga","Matanza","Mogotes","Molagavita","Ocamonte","Oiba","Onzaga","Palmar","Palmas del Socorro","Páramo","Piedecuesta","Pinchote","Puente Nacional","Puerto Parra","Puerto Wilches","Rionegro","Sabana de Torres","San Andrés","San Benito","San Gil","San Joaquín","San José de Miranda","San Miguel","San Vicente de Chucurí","Santa Bárbara","Santa Helena del Opón","Simacota","Suaita","Sucre","Suratá","Tona","Valle de San José","Vélez","Vetas","Villanueva","Zapatoca"],"Sucre":["Buenavista","Caimito","Chalán","Colosó","Corozal","Coveñas","El Roble","Galeras","Guaranda","La Unión","Los Palmitos","Majagual","Morroa","Ovejas","Sampués","San Antonio de Palmito","San Benito Abad","San Juan de Betulia","San Marcos","San Onofre","San Pedro","Sincé","Sincelejo","Sucre","Tolú","Tolú Viejo"],"Tolima":["Alpujarra","Alvarado","Ambalema","Anzoátegui","Armero","Ataco","Cajamarca","Carmen de Apicalá","Casabianca","Chaparral","Coello","Coyaima","Cunday","Dolores","El Espinal","Falán","Flandes","Fresno","Guamo","Herveo","Honda","Ibagué","Icononzo","Lérida","Líbano","Mariquita","Melgar","Murillo","Natagaima","Ortega","Palocabildo","Piedras","Planadas","Prado","Purificación","Rioblanco","Roncesvalles","Rovira","Saldaña","San Antonio","San Luis","Santa Isabel","Suárez","Valle de San Juan","Venadillo","Villahermosa","Villarrica"],"Valle del Cauca":["Alcalá","Andalucía","Ansermanuevo","Argelia","Bolívar","Buenaventura","Buga","Bugalagrande","Caicedonia","Cali","Calima","Candelaria","Cartago","Dagua","El Águila","El Cairo","El Cerrito","El Dovio","Florida","Ginebra","Guacarí","Jamundí","La Cumbre","La Unión","La Victoria","Obando","Palmira","Pradera","Restrepo","Riofrío","Roldanillo","San Pedro","Sevilla","Toro","Trujillo","Tuluá","Ulloa","Versalles","Vijes","Yotoco","Yumbo","Zarzal"],"Vaupés":["Carurú","Mitú","Taraira"],"Vichada":["Cumaribo","La Primavera","Puerto Carreño","Santa Rosalía"]};
let COSTOS_ENVIO=Object.assign({},COSTOS_ENVIO_DEFAULT);
let ENVIO_GRATIS_DESDE=160000; // tope para envío gratis
let costoEnvioActual=0;

function llenarDeptos(){
  const dl=g('deptos-list');if(!dl)return;
  dl.innerHTML=Object.keys(COSTOS_ENVIO).map(d=>`<option value="${d}"></option>`).join('');
}
// Llena el desplegable de municipios según el departamento elegido
function llenarCiudades(){
  const dl=g('ciudades-list');if(!dl)return;
  const depto=buscarDepto(g('co-depto')?g('co-depto').value:'');
  const lista=(depto&&MUNICIPIOS[depto])?MUNICIPIOS[depto]:[];
  dl.innerHTML=lista.map(c=>`<option value="${c}"></option>`).join('');
}

// Busca el departamento que coincide con lo que escribió el cliente
function buscarDepto(texto){
  if(!texto)return null;
  const t=texto.toLowerCase().trim();
  // Coincidencia exacta primero
  for(const d in COSTOS_ENVIO){ if(d.toLowerCase()===t)return d; }
  // Coincidencia parcial (escribió una parte)
  for(const d in COSTOS_ENVIO){ if(d.toLowerCase().includes(t))return d; }
  return null;
}

function calcularEnvio(){
  const subtotal=cart.reduce((s,i)=>s+i.price*i.qty,0);
  const box=g('envio-box');
  const textoDepto=g('co-depto').value;
  const depto=buscarDepto(textoDepto);
  // ¿Envío gratis por monto?
  if(ENVIO_GRATIS_DESDE>0 && subtotal>=ENVIO_GRATIS_DESDE){
    costoEnvioActual=0;
    if(box)box.style.display='none';
    g('c-envio').innerHTML='<span style="color:#25a244;font-weight:600">GRATIS 🎉</span>';
    g('c-total').textContent=fmt(subtotal);
    return;
  }
  if(box)box.style.display='block';
  costoEnvioActual=depto?COSTOS_ENVIO[depto]:0;
  if(depto){
    g('c-envio').textContent=fmt(costoEnvioActual);
    g('c-total').textContent=fmt(subtotal+costoEnvioActual);
  }else{
    g('c-envio').textContent='Elige tu ciudad';
    g('c-total').textContent=fmt(subtotal);
  }
}

// ══ CHECKOUT ══
// Lee y arma todos los datos del formulario del cliente
function leerDatosCliente(){
  const v=id=>{const e=g(id);return e?e.value.trim():'';};
  const nombreBase=v('co-nombre'), apellido=v('co-apellido');
  const tipodoc=v('co-tipodoc')||'CC', doc=v('co-doc'), notas=v('co-notas');
  const nombre=(nombreBase+' '+apellido).trim();
  const depto=buscarDepto(v('co-depto'))||'';
  const dir=v('co-dir'), ciudad=v('co-ciudad');
  const dirCompleta=[dir, ciudad, depto].filter(Boolean).join(', ')+(notas?(' | Nota: '+notas):'');
  return {nombreBase,apellido,nombre,tipodoc,doc,tel:v('co-tel'),email:v('co-email'),dir,ciudad,depto,notas,dirCompleta,docFmt:tipodoc+' '+doc};
}
// Valida que el cliente aceptó términos y condiciones
function terminosOk(){
  const c=g('co-terminos');
  if(!c||!c.checked){showToast('Debes aceptar los términos y condiciones','error');return false}
  return true;
}
async function pagarConMercadoPago(){
  if(!cart.length){showToast('El carrito está vacío','error');return}
  if(!terminosOk())return;
  const d=leerDatosCliente();
  const {nombre,tel,email,dir,depto,ciudad}=d;
  // Validar datos para el envío (obligatorios)
  if(!d.nombreBase||!d.apellido||!d.doc){showToast('Completa nombre, apellido y cédula','error');return}
  if(!tel||!dir||!ciudad){showToast('Completa teléfono, ciudad y dirección','error');return}
  const _subt=cart.reduce((s,i)=>s+i.price*i.qty,0);
  const _gratis=(ENVIO_GRATIS_DESDE>0 && _subt>=ENVIO_GRATIS_DESDE);
  if(!depto && !_gratis){showToast('Elige tu departamento para calcular el envío','error');return}
  if(!email||email.indexOf('@')<0){showToast('Ingresa un correo válido para la confirmación','error');return}
  const btns=document.querySelectorAll('.ck-pagos .checkout-btn');
  btns.forEach(b=>b.disabled=true);
  const btnMP=document.querySelector('.ck-btn-mp');
  const txtOrig=btnMP.textContent;
  btnMP.textContent='Conectando con Mercado Pago...';
  try{
    const items=cart.map(i=>({
      title:i.name+(i.selectedColor?' ['+i.selectedColor+']':''),
      quantity:i.qty,
      unit_price:i.price
    }));
    // Agregar el envío como un item más
    if(costoEnvioActual>0){
      items.push({title:'Envío ('+depto+')',quantity:1,unit_price:costoEnvioActual});
    }
    const res=await fetch('/api/crear-pago',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({items,comprador:{nombre,email,telefono:tel}})
    });
    const data=await res.json();
    const url=data.init_point||data.sandbox_init_point;
    if(url){
      // Guardar el pedido y notificar antes de redirigir
      try{
        const productos=cart.map(i=>`${i.name}${i.selectedColor?' ['+i.selectedColor+']':''} x${i.qty} (${fmt(i.price*i.qty)})`).join(' | ');
        const subtotal=cart.reduce((s,i)=>s+i.price*i.qty,0);
        const total=subtotal+costoEnvioActual;
        const dirCompleta=d.dirCompleta;
        const ref=await fdb.collection('pedidos').add({nombre,documento:d.docFmt,telefono:tel,email,direccion:dirCompleta,productos,envio:fmt(costoEnvioActual),total:fmt(total),fecha:new Date().toISOString(),estado:'⏳ Pago sin confirmar',metodoPago:'Mercado Pago'});
        // Guardar el ID del pedido para marcarlo PAGADO cuando vuelva aprobado
        try{ localStorage.setItem('ab_pedido_pendiente',ref.id); }catch(e){}
        // Guardar correo en suscriptores
        try{ await fdb.collection('suscriptores').add({email,nombre,origen:'pedido',fecha:new Date().toISOString()}); }catch(e){}
        // Notificar por correo a ti y al cliente (await para que salga ANTES de redirigir a la pasarela)
        await enviarCorreoPedidoNuevo({nombre,telefono:tel,email,direccion:dirCompleta,productos,total:fmt(total)});
        // El correo de confirmación al cliente se envía cuando aceptas el pedido en el panel
        await descontarStock();
      }catch(e){}
      window.location.href=url; // Redirige a Mercado Pago
    }else{
      showToast('No se pudo iniciar el pago. Intenta de nuevo.','error');
      btnMP.textContent=txtOrig;btns.forEach(b=>b.disabled=false);
    }
  }catch(e){
    showToast('Error al conectar con el pago','error');
    btnMP.textContent=txtOrig;btns.forEach(b=>b.disabled=false);
  }
}

// Descuenta las unidades vendidas del inventario y marca agotado al llegar a 0
async function descontarStock(){
  const porProducto={};
  cart.forEach(i=>{ porProducto[i.id]=(porProducto[i.id]||0)+i.qty; });
  for(const id in porProducto){
    const p=products.find(x=>String(x.id)===String(id));
    if(p && typeof p.cantidad==='number'){
      p.cantidad=Math.max(0,p.cantidad-porProducto[id]);
      // Al llegar a 0 el producto se oculta solo de la tienda (estaOculto). Vuelve al reponer stock.
      // Solo actualiza el campo 'cantidad' (las reglas de Firebase permiten esto al público, no editar todo el producto)
      try{ await fdb.collection('productos').doc(String(p.id)).update({cantidad:p.cantidad}); limpiarCacheProductos(); }catch(e){}
    }
  }
}
async function finalizarCompra(){
  if(!terminosOk())return;
  const d=leerDatosCliente();
  const {nombre,tel,email,dir,depto,ciudad}=d;
  if(!d.nombreBase||!d.apellido||!d.doc){showToast('Completa nombre, apellido y cédula','error');return}
  if(!tel||!dir||!ciudad){showToast('Completa teléfono, ciudad y dirección','error');return}
  const _subt=cart.reduce((s,i)=>s+i.price*i.qty,0);
  const _gratis=(ENVIO_GRATIS_DESDE>0 && _subt>=ENVIO_GRATIS_DESDE);
  if(!depto && !_gratis){showToast('Elige tu departamento para calcular el envío','error');return}
  if(!cart.length){showToast('El carrito está vacío','error');return}
  const btn=document.querySelector('.ck-btn-contra');
  const txtOrig=btn.textContent;
  btn.textContent='Enviando...';btn.disabled=true;
  const productos=cart.map(i=>`${i.name}${i.selectedColor?' ['+i.selectedColor+']':''} x${i.qty} (${fmt(i.price*i.qty)})`).join(' | ');
  const subtotal=cart.reduce((s,i)=>s+i.price*i.qty,0);
  const total=subtotal+costoEnvioActual;
  const dir2=d.dirCompleta+' | Doc: '+d.docFmt+' | Envío: '+fmt(costoEnvioActual);
  const url=`${SHEET_URL}?accion=addPedido&nombre=${encodeURIComponent(nombre)}&telefono=${encodeURIComponent(tel)}&direccion=${encodeURIComponent(dir2)}&productos=${encodeURIComponent(productos)}&total=${encodeURIComponent(fmt(total))}`;
  try{
    try{ await fetch(url,{mode:'no-cors',cache:'no-cache'}); }
    catch(e){
      await new Promise(r=>{const img=new Image();img.onload=img.onerror=r;img.src=url;setTimeout(r,5000);});
    }
    try{ await fdb.collection('pedidos').add({nombre,documento:d.docFmt,telefono:tel,direccion:dir2,email,productos,envio:fmt(costoEnvioActual),total:fmt(total),fecha:new Date().toISOString(),estado:'⏳ Pendiente'}); }
    catch(e){ console.error('Error Firebase pedido:',e); }
    // Guardar correo en suscriptores (para promociones futuras)
    if(email){
      try{ await fdb.collection('suscriptores').add({email,nombre,origen:'pedido',fecha:new Date().toISOString()}); }
      catch(e){ console.error('Error suscriptor:',e); }
    }
    // Enviar correos (a ti y al cliente)
    enviarCorreoPedidoNuevo({nombre,telefono:tel,email,direccion:d.dirCompleta,productos,total:fmt(total)});
    // El correo de confirmación al cliente se envía cuando aceptas el pedido en el panel
    await descontarStock();
    cart=[];updateCartUI();
    ['co-nombre','co-apellido','co-doc','co-tel','co-dir','co-ciudad','co-notas','co-email'].forEach(id=>{if(g(id))g(id).value='';});
    cerrarCheckout();
    alert('✅ ¡Pedido recibido!\n\nLo estamos revisando y muy pronto te confirmaremos por WhatsApp o correo. ¡Gracias por tu compra! 🌸');
  }catch(e){
    showToast('Error al enviar pedido. Intenta de nuevo.','error');
  }
  btn.textContent=txtOrig;btn.disabled=false;
}

// ══ PAGO CON ADDI (cuotas) ══
async function pagarConAddi(){
  if(!cart.length){showToast('El carrito está vacío','error');return}
  if(!terminosOk())return;
  const d=leerDatosCliente();
  const {nombre,tel,email,dir,depto,ciudad}=d;
  if(!d.nombreBase||!d.apellido||!d.doc){showToast('Completa nombre, apellido y cédula','error');return}
  if(!tel||!dir||!ciudad){showToast('Completa teléfono, ciudad y dirección','error');return}
  const _subt=cart.reduce((s,i)=>s+i.price*i.qty,0);
  const _gratis=(ENVIO_GRATIS_DESDE>0 && _subt>=ENVIO_GRATIS_DESDE);
  if(!depto && !_gratis){showToast('Elige tu departamento para calcular el envío','error');return}
  if(!email||email.indexOf('@')<0){showToast('Ingresa un correo válido','error');return}
  const btn=document.querySelector('.ck-btn-addi');
  const txtOrig=btn.textContent;
  btn.textContent='Conectando con Addi...';
  const btns=document.querySelectorAll('.ck-pagos .checkout-btn');btns.forEach(b=>b.disabled=true);
  try{
    const items=cart.map(i=>({
      sku:String(i.id),
      name:i.name+(i.selectedColor?' ['+i.selectedColor+']':''),
      quantity:i.qty,
      unit_price:i.price,
      pictureUrl:(i.img&&i.img.startsWith('http'))?i.img:'',
      category:i.cat||'Belleza'
    }));
    const orderId='AB-'+Date.now();
    const total=_subt+costoEnvioActual;
    // Guardar el pedido como pendiente antes de redirigir
    try{
      const productos=cart.map(i=>`${i.name}${i.selectedColor?' ['+i.selectedColor+']':''} x${i.qty} (${fmt(i.price*i.qty)})`).join(' | ');
      const ref=await fdb.collection('pedidos').add({nombre,documento:d.docFmt,telefono:tel,email,direccion:d.dirCompleta,productos,envio:fmt(costoEnvioActual),total:fmt(total),fecha:new Date().toISOString(),estado:'⏳ Addi - sin confirmar',metodoPago:'Addi',orderId});
      try{ localStorage.setItem('ab_pedido_pendiente',ref.id); }catch(e){}
      try{ await fdb.collection('suscriptores').add({email,nombre,origen:'pedido',fecha:new Date().toISOString()}); }catch(e){}
      // await para que el correo salga ANTES de redirigir a Addi
      await enviarCorreoPedidoNuevo({nombre,telefono:tel,email,direccion:d.dirCompleta,productos,total:fmt(total)});
    }catch(e){}
    const res=await fetch('/api/addi-pago',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({items,cliente:{nombre:d.nombreBase,apellido:d.apellido,documento:d.doc,telefono:tel,email,ciudad,direccion:dir},orderId,subtotal:_subt,envio:costoEnvioActual})
    });
    const data=await res.json();
    if(data.url){
      window.location.href=data.url;
    }else{
      showToast('Addi no está disponible en este momento. Intenta con otro método.','error');
      console.error('Addi:',data);
      btn.textContent=txtOrig;btns.forEach(b=>b.disabled=false);
    }
  }catch(e){
    showToast('Error al conectar con Addi','error');
    btn.textContent=txtOrig;btns.forEach(b=>b.disabled=false);
  }
}

// ══ GENERADOR DE PUBLICACIONES REDES ══
// ══ GENERADOR DE IMÁGENES PARA REDES ══
function llenarSelectImagenes(){
  const sel=g('img-producto');if(!sel)return;
  if(!products.length){sel.innerHTML='<option value="">No hay productos</option>';return}
  sel.innerHTML=products.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
}

let slideActual=0;
const SLIDES_CARRUSEL=['portada','beneficio','beneficios2','como_usar','compra'];

function onCambioEstilo(){
  const estilo=g('img-estilo').value;
  const label=g('img-texto-label');
  const input=g('img-texto-extra');
  const navCarrusel=g('img-carrusel-nav');
  const btnUno=g('btn-descargar-img');
  const btnCarrusel=g('btn-descargar-carrusel');

  if(estilo==='carrusel'){
    navCarrusel.style.display='flex';
    btnUno.style.display='none';
    btnCarrusel.style.display='block';
    slideActual=0;
    actualizarLabelSlide();
  }else{
    navCarrusel.style.display='none';
    btnUno.style.display='block';
    btnCarrusel.style.display='none';
  }

  if(estilo==='dato'){label.textContent='Dato de belleza';input.placeholder='Ej: Estimula el crecimiento del cabello';}
  else if(estilo==='oferta'){label.textContent='Texto de la oferta';input.placeholder='Ej: 20% OFF esta semana';}
  else if(estilo==='carrusel'){label.textContent='Beneficio principal (opcional)';input.placeholder='Ej: Cabello más fuerte en 30 días';}
  else if(estilo==='premium'){label.textContent='Ingredientes destacados (separa con coma)';input.placeholder='Ej: Cebolla Roja, Niacinamida, Aminoácidos';}
  else{label.textContent='Texto extra (opcional)';input.placeholder='Ej: Envío gratis';}
  dibujarImagenPost();
}

function cambiarSlide(dir){
  slideActual+=dir;
  if(slideActual<0)slideActual=4;
  if(slideActual>4)slideActual=0;
  actualizarLabelSlide();
  dibujarImagenPost();
}
function actualizarLabelSlide(){
  const lbl=g('img-slide-label');
  if(lbl)lbl.textContent='Slide '+(slideActual+1)+' de 5';
}

function cargarImagenProm(src){
  return new Promise(resolve=>{
    if(!src){resolve(null);return;}
    const img=new Image();
    img.crossOrigin='anonymous';
    img.onload=()=>resolve(img);
    img.onerror=()=>resolve(null);
    img.src=src;
  });
}

// Envuelve texto en varias líneas según ancho
function envolverTexto(ctx,texto,maxWidth){
  const palabras=texto.split(' ');
  const lineas=[];let linea='';
  for(const pal of palabras){
    const prueba=linea?linea+' '+pal:pal;
    if(ctx.measureText(prueba).width>maxWidth&&linea){lineas.push(linea);linea=pal;}
    else linea=prueba;
  }
  if(linea)lineas.push(linea);
  return lineas;
}

async function dibujarImagenPost(){
  const canvas=g('img-canvas');if(!canvas)return;
  const pid=parseInt(g('img-producto').value);
  const p=products.find(x=>x.id===pid);
  if(!p)return;
  const formato=g('img-formato').value;
  const estilo=g('img-estilo').value;
  const extra=g('img-texto-extra').value.trim();

  // Si es carrusel, usar la función especial
  if(estilo==='carrusel'){ await dibujarSlideCarrusel(canvas,p,formato,extra,slideActual); return; }
  // Si es premium, usar la función premium
  if(estilo==='premium'){ await dibujarPremium(canvas,p,formato,extra); return; }

  // Dimensiones
  const W=1080, H=formato==='feed'?1080:1920;
  canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');

  // Colores Artemisa
  const ROSA='#b5516a', ROSA_CLARO='#f9eef1', DORADO='#c9a96e', OSCURO='#2d2d2d';

  // Fondo degradado
  const grad=ctx.createLinearGradient(0,0,0,H);
  grad.addColorStop(0,'#ffffff');
  grad.addColorStop(1,ROSA_CLARO);
  ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);

  // Borde decorativo
  ctx.strokeStyle=ROSA;ctx.lineWidth=12;
  ctx.strokeRect(24,24,W-48,H-48);

  // Header: logo marca
  ctx.fillStyle=ROSA;ctx.textAlign='center';
  ctx.font='600 40px Georgia, serif';
  ctx.fillText('🌸 ARTEMISA BEAUTY', W/2, 110);
  ctx.strokeStyle=DORADO;ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(W/2-160,135);ctx.lineTo(W/2+160,135);ctx.stroke();

  // Imagen del producto
  const img=await cargarImagenProm(p.img);
  const imgY=formato==='feed'?180:260;
  const imgSize=formato==='feed'?520:640;
  const imgX=(W-imgSize)/2;
  // Marco blanco para la foto
  ctx.fillStyle='#fff';
  ctx.fillRect(imgX-10,imgY-10,imgSize+20,imgSize+20);
  ctx.strokeStyle=ROSA_CLARO;ctx.lineWidth=1;
  ctx.strokeRect(imgX-10,imgY-10,imgSize+20,imgSize+20);
  if(img){
    // Dibujar imagen ajustada (contain)
    const escala=Math.min(imgSize/img.width,imgSize/img.height);
    const w=img.width*escala,h=img.height*escala;
    ctx.drawImage(img,imgX+(imgSize-w)/2,imgY+(imgSize-h)/2,w,h);
  }else{
    ctx.fillStyle=ROSA_CLARO;ctx.fillRect(imgX,imgY,imgSize,imgSize);
    ctx.fillStyle=ROSA;ctx.font='120px serif';ctx.fillText(p.emoji||'🌸',W/2,imgY+imgSize/2+40);
  }

  // Nombre del producto
  let y=imgY+imgSize+90;
  ctx.fillStyle=OSCURO;ctx.font='bold 52px Georgia, serif';
  const nombreLineas=envolverTexto(ctx,p.name,W-160);
  nombreLineas.slice(0,2).forEach(ln=>{ctx.fillText(ln,W/2,y);y+=62;});
  y+=10;

  // Contenido según estilo
  if(estilo==='precio'){
    ctx.fillStyle=ROSA;ctx.font='bold 72px Arial, sans-serif';
    ctx.fillText('$'+(p.price||0).toLocaleString('es-CO'),W/2,y);
    y+=90;
    // Botón de compra
    ctx.fillStyle=ROSA;
    const bw=440,bh=80,bx=(W-bw)/2;
    ctx.beginPath();ctx.roundRect(bx,y,bw,bh,40);ctx.fill();
    ctx.fillStyle='#fff';ctx.font='bold 34px Arial, sans-serif';
    ctx.fillText('COMPRA POR WHATSAPP',W/2,y+52);
    y+=bh+20;
  }else if(estilo==='dato'){
    ctx.fillStyle=DORADO;ctx.font='bold 30px Arial';
    ctx.fillText('✨ ¿SABÍAS QUE?',W/2,y);y+=54;
    ctx.fillStyle=OSCURO;ctx.font='36px Arial, sans-serif';
    const dato=extra||(p.desc?p.desc.substring(0,120):'Un producto ideal para tu rutina de belleza');
    envolverTexto(ctx,dato,W-200).slice(0,4).forEach(ln=>{ctx.fillText(ln,W/2,y);y+=48;});
  }else if(estilo==='oferta'){
    // Banda de oferta
    ctx.fillStyle=ROSA;
    ctx.save();ctx.translate(W/2,y);
    const bw=560,bh=100;
    ctx.beginPath();ctx.roundRect(-bw/2,-20,bw,bh,16);ctx.fill();
    ctx.fillStyle='#fff';ctx.font='bold 46px Arial, sans-serif';
    ctx.fillText(extra||'¡OFERTA ESPECIAL!',0,42);
    ctx.restore();
    y+=120;
    ctx.fillStyle=ROSA;ctx.font='bold 64px Arial, sans-serif';
    ctx.fillText('$'+(p.price||0).toLocaleString('es-CO'),W/2,y);y+=80;
  }

  // Footer: WhatsApp
  ctx.fillStyle=OSCURO;ctx.font='28px Arial, sans-serif';
  ctx.fillText('📲 WhatsApp: 310 780 9662',W/2,H-70);
}

async function dibujarPremium(canvas,p,formato,extra){
  const W=1080, H=formato==='feed'?1080:1920;
  canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');
  const ROSA='#b5516a', DORADO='#c9a96e', OSCURO='#3d3227', BEIGE_T='#8a7860';

  // Fondo elegante beige degradado
  const grad=ctx.createLinearGradient(0,0,W,H);
  grad.addColorStop(0,'#f3ece4');
  grad.addColorStop(1,'#e6dcd0');
  ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);

  ctx.textAlign='center';

  // Marca arriba (más pequeña y discreta)
  ctx.fillStyle=ROSA;ctx.font='600 26px Georgia, serif';
  ctx.fillText('🌸 ARTEMISA BEAUTY', W/2, 62);

  // Título (nombre del producto)
  ctx.fillStyle=BEIGE_T;ctx.font='600 40px Arial, sans-serif';
  let y=140;
  envolverTexto(ctx,p.name,W-160).slice(0,2).forEach(ln=>{ctx.fillText(ln,W/2,y);y+=48;});

  // Subtítulo desde la descripción
  if(p.desc){
    ctx.fillStyle=OSCURO;ctx.font='26px Arial, sans-serif';
    y+=6;
    envolverTexto(ctx,p.desc.substring(0,90),W-240).slice(0,2).forEach(ln=>{ctx.fillText(ln,W/2,y);y+=34;});
  }

  // Foto del producto (centro) con marco redondeado tipo tarjeta blanca
  const img=await cargarImagenProm(p.img);
  const imgSize=formato==='feed'?440:560;
  const imgX=(W-imgSize)/2;
  const imgY=y+30;
  const pad=24;
  // Tarjeta de fondo blanca redondeada con sombra (para que la foto combine)
  ctx.save();
  ctx.shadowColor='rgba(120,90,60,.25)';ctx.shadowBlur=40;ctx.shadowOffsetY=15;
  ctx.fillStyle='#ffffff';
  ctx.beginPath();ctx.roundRect(imgX-pad,imgY-pad,imgSize+pad*2,imgSize+pad*2,24);ctx.fill();
  ctx.restore();
  if(img){
    const esc=Math.min(imgSize/img.width,imgSize/img.height);
    const w=img.width*esc,h=img.height*esc;
    ctx.drawImage(img,imgX+(imgSize-w)/2,imgY+(imgSize-h)/2,w,h);
  }else{
    ctx.fillStyle=ROSA;ctx.font='140px serif';ctx.fillText(p.emoji||'🌸',W/2,imgY+imgSize/2+50);
  }

  // Sellos de garantía (círculos a los lados de la foto)
  const sellos=['LIBRE DE\nQUÍMICOS','DISMINUYE\nLA CAÍDA','CLÍNICAMENTE\nCOMPROBADO'];
  const iconos=['🌿','💧','⚕️'];
  const selloR=52;
  const ladoX=[imgX-90, imgX-90, imgX+imgSize+90];
  const selloY=[imgY+70, imgY+imgSize-70, imgY+imgSize/2];
  for(let i=0;i<3;i++){
    const sx=ladoX[i], sy=selloY[i];
    ctx.beginPath();ctx.arc(sx,sy,selloR,0,Math.PI*2);
    ctx.fillStyle='#fff';ctx.fill();
    ctx.strokeStyle=DORADO;ctx.lineWidth=3;ctx.stroke();
    ctx.fillStyle=BEIGE_T;ctx.font='34px serif';ctx.fillText(iconos[i],sx,sy+2);
    ctx.fillStyle=BEIGE_T;ctx.font='bold 14px Arial';
    const lineas=sellos[i].split('\n');
    lineas.forEach((ln,j)=>ctx.fillText(ln,sx,sy+selloR+20+j*16));
  }

  // Precio en círculo (esquina)
  const pcx=W-130, pcy=imgY+30;
  ctx.beginPath();ctx.arc(pcx,pcy,70,0,Math.PI*2);
  ctx.fillStyle=ROSA;ctx.fill();
  ctx.fillStyle='#fff';ctx.font='bold 34px Arial';
  ctx.fillText('$'+Math.round((p.price||0)/1000)+'mil',pcx,pcy+2);
  ctx.font='16px Arial';ctx.fillText('PRECIO',pcx,pcy-24);

  // Ingredientes destacados abajo (etiquetas)
  const ingredientes = extra
    ? extra.split(',').map(s=>s.trim()).filter(Boolean)
    : ['Fórmula natural','Alta calidad','Resultados reales'];
  let by=formato==='feed'?H-140:H-220;
  ctx.font='bold 26px Arial';
  // Calcular anchos y centrar
  const gap=16;
  let filaAncho=0;
  const anchos=ingredientes.map(ing=>{const w=ctx.measureText(ing).width+48;filaAncho+=w+gap;return w;});
  filaAncho-=gap;
  // Si caben en una fila, centrar; si no, apilar
  if(filaAncho<=W-80){
    let bx=(W-filaAncho)/2;
    ingredientes.forEach((ing,i)=>{
      ctx.fillStyle=BEIGE_T;
      ctx.beginPath();ctx.roundRect(bx,by,anchos[i],48,8);ctx.fill();
      ctx.fillStyle='#fff';ctx.fillText(ing,bx+anchos[i]/2,by+32);
      bx+=anchos[i]+gap;
    });
  }else{
    ingredientes.slice(0,3).forEach((ing,i)=>{
      const w=ctx.measureText(ing).width+48;
      const bx=(W-w)/2;
      ctx.fillStyle=BEIGE_T;
      ctx.beginPath();ctx.roundRect(bx,by,w,48,8);ctx.fill();
      ctx.fillStyle='#fff';ctx.fillText(ing,W/2,by+32);
      by+=58;
    });
  }

  // Footer WhatsApp (banda rosa)
  ctx.fillStyle=ROSA;ctx.fillRect(0,H-70,W,70);
  ctx.fillStyle='#fff';ctx.font='bold 28px Arial';
  ctx.fillText('📲 Pide el tuyo: 310 780 9662',W/2,H-28);
}

async function dibujarSlideCarrusel(canvas,p,formato,extra,slide){
  const W=1080, H=formato==='feed'?1080:1920;
  canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');
  const ROSA='#b5516a', ROSA_CLARO='#f9eef1', DORADO='#c9a96e', OSCURO='#2d2d2d';

  // Fondo
  const grad=ctx.createLinearGradient(0,0,0,H);
  grad.addColorStop(0,'#ffffff');grad.addColorStop(1,ROSA_CLARO);
  ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
  ctx.strokeStyle=ROSA;ctx.lineWidth=12;ctx.strokeRect(24,24,W-48,H-48);

  // Header
  ctx.fillStyle=ROSA;ctx.textAlign='center';
  ctx.font='600 38px Georgia, serif';
  ctx.fillText('🌸 ARTEMISA BEAUTY', W/2, 100);

  // Indicador de slide (puntitos)
  const cx=W/2, cy=H-60;
  for(let i=0;i<5;i++){
    ctx.fillStyle=i===slide?ROSA:'#ddd';
    ctx.beginPath();ctx.arc(cx-80+i*40,cy,8,0,Math.PI*2);ctx.fill();
  }

  const cy2=formato==='feed'?H/2:H/2-100;
  ctx.textAlign='center';

  if(slide===0){
    // PORTADA
    const img=await cargarImagenProm(p.img);
    const imgSize=formato==='feed'?440:560;
    const imgX=(W-imgSize)/2, imgY=180;
    ctx.fillStyle='#fff';ctx.fillRect(imgX-10,imgY-10,imgSize+20,imgSize+20);
    if(img){const esc=Math.min(imgSize/img.width,imgSize/img.height);const w=img.width*esc,h=img.height*esc;ctx.drawImage(img,imgX+(imgSize-w)/2,imgY+(imgSize-h)/2,w,h);}
    else{ctx.fillStyle=ROSA;ctx.font='120px serif';ctx.fillText(p.emoji||'🌸',W/2,imgY+imgSize/2);}
    let y=imgY+imgSize+80;
    ctx.fillStyle=OSCURO;ctx.font='bold 56px Georgia, serif';
    envolverTexto(ctx,p.name,W-160).slice(0,2).forEach(ln=>{ctx.fillText(ln,W/2,y);y+=66;});
    ctx.fillStyle=DORADO;ctx.font='30px Arial';ctx.fillText('Desliza para conocer más →',W/2,y+30);
  }else if(slide===1){
    ctx.font='90px serif';ctx.fillText('✨',W/2,cy2-160);
    ctx.fillStyle=ROSA;ctx.font='bold 44px Arial';ctx.fillText('BENEFICIO PRINCIPAL',W/2,cy2-70);
    ctx.fillStyle=OSCURO;ctx.font='40px Arial';
    const b=extra||(p.desc?p.desc.substring(0,100):'Resultados visibles desde las primeras semanas');
    let y=cy2;envolverTexto(ctx,b,W-220).slice(0,4).forEach(ln=>{ctx.fillText(ln,W/2,y);y+=52;});
  }else if(slide===2){
    ctx.font='90px serif';ctx.fillText('💧',W/2,cy2-160);
    ctx.fillStyle=ROSA;ctx.font='bold 44px Arial';ctx.fillText('¿POR QUÉ ELEGIRLO?',W/2,cy2-70);
    ctx.fillStyle=OSCURO;ctx.font='38px Arial';
    const puntos=['✓ Calidad garantizada','✓ Ideal para tu rutina','✓ Resultados reales'];
    let y=cy2;puntos.forEach(pt=>{ctx.fillText(pt,W/2,y);y+=64;});
  }else if(slide===3){
    ctx.font='90px serif';ctx.fillText('📋',W/2,cy2-160);
    ctx.fillStyle=ROSA;ctx.font='bold 44px Arial';ctx.fillText('CÓMO USARLO',W/2,cy2-70);
    ctx.fillStyle=OSCURO;ctx.font='38px Arial';
    const pasos=['1. Aplica sobre piel/cabello limpio','2. Usa según indicaciones','3. Sé constante para ver resultados'];
    let y=cy2;pasos.forEach(pt=>{envolverTexto(ctx,pt,W-200).forEach(ln=>{ctx.fillText(ln,W/2,y);y+=52;});y+=12;});
  }else if(slide===4){
    const img=await cargarImagenProm(p.img);
    const imgSize=formato==='feed'?300:400;
    const imgX=(W-imgSize)/2, imgY=180;
    ctx.fillStyle='#fff';ctx.fillRect(imgX-10,imgY-10,imgSize+20,imgSize+20);
    if(img){const esc=Math.min(imgSize/img.width,imgSize/img.height);const w=img.width*esc,h=img.height*esc;ctx.drawImage(img,imgX+(imgSize-w)/2,imgY+(imgSize-h)/2,w,h);}
    let y=imgY+imgSize+80;
    ctx.fillStyle=ROSA;ctx.font='bold 80px Arial';ctx.fillText('$'+(p.price||0).toLocaleString('es-CO'),W/2,y);y+=100;
    ctx.fillStyle=ROSA;const bw=480,bh=90,bx=(W-bw)/2;
    ctx.beginPath();ctx.roundRect(bx,y,bw,bh,45);ctx.fill();
    ctx.fillStyle='#fff';ctx.font='bold 36px Arial';ctx.fillText('PIDE POR WHATSAPP',W/2,y+58);
    y+=bh+50;
    ctx.fillStyle=OSCURO;ctx.font='30px Arial';ctx.fillText('📲 310 780 9662',W/2,y);
  }
}

async function descargarCarruselCompleto(){
  const canvas=g('img-canvas');
  const p=products.find(x=>x.id===parseInt(g('img-producto').value));
  const formato=g('img-formato').value;
  const extra=g('img-texto-extra').value.trim();
  if(!p){showToast('Elige un producto','error');return}
  const nombre=p.name.replace(/[^a-z0-9]/gi,'-').toLowerCase();
  showToast('Descargando 5 imágenes...','success');
  for(let i=0;i<5;i++){
    await dibujarSlideCarrusel(canvas,p,formato,extra,i);
    await new Promise(r=>setTimeout(r,300));
    const link=document.createElement('a');
    link.download='artemisa-'+nombre+'-slide'+(i+1)+'.png';
    link.href=canvas.toDataURL('image/png');
    link.click();
    await new Promise(r=>setTimeout(r,400));
  }
  // Volver al slide actual
  dibujarImagenPost();
  showToast('✓ 5 imágenes descargadas','success');
}

async function generarDescripcionRed(){
  const pid=parseInt(g('img-producto').value);
  const p=products.find(x=>x.id===pid);
  if(!p){showToast('Elige un producto','error');return}
  const red=g('img-red-desc').value;
  const btn=g('btn-gen-desc-red');
  btn.disabled=true;btn.textContent='Generando...';

  const redInfo={
    instagram:'Instagram: texto atractivo con emojis, llamado a la acción, y al final 8-12 hashtags de belleza relevantes en español y Colombia',
    tiktok:'TikTok: texto corto, juvenil y con gancho, pocos emojis, 4-6 hashtags virales de belleza',
    facebook:'Facebook: texto conversacional un poco más largo, cálido, con emojis moderados y 3-4 hashtags'
  };
  const prompt=`Eres la community manager de Artemisa Beauty, tienda de belleza colombiana. Crea una descripción para ${redInfo[red]}.

Producto: "${p.name}"
Categoría: ${p.cat}${p.subcat?' - '+p.subcat:''}
Precio: $${(p.price||0).toLocaleString('es-CO')}
${p.desc?'Descripción: '+p.desc:''}
WhatsApp: 3107809662

Escribe SOLO el texto listo para copiar y pegar, sin comillas ni explicaciones. Español colombiano.`;

  try{
    const res=await fetch('/api/generar-descripcion',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({nombre:prompt,categoria:p.cat})
    });
    const data=await res.json();
    const texto=(data.descripcion||'').trim();
    if(!texto)throw new Error();
    g('img-desc-texto').value=texto;
    g('img-desc-resultado').style.display='block';
  }catch(e){showToast('Error al generar. Intenta de nuevo.','error');}
  btn.disabled=false;btn.textContent='✨ Generar descripción';
}

function copiarDescripcionRed(){
  const texto=g('img-desc-texto').value;
  if(!texto)return;
  navigator.clipboard.writeText(texto).then(()=>showToast('✓ Descripción copiada','success'))
  .catch(()=>{g('img-desc-texto').select();document.execCommand('copy');showToast('✓ Copiada','success');});
}

async function descargarImagenPost(){
  await dibujarImagenPost();
  const canvas=g('img-canvas');
  const p=products.find(x=>x.id===parseInt(g('img-producto').value));
  const formato=g('img-formato').value;
  const nombre=(p?p.name.replace(/[^a-z0-9]/gi,'-').toLowerCase():'post')+'-'+formato;
  const link=document.createElement('a');
  link.download='artemisa-'+nombre+'.png';
  link.href=canvas.toDataURL('image/png');
  link.click();
  showToast('✓ Imagen descargada','success');
}

function llenarSelectSocial(){
  const sel=g('social-producto');if(!sel)return;
  if(!products.length){sel.innerHTML='<option value="">No hay productos</option>';return}
  sel.innerHTML=products.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
}

async function generarPublicacion(){
  const pid=parseInt(g('social-producto').value);
  const p=products.find(x=>x.id===pid);
  if(!p){showToast('Elige un producto','error');return}
  const red=g('social-red').value;
  const estilo=g('social-estilo').value;
  const btn=g('btn-gen-social');
  btn.disabled=true;btn.textContent='Generando...';

  const estilos={
    vendedor:'estilo vendedor persuasivo, con una oferta atractiva y un llamado claro a comprar o escribir por WhatsApp',
    educativo:'estilo educativo, dando un consejo de belleza útil relacionado con el producto',
    emocional:'estilo emocional que conecta con los sentimientos y la confianza de la clienta',
    divertido:'estilo divertido, fresco y juvenil, con humor ligero'
  };
  const redInfo=red==='instagram'
    ? 'Instagram: incluye emojis, un texto atractivo y al final entre 8 y 12 hashtags relevantes de belleza en español y Colombia'
    : 'Facebook: texto un poco más largo y conversacional, con emojis moderados y menos hashtags (3-5)';

  const prompt=`Eres la community manager de Artemisa Beauty, tienda de belleza colombiana. Crea una publicación para ${redInfo}.

Producto: "${p.name}"
Categoría: ${p.cat}${p.subcat?' - '+p.subcat:''}
Precio: $${(p.price||0).toLocaleString('es-CO')}
${p.desc?'Descripción: '+p.desc:''}
WhatsApp de contacto: 3107809662

Usa un ${estilos[estilo]}. Escribe SOLO el texto de la publicación listo para copiar y pegar, sin explicaciones ni comillas. Español colombiano.`;

  try{
    const res=await fetch('/api/generar-descripcion',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({nombre:prompt,categoria:p.cat})
    });
    const data=await res.json();
    const texto=(data.descripcion||'').trim();
    if(!texto)throw new Error();
    g('social-texto').value=texto;
    g('social-resultado').style.display='block';
  }catch(e){
    showToast('Error al generar. Intenta de nuevo.','error');
  }
  btn.disabled=false;btn.textContent='✨ Generar publicación';
}

function copiarPublicacion(){
  const texto=g('social-texto').value;
  if(!texto){showToast('Primero genera una publicación','error');return}
  navigator.clipboard.writeText(texto).then(()=>{
    showToast('✓ Texto copiado, pégalo en tu red','success');
  }).catch(()=>{
    g('social-texto').select();
    document.execCommand('copy');
    showToast('✓ Texto copiado','success');
  });
}

// ══ NEWSLETTER ══
async function handleNewsletter(){
  const email=g('nl-email').value.trim();
  if(!email||!email.includes('@')){showToast('Ingresa un correo válido','error');return}
  try{
    await fdb.collection('suscriptores').add({email,fecha:new Date().toISOString()});
    showToast('¡Gracias por suscribirte! 🌸','success');
    g('nl-email').value='';
  }catch(e){showToast('Error al guardar correo','error')}
}
async function handleNewsletterInicio(){
  const email=g('nl-email-inicio').value.trim();
  if(!email||!email.includes('@')){showToast('Ingresa un correo válido','error');return}
  try{
    await fdb.collection('suscriptores').add({email,fecha:new Date().toISOString()});
    showToast('¡Gracias por suscribirte! 🌸','success');
    g('nl-email-inicio').value='';
  }catch(e){showToast('Error al guardar correo','error')}
}

// ══ ADMIN ══
const ADMIN_EMAIL='silverbullet746@gmail.com';
// ══ POLÍTICAS Y DEVOLUCIONES ══
const POLITICAS={
  contacto:{titulo:'Información de contacto',html:`
    <p>¿Tienes preguntas, necesitas ayuda con un pedido o quieres saber más sobre nuestros productos? Estamos para ayudarte.</p>
    <h3 style="color:var(--primary);font-size:15px;margin:18px 0 8px">Datos de contacto</h3>
    <p><strong>Nombre comercial:</strong> Artemisa Beauty<br>
    <strong>WhatsApp / Teléfono:</strong> +57 310 780 9662<br>
    <strong>Correo:</strong> contactoartemisajyc@gmail.com<br>
    <strong>Sitio web:</strong> www.artemisabeauty.com</p>
    <h3 style="color:var(--primary);font-size:15px;margin:18px 0 8px">Horario de atención</h3>
    <p>Lunes a domingo, 8:00 a.m. a 6:00 p.m.</p>
    <h3 style="color:var(--primary);font-size:15px;margin:18px 0 8px">Datos del negocio</h3>
    <p>Razón social: Artemisa Beauty · NIT: 1012448143-3 · Bogotá, Colombia</p>`},
  envios:{titulo:'Política de envíos',html:`
    <h3 style="color:var(--primary);font-size:15px;margin:0 0 8px">Procesamiento de pedidos</h3>
    <p>Todos los pedidos se procesan y envían en un plazo de <strong>1 a 3 días hábiles</strong> después de la confirmación del pago. Los pedidos de fines de semana o festivos se procesan el siguiente día hábil.</p>
    <h3 style="color:var(--primary);font-size:15px;margin:18px 0 8px">Métodos de envío</h3>
    <p>Trabajamos con <strong>varias transportadoras aliadas a nivel nacional</strong>. La transportadora asignada depende de tu ubicación y del tipo de producto, buscando la opción más rápida y confiable para tu zona.</p>
    <h3 style="color:var(--primary);font-size:15px;margin:18px 0 8px">Tiempos de entrega</h3>
    <p>• <strong>Ciudades principales:</strong> 2 a 4 días hábiles.<br>
    • <strong>Otras ciudades y zonas remotas:</strong> 3 a 7 días hábiles.</p>
    <p>Estos tiempos son aproximados y pueden variar por clima, festivos o fuerza mayor. Te enviaremos el <strong>número de guía</strong> para rastrear tu paquete.</p>
    <h3 style="color:var(--primary);font-size:15px;margin:18px 0 8px">Costos de envío</h3>
    <p>El costo se calcula al finalizar la compra según el peso, las dimensiones y la dirección de entrega. El valor se informa antes de confirmar la compra.</p>`},
  devoluciones:{titulo:'Devoluciones y reembolsos',html:`
    <p>En Artemisa Beauty nos apegamos al <strong>Estatuto del Consumidor (Ley 1480 de 2011)</strong> para garantizar tus derechos.</p>
    <h3 style="color:var(--primary);font-size:15px;margin:18px 0 8px">1. Derecho de retracto</h3>
    <p>Puedes retractarte en un plazo máximo de <strong>cinco (5) días hábiles</strong> desde la entrega. El producto debe estar sin usar, sin abrir, con empaque, etiquetas y sellos. El costo de la devolución lo asume el cliente. Te reembolsamos el 100% en un máximo de 30 días calendario.</p>
    <p><em>Excepciones:</em> no aplica para productos de cuidado personal abiertos o usados (por higiene), derma rollers desprecintados ni productos personalizados.</p>
    <h3 style="color:var(--primary);font-size:15px;margin:18px 0 8px">2. Garantía legal</h3>
    <p>Cubre defectos de calidad o funcionamiento. <strong>Garantía: 1 mes para productos genéricos y 6 meses para marcas específicas.</strong> Si tu producto falla, contáctanos por WhatsApp con fotos o video. Tienes derecho a reparación, cambio o devolución del dinero. En garantía, el costo del transporte lo asume Artemisa Beauty.</p>
    <h3 style="color:var(--primary);font-size:15px;margin:18px 0 8px">Recomendaciones</h3>
    <p>Conserva tu comprobante de pago y sigue las instrucciones de uso del producto.</p>
    <div style="text-align:center;margin-top:20px">
      <button onclick="solicitarDevolucion()" style="background:#25D366;color:#fff;border:none;padding:12px 24px;border-radius:25px;font-size:14px;font-weight:600;cursor:pointer;font-family:var(--sans)">📲 Solicitar devolución por WhatsApp</button>
    </div>`},
  privacidad:{titulo:'Política de privacidad',html:`
    <p>Esta política describe cómo Artemisa Beauty recopila, usa y protege tu información personal, conforme a la <strong>Ley 1581 de 2012</strong> de Colombia.</p>
    <h3 style="color:var(--primary);font-size:15px;margin:18px 0 8px">Qué recopilamos</h3>
    <p>Datos de contacto (nombre, dirección, teléfono, correo), información de tus pedidos y comunicaciones con nosotros. Los pagos se procesan por <strong>Mercado Pago</strong>; no almacenamos datos de tu tarjeta.</p>
    <h3 style="color:var(--primary);font-size:15px;margin:18px 0 8px">Cómo la usamos</h3>
    <p>Para procesar y entregar tus pedidos, brindarte atención al cliente, enviarte ofertas (con tu consentimiento) y cumplir obligaciones legales.</p>
    <h3 style="color:var(--primary);font-size:15px;margin:18px 0 8px">Con quién la compartimos</h3>
    <p>Solo con quienes hacen posible el servicio: Mercado Pago (pagos), transportadoras (envíos) y proveedores de tecnología. <strong>Nunca vendemos tu información.</strong></p>
    <h3 style="color:var(--primary);font-size:15px;margin:18px 0 8px">Tus derechos</h3>
    <p>Puedes conocer, actualizar, rectificar o eliminar tus datos escribiéndonos a contactoartemisajyc@gmail.com o al WhatsApp 310 780 9662.</p>
    <p style="margin-top:16px;color:#888;font-size:12px">Artemisa Beauty · NIT 1012448143-3 · Bogotá, Colombia</p>`},
  terminos:{titulo:'Términos y condiciones',html:`
    <p>Al comprar en Artemisa Beauty (www.artemisabeauty.com) aceptas estos términos, regidos por las leyes de Colombia.</p>
    <h3 style="color:var(--primary);font-size:15px;margin:18px 0 8px">Pedidos y pagos</h3>
    <p>Al hacer un pedido realizas una oferta de compra; se confirma al recibir el pago. Los precios pueden cambiar sin previo aviso y no incluyen el envío (se informa antes de pagar). Los pagos se procesan de forma segura por Mercado Pago.</p>
    <h3 style="color:var(--primary);font-size:15px;margin:18px 0 8px">Productos</h3>
    <p>Hacemos lo posible por mostrar los productos con precisión; los colores pueden variar según tu pantalla. Podemos corregir errores de precio o descripción y cancelar pedidos con información errónea.</p>
    <h3 style="color:var(--primary);font-size:15px;margin:18px 0 8px">Propiedad intelectual</h3>
    <p>La marca, el logo, textos e imágenes son propiedad de Artemisa Beauty. No pueden usarse sin autorización.</p>
    <h3 style="color:var(--primary);font-size:15px;margin:18px 0 8px">Devoluciones y garantía</h3>
    <p>Sujetas a nuestra Política de Devoluciones y al Estatuto del Consumidor (Ley 1480 de 2011).</p>
    <p style="margin-top:16px;color:#888;font-size:12px">Artemisa Beauty · NIT 1012448143-3 · Bogotá, Colombia</p>`}
};

function abrirPolitica(key){
  const p=POLITICAS[key];if(!p)return;
  g('politica-titulo').textContent=p.titulo;
  g('politica-contenido').innerHTML=p.html;
  g('politica-overlay').style.display='flex';
}
function cerrarPolitica(){g('politica-overlay').style.display='none';}

function solicitarDevolucion(){
  const msg=`Hola Artemisa Beauty 🌸, quiero solicitar una *devolución o cancelación* de mi pedido.\n\n`+
    `Por favor indícame:\n`+
    `• Nombre:\n`+
    `• Número de pedido o fecha de compra:\n`+
    `• Producto(s):\n`+
    `• Motivo: (¿es por un daño/falla del producto, o por decisión propia?)\n\n`+
    `*Si es por daño o falla, adjunta por favor fotos o video del producto.*`;
  window.open('https://wa.me/573107809662?text='+encodeURIComponent(msg),'_blank');
}

function goAdmin(){ if(g('login-screen')){ if(g('store'))g('store').style.display='none'; g('login-screen').style.display='flex'; } else { window.location.href='admin.html'; } }
// Acceso secreto al admin desde móvil: tocar el logo del footer 5 veces
let _tapsLogo=0,_tapTimer=null;
function tocarLogoAdmin(){
  _tapsLogo++;
  clearTimeout(_tapTimer);
  _tapTimer=setTimeout(()=>{_tapsLogo=0;},1500);
  if(_tapsLogo>=5){_tapsLogo=0;goAdmin();}
}

function loginConGoogle(){
  if(!window.firebase||!firebase.auth){showToast('Cargando... intenta de nuevo','error');return}
  const provider=new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider).then(result=>{
    const email=result.user.email;
    if(email===ADMIN_EMAIL){
      sessionStorage.setItem('adminLoggedIn','true');
      g('login-screen').style.display='none';
      g('admin').style.display='block';
      renderAdminTable();updateDash();
    }else{
      g('login-err').style.display='block';
      firebase.auth().signOut();
    }
  }).catch(err=>{
    if(err.code!=='auth/popup-closed-by-user') showToast('Error al iniciar sesión','error');
  });
}

function doLogout(){
  sessionStorage.removeItem('adminLoggedIn');
  if(window.firebase&&firebase.auth) firebase.auth().signOut();
  if(g('admin')&&g('store')){ g('admin').style.display='none'; g('store').style.display='block'; }
  else { window.location.href='index.html'; }
}

function recargarAdmin(){
  limpiarCacheProductos();
  cargarProductosFirebase();
  cargarContenidoFirebase();
  cargarColoresFirebase();
  cargarReviewsFirebase();
  showToast('Panel actualizado ✓','success');
}

// Mantener sesión al recargar — SOLO si de verdad está autenticado con Google como el correo admin
window.addEventListener('load',()=>{
  if(!window.firebase||!firebase.auth)return;
  firebase.auth().onAuthStateChanged(user=>{
    const queriaAdmin=sessionStorage.getItem('adminLoggedIn')==='true';
    if(queriaAdmin && user && user.email===ADMIN_EMAIL && g('admin')){
      if(g('store'))g('store').style.display='none';
      if(g('login-screen'))g('login-screen').style.display='none';
      g('admin').style.display='block';
      renderAdminTable();updateDash();
    }else if(queriaAdmin){
      // la sesión ya no es válida: limpiar la marca
      sessionStorage.removeItem('adminLoggedIn');
    }
  });
});

function showPanel(id,el){
  document.querySelectorAll('.admin-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.admin-nav-item').forEach(n=>n.classList.remove('active'));
  const panel=g('panel-'+id);if(panel)panel.classList.add('active');
  if(el)el.classList.add('active');
  document.querySelectorAll('.amn-item').forEach(n=>{
    n.classList.toggle('active',(n.getAttribute('onclick')||'').includes("'"+id+"'"));
  });
  if(id==='subscribers') cargarSuscriptores();
  if(id==='orders') cargarPedidos();
  if(id==='comments') cargarComentariosAdmin();
  if(id==='config'){renderCategorias();renderSubcategorias();renderEnviosConfig();}
  if(id==='social')llenarSelectSocial();
  if(id==='imagenes'){llenarSelectImagenes();setTimeout(dibujarImagenPost,100);}
  if(id==='import'||id==='products'){actualizarSelectSubcats();actualizarSelectCats();}
  if(id==='products')escanearImagenes();
}
function showPanelMobile(id,el){
  document.querySelectorAll('.admin-nav-item').forEach(n=>{
    n.classList.toggle('active',(n.getAttribute('onclick')||'').includes("'"+id+"'"));
  });
  showPanel(id,null);
  document.querySelectorAll('.amn-item').forEach(n=>n.classList.remove('active'));
  if(el)el.classList.add('active');
}
function updateDash(){
  g('dash-prods').textContent=products.length;
  g('dash-cats').textContent=[...new Set(products.map(p=>p.cat))].length;
}
let imgsRotas=new Set(); // ids de productos con la foto caída (persiste para el filtro y el aviso)
let filtroEspecial='';
function filtrarEspecial(v){filtroEspecial=v;renderAdminTable();}
let ordenInv='';
function ordenarInventario(v){ordenInv=v;renderAdminTable();}
function aplicarOrdenInv(arr){
  const a=arr.slice();
  const num=p=>typeof p.price==='number'?p.price:0;
  const stk=p=>typeof p.cantidad==='number'?p.cantidad:999999;
  switch(ordenInv){
    case 'nombre-az': a.sort((x,y)=>(x.name||'').localeCompare(y.name||'','es')); break;
    case 'nombre-za': a.sort((x,y)=>(y.name||'').localeCompare(x.name||'','es')); break;
    case 'precio-asc': a.sort((x,y)=>num(x)-num(y)); break;
    case 'precio-desc': a.sort((x,y)=>num(y)-num(x)); break;
    case 'stock-asc': a.sort((x,y)=>stk(x)-stk(y)); break;
    case 'stock-desc': a.sort((x,y)=>stk(y)-stk(x)); break;
    case 'categoria': a.sort((x,y)=>(x.cat||'').localeCompare(y.cat||'','es')||(x.name||'').localeCompare(y.name||'','es')); break;
    case 'nuevo': a.sort((x,y)=>(Number(y.id)||0)-(Number(x.id)||0)); break;
    case 'antiguo': a.sort((x,y)=>(Number(x.id)||0)-(Number(y.id)||0)); break;
  }
  return a;
}
function etiquetaRota(){return ' <span style="font-size:10px;background:#fff0f0;color:#c0392b;border:1px solid #f3c0c0;padding:2px 7px;border-radius:10px;font-weight:700;white-space:nowrap">⚠️ Foto caída</span>';}
function renderAdminTable(){
  const avi=g('aviso-fotos');if(avi)avi.style.display='none';
  // Filtro rápido de gestión
  let lista=products;
  if(filtroEspecial==='stock')lista=products.filter(p=>estaAgotado(p));
  else if(filtroEspecial==='imagen')lista=products.filter(p=>!p.img||imgsRotas.has(p.id));
  lista=aplicarOrdenInv(lista);
  g('admin-prod-table').innerHTML=lista.map(p=>`
    <tr id="fila-${p.id}">
      <td style="text-align:center"><input type="checkbox" class="sel-prod" value="${p.id}" style="width:18px;height:18px;cursor:pointer"></td>
      <td><div class="thumb">${(p.img&&p.img.startsWith('http'))?`<img src="${p.img}" onerror="marcarFotoRota(${p.id},this)">`:(p.img?`<img src="${p.img}">`:(p.emoji||'✨'))}</div></td>
      <td style="font-weight:500">${p.name}<span id="rota-${p.id}"></span>${p.brand?`<div style="font-size:10px;color:var(--gray)">${p.brand}</div>`:''}</td>
      <td style="color:var(--gray);font-size:12px">${p.cat}</td>
      <td>
        <select onchange="cambiarSubcat(${p.id},this.value)" style="font-size:11px;border:1px solid var(--border);padding:3px 6px;border-radius:4px;font-family:var(--sans);outline:none;max-width:130px">
          <option value="">Sin subcat.</option>
          ${p.subcat&&!subcategorias.some(s=>s.toLowerCase()===String(p.subcat).toLowerCase())?`<option value="${p.subcat}" selected>${p.subcat}</option>`:''}
          ${subcategorias.map(s=>`<option value="${s}" ${String(p.subcat||'').toLowerCase()===s.toLowerCase()?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td><span style="font-size:11px;color:var(--gray)">$</span><input type="number" value="${p.price}" onchange="actualizarPrecioRapido(${p.id},this.value)" onclick="event.stopPropagation()" style="width:82px;font-weight:600;border:1px solid var(--border);border-radius:4px;padding:5px 6px;font-size:13px;font-family:var(--sans);outline:none" title="Edita y sal del campo para guardar"></td>
      <td><span style="font-size:10px;padding:3px 8px;border-radius:20px;font-weight:600;background:${estaAgotado(p)?'#fff0f0':p.stock==='preventa'?'#fff5e0':'#eafbf0'};color:${estaAgotado(p)?'#e53e3e':p.stock==='preventa'?'#d4930a':'#276749'}">${estaAgotado(p)?'❌':p.stock==='preventa'?'⏳':'✅'}</span>${typeof p.cantidad==='number'?`<span style="font-size:10px;color:#888;margin-left:5px">${p.cantidad} u.</span>`:''}${p.oculto?'<span style="font-size:9px;background:#333;color:#fff;padding:2px 6px;border-radius:10px;margin-left:5px">🙈 Oculto</span>':''}</td>
      <td>
        <button class="act-btn" onclick="toggleOcultoProd(${p.id})" title="${p.oculto?'Mostrar en la tienda':'Ocultar de la tienda'}">${p.oculto?'🙈':'👁️'}</button>
        <button class="act-btn" onclick="openModal(${p.id})">✏️</button>
        <button class="act-btn danger" onclick="delProd(${p.id})">🗑️</button>
      </td>
    </tr>`).join('')||`<tr><td colspan="8" style="text-align:center;color:var(--gray);padding:30px">✓ No hay productos ${filtroEspecial==='stock'?'sin stock':filtroEspecial==='imagen'?'sin imagen':''}</td></tr>`;
  // Volver a pintar las etiquetas de las fotos ya detectadas como caídas
  imgsRotas.forEach(id=>{const et=g('rota-'+id);if(et)et.innerHTML=etiquetaRota();});
  actualizarAvisoFotos();
  // Si hay una búsqueda activa, reaplicarla (para que no se "pierda" al refrescar la tabla)
  if(_qPanel)searchProds(_qPanel);
}
// Se llama cuando la foto de un producto no carga (está caída)
function marcarFotoRota(id,imgEl){
  if(imgEl){imgEl.style.display='none';imgEl.parentElement.innerHTML='⚠️';imgEl.parentElement.style.fontSize='18px';}
  const etq=g('rota-'+id);if(etq)etq.innerHTML=etiquetaRota();
  imgsRotas.add(id);
  actualizarAvisoFotos();
}
function actualizarAvisoFotos(){
  const avi=g('aviso-fotos');if(!avi)return;
  const ids=[...imgsRotas].filter(id=>products.some(p=>p.id===id));
  if(!ids.length){avi.style.display='none';return}
  const nombres=ids.map(id=>{const p=products.find(x=>x.id===id);return p?p.name:'';}).filter(Boolean).join(', ');
  avi.innerHTML='⚠️ <b>'+ids.length+' producto'+(ids.length>1?'s':'')+' con la foto caída:</b> '+nombres+'. Edítalo'+(ids.length>1?'s':'')+' y corrige el enlace de la imagen.';
  avi.style.display='block';
}
// Escanea TODAS las fotos de productos en segundo plano (no depende de que la tabla las muestre)
function escanearImagenes(){
  imgsRotas.clear();
  products.forEach(p=>{
    if(p.img && String(p.img).startsWith('http')){
      const im=new Image();
      im.onerror=()=>{ imgsRotas.add(p.id); const et=g('rota-'+p.id); if(et)et.innerHTML=etiquetaRota(); actualizarAvisoFotos(); };
      im.src=p.img;
    }
  });
}
async function cambiarSubcat(id,subcat){
  const p=products.find(x=>x.id===id);if(!p)return;
  p.subcat=subcat;
  await guardarProductoFirebase(p);
  updateSubcatFilters();
  showToast('Subcategoría actualizada ✓','success');
}

// ══ BACKUP DE PRODUCTOS ══
function cargarSheetJS(){
  return new Promise((resolve,reject)=>{
    if(window.XLSX){resolve();return;}
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload=()=>resolve();
    s.onerror=()=>reject();
    document.head.appendChild(s);
  });
}

function exportarBackupProductos(){
  if(!products.length){showToast('No hay productos para exportar','error');return}
  // Generar CSV nativo (Excel lo abre perfecto) - sin depender de librerías
  const cols=['ID','Nombre','Marca','SKU','Categoria','Subcategoria','Precio','Estado','Destacado','Estrellas','Colores','Descripcion','Foto','Emoji'];
  const esc=v=>{
    let s=(v===null||v===undefined)?'':String(v);
    s=s.replace(/"/g,'""');
    return `"${s}"`;
  };
  let csv=cols.join(',')+'\n';
  products.forEach(p=>{
    const fila=[
      p.id, p.name||'', p.brand||'', p.sku||'', p.cat||'', p.subcat||'',
      p.price||0, p.stock||'disponible', p.destacado?'Sí':'No', p.stars||'',
      p.colors||'', p.desc||'', p.img||'', p.emoji||''
    ];
    csv+=fila.map(esc).join(',')+'\n';
  });
  // BOM para que Excel lea bien los acentos
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  const fecha=new Date().toISOString().slice(0,10);
  a.download=`backup-artemisa-${fecha}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('✓ Backup descargado','success');
}

async function importarBackupProductos(input){
  const file=input.files[0];if(!file)return;
  if(!confirm('Esto agregará o actualizará los productos del archivo. ¿Continuar?')){input.value='';return}
  try{
    let filas=[];
    const esCSV=file.name.toLowerCase().endsWith('.csv');
    if(esCSV){
      const texto=await file.text();
      filas=parseCSVBackup(texto);
    }else{
      await cargarSheetJS();
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      filas=XLSX.utils.sheet_to_json(ws);
    }
    if(!filas.length){showToast('El archivo está vacío','error');return}
    let ok=0;
    for(const f of filas){
      const prod={
        id:parseInt(f.ID)||Date.now()+Math.floor(Math.random()*1000),
        name:f.Nombre||'Sin nombre',
        brand:f.Marca||null,
        sku:f.SKU||'',
        cat:f.Categoria||'Cabello',
        subcat:f.Subcategoria||null,
        price:parseInt(f.Precio)||0,
        oldPrice:null,
        stock:f.Estado||'disponible',
        destacado:(f.Destacado==='Sí'||f.Destacado===true),
        stars:f.Estrellas||'★★★★★',
        colors:f.Colores||null,
        desc:f.Descripcion||'',
        img:f.Foto||null,
        emoji:f.Emoji||'🧴'
      };
      await guardarProductoFirebase(prod);
      const idx=products.findIndex(x=>x.id===prod.id);
      if(idx>=0)products[idx]=prod;else products.push(prod);
      ok++;
    }
    renderStoreGrid('Todos');renderDestacados();renderAdminTable();updateDash();
    updateBrandFilters();updateSubcatFilters();
    showToast(`✓ ${ok} productos restaurados`,'success');
  }catch(e){showToast('Error al leer el archivo','error')}
  input.value='';
}

function parseCSVBackup(texto){
  texto=texto.replace(/^\ufeff/,'');
  const lineas=[];
  let campo='',fila=[],enComillas=false;
  for(let i=0;i<texto.length;i++){
    const c=texto[i],sig=texto[i+1];
    if(enComillas){
      if(c==='"'&&sig==='"'){campo+='"';i++;}
      else if(c==='"'){enComillas=false;}
      else campo+=c;
    }else{
      if(c==='"')enComillas=true;
      else if(c===','){fila.push(campo);campo='';}
      else if(c==='\n'||c==='\r'){
        if(campo!==''||fila.length){fila.push(campo);lineas.push(fila);fila=[];campo='';}
        if(c==='\r'&&sig==='\n')i++;
      }else campo+=c;
    }
  }
  if(campo!==''||fila.length){fila.push(campo);lineas.push(fila);}
  if(lineas.length<2)return [];
  const headers=lineas[0];
  return lineas.slice(1).map(l=>{
    const obj={};
    headers.forEach((h,i)=>obj[h]=l[i]||'');
    return obj;
  });
}

let _qPanel='';
function searchProds(q){
  _qPanel=q||'';
  const terms=normTxt(q).split(' ').filter(Boolean);
  const coincide=(hay,t)=>hay.includes(t)||(t.length>3&&t.endsWith('s')&&hay.includes(t.slice(0,-1)))||(t.length>2&&hay.includes(t+'s'));
  const rows=g('admin-prod-table').querySelectorAll('tr');
  rows.forEach(r=>{
    if(!terms.length){r.style.display='';return;}
    const idm=(r.id||'').match(/^fila-(.+)$/);
    let hay;
    if(idm){const p=products.find(x=>String(x.id)===idm[1]);hay=p?normTxt([p.name,p.cat,p.subcat,p.brand,p.desc,p.ficha,p.sku].filter(Boolean).join(' ')):normTxt(r.textContent);}
    else hay=normTxt(r.textContent);
    r.style.display=terms.every(t=>coincide(hay,t))?'':'none';
  });
}
function filterAdminCat(cat){
  const rows=g('admin-prod-table').querySelectorAll('tr');
  rows.forEach(r=>{r.style.display=!cat||r.textContent.includes(cat)?'':'none'});
}

// ══ MODAL PRODUCTO ══
const EMOJIS_LIST=['✨','💄','🧴','🧖','💆','👁️','🌸','🚿','🎨','🌺','💅','🪞','🧼','💊','🌿','🍃','💋','🎀','🫧','🩷'];
// ══ PALETA DE COLORES (elegir sin escribir) ══
const PALETA_COLORES=[
  // Nudes / pieles / tonos cálidos
  {n:'Marfil',h:'#F3EAD3'},{n:'Hueso',h:'#EDE8DC'},{n:'Crema',h:'#F7E9CD'},{n:'Beige Claro',h:'#EAD9BF'},{n:'Natural',h:'#E3C9A8'},{n:'Nude',h:'#E3BBA1'},{n:'Nude Rosado',h:'#E8C4C0'},{n:'Arena',h:'#D8B894'},{n:'Taupe',h:'#8B8178'},{n:'Durazno',h:'#FFCBA4'},{n:'Melocotón',h:'#FFB07C'},{n:'Salmón',h:'#FA8072'},{n:'Champaña',h:'#F1E1C6'},{n:'Miel',h:'#C8963E'},{n:'Dorado',h:'#C9A227'},{n:'Canela',h:'#A9622B'},{n:'Terracota',h:'#C56A4E'},{n:'Cobre',h:'#B05A2A'},{n:'Bronce',h:'#CD7F32'},{n:'Ladrillo',h:'#9E3B2E'},
  // Cabello
  {n:'Rubio Platino',h:'#EDE6D6'},{n:'Rubio Claro',h:'#E6C98F'},{n:'Rubio',h:'#D4A95E'},{n:'Rubio Ceniza',h:'#C9BBA0'},{n:'Rubio Oscuro',h:'#B07E3B'},{n:'Castaño Claro',h:'#8B5A2B'},{n:'Castaño',h:'#6B4226'},{n:'Chocolate',h:'#4B2E1E'},{n:'Chocolate Oscuro',h:'#3A2317'},{n:'Caoba',h:'#6E2C1E'},{n:'Café',h:'#6D4C41'},{n:'Marrón',h:'#5D4037'},
  // Neutros
  {n:'Negro',h:'#111111'},{n:'Grafito',h:'#3B3B3B'},{n:'Carbón',h:'#36454F'},{n:'Gris',h:'#808080'},{n:'Gris Claro',h:'#C0C0C0'},{n:'Plateado',h:'#C7CCD1'},{n:'Perla',h:'#EAE6DA'},{n:'Blanco',h:'#FFFFFF'},
  // Rosas / rojos
  {n:'Rosa',h:'#E6A6B8'},{n:'Rosa Palo',h:'#E7C2CB'},{n:'Rosa Dorado',h:'#B76E79'},{n:'Rosa Neón',h:'#FF44CC'},{n:'Fucsia',h:'#D81B60'},{n:'Fucsia Neón',h:'#FF2E88'},{n:'Coral',h:'#FF6F61'},{n:'Rojo',h:'#D32F2F'},{n:'Rojo Cereza',h:'#A4133C'},{n:'Vino',h:'#7B1E3A'},{n:'Borgoña',h:'#5C1A2B'},{n:'Ciruela',h:'#6A1B4D'},{n:'Rojizo',h:'#8B2E2E'},
  // Morados / azules
  {n:'Morado',h:'#7E57C2'},{n:'Uva',h:'#5E35B1'},{n:'Lila',h:'#C9A0DC'},{n:'Lavanda',h:'#B39DDB'},{n:'Azul',h:'#1E88E5'},{n:'Azul Rey',h:'#1A237E'},{n:'Azul Marino',h:'#1B2A4A'},{n:'Azul Claro',h:'#90CAF9'},{n:'Celeste',h:'#BBDEFB'},{n:'Turquesa',h:'#26C6DA'},{n:'Aqua',h:'#2BC4B4'},
  // Verdes / amarillos / naranjas
  {n:'Verde',h:'#43A047'},{n:'Verde Esmeralda',h:'#1E8E5A'},{n:'Verde Menta',h:'#A8E6CF'},{n:'Menta',h:'#B6E8D8'},{n:'Verde Oliva',h:'#808000'},{n:'Verde Militar',h:'#4B5320'},{n:'Verde Neón',h:'#39FF14'},{n:'Amarillo',h:'#FDD835'},{n:'Amarillo Neón',h:'#FFF700'},{n:'Mostaza',h:'#D4A017'},{n:'Naranja',h:'#FB8C00'},{n:'Naranja Neón',h:'#FF6700'},
  // Acabados especiales (efecto degradado)
  {n:'Tornasol',h:'linear-gradient(135deg,#b8f2e6,#ffd6e8,#c9b8f2,#b8e0f2)'},
  {n:'Holográfico',h:'linear-gradient(135deg,#ff9a9e,#a1c4fd,#c2e9fb,#fbc2eb,#fdcbf1)'},
  {n:'Nacarado',h:'linear-gradient(135deg,#f5f0e8,#e8e0f0,#f0e8f0)'},
  {n:'Multicolor',h:'linear-gradient(90deg,#e53935,#fb8c00,#fdd835,#43a047,#1e88e5,#8e24aa)'},
  {n:'Dorado Metálico',h:'linear-gradient(135deg,#f9e29c,#c9a227,#f9e29c)'},
  {n:'Plateado Metálico',h:'linear-gradient(135deg,#e8e8e8,#9e9e9e,#f5f5f5)'},
  {n:'Rosa Metálico',h:'linear-gradient(135deg,#f6c9d4,#b76e79,#f6c9d4)'},
  {n:'Cobre Metálico',h:'linear-gradient(135deg,#e0a080,#b05a2a,#e0a080)'}
];
let coloresProd=[]; // [{name,hex}] del producto que se está editando
function renderPaleta(){
  const cont=g('paleta-colores');if(!cont)return;
  cont.innerHTML=PALETA_COLORES.map(c=>`<div title="${c.n}" onclick="agregarColorProd('${c.h}','${c.n}')" style="width:26px;height:26px;border-radius:5px;cursor:pointer;background:${c.h};border:1px solid rgba(0,0,0,.15);flex-shrink:0"></div>`).join('');
}
function agregarColorProd(hex,name){
  if(coloresProd.some(c=>(c.hex||'').toLowerCase()===hex.toLowerCase()))return; // evita duplicado
  coloresProd.push({name:name||'',hex});
  renderColoresElegidos();
}
function quitarColorProd(i){coloresProd.splice(i,1);renderColoresElegidos();}
function renombrarColorProd(i,val){if(coloresProd[i]){coloresProd[i].name=val;syncColorsHidden();}}
function syncColorsHidden(){const h=g('f-colors');if(h)h.value=coloresProd.map(c=>c.name).filter(Boolean).join(', ');}
function renderColoresElegidos(){
  const cont=g('colores-elegidos');if(!cont)return;
  cont.innerHTML=coloresProd.map((c,i)=>`<div style="display:flex;align-items:center;gap:8px"><span style="width:26px;height:26px;border-radius:5px;background:${c.hex};border:1px solid rgba(0,0,0,.15);flex-shrink:0"></span><input value="${(c.name||'').replace(/"/g,'&quot;')}" oninput="renombrarColorProd(${i},this.value)" placeholder="Nombre (ej: Marfil o Tono ${i+1})" style="flex:1;border:1px solid var(--border);padding:7px 10px;font-size:13px;border-radius:4px;font-family:var(--sans)"><button type="button" class="act-btn danger" onclick="quitarColorProd(${i})" title="Quitar">✕</button></div>`).join('');
  syncColorsHidden();
}
// Toma el texto pegado del proveedor y lo organiza: un dato limpio por línea, sin basura ni repetidos.
function organizarFicha(){
  const ta=g('f-ficha'); if(!ta)return;
  let t=(ta.value||'').replace(/\r/g,'\n');
  if(!t.trim()){showToast('Pega primero la info del producto en la ficha','error');return;}
  // Cortar por saltos de línea, viñetas y separadores comunes
  const parts=t.split(/\n+|\s*[•·▪◦‣]\s*|\s+\|\s+|\s{3,}/);
  const seen=new Set(); const out=[];
  parts.forEach(l=>{
    l=l.replace(/^[\s\-\*•·–—]+/,'').replace(/\s+/g,' ').trim();
    if(l.length<2)return;
    // Descartar líneas de ruido típicas de páginas (botones, envíos, etc.)
    if(/^(agregar al carrito|comprar|a[ñn]adir|compartir|inicio|men[uú]|buscar)$/i.test(l))return;
    l=l.charAt(0).toUpperCase()+l.slice(1);
    const k=l.toLowerCase();
    if(!seen.has(k)){seen.add(k);out.push(l);}
  });
  ta.value=out.join('\n');
  showToast('Ficha organizada ✓ ('+out.length+' datos)','success');
}
// Pega la info del proveedor en la ficha y la IA llena los campos del formulario
async function autollenarConIA(){
  const ta=g('f-ficha');
  const texto=(ta?.value||'').trim();
  if(!texto){showToast('Pega primero la info del producto en la ficha','error');return;}
  const btn=g('btn-autollenar');
  const orig=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='Analizando…';}
  try{
    const categorias=g('f-cat')?[...g('f-cat').options].map(o=>o.value).filter(Boolean):[];
    const subcats=(typeof subcategorias!=='undefined'&&Array.isArray(subcategorias))?subcategorias:[];
    const res=await fetch('/api/organizar-producto',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({texto,categorias,subcategorias:subcats})});
    const d=await res.json();
    if(d.error)throw new Error(d.error);
    const setIf=(id,val)=>{const el=g(id);if(el&&val!=null&&String(val).trim()!=='')el.value=val;};
    setIf('f-name',d.nombre);
    setIf('f-brand',d.marca);
    setIf('f-sku',d.sku);
    if(d.precio&&Number(d.precio)>0&&g('f-price'))g('f-price').value=Math.round(Number(d.precio));
    setIf('f-tamano',d.tamano);
    setIf('f-desc',d.descripcion);
    if(d.ficha)g('f-ficha').value=d.ficha;
    // Categoría (si coincide con una opción del select)
    if(d.categoria&&g('f-cat')){const opt=[...g('f-cat').options].find(o=>o.value.toLowerCase()===String(d.categoria).toLowerCase());if(opt)g('f-cat').value=opt.value;}
    // Subcategoría (si coincide con una opción del select)
    if(d.subcategoria&&g('f-subcat')){const opt=[...g('f-subcat').options].find(o=>o.value.toLowerCase()===String(d.subcategoria).toLowerCase());if(opt)g('f-subcat').value=opt.value;}
    // Colores sugeridos → se agregan a la paleta elegida
    if(Array.isArray(d.colores)&&d.colores.length){
      d.colores.forEach(nm=>{
        nm=String(nm||'').trim(); if(!nm)return;
        const pal=PALETA_COLORES.find(c=>c.n.toLowerCase()===nm.toLowerCase());
        const hex=pal?pal.h:(getColorHex(nm)||'#dddddd');
        if(!coloresProd.some(c=>(c.name||'').toLowerCase()===nm.toLowerCase()))coloresProd.push({name:nm,hex});
      });
      renderColoresElegidos();
    }
    showToast('✓ Campos llenados con IA. Revísalos antes de guardar.','success');
  }catch(e){showToast('No se pudo autollenar: '+(e.message||'error'),'error');console.error(e);}
  if(btn){btn.disabled=false;btn.textContent=orig;}
}
function cargarColoresProd(p){
  coloresProd=[];
  if(p && Array.isArray(p.coloresLista) && p.coloresLista.length){
    coloresProd=p.coloresLista.map(c=>({name:c.name||'',hex:c.hex||getColorHex(c.name)||'#dddddd'}));
  }else if(p && p.colors){
    coloresProd=p.colors.split(',').map(s=>s.trim()).filter(Boolean).map(nm=>({name:nm,hex:getColorHex(nm)||'#dddddd'}));
  }
  renderColoresElegidos();
}
function openModal(id){
  editId=id||null;currentImg=null;photoMode='file';
  g('am-title').textContent=id?'Editar producto':'Agregar producto';
  g('file-preview').style.display='none';g('url-preview').style.display='none';g('url-input').value='';
  // Emoji grid
  g('emoji-grid').innerHTML=EMOJIS_LIST.map(e=>`<div class="emoji-opt${selEmoji===e?' sel':''}" onclick="selEmoji='${e}';document.querySelectorAll('.emoji-opt').forEach(x=>x.classList.remove('sel'));this.classList.add('sel')">${e}</div>`).join('');
  if(id){
    const p=products.find(x=>x.id===id);
    g('f-name').value=p.name;g('f-sku').value=p.sku||'';g('f-cat').value=p.cat;
    g('f-badge').value=p.badge||'';g('f-price').value=p.price;
    g('f-stars').value=p.stars;g('f-desc').value=p.desc||'';g('f-colors').value=p.colors||'';
    g('f-brand').value=p.brand||'';
    // Subcategoría: asegurar que la del producto exista como opción y quede seleccionada (así NO se borra al guardar)
    if(g('f-subcat')){const sel=g('f-subcat');let match=Array.from(sel.options).find(o=>o.value.toLowerCase()===String(p.subcat||'').toLowerCase());if(p.subcat&&!match){const o=document.createElement('option');o.value=p.subcat;o.textContent=p.subcat;sel.appendChild(o);match=o;}sel.value=match?match.value:'';}
    if(g('f-stock'))g('f-stock').value=p.stock||'disponible';if(g('f-cantidad'))g('f-cantidad').value=(p.cantidad===null||p.cantidad===undefined)?'':p.cantidad;if(g('f-destacado'))g('f-destacado').checked=p.destacado||false;selEmoji=p.emoji;
    if(p.img){currentImg=p.img;if(p.img.startsWith('http')){g('url-input').value=p.img;g('url-preview').src=p.img;g('url-preview').style.display='block';switchPhotoTab('url',document.querySelectorAll('.photo-tab')[1])}else{g('file-preview').src=p.img;g('file-preview').style.display='block'}}
    if(g('f-imgs-extra'))g('f-imgs-extra').value=(p.imgs&&p.imgs.length>1)?p.imgs.slice(1).join('\n'):'';
  }else{
    ['f-name','f-sku','f-price','f-desc','f-colors','f-brand'].forEach(id=>g(id).value='');if(g('f-subcat'))g('f-subcat').value='';if(g('f-stock'))g('f-stock').value='disponible';if(g('f-cantidad'))g('f-cantidad').value='';if(g('f-imgs-extra'))g('f-imgs-extra').value='';if(g('f-destacado'))g('f-destacado').checked=false;
    g('f-badge').value='';selEmoji='✨';
  }
  // Colores (paleta), tamaño y ficha técnica
  renderPaleta();
  const _pe=id?products.find(x=>x.id===id):null;
  cargarColoresProd(_pe);
  if(g('f-tamano'))g('f-tamano').value=_pe?.tamano||'';
  if(g('f-ficha'))g('f-ficha').value=_pe?.ficha||'';
  g('am-overlay').classList.add('open');
  switchProdTab('manual');
}
function closeModal(){g('am-overlay').classList.remove('open')}
function switchPhotoTab(mode,btn){
  photoMode=mode;
  document.querySelectorAll('.photo-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  ['file','url','emoji'].forEach(m=>g('photo-'+m).style.display=m===mode?'block':'none');
}

function previewUrl(url){const el=g('url-preview');el.onerror=()=>{if(url&&/^https?:\/\//.test(url)){el.style.display='none';showToast('⚠️ La foto no cargó, revisa el enlace','error');}};el.src=url;el.style.display=url?'block':'none'}
function handleFile(input){
  const file=input.files[0];if(!file)return;
  comprimirImagen(file).then(b64=>{
    if(!b64){showToast('No se pudo procesar la imagen','error');return}
    currentImg=b64;
    g('file-preview').src=currentImg;
    g('file-preview').style.display='block';
  });
}

async function generarDescripcionIA(){
  const name=g('f-name').value.trim(),cat=g('f-cat').value;
  if(!name){showToast('Primero escribe el nombre del producto','error');return}
  const btn=g('btn-ia-desc');
  btn.disabled=true;btn.textContent='Generando...';
  try{
    const res=await fetch('/api/generar-descripcion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:name,categoria:cat})});
    const data=await res.json();
    if(data.error)throw new Error(data.error);
    g('f-desc').value=data.descripcion;
    showToast('Descripción generada ✓','success');
  }catch(e){showToast('Error al generar descripción','error')}
  btn.disabled=false;btn.textContent='✨ Generar descripción con IA';
}

async function saveProduct(){
  const name=g('f-name').value.trim(),price=parseInt(g('f-price').value);
  if(!name||!price){showToast('Completa nombre y precio','error');return}
  let finalImg=photoMode==='url'?g('url-input').value.trim():photoMode==='file'?currentImg:null;
  const _cantRaw=g('f-cantidad')?g('f-cantidad').value.trim():'';
  // Unidades en stock: obligatorio
  if(_cantRaw===''){showToast('Pon las unidades en stock (campo obligatorio)','error');if(g('f-cantidad'))g('f-cantidad').focus();return}
  const cantidad=Math.max(0,parseInt(_cantRaw)||0);
  // Galería: foto principal + fotos extra (una URL por línea)
  const extra=(g('f-imgs-extra')?g('f-imgs-extra').value:'').split(/[\n|]+/).map(s=>s.trim()).filter(Boolean);
  // Si no hay foto principal pero sí hay "más fotos", usa la primera como portada
  if(!finalImg && extra.length) finalImg=extra[0];
  const imgs=[...new Set([finalImg,...extra].filter(Boolean))];
  // Colores estructurados (paleta + nombre), tamaño y ficha técnica
  const coloresLista=coloresProd.map(c=>({name:(c.name||'').trim(),hex:c.hex})).filter(c=>c.name);
  const colorsStr=coloresLista.map(c=>c.name).join(', ')||null;
  const tamano=(g('f-tamano')?.value||'').trim()||null;
  const ficha=(g('f-ficha')?.value||'').trim()||null;
  const d={id:editId||nextId++,name,sku:g('f-sku').value.trim(),brand:g('f-brand').value.trim()||null,cat:g('f-cat').value,subcat:g('f-subcat')?.value||null,price,oldPrice:null,img:finalImg||null,imgs:imgs.length?imgs:null,emoji:selEmoji,badge:g('f-badge').value||null,stock:g('f-stock')?.value||'disponible',cantidad,destacado:g('f-destacado')?.checked||false,stars:g('f-stars').value,desc:g('f-desc').value.trim(),colors:colorsStr,coloresLista:coloresLista.length?coloresLista:null,tamano,ficha,oculto:editId?((products.find(x=>x.id===editId)||{}).oculto||false):false};
  if(editId){const i=products.findIndex(x=>x.id===editId);products[i]=d;showToast('Producto actualizado ✓','success')}
  else{products.push(d);showToast('Producto agregado ✓','success')}
  renderAdminTable();renderStoreGrid(currentCat);updateDash();closeModal();
  await guardarProductoFirebase(d);
  enviarACatalogoSheet(d);
}

// Pone 3 unidades de stock a TODOS los productos (una sola vez, para iniciar)
async function inicializarStockTodos(){
  if(!products.length){showToast('No hay productos','error');return}
  if(!confirm('Esto le pondrá 3 unidades de stock a los '+products.length+' productos. ¿Continuar?'))return;
  showToast('Guardando stock...','success');
  let ok=0;
  for(const p of products){
    p.cantidad=3;
    if(p.stock==='agotado')p.stock='disponible';
    try{ await guardarProductoFirebase(p); ok++; }catch(e){}
  }
  renderAdminTable();renderStoreGrid(currentCat);updateDash();
  showToast('✓ '+ok+' productos con 3 unidades','success');
}

// Sube (o baja) un % a TODOS los precios. El % se lee de la casilla #pct-precios.
// Confirmación por doble toque (funciona en celular, sin ventanas emergentes).
// Redondea al 100 más cercano. Si el producto tiene precio tachado (oldPrice), lo ajusta igual.
var _pctConfirm=false, _pctTimer=null;
// Marca/desmarca todas las casillas de la tabla
function toggleSelTodos(master){document.querySelectorAll('.sel-prod').forEach(c=>{c.checked=master.checked;});}
// Devuelve los productos marcados; si no hay ninguno marcado, devuelve TODOS
function productosObjetivoPrecios(){
  const sel=Array.from(document.querySelectorAll('.sel-prod:checked')).map(c=>String(c.value));
  if(!sel.length)return {lista:products.slice(), todos:true};
  return {lista:products.filter(p=>sel.includes(String(p.id))), todos:false};
}
async function subirPreciosTodos(){
  if(!products.length){showToast('No hay productos','error');return}
  const inp=g('pct-precios');
  const pct=parseFloat(String(inp?inp.value:'6').replace(',','.'));
  if(isNaN(pct)||pct===0){showToast('Escribe un porcentaje válido','error');return}
  const btn=g('btn-subir-precios');
  const factor=1+pct/100;
  const r100=n=>Math.max(0,Math.round(n*factor/100)*100);
  const {lista,todos}=productosObjetivoPrecios();
  if(!lista.length){showToast('No hay productos seleccionados','error');return}
  const cuantos=todos?('TODOS ('+lista.length+')'):(lista.length+' seleccionado'+(lista.length>1?'s':''));
  // Primer toque: pedir confirmación en el mismo botón
  if(!_pctConfirm){
    _pctConfirm=true;
    if(btn){ if(!btn.dataset.orig)btn.dataset.orig=btn.textContent; btn.textContent=`Toca otra vez: ${pct>0?'subir':'bajar'} ${Math.abs(pct)}% a ${cuantos}`; btn.style.background='#8a3a50'; btn.style.color='#fff'; btn.style.borderColor='#8a3a50'; }
    clearTimeout(_pctTimer);
    _pctTimer=setTimeout(()=>{ _pctConfirm=false; if(btn){btn.textContent=btn.dataset.orig||'💲 Subir precios'; btn.style.background=''; btn.style.color=''; btn.style.borderColor='';} },4500);
    return;
  }
  // Segundo toque: aplicar solo a la lista objetivo
  _pctConfirm=false; clearTimeout(_pctTimer);
  if(btn){ btn.textContent=btn.dataset.orig||'💲 Subir precios'; btn.style.background=''; btn.style.color=''; btn.style.borderColor=''; }
  showToast('Actualizando precios...','success');
  let ok=0;
  for(const p of lista){
    if(typeof p.price==='number'&&p.price>0){
      p.price=r100(p.price);
      if(typeof p.oldPrice==='number'&&p.oldPrice>0){ p.oldPrice=r100(p.oldPrice); }
      try{ await guardarProductoFirebase(p); ok++; }catch(e){}
    }
  }
  limpiarCacheProductos();
  renderAdminTable();renderStoreGrid(currentCat);renderDestacados();updateDash();
  showToast('✓ '+ok+' productos actualizados ('+(pct>0?'+':'')+pct+'%)','success');
}
// Oculta o muestra un producto de la tienda (se queda en el panel)
// Ajuste rápido de precio desde la tabla (sin abrir el producto)
async function actualizarPrecioRapido(id,val){
  const p=products.find(x=>x.id===id);if(!p)return;
  const n=Math.round(Number(String(val).replace(/[^\d]/g,'')));
  if(!n||n<=0){showToast('Precio no válido','error');renderAdminTable();return;}
  if(n===p.price)return;
  p.price=n;
  try{ await guardarProductoFirebase(p); limpiarCacheProductos(); showToast('✓ Precio actualizado: '+fmt(n),'success'); }
  catch(e){ showToast('No se pudo guardar el precio','error'); }
  renderStoreGrid(currentCat);renderDestacados();updateDash();
}
async function toggleOcultoProd(id){
  const p=products.find(x=>x.id===id);if(!p)return;
  p.oculto=!p.oculto;
  try{ await guardarProductoFirebase(p); limpiarCacheProductos(); }catch(e){}
  renderAdminTable();renderStoreGrid(currentCat);renderDestacados();updateDash();
  showToast(p.oculto?('🙈 "'+p.name+'" oculto de la tienda'):('👁️ "'+p.name+'" visible en la tienda'),'success');
}
async function delProd(id){
  if(!confirm('¿Eliminar este producto?'))return;
  products=products.filter(x=>x.id!==id);
  renderAdminTable();renderStoreGrid(currentCat);updateDash();
  showToast('Producto eliminado','error');
  await borrarProductoFirebase(id);
}

// ══ CONTENT ══
function applyContent(){
  const gv=id=>g(id)?.value||'';
  if(g('s-hero-tag'))g('s-hero-tag').textContent=gv('c-tag');
  if(g('s-hero-title'))g('s-hero-title').innerHTML=gv('c-title');
  if(g('s-hero-desc'))g('s-hero-desc').textContent=gv('c-desc');
  if(g('s-hero-btn1'))g('s-hero-btn1').textContent=gv('c-btn1');
  if(g('s-hero-btn2'))g('s-hero-btn2').textContent=gv('c-btn2');
  if(g('s-about-sub'))g('s-about-sub').textContent=gv('c-about-sub');
  if(g('s-about-desc'))g('s-about-desc').textContent=gv('c-about-desc');
  ['1','2','3','4'].forEach(n=>{if(g('s-s'+n+'n'))g('s-s'+n+'n').textContent=gv('c-s'+n+'n');if(g('s-s'+n+'l'))g('s-s'+n+'l').textContent=gv('c-s'+n+'l')});
}

// Pinta el contenido en la TIENDA directo desde los datos de Firebase.
// Solo escribe si el valor viene con contenido: así nunca borra los textos por defecto.
function pintarContenidoTienda(d){
  if(!d)return;
  const set=(id,val,html)=>{const el=g(id);if(el&&val!=null&&String(val).trim()!=='')el[html?'innerHTML':'textContent']=val;};
  set('s-hero-tag',d.tag); set('s-hero-title',d.title,true); set('s-hero-desc',d.desc);
  set('s-hero-btn1',d.btn1); set('s-hero-btn2',d.btn2);
  set('s-about-sub',d.aboutSub); set('s-about-desc',d.aboutDesc);
  ['1','2','3','4'].forEach(n=>{set('s-s'+n+'n',d['s'+n+'n']); set('s-s'+n+'l',d['s'+n+'l']);});
}

function aplicarAboutMedia(url){
  if(!url)return;
  const el=g('about-visual');if(!el)return;
  el.innerHTML=`<img src="${url}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='🌿'">`;
}

let _aboutMediaB64=null;
function comprimirImagen(file, maxWidth=1000, quality=0.7){
  return new Promise(resolve=>{
    const img=new Image();
    const url=URL.createObjectURL(file);
    img.onload=()=>{
      let w=img.width,h=img.height;
      if(w>maxWidth){h=Math.round(h*maxWidth/w);w=maxWidth;}
      const canvas=document.createElement('canvas');
      canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d');
      ctx.drawImage(img,0,0,w,h);
      // Reducir calidad/tamaño automáticamente hasta que quepa bajo ~700KB (límite seguro Firebase)
      let q=quality;
      let result=canvas.toDataURL('image/jpeg',q);
      const LIMITE=700000; // ~700KB en base64
      let intentos=0;
      while(result.length>LIMITE && intentos<8){
        intentos++;
        if(q>0.35){
          q-=0.12;
        }else{
          // Si bajar calidad no basta, reducir dimensiones
          w=Math.round(w*0.8);h=Math.round(h*0.8);
          canvas.width=w;canvas.height=h;
          ctx.drawImage(img,0,0,w,h);
          q=0.6;
        }
        result=canvas.toDataURL('image/jpeg',q);
      }
      resolve(result);
      URL.revokeObjectURL(url);
    };
    img.onerror=()=>{resolve(null);URL.revokeObjectURL(url);};
    img.src=url;
  });
}

function subirFotoAbout(input){
  const file=input.files[0];if(!file)return;
  comprimirImagen(file).then(async b64=>{
    if(!b64){showToast('No se pudo procesar la imagen','error');return}
    _aboutMediaB64=b64;
    aplicarAboutMedia(b64);
    if(g('c-about-media'))g('c-about-media').value=b64;
    try{
      const d=await fdb.collection('config').doc('contenido').get();
      const existing=d.exists?d.data():{};
      await fdb.collection('config').doc('contenido').set({...existing,aboutMedia:b64});
      showToast('Foto guardada ✓','success');
    }catch(e){showToast('Error: usa una URL de ImgBB','error')}
  });
}
function activarLivePreview(){
  ['c-tag','c-title','c-desc','c-btn1','c-btn2','c-about-sub','c-about-desc','c-s1n','c-s1l','c-s2n','c-s2l','c-s3n','c-s3l','c-s4n','c-s4l'].forEach(id=>{const el=g(id);if(el)el.addEventListener('input',applyContent)});
}

// ══ COLORS ══
var heroSlideTimer=null;
function aplicarHeroMedia(raw){
  if(!raw)return;
  const visual=g('hero-visual');
  if(heroSlideTimer){clearInterval(heroSlideTimer);heroSlideTimer=null;}
  visual.style.fontSize='0';
  // ¿Es un video de YouTube?
  const ytMatch=raw.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n]+)/);
  if(ytMatch){
    const videoId=ytMatch[1].trim();
    visual.innerHTML=`<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0" style="position:absolute;inset:0;width:100%;height:100%;border:none;object-fit:cover" allow="autoplay;fullscreen"></iframe>`;
    return;
  }
  // Separar en varias imágenes (una por línea o separadas por |). Las base64 van solas.
  let fotos = raw.trim().startsWith('data:') ? [raw.trim()] : raw.split(/[\n|]+/).map(s=>s.trim()).filter(Boolean);
  visual.style.background='linear-gradient(135deg,#f2dde3 0%,#f7e9cd 100%)';
  // Una sola foto → imagen simple con fade-in
  if(fotos.length<=1){
    visual.innerHTML=`<img src="${fotos[0]}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .8s ease" onload="this.style.opacity='1'" onerror="this.parentElement.innerHTML='<div style=\\'font-size:120px;display:flex;align-items:center;justify-content:center;height:100%\\'>🌸</div>'">`;
    return;
  }
  // Varias fotos → carrusel. Para NO saturar la memoria al abrir (y evitar que el
  // navegador recargue la página en celulares cargados), muestra la 1ª de una y
  // agrega las demás 1.5 s después, ya con la página renderizada.
  visual.innerHTML=`<img src="${fotos[0]}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:1;transition:opacity 1.2s ease" onerror="this.parentElement.style.background='linear-gradient(135deg,#f2dde3 0%,#f7e9cd 100%)'">`;
  if(heroSlideTimer){clearInterval(heroSlideTimer);heroSlideTimer=null;}
  setTimeout(()=>{
    // Agregar el resto de imágenes (ocultas) para el carrusel
    for(let i=1;i<fotos.length;i++){
      const im=document.createElement('img');
      im.src=fotos[i]; im.decoding='async'; im.loading='lazy';
      im.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 1.2s ease';
      visual.appendChild(im);
    }
    const imgs=visual.querySelectorAll('img');
    if(imgs.length<2)return;
    let actual=0;
    heroSlideTimer=setInterval(()=>{
      imgs[actual].style.opacity='0';
      actual=(actual+1)%imgs.length;
      imgs[actual].style.opacity='1';
    },5000);
  },1500);
}

function subirFotoHero(input){
  const file=input.files[0];if(!file)return;
  comprimirImagen(file).then(async b64=>{
    aplicarHeroMedia(b64);
    if(g('c-hero-media'))g('c-hero-media').value=b64;
    try{
      const d=await fdb.collection('config').doc('contenido').get();
      const existing=d.exists?d.data():{};
      await fdb.collection('config').doc('contenido').set({...existing,heroMedia:b64});
      showToast('Foto del hero guardada ✓','success');
    }catch(e){showToast('Error: imagen muy grande, usa una URL','error')}
  });
}

async function cargarHeroMediaFirebase(){
  try{
    const doc = await fdb.collection('config').doc('heroMedia').get();
    if(doc.exists && doc.data().url){
      const url = doc.data().url;
      if(g('c-hero-media')) g('c-hero-media').value = url;
      aplicarHeroMedia(url);
    }
  }catch(e){ console.error('Error hero media:',e); }
}

function aplicarColores(){
  const c1=g('cfg-color1')?.value||'#b5516a',c2=g('cfg-color2')?.value||'#c9a96e';
  document.documentElement.style.setProperty('--primary',c1);
  document.documentElement.style.setProperty('--gold',c2);
}

// ══ PESTAÑAS MODAL PRODUCTO ══
function switchProdTab(tab){
  g('prod-tab-manual').style.display=tab==='manual'?'block':'none';
  g('prod-tab-link').style.display=tab==='link'?'block':'none';
  g('tab-manual-btn').classList.toggle('active',tab==='manual');
  g('tab-link-btn').classList.toggle('active',tab==='link');
}

// ══ EXTRACCIÓN POR LINK ══
function resetUrlStatus(){const s=g('url-status');s.style.display='none';s.className='url-status'}
async function extraerDesdeUrl(){
  const url=g('f-url').value.trim();
  if(!url.startsWith('http')){showToast('Ingresa un link válido','error');return}
  const status=g('url-status'),btn=g('btn-extract');
  status.style.display='block';status.className='url-status load';status.textContent='🤖 Analizando el link con IA...';
  btn.disabled=true;btn.textContent='Analizando...';
  try{
    const res=await fetch('/api/generar-descripcion',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({nombre:'producto del link: '+url,categoria:g('f-cat').value,modo:'url',url})
    });
    const data=await res.json();
    if(data.error)throw new Error(data.error);
    // Llenar campos automáticamente
    if(data.nombre)g('f-name').value=data.nombre;
    if(data.descripcion)g('f-desc').value=data.descripcion;
    switchProdTab('manual');
    status.className='url-status ok';status.textContent='✅ Información extraída. Revisa y ajusta antes de guardar.';
    showToast('Info extraída con IA ✓','success');
  }catch(e){
    status.className='url-status err';status.textContent='❌ No se pudo analizar el link. Intenta de nuevo.';
  }
  btn.disabled=false;btn.textContent='🤖 Extraer info con IA';
}

// ══ SUBIR EXCEL DIRECTO ══
let excelProductos = [];

function excelFileStatus(msg, tipo) {
  const el = g('excel-file-status');
  el.style.display = 'block'; el.textContent = msg;
  el.style.background = tipo==='ok'?'#eafbf0':tipo==='err'?'#fff0f0':'#eef3fe';
  el.style.color = tipo==='ok'?'#276749':tipo==='err'?'#e53e3e':'#2b6cb0';
}

function leerExcel(input) {
  const file = input.files[0];
  if (!file) return;
  g('excel-filename').textContent = file.name;
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      // Intentar leer como CSV si es .csv
      if (file.name.endsWith('.csv')) {
        const text = new TextDecoder().decode(e.target.result);
        const lineas = text.split('\n').filter(l=>l.trim());
        // Detectar separador
        const sep = lineas[0].includes('\t') ? '\t' : ',';
        const inicio = lineas[0].toLowerCase().includes('nombre') ? 1 : 0;
        excelProductos = lineas.slice(inicio).filter(l=>l.trim()).map((l,i) => {
          const cols = l.split(sep).map(c=>c.replace(/^"|"$/g,'').trim());
          return {
            id: Date.now()+i,
            name: cols[0]||'', desc: cols[1]||'',
            price: parseInt((cols[3]||cols[2]||'0').replace(/\D/g,''))||0,
            oldPrice: parseInt((cols[2]||'0').replace(/\D/g,''))||null,
            cat: cols[4]||'Cabello', img: cols[5]||null,
            emoji:'🧴', badge:null, stars:'★★★★★'
          };
        }).filter(p=>p.name);
      } else {
        // Leer xlsx con SheetJS
        const XLSX = window.XLSX;
        if (!XLSX) { excelFileStatus('SheetJS no cargado. Usa el formato CSV o pega los datos.','err'); return; }
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, {type:'array'});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
        const inicio = rows[0] && rows[0][0] && rows[0][0].toString().toLowerCase().includes('nombre') ? 1 : 0;
        excelProductos = rows.slice(inicio).filter(r=>r[0]).map((r,i) => ({
          id: Date.now()+i,
          name: String(r[0]||'').trim(),
          desc: String(r[1]||'').trim(),
          price: parseInt(String(r[2]||'0').replace(/\D/g,''))||0,
          oldPrice: null,
          cat: String(r[3]||'Cabello').trim(),
          img: String(r[4]||'').trim()||null,
          emoji:'🧴', badge:null, stars:'★★★★★'
        })).filter(p=>p.name);
      }
      if (!excelProductos.length) { excelFileStatus('No se encontraron productos en el archivo.','err'); return; }
      g('excel-prod-count').textContent = `${excelProductos.length} productos encontrados`;
      g('excel-prod-list').innerHTML = excelProductos.map((p,i) => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border);background:${i%2===0?'#fff':'#fdf5f6'}">
          <span style="font-size:11px;color:var(--gray);width:20px;text-align:center">${i+1}</span>
          ${p.img?`<img src="${p.img}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;flex-shrink:0" onerror="this.style.display='none'">`:'<span style="font-size:20px">🧴</span>'}
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
            <div style="font-size:11px;color:var(--gray)">${p.cat} · ${fmt(p.price)}</div>
          </div>
        </div>`).join('');
      g('excel-preview').style.display = 'block';
      excelFileStatus(`✓ ${excelProductos.length} productos listos para subir.`,'ok');
    } catch(e) {
      excelFileStatus('Error al leer el archivo: '+e.message,'err');
    }
  };
  if (file.name.endsWith('.csv')) reader.readAsArrayBuffer(file);
  else reader.readAsArrayBuffer(file);
}

async function subirDesdeExcel() {
  if (!excelProductos.length) return;
  const btn = g('btn-subir-excel');
  btn.disabled = true; btn.textContent = 'Subiendo...';
  excelFileStatus(`Subiendo ${excelProductos.length} productos...`,'info');
  let ok = 0;
  for (const prod of excelProductos) {
    try {
      await guardarProductoFirebase(prod);
      products.push(prod);
      enviarACatalogoSheet(prod);
      ok++;
    } catch(e) { console.error(e); }
  }
  renderStoreGrid(currentCat); renderAdminTable(); updateDash();
  btn.disabled = false; btn.textContent = '⬆️ Subir todos a la tienda';
  if (ok > 0) {
    excelFileStatus(`✓ ${ok} productos subidos a la tienda y al Sheet.`,'ok');
    showToast(`✓ ${ok} productos importados`,'success');
    g('excel-preview').style.display = 'none';
    g('excel-filename').textContent = '';
    g('excel-file').value = '';
    excelProductos = [];
  } else {
    excelFileStatus('No se pudieron subir. Verifica tu conexión.','err');
  }
}

// Cargar SheetJS para leer Excel
(function() {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  document.head.appendChild(s);
})();

// ══ EXTRACTOR POR PRODUCTO INDIVIDUAL ══
let singleFotoBase64 = null;

function singleStatus(msg, tipo){
  const el=g('single-status');
  el.style.display='block';el.textContent=msg;
  el.style.background=tipo==='ok'?'#eafbf0':tipo==='err'?'#fff0f0':'#eef3fe';
  el.style.color=tipo==='ok'?'#276749':tipo==='err'?'#e53e3e':'#2b6cb0';
}

function cambiarFotoSingle(url){
  singleFotoBase64=null;
  const img=g('single-img-preview');
  const emoji=g('single-emoji');
  if(url){
    img.src=url;
    img.style.display='block';
    emoji.style.display='none';
  } else {
    img.style.display='none';
    emoji.style.display='flex';
  }
}

function subirFotoSingle(input){
  const file=input.files[0];if(!file)return;
  comprimirImagen(file).then(b64=>{
    if(!b64){showToast('No se pudo procesar la imagen','error');return}
    singleFotoBase64=b64;
    g('single-foto-url').value='';
    g('single-img-preview').src=b64;
    g('single-img-preview').style.display='block';
    g('single-emoji').style.display='none';
  });
}

async function extraerProductoSingle(){
  const url=g('single-url').value.trim();
  if(!url.startsWith('http')){singleStatus('Ingresa un link válido','err');return}
  const btn=g('btn-single-extract');
  btn.disabled=true;btn.textContent='Analizando...';
  singleStatus('Analizando con IA...','info');
  g('single-preview').style.display='none';
  singleFotoBase64=null;
  try{
    const res=await fetch('/api/generar-descripcion',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({nombre:'producto del link: '+url,categoria:'Cabello',modo:'url',url})
    });
    const data=await res.json();
    if(data.error)throw new Error(data.error);
    g('single-nom').value=data.nombre||'';
    g('single-desc').value=data.descripcion||'';
    g('single-precio').value='';
    // Intentar cargar foto desde el link
    const fotoUrl=data.foto||'';
    g('single-foto-url').value=fotoUrl;
    if(fotoUrl){
      g('single-img-preview').src=fotoUrl;
      g('single-img-preview').style.display='block';
      g('single-emoji').style.display='none';
    } else {
      g('single-img-preview').style.display='none';
      g('single-emoji').style.display='flex';
    }
    g('single-preview').style.display='block';
    singleStatus('Info extraída. Revisa y ajusta antes de subir.','ok');
  }catch(e){
    singleStatus('Error al analizar. Verifica el link.','err');
  }
  btn.disabled=false;btn.textContent='🤖 Extraer';
}

async function subirProductoSingle(){
  const name=g('single-nom').value.trim();
  const price=parseInt(g('single-precio').value)||0;
  if(!name){showToast('El nombre no puede estar vacío','error');return}
  if(!price){showToast('Ingresa el precio','error');return}
  const btn=g('btn-single-subir');
  btn.disabled=true;btn.textContent='Subiendo...';
  const fotoUrl=g('single-foto-url').value.trim();
  const img=singleFotoBase64||fotoUrl||null;
  const prod={
    id:Date.now(),name,
    desc:g('single-desc').value.trim(),
    price,oldPrice:null,
    cat:g('single-cat').value,
    brand:g('single-brand')?.value.trim()||null,
    subcat:g('single-subcat')?.value||null,
    stock:'disponible',
    img,emoji:'🧴',badge:null,stars:'★★★★★',colors:null
  };
  try{
    await guardarProductoFirebase(prod);
    products.push(prod);
    enviarACatalogoSheet(prod);
    renderStoreGrid(currentCat);renderAdminTable();updateDash();
    updateBrandFilters();updateSubcatFilters();
    showToast('✓ Producto subido a la tienda','success');
    singleStatus('✓ Producto subido correctamente.','ok');
    g('single-preview').style.display='none';
    g('single-url').value='';
    singleFotoBase64=null;
  }catch(e){
    showToast('Error al subir producto','error');
  }
  btn.disabled=false;btn.textContent='⬆️ Subir producto a la tienda';
}

// ══ PEGAR DESDE EXCEL ══
async function procesarExcel(){
  const texto = g('excel-paste').value.trim();
  if(!texto){impStatus2('Pega los datos del Excel primero','err');return}
  const lineas = texto.split('\n').filter(l=>l.trim());
  if(!lineas.length){impStatus2('No se detectaron filas','err');return}
  const prods = [];
  for(const linea of lineas){
    const cols = linea.split('\t');
    if(cols.length < 2) continue;
    const prod = {
      id: Date.now() + Math.random()*1000|0,
      name: (cols[0]||'').trim(),
      desc: (cols[1]||'').trim(),
      price: parseInt((cols[2]||'0').replace(/\D/g,''))||0,
      oldPrice: null,
      cat: (cols[3]||'Cabello').trim(),
      img: (cols[4]||'').trim()||null,
      emoji:'🧴', badge:null, stars:'★★★★★', sel:true
    };
    if(prod.name) prods.push(prod);
  }
  if(!prods.length){impStatus2('No se pudieron leer los productos. Verifica el formato.','err');return}
  impStatus2(`Subiendo ${prods.length} productos...`,'info');
  let ok=0;
  for(const prod of prods){
    try{
      await guardarProductoFirebase(prod);
      products.push(prod);
      enviarACatalogoSheet(prod);
      ok++;
    }catch(e){console.error(e)}
  }
  renderStoreGrid(currentCat);renderAdminTable();updateDash();
  if(ok>0){
    impStatus2(`✓ ${ok} productos subidos a tu tienda y al Sheet.`,'ok');
    g('excel-paste').value='';
    showToast(`✓ ${ok} productos importados`,'success');
  }else{
    impStatus2('No se pudieron subir. Verifica tu conexión.','err');
  }
}

function impStatus2(msg,tipo){
  const el=g('excel-status');el.style.display='block';el.textContent=msg;
  el.style.background=tipo==='ok'?'#eafbf0':tipo==='err'?'#fff0f0':'#eef3fe';
  el.style.color=tipo==='ok'?'#276749':tipo==='err'?'#e53e3e':'#2b6cb0';
}

// ══ IMPORTAR PRODUCTOS ══
let impProductos=[];
function impStatus(msg,tipo){
  const el=g('imp-status');el.style.display='block';el.textContent=msg;
  el.style.background=tipo==='ok'?'#eafbf0':tipo==='err'?'#fff0f0':'#eef3fe';
  el.style.color=tipo==='ok'?'#276749':tipo==='err'?'#e53e3e':'#2b6cb0';
}
async function importarDesdeUrl(){
  const url=g('imp-url').value.trim();
  if(!url||!url.startsWith('http')){impStatus('Ingresa un link válido','err');return}
  const cat=g('imp-cat').value,margen=parseFloat(g('imp-margen').value)||40;
  impStatus('Analizando la página con IA...','info');
  g('imp-container').style.display='none';
  try{
    const res=await fetch('/api/extraer-productos',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({url,categoria:cat})
    });
    const data=await res.json();
    if(!data.ok)throw new Error(data.error||'Error desconocido');
    const factor=1+(margen/100);
    impProductos=data.productos.map((p,i)=>({
      id:Date.now()+i,name:p.nombre||'Producto',desc:p.descripcion||'',
      price:Math.round((p.precio_proveedor||50000)*factor),oldPrice:null,
      cat,emoji:p.emoji||'✨',badge:null,stars:'★★★★★',img:null,sel:true
    }));
    impRender();
    impStatus(`${impProductos.length} productos encontrados. Revisa y ajusta antes de subir.`,'ok');
  }catch(e){impStatus('Error al analizar. Verifica la URL e intenta de nuevo.','err')}
}
function impRender(){
  g('imp-count').textContent=`${impProductos.length} productos encontrados`;
  g('imp-list').innerHTML=impProductos.map((p,i)=>`
    <div style="background:#fff;border:1px solid var(--border);padding:14px 16px;display:flex;gap:12px;align-items:flex-start">
      <input type="checkbox" ${p.sel?'checked':''} onchange="impProductos[${i}].sel=this.checked" style="margin-top:3px;width:16px;height:16px;flex-shrink:0;cursor:pointer">
      <div style="font-size:26px;flex-shrink:0">${p.emoji}</div>
      <div style="flex:1;min-width:0">
        <input value="${p.name.replace(/"/g,'&quot;')}" onchange="impProductos[${i}].name=this.value" style="width:100%;font-size:14px;font-weight:500;margin-bottom:6px;border:1px solid var(--border);padding:6px 10px;font-family:var(--sans);outline:none">
        <textarea onchange="impProductos[${i}].desc=this.value" rows="2" style="width:100%;font-size:12px;resize:none;border:1px solid var(--border);padding:6px 10px;font-family:var(--sans);outline:none;line-height:1.5;color:var(--gray)">${p.desc}</textarea>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;min-width:120px">
        <span style="font-size:11px;color:var(--gray)">Precio venta (COP)</span>
        <input type="number" value="${p.price}" onchange="impProductos[${i}].price=parseInt(this.value)||0" style="width:120px;font-size:13px;font-weight:600;text-align:right;border:1px solid var(--border);padding:6px 10px;font-family:var(--sans);outline:none">
        <select onchange="impProductos[${i}].cat=this.value" style="font-size:11px;border:1px solid var(--border);padding:5px;font-family:var(--sans);outline:none">
          ${['Cabello','Skincare','Maquillaje','Corporal'].map(c=>`<option ${p.cat===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
    </div>`).join('');
  g('imp-container').style.display='block';
}
function impSelAll(v){impProductos.forEach(p=>p.sel=v);impRender()}
async function impSubir(){
  const sel=impProductos.filter(p=>p.sel);
  if(!sel.length){impStatus('Selecciona al menos un producto','err');return}
  impStatus(`Subiendo ${sel.length} productos...`,'info');
  const btn=g('imp-btn-subir');btn.disabled=true;btn.textContent='Subiendo...';
  let subidos=0;
  for(const prod of sel){
    try{await guardarProductoFirebase(prod);products.push(prod);enviarACatalogoSheet(prod);subidos++}
    catch(e){console.error(e)}
  }
  renderStoreGrid(currentCat);renderAdminTable();updateDash();
  btn.disabled=false;btn.textContent='Subir seleccionados';
  if(subidos>0){
    impStatus(`✓ ${subidos} productos subidos a tu tienda.`,'ok');
    showToast(`✓ ${subidos} productos importados`,'success');
  }else{
    impStatus('No se pudieron subir los productos.','err');
  }
}

let pedidosCache = [];

async function cargarPedidos(){
  try{
    const snap=await fdb.collection('pedidos').orderBy('fecha','desc').get();
    pedidosCache=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderPedidos();
  }catch(e){g('orders-count').textContent='Error al cargar';console.error(e)}
}

function renderPedidos(){
  g('orders-count').textContent=`${pedidosCache.length} pedidos`;
  g('orders-table').innerHTML=pedidosCache.length?pedidosCache.map(p=>`
    <tr id="order-row-${p.id}">
      <td colspan="8" style="padding:0;border:none">
        <div style="background:#fff;border:1px solid var(--border);border-radius:8px;margin-bottom:12px;overflow:hidden">
          <!-- Cabecera -->
          <div style="background:#faf8f7;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;border-bottom:1px solid var(--border)">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <span style="font-size:12px;color:var(--gray)">📅 ${p.fecha?new Date(p.fecha).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'-'}</span>
              <span style="font-weight:700;font-size:15px;color:var(--primary)">${p.total||'-'}</span>
              ${(()=>{const m=p.metodoPago||'Contraentrega';const c=m==='Mercado Pago'?'#009ee3':m==='Addi'?'#16b364':'#8a3a50';const ic=m==='Mercado Pago'?'💳':m==='Addi'?'🟢':'💵';return `<span style="font-size:11px;font-weight:600;background:${c};color:#fff;padding:3px 10px;border-radius:12px">${ic} ${m}</span>`;})()}
              ${(()=>{const e=p.estado||'';if(/PAGADO/i.test(e))return '<span style="font-size:11px;font-weight:600;background:#eafbf0;color:#276749;padding:3px 10px;border-radius:12px;border:1px solid #bfe9cf">✓ Pagado</span>';if(/rechaz/i.test(e))return '<span style="font-size:11px;font-weight:600;background:#fff0f0;color:#c0392b;padding:3px 10px;border-radius:12px;border:1px solid #f3c0c0">✗ Pago rechazado</span>';if(/sin confirmar/i.test(e))return '<span style="font-size:11px;font-weight:600;background:#fff5e0;color:#b7791f;padding:3px 10px;border-radius:12px;border:1px solid #f0d9a0">⏳ Pago sin confirmar</span>';return '';})()}
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <select onchange="cambiarEstadoPedido('${p.id}',this.value)" style="font-size:12px;border:1px solid var(--border);padding:5px 8px;border-radius:4px;font-family:var(--sans);outline:none;background:#fff;cursor:pointer">
                <option value="⏳ Pendiente" ${(p.estado||'⏳ Pendiente')==='⏳ Pendiente'?'selected':''}>⏳ Pendiente</option>
                <option value="📦 Enviado" ${p.estado==='📦 Enviado'?'selected':''}>📦 Enviado</option>
                <option value="✅ Recibido" ${p.estado==='✅ Recibido'?'selected':''}>✅ Recibido</option>
                <option value="❌ Cancelado" ${p.estado==='❌ Cancelado'?'selected':''}>❌ Cancelado</option>
              </select>
              ${p.aceptado?`<span style="font-size:11px;font-weight:600;background:#eafbf0;color:#276749;padding:6px 11px;border-radius:12px;border:1px solid #bfe9cf">✓ Aceptado</span>`:`<button class="act-btn" onclick="aceptarPedido('${p.id}')" style="padding:5px 12px;background:var(--primary);color:#fff;border:none;font-weight:600" title="Aceptar y avisar al cliente">✅ Aceptar</button>`}
              <button class="act-btn" onclick="enviarPedidoAMiWhatsApp('${p.id}')" style="padding:5px 10px;background:#25D366;color:#fff;border:none" title="Enviármelo a mi WhatsApp">📲</button>
              <button class="act-btn danger" onclick="eliminarPedido('${p.id}')" style="padding:5px 10px">🗑️</button>
            </div>
          </div>
          <!-- Info cliente -->
          <div style="padding:14px 16px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
            <div>
              <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--gray);margin-bottom:3px">Cliente</div>
              <div style="font-weight:600;font-size:14px">${p.nombre||'-'}</div>
            </div>
            <div>
              <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--gray);margin-bottom:3px">Teléfono</div>
              <div style="font-size:13px"><a href="https://wa.me/57${(p.telefono||'').replace(/\D/g,'')}" target="_blank" style="color:var(--primary);text-decoration:none">📱 ${p.telefono||'-'}</a></div>
            </div>
            <div>
              <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--gray);margin-bottom:3px">Correo</div>
              <div style="font-size:13px">${p.email?`<a href="mailto:${p.email}" style="color:var(--primary);text-decoration:none">✉️ ${p.email}</a>`:'<span style="color:var(--gray)">No dejó correo</span>'}</div>
            </div>
            <div>
              <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--gray);margin-bottom:3px">Dirección</div>
              <div style="font-size:13px;color:var(--gray)">${p.direccion||'-'}</div>
            </div>
          </div>
          <!-- Productos -->
          <div style="padding:10px 16px 14px;border-top:1px solid var(--border)">
            <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--gray);margin-bottom:6px">Productos</div>
            <div style="font-size:13px;line-height:1.6;color:var(--black)">${(p.productos||'-').split('|').map(pr=>`<div>• ${pr.trim()}</div>`).join('')}</div>
          </div>
        </div>
      </td>
    </tr>`).join(''):'<tr><td colspan="8" style="text-align:center;color:var(--gray);padding:40px">No hay pedidos aún</td></tr>';
}

// Aceptar pedido: recién aquí se envía el correo de confirmación al cliente
async function aceptarPedido(id){
  const p=pedidosCache.find(x=>x.id===id);if(!p)return;
  if(!confirm('¿Aceptar este pedido?'+(p.email?' Se enviará el correo de confirmación al cliente.':' (El cliente no dejó correo.)')))return;
  try{
    if(p.email){
      // El "valor a pagar" solo se envía en pedidos contra entrega (los de Mercado Pago / Addi ya pagaron en línea)
      const esContra=!(p.metodoPago&&/mercado|addi/i.test(p.metodoPago));
      const mensaje=esContra
        ?'¡Tu pedido fue confirmado! Lo estamos preparando. El pago es contra entrega. 🌸'
        :'¡Tu pedido y tu pago fueron confirmados! Lo estamos preparando y pronto te avisaremos cuando sea enviado. 🌸';
      enviarCorreoEstado(p.email,p.nombre,'✅ Recibido',mensaje,p.productos,esContra?p.total:'');
    }
    await fdb.collection('pedidos').doc(id).update({aceptado:true});
    p.aceptado=true;
    renderPedidos();
    showToast(p.email?'Pedido aceptado y cliente notificado ✓':'Pedido aceptado ✓','success');
  }catch(e){showToast('Error: '+e.message,'error');}
}
async function cambiarEstadoPedido(id, estado){
  try{
    await fdb.collection('pedidos').doc(id).update({estado});
    const p=pedidosCache.find(x=>x.id===id);
    if(p) p.estado=estado;
    // Avisar al cliente por correo si tiene email
    if(p&&p.email){
      const mensajes={
        '⏳ Pendiente':'Tu pedido está pendiente de confirmación.',
        '📦 Enviado':'¡Buenas noticias! Tu pedido ya fue enviado y va en camino. 🚚',
        '✅ Recibido':'Tu pedido fue entregado. ¡Esperamos que lo disfrutes! Gracias por confiar en nosotros. 💕',
        '❌ Cancelado':'Tu pedido fue cancelado. Si tienes dudas, escríbenos por WhatsApp.'
      };
      enviarCorreoEstado(p.email,p.nombre,estado,mensajes[estado]||'');
    }
    showToast('Estado actualizado ✓','success');
  }catch(e){showToast('Error al actualizar','error')}
}

function enviarPedidoAMiWhatsApp(id){
  const p=pedidosCache.find(x=>x.id===id);
  if(!p){showToast('Pedido no encontrado','error');return}
  const productos=(p.productos||'').split('|').map(pr=>'• '+pr.trim()).join('\n');
  // Medio de pago (claro)
  const medio = p.metodoPago==='Mercado Pago' ? '💳 Mercado Pago (pago en línea)'
    : p.metodoPago==='Addi' ? '🟢 Addi (a cuotas)'
    : '💵 Contra entrega (paga al recibir)';
  const msg=`🛍️ *PEDIDO ARTEMISA BEAUTY*\n\n`+
    `👤 *Cliente:* ${p.nombre||'-'}\n`+
    (p.documento?`🪪 *Documento:* ${p.documento}\n`:'')+
    `📱 *Teléfono:* ${p.telefono||'-'}\n`+
    `✉️ *Correo:* ${p.email||'No dejó'}\n`+
    `📍 *Dirección:* ${p.direccion||'-'}\n\n`+
    `*Productos:*\n${productos}\n\n`+
    `🚚 *Envío:* ${p.envio||'-'}\n`+
    `💰 *Total (con envío):* ${p.total||'-'}\n`+
    `💳 *Medio de pago:* ${medio}\n`+
    `📌 *Estado:* ${p.estado||'⏳ Pendiente'}\n`+
    `📅 ${p.fecha?new Date(p.fecha).toLocaleString('es-CO'):''}`;
  const url=`https://wa.me/573107809662?text=${encodeURIComponent(msg)}`;
  window.open(url,'_blank');
}

async function eliminarPedido(id){
  if(!confirm('¿Eliminar este pedido?'))return;
  try{
    await fdb.collection('pedidos').doc(id).delete();
    pedidosCache=pedidosCache.filter(p=>p.id!==id);
    renderPedidos();
    showToast('Pedido eliminado','error');
  }catch(e){showToast('Error al eliminar','error')}
}

async function exportarPedidosExcel(){
  if(!pedidosCache.length){showToast('No hay pedidos para exportar','error');return}
  // Exportar como CSV compatible con Excel
  let csv='Fecha,Cliente,Teléfono,Dirección,Productos,Total,Estado\n';
  pedidosCache.forEach(p=>{
    const fecha=p.fecha?new Date(p.fecha).toLocaleDateString('es-CO'):'-';
    csv+=`"${fecha}","${p.nombre||''}","${p.telefono||''}","${p.direccion||''}","${(p.productos||'').replace(/"/g,"'")}","${p.total||''}","${p.estado||'⏳ Pendiente'}"\n`;
  });
  const bom='\uFEFF';
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(bom+csv);
  a.download='pedidos-artemisa.csv';
  a.click();
  showToast('Excel exportado ✓','success');
}

// ══ SUSCRIPTORES ══
async function cargarSuscriptores(){
  try{
    const snap=await fdb.collection('suscriptores').orderBy('fecha','desc').get();
    const subs=snap.docs.map(d=>({id:d.id,...d.data()}));
    g('sub-count').textContent=`${subs.length} suscriptores`;
    g('sub-table').innerHTML=subs.length?subs.map((s,i)=>`
      <tr>
        <td style="color:var(--gray);font-size:12px">${i+1}</td>
        <td style="font-weight:500">${s.email}</td>
        <td style="color:var(--gray);font-size:12px">${s.fecha?new Date(s.fecha).toLocaleDateString('es-CO'):'-'}</td>
        <td><button class="act-btn danger" onclick="borrarSuscriptor('${s.id}','${(s.email||'').replace(/'/g,"")}')" title="Borrar">🗑️</button></td>
      </tr>`).join(''):'<tr><td colspan="4" style="text-align:center;color:var(--gray);padding:20px">No hay suscriptores aún</td></tr>';
  }catch(e){g('sub-count').textContent='Error al cargar';console.error(e)}
}
async function borrarSuscriptor(id,email){
  if(!confirm('¿Borrar el correo '+(email||'')+' de la lista?'))return;
  try{ await fdb.collection('suscriptores').doc(id).delete(); showToast('Correo eliminado','error'); cargarSuscriptores(); }
  catch(e){ showToast('No se pudo borrar','error'); console.error(e); }
}
// Envía un correo (asunto + mensaje) a TODOS los suscriptores.
async function enviarCorreoMasivo(){
  const asunto=(g('nl-asunto')?.value||'').trim();
  const mensaje=(g('nl-mensaje')?.value||'').trim();
  if(!asunto||!mensaje){showToast('Escribe el asunto y el mensaje','error');return;}
  if(!window.emailjs){showToast('EmailJS no está disponible','error');return;}
  if(!EMAILJS_CONFIG.templateNewsletter){
    showToast('Falta configurar la plantilla de newsletter (ver instrucciones)','error');
    return;
  }
  const btn=g('nl-btn');
  const estado=g('nl-estado');
  btn.disabled=true;
  try{
    const snap=await fdb.collection('suscriptores').get();
    // Lista única de correos válidos
    const correos=[...new Set(snap.docs.map(d=>(d.data().email||'').trim()).filter(e=>e&&e.indexOf('@')>0))];
    if(!correos.length){showToast('No hay correos para enviar','error');btn.disabled=false;return;}
    if(!confirm('Vas a enviar este correo a '+correos.length+' suscriptores. ¿Continuar?')){btn.disabled=false;return;}
    let ok=0, fail=0;
    for(let i=0;i<correos.length;i++){
      if(estado)estado.textContent=`Enviando ${i+1} de ${correos.length}…`;
      try{
        await emailjs.send(EMAILJS_CONFIG.serviceId,EMAILJS_CONFIG.templateNewsletter,{
          email:correos[i], asunto, mensaje, cliente:'Hola'
        });
        ok++;
      }catch(e){ fail++; console.error('Newsletter a '+correos[i]+':',e); }
      await new Promise(r=>setTimeout(r,350)); // pausa para no saturar EmailJS
    }
    if(estado)estado.textContent='';
    showToast('✓ Enviados: '+ok+(fail?(' · Fallidos: '+fail):''),'success');
  }catch(e){ showToast('Error al enviar','error'); console.error(e); }
  btn.disabled=false;
}

function exportarSuscriptores(){
  const rows=g('sub-table').querySelectorAll('tr');
  let csv='Correo,Fecha\n';
  rows.forEach(r=>{
    const cols=r.querySelectorAll('td');
    if(cols.length>=2) csv+=`${cols[1].textContent},${cols[2].textContent}\n`;
  });
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
  a.download='suscriptores-artemisa.csv';
  a.click();
}

// ══ RESEÑAS ══
let reviews=[
  {id:1,name:'Valentina M.',city:'Bogotá',stars:'★★★★★',emoji:'💄',text:'Llevo tres meses usando el sérum vitamina C y mi piel se ve completamente diferente. ¡Lo recomiendo a todas!'},
  {id:2,name:'Sofía R.',city:'Medellín',stars:'★★★★★',emoji:'🌸',text:'Excelente atención y los productos llegaron súper bien empacados. La mascarilla hidratante es mi favorita del momento.'},
  {id:3,name:'Camila T.',city:'Cali',stars:'★★★★★',emoji:'✨',text:'Artemisa Beauty se convirtió en mi tienda de confianza. Productos de calidad premium a precios justos. 100% recomendada.'},
];
let selReviewEmoji='💄';

function renderReviews(){
  if(g('reviews-grid'))g('reviews-grid').innerHTML=reviews.map(r=>`
    <div class="review-card">
      <div class="review-quote">"</div>
      <div class="review-stars">${escHtml(r.stars)}</div>
      <p class="review-text">${escHtml(r.text)}</p>
      <div class="review-author">
        <div class="review-avatar">${escHtml(r.emoji)}</div>
        <div><div class="review-name">${escHtml(r.name)}</div><div class="review-city">${escHtml(r.city)}</div></div>
      </div>
    </div>`).join('');
  if(g('reviews-admin-list')){
    g('reviews-admin-list').innerHTML=`<table>
      <thead><tr><th>Cliente</th><th>Ciudad</th><th>Estrellas</th><th>Reseña</th><th>Acciones</th></tr></thead>
      <tbody>${reviews.map(r=>`
        <tr>
          <td><strong>${r.emoji} ${r.name}</strong></td>
          <td style="color:var(--gray);font-size:12px">${r.city}</td>
          <td style="color:var(--gold)">${r.stars}</td>
          <td style="font-size:12px;color:var(--gray);max-width:200px">${r.text.substring(0,60)}...</td>
          <td><button class="act-btn danger" onclick="delReview(${r.id})">🗑️</button></td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  }
}

function openReviewModal(){
  selReviewEmoji='💄';
  const emojis=['💄','🌸','✨','💅','🧴','🌺','🫧','🩷','💋','🧖'];
  g('rv-emoji-grid').innerHTML=emojis.map(e=>`<div class="emoji-opt${e===selReviewEmoji?' sel':''}" style="cursor:pointer;padding:6px;border:2px solid transparent;border-radius:4px;font-size:22px" onclick="selReviewEmoji='${e}';document.querySelectorAll('#rv-emoji-grid .emoji-opt').forEach(x=>x.style.borderColor='transparent');this.style.borderColor='var(--black)'">${e}</div>`).join('');
  ['rv-name','rv-city','rv-text'].forEach(id=>g(id).value='');
  g('review-overlay').classList.add('open');
}
function closeReviewModal(){g('review-overlay').classList.remove('open')}
async function saveReview(){
  const name=g('rv-name').value.trim(),text=g('rv-text').value.trim();
  if(!name||!text){showToast('Completa nombre y reseña','error');return}
  const r={id:Date.now(),name,city:g('rv-city').value.trim()||'Colombia',stars:g('rv-stars').value,emoji:selReviewEmoji,text};
  reviews.push(r);
  renderReviews();
  try{await fdb.collection('config').doc('reviews').set({list:reviews});showToast('Reseña guardada ✓','success')}
  catch(e){showToast('Reseña agregada (sin guardar en nube)','error')}
  closeReviewModal();
}
function delReview(id){
  if(!confirm('¿Eliminar esta reseña?'))return;
  reviews=reviews.filter(r=>r.id!==id);
  renderReviews();
  fdb.collection('config').doc('reviews').set({list:reviews});
  showToast('Reseña eliminada','error');
}
async function cargarReviewsFirebase(){
  try{
    const doc=await fdb.collection('config').doc('reviews').get();
    if(doc.exists&&doc.data().list?.length){reviews=doc.data().list;renderReviews()}
  }catch(e){console.error('Error reseñas:',e)}
}

// ══ CHATBOT LUNA ══
const CHAT_LIMIT = 12;
let chatHistorial = [];
let chatAbierto = false;

function getChatUso(){
  const hoy = new Date().toDateString();
  const data = JSON.parse(localStorage.getItem('luna_uso')||'{}');
  if(data.fecha !== hoy) return 0;
  return data.count || 0;
}
function incrementarChatUso(){
  const hoy = new Date().toDateString();
  const count = getChatUso() + 1;
  localStorage.setItem('luna_uso', JSON.stringify({fecha:hoy, count}));
  return count;
}

function toggleChat(){
  chatAbierto = !chatAbierto;
  const win = g('chat-window');
  win.style.display = chatAbierto ? 'flex' : 'none';
  win.style.flexDirection = 'column';
  if(chatAbierto){
    const uso = getChatUso();
    if(uso >= CHAT_LIMIT){
      g('chat-limit-msg').style.display = 'block';
      g('chat-input-area').style.display = 'none';
    }
    g('chat-input').focus();
    scrollChatBottom();
  }
}

function scrollChatBottom(){
  const msgs = g('chat-messages');
  setTimeout(()=>msgs.scrollTop=msgs.scrollHeight, 100);
}

function agregarMensaje(texto, tipo){
  const msgs = g('chat-messages');
  const div = document.createElement('div');
  div.style.cssText = tipo === 'user'
    ? 'background:var(--primary);color:#fff;padding:10px 14px;border-radius:12px 12px 4px 12px;font-size:13px;line-height:1.5;max-width:85%;align-self:flex-end'
    : 'background:var(--primary-light);padding:10px 14px;border-radius:12px 12px 12px 4px;font-size:13px;line-height:1.5;max-width:85%';
  if(tipo === 'user'){
    div.textContent = texto;
  }else{
    // Formatear negritas **texto** y saltos de línea de forma segura
    const escapado = texto
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const conFormato = escapado
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/\n/g,'<br>');
    div.innerHTML = conFormato;
  }
  msgs.appendChild(div);
  scrollChatBottom();
}

function agregarTyping(){
  const msgs = g('chat-messages');
  const div = document.createElement('div');
  div.id = 'typing-indicator';
  div.style.cssText = 'background:var(--primary-light);padding:10px 14px;border-radius:12px 12px 12px 4px;font-size:13px;color:var(--gray)';
  div.textContent = 'Luna está escribiendo...';
  msgs.appendChild(div);
  scrollChatBottom();
}

async function enviarMensaje(){
  const input = g('chat-input');
  const texto = input.value.trim();
  if(!texto) return;

  const uso = getChatUso();
  if(uso >= CHAT_LIMIT){
    g('chat-limit-msg').style.display = 'block';
    g('chat-input-area').style.display = 'none';
    return;
  }

  input.value = '';
  agregarMensaje(texto, 'user');
  chatHistorial.push({role:'user', content:texto});
  agregarTyping();

  const nuevaUso = incrementarChatUso();
  if(nuevaUso >= CHAT_LIMIT){
    g('chat-limit-msg').style.display = 'block';
    g('chat-input-area').style.display = 'none';
  }

  try{
    const prodInfo = products.slice(0,40).map(p=>{
      const estado = estaAgotado(p) ? 'AGOTADO' : (p.stock==='preventa' ? 'En preventa' : 'Disponible');
      const precio = p.price ? '$'+p.price.toLocaleString('es-CO') : 'consultar';
      const desc = p.desc ? p.desc.substring(0,120) : '';
      let linea = `- ${p.name} (${p.cat}`;
      if(p.subcat) linea += `, para: ${p.subcat}`;
      linea += `) | Precio: ${precio} | ${estado}`;
      if(desc) linea += ` | ${desc}`;
      return linea;
    }).join('\n');
    const res = await fetch('/api/chatbot',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        mensaje: texto,
        historial: chatHistorial.slice(-6),
        productos: prodInfo
      })
    });
    const data = await res.json();
    const respuesta = data.respuesta || 'Lo siento, intenta de nuevo.';
    const typing = document.getElementById('typing-indicator');
    if(typing) typing.remove();
    agregarMensaje(respuesta, 'bot');
    chatHistorial.push({role:'assistant', content:respuesta});
  }catch(e){
    const typing = document.getElementById('typing-indicator');
    if(typing) typing.remove();
    agregarMensaje('Ups, hubo un error. Intenta de nuevo 🌸', 'bot');
  }
}

// ══ TOAST ══
function showToast(msg,type){const t=g('toast');t.textContent=msg;t.className='toast '+(type||'');t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2800)}

// ══ CARRITO PERSISTENTE + URL PRODUCTO ══
function loadCart(){try{const s=localStorage.getItem('artemisa_cart');if(s){cart=JSON.parse(s);updateCartUI();}}catch(e){}}
// Link para compartir: pasa por /api/p (muestra foto+nombre+precio en la vista previa y redirige a la tienda)
function getProductUrl(id){return window.location.origin+'/api/p?id='+id;}
// Link directo a la tienda abriendo el producto (uso interno)
function getProductUrlTienda(id){return window.location.origin+window.location.pathname+'?producto='+id;}
let _productoAbiertoDeURL=false;
function checkProductUrl(){
  const params=new URLSearchParams(window.location.search);
  const pid=params.get('producto');
  if(!pid||_productoAbiertoDeURL)return;
  let intentos=0;
  const abrir=()=>{
    if(_productoAbiertoDeURL)return;
    intentos++;
    const p=products.find(x=>String(x.id)===String(pid));
    if(p){_productoAbiertoDeURL=true;openProductDetail(p.id);return;}
    if(intentos<60)setTimeout(abrir,300); // reintenta ~18s mientras cargan los productos
  };
  abrir();
}
// Red de seguridad: empieza a intentar abrir el producto apenas carga la página,
// sin depender de cuándo responda Firebase (el reintento espera a que lleguen los productos)
window.addEventListener('load',()=>{setTimeout(checkProductUrl,300);});
async function marcarPedidoPagado(estado){
  try{
    const pid=localStorage.getItem('ab_pedido_pendiente');
    if(pid){
      await fdb.collection('pedidos').doc(pid).update({estado});
      localStorage.removeItem('ab_pedido_pendiente');
    }
  }catch(e){}
}
function checkPagoRetorno(){
  const params=new URLSearchParams(window.location.search);
  const pago=params.get('pago');
  if(pago==='exitoso'){
    cart=[];if(typeof saveCart==='function')saveCart();if(typeof updateCartUI==='function')updateCartUI();
    marcarPedidoPagado('✅ PAGADO (en línea)');
    setTimeout(()=>alert('✅ ¡Pago aprobado! Tu pedido fue confirmado. Revisa tu correo y te contactaremos para coordinar la entrega. 🌸'),600);
    history.replaceState(null,'',window.location.pathname);
  }else if(pago==='fallido'){
    marcarPedidoPagado('❌ Pago rechazado');
    setTimeout(()=>alert('❌ El pago no se pudo completar. Puedes intentar de nuevo o escribirnos por WhatsApp.'),600);
    history.replaceState(null,'',window.location.pathname);
  }else if(pago==='pendiente'){
    setTimeout(()=>alert('⏳ Tu pago está pendiente de confirmación. Te avisaremos cuando se acredite.'),600);
    history.replaceState(null,'',window.location.pathname);
  }
  // Retorno de Addi
  const addi=params.get('pago_addi');
  if(addi!==null){
    const est=(params.get('status')||params.get('transactionStatus')||params.get('applicationStatus')||'').toLowerCase();
    if(est.includes('approved')){
      cart=[];if(typeof saveCart==='function')saveCart();if(typeof updateCartUI==='function')updateCartUI();
      marcarPedidoPagado('✅ PAGADO (Addi)');
      setTimeout(()=>alert('✅ ¡Tu crédito con Addi fue aprobado! Tu pedido quedó confirmado. Te contactaremos para coordinar la entrega. 🌸'),600);
    }else if(est.includes('rejected')||est.includes('declined')||est.includes('abandoned')){
      marcarPedidoPagado('❌ Addi no aprobado');
      setTimeout(()=>alert('No se completó el pago con Addi. Puedes intentar de nuevo o elegir otro método. 🌸'),600);
    }else{
      setTimeout(()=>alert('⏳ Estamos verificando tu solicitud con Addi. Te avisaremos por correo cuando tengamos la respuesta. 🌸'),600);
    }
    history.replaceState(null,'',window.location.pathname);
  }
}
checkPagoRetorno();
function compartirProducto(id){const url=getProductUrl(id);if(navigator.share){const p=products.find(x=>x.id===id);navigator.share({title:p?.name||'Artemisa Beauty',text:'Mira este producto',url});}else{navigator.clipboard.writeText(url).then(()=>showToast('Link copiado ✓','success'));}}

// ══ CATEGORÍAS Y SUBCATEGORÍAS ══
let categorias=['Skincare','Maquillaje','Cabello','Corporal'];
let subcategorias=['Caspa','Cabello graso','Caída del cabello','Cabello seco','Puntas dañadas','Piel seca','Acné','Manchas'];

function renderCategorias(){
  const el=g('cats-list');if(!el)return;
  el.innerHTML=categorias.map((c,i)=>`<div style="display:flex;align-items:center;gap:6px;background:var(--primary-light);padding:6px 12px;border-radius:20px"><span style="font-size:13px;font-weight:500">${c}</span><button onclick="borrarCategoria(${i})" style="background:none;border:none;cursor:pointer;color:var(--primary);font-size:16px;line-height:1;padding:0">×</button></div>`).join('');
  actualizarSelectCats();
}
function renderSubcategorias(){
  const el=g('subcats-list');if(!el)return;
  el.innerHTML=subcategorias.map((c,i)=>`<div style="display:flex;align-items:center;gap:6px;background:#eef3fe;padding:6px 12px;border-radius:20px"><span style="font-size:13px;font-weight:500">${c}</span><button onclick="borrarSubcategoria(${i})" style="background:none;border:none;cursor:pointer;color:#2b6cb0;font-size:16px;line-height:1;padding:0">×</button></div>`).join('');
  actualizarSelectSubcats();
}
function actualizarSelectCats(){
  const sel=g('f-cat');if(sel){const a=sel.value;sel.innerHTML=categorias.map(c=>`<option value="${c}">${c}</option>`).join('');if(a)sel.value=a;}
  const selS=g('single-cat');if(selS){const a=selS.value;selS.innerHTML=categorias.map(c=>`<option value="${c}">${c}</option>`).join('');if(a)selS.value=a;}
  const f=g('cat-filters');if(f){f.innerHTML=`<button class="cat-btn active" onclick="filterCat('Todos',this)">Todos</button>`+categorias.map(c=>`<button class="cat-btn" onclick="filterCat('${c}',this)">${c}</button>`).join('');}
}
function actualizarSelectSubcats(){
  const opts=`<option value="">Sin subcategoría</option>`+subcategorias.map(c=>`<option value="${c}">${c}</option>`).join('');
  const sel=g('f-subcat');if(sel){const a=sel.value;sel.innerHTML=opts;if(a)sel.value=a;}
  const sel2=g('single-subcat');if(sel2){const a=sel2.value;sel2.innerHTML=opts;if(a)sel2.value=a;}
}

function agregarCategoria(){
  const inp=g('new-cat-input'),v=inp.value.trim();
  if(!v){showToast('Escribe el nombre','error');return}
  if(categorias.includes(v)){showToast('Ya existe','error');return}
  categorias.push(v);inp.value='';renderCategorias();showToast('Categoría agregada ✓','success');
}
function borrarCategoria(i){if(!confirm(`¿Eliminar "${categorias[i]}"?`))return;categorias.splice(i,1);renderCategorias();}
function agregarSubcategoria(){
  const inp=g('new-subcat-input'),v=inp.value.trim();
  if(!v){showToast('Escribe el nombre','error');return}
  if(subcategorias.includes(v)){showToast('Ya existe','error');return}
  subcategorias.push(v);inp.value='';renderSubcategorias();showToast('Subcategoría agregada ✓','success');
}
function borrarSubcategoria(i){if(!confirm(`¿Eliminar "${subcategorias[i]}"?`))return;subcategorias.splice(i,1);renderSubcategorias();}
function nuevaSubcatRapida(){
  const v=(prompt('Nombre de la nueva subcategoría (ej: Frizz, Resequedad):')||'').trim();
  if(!v)return;
  if(!subcategorias.includes(v))subcategorias.push(v);
  actualizarSelectSubcats();
  const sel=g('f-subcat');if(sel)sel.value=v;
  guardarCategoriasFirebase();
  showToast('Subcategoría "'+v+'" agregada ✓','success');
}
function nuevaSubcatSingle(){
  const v=(prompt('Nombre de la nueva subcategoría (ej: Frizz, Resequedad):')||'').trim();
  if(!v)return;
  if(!subcategorias.includes(v))subcategorias.push(v);
  actualizarSelectSubcats();
  const sel=g('single-subcat');if(sel)sel.value=v;
  guardarCategoriasFirebase();
  showToast('Subcategoría "'+v+'" agregada ✓','success');
}
async function guardarCategoriasFirebase(){
  try{await fdb.collection('config').doc('categorias').set({categorias,subcategorias});showToast('Guardado ✓','success')}
  catch(e){showToast('Error al guardar','error')}
}
async function cargarCategoriasFirebase(){
  try{
    const doc=await fdb.collection('config').doc('categorias').get();
    if(doc.exists){const d=doc.data();if(d.categorias?.length)categorias=d.categorias;if(d.subcategorias?.length)subcategorias=d.subcategorias;}
    renderCategorias();renderSubcategorias();
  }catch(e){renderCategorias();renderSubcategorias();}
}

// ══ CLASIFICACIÓN IA ══
// Palabras clave por subcategoría (para clasificación rápida sin IA)
const keywordsSubcat={
  'Caspa':['caspa','anticaspa','descamacion','descamación','hongo','malassezia','picazon cuero','picor cuero'],
  'Cabello graso':['graso','grasa','grasosa','seborrea','sebo','oleoso','exceso de grasa','raiz grasa'],
  'Caída del cabello':['caida','caída','anticaida','anticaída','crecimiento','fortalec','biotina','alopecia','debilit','fortificante','densidad'],
  'Cabello seco':['seco','reseco','hidrat','nutritiv','nutricion','nutrición','sequedad','resequedad'],
  'Puntas dañadas':['puntas','danad','dañad','quebradiz','maltrat','reparacion','reparación','reconstruc','keratina','queratina','tratamiento capilar'],
  'Piel seca':['piel seca','hidratante facial','hidratacion','hidratación','resequedad piel','crema hidratante'],
  'Acné':['acne','acné','espinilla','grano','imperfeccion','imperfección','poro','puntos negros','piel grasa facial','salicilico','salicílico'],
  'Manchas':['mancha','despigment','aclarant','aclarad','tono desigual','vitamina c','niacinamida','luminos']
};

function clasificarPorKeywords(p){
  const texto=((p.name||'')+' '+(p.desc||'')).toLowerCase();
  for(const [subcat,palabras] of Object.entries(keywordsSubcat)){
    if(!subcategorias.includes(subcat))continue;
    if(palabras.some(k=>texto.includes(k)))return subcat;
  }
  return null;
}

async function clasificarSubcatsIA(){
  const sin=products.filter(p=>!p.subcat&&(p.desc||p.name));
  if(!sin.length){showToast('Todos ya tienen subcategoría','success');return}
  const btn=g('btn-clasificar-ia');btn.disabled=true;btn.textContent='Clasificando...';
  const st=g('clasificar-status');st.style.display='block';st.style.background='#eef3fe';st.style.color='#2b6cb0';

  // PASO 1: Clasificación rápida por palabras clave (instantánea)
  st.textContent='Paso 1/2: Clasificando por palabras clave...';
  let okKeywords=0;
  const faltantes=[];
  for(const p of sin){
    const match=clasificarPorKeywords(p);
    if(match){p.subcat=match;await guardarProductoFirebase(p);okKeywords++;}
    else faltantes.push(p);
  }
  renderAdminTable();updateSubcatFilters();

  // PASO 2: IA solo para los que no se pudieron clasificar (en lotes)
  let okIA=0;
  if(faltantes.length){
    for(let i=0;i<faltantes.length;i++){
      const p=faltantes[i];
      st.textContent=`Paso 2/2: IA para los difíciles (${i+1}/${faltantes.length})...`;
      try{
        const res=await fetch('/api/generar-descripcion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:`Clasifica en UNA de estas subcategorías: ${subcategorias.join(', ')}. Producto: "${p.name}". Descripción: "${p.desc||''}". Responde SOLO el nombre exacto.`,categoria:p.cat})});
        const data=await res.json();
        const r=(data.descripcion||'').trim();
        const match=subcategorias.find(s=>r.toLowerCase().includes(s.toLowerCase()));
        if(match){p.subcat=match;await guardarProductoFirebase(p);okIA++;renderAdminTable();}
      }catch(e){}
    }
  }

  renderAdminTable();updateSubcatFilters();
  btn.disabled=false;btn.textContent='🤖 Clasificar subcategorías con IA';
  st.style.background='#eafbf0';st.style.color='#276749';
  st.textContent=`✓ Listo: ${okKeywords} por palabras clave + ${okIA} por IA = ${okKeywords+okIA} clasificados. Corrige manualmente en la tabla si algo quedó mal.`;
}

// ══ COMENTARIOS ══
let selectedStar=5;
function selStar(n){selectedStar=n;document.querySelectorAll('#star-selector button').forEach(b=>{const s=parseInt(b.dataset.star);b.style.filter=s<=n?'none':'grayscale(1)';b.style.color=s<=n?'#C9A96E':'';});}
function comStatus(msg,tipo){const el=g('com-status');el.style.display='block';el.textContent=msg;el.style.background=tipo==='ok'?'#eafbf0':'#fff0f0';el.style.color=tipo==='ok'?'#276749':'#e53e3e';}
async function enviarComentario(){
  const nombre=g('com-nombre').value.trim(),texto=g('com-texto').value.trim();
  if(!nombre||!texto){comStatus('Completa nombre y comentario','err');return}
  try{
    await fdb.collection('comentarios').add({nombre,ciudad:g('com-ciudad').value.trim()||'Colombia',texto,estrellas:selectedStar,fecha:new Date().toISOString(),aprobado:false});
    comStatus('✓ ¡Gracias! Tu comentario será publicado pronto.','ok');
    g('com-nombre').value='';g('com-ciudad').value='';g('com-texto').value='';selectedStar=5;selStar(5);
  }catch(e){comStatus('Error al enviar','err')}
}
async function cargarComentarios(){
  try{
    const snap=await fdb.collection('comentarios').where('aprobado','==',true).get();
    const coms=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
    const el=g('comentarios-grid');if(!el)return;
    if(!coms.length){el.innerHTML='<p style="grid-column:1/-1;text-align:center;color:var(--gray);font-size:14px">Sé la primera en comentar 🌸</p>';return}
    el.innerHTML=coms.map(c=>`<div style="background:var(--light);padding:24px;border-radius:8px;border:1px solid var(--border)"><div style="color:#C9A96E;font-size:16px;margin-bottom:10px">${'★'.repeat(c.estrellas||5)}</div><p style="font-size:14px;line-height:1.7;margin-bottom:14px;font-style:italic">"${escHtml(c.texto)}"</p><div style="display:flex;align-items:center;gap:10px"><div style="width:36px;height:36px;border-radius:50%;background:var(--primary-light);display:flex;align-items:center;justify-content:center">🌸</div><div><div style="font-weight:600;font-size:13px">${escHtml(c.nombre)}</div><div style="font-size:11px;color:var(--gray)">${escHtml(c.ciudad)}</div></div></div></div>`).join('');
  }catch(e){console.error(e)}
}
async function cargarComentariosAdmin(){
  try{
    const snap=await fdb.collection('comentarios').get();
    const coms=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
    g('admin-coms-count').textContent=`${coms.length} comentarios`;
    g('admin-coms-table').innerHTML=coms.length?coms.map(c=>{
      const btnAprobar=c.aprobado?'':'<button class="act-btn" onclick="aprobarComentario(\''+c.id+'\')">✓</button>';
      const estado=c.aprobado?'✓ Publicado':'⏳ Pendiente';
      const bg=c.aprobado?'#eafbf0':'#fff5f0';
      const col=c.aprobado?'#276749':'#e67e22';
      return '<tr><td style="font-weight:500">'+escHtml(c.nombre)+'</td><td style="font-size:12px;color:var(--gray)">'+escHtml(c.ciudad)+'</td><td style="color:#C9A96E">'+'★'.repeat(c.estrellas||5)+'</td><td style="font-size:12px;max-width:200px">'+escHtml((c.texto||'').substring(0,60))+'...</td><td><span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:'+bg+';color:'+col+'">'+estado+'</span></td><td style="display:flex;gap:6px">'+btnAprobar+'<button class="act-btn danger" onclick="borrarComentario(\''+c.id+'\')">🗑️</button></td></tr>';
    }).join(''):'<tr><td colspan="6" style="text-align:center;color:var(--gray);padding:20px">No hay comentarios</td></tr>';
  }catch(e){console.error(e)}
}
async function aprobarComentario(id){try{await fdb.collection('comentarios').doc(id).update({aprobado:true});showToast('Publicado ✓','success');cargarComentariosAdmin();cargarComentarios();}catch(e){showToast('Error','error')}}
async function borrarComentario(id){if(!confirm('¿Eliminar?'))return;try{await fdb.collection('comentarios').doc(id).delete();showToast('Eliminado','error');cargarComentariosAdmin();cargarComentarios();}catch(e){showToast('Error','error')}}

// ══ INIT ══
loadCart();
renderStoreGrid('Todos');
renderDestacados();
renderReviews();
cargarProductosFirebase();
cargarContenidoFirebase();
cargarColoresFirebase();
cargarReviewsFirebase();
cargarEnviosFirebase();
cargarCategoriasFirebase();
cargarComentarios();
activarLivePreview();
activarReveal();