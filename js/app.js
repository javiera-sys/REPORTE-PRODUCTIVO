document.getElementById('current-date').textContent = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' });

// Variables Globales
let currentNaveId=null, currentImgNaveId=null, editingItemId=null, exportType=null;
let newModels=[], newNaveSelected='NAVE 2', newTipo='ambos', newCat='error';
let isEditableMode = false;

// Referencia global al archivo para guardado rápido
let fileHandle = null;

// Datos de la app (se cargan desde data/cambios.json al iniciar)
let data = { naves: [], accessPasswords: [] };

// Base de datos de modelos (código -> colección), viene de data/modelos.json
let modelosDB = [];
let modelosDBIndex = new Map(); // codigo (mayúsculas) -> coleccion
let modelosDBChanged = false; // true si se importó un xlsx nuevo en esta sesión



function uid(){return 'x'+Math.random().toString(36).slice(2,9)}

// Función super-segura para escapar HTML (ignora nulos o indefinidos)
function escHtml(s){
  if (s === null || s === undefined || s === 'undefined') return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Convierte AAAA-MM-DD a DD/MM/AAAA de forma segura
function formatDateEs(s){
  if(!s || s === 'undefined') return '';
  const p=String(s).split('-');
  return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:s;
}

/* ---- Gestión de Permisos Globales ---- */
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
  } else {
    const modal = document.querySelector('#modal-auth .modal');
    modal.classList.remove('auth-shake');
    void modal.offsetWidth;
    modal.classList.add('auth-shake');
    document.getElementById('auth-password').focus();
  }
}

/* ---- Gestión oculta de accesos ---- */
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

function toggleItemStar(naveId, itemId){
  if (!isEditableMode) return;
  const nave=data.naves.find(n=>n.id===naveId);
  if(!nave) return;
  const item=nave.items.find(i=>i.id===itemId);
  if(item){ item.marked=!item.marked; render(); }
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
  if(document.getElementById('search-input')) filterItems();
}

function dotClass(t){return t==='error'?'dot-error':t==='ajuste'?'dot-ajuste':'dot-mejora'}

