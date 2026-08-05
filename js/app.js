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
    
    // Intercambiar timestamps para mantener el orden frente a futuros renderizados
    const tempTime = data.naves[idx - 1].createdAt;
    data.naves[idx - 1].createdAt = data.naves[idx].createdAt;
    data.naves[idx].createdAt = tempTime;
    
    render();
  }
}
function moveNaveDown(idx){
  if (!isEditableMode) return;
  if(idx < data.naves.length - 1){
    const temp = data.naves[idx + 1];
    data.naves[idx + 1] = data.naves[idx];
    data.naves[idx] = temp;
    
    // Intercambiar timestamps para mantener el orden frente a futuros renderizados
    const tempTime = data.naves[idx + 1].createdAt;
    data.naves[idx + 1].createdAt = data.naves[idx].createdAt;
    data.naves[idx].createdAt = tempTime;
    
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
  ocultarSugerenciasTagModal();
  if(codigo) processNewModelCode(codigo, null);
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
  processNewModelCode(val, naveId);
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

/* ---- Menú desplegable del botón Excel ---- */
function toggleExcelMenu(event){
  if(event) event.stopPropagation();
  const menu = document.getElementById('excel-menu');
  const btn = document.getElementById('excel-menu-btn');
  const willOpen = !menu.classList.contains('open');
  if(willOpen && btn){
    const rect = btn.getBoundingClientRect();
    menu.style.left = Math.round(rect.left) + 'px';
    menu.style.bottom = Math.round(window.innerHeight - rect.top + 8) + 'px';
    menu.style.top = 'auto';
  }
  menu.classList.toggle('open', willOpen);
}
document.addEventListener('click', (e)=>{
  const menu = document.getElementById('excel-menu');
  const btn = document.getElementById('excel-menu-btn');
  const clickedInsideMenu = menu && menu.contains(e.target);
  const clickedBtn = btn && btn.contains(e.target);
  if(menu && menu.classList.contains('open') && !clickedInsideMenu && !clickedBtn){
    menu.classList.remove('open');
  }
  
  const menuF = document.getElementById('fichas-menu');
  const btnF = document.getElementById('fichas-menu-btn');
  const clickedInsideF = menuF && menuF.contains(e.target);
  const clickedBtnF = btnF && btnF.contains(e.target);
  if(menuF && menuF.classList.contains('open') && !clickedInsideF && !clickedBtnF){
    menuF.classList.remove('open');
  }
});

/* ---- Exportar a Excel (.xlsx) ---- */
function exportarExcel(){
  if(typeof XLSX === 'undefined'){
    alert('No se pudo cargar la librería de Excel. Revisa tu conexión a internet e intenta de nuevo.');
    return;
  }
  const filas = [];
  
  if(data.pendientesGenerales && data.pendientesGenerales.length > 0) {
      data.pendientesGenerales.forEach(pg => {
          let dateStr = '';
          if (pg.createdAt) dateStr = new Date(pg.createdAt).toLocaleDateString('es-MX');
          filas.push({
              'FECHA': dateStr,
              'ITEM': 'PENDIENTE GENERAL',
              'ODT': '',
              'CAMBIO': pg.title + (pg.desc ? (' - ' + pg.desc) : ''),
              'ESTATUS': 'GENERAL'
          });
      });
  }

  data.naves.forEach(nave=>{
    const errores = nave.items.filter(i=>i.type==='error'||i.type==='ajuste');
    const mejoras = nave.items.filter(i=>i.type==='mejora');
    const modelos = (nave.models && nave.models.length) ? nave.models : [{name:''}];

    [...errores, ...mejoras].forEach(item=>{
      const proc = item.proceso || {};
      const cambio = item.title + (item.desc ? (' - ' + item.desc) : '');
      const estatus = proc.planoTerminado ? 'TERMINADO' : 'PENDIENTE';

      modelos.forEach(m=>{
        filas.push({
          'FECHA': item.fecha || '',
          'ITEM': m.name || '',
          'ODT': item.odt || '',
          'CAMBIO': cambio,
          'ESTATUS': estatus
        });
      });
    });
  });

  if(!filas.length){
    alert('No hay cambios registrados todavía para exportar.');
    return;
  }

  const ws = XLSX.utils.json_to_sheet(filas, {
    header: ['FECHA','ITEM','ODT','CAMBIO','ESTATUS']
  });
  ws['!cols'] = [{wch:12},{wch:16},{wch:14},{wch:60},{wch:14}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
  const fechaHoy = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `reporte_produccion_${fechaHoy}.xlsx`);
}

/* ---- Importar base de datos de modelos (.xlsx) ---- */
function triggerImportModelos(){
  document.getElementById('import-modelos-input').click();
}
function handleImportModelos(e){
  const file = e.target.files[0];
  if(!file) return;
  if(typeof XLSX === 'undefined'){
    alert('No se pudo cargar la librería de Excel. Revisa tu conexión a internet e intenta de nuevo.');
    e.target.value=''; return;
  }
  const reader = new FileReader();
  reader.onload = (ev)=>{
    try{
      const wb = XLSX.read(new Uint8Array(ev.target.result), {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
      if(!rows.length){ alert('El archivo está vacío.'); return; }

      const header = rows[0].map(h=>String(h||'').trim().toUpperCase());
      let colCodigo = header.findIndex(h=>h.includes('MODELO') || h.includes('CODIGO') || h.includes('CÓDIGO'));
      let colColeccion = header.findIndex(h=>h.includes('ACABADO') || h.includes('COLECCION') || h.includes('COLECCIÓN'));
      if(colCodigo === -1) colCodigo = 0;
      if(colColeccion === -1) colColeccion = 1;

      const nuevaLista = [];
      for(let i=1; i<rows.length; i++){
        const r = rows[i];
        if(!r || !r[colCodigo]) continue;
        nuevaLista.push({
          codigo: String(r[colCodigo]).trim().toUpperCase(),
          coleccion: r[colColeccion] ? String(r[colColeccion]).trim() : ''
        });
      }

      if(!nuevaLista.length){
        alert('No se encontraron modelos en el archivo. Verifica que tenga una columna con el código del modelo.');
        return;
      }

      setModelosDB(nuevaLista);
      modelosDBChanged = true;
      render();
      alert(`Base de datos de modelos actualizada: ${nuevaLista.length} modelos cargados.\n\nEl autocompletado ya usa esta información. Recuerda darle clic a "Guardar en GitHub" para dejarla guardada de forma permanente.`);
    }catch(err){
      console.error('Error al importar modelos:', err);
      alert('No se pudo leer el archivo. Verifica que sea un .xlsx válido.');
    }
    e.target.value='';
  };
  reader.readAsArrayBuffer(file);
}

function triggerImport() {
  if (!isEditableMode) return;
  document.getElementById('import-input').click();
}
function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const content = ev.target.result;
    try {
      const match = content.match(/data\s*=\s*(\{[\s\S]*?\});/);
      if (match && match[1]) {
        const importedData = JSON.parse(match[1]);
        mergeData(importedData);
        render();
        alert("✔️ Datos importados y combinados exitosamente.");
      } else {
        alert("No se encontró información compatible en el archivo seleccionado.");
      }
    } catch (error) {
      console.error("Error al parsear los datos:", error);
      alert("Hubo un error al leer el archivo.");
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}
function mergeData(importedData) {
  if (!importedData) return;

  if (importedData.pendientesGenerales) {
      importedData.pendientesGenerales.forEach(impPg => {
          let existingPg = data.pendientesGenerales.find(p => p.id === impPg.id);
          if (!existingPg) {
              data.pendientesGenerales.push(impPg);
          } else {
              existingPg.title = impPg.title;
              existingPg.desc = impPg.desc;
          }
      });
  }

  if (importedData.fichasTecnicas) {
    if(!data.fichasTecnicas) data.fichasTecnicas = [];
    importedData.fichasTecnicas.forEach(impFicha => {
        let existingFicha = data.fichasTecnicas.find(f => f.id === impFicha.id);
        if (!existingFicha) {
            data.fichasTecnicas.push(impFicha);
        } else {
            existingFicha.name = impFicha.name;
            existingFicha.content = impFicha.content;
        }
    });
  }

  if (importedData.naves) {
    importedData.naves.forEach(impNave => {
      let existingNave = data.naves.find(n => n.id === impNave.id);

      if (!existingNave) {
        impNave.items.forEach(item => {
           if(!item.proceso) item.proceso = { habilitado: false, planos: false, etiquetas: false };
           if(!item.adjuntos) item.adjuntos = ["","","","",""];
        });
        data.naves.push(impNave);
      } else {
        if (impNave.models) {
          impNave.models.forEach(impModel => {
            const modelName = typeof impModel === 'string' ? impModel : impModel.name;
            const link = typeof impModel === 'string' ? '' : (impModel.link || '');
            if (!existingNave.models.find(m => m.name === modelName)) {
              existingNave.models.push({ name: modelName, link: link });
            }
          });
        }

        if (impNave.images) {
          impNave.images.forEach(impImg => {
            if (!existingNave.images.includes(impImg) && existingNave.images.length < 10) {
              existingNave.images.push(impImg);
            }
          });
        }

        if (impNave.items) {
          impNave.items.forEach(impItem => {
            let existingItem = existingNave.items.find(i => i.id === impItem.id);
            if (!existingItem) {
              if(!impItem.proceso) impItem.proceso = { habilitado: false, planos: false, etiquetas: false };
              if(!impItem.adjuntos) impItem.adjuntos = ["","","","",""];
              existingNave.items.push(impItem);
            } else {
              existingItem.title = existingItem.title || impItem.title;
              existingItem.desc = existingItem.desc || impItem.desc;
              
              existingItem.fecha = existingItem.fecha || impItem.fecha || '';
              existingItem.odt = existingItem.odt || impItem.odt || '';
              existingItem.createdAt = existingItem.createdAt || impItem.createdAt || Date.now();
              
              if (!existingItem.proceso) {
                existingItem.proceso = impItem.proceso || { habilitado: false, planos: false, etiquetas: false };
              }
              existingItem.adjuntos = existingItem.adjuntos || impItem.adjuntos || ["","","","",""];
            }
          });
        }
      }
    });
  }
}

/* ---- Edit item inline ---- */
function startEdit(itemId){
  if (!isEditableMode) return;
  editingItemId=itemId;
  render();
}
function cancelEdit(){
  editingItemId=null;
  render();
}
function saveEdit(naveId,itemId){
  if (!isEditableMode) return;
  const t=document.getElementById('et-'+itemId).value.trim();
  const d=document.getElementById('ed-'+itemId).value.trim();
  const f=document.getElementById('ef-'+itemId).value.trim();
  const o=document.getElementById('eo-'+itemId).value.trim();
  const c=document.getElementById('ec-'+itemId).value;
  const sc=document.getElementById('esc-'+itemId).value;
  
  if(!t)return;
  const nave=data.naves.find(n=>n.id===naveId);
  if(nave){
    const item=nave.items.find(i=>i.id===itemId);
    if(item){
      item.title=t;
      item.desc=d;
      item.fecha=f;
      item.odt=o;
      item.type=c;
      item.subType=sc;
      if(nave.tipo === 'errores' && c === 'mejora') nave.tipo = 'ambos';
      if(nave.tipo === 'mejoras' && (c === 'error' || c === 'ajuste')) nave.tipo = 'ambos';
    }
  }
  editingItemId=null;render();
}

/* ---- Add item modal ---- */
function openAddItem(naveId,defaultCat){
  if (!isEditableMode) return;
  currentNaveId=naveId;
  document.getElementById('new-item-title').value='';
  document.getElementById('new-item-desc').value='';
  document.getElementById('new-item-odt').value='';
  
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  document.getElementById('new-item-fecha').value = `${yyyy}-${mm}-${dd}`;

  newCat=defaultCat||'mejora';
  
  document.querySelectorAll('#cat-select .radio-opt').forEach(el=>{
    const isMatch = el.querySelector('input').value === newCat;
    el.classList.toggle('selected', isMatch);
    if(isMatch) el.querySelector('input').checked = true;
  });
  
  updateSubCatDropdown(newCat, 'new-item-subcat');
  
  document.getElementById('modal-item').classList.add('open');
}
function selectCat(el,val){
  newCat=val;
  document.querySelectorAll('#cat-select .radio-opt').forEach(x=>x.classList.remove('selected'));
  el.classList.add('selected');
}
function saveItem(){
  if (!isEditableMode) return;
  const title=document.getElementById('new-item-title').value.trim();
  const desc=document.getElementById('new-item-desc').value.trim();
  const fecha=document.getElementById('new-item-fecha').value.trim();
  const odt=document.getElementById('new-item-odt').value.trim();
  const subType=document.getElementById('new-item-subcat').value;
  
  if(!title){document.getElementById('new-item-title').focus();return;}
  const nave=data.naves.find(n=>n.id===currentNaveId);
  if(nave){
    nave.items.unshift({
      id:uid(),
      type:newCat,
      title,
      desc,
      fecha,
      odt,
      subType,
      createdAt: Date.now(), 
      proceso: { habilitado: false, planos: false, etiquetas: false, planoTerminado: false },
      adjuntos: ["","","","",""]
    });
    if(nave.tipo === 'errores' && newCat === 'mejora') nave.tipo = 'ambos';
    if(nave.tipo === 'mejoras' && (newCat === 'error' || newCat === 'ajuste')) nave.tipo = 'ambos';
  }
  closeModal('modal-item');render();
}

function removeNave(id){
  if (!isEditableMode) return;
  if(!confirm('¿Eliminar este mueble?'))return;
  data.naves=data.naves.filter(n=>n.id!==id);
  render();
}
function removeItem(naveId,itemId){
  if (!isEditableMode) return;
  const nave=data.naves.find(n=>n.id===naveId);
  if(nave){nave.items=nave.items.filter(i=>i.id!==itemId);render();}
}

function openAddNave(){
  if (!isEditableMode) return;
  newModels=[];
  newNaveSelected=''; 
  newTipo='ambos';
  document.getElementById('new-consola').value='';
  document.getElementById('tag-input').value='';
  renderTags();
  document.querySelectorAll('#nave-select .select-opt').forEach(el=>el.classList.remove('selected'));
  document.querySelectorAll('#tipo-select .radio-opt').forEach(el=>el.classList.toggle('selected',el.querySelector('input').value==='ambos'));
  document.getElementById('modal-nave').classList.add('open');
  setTimeout(()=>document.getElementById('new-consola').focus(),100);
}
function selectNave(el,val){
  newNaveSelected=val;
  document.querySelectorAll('#nave-select .select-opt').forEach(x=>x.classList.remove('selected'));
  el.classList.add('selected');
}
function selectTipo(el,val){
  newTipo=val;
  document.querySelectorAll('#tipo-select .radio-opt').forEach(x=>x.classList.remove('selected'));
  el.classList.add('selected');
}
function renderTags(){
  const area=document.getElementById('tag-area');
  const inp=document.getElementById('tag-input');
  area.innerHTML='';
  newModels.forEach((m,i)=>{
    const tag=document.createElement('div');tag.className='model-tag';
    tag.innerHTML=`${m}<button onclick="removeTag(${i})" title="Quitar" class="only-editable"><i class="ti ti-x"></i></button>`;
    area.appendChild(tag);
  });
  area.appendChild(inp);
}
function removeTag(i){
  if (!isEditableMode) return;
  newModels.splice(i,1);renderTags();
}
function handleTagKey(e){
  if (!isEditableMode) return;
  const inp=e.target;
  if(e.key==='Enter'||e.key===','||e.key==='Tab'){
    e.preventDefault();
    const val=inp.value.trim().replace(/,$/,'').toUpperCase();
    if(val) processNewModelCode(val, null);
  } else if(e.key==='Backspace'&&!inp.value&&newModels.length){
    newModels.pop();renderTags();
    ocultarSugerenciasTagModal();
  }
}
function handleTagInput(e){
  if (!isEditableMode) return;
  const val=e.target.value;
  if(val.includes(',')){
    const parts=val.split(',');
    parts.slice(0,-1).forEach(p=>{
        const v=p.trim().toUpperCase();
        if(v) processNewModelCode(v, null);
    });
    e.target.value=parts[parts.length-1];
  }
  mostrarSugerenciasTagModal();
}
function addNave(){
  if (!isEditableMode) return;
  
  if (!newNaveSelected) {
    alert("⚠️ Campo obligatorio: Debes seleccionar una Nave (Nave 4, Nave 2 o Tapicería).");
    return;
  }
  
  const consola=document.getElementById('new-consola').value.trim().toUpperCase();
  const tagVal=document.getElementById('tag-input').value.trim().toUpperCase();
  if(tagVal&&!newModels.includes(tagVal))newModels.push(tagVal);
  if(!consola){document.getElementById('new-consola').focus();return;}
  const modelObjects = newModels.map(m => ({name: m, link: ''}));
  data.naves.unshift({id:uid(),nave:newNaveSelected,consola,tipo:newTipo,models:modelObjects,images:[],items:[], createdAt: Date.now()});
  closeModal('modal-nave');render();
}

/* ---- Exportar Archivos ---- */
async function downloadWithDialog(content, fileName, type) {
  try {
    if (window.showSaveFilePicker) {
      if (!fileHandle || type !== 'html') {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: type === 'html' ? 'Proyecto HTML Editable' : 'Documento PDF Final',
            accept: type === 'html' ? {'text/html': ['.html']} : {'application/pdf': ['.pdf']},
          }],
        });
        if (type === 'html') fileHandle = handle;
        else {
           const writable = await handle.createWritable();
           await writable.write(content);
           await writable.close();
           return;
        }
      }
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      alert("✅ Archivo HTML guardado y actualizado correctamente.");
    } else {
      const blob = content instanceof Blob ? content : new Blob([content], {type: type === 'html' ? 'text/html' : 'application/pdf'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    console.log('Descarga cancelada o fallida:', err);
  }
}

function openExport(type){
  exportType=type;
  
  document.getElementById('export-modal-title').textContent=type==='pdf'?'Exportar PDF (Final)':'Descargar Repositorio (ZIP)';
  document.getElementById('export-filename').value='respaldo_produccion';
  document.getElementById('export-hint').textContent=type==='pdf'
    ?'Se guardará un documento PDF idéntico a la vista actual. Podrás elegir la carpeta.'
    :'Se descargará un archivo comprimido (.zip) con todo tu proyecto, código, estilos, bases de datos y archivos para un respaldo total.';
    
  document.getElementById('export-btn').textContent=type==='pdf'?'Exportar PDF':'Descargar ZIP';
  document.getElementById('modal-export').classList.add('open');
}

function doExport(skipModal = false){
  const name=(document.getElementById('export-filename').value.trim()||'reporte_produccion').replace(/[^a-z0-9_\-]/gi,'_');
  if(!skipModal) closeModal('modal-export');
  
  if(exportType==='zip') exportProjectZip(name);
  else exportPDFStatic(name);
}

/* ---- Exportar PDF Idéntico a la Interfaz ---- */
function exportPDFStatic(name) {
  const btn = document.getElementById('export-btn');
  btn.textContent = 'Generando PDF...';
  
  const currentScroll = window.scrollY;
  window.scrollTo(0, 0); 
  
  if (editingItemId && currentNaveId) {
    saveEdit(currentNaveId, editingItemId);
  } else if (editingItemId) {
    cancelEdit();
  }

  const prevSearch = document.getElementById('search-input').value;
  const prevStatus = filterStatus;
  const prevNave = filterNave;
  
  document.getElementById('search-input').value = '';
  filterStatus = 'all';
  filterNave = 'all';
  filterItems(); 

  setTimeout(() => {
    document.body.classList.add('exporting-pdf');
    
    const style = document.createElement('style');
    style.id = 'pdf-temp-style';
    style.innerHTML = `
      .exporting-pdf { background: #fff !important; }
      .exporting-pdf .only-editable,
      .exporting-pdf .search-bar-row,
      .exporting-pdf .filter-row,
      .exporting-pdf #btn-lock-toggle,
      .exporting-pdf .btn-bell,
      .exporting-pdf .pdf-hide-empty,
      .exporting-pdf .item-star-toggle,
      .exporting-pdf .model-link-btn,
      .exporting-pdf .add-model-row,
      .exporting-pdf .bottom-toolbar,
      .exporting-pdf .scroll-top-btn {
        display: none !important;
      }
      .exporting-pdf .app {
        padding: 0 10px !important;
        margin: 0 !important;
        max-width: 100% !important;
        background: #fff !important;
      }
      .exporting-pdf .top-bar {
        position: static !important;
        box-shadow: none !important;
        border: none !important;
        border-bottom: 2px solid var(--color-border-tertiary) !important;
        border-radius: 0 !important;
        padding: 0 0 15px 0 !important;
        margin-bottom: 20px !important;
        background: #fff !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
      .exporting-pdf .nave-card {
        box-shadow: none !important;
        border: 1px solid var(--color-border-tertiary) !important;
        margin-bottom: 20px !important;
        break-inside: auto !important;
        page-break-inside: auto !important;
      }
      .exporting-pdf .nave-body {
        display: flex !important;
        align-items: flex-start !important;
      }
      .exporting-pdf .nave-left {
        width: 230px !important;
        flex-shrink: 0 !important;
      }
      .exporting-pdf .nave-body-right {
        flex: 1 !important;
        min-width: 0 !important;
      }
      .exporting-pdf .nave-header,
      .exporting-pdf .item-card,
      .exporting-pdf .section-header {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }
      .exporting-pdf .pg-panel {
        display: block !important;
        max-height: none !important;
        overflow: visible !important;
        border: none !important;
        box-shadow: none !important;
      }
      .exporting-pdf .pg-header i { display: none !important; }
      .exporting-pdf * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    `;
    document.head.appendChild(style);

    const element = document.querySelector('.app');

    const opt = {
      margin:       [10, 10, 10, 10],
      filename:     name + '.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, letterRendering: true, scrollY: 0 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak:    { mode: ['css', 'legacy'], avoid: ['.nave-header', '.item-card', '.section-header', '.img-item'] }
    };

    html2pdf().set(opt).from(element).output('blob').then(async (blob) => {
      btn.textContent = 'Exportar PDF Final';
      await downloadWithDialog(blob, name + '.pdf', 'pdf');
    }).catch(err => {
      console.error("Error al exportar PDF:", err);
      btn.textContent = 'Exportar PDF Final';
    }).finally(() => {
      document.body.classList.remove('exporting-pdf');
      const tempStyle = document.getElementById('pdf-temp-style');
      if(tempStyle) tempStyle.remove();
      
      document.getElementById('search-input').value = prevSearch;
      filterStatus = prevStatus;
      filterNave = prevNave;
      
      document.querySelectorAll('.status-filter').forEach(b => b.classList.remove('active'));
      const oldStatusBtn = document.querySelector(`.status-filter[onclick="setFilterStatus('${prevStatus}', this)"]`);
      if(oldStatusBtn) oldStatusBtn.classList.add('active');
      
      document.querySelectorAll('.nave-filter').forEach(b => b.classList.remove('active'));
      const oldNaveBtn = document.querySelector(`.nave-filter[onclick="setFilterNave('${prevNave}', this)"]`);
      if(oldNaveBtn) oldNaveBtn.classList.add('active');

      filterItems();
      window.scrollTo(0, currentScroll);
    });
  }, 500); 
}

/* ---- Guardar en GitHub ---- */
const GH_CONFIG_KEY = 'reporte_produccion_gh_config';

function loadGithubConfig() {
  try {
    const raw = localStorage.getItem(GH_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function openGithubModal() {
  const cfg = loadGithubConfig();
  document.getElementById('gh-repo').value = cfg && cfg.repo ? cfg.repo : '';
  document.getElementById('gh-path').value = cfg && cfg.path ? cfg.path : '';
  document.getElementById('gh-branch').value = cfg && cfg.branch ? cfg.branch : 'main';
  document.getElementById('gh-token').value = cfg && cfg.token ? cfg.token : '';
  document.getElementById('gh-remember').checked = cfg ? true : true;
  const status = document.getElementById('gh-status');
  status.style.display = 'none';
  status.textContent = '';
  document.getElementById('modal-github').classList.add('open');
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function setGithubStatus(msg, type) {
  const status = document.getElementById('gh-status');
  status.style.display = 'block';
  status.style.color = type === 'error' ? 'var(--red)' : (type === 'ok' ? 'var(--green)' : 'var(--color-text-secondary)');
  status.textContent = msg;
}

function normalizeRepoInput(raw) {
  let v = raw.trim().replace(/\/+$/, '');
  let m = v.match(/^https?:\/\/(?:www\.)?github\.com\/([^\/]+)\/([^\/]+)/i);
  if (m) return `${m[1]}/${m[2].replace(/\.git$/i, '')}`;
  m = v.match(/^https?:\/\/([^.\/]+)\.github\.io\/([^\/]+)/i);
  if (m) return `${m[1]}/${m[2]}`;
  m = v.match(/^https?:\/\/([^.\/]+)\.github\.io\/?$/i);
  if (m) return `${m[1]}/${m[1]}.github.io`;
  return v.replace(/^\/+/, '');
}

function githubApiUrl(repo, repoPath) {
  return `https://api.github.com/repos/${repo}/contents/${repoPath.split('/').map(encodeURIComponent).join('/')}`;
}

async function putFileToGithub(repo, repoPath, branch, headers, contentBase64, message) {
  const apiUrl = githubApiUrl(repo, repoPath);
  let sha = undefined;
  const getResp = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, { headers });
  if (getResp.status === 200) {
    const info = await getResp.json();
    sha = info.sha;
  } else if (getResp.status !== 404) {
    const errBody = await getResp.json().catch(() => ({}));
    throw new Error(`No se pudo consultar ${repoPath} (${getResp.status}): ${errBody.message || 'error desconocido'}`);
  }
  const putResp = await fetch(apiUrl, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: contentBase64,
      branch: branch,
      ...(sha ? { sha } : {})
    })
  });
  if (!putResp.ok) {
    const errBody = await putResp.json().catch(() => ({}));
    throw new Error(`GitHub respondió ${putResp.status} al guardar ${repoPath}: ${errBody.message || 'error desconocido'}`);
  }
}

function extFromDataUri(uri) {
  const m = uri.match(/^data:image\/(\w+);base64,/);
  if (!m) return 'jpg';
  const fmt = m[1].toLowerCase();
  return fmt === 'jpeg' ? 'jpg' : fmt;
}

async function pushToGithub() {
  const repo = normalizeRepoInput(document.getElementById('gh-repo').value);
  document.getElementById('gh-repo').value = repo;
  const path = document.getElementById('gh-path').value.trim().replace(/^\/+/, '');
  const branch = document.getElementById('gh-branch').value.trim() || 'main';
  const token = document.getElementById('gh-token').value.trim();
  const remember = document.getElementById('gh-remember').checked;

  if (!repo || !path || !token) {
    setGithubStatus('Completa repositorio, ruta del archivo y token.', 'error');
    return;
  }
  if (!/^[^\/\s]+\/[^\/\s]+$/.test(repo)) {
    setGithubStatus('El repositorio debe tener el formato usuario/repositorio.', 'error');
    return;
  }

  if (remember) {
    localStorage.setItem(GH_CONFIG_KEY, JSON.stringify({ repo, path, branch, token }));
  } else {
    localStorage.removeItem(GH_CONFIG_KEY);
  }

  const btn = document.getElementById('gh-save-btn');
  const mainBtn = document.getElementById('main-gh-btn');
  const originalHtml = btn.innerHTML;
  const originalMainHtml = mainBtn ? mainBtn.innerHTML : '';
  btn.innerHTML = 'Subiendo...';
  btn.disabled = true;
  if(mainBtn) { mainBtn.innerHTML = '<i class="ti ti-loader"></i> Subiendo...'; mainBtn.disabled = true; }
  setGithubStatus('Conectando con GitHub...', 'info');

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json'
  };

  const baseDir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
  const dataRepoPath = baseDir + 'data/cambios.json';
  const imagesRepoPrefix = baseDir + 'data/images/';

  try {
    let nuevasImagenes = 0;
    
    for (const nave of data.naves) {
      if (Array.isArray(nave.images)) {
        for (let i = 0; i < nave.images.length; i++) {
          const img = nave.images[i];
          if (typeof img === 'string' && img.startsWith('data:image')) {
            const ext = extFromDataUri(img);
            const fileName = `${nave.id}_${uid()}.${ext}`;
            const b64 = img.split(',', 2)[1];
            setGithubStatus(`Subiendo imagen general ${nuevasImagenes + 1}...`, 'info');
            await putFileToGithub(
              repo, imagesRepoPrefix + fileName, branch, headers, b64,
              `Nueva imagen de mueble (${new Date().toLocaleString('es-MX')})`
            );
            nave.images[i] = 'data/images/' + fileName;
            nuevasImagenes++;
          }
        }
      }
      
      if (Array.isArray(nave.items)) {
        for (const item of nave.items) {
          if (Array.isArray(item.adjuntos)) {
            for (let j = 0; j < item.adjuntos.length; j++) {
              const adj = item.adjuntos[j];
              if (typeof adj === 'string' && adj.startsWith('data:image')) {
                const ext = extFromDataUri(adj);
                const fileName = `adj_${item.id}_${uid()}.${ext}`;
                const b64 = adj.split(',', 2)[1];
                setGithubStatus(`Subiendo imagen de reporte ${nuevasImagenes + 1}...`, 'info');
                await putFileToGithub(
                  repo, imagesRepoPrefix + fileName, branch, headers, b64,
                  `Nueva imagen de reporte (${new Date().toLocaleString('es-MX')})`
                );
                item.adjuntos[j] = 'data/images/' + fileName;
                nuevasImagenes++;
              }
            }
          }
        }
      }
    }

    
    if (Array.isArray(data.fichasTecnicas)) {
      for (let i = 0; i < data.fichasTecnicas.length; i++) {
        const f = data.fichasTecnicas[i];
        if (f.content && f.content.startsWith('data:')) {
          let ext = 'pdf';
          if (f.content.includes('image/jpeg')) ext = 'jpg';
          else if (f.content.includes('image/png')) ext = 'png';
          
          const fileName = `ficha_${uid()}.${ext}`;
          const b64 = f.content.split(',', 2)[1];
          setGithubStatus(`Subiendo ficha técnica ${nuevasImagenes + 1}...`, 'info');
          await putFileToGithub(
            repo, imagesRepoPrefix + fileName, branch, headers, b64,
            `Nueva ficha técnica (${f.name})`
          );
          f.content = 'data/images/' + fileName;
          nuevasImagenes++;
        }
      }
    }
    
    setGithubStatus('Guardando datos...', 'info');
    const dataString = JSON.stringify(data);
    await putFileToGithub(
      repo, dataRepoPath, branch, headers, utf8ToBase64(dataString),
      `Actualización del reporte desde la app (${new Date().toLocaleString('es-MX')})`
    );

    if(modelosDBChanged){
      setGithubStatus('Guardando base de datos de modelos...', 'info');
      const modelosRepoPath = baseDir + 'data/modelos.json';
      await putFileToGithub(
        repo, modelosRepoPath, branch, headers, utf8ToBase64(JSON.stringify(modelosDB)),
        `Actualización de base de datos de modelos (${new Date().toLocaleString('es-MX')})`
      );
      modelosDBChanged = false;
    }

    setGithubStatus(`✅ Cambios subidos correctamente a GitHub${nuevasImagenes ? ` (${nuevasImagenes} imagen(es) nueva(s))` : ''}.`, 'ok');
    render();
  } catch (err) {
    console.error('Error al subir a GitHub:', err);
    setGithubStatus('❌ ' + (err.message || 'No se pudo conectar con GitHub. Verifica el token y el repositorio.'), 'error');
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
    if(mainBtn) { mainBtn.innerHTML = originalMainHtml; mainBtn.disabled = false; }
  }
}

function buildProjectHTMLString() {
  const clone = document.documentElement.cloneNode(true);
  clone.querySelector('body').classList.add('is-locked');
  const lockBtn = clone.querySelector('#btn-lock-toggle');
  if(lockBtn) {
    lockBtn.className = 'btn btn-amber';
    lockBtn.innerHTML = '<i class="ti ti-lock"></i> MODO LECTURA 🔒';
  }

  clone.querySelector('#naves-container').innerHTML = '';
  clone.querySelectorAll('.modal-bg').forEach(m => m.classList.remove('open'));

  return '<!DOCTYPE html>\n' + clone.outerHTML;
}

function downloadBlob(content, fileName, mime){
  const blob = new Blob([content], {type: mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
}

async function exportProjectZip(name) {
  const btn = document.getElementById('export-btn');
  const originalText = btn.textContent;
  btn.textContent = 'Empaquetando ZIP...';
  
  try {
      if (typeof JSZip === 'undefined') {
          alert('La librería JSZip no está cargada. Por favor revisa tu conexión a internet.');
          return;
      }
      const zip = new JSZip();
      
      // 1. Archivo HTML actual (limpio)
      const htmlString = buildProjectHTMLString();
      zip.file("index.html", htmlString);
      
      // 2. Bases de datos JSON
      zip.folder("data").file("cambios.json", JSON.stringify(data, null, 2));
      zip.folder("data").file("modelos.json", JSON.stringify(modelosDB, null, 2));
      
      // 3. Intentar descargar archivos estáticos vitales
      const filesToFetch = [
          'js/app.js',
          'css/styles.css',
          'firebase-messaging-sw.js'
      ];
      
      for (const filePath of filesToFetch) {
          try {
              const res = await fetch(filePath);
              if (res.ok) {
                  const content = await res.blob();
                  zip.file(filePath, content);
              }
          } catch (e) {
              console.warn('No se pudo empaquetar: ' + filePath, e);
          }
      }
      
      // 4. Generar y descargar ZIP
      const content = await zip.generateAsync({ type: "blob" });
      downloadBlob(content, name + '.zip', 'application/zip');
      alert('✅ ¡Proyecto descargado exitosamente! El archivo .zip contiene todo tu código, estilos, y bases de datos.');
      
  } catch(err) {
      console.error(err);
      alert('Error al generar el archivo ZIP.');
  } finally {
      btn.textContent = originalText;
  }
}

function closeModal(id){document.getElementById(id).classList.remove('open');}

/* ---- Carga inicial de datos (data/cambios.json) ---- */
async function cargarDatosIniciales(){
  try{
    const resp = await fetch('data/cambios.json', {cache:'no-store'});
    if(!resp.ok) throw new Error('HTTP '+resp.status);
    const json = await resp.json();
    data = json;
    ensureAccessPasswords();
    render();
  }catch(err){
    console.error('No se pudo cargar data/cambios.json:', err);
    const cont = document.getElementById('naves-container');
    if(cont){
      cont.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--red,#c0392b)">
        <b>No se pudieron cargar los datos.</b><br>
        Esto es normal si abriste este archivo con doble clic desde tu computadora.<br>
        Ábrelo desde tu sitio de GitHub Pages, o desde un servidor local, para que cargue correctamente.
      </div>`;
    }
  }
  cargarModelosDB();
}

/* ---- Base de datos de modelos (data/modelos.json) ---- */
async function cargarModelosDB(){
  try{
    const resp = await fetch('data/modelos.json', {cache:'no-store'});
    if(!resp.ok) throw new Error('HTTP '+resp.status);
    const json = await resp.json();
    setModelosDB(json);
    if(data && data.naves && data.naves.length) render();
  }catch(err){
    console.warn('No se pudo cargar data/modelos.json (autocompletado de modelos deshabilitado hasta que importes uno):', err);
  }
}

function setModelosDB(lista){
  modelosDB = Array.isArray(lista) ? lista : [];
  modelosDBIndex = new Map();
  modelosDB.forEach(m=>{
    if(m && m.codigo) modelosDBIndex.set(String(m.codigo).trim().toUpperCase(), m.coleccion || '');
  });
}

function buscarModelosDB(query, limit){
  limit = limit || 8;
  const q = String(query||'').trim().toUpperCase();
  if(!q) return [];
  const startsWith = [];
  const contains = [];
  for(const m of modelosDB){
    const cod = String(m.codigo||'').toUpperCase();
    if(cod.startsWith(q)) startsWith.push(m);
    else if(cod.includes(q)) contains.push(m);
    if(startsWith.length >= limit) break;
  }
  return startsWith.concat(contains).slice(0, limit);
}

function coleccionParaCodigo(codigo){
  return modelosDBIndex.get(String(codigo||'').trim().toUpperCase()) || '';
}

// Inicializar datos y Firebase
cargarDatosIniciales();
initFirebaseMessaging();


/* ---- MÓDULO: FICHAS TÉCNICAS ---- */
function toggleFichasMenu(event) {
  if(event) event.stopPropagation();
  const menu = document.getElementById('fichas-menu');
  const btn = document.getElementById('fichas-menu-btn');
  const willOpen = !menu.classList.contains('open');
  if(willOpen && btn){
    const rect = btn.getBoundingClientRect();
    menu.style.top = Math.round(rect.bottom + 8) + 'px';
    menu.style.bottom = 'auto';
    menu.style.left = Math.round(rect.left) + 'px';
    menu.style.right = 'auto';
    
    // Ajuste dinámico para pantallas pequeñas (celulares)
    setTimeout(() => {
      const menuRect = menu.getBoundingClientRect();
      if (menuRect.right > window.innerWidth) {
        menu.style.left = 'auto';
        menu.style.right = '10px';
      }
    }, 0);
  }
  menu.classList.toggle('open', willOpen);
}

function handleFichaUpload(e) {
  if (!isEditableMode) return;
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    if (!data.fichasTecnicas) data.fichasTecnicas = [];
    data.fichasTecnicas.push({
      id: uid(),
      name: file.name,
      content: ev.target.result // Base64
    });
    renderFichas();
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

function renderFichas() {
  const list = document.getElementById('fichas-list');
  if (!list) return;
  if (!data.fichasTecnicas || data.fichasTecnicas.length === 0) {
    list.innerHTML = '<div style="padding: 12px; font-size: 12px; color: var(--color-text-secondary); text-align: center;">No hay fichas técnicas disponibles.</div>';
    return;
  }
  list.innerHTML = data.fichasTecnicas.map((f, idx) => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--color-border-tertiary); transition: background 0.2s;" onmouseover="this.style.backgroundColor='#f9fafb'" onmouseout="this.style.backgroundColor='transparent'">
      <div style="display: flex; align-items: flex-start; flex: 1; min-width: 0; padding-right: 8px;">
        <i class="ti ti-file" style="margin-top: 2px; margin-right: 6px; color: #6366F1; font-size: 14px; flex-shrink: 0;"></i>
        <span style="font-size: 12px; font-weight: 500; color: var(--color-text-primary); word-break: break-word; line-height: 1.4;">${escHtml(f.name)}</span>
      </div>
      <div style="display: flex; gap: 6px; flex-shrink: 0;">
        <button class="btn btn-xs btn-green" onclick="downloadFicha(${idx})" title="Descargar" style="padding: 4px 8px;"><i class="ti ti-download"></i></button>
        <button class="btn btn-xs btn-danger-ghost only-editable" onclick="deleteFicha(${idx})" style="${isEditableMode ? '' : 'display:none;'}; padding: 4px 8px;" title="Eliminar"><i class="ti ti-trash"></i></button>
      </div>
    </div>
  `).join('');
}

function downloadFicha(idx) {
  if(!data.fichasTecnicas) return;
  const f = data.fichasTecnicas[idx];
  if(!f) return;
  
  const a = document.createElement('a');
  a.href = f.content;
  a.download = f.name;
  a.target = "_blank"; 
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function deleteFicha(idx) {
  if (!isEditableMode) return;
  if (!confirm('¿Eliminar esta ficha técnica?')) return;
  data.fichasTecnicas.splice(idx, 1);
  renderFichas();
}

/* ---- RECORDATORIO DE PENDIENTES (CADA 2 HORAS) ---- */
function checkAndSendPendingReminders() {
  // Solo continuar si tenemos permisos de notificación
  if (Notification.permission !== 'granted') return;

  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();

  // Condición: Lunes (1) a Viernes (5)
  if (day === 0 || day === 6) return;
  // Condición: 7:00 a.m. a 8:00 p.m. (7 a 19 hrs)
  if (hour < 7 || hour >= 20) return;

  // Verificar si hay elementos pendientes
  let hasPendientes = false;
  
  // 1. Revisar Pendientes Generales
  if (data.pendientesGenerales && data.pendientesGenerales.length > 0) {
    hasPendientes = true;
  }
  
  // 2. Revisar muebles con registros NO terminados
  if (!hasPendientes && data.naves) {
    for (const nave of data.naves) {
      if (nave.items && nave.items.some(item => !item.proceso?.planoTerminado)) {
        hasPendientes = true;
        break;
      }
    }
  }

  // Si no hay nada pendiente, no hacemos nada
  if (!hasPendientes) return;

  // Verificar si ya pasaron 2 horas desde la última notificación
  const lastSentStr = localStorage.getItem('lastPendingReminder');
  const lastSent = lastSentStr ? parseInt(lastSentStr, 10) : 0;
  const timeSinceLast = now.getTime() - lastSent;
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

  if (timeSinceLast >= TWO_HOURS_MS) {
    new Notification('Tienes pendientes por revisar y completar.', {
      body: 'Hay tareas activas en Producción que requieren tu atención.',
      icon: 'https://cdn-icons-png.flaticon.com/512/2558/2558944.png',
      badge: 'https://cdn-icons-png.flaticon.com/512/2558/2558944.png',
      vibrate: [200, 100, 200]
    });
    
    // Guardar la hora del envío
    localStorage.setItem('lastPendingReminder', now.getTime().toString());
  }
}

// Revisar cada 5 minutos si es momento de enviar el recordatorio
setInterval(checkAndSendPendingReminders, 5 * 60 * 1000);
// Revisar también 5 segundos después de abrir la aplicación
setTimeout(checkAndSendPendingReminders, 5000);

/* ---- MÓDULO DASHBOARD Y ESTADÍSTICAS ---- */

// Utilidad para cambiar las opciones del submenú
function updateSubCatDropdown(type, selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '';
  let opts = [];
  if (type === 'error') opts = ['ERROR EN PLANO', 'ERROR EN PIEZA', 'ERROR EN ENSAMBLE'];
  else if (type === 'ajuste') opts = ['AJUSTE EN PLANO', 'AJUSTE EN PIEZA', 'AJUSTE EN ENSAMBLE'];
  else if (type === 'mejora') opts = ['MEJORA DE INGENIERÍA', 'APROVECHAMIENTO DE MATERIAL'];
  
  opts.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o; opt.textContent = o;
    sel.appendChild(opt);
  });
}

// Para que cuando se abra la edición inline por primera vez, se llenen las opciones correctamente si están vacías
document.addEventListener('click', function(e) {
  if (e.target.closest('.btn-ghost[title="Editar"]')) {
      setTimeout(() => {
          document.querySelectorAll('select[id^="ec-"]').forEach(sel => {
              const id = sel.id.replace('ec-', 'esc-');
              const currentVal = document.getElementById(id).value;
              updateSubCatDropdown(sel.value, id);
              // Restaurar valor previo si es válido
              const opts = Array.from(document.getElementById(id).options).map(o=>o.value);
              if(opts.includes(currentVal)) document.getElementById(id).value = currentVal;
          });
      }, 50);
  }
});


let chartTipo, chartClasif, chartImpacto;
let dashFilters = { tipo: null, clasificacion: null, impacto: null };

function openDashboard() {
  document.getElementById('modal-dashboard').classList.add('open');
  setTimeout(renderDashboard, 200);
}

function clearDashFilter(field) {
  dashFilters[field] = null;
  if(field === 'tipo') dashFilters.clasificacion = null; // cascade
  renderDashboard();
}

function updateFilterBadges() {
  const bTipo = document.getElementById('filter-badge-tipo');
  const bClasif = document.getElementById('filter-badge-clasif');
  const bImpacto = document.getElementById('filter-badge-impacto');
  
  if(dashFilters.tipo) { bTipo.style.display = 'inline-block'; bTipo.innerHTML = dashFilters.tipo + ' &times;'; }
  else bTipo.style.display = 'none';
  
  if(dashFilters.clasificacion) { bClasif.style.display = 'inline-block'; bClasif.innerHTML = dashFilters.clasificacion + ' &times;'; }
  else bClasif.style.display = 'none';
  
  if(dashFilters.impacto) { bImpacto.style.display = 'inline-block'; bImpacto.innerHTML = dashFilters.impacto + ' &times;'; }
  else bImpacto.style.display = 'none';
}

function renderDashboard() {
  if (!window.echarts) {
      alert("Cargando librerías de gráficos, intenta de nuevo en un segundo...");
      return;
  }
  
  updateFilterBadges();

  if(!chartTipo) {
      chartTipo = echarts.init(document.getElementById('chart-tipo'));
      chartTipo.on('click', function(params) {
          dashFilters.tipo = params.name;
          dashFilters.clasificacion = null;
          renderDashboard();
      });
  }
  if(!chartClasif) {
      chartClasif = echarts.init(document.getElementById('chart-clasificacion'));
      chartClasif.on('click', function(params) {
          dashFilters.clasificacion = params.name;
          renderDashboard();
      });
  }
  if(!chartImpacto) {
      chartImpacto = echarts.init(document.getElementById('chart-impacto'));
      chartImpacto.on('click', function(params) {
          dashFilters.impacto = params.name; // Ej: "Planos: ✔️"
          renderDashboard();
      });
  }

  // Recolectar datos
  let tError=0, tAjuste=0, tMejora=0;
  let clasifCounts = {};
  let impactoCounts = {
      'Planos: ✔️':0, 'Planos: ✖️':0,
      'Habilitado: ✔️':0, 'Habilitado: ✖️':0,
      'Etiquetas: ✔️':0, 'Etiquetas: ✖️':0
  };
  
  let relatedItems = [];

  data.naves.forEach(nave => {
      nave.items.forEach(item => {
          let typeMatch = !dashFilters.tipo || 
                          (dashFilters.tipo === 'Errores' && item.type === 'error') ||
                          (dashFilters.tipo === 'Ajustes' && item.type === 'ajuste') ||
                          (dashFilters.tipo === 'Mejoras' && item.type === 'mejora');
                          
          let classMatch = !dashFilters.clasificacion || (item.subType === dashFilters.clasificacion);
          
          let proc = item.proceso || {planos:false, habilitado:false, etiquetas:false};
          let pVal = proc.planos ? 'Planos: ✔️' : 'Planos: ✖️';
          let hVal = proc.habilitado ? 'Habilitado: ✔️' : 'Habilitado: ✖️';
          let eVal = proc.etiquetas ? 'Etiquetas: ✔️' : 'Etiquetas: ✖️';
          
          let impMatch = !dashFilters.impacto || (pVal===dashFilters.impacto || hVal===dashFilters.impacto || eVal===dashFilters.impacto);

          if (typeMatch && classMatch && impMatch) {
              relatedItems.push({nave, item});
              
              if(item.type==='error') tError++;
              if(item.type==='ajuste') tAjuste++;
              if(item.type==='mejora') tMejora++;
              
              const sc = item.subType || 'Sin clasificar';
              clasifCounts[sc] = (clasifCounts[sc] || 0) + 1;
              
              impactoCounts[pVal]++;
              impactoCounts[hVal]++;
              impactoCounts[eVal]++;
          }
      });
  });

  // Chart 1
  chartTipo.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: ['Errores', 'Ajustes', 'Mejoras'], axisLabel: {interval: 0} },
      yAxis: { type: 'value' },
      series: [{
          data: [
              {value: tError, itemStyle: {color: '#ef4444'}}, 
              {value: tAjuste, itemStyle: {color: '#eab308'}}, 
              {value: tMejora, itemStyle: {color: '#8b5cf6'}}
          ],
          type: 'bar',
          label: { show: true, position: 'top' }
      }]
  });

  // Chart 2
  let cKeys = Object.keys(clasifCounts);
  const palette = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'];
  
  let coloredData = cKeys.map((k, i) => {
      return {
          value: clasifCounts[k],
          name: k,
          itemStyle: { color: palette[i % palette.length] }
      };
  });

  chartClasif.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: cKeys, axisLabel: { width: 120, overflow: 'break' } },
      grid: { left: '35%' },
      series: [{
          data: coloredData,
          type: 'bar',
          colorBy: 'data',
          label: { show: true, position: 'right' }
      }]
  });
  
  const legendHtml = cKeys.map((k, i) => {
      return `<div style="display:flex; align-items:center; gap:4px; font-size:10px; color:#475569;">
          <span style="width:10px; height:10px; border-radius:2px; background:${palette[i % palette.length]}"></span> ${k}
      </div>`;
  }).join('');
  const legContainer = document.getElementById('clasificacion-legend');
  if(legContainer) legContainer.innerHTML = legendHtml;

  // Chart 3
  chartImpacto.setOption({
      tooltip: { trigger: 'item' },
      series: [
          {
              name: 'Impacto',
              type: 'pie',
              radius: ['40%', '70%'],
              itemStyle: { borderRadius: 5, borderColor: '#fff', borderWidth: 2 },
              label: { show: false },
              data: [
                  {value: impactoCounts['Planos: ✔️'], name: 'Planos: ✔️', itemStyle:{color:'#34d399'}},
                  {value: impactoCounts['Planos: ✖️'], name: 'Planos: ✖️', itemStyle:{color:'#f87171'}},
                  {value: impactoCounts['Habilitado: ✔️'], name: 'Habilitado: ✔️', itemStyle:{color:'#10b981'}},
                  {value: impactoCounts['Habilitado: ✖️'], name: 'Habilitado: ✖️', itemStyle:{color:'#ef4444'}},
                  {value: impactoCounts['Etiquetas: ✔️'], name: 'Etiquetas: ✔️', itemStyle:{color:'#059669'}},
                  {value: impactoCounts['Etiquetas: ✖️'], name: 'Etiquetas: ✖️', itemStyle:{color:'#dc2626'}}
              ]
          }
      ]
  });
  
  renderDashList(relatedItems);

  const totalR = relatedItems.length;
  let conclusiones = [];
  if (totalR === 0) {
      conclusiones.push("No hay registros suficientes para generar un análisis con los filtros actuales.");
  } else {
      // Predominancia de Tipo
      let tipos = [{name: 'Errores', val: tError}, {name: 'Ajustes', val: tAjuste}, {name: 'Mejoras', val: tMejora}];
      tipos.sort((a,b) => b.val - a.val);
      if(tipos[0].val > 0) {
          conclusiones.push(`📌 <b>Tendencia principal:</b> El tipo de reporte predominante es <b>${tipos[0].name}</b>, representando el ${Math.round((tipos[0].val/totalR)*100)}% de los registros analizados.`);
      }

      // Mayor Clasificación
      if(cKeys.length > 0) {
          let maxClasif = cKeys.reduce((a, b) => clasifCounts[a] > clasifCounts[b] ? a : b);
          conclusiones.push(`📊 <b>Clasificación más frecuente:</b> La categoría con mayor incidencia es <b>${maxClasif}</b> (${clasifCounts[maxClasif]} casos). Sería recomendable enfocar acciones preventivas o de mejora en esta área.`);
      }

      // Impacto más afectado
      let maxImpacto = '';
      let maxImpactoVal = -1;
      ['Planos: ✖️', 'Habilitado: ✖️', 'Etiquetas: ✖️'].forEach(k => {
          if(impactoCounts[k] > maxImpactoVal) {
              maxImpactoVal = impactoCounts[k];
              maxImpacto = k.split(':')[0];
          }
      });
      if(maxImpactoVal > 0) {
          conclusiones.push(`⚠️ <b>Área más impactada:</b> <b>${maxImpacto}</b> es el rubro que ha requerido más modificaciones directas (${maxImpactoVal} afectaciones registradas).`);
      } else {
          conclusiones.push(`✅ <b>Impacto:</b> Hasta el momento no se han registrado afectaciones negativas graves en Planos, Habilitado o Etiquetas con los filtros actuales.`);
      }
  }
  const concContainer = document.getElementById('dash-conclusions');
  if(concContainer) concContainer.innerHTML = conclusiones.join('<br><br>');
}

