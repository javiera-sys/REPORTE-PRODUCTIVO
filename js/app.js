function isAdminSafe() {
  return (typeof isAdmin === 'function') && isAdmin();
}

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
let marcadorModo = 'cambios';

let fileHandle = null;
let data = { naves: [], accessPasswords: [], pendientesGenerales: [], fichasTecnicas: [] };

let modelosDB = [];
let modelosDBIndex = new Map(); 
let modelosDBChanged = false; 

// --- NUEVO: sistema de guardado agrupado ---
// Cuando el usuario agregue varios cambios con fotos y presione "Guardar en GitHub",
// todo se sube en UNA SOLA operación (1 commit). No hay guardados automáticos ocultos.
let guardadoEnProgreso = false;

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

/* ============================================================
   EDITOR DE TEXTO ENRIQUECIDO (RTE)
   ============================================================ */

const RTE_ALLOWED_TAGS = new Set(['STRONG', 'B', 'EM', 'I', 'U', 'BR', 'DIV', 'P']);
const RTE_TAG_MAP = { 'B': 'strong', 'I': 'em' };

function sanitizeRichHTML(html) {
  if (html == null) return '';
  const src = String(html);
  if (!/[<>]/.test(src)) return src;
  try {
    const doc = new DOMParser().parseFromString('<div>' + src + '</div>', 'text/html');
    const root = doc.body.firstChild;

    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue);
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      const tag = node.tagName.toUpperCase();
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME' ||
          tag === 'OBJECT' || tag === 'EMBED' || tag === 'LINK' ||
          tag === 'META' || tag === 'HEAD' || tag === 'TITLE') return null;
      if (tag === 'BR') return document.createElement('br');
      if (tag === 'DIV' || tag === 'P') {
        const el = document.createElement('div');
        node.childNodes.forEach(ch => {
          const clean = walk(ch);
          if (clean) el.appendChild(clean);
        });
        return el;
      }
      if (RTE_ALLOWED_TAGS.has(tag)) {
        const outTag = RTE_TAG_MAP[tag] || tag.toLowerCase();
        const el = document.createElement(outTag);
        node.childNodes.forEach(ch => {
          const clean = walk(ch);
          if (clean) el.appendChild(clean);
        });
        return el;
      }
      const frag = document.createDocumentFragment();
      node.childNodes.forEach(ch => {
        const clean = walk(ch);
        if (clean) frag.appendChild(clean);
      });
      return frag;
    };

    const out = document.createElement('div');
    root.childNodes.forEach(ch => {
      const clean = walk(ch);
      if (clean) out.appendChild(clean);
    });
    return out.innerHTML;
  } catch (e) {
    console.warn('sanitizeRichHTML error:', e);
    return String(src).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
}

function hasRichHTML(str) {
  if (!str) return false;
  return /<(strong|b|em|i|u|br|div)[\s>]/i.test(String(str));
}

function stripHTML(html) {
  if (!html) return '';
  if (!hasRichHTML(html)) return String(html);
  try {
    const doc = new DOMParser().parseFromString(
      '<div>' + String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p)>/gi, '\n') + '</div>',
      'text/html'
    );
    let text = doc.body.textContent || '';
    return text.replace(/\n{3,}/g, '\n\n').trim();
  } catch (e) {
    return String(html).replace(/<[^>]*>/g, '');
  }
}

function renderDescripcion(desc) {
  if (desc == null) return '';
  const s = String(desc);
  if (!s) return '';
  if (hasRichHTML(s)) {
    return sanitizeRichHTML(s);
  }
  return escHtml(s).replace(/\n/g, '<br>');
}

let _rteCaseMenuEl = null;
let _rteCaseTarget = null;

function _rteEnsureCaseMenu() {
  if (_rteCaseMenuEl) return _rteCaseMenuEl;
  const menu = document.createElement('div');
  menu.className = 'rte-case-menu';
  menu.innerHTML = `
    <button type="button" data-case="upper"><i class="ti ti-letter-case-upper"></i> MAYÚSCULAS</button>
    <button type="button" data-case="lower"><i class="ti ti-letter-case-lower"></i> minúsculas</button>
    <button type="button" data-case="sentence"><i class="ti ti-letter-case"></i> Tipo oración</button>
  `;
  menu.addEventListener('mousedown', (e) => e.preventDefault());
  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-case]');
    if (!btn) return;
    const mode = btn.getAttribute('data-case');
    if (_rteCaseTarget) aplicarCaseAlEditor(_rteCaseTarget, mode);
    menu.classList.remove('open');
    _rteCaseTarget = null;
  });
  document.body.appendChild(menu);
  _rteCaseMenuEl = menu;
  return menu;
}

function _rteAbrirCaseMenu(anchorBtn, editorEl) {
  const menu = _rteEnsureCaseMenu();
  const rect = anchorBtn.getBoundingClientRect();
  menu.classList.add('open');
  const menuRect = menu.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + 4;
  if (left + menuRect.width > window.innerWidth - 8) {
    left = window.innerWidth - menuRect.width - 8;
  }
  if (top + menuRect.height > window.innerHeight - 8) {
    top = rect.top - menuRect.height - 4;
  }
  menu.style.left = Math.max(8, left) + 'px';
  menu.style.top = Math.max(8, top) + 'px';
  _rteCaseTarget = editorEl;
}

document.addEventListener('click', (e) => {
  if (!_rteCaseMenuEl) return;
  if (!_rteCaseMenuEl.classList.contains('open')) return;
  if (_rteCaseMenuEl.contains(e.target)) return;
  if (e.target.closest('.rte-btn[data-action="case"]')) return;
  _rteCaseMenuEl.classList.remove('open');
  _rteCaseTarget = null;
});
window.addEventListener('scroll', () => {
  if (_rteCaseMenuEl && _rteCaseMenuEl.classList.contains('open')) {
    _rteCaseMenuEl.classList.remove('open');
    _rteCaseTarget = null;
  }
}, true);

function aplicarCaseAlEditor(editor, mode) {
  if (!editor) return;
  editor.focus();
  const sel = window.getSelection();
  const hasSel = sel && sel.rangeCount > 0 && !sel.isCollapsed &&
                 editor.contains(sel.getRangeAt(0).commonAncestorContainer);

  const transform = (t) => {
    if (mode === 'upper') return t.toLocaleUpperCase('es-MX');
    if (mode === 'lower') return t.toLocaleLowerCase('es-MX');
    if (mode === 'sentence') {
      const lower = t.toLocaleLowerCase('es-MX');
      return lower.replace(/(^\s*[a-záéíóúñü]|(?:[.!?]\s+)[a-záéíóúñü])/g,
        (m) => m.toLocaleUpperCase('es-MX'));
    }
    return t;
  };

  if (hasSel) {
    const range = sel.getRangeAt(0);
    const texto = range.toString();
    if (!texto) return;
    const nuevo = transform(texto);
    range.deleteContents();
    range.insertNode(document.createTextNode(nuevo));
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(editor);
    newRange.collapse(false);
    sel.addRange(newRange);
  } else {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
    let n;
    while ((n = walker.nextNode())) {
      n.nodeValue = transform(n.nodeValue);
    }
  }
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function _rteSyncToolbarState(editor, toolbar) {
  if (!editor || !toolbar) return;
  const tryState = (cmd) => {
    try { return document.queryCommandState(cmd); } catch (e) { return false; }
  };
  toolbar.querySelectorAll('.rte-btn[data-cmd]').forEach(btn => {
    const cmd = btn.getAttribute('data-cmd');
    btn.classList.toggle('rte-btn-active', tryState(cmd));
  });
}

function _rteExec(editor, cmd, value) {
  if (!editor) return;
  editor.focus();
  try {
    document.execCommand('styleWithCSS', false, false);
  } catch (e) {}
  document.execCommand(cmd, false, value || null);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function _rteCleanPaste(editor, htmlOrText, isHTML) {
  let htmlLimpio = '';
  if (isHTML) {
    htmlLimpio = sanitizeRichHTML(htmlOrText);
  } else {
    htmlLimpio = escHtml(htmlOrText).replace(/\n/g, '<br>');
  }
  document.execCommand('insertHTML', false, htmlLimpio);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function _rteBuildToolbar(editor, toolbar) {
  if (!toolbar) return;
  toolbar.innerHTML = '';

  const btn = (title, iconClass, opts) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rte-btn';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = `<i class="${iconClass}"></i>`;
    if (opts && opts.cmd) b.setAttribute('data-cmd', opts.cmd);
    if (opts && opts.action) b.setAttribute('data-action', opts.action);
    b.addEventListener('mousedown', (e) => e.preventDefault());
    return b;
  };

  const sep = () => {
    const s = document.createElement('span');
    s.className = 'rte-sep';
    return s;
  };

  const bB = btn('Negrita (Ctrl+B)', 'ti ti-bold', { cmd: 'bold' });
  const bI = btn('Cursiva (Ctrl+I)', 'ti ti-italic', { cmd: 'italic' });
  const bU = btn('Subrayado (Ctrl+U)', 'ti ti-underline', { cmd: 'underline' });

  bB.addEventListener('click', () => _rteExec(editor, 'bold'));
  bI.addEventListener('click', () => _rteExec(editor, 'italic'));
  bU.addEventListener('click', () => _rteExec(editor, 'underline'));

  toolbar.appendChild(bB);
  toolbar.appendChild(bI);
  toolbar.appendChild(bU);
  toolbar.appendChild(sep());

  const bCase = btn('Cambiar mayúsculas/minúsculas', 'ti ti-letter-case', { action: 'case' });
  bCase.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    _rteAbrirCaseMenu(bCase, editor);
  });
  toolbar.appendChild(bCase);
  toolbar.appendChild(sep());

  const bUndo = btn('Deshacer (Ctrl+Z)', 'ti ti-arrow-back-up', { action: 'undo' });
  const bRedo = btn('Rehacer (Ctrl+Y)', 'ti ti-arrow-forward-up', { action: 'redo' });
  bUndo.addEventListener('click', () => _rteExec(editor, 'undo'));
  bRedo.addEventListener('click', () => _rteExec(editor, 'redo'));
  toolbar.appendChild(bUndo);
  toolbar.appendChild(bRedo);

  const sync = () => _rteSyncToolbarState(editor, toolbar);
  editor.addEventListener('keyup', sync);
  editor.addEventListener('mouseup', sync);
  editor.addEventListener('focus', sync);
  editor.addEventListener('input', sync);
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === editor) sync();
  });

  editor.addEventListener('paste', (e) => {
    e.preventDefault();
    const cd = e.clipboardData || window.clipboardData;
    if (!cd) return;
    const html = cd.getData('text/html');
    const text = cd.getData('text/plain');
    if (html) {
      _rteCleanPaste(editor, html, true);
    } else {
      _rteCleanPaste(editor, text || '', false);
    }
  });

  editor.addEventListener('drop', (e) => {
    e.preventDefault();
    const text = (e.dataTransfer && e.dataTransfer.getData('text/plain')) || '';
    if (text) _rteCleanPaste(editor, text, false);
  });
  editor.addEventListener('dragover', (e) => e.preventDefault());
}

function attachRichEditor(editor, toolbar) {
  if (!editor || editor.dataset.rteReady === '1') return;
  editor.dataset.rteReady = '1';
  _rteBuildToolbar(editor, toolbar);
}

function initAllRichEditors() {
  document.querySelectorAll('.rte-wrap').forEach(wrap => {
    const toolbar = wrap.querySelector('.rte-toolbar');
    const editor = wrap.querySelector('.rte-editor');
    if (toolbar && editor) attachRichEditor(editor, toolbar);
  });
}

function setEditorContent(editorId, value) {
  const editor = document.getElementById(editorId);
  if (!editor) return;
  const html = renderDescripcion(value);
  editor.innerHTML = html || '';
}

function getEditorContent(editorId) {
  const editor = document.getElementById(editorId);
  if (!editor) return '';
  const raw = editor.innerHTML || '';
  return sanitizeRichHTML(raw).trim();
}

/* ============================================================
   NOTIFICACIÓN FLOTANTE (TOAST)
   ============================================================ */
function showToast(message, type) {
  try {
    if (!document.body) return;

    let container = document.getElementById('rpi-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'rpi-toast-container';
      container.className = 'rpi-toast-container';
      document.body.appendChild(container);
    }

    let cls = 'rpi-toast-info';
    let icon = 'ti-info-circle';
    if (type === 'success' || type === 'ok') { cls = 'rpi-toast-success'; icon = 'ti-circle-check'; }
    else if (type === 'error') { cls = 'rpi-toast-error'; icon = 'ti-alert-circle'; }
    else if (type === 'warning' || type === 'warn') { cls = 'rpi-toast-warning'; icon = 'ti-alert-triangle'; }
    else if (type === 'info') { cls = 'rpi-toast-info'; icon = 'ti-info-circle'; }

    const toast = document.createElement('div');
    toast.className = 'rpi-toast ' + cls;
    toast.innerHTML =
      '<i class="ti ' + icon + '"></i>' +
      '<div class="rpi-toast-text"></div>' +
      '<button class="rpi-toast-close" title="Cerrar" aria-label="Cerrar"><i class="ti ti-x"></i></button>';

    toast.querySelector('.rpi-toast-text').textContent = message;

    const removeToast = () => {
      toast.classList.remove('rpi-toast-visible');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
        if (container && container.children.length === 0 && container.parentNode) {
          container.parentNode.removeChild(container);
        }
      }, 300);
    };

    toast.querySelector('.rpi-toast-close').addEventListener('click', removeToast);
    container.appendChild(toast);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('rpi-toast-visible'));
    });

    const timeout = (type === 'error') ? 5000 : 4000;
    setTimeout(removeToast, timeout);

    console.log('[Toast ' + type + ']', message);
  } catch (err) {
    console.warn('showToast error:', err);
  }
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
  if (!isAdminSafe()) { alert('🔒 Solo un administrador puede administrar accesos.'); return; }
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

    if (field === 'planoTerminado') {
      if (item.proceso.planoTerminado) {
        item.completedAt = Date.now();
      } else {
        delete item.completedAt;
      }
    }

    const _user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (_user) {
      item.modifiedBy = _user.username;
      item.modifiedByName = _user.nombre;
      item.modifiedAt = Date.now();
    }

    render();
  }
}

function toggleCancelado(naveId, itemId, event) {
  if(event) event.stopPropagation();
  if (!isEditableMode) return;
  const nave = data.naves.find(n => n.id === naveId);
  if(!nave) return;
  const item = nave.items.find(i => i.id === itemId);
  if(!item) return;

  if (!item.cancelado) {
    if (!confirm('¿Marcar este cambio como Cancelado?\n\nEl registro no se borra, solo se marca visualmente como no válido.')) return;
    item.cancelado = true;
    item.cancelledAt = Date.now();
  } else {
    item.cancelado = false;
    delete item.cancelledAt;
  }

  const _user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  if (_user) {
    item.modifiedBy = _user.username;
    item.modifiedByName = _user.nombre;
    item.modifiedAt = Date.now();
  }

  render();
}

function compressImageDataUrl(dataUrl, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (e) {
        console.warn('No se pudo comprimir la imagen, se usa el original:', e);
        resolve(dataUrl);
      }
    };
    img.onerror = () => {
      console.warn('No se pudo procesar la imagen para comprimir, se usa el original.');
      resolve(dataUrl);
    };
    img.src = dataUrl;
  });
}

