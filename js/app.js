document.getElementById('current-date').textContent = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' });

// Configuración de Firebase Cloud Messaging (FCM)
const firebaseConfig = {
  apiKey: "AIzaSyCAOhYLqz9tNgvmjM9fPFatVGMqJG7WJTo",
  authDomain: "reporte-productivo.firebaseapp.com",
  projectId: "reporte-productivo",
  storageBucket: "reporte-productivo.firebasestorage.app",
  messagingSenderId: "392604605928",
  appId: "1:392604605928:web:896d5b169e26dde057185d"
};

const VAPID_KEY = "BEQYJRZdmj362yJI4o4fi9pGvJMgloS5Qem10cygT8olRLhhDfHGK-0ZAwywaDaCgsadsjhPNPOF4H9dZgqt9_M";

let messaging = null;

function initFirebaseMessaging() {
  try {
    if (firebase.apps.length === 0) {
      firebase.initializeApp(firebaseConfig);
    }
    messaging = firebase.messaging();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./firebase-messaging-sw.js')
        .then((reg) => {
          console.log('Service Worker registrado:', reg);
          messaging.useServiceWorker(reg);
          checkNotificationPermissionState();
        })
        .catch((err) => console.error('Error registrando Service Worker:', err));
    }

    messaging.onMessage((payload) => {
      console.log('Notificación recibida en primer plano:', payload);
      const title = payload.notification?.title || payload.data?.title || '📌 Actualización de Producción';
      const body = payload.notification?.body || payload.data?.body || 'Se ha realizado un nuevo cambio.';
      
      if (Notification.permission === 'granted') {
        new Notification(title, {
          body,
          icon: 'https://cdn-icons-png.flaticon.com/512/2558/2558944.png',
          data: payload.data
        });
      }
    });

  } catch (err) {
    console.warn('Firebase Messaging no soportado o deshabilitado:', err);
  }
}

function checkNotificationPermissionState() {
  const btn = document.getElementById('btn-notify');
  const label = document.getElementById('notify-label');
  if (!btn || !label) return;

  if (Notification.permission === 'granted') {
    btn.classList.add('active');
    label.textContent = 'Notificaciones 🔔';
  } else if (Notification.permission === 'denied') {
    btn.classList.remove('active');
    label.textContent = 'Bloqueadas 🔕';
  } else {
    btn.classList.remove('active');
    label.textContent = 'Activar Alertas 🔔';
  }
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('Tu navegador no soporta notificaciones emergentes.');
    return;
  }

  if (Notification.permission === 'granted') {
    alert('Las notificaciones ya están activadas en este dispositivo.');
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await messaging.getToken({ vapidKey: VAPID_KEY });
      console.log('FCM Token obtenido:', token);
      alert('✅ ¡Notificaciones activadas exitosamente!');
    } else {
      alert('⚠️ Permiso de notificaciones denegado.');
    }
    checkNotificationPermissionState();
  } catch (err) {
    console.error('Error al solicitar permiso:', err);
  }
}

// Forzar que el buscador inicie completamente vacío
const buscadorInicial = document.getElementById('search-input');
if (buscadorInicial) {
  buscadorInicial.value = '';
}

// Variables Globales
let currentNaveId=null, currentImgNaveId=null, editingItemId=null, exportType=null;
let newModels=[], newNaveSelected='', newTipo='ambos', newCat='error';
let editNaveSelected=''; 
let isEditableMode = false;
let filterStatus = 'all'; 
let filterNave = 'all'; 
let isPGPanelOpen = false; 

let fileHandle = null;
let data = { naves: [], accessPasswords: [], pendientesGenerales: [], fichasTecnicas: [] };

let modelosDB = [];
let modelosDBIndex = new Map(); 
let modelosDBChanged = false; 

function uid(){return 'x'+Math.random().toString(36).slice(2,9)}

function escHtml(s){
  if (s === null || s === undefined || s === 'undefined') return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDateEs(s){
  if(!s || s === 'undefined') return '';
  const p=String(s).split('-');
  return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:s;
}

function handleLockToggle() {
  if (isEditableMode) {
    isEditableMode = false;
    document.body.classList.add('is-locked');
    const btn = document.getElementById('btn-lock-toggle');
    btn.className = 'btn btn-amber';
    btn.innerHTML = '<i class="ti ti-lock"></i> MODO LECTURA 🔒';
    cancelEdit();
  } else {
    document.getElementById('auth-password').value = '';
    document.getElementById('modal-auth').classList.add('open');
    setTimeout(() => document.getElementById('auth-password').focus(), 100);
  }
}

function ensureAccessPasswords() {
  if (!data.accessPasswords || !Array.isArray(data.accessPasswords) || data.accessPasswords.length === 0) {
    data.accessPasswords = ['Inge10306', 'Inge08722'];
  }
}

function validatePassword() {
  ensureAccessPasswords();
  const inputPass = document.getElementById('auth-password').value;
  if (data.accessPasswords.includes(inputPass)) {
    isEditableMode = true;
    document.body.classList.remove('is-locked');
    const btn = document.getElementById('btn-lock-toggle');
    btn.className = 'btn btn-green';
    btn.innerHTML = '<i class="ti ti-lock-open"></i> MODO EDICIÓN 🔓';
    closeModal('modal-auth');
    renderPG(); 
  } else {
    const modal = document.querySelector('#modal-auth .modal');
    modal.classList.remove('auth-shake');
    void modal.offsetWidth;
    modal.classList.add('auth-shake');
    document.getElementById('auth-password').focus();
  }
}

function openManageAccess() {
  ensureAccessPasswords();
  renderAccessList();
  document.getElementById('new-access-password').value = '';
  document.getElementById('modal-manage-access').classList.add('open');
}

function renderAccessList() {
  ensureAccessPasswords();
  const list = document.getElementById('access-list');
  if (data.accessPasswords.length === 0) {
    list.innerHTML = '<div class="access-empty">No hay contraseñas registradas.</div>';
    return;
  }
  list.innerHTML = data.accessPasswords.map((p, idx) => `
    <div class="access-chip">
      <span>${p}</span>
      <button class="del-access" onclick="deleteAccessPassword(${idx})" title="Eliminar"><i class="ti ti-trash"></i></button>
    </div>
  `).join('');
}

function addAccessPassword() {
  ensureAccessPasswords();
  const input = document.getElementById('new-access-password');
  const val = input.value.trim();
  if (!val) return;
  if (data.accessPasswords.includes(val)) {
    alert('Esa contraseña ya existe.');
    return;
  }
  data.accessPasswords.push(val);
  input.value = '';
  renderAccessList();
}

function deleteAccessPassword(idx) {
  ensureAccessPasswords();
  if (data.accessPasswords.length <= 1) {
    alert('Debe quedar al menos una contraseña activa.');
    return;
  }
  data.accessPasswords.splice(idx, 1);
  renderAccessList();
}

function toggleProceso(naveId, itemId, field, el, event) {
  if(event) event.stopPropagation();
  if (!isEditableMode) return;
  const nave = data.naves.find(n => n.id === naveId);
  if(!nave) return;
  const item = nave.items.find(i => i.id === itemId);
  if(item) {
    if(!item.proceso) item.proceso = { habilitado: false, planos: false, etiquetas: false, planoTerminado: false };
    item.proceso[field] = !item.proceso[field];
    render();
  }
}

function subirAdjunto(event, naveId, itemId, idx) {
  if (!isEditableMode) return;
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const nave = data.naves.find(n => n.id === naveId);
    if(nave) {
      const item = nave.items.find(i => i.id === itemId);
      if(item) {
        if(!item.adjuntos) item.adjuntos = ["","","","",""];
        item.adjuntos[idx] = e.target.result;
        render(); 
      }
    }
  };
  reader.readAsDataURL(file);
}

function eliminarAdjunto(event, naveId, itemId, idx) {
  event.stopPropagation(); 
  if (!isEditableMode) return;
  const nave = data.naves.find(n => n.id === naveId);
  if(nave) {
    const item = nave.items.find(i => i.id === itemId);
    if(item && item.adjuntos) {
      item.adjuntos[idx] = "";
      render(); 
    }
  }
}

function togglePGPanel() {
  isPGPanelOpen = !isPGPanelOpen;
  const panel = document.getElementById('pg-panel');
  const chev = document.getElementById('pg-chevron');
  if (isPGPanelOpen) {
      panel.style.display = 'block';
      chev.classList.replace('ti-chevron-down', 'ti-chevron-up');
  } else {
      panel.style.display = 'none';
      chev.classList.replace('ti-chevron-up', 'ti-chevron-down');
  }
}