function renderDashList(items) {
  const list = document.getElementById('dash-list');
  if (items.length === 0) {
      list.innerHTML = '<div style="padding:20px; text-align:center; color:#94a3b8;">No se encontraron modelos con estos filtros.</div>';
      return;
  }
  
  list.innerHTML = items.map(entry => {
      let mText = entry.nave.models.map(m => m.name).join(', ');
      return `
      <div class="dash-list-item" onclick="closeModal('modal-dashboard'); setTimeout(() => document.getElementById('ic-${entry.item.id}').scrollIntoView({behavior:'smooth', block:'center'}), 300);">
          <div style="flex:1; min-width:0;">
              <div style="font-weight:700; font-size:13px; color:var(--navy); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${mText || 'Sin modelo'}</div>
              <div style="font-size:11px; color:#64748b; margin-top:2px;">${entry.nave.consola} - ${entry.item.title}</div>
          </div>
          <div style="font-size:10px; font-weight:700; padding:4px 8px; border-radius:6px; background:${entry.item.type==='error'?'#fee2e2':entry.item.type==='ajuste'?'#fef08a':'#ede9fe'}; color:${entry.item.type==='error'?'#b91c1c':entry.item.type==='ajuste'?'#854d0e':'#6d28d9'};">
              ${(entry.item.subType || entry.item.type).toUpperCase()}
          </div>
      </div>
      `;
  }).join('');
}

