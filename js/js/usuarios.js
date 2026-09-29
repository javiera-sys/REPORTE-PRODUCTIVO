/* ============================================================
   MÓDULO DE USUARIOS Y ROLES
   ============================================================
   ADVERTENCIA DE SEGURIDAD (GitHub Pages = frontend estático):
   - Las contraseñas se guardan como HASH SHA-256 + salt, nunca en texto plano.
   - Aun así, un atacante con DevTools puede ver el hash y hacer fuerza bruta
     offline, o ejecutar funciones restringidas desde la consola.
   - La ÚNICA barrera realmente fuerte es el token de GitHub: sin él, nadie
     puede escribir en el repositorio.
   - Este módulo es una barrera de DISUASIÓN y ORGANIZACIÓN, no seguridad
     criptográfica real.
   ============================================================ */

const USUARIOS_FILE = 'data/usuarios.json';
const SESSION_KEY = 'rpi_session_user';
const SALT = 'rpi_prod_2026_salt_v1'; // Salt fijo del proyecto (público, no secreto)

let usuariosDB = [];
let currentUser = null;

/* ---------- Utilidades de hash ---------- */
async function sha256Hex(texto) {
  const enc = new TextEncoder().encode(texto);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPassword(password) {
  return await sha256Hex(SALT + '::' + password);
}

/* ---------- Carga y guardado de usuarios ---------- */
async function cargarUsuarios() {
  try {
    const resp = await fetch(USUARIOS_FILE, { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const json = await resp.json();
    usuariosDB = Array.isArray(json.usuarios) ? json.usuarios : [];
  } catch (err) {
    console.warn('No se pudo cargar ' + USUARIOS_FILE + '. Se usará un admin por defecto (admin/admin).', err);
    // Admin por defecto: usuario "admin", contraseña "admin" (CAMBIAR AL PRIMER USO)
    usuariosDB = [{
      id: 'u_admin_default',
      nombre: 'Administrador',
      username: 'admin',
      passwordHash: await hashPassword('admin'),
      rol: 'admin',
      activo: true,
      createdAt: Date.now(),
      createdBy: 'sistema'
    }];
  }
  restaurarSesion();
  actualizarUISesion();
}

function restaurarSesion() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const sess = JSON.parse(raw);
    const user = usuariosDB.find(u => u.username === sess.username && u.activo);
    if (user) {
      currentUser = { username: user.username, nombre: user.nombre, rol: user.rol };
    }
  } catch (e) { /* sesión corrupta, se ignora */ }
}

function guardarSesion() {
  if (currentUser) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ username: currentUser.username }));
  } else {
    sessionStorage.removeItem(SESSION_KEY);
  }
}

/* ---------- Login / Logout ---------- */
async function loginUsuario(username, password) {
  const user = usuariosDB.find(u => u.username.toLowerCase() === String(username).toLowerCase().trim());
  if (!user) return { ok: false, error: 'Usuario no encontrado.' };
  if (!user.activo) return { ok: false, error: 'Este usuario está desactivado.' };
  const hash = await hashPassword(password);
  if (hash !== user.passwordHash) return { ok: false, error: 'Contraseña incorrecta.' };

  currentUser = { username: user.username, nombre: user.nombre, rol: user.rol };
  guardarSesion();
  actualizarUISesion();
  return { ok: true, user: currentUser };
}

function logoutUsuario() {
  currentUser = null;
  guardarSesion();
  actualizarUISesion();
  // Al cerrar sesión, se vuelve a modo lectura por seguridad
  if (typeof isEditableMode !== 'undefined' && isEditableMode) {
    isEditableMode = false;
    document.body.classList.add('is-locked');
    const btn = document.getElementById('btn-lock-toggle');
    if (btn) {
      btn.className = 'btn btn-amber';
      btn.innerHTML = '<i class="ti ti-lock"></i> MODO LECTURA 🔒';
    }
    if (typeof cancelEdit === 'function') cancelEdit();
  }
}