function renderPG() {
  if (!data.pendientesGenerales) data.pendientesGenerales = [];
  const count = data.pendientesGenerales.length;
  const counterEl = document.getElementById('pg-counter');
  
  if (count > 0) {
      counterEl.textContent = count;
      counterEl.style.display = 'inline-block';
  } else {
      counterEl.style.display = 'none';
  }
  
  const listEl = document.getElementById('pg-list');
  if (count === 0) {
      listEl.innerHTML = '<div class="empty-section">No hay pendientes generales activos.</div>';
      return;
  }
  
  let html = '';
  data.pendientesGenerales.forEach(pg => {
      let dateStr = '';
      if (pg.createdAt) {
          dateStr = new Date(pg.createdAt).toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' });
      }
      
      const isNew = pg.createdAt && (Date.now() - pg.createdAt) < (72 * 60 * 60 * 1000);
      const starHtml = isNew ? `<div title="Registro nuevo (últimas 72h)" style="color:#f59e0b; display:flex; align-items:center; justify-content:center; width:20px; height:20px; margin-left:4px;"><i class="ti ti-star-filled" style="font-size:16px"></i></div>` : '';

      html += `
      <div class="pg-item">
          <div class="pg-item-header">
              <div style="display:flex; align-items:flex-start; flex:1;">
                  <div class="pg-item-title">${escHtml(pg.title)}</div>
                  ${starHtml}
              </div>
              ${dateStr ? `<div class="pg-item-date">${dateStr}</div>` : ''}
          </div>
          <div class="pg-item-desc">${escHtml(pg.desc)}</div>
          <div class="pg-actions-row only-editable">
              <button class="btn btn-ghost btn-sm" title="Editar" onclick="editPG('${pg.id}')"><i class="ti ti-pencil"></i></button>
              <button class="btn btn-danger-ghost btn-sm" title="Eliminar" onclick="deletePG('${pg.id}')"><i class="ti ti-trash"></i></button>
          </div>
      </div>
      `;
  });
  listEl.innerHTML = html;
}

function openAddPG() {
  if (!isEditableMode) return;
  document.getElementById('pg-edit-id').value = '';
  document.getElementById('pg-title').value = '';
  document.getElementById('pg-desc').value = '';
  document.getElementById('modal-pg-h').textContent = 'Agregar Pendiente General';
  document.getElementById('modal-pg').classList.add('open');
  setTimeout(() => document.getElementById('pg-title').focus(), 100);
}

function savePG() {
  if (!isEditableMode) return;
  const id = document.getElementById('pg-edit-id').value;
  const title = document.getElementById('pg-title').value.trim();
  const desc = document.getElementById('pg-desc').value.trim();
  
  if (!title || !desc) {
      alert("⚠️ Título y Descripción son obligatorios.");
      return;
  }
  
  if (!data.pendientesGenerales) data.pendientesGenerales = [];
  
  if (id) {
      const pg = data.pendientesGenerales.find(p => p.id === id);
      if (pg) {
          pg.title = title;
          pg.desc = desc;
      }
  } else {
      data.pendientesGenerales.unshift({
          id: uid(),
          title: title,
          desc: desc,
          createdAt: Date.now()
      });
  }
  
  closeModal('modal-pg');
  renderPG();
}

function editPG(id) {
  if (!isEditableMode) return;
  const pg = data.pendientesGenerales.find(p => p.id === id);
  if (!pg) return;
  document.getElementById('pg-edit-id').value = pg.id;
  document.getElementById('pg-title').value = pg.title;
  document.getElementById('pg-desc').value = pg.desc;
  document.getElementById('modal-pg-h').textContent = 'Editar Pendiente General';
  document.getElementById('modal-pg').classList.add('open');
}

function deletePG(id) {
  if (!isEditableMode) return;
  if (!confirm('¿Eliminar este pendiente general permanentemente?')) return;
  data.pendientesGenerales = data.pendientesGenerales.filter(p => p.id !== id);
  renderPG();
}

function render(){
  if(data && data.naves) {
    data.naves.forEach(nave => {
      if (nave.models) {
        nave.models = nave.models.map(m => {
          const obj = (typeof m === 'string') ? { name: m, link: '' } : m;
          if(obj.coleccion === undefined || obj.coleccion === null || obj.coleccion === ''){
            obj.coleccion = coleccionParaCodigo(obj.name) || obj.coleccion || '';
          }
          return obj;
        });
      }
    });
  }

  const c=document.getElementById('naves-container');
  c.innerHTML='';
  if(data && data.naves) {
    data.naves.forEach((n, idx) => c.insertAdjacentHTML('beforeend', renderNave(n, idx, data.naves.length)));
  }
  
  renderPG(); 
  renderFichas(); 
  filterItems(); 
}

function dotClass(t){return t==='error'?'dot-error':t==='ajuste'?'dot-ajuste':'dot-mejora'}