async function generateStatsPDF() {
  const btn = document.querySelector('#modal-dashboard .btn-green');
  const oldTxt = btn.innerHTML;
  btn.innerHTML = '<i class="ti ti-loader"></i> Generando...';
  
  // 1. Obtener base64 de las gráficas
  const c1Img = chartTipo.getDataURL({type: 'png', pixelRatio: 2, backgroundColor: '#fff'});
  const c2Img = chartClasif.getDataURL({type: 'png', pixelRatio: 2, backgroundColor: '#fff'});
  const c3Img = chartImpacto.getDataURL({type: 'png', pixelRatio: 2, backgroundColor: '#fff'});
  
  let totalModelos = 0, totalODT = 0, totalRegistros = 0;
  let modelosRows = '';
  
  data.naves.forEach(n => {
      totalModelos += n.models.length;
      n.items.forEach(i => {
          totalRegistros++;
          if(i.odt) totalODT++;
          let mNames = n.models.map(m=>m.name).join(', ');
          modelosRows += `<tr><td>${formatDateEs(i.fecha)}</td><td>${mNames}</td><td>${i.odt||'-'}</td><td>${(i.subType||i.type).toUpperCase()}</td><td>${i.proceso?.planoTerminado?'TERMINADO':'PENDIENTE'}</td></tr>`;
      });
  });

  const now = new Date().toLocaleString('es-MX');

  const container = document.getElementById('pdf-report-container');
  container.style.display = 'block';
  const conclusionesText = document.getElementById('dash-conclusions') ? document.getElementById('dash-conclusions').innerHTML : '';
  
  container.innerHTML = `
      <div class="pdf-title">Reporte Estadístico de Producción</div>
      <div class="pdf-subtitle">Generado el ${now}</div>
      
      <div class="pdf-metrics">
          <div class="pdf-metric-box">
              <div class="pdf-metric-val">${totalRegistros}</div>
              <div class="pdf-metric-lbl">Total Registros</div>
          </div>
          <div class="pdf-metric-box">
              <div class="pdf-metric-val">${totalModelos}</div>
              <div class="pdf-metric-lbl">Modelos Afectados</div>
          </div>
          <div class="pdf-metric-box">
              <div class="pdf-metric-val">${totalODT}</div>
              <div class="pdf-metric-lbl">ODTs Procesadas</div>
          </div>
      </div>

      <div style="font-size:16px; font-weight:800; border-bottom:2px solid #cbd5e1; margin-bottom:15px; padding-bottom:5px; color:#1e293b;">Gráficas Generales</div>
      <div class="pdf-chart-row">
          <div class="pdf-chart-col">
              <div style="font-size:12px; font-weight:700; margin-bottom:10px; text-align:center;">Tipo de Reporte</div>
              <img src="${c1Img}" class="pdf-chart-img">
          </div>
          <div class="pdf-chart-col">
              <div style="font-size:12px; font-weight:700; margin-bottom:10px; text-align:center;">Impacto por Área</div>
              <img src="${c3Img}" class="pdf-chart-img">
          </div>
      </div>
      
      <div class="pdf-chart-row">
          <div class="pdf-chart-col" style="flex:1;">
              <div style="font-size:12px; font-weight:700; margin-bottom:10px; text-align:center;">Clasificación Detallada</div>
              <img src="${c2Img}" class="pdf-chart-img" style="max-height: 250px; object-fit: contain;">
          </div>
      </div>

      <div style="font-size:16px; font-weight:800; border-bottom:2px solid #cbd5e1; margin-bottom:15px; margin-top:20px; padding-bottom:5px; color:#1e293b;">Conclusiones Automáticas</div>
      <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:15px; font-size:12px; color:#1e40af; line-height:1.6; margin-bottom:20px;">
          ${conclusionesText}
      </div>

      <div style="font-size:16px; font-weight:800; border-bottom:2px solid #cbd5e1; margin-bottom:15px; margin-top:20px; padding-bottom:5px; color:#1e293b; page-break-before: always;">Detalle de Registros</div>
      <table class="pdf-table">
          <thead><tr><th>Fecha</th><th>Modelo(s)</th><th>ODT</th><th>Clasificación</th><th>Estatus</th></tr></thead>
          <tbody>${modelosRows}</tbody>
      </table>
      
      <div style="font-size:12px; color:#64748b; margin-top:40px;">* Fin del reporte. Resumen ejecutivo generado automáticamente por el Dashboard de Estadísticas.</div>
  `;

  try {
      const opt = {
        margin:       10,
        filename:     'Reporte_Estadistico.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      await html2pdf().set(opt).from(container).save();
  } catch (err) {
      console.error(err);
      alert("Hubo un error al generar el PDF.");
  } finally {
      container.style.display = 'none';
      btn.innerHTML = oldTxt;
  }
}

// Interceptar re-renders para asegurar redibujado de charts al actualizar datos (si modal está abierto)
const oldRender = render;
render = function() {
  oldRender();
  if (document.getElementById('modal-dashboard').classList.contains('open')) {
      renderDashboard();
  }
};

/* ---- LÓGICA DE VARIANTES IUP ---- */
let pendingIupContext = null;

function processNewModelCode(codigo, naveId = null) {
    codigo = codigo.trim().toUpperCase();
    if(!codigo) return;

    if (codigo.startsWith('IUP') && codigo.includes('-')) {
        const parts = codigo.split('-');
        if (parts.length >= 2) {
            const baseCode = parts.slice(0, -1).join('-');
            const variants = modelosDB.filter(m => m.codigo.startsWith(baseCode + '-')).map(m => m.codigo);

            if (variants.length > 1) {
                pendingIupContext = { originalCode: codigo, baseCode, variants, naveId };
                document.getElementById('iup-modal-desc').innerHTML = `Se encontraron <b>${variants.length} variantes</b> para la familia <b>${baseCode}</b>.<br>¿Deseas agregarlas todas juntas?`;
                document.getElementById('iup-single-code').textContent = codigo;
                document.getElementById('iup-selection-view').style.display = 'none';
                document.getElementById('iup-quick-actions').style.display = 'flex';

                const listCont = document.getElementById('iup-variants-list');
                listCont.innerHTML = variants.map(v => `
                    <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                        <input type="checkbox" value="${v}" checked class="iup-cb"> ${v}
                    </label>
                `).join('');

                document.getElementById('modal-iup').classList.add('open');
                
                if (naveId) {
                    const inp = document.getElementById('addm-'+naveId);
                    if(inp) inp.value='';
                    ocultarSugerenciasAddModelo(naveId);
                } else {
                    const inp = document.getElementById('tag-input');
                    if(inp) inp.value='';
                }
                return;
            }
        }
    }
    executeAddModel(codigo, naveId);
}

function executeAddModel(codigo, naveId) {
    if (naveId) {
        const nave = data.naves.find(n => n.id === naveId);
        if (nave && !nave.models.find(m => m.name === codigo)) {
            nave.models.push({name: codigo, link: '', coleccion: coleccionParaCodigo(codigo)});
        }
        const inp = document.getElementById('addm-'+naveId);
        if(inp) inp.value = '';
        ocultarSugerenciasAddModelo(naveId);
        render();
    } else {
        if (!newModels.includes(codigo)) {
            newModels.push(codigo);
        }
        const inp = document.getElementById('tag-input');
        if(inp) inp.value = '';
        renderTags();
        ocultarSugerenciasTagModal();
    }
}

function iupAddAll() {
    if(!pendingIupContext) return;
    pendingIupContext.variants.forEach(v => executeAddModel(v, pendingIupContext.naveId));
    closeModal('modal-iup');
}

function iupAddSingle() {
    if(!pendingIupContext) return;
    executeAddModel(pendingIupContext.originalCode, pendingIupContext.naveId);
    closeModal('modal-iup');
}

function iupToggleSelectionView() {
    document.getElementById('iup-quick-actions').style.display = 'none';
    document.getElementById('iup-selection-view').style.display = 'block';
}

function iupSelectAll(state) {
    document.querySelectorAll('.iup-cb').forEach(cb => cb.checked = state);
}

function iupAddSelected() {
    if(!pendingIupContext) return;
    const selected = Array.from(document.querySelectorAll('.iup-cb:checked')).map(cb => cb.value);
    if(selected.length === 0) {
        alert('Selecciona al menos una variante.');
        return;
    }
    selected.forEach(v => executeAddModel(v, pendingIupContext.naveId));
    closeModal('modal-iup');
}

function quickSaveGithub() {
  const cfg = loadGithubConfig();
  if (cfg && cfg.repo && cfg.path && cfg.token) {
      document.getElementById('gh-repo').value = cfg.repo;
      document.getElementById('gh-path').value = cfg.path;
      document.getElementById('gh-branch').value = cfg.branch || 'main';
      document.getElementById('gh-token').value = cfg.token;
      document.getElementById('gh-remember').checked = true;
      pushToGithub();
  } else {
      openGithubModal();
  }
}