/* ---- Buscador de cambios ---- */
function normalizeSearch(s){
  return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

function filterItems(){
  const rawQ = document.getElementById('search-input').value;
  const q = normalizeSearch(rawQ.trim());
  document.getElementById('search-clear-btn').style.display = rawQ ? 'flex' : 'none';

  document.querySelectorAll('.nave-card').forEach(naveCard=>{
    if(!q){
      naveCard.style.display='';
      naveCard.querySelectorAll('.item-card').forEach(ic=>{
        ic.style.display='';
        clearHighlight(ic);
      });
      return;
    }
    const badge = naveCard.querySelector('.nave-badge');
    const title = naveCard.querySelector('.nave-title');
    const modelChips = naveCard.querySelectorAll('.model-chip');
    const modelsText = normalizeSearch(Array.from(modelChips).map(el=>el.textContent).join(' '));
    const naveText = normalizeSearch((badge?badge.textContent:'') + ' ' + (title?title.textContent:'') + ' ' + modelsText);
    const naveMatches = naveText.includes(q);

    let anyItemVisible = false;
    naveCard.querySelectorAll('.item-card').forEach(itemCard=>{
      const itemText = normalizeSearch(itemCard.textContent);
      const itemMatches = naveMatches || itemText.includes(q);
      itemCard.style.display = itemMatches ? '' : 'none';
      if(itemMatches){
        anyItemVisible = true;
        applyHighlight(itemCard, rawQ.trim());
      } else {
        clearHighlight(itemCard);
      }
    });

    naveCard.style.display = (naveMatches || anyItemVisible) ? '' : 'none';
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

/* ---- Botón flotante inteligente de Scroll ---- */
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
  
  // Extraemos la fecha y el ODT de forma robusta
  let safeFecha = item.fecha && item.fecha !== 'undefined' ? item.fecha : '';
  let safeOdt = item.odt && item.odt !== 'undefined' ? item.odt : '';
  
  if(editing && isEditableMode){
    
    // Si editamos un registro viejo que no tiene fecha, sugerir la de hoy automáticamente
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
  const proc = item.proceso;

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
    </div>
  `;

  const planoTerminadoHtml = proc.planoTerminado
    ? `<div class="plano-terminado-badge done" onclick="toggleProceso('${naveId}', '${item.id}', 'planoTerminado', this, event)" title="Plano terminado - clic para desmarcar"><i class="ti ti-circle-check-filled"></i></div>`
    : `<div class="plano-terminado-badge pendiente" onclick="toggleProceso('${naveId}', '${item.id}', 'planoTerminado', this, event)" title="Marcar plano como terminado"><i class="ti ti-alert-triangle"></i><span>PENDIENTE</span></div>`;

  // Botones fantasma punteados para los elementos viejos que no tienen esta info. 
  // Así el usuario sabe exactamente dónde cliquear para agregarlos rápidamente.
  let metaHtml = '';
  if (safeOdt || safeFecha || isEditableMode) {
     let odtTag = safeOdt ? `<span>ODT: ${escHtml(safeOdt)}</span>` : (isEditableMode ? `<span class="dashed-add only-editable" onclick="startEdit('${item.id}')" title="Agregar Código ODT">+ ODT</span>` : '');
     let fechaTag = safeFecha ? `<span>${formatDateEs(safeFecha)}</span>` : (isEditableMode ? `<span class="dashed-add only-editable" onclick="startEdit('${item.id}')" title="Agregar Fecha">+ Fecha</span>` : '');
     
     if (odtTag || fechaTag) {
         metaHtml = `<div class="item-meta">${odtTag}${fechaTag}</div>`;
     }
  }

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
        <button class="item-star-toggle ${item.marked?'active':''}" onclick="toggleItemStar('${naveId}','${item.id}')" title="${item.marked?'Quitar marca de editado':'Marcar como editado'}">
          <i class="ti ${item.marked?'ti-star-filled':'ti-star'}"></i>
        </button>
      </div>
    </div>
  </div>`;
}

function renderNave(nave, index, total){
  const errors=nave.items.filter(i=>i.type==='error'||i.type==='ajuste');
  const mejoras=nave.items.filter(i=>i.type==='mejora');
  
  const showErrors=nave.tipo==='ambos'||nave.tipo==='errores'||errors.length>0;
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
      <div class="img-box ${isFullWidth}" onclick="triggerImg('${nave.id}')">
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
    
  const errSection=showErrors?`
    <div class="section-block">
      <div class="section-header">
        <span class="section-pill pill-error"><i class="ti ti-alert-circle" style="font-size:13px"></i> Reporte de errores y ajustes</span>
        <button class="btn btn-xs btn-ghost only-editable" onclick="openAddItem('${nave.id}','error')"><i class="ti ti-plus" style="font-size:12px"></i> Agregar</button>
      </div>
      ${errors.length?errors.map(i=>renderItemCard(i,nave.id)).join(''):'<div class="empty-section">Sin errores registrados.</div>'}
    </div>`:''
  const mejSection=showMejoras?`
    ${showErrors&&errors.length?'<div class="divider"></div>':''}
    <div class="section-block">
      <div class="section-header">
        <span class="section-pill pill-mejora"><i class="ti ti-sparkles" style="font-size:13px"></i> Mejoras implementadas</span>
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
      <div class="nave-body-right right" style="flex:1; padding:18px;">${errSection}${mejSection}</div>
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

/* ---- Autocompletado de modelos (buscador, agregar modelo, editar modelo) ---- */
function renderAutocompleteList(container, matches, onSelectAttr){
  if(!container) return;
  if(!matches.length){ container.classList.remove('open'); container.innerHTML=''; return; }
  container.innerHTML = matches.map(m => `
    <div class="autocomplete-item" onmousedown="${onSelectAttr(m)}">
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
  addModel(naveId); // inserta el código y completa la colección automáticamente
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

/* ---- Abrir enlace de un modelo ----
   Los links http(s) normales se abren en pestaña nueva sin problema.
   Las rutas de red tipo \\servidor\carpeta (o su versión file://) NO se
   pueden abrir desde una página https por una restricción de seguridad
   del navegador (la bloquea en silencio, por eso "no hacía nada"). En
   ese caso copiamos la ruta para pegarla en el explorador de archivos. */
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

  // Ruta de red / archivo local: los navegadores bloquean abrir esto
  // automáticamente desde una página https, así que copiamos la ruta.
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

/* ---- Importar Archivos Anteriores ---- */
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
});

/* ---- Exportar a Excel (.xlsx) ----
   Respeta el mismo orden en que se muestran los cambios en la app:
   por mueble, y dentro de cada mueble primero errores/ajustes y luego mejoras. */
function exportarExcel(){
  if(typeof XLSX === 'undefined'){
    alert('No se pudo cargar la librería de Excel. Revisa tu conexión a internet e intenta de nuevo.');
    return;
  }
  const filas = [];
  data.naves.forEach(nave=>{
    const errores = nave.items.filter(i=>i.type==='error'||i.type==='ajuste');
    const mejoras = nave.items.filter(i=>i.type==='mejora');
    const modelosTxt = (nave.models||[]).map(m=>m.name).join(', ');
    const coleccionTxt = Array.from(new Set((nave.models||[]).map(m=>m.coleccion).filter(Boolean))).join(', ');

    [...errores, ...mejoras].forEach(item=>{
      const proc = item.proceso || {};
      filas.push({
        'Fecha': item.fecha || '',
        'Modelo(s)': modelosTxt,
        'Colección': coleccionTxt,
        'ODT': item.odt || '',
        'Cambio / Reporte de Errores o Ajustes': item.title + (item.desc ? (' - ' + item.desc) : ''),
        'Estatus': proc.planoTerminado ? 'Terminado' : 'Pendiente'
      });
    });
  });

  if(!filas.length){
    alert('No hay cambios registrados todavía para exportar.');
    return;
  }

  const ws = XLSX.utils.json_to_sheet(filas, {
    header: ['Fecha','Modelo(s)','Colección','ODT','Cambio / Reporte de Errores o Ajustes','Estatus']
  });
  ws['!cols'] = [{wch:12},{wch:22},{wch:20},{wch:14},{wch:60},{wch:12}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
  const fechaHoy = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `reporte_produccion_${fechaHoy}.xlsx`);
}

/* ---- Importar base de datos de modelos (.xlsx) ---- */
function triggerImportModelos(){
  if (!isEditableMode) return;
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

      // Detecta qué columna es el código de modelo y cuál la colección,
      // buscando en el encabezado (si no lo encuentra, usa las 2 primeras columnas).
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
  if (!importedData || !importedData.naves) return;

  importedData.naves.forEach(impNave => {
    let existingNave = data.naves.find(n => n.id === impNave.id);

    if (!existingNave) {
      impNave.items.forEach(item => {
         if(!item.proceso) item.proceso = { habilitado: false, planos: false, etiquetas: false };
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
            existingNave.items.push(impItem);
          } else {
            existingItem.title = existingItem.title || impItem.title;
            existingItem.desc = existingItem.desc || impItem.desc;
            
            // Si importamos algo viejo que no tiene fecha, conservamos nuestro viejo dato (o asignamos vacío)
            existingItem.fecha = existingItem.fecha || impItem.fecha || '';
            existingItem.odt = existingItem.odt || impItem.odt || '';
            
            if (!existingItem.proceso) {
              existingItem.proceso = impItem.proceso || { habilitado: false, planos: false, etiquetas: false };
            }
          }
        });
      }
    }
  });
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
  
  if(!t)return;
  const nave=data.naves.find(n=>n.id===naveId);
  if(nave){
    const item=nave.items.find(i=>i.id===itemId);
    if(item){
      item.title=t;
      item.desc=d;
      item.fecha=f;
      item.odt=o;
      item.marked=true;
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
  
  // Establecer fecha actual por defecto
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  document.getElementById('new-item-fecha').value = `${yyyy}-${mm}-${dd}`;

  newCat=defaultCat||'mejora';
  document.querySelectorAll('#cat-select .radio-opt').forEach(el=>{
    el.classList.toggle('selected',el.querySelector('input').value===newCat);
  });
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
      marked:true,
      proceso: { habilitado: false, planos: false, etiquetas: false, planoTerminado: false }
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
  newModels=[];newNaveSelected='NAVE 2';newTipo='ambos';
  document.getElementById('new-consola').value='';
  document.getElementById('tag-input').value='';
  renderTags();
  document.querySelectorAll('#nave-select .select-opt').forEach((el,i)=>el.classList.toggle('selected',i===0));
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
    if(val&&!newModels.includes(val)){newModels.push(val);inp.value='';renderTags();}
  } else if(e.key==='Backspace'&&!inp.value&&newModels.length){
    newModels.pop();renderTags();
  }
}
function handleTagInput(e){
  if (!isEditableMode) return;
  const val=e.target.value;
  if(val.includes(',')){
    const parts=val.split(',');
    parts.slice(0,-1).forEach(p=>{const v=p.trim().toUpperCase();if(v&&!newModels.includes(v))newModels.push(v);});
    e.target.value=parts[parts.length-1];
    renderTags();
  }
}
function addNave(){
  if (!isEditableMode) return;
  const consola=document.getElementById('new-consola').value.trim().toUpperCase();
  const tagVal=document.getElementById('tag-input').value.trim().toUpperCase();
  if(tagVal&&!newModels.includes(tagVal))newModels.push(tagVal);
  if(!consola){document.getElementById('new-consola').focus();return;}
  const modelObjects = newModels.map(m => ({name: m, link: ''}));
  data.naves.push({id:uid(),nave:newNaveSelected,consola,tipo:newTipo,models:modelObjects,images:[],items:[]});
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
  if(type === 'html' && fileHandle && window.showSaveFilePicker) {
     doExport(true);
     return;
  }
  
  document.getElementById('export-modal-title').textContent=type==='pdf'?'Exportar PDF (Final)':'Guardar Proyecto (Editable)';
  document.getElementById('export-filename').value='reporte_produccion';
  document.getElementById('export-hint').textContent=type==='pdf'
    ?'Se guardará un documento PDF de alta nitidez para imprimir. Podrás elegir la carpeta.'
    :'Se creará o sobrescribirá una copia de esta página .html con todo lo que has avanzado. Ábrela mañana para seguir editando.';
    
  document.getElementById('export-btn').textContent=type==='pdf'?'Exportar PDF':'Guardar HTML';
  document.getElementById('modal-export').classList.add('open');
}

function doExport(skipModal = false){
  const name=(document.getElementById('export-filename').value.trim()||'reporte_produccion').replace(/[^a-z0-9_\-]/gi,'_');
  if(!skipModal) closeModal('modal-export');
  
  if(exportType==='html') exportHTMLAsSaveGame(name);
  else exportPDFStatic(name);
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
  const originalHtml = btn.innerHTML;
  btn.innerHTML = 'Subiendo...';
  btn.disabled = true;
  setGithubStatus('Conectando con GitHub...', 'info');

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json'
  };

  // "path" apunta a tu index.html (ej. "index.html" o "carpeta/index.html").
  // Los datos e imágenes se guardan junto a él, en una subcarpeta data/.
  const baseDir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
  const dataRepoPath = baseDir + 'data/cambios.json';
  const imagesRepoPrefix = baseDir + 'data/images/';

  try {
    // 1) Subir cualquier imagen nueva (todavía en base64) como archivo individual
    let nuevasImagenes = 0;
    for (const nave of data.naves) {
      if (!Array.isArray(nave.images)) continue;
      for (let i = 0; i < nave.images.length; i++) {
        const img = nave.images[i];
        if (typeof img === 'string' && img.startsWith('data:image')) {
          const ext = extFromDataUri(img);
          const fileName = `${nave.id}_${uid()}.${ext}`;
          const b64 = img.split(',', 2)[1];
          setGithubStatus(`Subiendo imagen ${nuevasImagenes + 1}...`, 'info');
          await putFileToGithub(
            repo, imagesRepoPrefix + fileName, branch, headers, b64,
            `Nueva imagen (${new Date().toLocaleString('es-MX')})`
          );
          nave.images[i] = 'data/images/' + fileName; // ruta relativa al index.html
          nuevasImagenes++;
        }
      }
    }

    // 2) Subir el archivo de datos (pequeño, sin imágenes incrustadas)
    setGithubStatus('Guardando datos...', 'info');
    const dataString = JSON.stringify(data);
    await putFileToGithub(
      repo, dataRepoPath, branch, headers, utf8ToBase64(dataString),
      `Actualización del reporte desde la app (${new Date().toLocaleString('es-MX')})`
    );

    // 3) Si se importó una base de datos de modelos nueva en esta sesión, guardarla también
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

  // Los datos ya NO se incrustan aquí: viven en data/cambios.json.
  // Este HTML es solo la estructura/interfaz (por eso pesa poco).
  return '<!DOCTYPE html>\n' + clone.outerHTML;
}

function downloadBlob(content, fileName, mime){
  const blob = new Blob([content], {type: mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
}

async function exportHTMLAsSaveGame(name) {
  const btn = document.getElementById('export-btn');
  const originalText = btn.textContent;
  btn.textContent = 'Guardando...';

  const htmlString = buildProjectHTMLString();
  await downloadWithDialog(htmlString, name + '.html', 'html');

  // Respaldo local de los datos (los nuevos aún incluyen sus imágenes en
  // base64 por si no las has subido a GitHub todavía).
  downloadBlob(JSON.stringify(data, null, 2), 'cambios.json', 'application/json');
  alert('Se descargaron 2 archivos: el HTML de la interfaz y cambios.json con tus datos. Si vas a restaurar este respaldo, cambios.json debe ir dentro de una carpeta "data".');

  btn.textContent = originalText;
}


function exportPDFStatic(name) {
  const btn = document.getElementById('export-btn');
  btn.textContent = 'Generando PDF...';
  
  const d=new Date().toLocaleDateString('es-MX');
  let h=`
  <style>
  *{box-sizing:border-box;margin:0;padding:0}
  .pdf-container{font-family:Arial,sans-serif;background:#fff;color:#222;padding:0; position:relative;}
  h1{font-size:20px;font-weight:700;margin-bottom:3px}.date{font-size:12px;color:#666;margin-bottom:1.5rem}
  .legend{font-size:11px;color:#666;margin-top:4px}
  .card{background:#fff;border:1px solid #e0e0d8;border-radius:8px;margin-bottom:1.2rem;overflow:hidden;page-break-inside:avoid;}
  .card-header{background:#1e3a5f;color:#fff;padding:10px 16px;display:flex;align-items:center;gap:10px}
  .badge{background:rgba(255,255,255,0.2);border-radius:4px;padding:2px 8px;font-size:11px}
  .card-body{display:grid;grid-template-columns:210px 1fr}
  .left{padding:14px;border-right:1px solid #eee}
  .right{padding:14px}
  .panel-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#888;margin-bottom:6px}
  .chip{background:#f0effe;color:#533ab7;border-radius:4px;padding:3px 7px;font-size:11px;display:inline-block;margin:2px;font-weight:600; text-decoration:none;}
  .img-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:8px;}
  .mueble-img{width:100%;height:80px;object-fit:cover;border-radius:4px;border:1px solid #eee;}
  .img-empty{background:#f9f9f9;border:1px dashed #ddd;border-radius:5px;height:80px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#aaa;margin-top:8px}
  .pill{font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;display:inline-block;margin-bottom:8px}
  .pill-e{background:#fcebeb;color:#a32d2d}.pill-m{background:#eaf3de;color:#0f6e56}
  .item{border:1px solid #eee;border-radius:6px;padding:9px 11px;margin-bottom:6px;display:flex;gap:9px;page-break-inside:avoid;flex-direction:column}
  .item-main{display:flex;gap:9px}
  .dot{width:8px;height:8px;border-radius:50%;margin-top:4px;flex-shrink:0}
  .de{background:#e24b4a}.da{background:#ef9f27}.dm{background:#639922}
  .ititle{font-size:12px;font-weight:600;margin-bottom:2px}.idesc{font-size:12px;color:#555;line-height:1.5}
  .pdf-proceso{font-size:10px;color:#666;background:#f4f4fe;padding:4px 8px;border-radius:4px;display:inline-block;margin-top:6px;border:1px solid #e7e9f7;}
  hr{border:none;border-top:1px solid #eee;margin:10px 0}
  </style>
  <div class="pdf-container">
  <h1>Errores y Mejoras de Producción</h1>
  <div class="date">
    Fecha de exportación: ${d}<br>
    <div class="legend">✔️ = Correcto (no requiere cambios). &nbsp;|&nbsp; ❌ = Cambiar el plano, habilitado o etiqueta.</div>
  </div>`;

  const getProcStr = (i) => {
    const p = i.proceso || {habilitado:false, planos:false, etiquetas:false, planoTerminado:false};
    return `<div class="pdf-proceso"><b>Proceso:</b> Habilitado: ${p.habilitado?'✔️':'❌'} &nbsp;|&nbsp; Planos: ${p.planos?'✔️':'❌'} &nbsp;|&nbsp; Etiquetas: ${p.etiquetas?'✔️':'❌'} &nbsp;|&nbsp; Plano Terminado: ${p.planoTerminado?'✔️':'❌'}</div>`;
  };
  
  data.naves.forEach(nave=>{
    const errors=nave.items.filter(i=>i.type==='error'||i.type==='ajuste');
    const mejoras=nave.items.filter(i=>i.type==='mejora');
    const se=nave.tipo==='ambos'||nave.tipo==='errores'||errors.length>0;
    const sm=nave.tipo==='ambos'||nave.tipo==='mejoras'||mejoras.length>0;
    
    let imgHtml = '';
    if(nave.images.length > 0){
      imgHtml = `<div class="img-grid">` + nave.images.map(img => `<img src="${img}" class="mueble-img" alt="Mueble" />`).join('') + `</div>`;
    } else {
      imgHtml = `<div class="img-empty">Sin imagen</div>`;
    }

    const modelsHtml = nave.models.map(m => {
      if(!m.link) return `<span class="chip">${m.name}</span>`;
      let href = m.link.trim();
      if(href.startsWith('\\\\')) {
        href = 'file:' + href.replace(/\\/g, '/');
      } else if (!/^https?:\/\//i.test(href) && !href.startsWith('file:')) {
        href = 'http://' + href;
      }
      return `<a href="${href}" target="_blank" class="chip">${m.name} 🔗</a>`;
    }).join('');

    h+=`<div class="card"><div class="card-header"><span class="badge">${nave.nave}</span><strong>${nave.consola}</strong></div>
<div class="card-body"><div class="left"><div class="panel-label">Modelos (Clic para enlace)</div>${modelsHtml}<br><br><div class="panel-label">Imágenes</div>${imgHtml}</div>
<div class="right">`;
    if(se&&errors.length){
      h+=`<div class="pill pill-e">Reporte de errores y ajustes</div>`;
      errors.forEach(i=>{
        let sFecha = i.fecha && i.fecha !== 'undefined' ? i.fecha : '';
        let sOdt = i.odt && i.odt !== 'undefined' ? i.odt : '';
        h+=`<div class="item"><div class="item-main"><div class="dot ${i.type==='error'?'de':'da'}"></div><div style="flex:1"><div style="display:flex; justify-content:space-between; align-items:flex-start;"><div class="ititle">${i.title}</div><div style="font-size:10px; color:#777; text-align:right;">${sOdt ? `<b>ODT:</b> ${escHtml(sOdt)} ` : ''}${sFecha ? `<b>Fecha:</b> ${formatDateEs(sFecha)}` : ''}</div></div><div class="idesc">${i.desc}</div>${getProcStr(i)}</div></div></div>`;
      });
    }
    if(sm&&mejoras.length){
      if(se&&errors.length)h+=`<hr>`;
      h+=`<div class="pill pill-m">Mejoras implementadas</div>`;
      mejoras.forEach(i=>{
        let sFecha = i.fecha && i.fecha !== 'undefined' ? i.fecha : '';
        let sOdt = i.odt && i.odt !== 'undefined' ? i.odt : '';
        h+=`<div class="item"><div class="item-main"><div class="dot dm"></div><div style="flex:1"><div style="display:flex; justify-content:space-between; align-items:flex-start;"><div class="ititle">${i.title}</div><div style="font-size:10px; color:#777; text-align:right;">${sOdt ? `<b>ODT:</b> ${escHtml(sOdt)} ` : ''}${sFecha ? `<b>Fecha:</b> ${formatDateEs(sFecha)}` : ''}</div></div><div class="idesc">${i.desc}</div>${getProcStr(i)}</div></div></div>`;
      });
    }
    h+=`</div></div></div>`;
  });
  h+=`</div>`;

  const opt = {
    margin:       [10, 10, 10, 10],
    filename:     name + '.pdf',
    image:        { type: 'jpeg', quality: 1.0 },
    html2canvas:  { scale: 4, useCORS: true, letterRendering: true },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
    enableLinks:  true
  };

  html2pdf().set(opt).from(h).output('blob').then(async (blob) => {
    btn.textContent = 'Exportar PDF Final';
    await downloadWithDialog(blob, name + '.pdf', 'pdf');
  }).catch(err => {
    console.error("Error al exportar PDF:", err);
    btn.textContent = 'Exportar PDF Final';
  });
}

function closeModal(id){document.getElementById(id).classList.remove('open');}

/* ---- Carga inicial de datos (data/cambios.json) ---- */
// Antes los datos venían incrustados en el propio HTML (por eso el archivo
// pesaba varios MB). Ahora viven en un archivo aparte, mucho más liviano,
// y las imágenes son archivos individuales dentro de data/images/.
// IMPORTANTE: esto requiere que la página se sirva por http(s) (GitHub Pages,
// un servidor local, etc.). Si abres el index.html con doble clic (file://),
// el navegador bloquea esta carga por seguridad y verás un aviso abajo.
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

// Devuelve hasta `limit` modelos cuyo código empiece o contenga `query`
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

cargarDatosIniciales();