function setFilterStatus(status, btn) {
  filterStatus = status;
  document.querySelectorAll('.status-filter').forEach(b => b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  filterItems();
}

function setFilterNave(nave, btn) {
  filterNave = nave;
  document.querySelectorAll('.nave-filter').forEach(b => b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  filterItems();
}

function normalizeSearch(s){
  return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

function filterItems(){
  const rawQ = document.getElementById('search-input').value;
  const q = normalizeSearch(rawQ.trim());
  const clearBtn = document.getElementById('search-clear-btn');
  if (clearBtn) clearBtn.style.display = rawQ ? 'flex' : 'none';

  document.querySelectorAll('.nave-card').forEach(naveCard=>{
    const badge = naveCard.querySelector('.nave-badge');
    const naveName = badge ? badge.textContent.trim().toUpperCase() : '';
    
    if (filterNave !== 'all' && naveName !== filterNave) {
        naveCard.style.display = 'none';
        return;
    }

    if(!q && filterStatus === 'all'){
      naveCard.style.display='';
      naveCard.querySelectorAll('.item-card').forEach(ic=>{
        ic.style.display='';
        clearHighlight(ic);
      });
      return;
    }

    const title = naveCard.querySelector('.nave-title');
    const modelChips = naveCard.querySelectorAll('.model-chip');
    const modelsText = normalizeSearch(Array.from(modelChips).map(el=>el.textContent).join(' '));
    const naveText = normalizeSearch((badge?badge.textContent:'') + ' ' + (title?title.textContent:'') + ' ' + modelsText);
    const naveMatches = naveText.includes(q);

    let anyItemVisible = false;
    naveCard.querySelectorAll('.item-card').forEach(itemCard=>{
      const itemText = normalizeSearch(itemCard.textContent);
      const textMatch = !q || naveMatches || itemText.includes(q);
      
      const isDone = itemCard.classList.contains('plano-done');
      let statusMatch = true;
      if (filterStatus === 'pending' && isDone) statusMatch = false;
      if (filterStatus === 'done' && !isDone) statusMatch = false;

      const itemMatches = textMatch && statusMatch;

      itemCard.style.display = itemMatches ? '' : 'none';
      if(itemMatches && q){
        applyHighlight(itemCard, rawQ.trim());
      } else {
        clearHighlight(itemCard);
      }
      
      if(itemMatches) anyItemVisible = true;
    });

    naveCard.style.display = (anyItemVisible || (naveMatches && filterStatus === 'all')) ? '' : 'none';
  });
}

function escRegex(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function highlightText(str, rawQ){
  const escaped = escHtml(str);
  if(!rawQ) return escaped;
  const re = new RegExp('(' + escRegex(escHtml(rawQ)) + ')', 'gi');
  return escaped.replace(re, '<mark class="search-highlight">$1</mark>');
}

function applyHighlight(itemCard, rawQ){
  ['.item-title-text', '.item-desc-text'].forEach(sel=>{
    const el = itemCard.querySelector(sel);
    if(!el) return;
    if(el.dataset.raw === undefined) el.dataset.raw = el.textContent;
    el.innerHTML = highlightText(el.dataset.raw, rawQ);
  });
}

function clearHighlight(itemCard){
  ['.item-title-text', '.item-desc-text'].forEach(sel=>{
    const el = itemCard.querySelector(sel);
    if(el && el.dataset.raw !== undefined) el.textContent = el.dataset.raw;
  });
}

function clearSearch(){
  document.getElementById('search-input').value='';
  filterItems();
}

window.addEventListener('scroll', ()=>{
  const btn = document.getElementById('scroll-top-btn');
  if(!btn) return;
  const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
  const isAtBottom = window.scrollY >= (scrollableHeight - 50);

  btn.classList.toggle('visible', scrollableHeight > 0);

  if (isAtBottom) {
    btn.innerHTML = '<i class="ti ti-arrow-up"></i>';
    btn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    btn.innerHTML = '<i class="ti ti-arrow-down"></i>';
    btn.onclick = () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }
});
function renderItemCard(item, naveId){
  const editing = editingItemId === item.id;
  
  let safeFecha = item.fecha && item.fecha !== 'undefined' ? item.fecha : '';
  let safeOdt = item.odt && item.odt !== 'undefined' ? item.odt : '';
  
  if(editing && isEditableMode){
    if(!safeFecha) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        safeFecha = `${yyyy}-${mm}-${dd}`;
    }
    
    return `<div class="item-card" id="ic-${item.id}">
      <div class="item-dot ${dotClass(item.type)}" style="margin-top:8px"></div>
      <div class="item-content">
        <div style="display:flex; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
          <select class="edit-title-input" id="ec-${item.id}" onchange="updateSubCatDropdown(this.value, 'esc-${item.id}')" style="width:auto; margin-bottom:0; padding-top:4px; padding-bottom:4px; cursor:pointer;" title="Categoría">
            <option value="error" ${item.type==='error'?'selected':''}>🚨 Error</option>
            <option value="ajuste" ${item.type==='ajuste'?'selected':''}>🔧 Ajuste</option>
            <option value="mejora" ${item.type==='mejora'?'selected':''}>✨ Mejora</option>
          </select>
          <select class="edit-title-input" id="esc-${item.id}" style="width:auto; margin-bottom:0; padding-top:4px; padding-bottom:4px; cursor:pointer; max-width: 150px;" title="Clasificación">
            <option value="${escHtml(item.subType||'')}">${escHtml(item.subType||'Seleccionar...')}</option>
          </select>
          <input class="edit-title-input" type="date" id="ef-${item.id}" value="${safeFecha}" style="width:130px; margin-bottom:0;" title="Fecha" />
          <input class="edit-title-input" type="text" id="eo-${item.id}" placeholder="Código ODT" value="${escHtml(safeOdt)}" style="width:150px; margin-bottom:0;" title="Código ODT" />
        </div>
        <input class="edit-title-input" id="et-${item.id}" value="${escHtml(item.title)}" />
        <textarea class="edit-area" id="ed-${item.id}" rows="3">${escHtml(item.desc)}</textarea>
        <div class="edit-actions">
          <button class="btn btn-sm btn-green" onclick="saveEdit('${naveId}','${item.id}')"><i class="ti ti-check"></i> Guardar</button>
          <button class="btn btn-sm" onclick="cancelEdit()"><i class="ti ti-x"></i> Cancelar</button>
        </div>
      </div>
    </div>`;
  }
  
  if (!item.proceso) {
    item.proceso = { habilitado: false, planos: false, etiquetas: false, planoTerminado: false };
  }
  if (!item.adjuntos) {
    item.adjuntos = ["", "", "", "", ""];
  }
  
  const proc = item.proceso;

  let adjuntosHtml = '<div class="contenedor-adjuntos">';
  for (let i = 0; i < 5; i++) {
    if (item.adjuntos[i]) {
      adjuntosHtml += `
      <div class="espacio-imagen">
        <img src="${item.adjuntos[i]}" class="visible" onclick="viewImage(this.src)">
        <button class="btn-eliminar-adjunto only-editable" style="display:flex;" onclick="eliminarAdjunto(event, '${naveId}', '${item.id}', ${i})" title="Eliminar imagen"><i class="ti ti-x"></i></button>
      </div>`;
    } else {
      adjuntosHtml += `
      <div class="espacio-imagen pdf-hide-empty">
        <input type="file" accept="image/*" id="adj-${item.id}-${i}" class="input-oculto" onchange="subirAdjunto(event, '${naveId}', '${item.id}', ${i})">
        <label for="adj-${item.id}-${i}" class="label-adjuntar"><i class="ti ti-plus"></i></label>
      </div>`;
    }
  }
  adjuntosHtml += '</div>';

  const procesoHtml = `
    <div class="proceso-container">
      <div class="proceso-item" onclick="toggleProceso('${naveId}', '${item.id}', 'habilitado', this, event)">
        <span>Habilitado</span> <span class="status-icon">${proc.habilitado ? '✔️' : '❌'}</span>
      </div>
      <div class="proceso-item" onclick="toggleProceso('${naveId}', '${item.id}', 'planos', this, event)">
        <span>Planos</span> <span class="status-icon">${proc.planos ? '✔️' : '❌'}</span>
      </div>
      <div class="proceso-item" onclick="toggleProceso('${naveId}', '${item.id}', 'etiquetas', this, event)">
        <span>Etiquetas</span> <span class="status-icon">${proc.etiquetas ? '✔️' : '❌'}</span>
      </div>
      ${adjuntosHtml}
    </div>
  `;

  const planoTerminadoHtml = proc.planoTerminado
    ? `<div class="plano-terminado-badge done" onclick="toggleProceso('${naveId}', '${item.id}', 'planoTerminado', this, event)" title="Plano terminado - clic para desmarcar"><i class="ti ti-circle-check-filled"></i></div>`
    : `<div class="plano-terminado-badge pendiente" onclick="toggleProceso('${naveId}', '${item.id}', 'planoTerminado', this, event)" title="Marcar plano como terminado"><i class="ti ti-alert-triangle"></i><span>PENDIENTE</span></div>`;

  let metaHtml = '';
  if (safeOdt || safeFecha || isEditableMode) {
     let odtTag = safeOdt ? `<span>ODT: ${escHtml(safeOdt)}</span>` : (isEditableMode ? `<span class="dashed-add only-editable" onclick="startEdit('${item.id}')" title="Agregar Código ODT">+ ODT</span>` : '');
     let fechaTag = safeFecha ? `<span>${formatDateEs(safeFecha)}</span>` : (isEditableMode ? `<span class="dashed-add only-editable" onclick="startEdit('${item.id}')" title="Agregar Fecha">+ Fecha</span>` : '');
     
     if (odtTag || fechaTag) {
         metaHtml = `<div class="item-meta">${odtTag}${fechaTag}</div>`;
     }
  }

  const isNew = item.createdAt && (Date.now() - item.createdAt) < (72 * 60 * 60 * 1000);
  const starIndicatorHtml = isNew 
    ? `<div title="Registro nuevo (últimas 72h)" style="color:#f59e0b; display:flex; align-items:center; justify-content:center; width:20px; height:20px;"><i class="ti ti-star-filled" style="font-size:16px"></i></div>` 
    : `<div style="width:20px; height:20px;"></div>`;

  return `<div class="item-card ${proc.planoTerminado ? 'plano-done' : ''}" id="ic-${item.id}">
    <div class="item-dot ${dotClass(item.type)}" style="margin-top:5px"></div>
    <div class="item-content">
      <div class="item-title-row">
        <div style="display:flex; align-items:flex-start; gap:8px; flex:1; min-width:0;">
          ${planoTerminadoHtml}
          <span class="item-title-text">${escHtml(item.title)}</span>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px; margin-left:12px;">
          ${metaHtml}
          <div class="item-actions-row only-editable">
            <button class="btn btn-ghost" title="Editar" onclick="startEdit('${item.id}')"><i class="ti ti-pencil" style="font-size:13px"></i></button>
            <button class="btn btn-danger-ghost" title="Eliminar" onclick="removeItem('${naveId}','${item.id}')"><i class="ti ti-trash" style="font-size:13px"></i></button>
          </div>
        </div>
      </div>
      <div class="item-desc-text">${escHtml(item.desc)}</div>
      <div class="item-footer">
        ${procesoHtml}
        ${starIndicatorHtml}
      </div>
    </div>
  </div>`;
}

function renderNave(nave, index, total){
  const errores=nave.items.filter(i=>i.type==='error');
  const ajustes=nave.items.filter(i=>i.type==='ajuste');
  const mejoras=nave.items.filter(i=>i.type==='mejora');
  
  const showErrores=nave.tipo==='ambos'||nave.tipo==='errores'||errores.length>0;
  const showAjustes=nave.tipo==='ambos'||nave.tipo==='errores'||ajustes.length>0;
  const showMejoras=nave.tipo==='ambos'||nave.tipo==='mejoras'||mejoras.length>0;
  
  let galleryHtml = '<div class="img-gallery">';
  nave.images.forEach((img, idx) => {
    galleryHtml += `
      <div class="img-item">
        <img src="${img}" alt="Mueble" title="Haz clic para ampliar" onclick="viewImage('${img}')" />
        <button class="del-img-btn only-editable" onclick="removeImg('${nave.id}', ${idx})" title="Eliminar imagen"><i class="ti ti-trash"></i></button>
      </div>`;
  });
  if (nave.images.length < 10) {
    const isFullWidth = nave.images.length === 0 ? 'full-width' : '';
    galleryHtml += `
      <div class="img-box ${isFullWidth} pdf-hide-empty" onclick="triggerImg('${nave.id}')">
        <i class="ti ti-photo-plus" style="font-size:20px;color:var(--color-text-secondary)"></i>
        <p>Agregar<br>(${nave.images.length}/10)</p>
      </div>`;
  }
  galleryHtml += '</div>';

  const modelsHtml=nave.models.map((m,idx)=>{
    let linkBtn = '';
    if(m.link) {
        const rawLink = escHtml(m.link.trim());
        linkBtn = `<button class="model-link-btn" title="Abrir enlace" onclick='abrirEnlaceModelo(${JSON.stringify(m.link.trim())}, event)' style="color:var(--navy); background:none; border:none; cursor:pointer; padding:0; margin-right:4px; display:flex; align-items:center;"><i class="ti ti-link"></i></button>`;
    }
    
    return `<div class="model-chip">
      ${linkBtn}
      <span>${m.name}${m.coleccion ? `<span class="model-coleccion-tag">${escHtml(m.coleccion)}</span>` : ''}</span>
      <div style="display:flex; gap:4px" class="only-editable">
        <button class="edit-model" title="Editar modelo, colección y enlace" onclick="openEditModel('${nave.id}', ${idx})"><i class="ti ti-pencil"></i></button>
        <button class="del-model" title="Quitar modelo" onclick="removeModel('${nave.id}', ${idx})"><i class="ti ti-x"></i></button>
      </div>
    </div>`;
  }).join('');
    
  const errSection=showErrores?`
    <div class="section-block">
      <div class="section-header">
        <span class="section-pill pill-error"><i class="ti ti-alert-circle" style="font-size:13px"></i> Reporte de errores</span>
        <button class="btn btn-xs btn-ghost only-editable" onclick="openAddItem('${nave.id}','error')"><i class="ti ti-plus" style="font-size:12px"></i> Agregar</button>
      </div>
      ${errores.length?errores.map(i=>renderItemCard(i,nave.id)).join(''):'<div class="empty-section">Sin errores registrados.</div>'}
    </div>`:''
  const ajuSection=showAjustes?`
    ${showErrores&&errores.length?'<div class="divider"></div>':''}
    <div class="section-block">
      <div class="section-header">
        <span class="section-pill" style="background:#fef08a; color:#854d0e; border:1px solid #fde047; padding: 4px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;"><i class="ti ti-tool" style="font-size:13px"></i> Reporte de ajustes</span>
        <button class="btn btn-xs btn-ghost only-editable" onclick="openAddItem('${nave.id}','ajuste')"><i class="ti ti-plus" style="font-size:12px"></i> Agregar</button>
      </div>
      ${ajustes.length?ajustes.map(i=>renderItemCard(i,nave.id)).join(''):'<div class="empty-section">Sin ajustes registrados.</div>'}
    </div>`:''
  const mejSection=showMejoras?`
    ${(showErrores&&errores.length)||(showAjustes&&ajustes.length)?'<div class="divider"></div>':''}
    <div class="section-block">
      <div class="section-header">
        <span class="section-pill pill-mejora"><i class="ti ti-sparkles" style="font-size:13px"></i> Reporte de mejoras</span>
        <button class="btn btn-xs btn-ghost scholarly only-editable" onclick="openAddItem('${nave.id}','mejora')"><i class="ti ti-plus" style="font-size:12px"></i> Agregar</button>
      </div>
      ${mejoras.length?mejoras.map(i=>renderItemCard(i,nave.id)).join(''):'<div class="empty-section">Sin mejoras registradas.</div>'}
    </div>`:''
  
  return `<div class="nave-card" id="nave-${nave.id}" onmouseenter="currentImgNaveId='${nave.id}'">
    <div class="nave-header">
      <div class="nave-header-left">
        <span class="nave-badge">${nave.nave}</span>
        <span class="nave-title">${nave.consola}</span>
      </div>
      <div class="nave-header-right only-editable">
        ${index > 0 ? `<button class="hbtn" onclick="moveNaveUp(${index})" title="Mover arriba"><i class="ti ti-arrow-up"></i></button>` : ''}
        ${index < total - 1 ? `<button class="hbtn" onclick="moveNaveDown(${index})" title="Mover abajo"><i class="ti ti-arrow-down"></i></button>` : ''}
        <button class="hbtn" onclick="openEditNaveHeader('${nave.id}')" title="Editar Cabecera"><i class="ti ti-pencil"></i></button>
        <button class="hbtn" onclick="openAddItem('${nave.id}','mejora')"><i class="ti ti-plus"></i> Elemento</button>
        <button class="hbtn danger" onclick="removeNave('${nave.id}')"><i class="ti ti-trash"></i></button>
      </div>
    </div>
    <div class="nave-body">
      <div class="nave-left">
        <div>
          <div class="panel-label">Modelos</div>
          <div class="models-chip-list">${modelsHtml}</div>
          <div class="add-model-row only-editable" style="position:relative;">
            <input id="addm-${nave.id}" placeholder="Nuevo código" autocomplete="off" oninput="mostrarSugerenciasAddModelo('${nave.id}')" onblur="setTimeout(()=>ocultarSugerenciasAddModelo('${nave.id}'), 150)" onkeydown="if(event.key==='Enter')addModel('${nave.id}')" />
            <button class="btn btn-xs" onclick="addModel('${nave.id}')"><i class="ti ti-plus"></i></button>
            <div class="autocomplete-list" id="addm-ac-${nave.id}"></div>
          </div>
        </div>
        <div>
          <div class="panel-label">Imágenes (Clic, o Ctrl+V para pegar)</div>
          ${galleryHtml}
        </div>
      </div>
      <div class="nave-body-right right" style="flex:1; padding:18px;">${errSection}${ajuSection}${mejSection}</div>
    </div>
  </div>`;
}

/* ---- Visor de Imagen Full Size ---- */
function viewImage(src) {
  document.getElementById('view-img-element').src = src;
  document.getElementById('modal-view-img').classList.add('open');
}

/* ---- Mover Naves Arriba/Abajo ---- */
function moveNaveUp(idx){
  if (!isEditableMode) return;
  if(idx > 0){
    const temp = data.naves[idx - 1];
    data.naves[idx - 1] = data.naves[idx];
    data.naves[idx] = temp;
    render();
  }
}
function moveNaveDown(idx){
  if (!isEditableMode) return;
  if(idx < data.naves.length - 1){
    const temp = data.naves[idx + 1];
    data.naves[idx + 1] = data.naves[idx];
    data.naves[idx] = temp;
    render();
  }
}

/* ---- Autocompletado (COMPATIBLE CON ANDROID Y PC) ---- */
function renderAutocompleteList(container, matches, onSelectAttr){
  if(!container) return;
  if(!matches.length){ container.classList.remove('open'); container.innerHTML=''; return; }
  
  container.innerHTML = matches.map(m => `
    <div class="autocomplete-item" onpointerdown="${onSelectAttr(m)}; event.preventDefault();">
      <span class="ac-codigo">${escHtml(m.codigo)}</span>
      ${m.coleccion ? `<span class="ac-coleccion">${escHtml(m.coleccion)}</span>` : ''}
    </div>`).join('');
  container.classList.add('open');
}

function mostrarSugerenciasBuscador(){
  const inp = document.getElementById('search-input');
  const cont = document.getElementById('search-autocomplete');
  const matches = buscarModelosDB(inp.value, 8);
  renderAutocompleteList(cont, matches, (m)=>`seleccionarSugerenciaBuscador('${m.codigo.replace(/'/g,"\\'")}')`);
}
function ocultarSugerenciasBuscador(){
  const cont = document.getElementById('search-autocomplete');
  if(cont){ cont.classList.remove('open'); }
}
function seleccionarSugerenciaBuscador(codigo){
  document.getElementById('search-input').value = codigo;
  ocultarSugerenciasBuscador();
  filterItems();
}

function mostrarSugerenciasAddModelo(naveId){
  const inp = document.getElementById('addm-'+naveId);
  const cont = document.getElementById('addm-ac-'+naveId);
  const matches = buscarModelosDB(inp.value, 8);
  renderAutocompleteList(cont, matches, (m)=>`seleccionarSugerenciaAddModelo('${naveId}','${m.codigo.replace(/'/g,"\\'")}')`);
}
function ocultarSugerenciasAddModelo(naveId){
  const cont = document.getElementById('addm-ac-'+naveId);
  if(cont){ cont.classList.remove('open'); }
}
function seleccionarSugerenciaAddModelo(naveId, codigo){
  const inp = document.getElementById('addm-'+naveId);
  inp.value = codigo;
  ocultarSugerenciasAddModelo(naveId);
  addModel(naveId); 
}

function mostrarSugerenciasTagModal(){
  const inp = document.getElementById('tag-input');
  const cont = document.getElementById('tag-autocomplete');
  if(!inp || !cont) return;
  const matches = buscarModelosDB(inp.value, 8);
  renderAutocompleteList(cont, matches, (m)=>`seleccionarSugerenciaTagModal('${m.codigo.replace(/'/g,"\\'")}')`);
}
function ocultarSugerenciasTagModal(){
  const cont = document.getElementById('tag-autocomplete');
  if(cont){ cont.classList.remove('open'); }
}
function seleccionarSugerenciaTagModal(codigo){
  const inp = document.getElementById('tag-input');
  if(inp) inp.value = '';
  if(codigo && !newModels.includes(codigo)){
    newModels.push(codigo);
    renderTags();
  }
  ocultarSugerenciasTagModal();
  if(inp) inp.focus();
}

function mostrarSugerenciasModeloModal(){
  const inp = document.getElementById('edit-model-name');
  const cont = document.getElementById('edit-model-autocomplete');
  const matches = buscarModelosDB(inp.value, 8);
  renderAutocompleteList(cont, matches, (m)=>`seleccionarSugerenciaModeloModal('${m.codigo.replace(/'/g,"\\'")}')`);
}
function ocultarSugerenciasModeloModal(){
  const cont = document.getElementById('edit-model-autocomplete');
  if(cont){ cont.classList.remove('open'); }
}
function seleccionarSugerenciaModeloModal(codigo){
  document.getElementById('edit-model-name').value = codigo;
  document.getElementById('edit-model-coleccion').value = coleccionParaCodigo(codigo);
  ocultarSugerenciasModeloModal();
}

/* ---- Models Management ---- */
function addModel(naveId){
  if (!isEditableMode) return;
  const inp=document.getElementById('addm-'+naveId);
  const val=inp.value.trim().toUpperCase();
  if(!val)return;
  const nave=data.naves.find(n=>n.id===naveId);
  if(nave&&!nave.models.find(m => m.name === val)){
    nave.models.push({name: val, link: '', coleccion: coleccionParaCodigo(val)});
  }
  inp.value='';
  ocultarSugerenciasAddModelo(naveId);
  render();
}
function removeModel(naveId,idx){
  if (!isEditableMode) return;
  const nave=data.naves.find(n=>n.id===naveId);
  if(nave){nave.models.splice(idx,1);render();}
}

function abrirEnlaceModelo(rawLink, event){
  if(event){ event.preventDefault(); event.stopPropagation(); }
  const link = (rawLink || '').trim();
  if(!link) return;

  const isNetworkPath = link.startsWith('\\\\') || link.toLowerCase().startsWith('file:');

  if(!isNetworkPath){
    let url = link;
    if(!/^https?:\/\//i.test(url)) url = 'http://' + url;
    window.open(url, '_blank');
    return;
  }

  const copyFallback = () => {
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(link).then(()=>{
        alert('Tu navegador no permite abrir carpetas de red automáticamente desde esta página por seguridad.\n\nLa ruta se copió al portapapeles:\n' + link + '\n\nPégala en el Explorador de Archivos (Windows) para abrirla.');
      }).catch(()=>{
        alert('Tu navegador no permite abrir carpetas de red automáticamente desde esta página por seguridad.\n\nCopia esta ruta manualmente y pégala en el Explorador de Archivos:\n\n' + link);
      });
    } else {
      alert('Tu navegador no permite abrir carpetas de red automáticamente desde esta página por seguridad.\n\nCopia esta ruta manualmente y pégala en el Explorador de Archivos:\n\n' + link);
    }
  };
  copyFallback();
}

function openEditModel(naveId, idx){
  if (!isEditableMode) return;
  const nave = data.naves.find(n => n.id === naveId);
  const model = nave.models[idx];
  document.getElementById('edit-model-nave-id').value = naveId;
  document.getElementById('edit-model-idx').value = idx;
  document.getElementById('edit-model-name').value = model.name;
  document.getElementById('edit-model-coleccion').value = model.coleccion || '';
  document.getElementById('edit-model-link').value = model.link || '';
  document.getElementById('modal-edit-model').classList.add('open');
}
function saveEditedModel(){
  if (!isEditableMode) return;
  const naveId = document.getElementById('edit-model-nave-id').value;
  const idx = parseInt(document.getElementById('edit-model-idx').value);
  const name = document.getElementById('edit-model-name').value.trim();
  const coleccion = document.getElementById('edit-model-coleccion').value.trim();
  const link = document.getElementById('edit-model-link').value.trim();
  if(!name) return;
  const nave = data.naves.find(n => n.id === naveId);
  if(nave) {
    nave.models[idx] = { name, link, coleccion };
    render();
  }
  closeModal('modal-edit-model');
}

function selectEditNaveOpt(el, val) {
  editNaveSelected = val;
  document.querySelectorAll('#edit-nave-select .select-opt').forEach(x => x.classList.remove('selected'));
  el.classList.add('selected');
}

function openEditNaveHeader(naveId) {
  if (!isEditableMode) return;
  const nave = data.naves.find(n => n.id === naveId);
  if (!nave) return;
  
  document.getElementById('edit-nave-id').value = naveId;
  document.getElementById('edit-nave-consola').value = nave.consola || '';
  
  editNaveSelected = nave.nave || '';
  document.querySelectorAll('#edit-nave-select .select-opt').forEach(el => {
      el.classList.remove('selected');
      const onclickAttr = el.getAttribute('onclick');
      if (onclickAttr) {
        const optVal = onclickAttr.match(/'([^']+)'/)[1];
        if (optVal === editNaveSelected) {
            el.classList.add('selected');
        }
      }
  });

  document.getElementById('modal-edit-nave').classList.add('open');
  setTimeout(()=>document.getElementById('edit-nave-consola').focus(),100);
}

function saveEditedNaveHeader() {
  if (!isEditableMode) return;
  const naveId = document.getElementById('edit-nave-id').value;
  const consola = document.getElementById('edit-nave-consola').value.trim().toUpperCase();
  
  if (!editNaveSelected) {
    alert("⚠️ Campo obligatorio: Debes seleccionar una Nave.");
    return;
  }
  if (!consola) {
    alert("⚠️ Campo obligatorio: Debes escribir el nombre/consola.");
    return;
  }

  const nave = data.naves.find(n => n.id === naveId);
  if (nave) {
    nave.nave = editNaveSelected;
    nave.consola = consola;
    render();
  }
  closeModal('modal-edit-nave');
}

/* ---- Image Management ---- */
function triggerImg(id){
  if (!isEditableMode) return;
  currentImgNaveId=id;
  document.getElementById('img-input').click();
}
function handleImg(e){
  if (!isEditableMode) return;
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const n=data.naves.find(x=>x.id===currentImgNaveId);
    if(n && n.images.length < 10){
      n.images.push(ev.target.result);
      render();
    }
  };
  reader.readAsDataURL(file);e.target.value='';
}
function removeImg(naveId, imgIdx){
  if (!isEditableMode) return;
  const n=data.naves.find(x=>x.id===naveId);
  if(n){n.images.splice(imgIdx, 1);render();}
}

/* ---- Pegar Imagen (Ctrl+V) ---- */
document.addEventListener('paste', function(e) {
  if (!isEditableMode) return;
  let targetId = currentImgNaveId;
  if (!targetId && data.naves.length === 1) targetId = data.naves[0].id;
  if (!targetId) return;

  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      e.preventDefault();
      const blob = items[i].getAsFile();
      const reader = new FileReader();
      reader.onload = (ev) => {
        const n = data.naves.find(x => x.id === targetId);
        if (n && n.images.length < 10) {
          n.images.push(ev.target.result);
          render();
        } else if (n && n.images.length >= 10) {
           alert("Límite de 10 imágenes alcanzado para este mueble.");
        }
      };
      reader.readAsDataURL(blob);
      break;
    }
  }
});
function renderItemCard(item, naveId){
  const editing = editingItemId === item.id;
  
  let safeFecha = item.fecha && item.fecha !== 'undefined' ? item.fecha : '';
  let safeOdt = item.odt && item.odt !== 'undefined' ? item.odt : '';
  
  if(editing && isEditableMode){
    if(!safeFecha) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        safeFecha = `${yyyy}-${mm}-${dd}`;
    }
    
    return `<div class="item-card" id="ic-${item.id}">
      <div class="item-dot ${dotClass(item.type)}" style="margin-top:8px"></div>
      <div class="item-content">
        <div style="display:flex; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
          <select class="edit-title-input" id="ec-${item.id}" onchange="updateSubCatDropdown(this.value, 'esc-${item.id}')" style="width:auto; margin-bottom:0; padding-top:4px; padding-bottom:4px; cursor:pointer;" title="Categoría">
            <option value="error" ${item.type==='error'?'selected':''}>🚨 Error</option>
            <option value="ajuste" ${item.type==='ajuste'?'selected':''}>🔧 Ajuste</option>
            <option value="mejora" ${item.type==='mejora'?'selected':''}>✨ Mejora</option>
          </select>
          <select class="edit-title-input" id="esc-${item.id}" style="width:auto; margin-bottom:0; padding-top:4px; padding-bottom:4px; cursor:pointer; max-width: 150px;" title="Clasificación">
            <option value="${escHtml(item.subType||'')}">${escHtml(item.subType||'Seleccionar...')}</option>
          </select>
          <input class="edit-title-input" type="date" id="ef-${item.id}" value="${safeFecha}" style="width:130px; margin-bottom:0;" title="Fecha" />
          <input class="edit-title-input" type="text" id="eo-${item.id}" placeholder="Código ODT" value="${escHtml(safeOdt)}" style="width:150px; margin-bottom:0;" title="Código ODT" />
        </div>
        <input class="edit-title-input" id="et-${item.id}" value="${escHtml(item.title)}" />
        <textarea class="edit-area" id="ed-${item.id}" rows="3">${escHtml(item.desc)}</textarea>
        <div class="edit-actions">
          <button class="btn btn-sm btn-green" onclick="saveEdit('${naveId}','${item.id}')"><i class="ti ti-check"></i> Guardar</button>
          <button class="btn btn-sm" onclick="cancelEdit()"><i class="ti ti-x"></i> Cancelar</button>
        </div>
      </div>
    </div>`;
  }
  
  if (!item.proceso) {
    item.proceso = { habilitado: false, planos: false, etiquetas: false, planoTerminado: false };
  }
  if (!item.adjuntos) {
    item.adjuntos = ["", "", "", "", ""];
  }
  
  const proc = item.proceso;

  let adjuntosHtml = '<div class="contenedor-adjuntos">';
  for (let i = 0; i < 5; i++) {
    if (item.adjuntos[i]) {
      adjuntosHtml += `
      <div class="espacio-imagen">
        <img src="${item.adjuntos[i]}" class="visible" onclick="viewImage(this.src)">
        <button class="btn-eliminar-adjunto only-editable" style="display:flex;" onclick="eliminarAdjunto(event, '${naveId}', '${item.id}', ${i})" title="Eliminar imagen"><i class="ti ti-x"></i></button>
      </div>`;
    } else {
      adjuntosHtml += `
      <div class="espacio-imagen pdf-hide-empty">
        <input type="file" accept="image/*" id="adj-${item.id}-${i}" class="input-oculto" onchange="subirAdjunto(event, '${naveId}', '${item.id}', ${i})">
        <label for="adj-${item.id}-${i}" class="label-adjuntar"><i class="ti ti-plus"></i></label>
      </div>`;
    }
  }
  adjuntosHtml += '</div>';

  const procesoHtml = `
    <div class="proceso-container">
      <div class="proceso-item" onclick="toggleProceso('${naveId}', '${item.id}', 'habilitado', this, event)">
        <span>Habilitado</span> <span class="status-icon">${proc.habilitado ? '✔️' : '❌'}</span>
      </div>
      <div class="proceso-item" onclick="toggleProceso('${naveId}', '${item.id}', 'planos', this, event)">
        <span>Planos</span> <span class="status-icon">${proc.planos ? '✔️' : '❌'}</span>
      </div>
      <div class="proceso-item" onclick="toggleProceso('${naveId}', '${item.id}', 'etiquetas', this, event)">
        <span>Etiquetas</span> <span class="status-icon">${proc.etiquetas ? '✔️' : '❌'}</span>
      </div>
      ${adjuntosHtml}
    </div>
  `;

  const planoTerminadoHtml = proc.planoTerminado
    ? `<div class="plano-terminado-badge done" onclick="toggleProceso('${naveId}', '${item.id}', 'planoTerminado', this, event)" title="Plano terminado - clic para desmarcar"><i class="ti ti-circle-check-filled"></i></div>`
    : `<div class="plano-terminado-badge pendiente" onclick="toggleProceso('${naveId}', '${item.id}', 'planoTerminado', this, event)" title="Marcar plano como terminado"><i class="ti ti-alert-triangle"></i><span>PENDIENTE</span></div>`;

  let metaHtml = '';
  if (safeOdt || safeFecha || isEditableMode) {
     let odtTag = safeOdt ? `<span>ODT: ${escHtml(safeOdt)}</span>` : (isEditableMode ? `<span class="dashed-add only-editable" onclick="startEdit('${item.id}')" title="Agregar Código ODT">+ ODT</span>` : '');
     let fechaTag = safeFecha ? `<span>${formatDateEs(safeFecha)}</span>` : (isEditableMode ? `<span class="dashed-add only-editable" onclick="startEdit('${item.id}')" title="Agregar Fecha">+ Fecha</span>` : '');
     
     if (odtTag || fechaTag) {
         metaHtml = `<div class="item-meta">${odtTag}${fechaTag}</div>`;
     }
  }

  const isNew = item.createdAt && (Date.now() - item.createdAt) < (72 * 60 * 60 * 1000);
  const starIndicatorHtml = isNew 
    ? `<div title="Registro nuevo (últimas 72h)" style="color:#f59e0b; display:flex; align-items:center; justify-content:center; width:20px; height:20px;"><i class="ti ti-star-filled" style="font-size:16px"></i></div>` 
    : `<div style="width:20px; height:20px;"></div>`;

  return `<div class="item-card ${proc.planoTerminado ? 'plano-done' : ''}" id="ic-${item.id}">
    <div class="item-dot ${dotClass(item.type)}" style="margin-top:5px"></div>
    <div class="item-content">
      <div class="item-title-row">
        <div style="display:flex; align-items:flex-start; gap:8px; flex:1; min-width:0;">
          ${planoTerminadoHtml}
          <span class="item-title-text">${escHtml(item.title)}</span>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px; margin-left:12px;">
          ${metaHtml}
          <div class="item-actions-row only-editable">
            <button class="btn btn-ghost" title="Editar" onclick="startEdit('${item.id}')"><i class="ti ti-pencil" style="font-size:13px"></i></button>
            <button class="btn btn-danger-ghost" title="Eliminar" onclick="removeItem('${naveId}','${item.id}')"><i class="ti ti-trash" style="font-size:13px"></i></button>
          </div>
        </div>
      </div>
      <div class="item-desc-text">${escHtml(item.desc)}</div>
      <div class="item-footer">
        ${procesoHtml}
        ${starIndicatorHtml}
      </div>
    </div>
  </div>`;
}