/* ---------- Helpers de rol ---------- */
function isLoggedIn() { return !!currentUser; }
function isAdmin() { return !!currentUser && currentUser.rol === 'admin'; }
function getCurrentUser() { return currentUser; }
function getCurrentUserLabel() {
  if (!currentUser) return 'Anónimo';
  return currentUser.nombre || currentUser.username;
}
function getCurrentUserTag() {
  if (!currentUser) return '';
  return '👤 ' + (currentUser.nombre || currentUser.username).toUpperCase();
}

/* ---------- UI de sesión ---------- */
function actualizarUISesion() {
  const btn = document.getElementById('btn-session');
  const label = document.getElementById('session-label');
  if (!btn || !label) return;
  if (currentUser) {
    btn.classList.add('logged-in');
    btn.classList.toggle('is-admin', currentUser.rol === 'admin');
    label.textContent = (currentUser.rol === 'admin' ? '👑 ' : '👤 ') + (currentUser.nombre || currentUser.username);
    btn.title = 'Sesión: ' + currentUser.nombre + ' (' + currentUser.rol + ') - Clic para cerrar sesión';
  } else {
    btn.classList.remove('logged-in', 'is-admin');
    label.textContent = 'Iniciar sesión';
    btn.title = 'Iniciar sesión';
  }
  // Mostrar/ocultar elementos exclusivos de admin
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin() ? '' : 'none';
  });
}

function openSessionModal() {
  if (currentUser) {
    if (confirm('¿Cerrar sesión de ' + currentUser.nombre + '?')) {
      logoutUsuario();
    }
    return;
  }
  const uEl = document.getElementById('session-username');
  const pEl = document.getElementById('session-password');
  const err = document.getElementById('session-error');
  if (uEl) uEl.value = '';
  if (pEl) pEl.value = '';
  if (err) err.style.display = 'none';
  document.getElementById('modal-session').classList.add('open');
  setTimeout(() => uEl && uEl.focus(), 100);
}

async function doLogin() {
  const uEl = document.getElementById('session-username');
  const pEl = document.getElementById('session-password');
  const err = document.getElementById('session-error');
  const res = await loginUsuario(uEl.value, pEl.value);
  if (res.ok) {
    closeModal('modal-session');
  } else {
    if (err) { err.textContent = '❌ ' + res.error; err.style.display = 'block'; }
  }
}

/* ---------- Administración de usuarios (solo admin) ---------- */
function openAdminUsuarios() {
  if (!isAdmin()) {
    alert('Solo el administrador puede acceder a esta sección.');
    return;
  }
  renderAdminUsuarios();
  document.getElementById('modal-admin-usuarios').classList.add('open');
}

function renderAdminUsuarios() {
  const list = document.getElementById('admin-usuarios-list');
  if (!list) return;
  if (usuariosDB.length === 0) {
    list.innerHTML = '<div class="access-empty">No hay usuarios registrados.</div>';
    return;
  }
  list.innerHTML = usuariosDB.map((u, idx) => `
    <div class="access-chip" style="flex-wrap:wrap; gap:6px;">
      <span style="flex:1; min-width:150px;">
        <b>${escHtml(u.nombre)}</b>
        <span style="font-size:11px; color:var(--color-text-secondary);">(${escHtml(u.username)})</span>
        <span class="user-role-badge ${u.rol === 'admin' ? 'role-admin' : 'role-user'}">${u.rol === 'admin' ? '👑 ADMIN' : '👤 USUARIO'}</span>
        ${u.activo ? '' : '<span class="user-role-badge role-inactive">⛔ INACTIVO</span>'}
      </span>
      <button class="btn btn-xs btn-ghost" title="Editar" onclick="editAdminUsuario(${idx})"><i class="ti ti-pencil"></i></button>
      <button class="btn btn-xs btn-amber" title="Cambiar contraseña" onclick="changeAdminPassword(${idx})"><i class="ti ti-key"></i></button>
      <button class="btn btn-xs ${u.activo ? 'btn-danger-ghost' : 'btn-green'}" title="${u.activo ? 'Desactivar' : 'Activar'}" onclick="toggleAdminUsuario(${idx})">
        <i class="ti ${u.activo ? 'ti-user-off' : 'ti-user-check'}"></i>
      </button>
      ${u.username !== 'admin' || usuariosDB.filter(x=>x.rol==='admin').length > 1 ? `<button class="btn btn-xs btn-danger-ghost" title="Eliminar" onclick="deleteAdminUsuario(${idx})"><i class="ti ti-trash"></i></button>` : ''}
    </div>
  `).join('');
}