function subirAdjunto(event, naveId, itemId, idx) {
  if (!isEditableMode) return;
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    const nave = data.naves.find(n => n.id === naveId);
    if(nave) {
      const item = nave.items.find(i => i.id === itemId);
      if(item) {
        if(!item.adjuntos) item.adjuntos = ["","","","",""];
        item.adjuntos[idx] = await compressImageDataUrl(e.target.result);

        const _user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        if (_user) {
          item.modifiedBy = _user.username;
          item.modifiedByName = _user.nombre;
          item.modifiedAt = Date.now();
        }

        render();
      }
    }
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function eliminarAdjunto(event, naveId, itemId, idx) {
  event.stopPropagation();
  if (!isEditableMode) return;
  const nave = data.naves.find(n => n.id === naveId);
  if(nave) {
    const item = nave.items.find(i => i.id === itemId);
    if(item && item.adjuntos) {
      item.adjuntos[idx] = "";

      const _user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
      if (_user) {
        item.modifiedBy = _user.username;
        item.modifiedByName = _user.nombre;
        item.modifiedAt = Date.now();
      }

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
  try {
    localStorage.setItem('rpi_pg_panel_open', isPGPanelOpen ? '1' : '0');
  } catch (e) {}
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
          <div class="pg-item-desc">${renderDescripcion(pg.desc)}</div>
    ${renderAdjuntosPG(pg)}
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
  setEditorContent('pg-desc', '');
  document.getElementById('modal-pg-h').textContent = 'Agregar Pendiente General';
  document.getElementById('modal-pg').classList.add('open');
  setTimeout(() => {
    document.getElementById('pg-title').focus();
    if (typeof initAllRichEditors === 'function') initAllRichEditors();
  }, 100);
}

function renderAdjuntosPG(pg) {
  if (!pg.adjuntos || !Array.isArray(pg.adjuntos)) pg.adjuntos = [];
  const total = pg.adjuntos.length;
  let html = '<div class="pg-adjuntos-row">';
  pg.adjuntos.forEach((adj, idx) => {
    if (!adj) return;
    const esPdf = adj.startsWith('data:application/pdf') || adj.toLowerCase().includes('.pdf');
    const thumb = esPdf
      ? `<div class="pg-adjunto-pdf" title="PDF"><i class="ti ti-file-type-pdf"></i></div>`
      : `<img src="${adj}" alt="adjunto" loading="lazy">`;
    const clickAction = esPdf ? `abrirPdfPG('${pg.id}', ${idx})` : `viewImage('${adj}')`;
    html += `
      <div class="pg-adjunto-item">
        <div class="pg-adjunto-thumb" onclick="${clickAction}" title="${esPdf ? 'Ver PDF' : 'Ver imagen'}">
          ${thumb}
        </div>
        <button class="pg-adjunto-del only-editable" onclick="eliminarAdjuntoPG(event, '${pg.id}', ${idx})" title="Eliminar archivo"><i class="ti ti-x"></i></button>
      </div>`;
  });
  html += `
      <div class="pg-adjunto-item pg-adjunto-add only-editable">
        <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf" id="pg-adj-${pg.id}" class="input-oculto" onchange="subirAdjuntoPG(event, '${pg.id}')">
        <label for="pg-adj-${pg.id}" class="pg-adjunto-add-label" title="Agregar archivo (imagen o PDF)">
          <i class="ti ti-plus"></i>
        </label>
      </div>
    </div>
    <div style="font-size:10.5px; color:var(--color-text-secondary); margin-top:4px;">${total} archivo${total===1?'':'s'} adjunto${total===1?'':'s'}</div>
  `;
  return html;
}

function subirAdjuntoPG(event, pgId) {
  if (!isEditableMode) { event.target.value = ''; return; }
  const file = event.target.files[0];
  if (!file) return;

  const esImagen = /^image\/(jpeg|jpg|png|webp)$/i.test(file.type);
  const esPdf = file.type === 'application/pdf';
  if (!esImagen && !esPdf) {
    alert('Solo se permiten imágenes (JPG, JPEG, PNG, WEBP) o documentos PDF.');
    event.target.value = '';
    return;
  }

  const pg = (data.pendientesGenerales || []).find(p => p.id === pgId);
  if (!pg) { event.target.value = ''; return; }
  if (!pg.adjuntos) pg.adjuntos = [];

  const reader = new FileReader();
  reader.onload = async function(e) {
    let contenido = e.target.result;

    if (esImagen) {
      contenido = await compressImageDataUrl(contenido);
    }

    pg.adjuntos.push(contenido);
    renderPG();
    event.target.value = '';
  };
  reader.onerror = () => { alert('❌ No se pudo leer el archivo.'); event.target.value = ''; };
  reader.readAsDataURL(file);
}

// --- ELIMINADO: guardado automático al eliminar adjunto PG ---
// El usuario debe presionar "Guardar en GitHub" para aplicar el cambio.
async function eliminarAdjuntoPG(event, pgId, idx) {
  if (event) event.stopPropagation();
  if (!isEditableMode) return;
  const pg = (data.pendientesGenerales || []).find(p => p.id === pgId);
  if (!pg || !pg.adjuntos || !pg.adjuntos[idx]) return;
  if (!confirm('¿Eliminar este archivo adjunto?')) return;

  const adj = pg.adjuntos[idx];

  // Si el archivo ya está en GitHub (no es data:), lo borramos del repo.
  // Si es data: (nunca se subió), solo lo quitamos de memoria.
  if (typeof adj === 'string' && !adj.startsWith('data:')) {
    try {
      const cfg = loadGithubConfig();
      if (cfg && cfg.repo && cfg.token) {
        const branch = cfg.branch || 'main';
        const headers = { 'Authorization': `Bearer ${cfg.token}`, 'Accept': 'application/vnd.github+json' };
        await deleteFileFromGithub(cfg.repo, adj, branch, headers, ghCommitMessage(`Eliminar adjunto de pendiente general "${pg.title}"`));
      }
    } catch (err) {
      console.error('No se pudo borrar el archivo del repositorio:', err);
    }
  }

  pg.adjuntos.splice(idx, 1);
  renderPG();
  // OJO: Ya NO se llama quickSaveGithub() aquí.
  // El usuario debe presionar "Guardar en GitHub" para que el cambio quede permanente.
}

function abrirPdfPG(pgId, idx) {
  const pg = (data.pendientesGenerales || []).find(p => p.id === pgId);
  if (!pg || !pg.adjuntos || !pg.adjuntos[idx]) return;
  window.open(pg.adjuntos[idx], '_blank');
}

function savePG() {
  if (!isEditableMode) return;
  const id = document.getElementById('pg-edit-id').value;
  const title = document.getElementById('pg-title').value.trim();
  const desc = getEditorContent('pg-desc');
  
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
        adjuntos: [],
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
  setEditorContent('pg-desc', pg.desc);
  document.getElementById('modal-pg-h').textContent = 'Editar Pendiente General';
  document.getElementById('modal-pg').classList.add('open');
  setTimeout(() => {
    if (typeof initAllRichEditors === 'function') initAllRichEditors();
  }, 100);
}

function deletePG(id) {
  if (!isEditableMode) return;
  if (!isAdminSafe()) { alert('🔒 Solo un administrador puede eliminar pendientes generales.'); return; }
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

  // --- MIGRACIÓN DE FECHAS HISTÓRICAS ---
  // Esta lógica se asegura de que los cambios existentes que ya están terminados
  // o cancelados tengan una fecha de evento para que aparezcan en el calendario.
  if(data && data.naves) {
    data.naves.forEach(nave => {
      if (nave.items) {
        nave.items.forEach(item => {
          if (!item.completedAt && item.proceso && item.proceso.planoTerminado) {
            item.completedAt = item.modifiedAt || item.createdAt;
          }
          if (!item.cancelledAt && item.cancelado) {
            item.cancelledAt = item.modifiedAt || item.createdAt;
          }
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
  renderMarcador();
  filterItems(); 
}

function setMarcadorModo(modo) {
  marcadorModo = (modo === 'global') ? 'global' : 'cambios';
  const btnCambios = document.getElementById('marcador-mode-cambios');
  const btnGlobal = document.getElementById('marcador-mode-global');
  if (btnCambios) btnCambios.classList.toggle('active', marcadorModo === 'cambios');
  if (btnGlobal) btnGlobal.classList.toggle('active', marcadorModo === 'global');
  renderMarcador();
}

function renderMarcador() {
  const pendienteEl = document.getElementById('marcador-count-pendiente');
  const terminadoEl = document.getElementById('marcador-count-terminado');
  const canceladoEl = document.getElementById('marcador-count-cancelado');
  if (!pendienteEl || !terminadoEl || !canceladoEl) return;

  let pendientes = 0, terminados = 0, cancelados = 0;

  (data.naves || []).forEach(nave => {
    let peso = 1;
    if (marcadorModo === 'global') {
      peso = (Array.isArray(nave.models) && nave.models.length > 0) ? nave.models.length : 1;
    }

    (nave.items || []).forEach(item => {
      if (item.cancelado) {
        cancelados += peso;
      } else if (item.proceso && item.proceso.planoTerminado) {
        terminados += peso;
      } else {
        pendientes += peso;
      }
    });
  });

  pendienteEl.textContent = pendientes;
  terminadoEl.textContent = terminados;
  canceladoEl.textContent = cancelados;
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
   const isCancelado = itemCard.classList.contains('item-cancelado');
   let statusMatch = true;
   // Los 3 estados son mutuamente excluyentes:
   //   - Terminado = tiene clase 'plano-done' (y no está cancelado)
   //   - Cancelado = tiene clase 'item-cancelado'
   //   - Pendiente = no es terminado NI cancelado
   if (filterStatus === 'pending') {
     statusMatch = !isDone && !isCancelado;
   } else if (filterStatus === 'done') {
     statusMatch = isDone && !isCancelado;
   } else if (filterStatus === 'cancelado') {
     statusMatch = isCancelado;
   }

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
  const plain = hasRichHTML(str) ? stripHTML(str) : String(str || '');
  const escaped = escHtml(plain);
  if(!rawQ) return escaped;
  const re = new RegExp('(' + escRegex(escHtml(rawQ)) + ')', 'gi');
  return escaped.replace(re, '<mark class="search-highlight">$1</mark>');
}

function applyHighlight(itemCard, rawQ){
  ['.item-title-text', '.item-desc-text'].forEach(sel=>{
    const el = itemCard.querySelector(sel);
    if(!el) return;
    if(el.dataset.rawHtml === undefined){
      el.dataset.rawHtml = el.innerHTML;
    }
    const plain = stripHTML(el.dataset.rawHtml);
    el.innerHTML = highlightText(plain, rawQ);
  });
}

function clearHighlight(itemCard){
  ['.item-title-text', '.item-desc-text'].forEach(sel=>{
    const el = itemCard.querySelector(sel);
    if(el && el.dataset.rawHtml !== undefined){
      el.innerHTML = el.dataset.rawHtml;
    }
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
    const fechaBloqueada = !!safeFecha;
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
        <div style="display:flex; gap:8px; margin-bottom:6px; flex-wrap:wrap; align-items:center;">
          <select class="edit-title-input" id="ec-${item.id}" onchange="updateSubCatDropdown(this.value, 'esc-${item.id}')" style="width:auto; margin-bottom:0; padding-top:4px; padding-bottom:4px; cursor:pointer;" title="Categoría">
            <option value="error" ${item.type==='error'?'selected':''}>🚨 Error</option>
            <option value="ajuste" ${item.type==='ajuste'?'selected':''}>🔧 Ajuste</option>
            <option value="mejora" ${item.type==='mejora'?'selected':''}>✨ Mejora</option>
          </select>
          <select class="edit-title-input" id="esc-${item.id}" style="width:auto; margin-bottom:0; padding-top:4px; padding-bottom:4px; cursor:pointer; max-width: 150px;" title="Clasificación">
            <option value="${escHtml(item.subType||'')}">${escHtml(item.subType||'Seleccionar...')}</option>
          </select>
          <input class="edit-title-input" type="date" id="ef-${item.id}" value="${safeFecha}" style="width:130px; margin-bottom:0;" title="Fecha" ${fechaBloqueada ? 'disabled' : ''} />
          ${fechaBloqueada ? `<button type="button" class="btn-ghost btn" title="Editar fecha (requiere autorización)" onclick="unlockFechaEdit('${item.id}')" style="padding:4px 6px;min-height:auto;vertical-align:middle;"><i class="ti ti-lock" style="font-size:13px"></i></button>` : ''}
          <input class="edit-title-input" type="text" id="eo-${item.id}" placeholder="Código ODT" value="${escHtml(safeOdt)}" style="width:150px; margin-bottom:0;" title="Código ODT" />
        </div>
        <input class="edit-title-input" id="et-${item.id}" value="${escHtml(item.title)}" />
        <div class="rte-wrap" data-rte-target="ed-${item.id}">
          <div class="rte-toolbar" role="toolbar" aria-label="Formato de texto"></div>
          <div class="rte-editor" id="ed-${item.id}" contenteditable="true" data-placeholder="Descripción del cambio..." spellcheck="true" lang="es-MX">${renderDescripcion(item.desc)}</div>
        </div>
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
  if (item.cancelado === undefined) {
    item.cancelado = false;
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
    if (safeOdt || safeFecha || isEditableMode || item.createdByName || item.modifiedByName) {
       let odtTag = safeOdt ? `<span>ODT: ${escHtml(safeOdt)}</span>` : (isEditableMode ? `<span class="dashed-add only-editable" onclick="startEdit('${item.id}')" title="Agregar Código ODT">+ ODT</span>` : '');
       let fechaTag = safeFecha ? `<span>${formatDateEs(safeFecha)}</span>` : (isEditableMode ? `<span class="dashed-add only-editable" onclick="startEdit('${item.id}')" title="Agregar Fecha">+ Fecha</span>` : '');

       let autorTag = '';
       if (item.createdByName) {
         autorTag = `<span title="Creado por" style="background:#e0f2f1; color:#0f6e8c; border:1px solid #99e6df;">👤 ${escHtml(item.createdByName.toUpperCase())}</span>`;
       }
       if (item.modifiedByName && item.modifiedByName !== item.createdByName) {
         autorTag += `<span title="Última modificación por" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a;">✏️ ${escHtml(item.modifiedByName.toUpperCase())}</span>`;
       }

       if (odtTag || fechaTag || autorTag) {
           metaHtml = `<div class="item-meta">${autorTag}${odtTag}${fechaTag}</div>`;
       }
    }

  const isNew = item.createdAt && (Date.now() - item.createdAt) < (72 * 60 * 60 * 1000);
  const starIndicatorHtml = isNew 
    ? `<div title="Registro nuevo (últimas 72h)" style="color:#f59e0b; display:flex; align-items:center; justify-content:center; width:20px; height:20px;"><i class="ti ti-star-filled" style="font-size:16px"></i></div>` 
    : `<div style="width:20px; height:20px;"></div>`;

  const canceladoBadgeHtml = item.cancelado
    ? `<span class="cancelado-badge" title="Este cambio fue marcado como cancelado"><i class="ti ti-ban"></i> CANCELADO</span>`
    : '';

  return `<div class="item-card ${proc.planoTerminado ? 'plano-done' : ''} ${item.cancelado ? 'item-cancelado' : ''}" id="ic-${item.id}">
    <div class="item-dot ${dotClass(item.type)}" style="margin-top:5px"></div>
    <div class="item-content">
      <div class="item-title-row">
        <div style="display:flex; align-items:flex-start; gap:8px; flex:1; min-width:0;">
          ${planoTerminadoHtml}
          <span class="item-title-text">${escHtml(item.title)}</span>
          ${canceladoBadgeHtml}
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px; margin-left:12px;">
          ${metaHtml}
          <div class="item-actions-row only-editable">
            <button class="btn ${item.cancelado ? 'btn-ghost' : 'btn-danger-ghost'}" title="${item.cancelado ? 'Reactivar cambio' : 'Cancelar cambio'}" onclick="toggleCancelado('${naveId}','${item.id}', event)"><i class="ti ${item.cancelado ? 'ti-rotate' : 'ti-ban'}" style="font-size:13px"></i></button>
            <button class="btn btn-ghost" title="Editar" onclick="startEdit('${item.id}')"><i class="ti ti-pencil" style="font-size:13px"></i></button>
            <button class="btn btn-danger-ghost" title="Eliminar" onclick="removeItem('${naveId}','${item.id}')"><i class="ti ti-trash" style="font-size:13px"></i></button>
          </div>
        </div>
      </div>
      <div class="item-desc-text">${renderDescripcion(item.desc)}</div>
      <div class="item-footer">
        ${procesoHtml}
        ${starIndicatorHtml}
      </div>
    </div>
  </div>`;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function renderItemsRow(items, naveId) {
  if (!items || !items.length) return '';
  const filas = chunk(items, 3);
  return filas.map(fila => `
    <div class="items-row items-row-${fila.length}">
      ${fila.map(i => renderItemCard(i, naveId)).join('')}
    </div>
  `).join('');
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
        <img src="${img}" alt="Mueble" title="Haz clic para ampliar" onclick="viewImage(this.src)" />
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
      ${errores.length?renderItemsRow(errores, nave.id):'<div class="empty-section">Sin errores registrados.</div>'}
    </div>`:''

  const ajuSection=showAjustes?`
    ${showErrores&&errores.length?'<div class="divider"></div>':''}
    <div class="section-block">
      <div class="section-header">
        <span class="section-pill" style="background:#fef08a; color:#854d0e; border:1px solid #fde047; padding: 4px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;"><i class="ti ti-tool" style="font-size:13px"></i> Reporte de ajustes</span>
        <button class="btn btn-xs btn-ghost only-editable" onclick="openAddItem('${nave.id}','ajuste')"><i class="ti ti-plus" style="font-size:12px"></i> Agregar</button>
      </div>
      ${ajustes.length?renderItemsRow(ajustes, nave.id):'<div class="empty-section">Sin ajustes registrados.</div>'}
    </div>`:''

  const mejSection=showMejoras?`
    ${(showErrores&&errores.length)||(showAjustes&&ajustes.length)?'<div class="divider"></div>':''}
    <div class="section-block">
      <div class="section-header">
        <span class="section-pill pill-mejora"><i class="ti ti-sparkles" style="font-size:13px"></i> Reporte de mejoras</span>
        <button class="btn btn-xs btn-ghost only-editable" onclick="openAddItem('${nave.id}','mejora')"><i class="ti ti-plus" style="font-size:12px"></i> Agregar</button>
      </div>
      ${mejoras.length?renderItemsRow(mejoras, nave.id):'<div class="empty-section">Sin mejoras registradas.</div>'}
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

function viewImage(src) {
  document.getElementById('view-img-element').src = src;
  document.getElementById('modal-view-img').classList.add('open');
}

function moveNaveUp(idx){
  if (!isEditableMode) return;
  if(idx > 0){
    const temp = data.naves[idx - 1];
    data.naves[idx - 1] = data.naves[idx];
    data.naves[idx] = temp;
    
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
    
    const tempTime = data.naves[idx + 1].createdAt;
    data.naves[idx + 1].createdAt = data.naves[idx].createdAt;
    data.naves[idx].createdAt = tempTime;
    
    render();
  }
}

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
  if (matches.length) {
    setTimeout(() => inp.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
  }
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

function triggerImg(id){
  if (!isEditableMode) return;
  currentImgNaveId=id;
  document.getElementById('img-input').click();
}
function handleImg(e){
  if (!isEditableMode) return;
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=async ev=>{
    const n=data.naves.find(x=>x.id===currentImgNaveId);
    if(n && n.images.length < 10){
      const compressed = await compressImageDataUrl(ev.target.result);
      n.images.push(compressed);
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
      reader.onload = async (ev) => {
        const n = data.naves.find(x => x.id === targetId);
        if (n && n.images.length < 10) {
          const compressed = await compressImageDataUrl(ev.target.result);
          n.images.push(compressed);
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

function toggleSideMenu(){
  const menu = document.getElementById('side-menu');
  const backdrop = document.getElementById('side-menu-backdrop');
  const toggleBtn = document.getElementById('side-menu-toggle');
  if(!menu) return;
  const willOpen = !menu.classList.contains('open');
  menu.classList.toggle('open', willOpen);
  if(backdrop) backdrop.classList.toggle('open', willOpen);
  if(toggleBtn) toggleBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
}
function closeSideMenu(){
  const menu = document.getElementById('side-menu');
  const backdrop = document.getElementById('side-menu-backdrop');
  const toggleBtn = document.getElementById('side-menu-toggle');
  if(menu) menu.classList.remove('open');
  if(backdrop) backdrop.classList.remove('open');
  if(toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
}
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape') closeSideMenu();
});

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
          const descPlano = stripHTML(pg.desc || '');
          filas.push({
              'FECHA': dateStr,
              'ITEM': 'PENDIENTE GENERAL',
              'ODT': '',
              'CAMBIO': pg.title + (descPlano ? (' - ' + descPlano) : ''),
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
      const descPlano = stripHTML(item.desc || '');
      const cambio = item.title + (descPlano ? (' - ' + descPlano) : '');
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

/* ============================================================
   MÓDULO INDEPENDIENTE: PROCESOS DE DISEÑO
   ============================================================ */
let pdCurrentSubmoduleId = null;

const PD_DEFAULT_SUBMODULES = [
  { id: 'ficha_tolerancias', label: 'Ficha Técnica de Tolerancias', type: 'excel', headers: [], rows: [] }
];

function ensureProcesosDiseno() {
  if (!data.procesosDiseno || typeof data.procesosDiseno !== 'object' || !Array.isArray(data.procesosDiseno.submodules)) {
    const now = Date.now();
    data.procesosDiseno = { submodules: PD_DEFAULT_SUBMODULES.map(s => ({ ...s, headers: [], rows: [], createdAt: now, updatedAt: now })) };
  }
  data.procesosDiseno.submodules.forEach(sm => {
    if (sm.type !== 'excel' && sm.type !== 'pdf') sm.type = 'excel';
    if (!Array.isArray(sm.headers)) sm.headers = [];
    if (!Array.isArray(sm.rows)) sm.rows = [];
    if (sm.pdfContent === undefined) sm.pdfContent = null;
    if (sm.pdfName === undefined) sm.pdfName = null;
    if (sm.excelOriginal === undefined) sm.excelOriginal = null;
    if (sm.excelOriginalName === undefined) sm.excelOriginalName = null;
    if (!sm.createdAt) sm.createdAt = Date.now();
    if (!sm.updatedAt) sm.updatedAt = sm.createdAt;
  });
}

function getPdSubmodule(id) {
  ensureProcesosDiseno();
  return data.procesosDiseno.submodules.find(s => s.id === id) || null;
}

function setPdStatus(msg, type) {
  const el = document.getElementById('pd-status');
  if (!el) return;
  if (!msg) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.style.whiteSpace = 'pre-line';
  el.style.color = type === 'error' ? 'var(--red)' : (type === 'ok' ? 'var(--green)' : 'var(--color-text-secondary)');
  el.textContent = msg;
}

function openProcesosDiseno() {
  ensureProcesosDiseno();
  document.getElementById('modal-procesos-diseno').classList.add('open');
  setPdStatus('');
  pdCurrentSubmoduleId = null;
  const inp = document.getElementById('pd-search-input');
  if (inp) inp.value = '';
  const clearBtn = document.getElementById('pd-search-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  renderPdView();
}

function closeProcesosDiseno() {
  closeModal('modal-procesos-diseno');
}

function renderPdView() {
  ensureProcesosDiseno();
  const listView = document.getElementById('pd-list-view');
  const tableView = document.getElementById('pd-table-view');
  const excelView = document.getElementById('pd-excel-view');
  const pdfView = document.getElementById('pd-pdf-view');
  const titleEl = document.getElementById('pd-current-title');
  if (!listView || !tableView) return;

  updatePdModeBadge();

  if (!pdCurrentSubmoduleId) {
    listView.style.display = 'block';
    tableView.style.display = 'none';
    const modalBox = document.querySelector('#modal-procesos-diseno .modal');
    if (modalBox) modalBox.classList.remove('pd-modal-wide');
    renderPdSubmoduleList();
  } else {
    listView.style.display = 'none';
    const sm = getPdSubmodule(pdCurrentSubmoduleId);
    if (titleEl) titleEl.textContent = sm ? sm.label : '';

    const isPdf = sm && sm.type === 'pdf';
    tableView.style.display = isPdf ? 'flex' : 'block';
    if (excelView) excelView.style.display = isPdf ? 'none' : 'block';
    if (pdfView) pdfView.style.display = isPdf ? 'flex' : 'none';

    const modalBox = document.querySelector('#modal-procesos-diseno .modal');
    if (modalBox) modalBox.classList.toggle('pd-modal-wide', !!isPdf);

    if (isPdf) {
      renderPdPdfView();
    } else {
      renderPdTable();
    }
  }
}

const pdSubmoduleOpInProgress = new Set();

function filterPdSubmodules() {
  const inp = document.getElementById('pd-search-input');
  const clearBtn = document.getElementById('pd-search-clear');
  if (!inp) return;

  const rawQ = (inp.value || '').trim();
  const q = rawQ.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (clearBtn) clearBtn.style.display = rawQ ? 'flex' : 'none';

  const cont = document.getElementById('pd-submodule-list');
  if (!cont) return;

  const items = cont.querySelectorAll('[data-pd-submodule-id]');
  items.forEach(item => {
    const nombre = (item.getAttribute('data-pd-search-text') || '').toLowerCase();
    const coincide = !q || nombre.includes(q);
    item.style.display = coincide ? '' : 'none';
  });

  const visibles = Array.from(items).filter(i => i.style.display !== 'none');
  let emptyMsg = cont.querySelector('.pd-search-empty');
  if (items.length > 0 && visibles.length === 0) {
    if (!emptyMsg) {
      emptyMsg = document.createElement('div');
      emptyMsg.className = 'pd-search-empty';
      emptyMsg.style.cssText = 'padding:20px; text-align:center; color:var(--color-text-secondary); font-size:13px;';
      emptyMsg.textContent = 'No se encontraron apartados con ese nombre.';
      cont.appendChild(emptyMsg);
    }
  } else if (emptyMsg) {
    emptyMsg.remove();
  }
}

function clearPdSearch() {
  const inp = document.getElementById('pd-search-input');
  if (inp) inp.value = '';
  filterPdSubmodules();
}

function renderPdSubmoduleList() {
  const cont = document.getElementById('pd-submodule-list');
  if (!cont) return;

  cont.innerHTML = data.procesosDiseno.submodules.map(sm => {
    const busy = pdSubmoduleOpInProgress.has(sm.id);
    const isExcel = sm.type === 'excel';
    const icon = isExcel ? 'ti-file-spreadsheet' : 'ti-file-type-pdf';
    const subtitle = isExcel
      ? `Excel · ${sm.rows.length} registro(s) · ${sm.headers.length} columna(s)`
      : `PDF · ${sm.pdfContent ? (sm.pdfName || 'archivo cargado') : 'sin archivo todavía'}`;
    return `
    <div data-pd-submodule-id="${sm.id}" data-pd-search-text="${escHtml(sm.label)}" style="display:flex; align-items:stretch; gap:6px; ${busy ? 'opacity:0.55;' : ''}">
      <button class="btn" style="justify-content:flex-start; flex:1; min-height:56px; text-align:left;" onclick="openPdSubmodule('${sm.id}')" ${busy ? 'disabled' : ''}>
        <i class="ti ${icon}" style="font-size:18px; margin-right:6px;"></i>
        <span style="display:flex; flex-direction:column; align-items:flex-start;">
          <span style="font-weight:700;">${escHtml(sm.label)}</span>
          <span style="font-weight:400; font-size:11px; color:var(--color-text-secondary);">${escHtml(subtitle)}</span>
        </span>
      </button>
      ${isEditableMode ? `
        <button class="btn btn-ghost" title="Editar nombre/tipo" onclick="renamePdSubmodule('${sm.id}')" ${busy ? 'disabled' : ''}><i class="ti ti-pencil"></i></button>
        <button class="btn btn-danger-ghost" title="Eliminar apartado" onclick="deletePdSubmodule('${sm.id}')" ${busy ? 'disabled' : ''}>${busy ? '<i class="ti ti-loader"></i>' : '<i class="ti ti-trash"></i>'}</button>
      ` : ''}
    </div>`;
  }).join('');

  try { filterPdSubmodules(); } catch (e) {}
}

let pdSubmoduleModalMode = 'create';
let pdSubmoduleModalEditId = null;
let pdSubmoduleModalSelectedType = 'excel';

function selectPdSubmoduleType(type) {
  const excelOpt = document.getElementById('pd-submodule-type-excel-opt');
  const pdfOpt = document.getElementById('pd-submodule-type-pdf-opt');
  if (excelOpt.classList.contains('locked') || pdfOpt.classList.contains('locked')) return;
  pdSubmoduleModalSelectedType = type;
  excelOpt.classList.toggle('selected', type === 'excel');
  pdfOpt.classList.toggle('selected', type === 'pdf');
  excelOpt.querySelector('input').checked = type === 'excel';
  pdfOpt.querySelector('input').checked = type === 'pdf';
}

function addPdSubmodule() {
  if (!isEditableMode) return;
  openPdSubmoduleCreateModal();
}

function openPdSubmoduleCreateModal() {
  pdSubmoduleModalMode = 'create';
  pdSubmoduleModalEditId = null;
  document.getElementById('pd-submodule-modal-title').textContent = 'Nuevo apartado';
  document.getElementById('pd-submodule-save-btn').textContent = 'Crear apartado';
  document.getElementById('pd-submodule-name').value = '';
  document.getElementById('pd-submodule-type-locked-note').style.display = 'none';
  document.getElementById('pd-submodule-type-excel-opt').classList.remove('locked');
  document.getElementById('pd-submodule-type-pdf-opt').classList.remove('locked');
  selectPdSubmoduleType('excel');
  document.getElementById('modal-pd-submodule').classList.add('open');
}

function renamePdSubmodule(id) {
  if (!isEditableMode) return;
  if (pdSubmoduleOpInProgress.has(id)) return;
  const sm = getPdSubmodule(id);
  if (!sm) return;
  const hasData = sm.type === 'excel' ? (sm.rows.length > 0 || sm.headers.length > 0) : !!sm.pdfContent;

  pdSubmoduleModalMode = 'edit';
  pdSubmoduleModalEditId = id;
  document.getElementById('pd-submodule-modal-title').textContent = 'Editar apartado';
  document.getElementById('pd-submodule-save-btn').textContent = 'Guardar cambios';
  document.getElementById('pd-submodule-name').value = sm.label;
  const excelOpt = document.getElementById('pd-submodule-type-excel-opt');
  const pdfOpt = document.getElementById('pd-submodule-type-pdf-opt');
  const lockedNote = document.getElementById('pd-submodule-type-locked-note');
  excelOpt.classList.toggle('locked', hasData);
  pdfOpt.classList.toggle('locked', hasData);
  lockedNote.style.display = hasData ? 'block' : 'none';
  selectPdSubmoduleType(sm.type);
  document.getElementById('modal-pd-submodule').classList.add('open');
}

async function confirmPdSubmoduleModal() {
  const name = document.getElementById('pd-submodule-name').value.trim();
  if (!name) { alert('Escribe un nombre para el apartado.'); return; }
  const type = pdSubmoduleModalSelectedType;

  ensureProcesosDiseno();
  const dup = data.procesosDiseno.submodules.some(s => s.label.toLowerCase() === name.toLowerCase() && s.id !== pdSubmoduleModalEditId);
  if (dup) { alert('Ya existe un apartado con ese nombre.'); return; }

  if (pdSubmoduleModalMode === 'create') {
    closeModal('modal-pd-submodule');
    await createPdSubmodule(name, type);
  } else {
    closeModal('modal-pd-submodule');
    await updatePdSubmodule(pdSubmoduleModalEditId, name, type);
  }
}

// --- ELIMINADO: guardado automático al crear apartado ---
async function createPdSubmodule(name, type) {
  if (pdSubmoduleOpInProgress.has('new')) return;
  pdSubmoduleOpInProgress.add('new');
  renderPdSubmoduleList();

  const now = Date.now();
  const newSm = { id: 'sm_' + uid(), label: name, type, headers: [], rows: [], pdfContent: null, pdfName: null, createdAt: now, updatedAt: now };
  data.procesosDiseno.submodules.push(newSm);

  pdSubmoduleOpInProgress.delete('new');
  renderPdSubmoduleList();
  setPdStatus(`✅ Apartado "${name}" (${type === 'pdf' ? 'PDF' : 'Excel'}) creado. Presiona "Guardar en GitHub" para subirlo.`, 'ok');
}

// --- ELIMINADO: guardado automático al actualizar apartado ---
async function updatePdSubmodule(id, name, type) {
  if (pdSubmoduleOpInProgress.has(id)) return;
  const sm = getPdSubmodule(id);
  if (!sm) return;
  const hasData = sm.type === 'excel' ? (sm.rows.length > 0 || sm.headers.length > 0) : !!sm.pdfContent;
  const oldName = sm.label;
  const oldType = sm.type;
  if (name === oldName && type === oldType) return;

  sm.label = name;
  if (!hasData) sm.type = type;
  sm.updatedAt = Date.now();

  renderPdSubmoduleList();
  if (pdCurrentSubmoduleId === id) renderPdView();
  setPdStatus(`✅ Apartado actualizado. Presiona "Guardar en GitHub" para subirlo.`, 'ok');
}

// --- ELIMINADO: guardado automático al eliminar apartado ---
async function deletePdSubmodule(id) {
  if (!isEditableMode) return;
  if (!isAdminSafe()) { alert('🔒 Solo un administrador puede eliminar apartados.'); return; }
  if (pdSubmoduleOpInProgress.has(id)) return;
  const sm = getPdSubmodule(id);
  if (!sm) return;
  const contentDesc = sm.type === 'pdf' ? (sm.pdfContent ? 'su archivo PDF' : 'ningún archivo todavía') : `sus ${sm.rows.length} registro(s)`;
  if (!confirm(`¿ELIMINAR EL APARTADO "${sm.label.toUpperCase()}"? Se perderá ${contentDesc}.`)) return;

  pdSubmoduleOpInProgress.add(id);
  renderPdSubmoduleList();

  const cfg = loadGithubConfig();
  if (sm.type === 'pdf' && sm.pdfContent && !sm.pdfContent.startsWith('data:')) {
    try {
      if (!cfg || !cfg.repo || !cfg.token) throw new Error('No hay una conexión de GitHub configurada; no se puede borrar el archivo del repositorio desde aquí.');
      const branch = cfg.branch || 'main';
      const headers = { 'Authorization': `Bearer ${cfg.token}`, 'Accept': 'application/vnd.github+json' };
      await deleteFileFromGithub(cfg.repo, sm.pdfContent, branch, headers, ghCommitMessage(`Eliminar apartado "${sm.label}"`));
    } catch (err) {
      console.error('No se pudo borrar el PDF del apartado:', err);
      alert('❌ No se pudo eliminar el apartado: ' + (err.message || err) + '\n\nSe conservó sin cambios.');
      pdSubmoduleOpInProgress.delete(id);
      renderPdSubmoduleList();
      return;
    }
  }

  const idx = data.procesosDiseno.submodules.findIndex(s => s.id === id);
  const removed = data.procesosDiseno.submodules.splice(idx, 1)[0];

  pdSubmoduleOpInProgress.delete(id);
  renderPdSubmoduleList();
  setPdStatus(`✅ Apartado "${removed.label}" eliminado. Presiona "Guardar en GitHub" para aplicarlo.`, 'ok');
}

function openPdSubmodule(id) {
  pdCurrentSubmoduleId = id;
  setPdStatus('');
  renderPdView();
}

function backToPdList() {
  pdCurrentSubmoduleId = null;
  setPdStatus('');
  renderPdView();
}

function updatePdModeBadge() {
  const badge = document.getElementById('pd-mode-badge');
  const label = document.getElementById('pd-mode-label');
  if (!badge || !label) return;
  const icon = badge.querySelector('i');
  if (isEditableMode) {
    badge.style.background = '#dcfce7'; badge.style.color = '#15803d'; badge.style.borderColor = '#bbf7d0';
    label.textContent = 'Edición activa';
    if (icon) icon.className = 'ti ti-lock-open';
  } else {
    badge.style.background = '#f1f5f6'; badge.style.color = 'var(--color-text-secondary)'; badge.style.borderColor = 'var(--color-border-secondary)';
    label.textContent = 'Solo lectura';
    if (icon) icon.className = 'ti ti-eye';
  }
}

function triggerPdImport() {
  if (!isEditableMode) return;
  document.getElementById('pd-import-input').click();
}

function handlePdImport(e) {
  if (!isEditableMode) { e.target.value = ''; return; }
  const file = e.target.files[0];
  if (!file) return;
  const submoduleId = pdCurrentSubmoduleId;
  const sm = getPdSubmodule(submoduleId);
  if (!sm) { e.target.value = ''; return; }
  if (typeof XLSX === 'undefined') {
    alert('No se pudo cargar la librería de Excel. Revisa tu conexión a internet e intenta de nuevo.');
    e.target.value = ''; return;
  }
  const wrap = document.getElementById('pd-table-wrap');
  if (wrap) wrap.classList.add('pd-loading');
  setPdStatus('Leyendo archivo...', 'info');
  const oldExcelPath = (typeof sm.excelOriginal === 'string' && !sm.excelOriginal.startsWith('data:')) ? sm.excelOriginal : null;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (!rows.length) { setPdStatus('El archivo está vacío.', 'error'); return; }

      const headers = rows[0].map((h, idx) => String(h || '').trim() || `Columna ${idx + 1}`);
      const dataRows = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.every(c => String(c || '').trim() === '')) continue;
        const obj = {};
        headers.forEach((h, idx) => { obj[h] = r[idx] !== undefined ? String(r[idx]) : ''; });
        dataRows.push(obj);
      }

      if (!dataRows.length) {
        setPdStatus('No se encontraron registros con datos en el archivo.', 'error');
        return;
      }

      sm.headers = headers;
      sm.rows = dataRows;
      const bytes = new Uint8Array(ev.target.result);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      const mime = file.name.toLowerCase().endsWith('.xls')
        ? 'application/vnd.ms-excel'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      sm.excelOriginal = `data:${mime};base64,${btoa(binary)}`;
      sm.excelOriginalName = file.name;
      sm.updatedAt = Date.now();

      if (oldExcelPath) {
        (async () => {
          try {
            const cfg = loadGithubConfig();
            if (cfg && cfg.repo && cfg.token) {
              const branch = cfg.branch || 'main';
              const hdrs = { 'Authorization': `Bearer ${cfg.token}`, 'Accept': 'application/vnd.github+json' };
              await deleteFileFromGithub(cfg.repo, oldExcelPath, branch, hdrs, ghCommitMessage(`Sustituir Excel del apartado "${sm.label}"`));
            }
          } catch (delErr) {
            console.warn('No se pudo borrar el Excel original anterior:', delErr);
          }
        })();
      }

      renderPdTable();
      setPdStatus(`✅ Se importaron ${dataRows.length} registro(s) con ${headers.length} columna(s) en "${sm.label}". Presiona "Guardar cambios del Excel" para dejarlo permanente.`, 'ok');
    } catch (err) {
      console.error('Error al importar Procesos de Diseño:', err);
      setPdStatus('❌ No se pudo leer el archivo. Verifica que sea un .xlsx/.xls válido.', 'error');
    } finally {
      if (wrap) wrap.classList.remove('pd-loading');
      e.target.value = '';
    }
  };
  reader.onerror = () => {
    setPdStatus('❌ No se pudo leer el archivo.', 'error');
    if (wrap) wrap.classList.remove('pd-loading');
    e.target.value = '';
  };
  reader.readAsArrayBuffer(file);
}

function renderPdTable() {
  const sm = getPdSubmodule(pdCurrentSubmoduleId);
  const thead = document.getElementById('pd-table-head');
  const tbody = document.getElementById('pd-table-body');
  const wrap = document.getElementById('pd-table-wrap');
  const empty = document.getElementById('pd-empty-state');
  const editorBar = document.getElementById('pd-editor-bar');
  if (!sm || !thead || !tbody || !wrap || !empty) return;

  if (editorBar) editorBar.style.display = isEditableMode ? 'flex' : 'none';

  const { headers, rows } = sm;

  if (!headers.length || !rows.length) {
    wrap.style.display = 'none';
    empty.style.display = 'block';
    thead.innerHTML = '';
    tbody.innerHTML = '';
    return;
  }
  wrap.style.display = 'block';
  empty.style.display = 'none';

  thead.innerHTML = '<tr>' + headers.map((h, cIdx) => `
    <th>
      <span style="display:flex; align-items:center; gap:6px;">
        ${escHtml(h)}
        ${isEditableMode ? `<button class="btn-ghost btn" title="Eliminar columna" style="padding:2px 4px;min-height:auto;" onclick="deletePdColumn(${cIdx})"><i class="ti ti-trash" style="font-size:12px;color:var(--red)"></i></button>` : ''}
      </span>
    </th>`).join('') +
    (isEditableMode ? '<th style="width:36px"></th>' : '') + '</tr>';

  tbody.innerHTML = rows.map((row, rIdx) => {
    const cells = headers.map(h => {
      const val = row[h] !== undefined ? row[h] : '';
      if (isEditableMode) {
        return `<td><input class="pd-cell-input" value="${escHtml(val).replace(/"/g, '&quot;')}" onchange="editPdCell(${rIdx}, '${h.replace(/'/g, "\\'")}', this.value)"></td>`;
      }
      return `<td><span class="pd-cell-static">${escHtml(val)}</span></td>`;
    }).join('');
    const delCell = isEditableMode ? `<td><button class="btn-ghost btn" title="Eliminar fila" style="padding:4px;min-height:auto;" onclick="deletePdRow(${rIdx})"><i class="ti ti-trash" style="font-size:13px;color:var(--red)"></i></button></td>` : '';
    return '<tr>' + cells + delCell + '</tr>';
  }).join('');
}

function renderPdPdfView() {
  const sm = getPdSubmodule(pdCurrentSubmoduleId);
  const viewerWrap = document.getElementById('pd-pdf-viewer-wrap');
  const viewer = document.getElementById('pd-pdf-viewer');
  const emptyState = document.getElementById('pd-pdf-empty-state');
  const uploadBtn = document.getElementById('pd-pdf-upload-btn');
  const downloadBtn = document.getElementById('pd-pdf-download-btn');
  const replaceBtn = document.getElementById('pd-pdf-replace-btn');
  const deleteBtn = document.getElementById('pd-pdf-delete-btn');
  if (!sm) return;

  const hasFile = !!sm.pdfContent;
  if (viewerWrap) viewerWrap.style.display = hasFile ? 'block' : 'none';
  if (emptyState) emptyState.style.display = hasFile ? 'none' : 'block';
  if (viewer) viewer.src = hasFile ? sm.pdfContent : 'about:blank';

  if (uploadBtn) uploadBtn.style.display = (!hasFile && isEditableMode) ? 'inline-flex' : 'none';
  if (downloadBtn) downloadBtn.style.display = hasFile ? 'inline-flex' : 'none';
  if (replaceBtn) replaceBtn.style.display = (hasFile && isEditableMode) ? 'inline-flex' : 'none';
  if (deleteBtn) deleteBtn.style.display = (hasFile && isEditableMode) ? 'inline-flex' : 'none';
}

function triggerPdPdfUpload() {
  if (!isEditableMode) return;
  document.getElementById('pd-pdf-input').click();
}

// --- ELIMINADO: guardado automático al subir PDF ---
function handlePdPdfUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const sm = getPdSubmodule(pdCurrentSubmoduleId);
  if (!sm) { e.target.value = ''; return; }
  const oldRemotePath = (typeof sm.pdfContent === 'string' && !sm.pdfContent.startsWith('data:')) ? sm.pdfContent : null;

  const reader = new FileReader();
  reader.onload = async (ev) => {
    setPdStatus('Cargando PDF...', 'info');
    if (oldRemotePath) {
      try {
        const cfg = loadGithubConfig();
        if (cfg && cfg.repo && cfg.token) {
          const branch = cfg.branch || 'main';
          const headers = { 'Authorization': `Bearer ${cfg.token}`, 'Accept': 'application/vnd.github+json' };
          await deleteFileFromGithub(cfg.repo, oldRemotePath, branch, headers, ghCommitMessage(`Sustituir PDF del apartado "${sm.label}"`));
        }
      } catch (err) {
        console.error('No se pudo borrar el PDF anterior antes de sustituirlo:', err);
        setPdStatus('❌ No se pudo sustituir el PDF: ' + (err.message || err), 'error');
        e.target.value = '';
        return;
      }
    }

    sm.pdfName = file.name;
    sm.pdfContent = ev.target.result;
    sm.updatedAt = Date.now();
    renderPdPdfView();
    renderPdSubmoduleList();
    setPdStatus('✅ PDF cargado. Presiona "Guardar en GitHub" para subirlo.', 'ok');
    e.target.value = '';
  };
  reader.onerror = () => { setPdStatus('❌ No se pudo leer el archivo.', 'error'); e.target.value = ''; };
  reader.readAsDataURL(file);
}

function downloadPdPdf() {
  const sm = getPdSubmodule(pdCurrentSubmoduleId);
  if (!sm || !sm.pdfContent) return;
  const a = document.createElement('a');
  a.href = sm.pdfContent;
  a.download = sm.pdfName || (sm.label + '.pdf');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function deletePdPdf() {
  if (!isEditableMode) return;
  if (!isAdminSafe()) { alert('🔒 Solo un administrador puede eliminar PDFs.'); return; }
  const sm = getPdSubmodule(pdCurrentSubmoduleId);

  if (!sm || !sm.pdfContent) return;
  if (!confirm('¿ESTÁS SEGURO DE QUE DESEAS ELIMINAR ESTE PDF?')) return;

  const isRemoteFile = !sm.pdfContent.startsWith('data:');

  try {
    if (isRemoteFile) {
      const cfg = loadGithubConfig();
      if (!cfg || !cfg.repo || !cfg.token) throw new Error('No hay una conexión de GitHub configurada; no se puede borrar el archivo del repositorio desde aquí.');
      const branch = cfg.branch || 'main';
      const headers = { 'Authorization': `Bearer ${cfg.token}`, 'Accept': 'application/vnd.github+json' };
      await deleteFileFromGithub(cfg.repo, sm.pdfContent, branch, headers, ghCommitMessage(`Eliminar PDF del apartado "${sm.label}"`));
    }
  } catch (err) {
    console.error('No se pudo borrar el PDF:', err);
    alert('❌ No se pudo eliminar el PDF: ' + (err.message || err) + '\n\nSe conservó sin cambios.');
    return;
  }

  sm.pdfContent = null;
  sm.pdfName = null;
  sm.updatedAt = Date.now();
  renderPdPdfView();
  renderPdSubmoduleList();
  setPdStatus('✅ PDF eliminado. Presiona "Guardar en GitHub" para aplicarlo.', 'ok');
}

function editPdCell(rowIdx, header, value) {
  const sm = getPdSubmodule(pdCurrentSubmoduleId);
  if (!sm || !sm.rows[rowIdx]) return;
  sm.rows[rowIdx][header] = value;
}

function addPdRow() {
  if (!isEditableMode) return;
  const sm = getPdSubmodule(pdCurrentSubmoduleId);
  if (!sm) return;
  if (!sm.headers.length) { setPdStatus('Agrega al menos una columna antes de insertar filas.', 'error'); return; }
  const newRow = {};
  sm.headers.forEach(h => { newRow[h] = ''; });
  sm.rows.push(newRow);
  renderPdTable();
}

function deletePdRow(rowIdx) {
  if (!isEditableMode) return;
  const sm = getPdSubmodule(pdCurrentSubmoduleId);
  if (!sm || !sm.rows[rowIdx]) return;
  if (!confirm('¿Eliminar esta fila? Se quitará del Excel al guardar.')) return;
  sm.rows.splice(rowIdx, 1);
  renderPdTable();
}

function addPdColumn() {
  if (!isEditableMode) return;
  const sm = getPdSubmodule(pdCurrentSubmoduleId);
  if (!sm) return;
  const name = prompt('Nombre de la nueva columna:', `Columna ${sm.headers.length + 1}`);
  if (!name || !name.trim()) return;
  const finalName = name.trim();
  if (sm.headers.includes(finalName)) { setPdStatus('Ya existe una columna con ese nombre.', 'error'); return; }
  sm.headers.push(finalName);
  sm.rows.forEach(r => { r[finalName] = ''; });
  renderPdTable();
}

function deletePdColumn(colIdx) {
  if (!isEditableMode) return;
  const sm = getPdSubmodule(pdCurrentSubmoduleId);
  if (!sm || !sm.headers[colIdx]) return;
  const colName = sm.headers[colIdx];
  if (!confirm(`¿Eliminar la columna "${colName}"? Se quitará de todas las filas al guardar.`)) return;
  sm.headers.splice(colIdx, 1);
  sm.rows.forEach(r => { delete r[colName]; });
  renderPdTable();
}

// --- MODIFICADO: solo borra la hoja original si se va a subir de inmediato ---
async function savePdChanges() {
  if (!isEditableMode) return;
  const sm = getPdSubmodule(pdCurrentSubmoduleId);
  if (!sm) return;
  const saveBtn = document.getElementById('pd-save-btn');
  const original = saveBtn ? saveBtn.innerHTML : '';
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="ti ti-loader"></i> Guardando...'; }
  const wrap = document.getElementById('pd-table-wrap');
  if (wrap) wrap.classList.add('pd-loading');
  setPdStatus('Guardando cambios...', 'info');

  try {
    const ghStatusBefore = document.getElementById('gh-status');
    const txtBefore = ghStatusBefore ? (ghStatusBefore.textContent || '') : '';

    await quickSaveGithub();

    const ghStatus = document.getElementById('gh-status');
    const txt = ghStatus ? (ghStatus.textContent || '') : '';

    if (txt.includes('✅')) {
      setPdStatus('✅ Cambios guardados correctamente en GitHub.', 'ok');
    } else if (txt && txt !== txtBefore) {
      setPdStatus('⚠️ ' + txt, 'error');
    } else {
      setPdStatus('⚠️ No hay una conexión de GitHub configurada todavía. Completa "Guardar en GitHub" (ícono de engranaje) una vez, y luego vuelve a intentar "Guardar cambios del Excel".', 'error');
    }
  } catch (err) {
    console.error('Error al guardar Procesos de Diseño:', err);
    setPdStatus('❌ No se pudo guardar: ' + (err.message || err), 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = original; }
    if (wrap) wrap.classList.remove('pd-loading');
  }
}

function exportPdExcel() {
  const sm = getPdSubmodule(pdCurrentSubmoduleId);
  if (!sm) return;

  if (sm.excelOriginal) {
    const a = document.createElement('a');
    a.href = sm.excelOriginal;
    a.download = sm.excelOriginalName || `${sm.label}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }

  exportPdExcelRebuilt();
}

function exportPdExcelRebuilt() {
  const sm = getPdSubmodule(pdCurrentSubmoduleId);
  if (!sm) return;
  if (typeof XLSX === 'undefined') {
    alert('No se pudo cargar la librería de Excel. Revisa tu conexión a internet e intenta de nuevo.');
    return;
  }
  if (!sm.rows.length) {
    alert(`No hay datos en "${sm.label}" para exportar todavía.`);
    return;
  }
  const ws = XLSX.utils.json_to_sheet(sm.rows, { header: sm.headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sm.label.slice(0, 31));
  const fechaHoy = new Date().toISOString().slice(0, 10);
  const fileSlug = sm.id.replace(/[^a-z0-9_-]/gi, '_');
  XLSX.writeFile(wb, `${fileSlug}_${fechaHoy}.xlsx`);
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

              existingItem.createdBy = existingItem.createdBy || impItem.createdBy || null;
              existingItem.createdByName = existingItem.createdByName || impItem.createdByName || null;
              existingItem.modifiedBy = existingItem.modifiedBy || impItem.modifiedBy || null;
              existingItem.modifiedByName = existingItem.modifiedByName || impItem.modifiedByName || null;
              existingItem.modifiedAt = existingItem.modifiedAt || impItem.modifiedAt || null;

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

function startEdit(itemId){
  if (!isEditableMode) return;
  editingItemId=itemId;
  render();
  if (typeof initAllRichEditors === 'function') initAllRichEditors();
}

function cancelEdit(){
  editingItemId=null;
  pendingFechaUnlockItemId=null;
  render();
}

let pendingFechaUnlockItemId = null;

function unlockFechaEdit(itemId) {
  if (!isEditableMode) return;
  pendingFechaUnlockItemId = itemId;
  const pass = document.getElementById('fecha-auth-password');
  const err = document.getElementById('fecha-auth-error');
  if (pass) pass.value = '';
  if (err) err.style.display = 'none';
  document.getElementById('modal-fecha-auth').classList.add('open');
  setTimeout(() => pass && pass.focus(), 100);
}

function validateFechaAuth() {
  ensureAccessPasswords();
  const itemId = pendingFechaUnlockItemId;
  const inputPass = document.getElementById('fecha-auth-password').value;

  if (itemId && data.accessPasswords.includes(inputPass)) {
    closeModal('modal-fecha-auth');
    const input = document.getElementById('ef-' + itemId);
    if (input) {
      input.disabled = false;
      input.focus();
      const lockBtn = input.nextElementSibling;
      if (lockBtn && lockBtn.tagName === 'BUTTON') lockBtn.style.display = 'none';
    }
    pendingFechaUnlockItemId = null;
  } else {
    const modal = document.querySelector('#modal-fecha-auth .modal');
    modal.classList.remove('auth-shake');
    void modal.offsetWidth;
    modal.classList.add('auth-shake');
    const err = document.getElementById('fecha-auth-error');
    if (err) err.style.display = 'block';
  }
}
function saveEdit(naveId,itemId){
  if (!isEditableMode) return;
  const t=document.getElementById('et-'+itemId).value.trim();
  const d = getEditorContent('ed-' + itemId);
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

      const _user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
      if (_user) {
        item.modifiedBy = _user.username;
        item.modifiedByName = _user.nombre;
        item.modifiedAt = Date.now();
      }

      if(nave.tipo === 'errores' && c === 'mejora') nave.tipo = 'ambos';
      if(nave.tipo === 'mejoras' && (c === 'error' || c === 'ajuste')) nave.tipo = 'ambos';
    }
  }
  editingItemId=null;render();
}

function openAddItem(naveId,defaultCat){
  if (!isEditableMode) return;
  currentNaveId=naveId;
  document.getElementById('new-item-title').value='';
  setEditorContent('new-item-desc', '');
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
  setTimeout(() => {
    if (typeof initAllRichEditors === 'function') initAllRichEditors();
  }, 100);
}
function selectCat(el,val){
  newCat=val;
  document.querySelectorAll('#cat-select .radio-opt').forEach(x=>x.classList.remove('selected'));
  el.classList.add('selected');
}
function saveItem(){
  if (!isEditableMode) return;
  const title=document.getElementById('new-item-title').value.trim();
  const desc = getEditorContent('new-item-desc');
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
      createdBy: (typeof getCurrentUser === 'function' && getCurrentUser()) ? getCurrentUser().username : 'anonimo',
      createdByName: (typeof getCurrentUser === 'function' && getCurrentUser()) ? getCurrentUser().nombre : 'Anónimo',
      modifiedBy: null,
      modifiedByName: null,
      modifiedAt: null,
      proceso: { habilitado: false, planos: false, etiquetas: false, planoTerminado: false },
      cancelado: false,
      adjuntos: ["","","","",""]
    });
    if(nave.tipo === 'errores' && newCat === 'mejora') nave.tipo = 'ambos';
    if(nave.tipo === 'mejoras' && (newCat === 'error' || newCat === 'ajuste')) nave.tipo = 'ambos';
  }
  closeModal('modal-item');render();
}

function removeNave(id){
  if (!isEditableMode) return;
  if (!isAdminSafe()) { alert('🔒 Solo un administrador puede eliminar muebles.'); return; }
  if(!confirm('¿Eliminar este mueble?'))return;
  data.naves = data.naves.filter(n => n.id !== id);
  render();
}

function removeItem(naveId, itemId){
  if (!isEditableMode) return;
  if (!isAdminSafe()) { alert('🔒 Solo un administrador puede eliminar cambios.'); return; }
  const nave = data.naves.find(n => n.id === naveId);
  if(nave) { nave.items = nave.items.filter(i => i.id !== itemId); render(); }
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
      .exporting-pdf .side-menu-toggle,
      .exporting-pdf .side-menu,
      .exporting-pdf .side-menu-backdrop,
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
      .exporting-pdf .items-grid {
        display: block !important;
      }
      .exporting-pdf .item-card {
        margin-bottom: 7px !important;
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

/* ============================================================
   CONFIGURACIÓN DE GITHUB
   ============================================================ */
const GH_CONFIG_KEY = 'reporte_produccion_gh_config';

function getGhConfigActiveUsername() {
  if (typeof getCurrentUser === 'function') {
    const u = getCurrentUser();
    if (u && u.username) return u.username;
  }
  return null;
}

function loadGithubConfig() {
  try {
    const raw = localStorage.getItem(GH_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('loadGithubConfig error:', e);
    return null;
  }
}

function saveGithubConfig(cfg) {
  localStorage.setItem(GH_CONFIG_KEY, JSON.stringify(cfg));
}

function clearGithubConfig() {
  localStorage.removeItem(GH_CONFIG_KEY);
}

window.onUserSessionChanged = function(username) {
  console.log('[GitHub Config] Usuario activo cambiado a:', username || '(anónimo)');
  const modal = document.getElementById('modal-github');
  if (modal && modal.classList.contains('open')) {
    const cfg = loadGithubConfig();
    const repoEl = document.getElementById('gh-repo');
    const pathEl = document.getElementById('gh-path');
    const branchEl = document.getElementById('gh-branch');
    const tokenEl = document.getElementById('gh-token');
    if (repoEl) repoEl.value = cfg && cfg.repo ? cfg.repo : '';
    if (pathEl) pathEl.value = cfg && cfg.path ? cfg.path : '';
    if (branchEl) branchEl.value = cfg && cfg.branch ? cfg.branch : 'main';
    if (tokenEl) tokenEl.value = cfg && cfg.token ? cfg.token : '';
    const status = document.getElementById('gh-status');
    if (status) {
      status.style.display = 'block';
      status.style.color = 'var(--color-text-secondary)';
      status.textContent = username
        ? `Configuración de GitHub compartida. Guardarás los cambios como: ${username}`
        : 'Configuración de GitHub compartida. Inicia sesión para que tus commits lleven tu nombre.';
    }
  }
};

function ghCommitMessage(base) {
  const u = getGhConfigActiveUsername();
  if (!u) return base;
  return `${base} [${u}]`;
}

function openGithubModal() {
  const cfg = loadGithubConfig();
  document.getElementById('gh-repo').value = cfg && cfg.repo ? cfg.repo : '';
  document.getElementById('gh-path').value = cfg && cfg.path ? cfg.path : '';
  document.getElementById('gh-branch').value = cfg && cfg.branch ? cfg.branch : 'main';
  document.getElementById('gh-token').value = cfg && cfg.token ? cfg.token : '';
  document.getElementById('gh-remember').checked = true;

  const status = document.getElementById('gh-status');
  status.style.display = 'block';
  status.style.whiteSpace = 'pre-line';

  const username = getGhConfigActiveUsername();
  if (username) {
    status.style.color = 'var(--color-text-secondary)';
    status.textContent = `Esta configuración de GitHub es COMPARTIDA por todos los usuarios.\n\nAl guardar ahora, el commit llevará la etiqueta: [${username}].`;
  } else {
    status.style.color = 'var(--color-text-secondary)';
    status.textContent = '⚠️ No has iniciado sesión. Puedes guardar igual (con el token compartido), pero el commit no llevará tu nombre.';
  }

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
  status.style.whiteSpace = 'pre-line';
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

const ghShaCache = {};
function ghCacheKey(repo, repoPath, branch) { return `${repo}|${repoPath}|${branch}`; }

function describeGithubError(status, action, detail) {
  const map = {
    401: 'Autenticación fallida (401). El Token de GitHub es inválido, expiró o no fue enviado correctamente.',
    403: 'Permisos insuficientes (403). El Token no tiene scope "repo" (o "Contents: Read and write" si es fino), o superaste el límite de peticiones.',
    404: 'No encontrado (404). El repositorio, la rama o la ruta son incorrectos, o el Token no tiene permiso para verlos.',
    409: 'Conflicto (409). El archivo fue modificado en GitHub entre tu lectura y tu escritura. La app reintenta automáticamente; si vuelve a fallar, refresca y vuelve a intentar.',
    422: 'Datos inválidos (422). GitHub rechazó el contenido. Revisa que la rama exista y que el nombre del archivo sea válido.',
    500: 'Error interno de GitHub (500). Intenta de nuevo en unos minutos.',
    502: 'GitHub no disponible (502). Intenta de nuevo en unos minutos.',
    503: 'GitHub sobrecargado (503). Intenta de nuevo en unos minutos.'
  };
  const base = map[status] || `Error de GitHub API (${status}).`;
  return base + (detail ? `\nDetalle: ${detail}` : '') + (action ? `\nAcción: ${action}` : '');
}

async function putFileToGithub(repo, repoPath, branch, headers, contentBase64, message, knownSha) {
  const apiUrl = githubApiUrl(repo, repoPath);
  let sha = knownSha;

  if (sha === undefined) {
    const getResp = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, { headers, cache: 'no-store' });
    if (getResp.status === 200) {
      const info = await getResp.json();
      sha = info.sha;
    } else if (getResp.status !== 404) {
      const errBody = await getResp.json().catch(() => ({}));
      const e = new Error(describeGithubError(getResp.status, `Al consultar ${repoPath} antes de guardarlo.`, errBody.message));
      e.status = getResp.status;
      throw e;
    }
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
    const e = new Error(describeGithubError(putResp.status, `Al guardar ${repoPath}.`, errBody.message));
    e.status = putResp.status;
    throw e;
  }
  return putResp.json().catch(() => null);
}

async function putFileToGithubCached(repo, repoPath, branch, headers, contentBase64, message) {
  const key = ghCacheKey(repo, repoPath, branch);
  const cachedSha = ghShaCache[key];
  try {
    const result = await putFileToGithub(repo, repoPath, branch, headers, contentBase64, message, cachedSha);
    if (result && result.content && result.content.sha) ghShaCache[key] = result.content.sha;
    return result;
  } catch (err) {
    if (err.status === 409 && cachedSha !== undefined) {
      delete ghShaCache[key];
      const result = await putFileToGithub(repo, repoPath, branch, headers, contentBase64, message, undefined);
      if (result && result.content && result.content.sha) ghShaCache[key] = result.content.sha;
      return result;
    }
    throw err;
  }
}

function createNewFileOnGithub(repo, repoPath, branch, headers, contentBase64, message) {
  return putFileToGithub(repo, repoPath, branch, headers, contentBase64, message, null);
}

async function runWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const current = idx++;
      results[current] = await tasks[current]();
    }
  }
  const poolSize = Math.max(1, Math.min(limit, tasks.length));
  await Promise.all(Array.from({ length: poolSize }, worker));
  return results;
}

function commitPendingEditsBeforePush() {
  if (editingItemId) {
    const nave = data.naves.find(n => n.items && n.items.some(i => i.id === editingItemId));
    if (nave) {
      const pendingId = editingItemId;
      saveEdit(nave.id, pendingId);
    }
  }
}

function extFromDataUri(uri) {
  const m = uri.match(/^data:image\/(\w+);base64,/);
  if (!m) return 'jpg';
  const fmt = m[1].toLowerCase();
  return fmt === 'jpeg' ? 'jpg' : fmt;
}

/* ============================================================
   NUEVA API: guardado agrupado en 1 sola operación (1 commit)
   ============================================================
   Usa la API de Git Data de GitHub:
   1. Obtener el commit actual de la rama → tree base.
   2. Crear un blob por cada archivo nuevo (imágenes, PDFs, Excel).
   3. Crear un tree nuevo con TODOS los blobs + los archivos JSON.
   4. Crear un commit nuevo con ese tree.
   5. Actualizar la rama para que apunte al nuevo commit.

   Todo en UNA SOLA operación → 1 commit en lugar de N commits.
   ============================================================ */

async function getBranchHead(repo, branch, headers) {
  const url = `https://api.github.com/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`;
  const resp = await fetch(url, { headers, cache: 'no-store' });
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    throw new Error(describeGithubError(resp.status, `Al consultar la rama "${branch}".`, errBody.message));
  }
  const json = await resp.json();
  return json.object.sha;
}

async function getCommitTree(repo, commitSha, headers) {
  const url = `https://api.github.com/repos/${repo}/git/commits/${commitSha}`;
  const resp = await fetch(url, { headers, cache: 'no-store' });
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    throw new Error(describeGithubError(resp.status, `Al consultar el commit base.`, errBody.message));
  }
  const json = await resp.json();
  return json.tree.sha;
}

async function createBlob(repo, contentBase64, headers) {
  const url = `https://api.github.com/repos/${repo}/git/blobs`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: contentBase64, encoding: 'base64' })
  });
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    throw new Error(describeGithubError(resp.status, `Al crear un blob.`, errBody.message));
  }
  const json = await resp.json();
  return json.sha;
}

async function createTree(repo, baseTreeSha, entries, headers) {
  const url = `https://api.github.com/repos/${repo}/git/trees`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_tree: baseTreeSha, tree: entries })
  });
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    throw new Error(describeGithubError(resp.status, `Al crear el árbol de archivos.`, errBody.message));
  }
  const json = await resp.json();
  return json.sha;
}

async function createCommit(repo, message, treeSha, parentSha, headers) {
  const url = `https://api.github.com/repos/${repo}/git/commits`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, tree: treeSha, parents: [parentSha] })
  });
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    throw new Error(describeGithubError(resp.status, `Al crear el commit.`, errBody.message));
  }
  const json = await resp.json();
  return json.sha;
}

async function updateBranchRef(repo, branch, newCommitSha, headers) {
  const url = `https://api.github.com/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: newCommitSha, force: false })
  });
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    const e = new Error(describeGithubError(resp.status, `Al actualizar la rama.`, errBody.message));
    e.status = resp.status;
    throw e;
  }
  return resp.json().catch(() => null);
}

// Reintenta la operación completa en caso de 422 (rama cambió en medio)
async function commitGroupedPush(repo, branch, headers, entries, commitMessage, maxRetries = 3) {
  let lastErr = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const parentSha = await getBranchHead(repo, branch, headers);
      const baseTreeSha = await getCommitTree(repo, parentSha, headers);
      const treeSha = await createTree(repo, baseTreeSha, entries, headers);
      const newCommitSha = await createCommit(repo, commitMessage, treeSha, parentSha, headers);
      await updateBranchRef(repo, branch, newCommitSha, headers);
      return newCommitSha;
    } catch (err) {
      lastErr = err;
      // 422 = el ref cambió entre lectura y escritura. Reintentamos.
      if (err.status === 422 || err.status === 409) {
        console.warn(`[Git] Conflicto al commit (intento ${attempt + 1}/${maxRetries}). Reintentando...`);
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      // Otro error → no reintentar
      throw err;
    }
  }
  throw lastErr || new Error('No se pudo crear el commit tras varios intentos.');
}

/* ============================================================
   PUSH A GITHUB AGRUPADO
   ============================================================ */
async function pushToGithub() {
  if (guardadoEnProgreso) {
    showToast('Ya hay un guardado en progreso. Espera a que termine.', 'warning');
    return;
  }

  commitPendingEditsBeforePush();

  const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  if (!user) {
    const loginAhora = confirm(
      'No has iniciado sesión.\n\n' +
      'Puedes guardar de todas formas (se usará el token compartido), ' +
      'pero el commit no llevará tu nombre.\n\n' +
      '¿Iniciar sesión ahora para que tu commit quede firmado?'
    );
    if (loginAhora && typeof openSessionModal === 'function') {
      openSessionModal();
      return;
    }
  }

  const sessionUser = user ? user.username : null;

  const repo = normalizeRepoInput(document.getElementById('gh-repo').value);
  document.getElementById('gh-repo').value = repo;
  const path = document.getElementById('gh-path').value.trim().replace(/^\/+/, '');
  const branch = document.getElementById('gh-branch').value.trim() || 'main';
  const token = (document.getElementById('gh-token').value || '').replace(/\s+/g, '').trim();
  const remember = document.getElementById('gh-remember').checked;

  if (!repo || !path || !token) {
    setGithubStatus(
      '❌ Faltan datos obligatorios:\n' +
      (!repo ? '• Repositorio (formato usuario/repo)\n' : '') +
      (!path ? '• Ruta de tu index.html dentro del repo\n' : '') +
      (!token ? '• Token de GitHub (no puede estar vacío)\n' : '') +
      '\nComplétalos y vuelve a intentar.',
      'error'
    );
    return;
  }
  if (!/^[^\/\s]+\/[^\/\s]+$/.test(repo)) {
    setGithubStatus('❌ El repositorio debe tener el formato usuario/repositorio (ej: javiera-sys/REPORTE-PRODUCTIVO).', 'error');
    return;
  }

  if (remember) {
    saveGithubConfig({ repo, path, branch, token });
    setGithubStatus(
      sessionUser
        ? `🔐 Configuración compartida guardada. Los commits llevarán la etiqueta: [${sessionUser}]`
        : `🔐 Configuración compartida guardada. (Sin sesión: los commits no llevarán nombre de usuario).`,
      'info'
    );
  } else {
    clearGithubConfig();
  }

  if (!navigator.onLine) {
    await saveOfflineSnapshot(data);
    setSyncStatusUI('pending');
    setGithubStatus('📦 Sin conexión: tu cambio se guardó en este dispositivo y se subirá a GitHub automáticamente en cuanto vuelva el internet.', 'info');
    return;
  }

  const btn = document.getElementById('gh-save-btn');
  const mainBtn = document.getElementById('main-gh-btn');
  const originalHtml = btn ? btn.innerHTML : '';
  const originalMainHtml = mainBtn ? mainBtn.innerHTML : '';
  if (btn) { btn.innerHTML = 'Subiendo...'; btn.disabled = true; }
  if (mainBtn) { mainBtn.innerHTML = '<i class="ti ti-loader"></i> Subiendo...'; mainBtn.disabled = true; }

  guardadoEnProgreso = true;

  setGithubStatus(
    sessionUser
      ? `Conectando con GitHub. Los commits llevarán la etiqueta: [${sessionUser}]`
      : `Conectando con GitHub (sin sesión activa, los commits no llevarán nombre).`,
    'info'
  );

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json'
  };

  const baseDir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
  const dataRepoPath = baseDir + 'data/cambios.json';
  const modelosRepoPath = baseDir + 'data/modelos.json';
  const usuariosRepoPath = baseDir + 'data/usuarios.json';

  const t0 = performance.now();

  try {
    // ============================================================
    // PASO 1: preparar TODAS las entradas del tree
    // ============================================================
    // Cada entrada es { path, mode, type, sha } o { path, content (base64) }.
    // Vamos a crear primero los blobs de los archivos nuevos (imágenes, PDF, Excel).

    setGithubStatus('Preparando archivos para subir...', 'info');

    const blobTasks = [];
    const finalEntries = []; // entradas para el tree

    function addBlobEntry(repoPath, contentBase64, afterSha) {
      // Agregamos una "tarea" que después va a crear el blob y devolver su sha.
      blobTasks.push({
        repoPath,
        contentBase64,
        afterSha
      });
    }

    // Recorremos TODAS las imágenes y archivos nuevos.
    // Las que ya están en data/images/... se respetan y NO se vuelven a subir.
    // Las que son data: base64 nuevas se suben.

    for (const nave of data.naves || []) {
      if (Array.isArray(nave.images)) {
        for (let i = 0; i < nave.images.length; i++) {
          const img = nave.images[i];
          if (typeof img === 'string' && img.startsWith('data:image')) {
            const ext = extFromDataUri(img);
            const fileName = `${nave.id}_${uid()}.${ext}`;
            const b64 = img.split(',', 2)[1];
            const repoPath = baseDir + 'data/images/' + fileName;
            addBlobEntry(repoPath, b64, () => { nave.images[i] = 'data/images/' + fileName; });
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
                const repoPath = baseDir + 'data/images/' + fileName;
                addBlobEntry(repoPath, b64, () => { item.adjuntos[j] = 'data/images/' + fileName; });
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
          const repoPath = baseDir + 'data/images/' + fileName;
          addBlobEntry(repoPath, b64, () => { f.content = 'data/images/' + fileName; });
        }
      }
    }

    if (Array.isArray(data.pendientesGenerales)) {
      for (const pg of data.pendientesGenerales) {
        if (!Array.isArray(pg.adjuntos)) continue;
        for (let k = 0; k < pg.adjuntos.length; k++) {
          const adj = pg.adjuntos[k];
          if (typeof adj === 'string' && adj.startsWith('data:')) {
            let ext = 'jpg';
            if (adj.startsWith('data:application/pdf')) ext = 'pdf';
            else if (adj.startsWith('data:image/png')) ext = 'png';
            else if (adj.startsWith('data:image/webp')) ext = 'webp';
            else if (adj.startsWith('data:image/jpeg') || adj.startsWith('data:image/jpg')) ext = 'jpg';
            const fileName = `adj_pg_${pg.id}_${uid()}.${ext}`;
            const b64 = adj.split(',', 2)[1];
            const repoPath = baseDir + 'data/images/' + fileName;
            addBlobEntry(repoPath, b64, () => { pg.adjuntos[k] = 'data/images/' + fileName; });
          }
        }
      }
    }

    if (data.procesosDiseno && Array.isArray(data.procesosDiseno.submodules)) {
      for (const sm of data.procesosDiseno.submodules) {
        if (sm.type === 'pdf' && sm.pdfContent && sm.pdfContent.startsWith('data:')) {
          let ext = 'pdf';
          if (sm.pdfContent.includes('image/jpeg')) ext = 'jpg';
          else if (sm.pdfContent.includes('image/png')) ext = 'png';
          const fileName = `procesos_${sm.id}_${uid()}.${ext}`;
          const b64 = sm.pdfContent.split(',', 2)[1];
          const repoPath = baseDir + 'data/images/' + fileName;
          addBlobEntry(repoPath, b64, () => { sm.pdfContent = 'data/images/' + fileName; });
        }
        if (sm.excelOriginal && sm.excelOriginal.startsWith('data:')) {
          const ext = sm.excelOriginal.includes('vnd.ms-excel') ? 'xls' : 'xlsx';
          const fileName = `procesos_${sm.id}_${uid()}.${ext}`;
          const b64 = sm.excelOriginal.split(',', 2)[1];
          const repoPath = baseDir + 'data/images/' + fileName;
          addBlobEntry(repoPath, b64, () => { sm.excelOriginal = 'data/images/' + fileName; });
        }
      }
    }

    // ============================================================
    // PASO 2: crear todos los blobs (con concurrencia limitada)
    // ============================================================
    let blobsCreados = 0;
    if (blobTasks.length > 0) {
      setGithubStatus(`Subiendo ${blobTasks.length} archivo(s) nuevo(s)...`, 'info');
      await runWithConcurrency(
        blobTasks.map((task, idx) => async () => {
          try {
            const sha = await createBlob(repo, task.contentBase64, headers);
            finalEntries.push({
              path: task.repoPath,
              mode: '100644',
              type: 'blob',
              sha: sha
            });
            // Aplicamos el cambio en memoria (reemplaza el data: por la ruta)
            if (typeof task.afterSha === 'function') task.afterSha();
            blobsCreados++;
          } catch (err) {
            console.error(`Fallo al subir archivo ${idx + 1}:`, err);
            throw err;
          } finally {
            setGithubStatus(`Subiendo archivos nuevos... (${blobsCreados}/${blobTasks.length})`, 'info');
          }
        }),
        5
      );
    }

    // ============================================================
    // PASO 3: preparar JSONs
    // ============================================================
    // Importante: los JSONs se serializan DESPUÉS de actualizar las rutas en memoria.
    setGithubStatus('Preparando datos JSON...', 'info');

    const dataString = JSON.stringify(data);
    const dataBase64 = utf8ToBase64(dataString);

    // Blob para cambios.json
    const dataBlobSha = await createBlob(repo, dataBase64, headers);
    finalEntries.push({
      path: dataRepoPath,
      mode: '100644',
      type: 'blob',
      sha: dataBlobSha
    });

    // Blob para modelos.json (solo si cambió)
    if (modelosDBChanged) {
      const modelosBase64 = utf8ToBase64(JSON.stringify(modelosDB));
      const modelosBlobSha = await createBlob(repo, modelosBase64, headers);
      finalEntries.push({
        path: modelosRepoPath,
        mode: '100644',
        type: 'blob',
        sha: modelosBlobSha
      });
    }

    // Blob para usuarios.json (solo si cambió)
    if (typeof usuariosDBChanged !== 'undefined' && usuariosDBChanged) {
      const usuariosData = (typeof getUsuariosParaGuardar === 'function')
        ? getUsuariosParaGuardar()
        : { usuarios: usuariosDB };
      const usuariosBase64 = utf8ToBase64(JSON.stringify(usuariosData, null, 2));
      const usuariosBlobSha = await createBlob(repo, usuariosBase64, headers);
      finalEntries.push({
        path: usuariosRepoPath,
        mode: '100644',
        type: 'blob',
        sha: usuariosBlobSha
      });
    }

    // ============================================================
    // PASO 4: crear UN SOLO commit con todos los archivos
    // ============================================================
    setGithubStatus('Creando el commit...', 'info');

    const commitMessage = ghCommitMessage(
      `Actualización del reporte desde la app (${new Date().toLocaleString('es-MX')})`
    );

    let newCommitSha;
    try {
      newCommitSha = await commitGroupedPush(repo, branch, headers, finalEntries, commitMessage);
    } catch (err) {
      // Reintento especial: si algún archivo ya existía con otro contenido, GitHub
      // puede devolver error. Volvemos a intentar SOLO con los JSONs, sin los blobs.
      console.error('Error al crear el commit agrupado:', err);
      throw err;
    }

    // Limpiar flags
    modelosDBChanged = false;
    if (typeof usuariosDBChanged !== 'undefined') usuariosDBChanged = false;

    // ============================================================
    // PASO 5: mostrar resultado
    // ============================================================
    const commitSha = newCommitSha ? newCommitSha.slice(0, 7) : null;
    const etiqueta = sessionUser ? `"${sessionUser}"` : '(sin sesión)';

    setGithubStatus(
      `✅ Cambios subidos correctamente a GitHub como ${etiqueta}` +
      `${blobsCreados ? ` (${blobsCreados} archivo(s) nuevo(s))` : ''}` +
      `${commitSha ? ` (commit ${commitSha})` : ''}.`,
      'ok'
    );
    showToast(
      `Cambios guardados correctamente${commitSha ? ' (commit ' + commitSha + ')' : ''}`,
      'success'
    );

    const total = Math.round(performance.now() - t0);
    console.log(`[GitHub Save] Usuario: ${sessionUser} | Archivos: ${finalEntries.length} | Blobs nuevos: ${blobsCreados} | Tiempo: ${total}ms | Commit: ${commitSha}`);

  } catch (err) {
    console.error('Error al subir a GitHub:', err);

    const pareceFalloDeRed = (err instanceof TypeError) || !navigator.onLine;
    if (pareceFalloDeRed) {
      await saveOfflineSnapshot(data);
      setSyncStatusUI('pending');
      setGithubStatus(
        `📦 Se perdió la conexión durante el guardado.\n\n` +
        `Tu cambio quedó respaldado en este dispositivo y se sincronizará automáticamente en cuanto vuelva el internet.`,
        'error'
      );
      showToast('Sin conexión. El cambio quedó guardado localmente y se subirá al volver el internet.', 'info');
    } else {
      const detalle = err.message || 'Error desconocido.';
      const pista = (() => {
        if (/401/.test(detalle)) return '\n\n👉 Causa probable: el Token de GitHub es inválido, expiró o está mal copiado. Vuelve a generarlo en GitHub → Settings → Developer settings → Personal access tokens.';
        if (/403/.test(detalle)) return '\n\n👉 Causa probable: el Token no tiene permisos suficientes. Debe tener scope "repo" (o "Contents: Read and write" si es un token fino) y acceso al repositorio.';
        if (/404/.test(detalle)) return '\n\n👉 Causa probable: el repositorio, la rama o la ruta no existen. Verifica la configuración.';
        if (/409/.test(detalle)) return '\n\n👉 La rama cambió en GitHub justo cuando subías. Vuelve a presionar "Guardar en GitHub"; la app reintenta automáticamente.';
        if (/422/.test(detalle)) return '\n\n👉 Causa probable: la rama no existe o el commit no puede apuntar a la rama. Verifica el nombre de la rama (main / master / otra).';
        return '';
      })();
      setGithubStatus(`❌ No se pudo guardar.\n\n${detalle}${pista}`, 'error');

      let shortMsg = 'No se pudo guardar en GitHub.';
      if (/401/.test(detalle)) shortMsg = 'Token de GitHub inválido o expirado (401).';
      else if (/403/.test(detalle)) shortMsg = 'El token no tiene permisos suficientes (403).';
      else if (/404/.test(detalle)) shortMsg = 'Repositorio, rama o ruta no encontrados (404).';
      else if (/409/.test(detalle)) shortMsg = 'El archivo cambió en GitHub (409). Reintenta.';
      else if (/422/.test(detalle)) shortMsg = 'Datos rechazados por GitHub (422). Revisa la rama.';
      showToast(shortMsg, 'error');
    }
  } finally {
    guardadoEnProgreso = false;
    if (btn) { btn.innerHTML = originalHtml; btn.disabled = false; }
    if (mainBtn) { mainBtn.innerHTML = originalMainHtml; mainBtn.disabled = false; }
  }
}

function base64ToUtf8(b64) {
  const binary = atob(b64.replace(/\n/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function quickRevertGithub() {
  if (!isAdminSafe()) { alert('🔒 Solo un administrador puede restaurar versiones.'); return; }
  const cfg = loadGithubConfig();
  if (cfg && cfg.repo && cfg.path && cfg.token) {
    document.getElementById('gh-repo').value = cfg.repo;
    document.getElementById('gh-path').value = cfg.path;
    document.getElementById('gh-branch').value = cfg.branch || 'main';
    document.getElementById('gh-token').value = cfg.token;
    document.getElementById('gh-remember').checked = true;
    revertToLastCommit();
  } else {
    alert('Primero configura la conexión con GitHub (ícono de engranaje junto a "Guardar en GitHub") antes de poder restaurar la última versión.\n\nLa configuración es COMPARTIDA, así que basta con que cualquier usuario la haya configurado una vez.');
    openGithubModal();
  }
}

async function revertToLastCommit() {
  if (!isAdminSafe()) { alert('🔒 Solo un administrador puede restaurar versiones.'); return; }

  const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const sessionUser = user ? user.username : '(anónimo)';

  const repo = normalizeRepoInput(document.getElementById('gh-repo').value);
  document.getElementById('gh-repo').value = repo;
  const path = document.getElementById('gh-path').value.trim().replace(/^\/+/, '');
  const branch = document.getElementById('gh-branch').value.trim() || 'main';
  const token = (document.getElementById('gh-token').value || '').replace(/\s+/g, '').trim();

  if (!repo || !path || !token) {
    setGithubStatus('Completa repositorio, ruta del archivo y token antes de restaurar.', 'error');
    return;
  }
  if (!/^[^\/\s]+\/[^\/\s]+$/.test(repo)) {
    setGithubStatus('El repositorio debe tener el formato usuario/repositorio.', 'error');
    return;
  }

  const confirmado = confirm(
    '¿Restaurar el proyecto a la última versión guardada en GitHub?\n\n' +
    'Se perderán todos los cambios locales que todavía no hayas subido. Esta acción no se puede deshacer.\n\n' +
    'Se usará TU Token (' + sessionUser + ').'
  );
  if (!confirmado) return;

  const revertBtn = document.getElementById('gh-revert-btn');
  const mainRevertBtn = document.getElementById('main-gh-revert-btn');
  const originalHtml = revertBtn ? revertBtn.innerHTML : '';
  const originalMainHtml = mainRevertBtn ? mainRevertBtn.innerHTML : '';
  if (revertBtn) { revertBtn.innerHTML = 'Restaurando...'; revertBtn.disabled = true; }
  if (mainRevertBtn) { mainRevertBtn.innerHTML = '<i class="ti ti-loader"></i> Restaurando...'; mainRevertBtn.disabled = true; }
  setGithubStatus('Buscando el último commit en GitHub...', 'info');

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json'
  };

  const baseDir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
  const dataRepoPath = baseDir + 'data/cambios.json';
  const modelosRepoPath = baseDir + 'data/modelos.json';

  try {
    const branchUrl = `https://api.github.com/repos/${repo}/branches/${encodeURIComponent(branch)}`;
    const branchResp = await fetch(branchUrl, { headers, cache: 'no-store' });
    if (!branchResp.ok) {
      const errBody = await branchResp.json().catch(() => ({}));
      throw new Error(describeGithubError(branchResp.status, `Al consultar la rama "${branch}" de ${repo}.`, errBody.message));
    }
    const branchInfo = await branchResp.json();
    const commitSha = branchInfo.commit && branchInfo.commit.sha;
    const commitMessageFull = (branchInfo.commit && branchInfo.commit.commit && branchInfo.commit.commit.message) || '(sin mensaje)';
    const commitShort = commitSha ? commitSha.slice(0, 7) : '???';
    const commitMessage = commitMessageFull.split('\n')[0];

    if (!commitSha) throw new Error('GitHub no devolvió información del último commit de la rama.');

    setGithubStatus('Descargando la última versión de los datos...', 'info');
    const dataResp = await fetch(`${githubApiUrl(repo, dataRepoPath)}?ref=${encodeURIComponent(commitSha)}`, { headers, cache: 'no-store' });
    if (!dataResp.ok) {
      const errBody = await dataResp.json().catch(() => ({}));
      throw new Error(describeGithubError(dataResp.status, `Al descargar "${dataRepoPath}" del commit ${commitShort}.`, errBody.message));
    }
    const dataInfo = await dataResp.json();
    let restoredData;
    try {
      restoredData = JSON.parse(base64ToUtf8(dataInfo.content));
    } catch (e) {
      throw new Error('El archivo data/cambios.json del repositorio no es un JSON válido. No se pudo restaurar.');
    }

    let restoredModelos = null;
    try {
      const modelosResp = await fetch(`${githubApiUrl(repo, modelosRepoPath)}?ref=${encodeURIComponent(commitSha)}`, { headers, cache: 'no-store' });
      if (modelosResp.ok) {
        const modelosInfo = await modelosResp.json();
        restoredModelos = JSON.parse(base64ToUtf8(modelosInfo.content));
      }
    } catch (e) {
      console.warn('No se pudo restaurar data/modelos.json, se conserva el actual:', e);
    }

    data = restoredData;
    ensureAccessPasswords();
    if (Array.isArray(restoredModelos)) {
      modelosDB = restoredModelos;
    }
    modelosDBChanged = false;
    editingItemId = null;
    render();

    if (dataInfo && dataInfo.sha) {
      ghShaCache[ghCacheKey(repo, dataRepoPath, branch)] = dataInfo.sha;
    }

    setGithubStatus(`✅ Proyecto restaurado al commit ${commitShort} como "${sessionUser}": "${commitMessage}".`, 'ok');
    alert(`✅ El proyecto se restauró correctamente.\n\nUsuario: ${sessionUser}\nCommit: ${commitShort}\nMensaje: ${commitMessage}`);
  } catch (err) {
    console.error('Error al restaurar desde GitHub:', err);
    let msg = err.message || 'No se pudo restaurar la última versión.';
    if (err instanceof TypeError) {
      msg = 'No se pudo conectar con GitHub. Revisa tu conexión a internet e inténtalo de nuevo.';
    }
    setGithubStatus('❌ ' + msg, 'error');
    alert('❌ No se pudo restaurar el proyecto.\n\n' + msg);
  } finally {
    if (revertBtn) { revertBtn.innerHTML = originalHtml; revertBtn.disabled = false; }
    if (mainRevertBtn) { mainRevertBtn.innerHTML = originalMainHtml; mainRevertBtn.disabled = false; }
  }
}

/* ============================================================
   EXPORTACIÓN OFFLINE (ZIP)
   ============================================================ */
function isLocalAssetRef(url) {
  if (typeof url !== 'string') return false;
  const u = url.trim();
  if (!u) return false;
  if (u.startsWith('data:') || u.startsWith('blob:')) return false;
  if (/^https?:\/\//i.test(u)) return false;
  if (u.startsWith('#') || u.startsWith('mailto:') || u.startsWith('tel:') || u.startsWith('javascript:')) return false;
  return true;
}
function normalizeAssetPath(url) {
  return url.trim().replace(/^\.\//, '').replace(/^\/+/, '').split('#')[0].split('?')[0];
}
function extractCssUrls(cssText) {
  const out = [];
  for (const m of cssText.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) out.push(m[2]);
  return out;
}

function collectLocalAssetPathsFromDom(clonedDoc) {
  const paths = new Set();
  clonedDoc.querySelectorAll('link[href]').forEach(el => {
    const h = el.getAttribute('href');
    if (isLocalAssetRef(h)) paths.add(normalizeAssetPath(h));
  });
  clonedDoc.querySelectorAll('script[src]').forEach(el => {
    const s = el.getAttribute('src');
    if (isLocalAssetRef(s)) paths.add(normalizeAssetPath(s));
  });
  clonedDoc.querySelectorAll('img[src]').forEach(el => {
    const s = el.getAttribute('src');
    if (isLocalAssetRef(s)) paths.add(normalizeAssetPath(s));
  });
  clonedDoc.querySelectorAll('[style]').forEach(el => {
    extractCssUrls(el.getAttribute('style') || '').forEach(u => { if (isLocalAssetRef(u)) paths.add(normalizeAssetPath(u)); });
  });
  return paths;
}

function collectLocalAssetPathsFromJs(jsText) {
  const paths = new Set();
  const patterns = [
    /serviceWorker\.register\(\s*['"]([^'"]+)['"]/g,
    /fetch\(\s*['"]([^'"]+)['"]/g
  ];
  patterns.forEach(re => {
    for (const m of jsText.matchAll(re)) {
      if (isLocalAssetRef(m[1])) paths.add(normalizeAssetPath(m[1]));
    }
  });
  return paths;
}

function collectLocalAssetPathsFromData() {
  const paths = new Set();
  (data.naves || []).forEach(n => {
    (n.images || []).forEach(img => { if (isLocalAssetRef(img)) paths.add(normalizeAssetPath(img)); });
    (n.items || []).forEach(item => {
      (item.adjuntos || []).forEach(a => { if (isLocalAssetRef(a)) paths.add(normalizeAssetPath(a)); });
    });
  });
  (data.fichasTecnicas || []).forEach(f => { if (f && isLocalAssetRef(f.content)) paths.add(normalizeAssetPath(f.content)); });
  return paths;
}

async function fetchAssetIntoZip(path, zip, report) {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    zip.file(path, blob);
    report.incluidos.push(path);
    return true;
  } catch (err) {
    report.faltantes.push(`${path} (${err.message})`);
    return false;
  }
}

async function localizeExternalResourcesForZip(clonedDoc, zip, report) {
  const els = [
    ...clonedDoc.querySelectorAll('script[src]'),
    ...clonedDoc.querySelectorAll('link[rel="stylesheet"][href]')
  ].filter(el => /^https?:\/\//i.test(el.getAttribute('src') || el.getAttribute('href') || ''));

  for (const el of els) {
    const attr = el.tagName === 'SCRIPT' ? 'src' : 'href';
    const url = el.getAttribute(attr);
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const isCss = attr === 'href';
      const u = new URL(url);
      const vendorDir = 'vendor/' + u.hostname.replace(/[^a-z0-9.]/gi, '_');
      const fileName = (u.pathname.split('/').pop() || 'recurso') || (isCss ? 'style.css' : 'script.js');
      let content = isCss ? await res.text() : await res.blob();

      if (isCss) {
        for (const fontUrl of extractCssUrls(content)) {
          if (!/^https?:\/\//i.test(fontUrl)) continue;
          try {
            const fRes = await fetch(fontUrl, { mode: 'cors' });
            if (!fRes.ok) throw new Error('HTTP ' + fRes.status);
            const fBlob = await fRes.blob();
            const fu = new URL(fontUrl);
            const fName = (fu.pathname.split('/').pop() || 'recurso').split('?')[0];
            zip.file(`${vendorDir}/${fName}`, fBlob);
            content = content.split(fontUrl).join('./' + fName);
            report.incluidos.push(`${vendorDir}/${fName} (recurso de ${url})`);
          } catch (fErr) {
            report.externosNoResueltos.push(`${fontUrl} (referenciado dentro de ${url}): ${fErr.message}`);
          }
        }
      }

      zip.file(`${vendorDir}/${fileName}`, content);
      el.setAttribute(attr, `${vendorDir}/${fileName}`);
      report.incluidos.push(`${vendorDir}/${fileName} (antes: ${url})`);
    } catch (err) {
      report.externosNoResueltos.push(`${url}: ${err.message} — se deja como enlace externo, requerirá internet la primera vez que se abra.`);
    }
  }
}

function buildProjectHTMLString(clonedDoc) {
  const clone = clonedDoc || document.documentElement.cloneNode(true);
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

async function listRepoFilesRecursive(repo, branch, headers) {
  const url = `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const res = await fetch(url, { headers, cache: 'no-store' });
  if (!res.ok) throw new Error(`No se pudo listar el repositorio (HTTP ${res.status})`);
  const json = await res.json();
  return {
    files: (json.tree || []).filter(e => e.type === 'blob').map(e => e.path),
    truncated: !!json.truncated
  };
}

async function fetchRepoFileBlob(repo, branch, path, headers) {
  try {
    const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${path.split('/').map(encodeURIComponent).join('/')}`;
    const res = await fetch(rawUrl, { cache: 'no-store' });
    if (res.ok) return await res.blob();
  } catch (e) { }

  const apiUrl = githubApiUrl(repo, path) + `?ref=${encodeURIComponent(branch)}`;
  const res2 = await fetch(apiUrl, { headers, cache: 'no-store' });
  if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
  const json = await res2.json();
  if (!json.content) throw new Error('Sin contenido en la respuesta de GitHub');
  const binary = atob(json.content.replace(/\n/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes]);
}

async function exportProjectZipFromRepo(zip, cfg, btn, report) {
  const branch = cfg.branch || 'main';
  const headers = { 'Authorization': `Bearer ${cfg.token}`, 'Accept': 'application/vnd.github+json' };

  btn.textContent = 'Listando archivos del repositorio...';
  const { files, truncated } = await listRepoFilesRecursive(cfg.repo, branch, headers);
  if (truncated) {
    report.externosNoResueltos.push('GitHub marcó el listado del repositorio como "truncado" (repositorio muy grande) - es posible que falten archivos poco comunes; revisa este reporte contra tu repositorio.');
  }

  let i = 0;
  for (const path of files) {
    i++;
    btn.textContent = `Descargando repositorio (${i}/${files.length})...`;
    try {
      const blob = await fetchRepoFileBlob(cfg.repo, branch, path, headers);
      zip.file(path, blob);
      report.incluidos.push(path);
    } catch (err) {
      report.faltantes.push(`${path} (${err.message})`);
    }
  }
}

async function exportProjectZip(name) {
  if (!isAdminSafe()) { alert('🔒 Solo un administrador puede descargar el repositorio.'); return; }
  const btn = document.getElementById('export-btn');
  const originalText = btn.textContent;
  const report = { incluidos: [], faltantes: [], externosNoResueltos: [] };

  try {
    if (typeof JSZip === 'undefined') {
      alert('La librería JSZip no está cargada. Por favor revisa tu conexión a internet.');
      return;
    }
    const zip = new JSZip();
    const clone = document.documentElement.cloneNode(true);
    const cfg = loadGithubConfig();
    let usedRepoMirror = false;

    if (cfg && cfg.repo && cfg.token) {
      try {
        await exportProjectZipFromRepo(zip, cfg, btn, report);
        usedRepoMirror = true;
      } catch (err) {
        console.error('No se pudo espejar el repositorio, se usa el respaldo por auditoría local:', err);
        report.externosNoResueltos.push(`No se pudo listar el repositorio completo desde GitHub (${err.message}). Se usó como respaldo la detección automática desde lo que está cargado en este navegador, que puede no incluir archivos no referenciados.`);
      }
    }

    if (!usedRepoMirror) {
      btn.textContent = 'Auditando recursos...';
      const localPaths = new Set([
        ...collectLocalAssetPathsFromDom(clone),
        ...collectLocalAssetPathsFromData()
      ]);

      let cssText = '', jsText = '';
      try { cssText = await (await fetch('css/styles.css', { cache: 'no-store' })).text(); } catch (e) { report.faltantes.push('css/styles.css: ' + e.message); }
      try { jsText = await (await fetch('js/app.js', { cache: 'no-store' })).text(); } catch (e) { report.faltantes.push('js/app.js: ' + e.message); }
      extractCssUrls(cssText).forEach(u => { if (isLocalAssetRef(u)) localPaths.add(normalizeAssetPath(u)); });
      collectLocalAssetPathsFromJs(jsText).forEach(p => localPaths.add(p));

      localPaths.delete('data/cambios.json');
      localPaths.delete('data/modelos.json');

      try {
        const manifestText = await (await fetch('manifest.json', { cache: 'no-store' })).text();
        const manifestJson = JSON.parse(manifestText);
        (manifestJson.icons || []).forEach(ic => { if (isLocalAssetRef(ic.src)) localPaths.add(normalizeAssetPath(ic.src)); });
      } catch (e) { report.faltantes.push('manifest.json: ' + e.message); }

      let i = 0;
      for (const path of localPaths) {
        i++;
        btn.textContent = `Empaquetando (${i}/${localPaths.size})...`;
        await fetchAssetIntoZip(path, zip, report);
      }
    }

    btn.textContent = 'Resolviendo dependencias externas...';
    await localizeExternalResourcesForZip(clone, zip, report);

    const htmlString = buildProjectHTMLString(clone);
    zip.file('index.html', htmlString);

    zip.folder('data').file('cambios.json', JSON.stringify(data, null, 2));
    zip.folder('data').file('modelos.json', JSON.stringify(modelosDB, null, 2));
    report.incluidos.push('data/cambios.json (estado actual)', 'data/modelos.json (estado actual)');

    const reportTxt = [
      `Snapshot offline generado: ${new Date().toLocaleString('es-MX')}`,
      `Modo: ${usedRepoMirror ? 'Espejo completo del repositorio de GitHub' : 'Detección automática por referencias (sin GitHub configurado)'}`,
      '',
      `ARCHIVOS INCLUIDOS (${report.incluidos.length}):`,
      ...report.incluidos.map(x => '  ✔ ' + x),
      '',
      `ARCHIVOS FALTANTES / RUTAS ROTAS (${report.faltantes.length}):`,
      ...(report.faltantes.length ? report.faltantes.map(x => '  ✘ ' + x) : ['  (ninguno)']),
      '',
      `DEPENDENCIAS EXTERNAS NO RESUELTAS (${report.externosNoResueltos.length}):`,
      ...(report.externosNoResueltos.length ? report.externosNoResueltos.map(x => '  ⚠ ' + x) : ['  (ninguna - todo quedó local)'])
    ].join('\n');
    zip.file('_reporte_offline.txt', reportTxt);

    btn.textContent = 'Generando ZIP...';
    const content = await zip.generateAsync({ type: 'blob' });
    downloadBlob(content, name + '.zip', 'application/zip');

    const resumen = `✅ Snapshot descargado: ${report.incluidos.length} archivo(s) incluidos.` +
      (report.faltantes.length ? `\n⚠️ ${report.faltantes.length} archivo(s) no se pudieron incluir (revisa _reporte_offline.txt dentro del ZIP).` : '') +
      (report.externosNoResueltos.length ? `\n⚠️ ${report.externosNoResueltos.length} dependencia(s) externa(s) no se pudieron volver locales (necesitarán internet la primera vez).` : '\n✔ Todas las dependencias quedaron locales, sin necesitar internet.');
    alert(resumen);

  } catch(err) {
    console.error(err);
    alert('Error al generar el archivo ZIP: ' + (err.message || err));
  } finally {
    btn.textContent = originalText;
  }
}
function closeModal(id){document.getElementById(id).classList.remove('open');}

/* ============================================================
   PWA / MODO OFFLINE
   ============================================================ */
const OFFLINE_DB_NAME = 'rpi_offline_db';
const OFFLINE_DB_VERSION = 1;
const OFFLINE_STORE = 'pending_saves';

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB no disponible en este navegador')); return; }
    const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
        db.createObjectStore(OFFLINE_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveOfflineSnapshot(dataObj) {
  try {
    const db = await openOfflineDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORE, 'readwrite');
      tx.objectStore(OFFLINE_STORE).put({ id: 'pending', dataJson: JSON.stringify(dataObj), savedAt: Date.now() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('No se pudo guardar el cambio localmente (IndexedDB):', err);
  }
}

async function getOfflineSnapshot() {
  try {
    const db = await openOfflineDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORE, 'readonly');
      const req = tx.objectStore(OFFLINE_STORE).get('pending');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('No se pudo leer el respaldo local (IndexedDB):', err);
    return null;
  }
}

async function clearOfflineSnapshot() {
  try {
    const db = await openOfflineDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORE, 'readwrite');
      tx.objectStore(OFFLINE_STORE).delete('pending');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('No se pudo limpiar el respaldo local (IndexedDB):', err);
  }
}

function updateConnStatusUI() {
  const pill = document.getElementById('conn-status');
  const label = document.getElementById('conn-status-label');
  if (!pill || !label) return;
  const icon = pill.querySelector('i');
  if (navigator.onLine) {
    pill.classList.remove('offline');
    label.textContent = 'En línea';
    if (icon) icon.className = 'ti ti-wifi';
  } else {
    pill.classList.add('offline');
    label.textContent = 'Sin conexión';
    if (icon) icon.className = 'ti ti-wifi-off';
  }
}

function setSyncStatusUI(mode) {
  const pill = document.getElementById('sync-status');
  const label = document.getElementById('sync-status-label');
  if (!pill || !label) return;
  const icon = pill.querySelector('i');
  if (mode === 'hidden') { pill.style.display = 'none'; return; }
  pill.style.display = 'flex';
  pill.classList.toggle('syncing', mode === 'syncing');
  if (mode === 'pending') { label.textContent = 'Cambios sin sincronizar'; if (icon) icon.className = 'ti ti-cloud-off'; }
  else if (mode === 'syncing') { label.textContent = 'Sincronizando...'; if (icon) icon.className = 'ti ti-loader'; }
  else if (mode === 'synced') {
    label.textContent = 'Sincronizado ✓'; if (icon) icon.className = 'ti ti-cloud-check';
    setTimeout(() => setSyncStatusUI('hidden'), 4000);
  }
}

async function attemptOfflineSync() {
  const pending = await getOfflineSnapshot();
  if (!pending) { setSyncStatusUI('hidden'); return; }
  if (!navigator.onLine) { setSyncStatusUI('pending'); return; }

  const cfg = loadGithubConfig();
  if (!cfg || !cfg.repo || !cfg.path || !cfg.token) {
    setSyncStatusUI('pending');
    console.warn('[Sync Offline] No hay configuración de GitHub para el usuario actual; no se puede sincronizar todavía.');
    return;
  }

  const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const sessionUser = user ? user.username : '(anónimo)';

  setSyncStatusUI('syncing');
  try {
    const branch = cfg.branch || 'main';
    const path = cfg.path.trim().replace(/^\/+/, '');
    const baseDir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
    const dataRepoPath = baseDir + 'data/cambios.json';
    const headers = { 'Authorization': `Bearer ${cfg.token}`, 'Accept': 'application/vnd.github+json' };

    await putFileToGithubCached(
      cfg.repo, dataRepoPath, branch, headers, utf8ToBase64(JSON.stringify(data)),
      ghCommitMessage(`Sincronización automática de cambios guardados sin conexión (${new Date().toLocaleString('es-MX')})`)
    );

    await clearOfflineSnapshot();
    setSyncStatusUI('synced');
    setGithubStatus(`✅ Tus cambios guardados sin conexión ya se sincronizaron con GitHub (usuario: ${sessionUser}).`, 'ok');
  } catch (err) {
    console.error('No se pudo sincronizar el respaldo local:', err);
    setSyncStatusUI('pending');
    setGithubStatus(`❌ No se pudo sincronizar automáticamente: ${err.message || err}`, 'error');
  }
}

window.addEventListener('online', () => {
  updateConnStatusUI();
  attemptOfflineSync();
});
window.addEventListener('offline', () => {
  updateConnStatusUI();
});

async function downloadOfflineVersion() {
  const btn = document.getElementById('btn-download-offline');
  if (!('serviceWorker' in navigator)) {
    alert('Tu navegador no soporta esta función.');
    return;
  }
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Descargando...'; }
  try {
    const reg = await navigator.serviceWorker.ready;
    const onMessage = (event) => {
      if (event.data && event.data.type === 'APP_SHELL_CACHED') {
        navigator.serviceWorker.removeEventListener('message', onMessage);
        if (btn) {
          btn.disabled = false;
          if (event.data.ok) {
            btn.classList.add('is-cached');
            btn.innerHTML = '<i class="ti ti-circle-check"></i> Versión offline lista';
            setGithubStatus('✅ La app ya puede abrirse sin conexión desde este dispositivo.', 'ok');
          } else {
            btn.innerHTML = '<i class="ti ti-cloud-download" aria-hidden="true"></i> Descargar versión offline';
            setGithubStatus('❌ No se pudo guardar la versión offline. Intenta de nuevo.', 'error');
          }
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    reg.active.postMessage('CACHE_APP_SHELL');
  } catch (err) {
    console.error('No se pudo activar la versión offline:', err);
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-cloud-download" aria-hidden="true"></i> Descargar versión offline'; }
    alert('No se pudo activar la versión offline: ' + (err.message || err));
  }
}

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

  updateConnStatusUI();
  try {
    const pending = await getOfflineSnapshot();
    if (pending) {
      data = JSON.parse(pending.dataJson);
      ensureAccessPasswords();
      render();
      if (navigator.onLine) { attemptOfflineSync(); } else { setSyncStatusUI('pending'); }
    }
  } catch (e) {
    console.warn('No se pudo revisar cambios pendientes sin conexión:', e);
  }

  // Restaurar el estado del panel de Pendientes Generales
  try {
    if (localStorage.getItem('rpi_pg_panel_open') === '1') {
      isPGPanelOpen = true;
      const panel = document.getElementById('pg-panel');
      const chev = document.getElementById('pg-chevron');
      if (panel) panel.style.display = 'block';
      if (chev) {
        chev.classList.remove('ti-chevron-down');
        chev.classList.add('ti-chevron-up');
      }
    }
  } catch (e) {}
}

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
      content: ev.target.result
    });
    renderFichas();
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

const fichaDeleteInProgress = new Set();
const fichaReplaceInProgress = new Set();

function getFichaById(id) {
  return (data.fichasTecnicas || []).find(f => f.id === id);
}

function renderFichas() {
  const list = document.getElementById('fichas-list');
  if (!list) return;
  if (!data.fichasTecnicas || data.fichasTecnicas.length === 0) {
    list.innerHTML = '<div style="padding: 12px; font-size: 12px; color: var(--color-text-secondary); text-align: center;">No hay fichas técnicas disponibles.</div>';
    return;
  }
  list.innerHTML = data.fichasTecnicas.map((f) => {
    const deleting = fichaDeleteInProgress.has(f.id);
    const replacing = fichaReplaceInProgress.has(f.id);
    const busy = deleting || replacing;
    return `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--color-border-tertiary); transition: background 0.2s; ${busy ? 'opacity:0.55;' : ''}" onmouseover="this.style.backgroundColor='#f9fafb'" onmouseout="this.style.backgroundColor='transparent'">
      <div style="display: flex; align-items: flex-start; flex: 1; min-width: 0; padding-right: 8px;">
        <i class="ti ti-file" style="margin-top: 2px; margin-right: 6px; color: #6366F1; font-size: 14px; flex-shrink: 0;"></i>
        <span style="font-size: 12px; font-weight: 500; color: var(--color-text-primary); word-break: break-word; line-height: 1.4;">${escHtml(f.name)}</span>
      </div>
      <div style="display: flex; gap: 6px; flex-shrink: 0;">
        <button class="btn btn-xs btn-navy" onclick="viewFicha('${f.id}')" title="Ver" ${busy ? 'disabled' : ''} style="padding: 4px 8px;"><i class="ti ti-eye"></i></button>
        <button class="btn btn-xs btn-green" onclick="downloadFicha('${f.id}')" title="Descargar" ${busy ? 'disabled' : ''} style="padding: 4px 8px;"><i class="ti ti-download"></i></button>
        <button class="btn btn-xs btn-amber only-editable" onclick="triggerFichaReplace('${f.id}')" ${busy ? 'disabled' : ''} style="padding: 4px 8px;" title="Reemplazar (subiste el archivo equivocado)">${replacing ? '<i class="ti ti-loader"></i>' : '<i class="ti ti-replace"></i>'}</button>
        <button class="btn btn-xs btn-danger-ghost only-editable" onclick="deleteFicha('${f.id}')" ${busy ? 'disabled' : ''} style="padding: 4px 8px;" title="Eliminar">${deleting ? '<i class="ti ti-loader"></i>' : '<i class="ti ti-trash"></i>'}</button>
      </div>
    </div>
  `;
  }).join('');
}

function viewFicha(id) {
  const f = getFichaById(id);
  if (!f) return;
  window.open(f.content, '_blank');
}

function downloadFicha(id) {
  const f = getFichaById(id);
  if(!f) return;

  const a = document.createElement('a');
  a.href = f.content;
  a.download = f.name;
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function deleteFileFromGithub(repo, repoPath, branch, headers, message) {
  const apiUrl = githubApiUrl(repo, repoPath);
  const getResp = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, { headers, cache: 'no-store' });
  if (getResp.status === 404) {
    return { alreadyGone: true };
  }
  if (!getResp.ok) {
    const errBody = await getResp.json().catch(() => ({}));
    throw new Error(describeGithubError(getResp.status, `Al verificar ${repoPath} antes de borrarlo.`, errBody.message));
  }
  const info = await getResp.json();
  const delResp = await fetch(apiUrl, {
    method: 'DELETE',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha: info.sha, branch })
  });
  if (!delResp.ok) {
    const errBody = await delResp.json().catch(() => ({}));
    throw new Error(describeGithubError(delResp.status, `Al borrar ${repoPath}.`, errBody.message));
  }
  return delResp.json().catch(() => null);
}

// --- ELIMINADO: guardado automático al eliminar ficha ---
async function deleteFicha(id) {
  if (!isEditableMode) return;
  if (!isAdminSafe()) { alert('🔒 Solo un administrador puede eliminar fichas técnicas.'); return; }
  if (fichaDeleteInProgress.has(id)) return;
  const f = getFichaById(id);
  if (!f) return;

  if (!confirm('¿ESTÁS SEGURO DE QUE DESEAS ELIMINAR ESTA FICHA TÉCNICA?')) return;

  fichaDeleteInProgress.add(id);
  renderFichas();

  const cfg = loadGithubConfig();
  const isRemoteFile = typeof f.content === 'string' && !f.content.startsWith('data:');

  try {
    if (isRemoteFile) {
      if (!cfg || !cfg.repo || !cfg.token) {
        throw new Error('No hay una conexión de GitHub configurada para tu usuario; no se puede borrar el archivo del repositorio desde aquí.');
      }
      const branch = cfg.branch || 'main';
      const headers = { 'Authorization': `Bearer ${cfg.token}`, 'Accept': 'application/vnd.github+json' };
      await deleteFileFromGithub(cfg.repo, f.content, branch, headers, ghCommitMessage(`Eliminar ficha técnica "${f.name}"`));
    }
  } catch (err) {
    console.error('Error al borrar el archivo de la ficha técnica:', err);
    alert('❌ No se pudo eliminar la ficha: ' + (err.message || err) + '\n\nLa ficha se conservó sin cambios.');
    fichaDeleteInProgress.delete(id);
    renderFichas();
    return;
  }

  const idx = data.fichasTecnicas.findIndex(x => x.id === id);
  if (idx !== -1) data.fichasTecnicas.splice(idx, 1);

  fichaDeleteInProgress.delete(id);
  renderFichas();
  setGithubStatus('✅ Ficha eliminada. Presiona "Guardar en GitHub" para aplicar el cambio.', 'ok');
}

let pendingReplaceFichaId = null;

function triggerFichaReplace(id) {
  if (!isEditableMode) return;
  if (fichaDeleteInProgress.has(id) || fichaReplaceInProgress.has(id)) return;
  pendingReplaceFichaId = id;
  document.getElementById('ficha-replace-input').click();
}

function handleFichaReplace(e) {
  const id = pendingReplaceFichaId;
  pendingReplaceFichaId = null;
  const file = e.target.files[0];
  if (!file || !id) { e.target.value = ''; return; }
  const f = getFichaById(id);
  if (!f) { e.target.value = ''; return; }

  const reader = new FileReader();
  reader.onload = async (ev) => {
    await replaceFichaContent(id, file.name, ev.target.result);
    e.target.value = '';
  };
  reader.onerror = () => {
    alert('❌ No se pudo leer el nuevo archivo.');
    e.target.value = '';
  };
  reader.readAsDataURL(file);
}

// --- ELIMINADO: guardado automático al reemplazar ficha ---
async function replaceFichaContent(id, newName, newContentBase64) {
  if (fichaReplaceInProgress.has(id)) return;
  const f = getFichaById(id);
  if (!f) return;

  fichaReplaceInProgress.add(id);
  renderFichas();

  const cfg = loadGithubConfig();
  const oldRemotePath = (typeof f.content === 'string' && !f.content.startsWith('data:')) ? f.content : null;

  try {
    if (oldRemotePath) {
      if (!cfg || !cfg.repo || !cfg.token) {
        throw new Error('No hay una conexión de GitHub configurada para tu usuario; no se puede reemplazar el archivo del repositorio desde aquí.');
      }
      const branch = cfg.branch || 'main';
      const headers = { 'Authorization': `Bearer ${cfg.token}`, 'Accept': 'application/vnd.github+json' };
      await deleteFileFromGithub(cfg.repo, oldRemotePath, branch, headers, ghCommitMessage(`Reemplazar ficha técnica "${f.name}"`));
    }
  } catch (err) {
    console.error('No se pudo borrar el archivo viejo antes de reemplazarlo:', err);
    alert('❌ No se pudo reemplazar la ficha: ' + (err.message || err) + '\n\nSe conservó el archivo original sin cambios.');
    fichaReplaceInProgress.delete(id);
    renderFichas();
    return;
  }

  f.name = newName;
  f.content = newContentBase64;

  fichaReplaceInProgress.delete(id);
  renderFichas();
  setGithubStatus('✅ Ficha reemplazada. Presiona "Guardar en GitHub" para aplicar el cambio.', 'ok');
}

/* ---- RECORDATORIO DE PENDIENTES (CADA 2 HORAS) ---- */
function checkAndSendPendingReminders() {
  if (Notification.permission !== 'granted') return;

  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();

  if (day === 0 || day === 6) return;
  if (hour < 7 || hour >= 20) return;

  let hasPendientes = false;

  if (data.pendientesGenerales && data.pendientesGenerales.length > 0) {
    hasPendientes = true;
  }

  if (!hasPendientes && data.naves) {
    for (const nave of data.naves) {
      if (nave.items && nave.items.some(item => !item.proceso?.planoTerminado)) {
        hasPendientes = true;
        break;
      }
    }
  }

  if (!hasPendientes) return;

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

    localStorage.setItem('lastPendingReminder', now.getTime().toString());
  }
}

setInterval(checkAndSendPendingReminders, 5 * 60 * 1000);
setTimeout(checkAndSendPendingReminders, 5000);

/* ---- MÓDULO DASHBOARD Y ESTADÍSTICAS ---- */

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

document.addEventListener('click', function(e) {
  if (e.target.closest('.btn-ghost[title="Editar"]')) {
    setTimeout(() => {
      document.querySelectorAll('select[id^="ec-"]').forEach(sel => {
        const id = sel.id.replace('ec-', 'esc-');
        const currentVal = document.getElementById(id).value;
        updateSubCatDropdown(sel.value, id);
        const opts = Array.from(document.getElementById(id).options).map(o=>o.value);
        if(opts.includes(currentVal)) document.getElementById(id).value = currentVal;
      });
    }, 50);
  }
});

let chartTipo, chartClasif, chartImpacto;

window.addEventListener('resize', () => {
  if (chartTipo) chartTipo.resize();
  if (chartClasif) chartClasif.resize();
  if (chartImpacto) chartImpacto.resize();
});
let dashFilters = { tipo: null, clasificacion: null, impacto: null };

function parseItemFecha(str) {
  if (!str) return null;
  const d = new Date(str + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function getItemEffectiveDate(item) {
  const fromFecha = parseItemFecha(item.fecha);
  if (fromFecha) return fromFecha;
  if (item.createdAt) {
    const d = new Date(item.createdAt);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function getISOWeeksInYear(isoYear) {
  const p = (y) => {
    const d = new Date(Date.UTC(y, 0, 1));
    const dow = d.getUTCDay() || 7;
    const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return dow === 4 || (dow === 3 && isLeap);
  };
  return p(isoYear) ? 53 : 52;
}

function getISOWeekDateRange(isoYear, week) {
  const simple = new Date(Date.UTC(isoYear, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const diff = (dow <= 4 ? dow - 1 : dow - 8);
  const start = new Date(simple);
  start.setUTCDate(simple.getUTCDate() - diff);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

function fmtFechaCorta(d) {
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
}
function fmtFechaLarga(d) {
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

function populateWeekYearSelector() {
  const sel = document.getElementById('week-report-year');
  if (!sel) return;
  const years = new Set([new Date().getFullYear()]);
  (data.naves || []).forEach(n => (n.items || []).forEach(it => {
    const d = getItemEffectiveDate(it);
    if (d) years.add(d.getFullYear());
  }));
  const sorted = Array.from(years).sort((a, b) => b - a);
  sel.innerHTML = sorted.map(y => `<option value="${y}">${y}</option>`).join('');
  populateWeekSelector();
}

function populateWeekSelector() {
  const yearSel = document.getElementById('week-report-year');
  const weekSel = document.getElementById('week-report-week');
  if (!yearSel || !weekSel) return;
  const isoYear = parseInt(yearSel.value, 10) || new Date().getFullYear();
  const totalWeeks = getISOWeeksInYear(isoYear);
  const today = new Date();
  const { week: currentWeek } = getISOWeekInfoSafe(today);

  let opts = '';
  for (let w = 1; w <= totalWeeks; w++) {
    const { start, end } = getISOWeekDateRange(isoYear, w);
    opts += `<option value="${w}">Semana ${w} (${fmtFechaCorta(start)} - ${fmtFechaCorta(end)})</option>`;
  }
  weekSel.innerHTML = opts;
  if (isoYear === today.getFullYear() && currentWeek >= 1 && currentWeek <= totalWeeks) {
    weekSel.value = String(currentWeek);
  }

  document.getElementById('week-report-results').style.display = 'none';
  document.getElementById('week-report-empty').style.display = 'none';
  document.getElementById('week-report-pdf-btn').style.display = 'none';
}

function getISOWeekInfoSafe(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000));
  return { week, isoYear: d.getUTCFullYear() };
}

let weekReportData = null;
let weekReportOpenCategory = null;

function generateWeeklyReport() {
  const isoYear = parseInt(document.getElementById('week-report-year').value, 10);
  const week = parseInt(document.getElementById('week-report-week').value, 10);
  const { start, end } = getISOWeekDateRange(isoYear, week);

  const buckets = { terminado: [], pendiente: [], cancelado: [] };

  (data.naves || []).forEach(nave => {
    (nave.items || []).forEach(item => {
      const d = getItemEffectiveDate(item);
      if (!d) return;
      if (d < start || d > end) return;

      const entry = { title: item.title, nave: nave.nave || nave.consola || '', fechaDate: d, tipo: item.type };
      if (item.cancelado) buckets.cancelado.push(entry);
      else if (item.proceso && item.proceso.planoTerminado) buckets.terminado.push(entry);
      else buckets.pendiente.push(entry);
    });
  });

  weekReportData = { isoYear, week, start, end, ...buckets };
  weekReportOpenCategory = null;

  document.getElementById('week-count-terminado').textContent = buckets.terminado.length;
  document.getElementById('week-count-pendiente').textContent = buckets.pendiente.length;
  document.getElementById('week-count-cancelado').textContent = buckets.cancelado.length;
  document.getElementById('week-report-range').textContent = `Semana ${week} · ${fmtFechaLarga(start)} — ${fmtFechaLarga(end)}`;
  document.getElementById('week-report-detail').style.display = 'none';
  document.querySelectorAll('.week-stat-card').forEach(c => c.classList.remove('active'));

  const total = buckets.terminado.length + buckets.pendiente.length + buckets.cancelado.length;
  document.getElementById('week-report-results').style.display = total ? 'block' : 'none';
  document.getElementById('week-report-empty').style.display = total ? 'none' : 'block';
  document.getElementById('week-report-pdf-btn').style.display = total ? 'inline-flex' : 'none';
}

const WEEK_CAT_LABELS = { terminado: 'Cambios finalizados', pendiente: 'Cambios pendientes', cancelado: 'Cambios cancelados' };

function toggleWeekReportDetail(cat) {
  if (!weekReportData) return;
  const detailWrap = document.getElementById('week-report-detail');
  const list = document.getElementById('week-report-detail-list');
  const title = document.getElementById('week-report-detail-title');

  if (weekReportOpenCategory === cat) {
    weekReportOpenCategory = null;
    detailWrap.style.display = 'none';
    document.querySelectorAll('.week-stat-card').forEach(c => c.classList.remove('active'));
    return;
  }
  weekReportOpenCategory = cat;
  document.querySelectorAll('.week-stat-card').forEach(c => c.classList.remove('active'));
  document.getElementById('week-card-' + cat).classList.add('active');

  const items = weekReportData[cat] || [];
  title.textContent = `${WEEK_CAT_LABELS[cat]} (${items.length})`;
  list.innerHTML = items.length
    ? items.map(it => `<div class="week-report-detail-item"><b>${escHtml(it.title)}</b><span>${escHtml(it.nave)} · ${it.fechaDate ? fmtFechaLarga(it.fechaDate) : ''}</span></div>`).join('')
    : '<div class="week-report-detail-item">Sin registros en esta categoría.</div>';
  detailWrap.style.display = 'block';
}

async function generateWeeklyReportPDF() {
  if (!weekReportData) return;
  const btn = document.getElementById('week-report-pdf-btn');
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> Generando...';

  try {
    const { start, end, week, terminado, pendiente, cancelado } = weekReportData;
    const section = (label, colorBg, colorText, items) => `
      <div style="margin-bottom:22px;">
        <div style="display:flex; align-items:center; justify-content:space-between; background:${colorBg}; color:${colorText}; padding:10px 14px; border-radius:10px; font-weight:800; font-size:14px;">
          <span>${label}</span><span>${items.length}</span>
        </div>
        <table style="width:100%; border-collapse:collapse; margin-top:8px; font-size:12px;">
          <thead><tr style="background:#f1f5f9;"><th style="text-align:left;padding:6px 8px;">Título</th><th style="text-align:left;padding:6px 8px;">Mueble</th><th style="text-align:left;padding:6px 8px;">Fecha</th></tr></thead>
          <tbody>
            ${items.length ? items.map(it => `<tr><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escHtml(it.title)}</td><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escHtml(it.nave)}</td><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${it.fechaDate ? fmtFechaLarga(it.fechaDate) : ''}</td></tr>`).join('') : '<tr><td colspan="3" style="padding:8px;color:#64748b;">Sin registros.</td></tr>'}
          </tbody>
        </table>
      </div>`;

    const container = document.createElement('div');
    container.style.cssText = 'padding:40px; font-family:Inter,sans-serif; color:#1e293b; background:#fff; width:800px;';
    container.innerHTML = `
      <h1 style="font-size:22px; margin-bottom:4px;">Reporte Semanal Histórico</h1>
      <p style="color:#64748b; margin-bottom:20px;">Semana ${week} · ${fmtFechaLarga(start)} — ${fmtFechaLarga(end)} · Generado el ${new Date().toLocaleString('es-MX')}</p>
      ${section('✅ Cambios finalizados', '#dcfce7', '#15803d', terminado)}
      ${section('⏳ Cambios pendientes', '#fef3c7', '#b45309', pendiente)}
      ${section('🚫 Cambios cancelados', '#fee2e2', '#b91c1c', cancelado)}
    `;
    document.body.appendChild(container);

    const opt = {
      margin: [10, 10, 10, 10],
      filename: `reporte_semanal_${weekReportData.isoYear}_S${week}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    const blob = await html2pdf().set(opt).from(container).output('blob');
    document.body.removeChild(container);

    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  } catch (err) {
    console.error('Error al generar el PDF del reporte semanal:', err);
    alert('❌ No se pudo generar el PDF: ' + (err.message || err));
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

function openDashboard() {
  document.getElementById('modal-dashboard').classList.add('open');
  populateWeekYearSelector();
  setTimeout(renderDashboard, 200);
}

function clearDashFilter(field) {
  dashFilters[field] = null;
  if(field === 'tipo') dashFilters.clasificacion = null;
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
          dashFilters.impacto = params.name;
          renderDashboard();
      });
  }

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
  chartTipo.resize();

  let cEntries = Object.entries(clasifCounts).sort((a, b) => a[1] - b[1]);
  let cKeys = cEntries.map(e => e[0]);
  const palette = ['#3b82f6', '#06b6d4', '#10b981', '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#6366f1', '#0ea5e9', '#d946ef', '#f43f5e', '#8b5cf6'];

  let coloredData = cEntries.map(([k, v], i) => {
      return {
          value: v,
          name: k,
          itemStyle: { color: palette[i % palette.length] }
      };
  });

  const clasifBox = document.getElementById('chart-clasificacion');
  const clasifHeight = Math.max(250, cKeys.length * 34 + 60);
  clasifBox.style.height = clasifHeight + 'px';

  chartClasif.setOption({
      tooltip: { trigger: 'item' },
      grid: { left: '3%', right: '8%', top: 10, bottom: 20, containLabel: true },
      xAxis: { type: 'value' },
      yAxis: {
          type: 'category',
          data: cKeys,
          axisLabel: { width: 160, overflow: 'truncate', fontSize: 11 }
      },
      series: [{
          data: coloredData,
          type: 'bar',
          barMaxWidth: 22,
          label: { show: true, position: 'right', fontSize: 11, fontWeight: 600 }
      }]
  }, true);
  chartClasif.resize();

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
  chartImpacto.resize();

  renderDashList(relatedItems);

  const totalR = relatedItems.length;
  let conclusiones = [];
  if (totalR === 0) {
      conclusiones.push("No hay registros suficientes para generar un análisis con los filtros actuales.");
  } else {
      let tipos = [{name: 'Errores', val: tError}, {name: 'Ajustes', val: tAjuste}, {name: 'Mejoras', val: tMejora}];
      tipos.sort((a,b) => b.val - a.val);
      if(tipos[0].val > 0) {
          conclusiones.push(`📌 <b>Tendencia principal:</b> El tipo de reporte predominante es <b>${tipos[0].name}</b>, representando el ${Math.round((tipos[0].val/totalR)*100)}% de los registros analizados.`);
      }

      if(cKeys.length > 0) {
          let maxClasif = cKeys.reduce((a, b) => clasifCounts[a] > clasifCounts[b] ? a : b);
          conclusiones.push(`📊 <b>Clasificación más frecuente:</b> La categoría con mayor incidencia es <b>${maxClasif}</b> (${clasifCounts[maxClasif]} casos). Sería recomendable enfocar acciones preventivas o de mejora en esta área.`);
      }

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

  if (chartTipo) chartTipo.resize();
  if (chartClasif) chartClasif.resize();
  if (chartImpacto) chartImpacto.resize();

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
          let mNames = n.models.map(m=>m.name).join('<br>');
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

async function quickSaveGithub() {
  const cfg = loadGithubConfig();
  if (cfg && cfg.repo && cfg.path && cfg.token) {
    document.getElementById('gh-repo').value = cfg.repo;
    document.getElementById('gh-path').value = cfg.path;
    document.getElementById('gh-branch').value = cfg.branch || 'main';
    document.getElementById('gh-token').value = cfg.token;
    document.getElementById('gh-remember').checked = true;
    return pushToGithub();
  } else {
    const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    setGithubStatus(
      (user ? `👤 Usuario activo: ${user.nombre || user.username} (${user.username})\n\n` : '') +
      'Todavía no hay una configuración de GitHub guardada en este navegador.\n\n' +
      'Pega aquí el Token (es ÚNICO y COMPARTIDO por todos los usuarios) y guarda.\n' +
      'A partir de ese momento, todos podrán subir cambios, y cada commit quedará etiquetado con el usuario que lo hizo.',
      'info'
    );
    openGithubModal();
  }
}

// Inicializar
cargarDatosIniciales();
initFirebaseMessaging();