function renderNave(nave, index, total){
  const errores=nave.items.filter(i=>i.type==='error');
  const ajustes=nave.items.filter(i=>i.type==='ajuste');
  const mejoras=nave.items.filter(i=>i.type==='mejora');
  
  const showErrores=nave.tipo==='ambos'||nave.tipo==='errores'||errores.length>0;
  const showAjustes=nave.tipo==='ambos'||nave.tipo==='errores'||ajustes.length>0;
  const showMejoras=nave.tipo==='ambos'||nave.tipo==='mejoras'||mejoras.length>0;
  
  let galleryHtml = '<div class="img-gallery">';
  nave.images.forEach((img, idx) => {
    galleryHtml += `
      <div class="img-item">
        <img src="${img}" alt="Mueble" title="Haz clic para ampliar" onclick="viewImage('${img}')" />
        <button class="del-img-btn only-editable" onclick="removeImg('${nave.id}', ${idx})" title="Eliminar imagen"><i class="ti ti-trash"></i></button>
      </div>`;
  });
  if (nave.images.length < 10) {
    const isFullWidth = nave.images.length === 0 ? 'full-width' : '';
    galleryHtml += `
      <div class="img-box ${isFullWidth} pdf-hide-empty" onclick="triggerImg('${nave.id}')">
        <i class="ti ti-photo-plus" style="font-size:20px;color:var(--color-text-secondary)"></i>
        <p>Agregar<br>(${nave.images.length}/10)</p>
      </div>`;
  }
  galleryHtml += '</div>';

  const modelsHtml=nave.models.map((m,idx)=>{
    let linkBtn = '';
    if(m.link) {
        const rawLink = escHtml(m.link.trim());
        linkBtn = `<button class="model-link-btn" title="Abrir enlace" onclick='abrirEnlaceModelo(${JSON.stringify(m.link.trim())}, event)' style="color:var(--navy); background:none; border:none; cursor:pointer; padding:0; margin-right:4px; display:flex; align-items:center;"><i class="ti ti-link"></i></button>`;
    }
    
    return `<div class="model-chip">
      ${linkBtn}
      <span>${m.name}${m.coleccion ? `<span class="model-coleccion-tag">${escHtml(m.coleccion)}</span>` : ''}</span>
      <div style="display:flex; gap:4px" class="only-editable">
        <button class="edit-model" title="Editar modelo, colección y enlace" onclick="openEditModel('${nave.id}', ${idx})"><i class="ti ti-pencil"></i></button>
        <button class="del-model" title="Quitar modelo" onclick="removeModel('${nave.id}', ${idx})"><i class="ti ti-x"></i></button>
      </div>
    </div>`;
  }).join('');
    
  const errSection=showErrores?`
    <div class="section-block">
      <div class="section-header">
        <span class="section-pill pill-error"><i class="ti ti-alert-circle" style="font-size:13px"></i> Reporte de errores</span>
        <button class="btn btn-xs btn-ghost only-editable" onclick="openAddItem('${nave.id}','error')"><i class="ti ti-plus" style="font-size:12px"></i> Agregar</button>
      </div>
      ${errores.length?errores.map(i=>renderItemCard(i,nave.id)).join(''):'<div class="empty-section">Sin errores registrados.</div>'}
    </div>`:''
  const ajuSection=showAjustes?`
    ${showErrores&&errores.length?'<div class="divider"></div>':''}
    <div class="section-block">
      <div class="section-header">
        <span class="section-pill" style="background:#fef08a; color:#854d0e; border:1px solid #fde047; padding: 4px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;"><i class="ti ti-tool" style="font-size:13px"></i> Reporte de ajustes</span>
        <button class="btn btn-xs btn-ghost only-editable" onclick="openAddItem('${nave.id}','ajuste')"><i class="ti ti-plus" style="font-size:12px"></i> Agregar</button>
      </div>
      ${ajustes.length?ajustes.map(i=>renderItemCard(i,nave.id)).join(''):'<div class="empty-section">Sin ajustes registrados.</div>'}
    </div>`:''
  const mejSection=showMejoras?`
    ${(showErrores&&errores.length)||(showAjustes&&ajustes.length)?'<div class="divider"></div>':''}
    <div class="section-block">
      <div class="section-header">
        <span class="section-pill pill-mejora"><i class="ti ti-sparkles" style="font-size:13px"></i> Reporte de mejoras</span>
        <button class="btn btn-xs btn-ghost scholarly only-editable" onclick="openAddItem('${nave.id}','mejora')"><i class="ti ti-plus" style="font-size:12px"></i> Agregar</button>
      </div>
      ${mejoras.length?mejoras.map(i=>renderItemCard(i,nave.id)).join(''):'<div class="empty-section">Sin mejoras registradas.</div>'}
    </div>`:''
  
  return `<div class="nave-card" id="nave-${nave.id}" onmouseenter="currentImgNaveId='${nave.id}'">
    <div class="nave-header">
      <div class="nave-header-left">
        <span class="nave-badge">${nave.nave}</span>
        <span class="nave-title">${nave.consola}</span>
      </div>
      <div class="nave-header-right only-editable">
        ${index > 0 ? `<button class="hbtn" onclick="moveNaveUp(${index})" title="Mover arriba"><i class="ti ti-arrow-up"></i></button>` : ''}
        ${index < total - 1 ? `<button class="hbtn" onclick="moveNaveDown(${index})" title="Mover abajo"><i class="ti ti-arrow-down"></i></button>` : ''}
        <button class="hbtn" onclick="openEditNaveHeader('${nave.id}')" title="Editar Cabecera"><i class="ti ti-pencil"></i></button>
        <button class="hbtn" onclick="openAddItem('${nave.id}','mejora')"><i class="ti ti-plus"></i> Elemento</button>
        <button class="hbtn danger" onclick="removeNave('${nave.id}')"><i class="ti ti-trash"></i></button>
      </div>
    </div>
    <div class="nave-body">
      <div class="nave-left">
        <div>
          <div class="panel-label">Modelos</div>
          <div class="models-chip-list">${modelsHtml}</div>
          <div class="add-model-row only-editable" style="position:relative;">
            <input id="addm-${nave.id}" placeholder="Nuevo código" autocomplete="off" oninput="mostrarSugerenciasAddModelo('${nave.id}')" onblur="setTimeout(()=>ocultarSugerenciasAddModelo('${nave.id}'), 150)" onkeydown="if(event.key==='Enter')addModel('${nave.id}')" />
            <button class="btn btn-xs" onclick="addModel('${nave.id}')"><i class="ti ti-plus"></i></button>
            <div class="autocomplete-list" id="addm-ac-${nave.id}"></div>
          </div>
        </div>
        <div>
          <div class="panel-label">Imágenes (Clic, o Ctrl+V para pegar)</div>
          ${galleryHtml}
        </div>
      </div>
      <div class="nave-body-right right" style="flex:1; padding:18px;">${errSection}${ajuSection}${mejSection}</div>
    </div>
  </div>`;
}