function editAdminUsuario(idx) {
  if (!isAdmin()) return;
  const u = usuariosDB[idx];
  if (!u) return;
  const nuevoNombre = prompt('Nombre completo:', u.nombre);
  if (nuevoNombre === null) return;
  const nuevoUsername = prompt('Usuario (login):', u.username);
  if (nuevoUsername === null) return;
  const nuevoRol = prompt('Rol (admin / user):', u.rol);
  if (nuevoRol === null) return;
  if (!nuevoNombre.trim() || !nuevoUsername.trim()) { alert('Nombre y usuario son obligatorios.'); return; }
  if (nuevoRol !== 'admin' && nuevoRol !== 'user') { alert('Rol debe ser "admin" o "user".'); return; }
  if (usuariosDB.some((x, i) => i !== idx && x.username.toLowerCase() === nuevoUsername.trim().toLowerCase())) {
    alert('Ya existe otro usuario con ese nombre de usuario.'); return;
  }
  u.nombre = nuevoNombre.trim();
  u.username = nuevoUsername.trim();
  u.rol = nuevoRol;
  renderAdminUsuarios();
}

async function changeAdminPassword(idx) {
  if (!isAdmin()) return;
  const u = usuariosDB[idx];
  if (!u) return;
  const nueva = prompt('Nueva contraseña para "' + u.nombre + '":', '');
  if (nueva === null) return;
  if (!nueva || nueva.length < 4) { alert('La contraseña debe tener al menos 4 caracteres.'); return; }
  u.passwordHash = await hashPassword(nueva);
  alert('✅ Contraseña actualizada. Recuerda guardar en GitHub para que sea permanente.');
  renderAdminUsuarios();
}

function toggleAdminUsuario(idx) {
  if (!isAdmin()) return;
  const u = usuariosDB[idx];
  if (!u) return;
  u.activo = !u.activo;
  renderAdminUsuarios();
}

function deleteAdminUsuario(idx) {
  if (!isAdmin()) return;
  const u = usuariosDB[idx];
  if (!u) return;
  if (u.username === currentUser.username) {
    alert('No puedes eliminar tu propio usuario mientras tienes la sesión activa.');
    return;
  }
  if (!confirm('¿Eliminar al usuario "' + u.nombre + '"?')) return;
  usuariosDB.splice(idx, 1);
  renderAdminUsuarios();
}

async function crearUsuarioAdmin() {
  if (!isAdmin()) return;
  const nombre = document.getElementById('nu-nombre').value.trim();
  const username = document.getElementById('nu-username').value.trim();
  const password = document.getElementById('nu-password').value;
  const rol = document.getElementById('nu-rol').value;
  if (!nombre || !username || !password) { alert('Todos los campos son obligatorios.'); return; }
  if (password.length < 4) { alert('La contraseña debe tener al menos 4 caracteres.'); return; }
  if (usuariosDB.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    alert('Ya existe un usuario con ese nombre de usuario.'); return;
  }
  usuariosDB.push({
    id: 'u_' + Math.random().toString(36).slice(2, 9),
    nombre, username,
    passwordHash: await hashPassword(password),
    rol: rol === 'admin' ? 'admin' : 'user',
    activo: true,
    createdAt: Date.now(),
    createdBy: currentUser.username
  });
  document.getElementById('nu-nombre').value = '';
  document.getElementById('nu-username').value = '';
  document.getElementById('nu-password').value = '';
  renderAdminUsuarios();
  alert('✅ Usuario creado. Recuerda guardar en GitHub para que sea permanente.');
}

function getUsuariosParaGuardar() {
  return { usuarios: usuariosDB };
}

// Inicialización automática
cargarUsuarios();