/* ---- Visor de Imagen Full Size ---- */
function viewImage(src) {
  document.getElementById('view-img-element').src = src;
  document.getElementById('modal-view-img').classList.add('open');
}

/* ---- Mover Naves Arriba/Abajo ---- */
function moveNaveUp(idx){
  if (!isEditableMode) return;
  if(idx > 0){
    const temp = data.naves[idx - 1];
    data.naves[idx - 1] = data.naves[idx];
    data.naves[idx] = temp;
    render();
  }
}
function moveNaveDown(idx){
  if (!isEditableMode) return;
  if(idx < data.naves.length - 1){
    const temp = data.naves[idx + 1];
    data.naves[idx + 1] = data.naves[idx];
    data.naves[idx] = temp;
    render();
  }
}

/* ---- Autocompletado (COMPATIBLE CON ANDROID Y PC) ---- */
function renderAutocompleteList(container, matches, onSelectAttr){
  if(!container) return;
  if(!matches.length){ container.classList.remove('open'); container.innerHTML=''; return; }
  
  container.innerHTML = matches.map(m => `
    <div class="autocomplete-item" onpointerdown="${onSelectAttr(m)}; event.preventDefault();">
      <span class="ac-codigo">${escHtml(m.codigo)}</span>
      ${m.coleccion ? `<span class="ac-coleccion">${escHtml(m.coleccion)}</span>` : ''}
    </div>`).join('');
  container.classList.add('open');
}

function mostrarSugerenciasBuscador(){
  const inp = document.getElementById('search-input');
  const cont = document.getElementById('search-autocomplete');
  const matches = buscarModelosDB(inp.value, 8);
  renderAutocompleteList(cont, matches, (m)=>`seleccionarSugerenciaBuscador('${m.codigo.replace(/'/g,"\\'")}')`);
}
function ocultarSugerenciasBuscador(){
  const cont = document.getElementById('search-autocomplete');
  if(cont){ cont.classList.remove('open'); }
}
function seleccionarSugerenciaBuscador(codigo){
  document.getElementById('search-input').value = codigo;
  ocultarSugerenciasBuscador();
  filterItems();
}

function mostrarSugerenciasAddModelo(naveId){
  const inp = document.getElementById('addm-'+naveId);
  const cont = document.getElementById('addm-ac-'+naveId);
  const matches = buscarModelosDB(inp.value, 8);
  renderAutocompleteList(cont, matches, (m)=>`seleccionarSugerenciaAddModelo('${naveId}','${m.codigo.replace(/'/g,"\\'")}')`);
}
function ocultarSugerenciasAddModelo(naveId){
  const cont = document.getElementById('addm-ac-'+naveId);
  if(cont){ cont.classList.remove('open'); }
}
function seleccionarSugerenciaAddModelo(naveId, codigo){
  const inp = document.getElementById('addm-'+naveId);
  inp.value = codigo;
  ocultarSugerenciasAddModelo(naveId);
  addModel(naveId); 
}

function mostrarSugerenciasTagModal(){
  const inp = document.getElementById('tag-input');
  const cont = document.getElementById('tag-autocomplete');
  if(!inp || !cont) return;
  const matches = buscarModelosDB(inp.value, 8);
  renderAutocompleteList(cont, matches, (m)=>`seleccionarSugerenciaTagModal('${m.codigo.replace(/'/g,"\\'")}')`);
}
function ocultarSugerenciasTagModal(){
  const cont = document.getElementById('tag-autocomplete');
  if(cont){ cont.classList.remove('open'); }
}
function seleccionarSugerenciaTagModal(codigo){
  const inp = document.getElementById('tag-input');
  if(inp) inp.value = '';
  if(codigo && !newModels.includes(codigo)){
    newModels.push(codigo);
    renderTags();
  }
  ocultarSugerenciasTagModal();
  if(inp) inp.focus();
}

function mostrarSugerenciasModeloModal(){
  const inp = document.getElementById('edit-model-name');
  const cont = document.getElementById('edit-model-autocomplete');
  const matches = buscarModelosDB(inp.value, 8);
  renderAutocompleteList(cont, matches, (m)=>`seleccionarSugerenciaModeloModal('${m.codigo.replace(/'/g,"\\'")}')`);
}
function ocultarSugerenciasModeloModal(){
  const cont = document.getElementById('edit-model-autocomplete');
  if(cont){ cont.classList.remove('open'); }
}
function seleccionarSugerenciaModeloModal(codigo){
  document.getElementById('edit-model-name').value = codigo;
  document.getElementById('edit-model-coleccion').value = coleccionParaCodigo(codigo);
  ocultarSugerenciasModeloModal();
}

/* ---- Models Management ---- */
function addModel(naveId){
  if (!isEditableMode) return;
  const inp=document.getElementById('addm-'+naveId);
  const val=inp.value.trim().toUpperCase();
  if(!val)return;
  const nave=data.naves.find(n=>n.id===naveId);
  if(nave&&!nave.models.find(m => m.name === val)){
    nave.models.push({name: val, link: '', coleccion: coleccionParaCodigo(val)});
  }
  inp.value='';
  ocultarSugerenciasAddModelo(naveId);
  render();
}
function removeModel(naveId,idx){
  if (!isEditableMode) return;
  const nave=data.naves.find(n=>n.id===naveId);
  if(nave){nave.models.splice(idx,1);render();}
}

function abrirEnlaceModelo(rawLink, event){
  if(event){ event.preventDefault(); event.stopPropagation(); }
  const link = (rawLink || '').trim();
  if(!link) return;

  const isNetworkPath = link.startsWith('\\\\') || link.toLowerCase().startsWith('file:');

  if(!isNetworkPath){
    let url = link;
    if(!/^https?:\/\//i.test(url)) url = 'http://' + url;
    window.open(url, '_blank');
    return;
  }

  const copyFallback = () => {
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(link).then(()=>{
        alert('Tu navegador no permite abrir carpetas de red automáticamente desde esta página por seguridad.\n\nLa ruta se copió al portapapeles:\n' + link + '\n\nPégala en el Explorador de Archivos (Windows) para abrirla.');
      }).catch(()=>{
        alert('Tu navegador no permite abrir carpetas de red automáticamente desde esta página por seguridad.\n\nCopia esta ruta manualmente y pégala en el Explorador de Archivos:\n\n' + link);
      });
    } else {
      alert('Tu navegador no permite abrir carpetas de red automáticamente desde esta página por seguridad.\n\nCopia esta ruta manualmente y pégala en el Explorador de Archivos:\n\n' + link);
    }
  };
  copyFallback();
}

function openEditModel(naveId, idx){
  if (!isEditableMode) return;
  const nave = data.naves.find(n => n.id === naveId);
  const model = nave.models[idx];
  document.getElementById('edit-model-nave-id').value = naveId;
  document.getElementById('edit-model-idx').value = idx;
  document.getElementById('edit-model-name').value = model.name;
  document.getElementById('edit-model-coleccion').value = model.coleccion || '';
  document.getElementById('edit-model-link').value = model.link || '';
  document.getElementById('modal-edit-model').classList.add('open');
}
function saveEditedModel(){
  if (!isEditableMode) return;
  const naveId = document.getElementById('edit-model-nave-id').value;
  const idx = parseInt(document.getElementById('edit-model-idx').value);
  const name = document.getElementById('edit-model-name').value.trim();
  const coleccion = document.getElementById('edit-model-coleccion').value.trim();
  const link = document.getElementById('edit-model-link').value.trim();
  if(!name) return;
  const nave = data.naves.find(n => n.id === naveId);
  if(nave) {
    nave.models[idx] = { name, link, coleccion };
    render();
  }
  closeModal('modal-edit-model');
}

function selectEditNaveOpt(el, val) {
  editNaveSelected = val;
  document.querySelectorAll('#edit-nave-select .select-opt').forEach(x => x.classList.remove('selected'));
  el.classList.add('selected');
}

function openEditNaveHeader(naveId) {
  if (!isEditableMode) return;
  const nave = data.naves.find(n => n.id === naveId);
  if (!nave) return;
  
  document.getElementById('edit-nave-id').value = naveId;
  document.getElementById('edit-nave-consola').value = nave.consola || '';
  
  editNaveSelected = nave.nave || '';
  document.querySelectorAll('#edit-nave-select .select-opt').forEach(el => {
      el.classList.remove('selected');
      const onclickAttr = el.getAttribute('onclick');
      if (onclickAttr) {
        const optVal = onclickAttr.match(/'([^']+)'/)[1];
        if (optVal === editNaveSelected) {
            el.classList.add('selected');
        }
      }
  });

  document.getElementById('modal-edit-nave').classList.add('open');
  setTimeout(()=>document.getElementById('edit-nave-consola').focus(),100);
}

function saveEditedNaveHeader() {
  if (!isEditableMode) return;
  const naveId = document.getElementById('edit-nave-id').value;
  const consola = document.getElementById('edit-nave-consola').value.trim().toUpperCase();
  
  if (!editNaveSelected) {
    alert("⚠️ Campo obligatorio: Debes seleccionar una Nave.");
    return;
  }
  if (!consola) {
    alert("⚠️ Campo obligatorio: Debes escribir el nombre/consola.");
    return;
  }

  const nave = data.naves.find(n => n.id === naveId);
  if (nave) {
    nave.nave = editNaveSelected;
    nave.consola = consola;
    render();
  }
  closeModal('modal-edit-nave');
}

/* ---- Image Management ---- */
function triggerImg(id){
  if (!isEditableMode) return;
  currentImgNaveId=id;
  document.getElementById('img-input').click();
}
function handleImg(e){
  if (!isEditableMode) return;
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const n=data.naves.find(x=>x.id===currentImgNaveId);
    if(n && n.images.length < 10){
      n.images.push(ev.target.result);
      render();
    }
  };
  reader.readAsDataURL(file);e.target.value='';
}
function removeImg(naveId, imgIdx){
  if (!isEditableMode) return;
  const n=data.naves.find(x=>x.id===naveId);
  if(n){n.images.splice(imgIdx, 1);render();}
}

/* ---- Pegar Imagen (Ctrl+V) ---- */
document.addEventListener('paste', function(e) {
  if (!isEditableMode) return;
  let targetId = currentImgNaveId;
  if (!targetId && data.naves.length === 1) targetId = data.naves[0].id;
  if (!targetId) return;

  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      e.preventDefault();
      const blob = items[i].getAsFile();
      const reader = new FileReader();
      reader.onload = (ev) => {
        const n = data.naves.find(x => x.id === targetId);
        if (n && n.images.length < 10) {
          n.images.push(ev.target.result);
          render();
        } else if (n && n.images.length >= 10) {
           alert("Límite de 10 imágenes alcanzado para este mueble.");
        }
      };
      reader.readAsDataURL(blob);
      break;
    }
  }
});
