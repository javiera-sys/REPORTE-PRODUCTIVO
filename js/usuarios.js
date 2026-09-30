/* ============================================================
   MÓDULO DE USUARIOS Y ROLES
   ============================================================
   REGLAS DE SEGURIDAD:
   - "javier.c" es el ADMIN PRINCIPAL (control total de usuarios).
     Solo él puede: crear usuarios, eliminar usuarios, cambiar/restablecer
     contraseñas de cualquier usuario.
   - Los demás administradores conservan el resto de permisos de la app
     (borrar cambios, restaurar versiones, etc.) pero NO pueden gestionar
     usuarios.
   - La contraseña de "javier.c" solo la puede cambiar él mismo.
   - "javier.c" nunca puede ser eliminado.
   - Restricciones aplicadas en lógica (no solo en UI).
   ============================================================ */

const USUARIOS_FILE = 'data/usuarios.json';
const SESSION_KEY = 'rpi_session_user';
const SALT = 'rpi_prod_2026_salt_v1';

// 🔒 Admin principal — única cuenta con control de usuarios
const PROTECTED_ADMIN = 'javier.c';

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

/* ---------- Helpers de seguridad ---------- */
function esAdminProtegido(username) {
  return String(username || '').toLowerCase() === PROTECTED_ADMIN.toLowerCase();
}

// ¿El usuario actual es el admin principal?
function soyAdminPrincipal() {
  return !!currentUser && currentUser.username.toLowerCase() === PROTECTED_ADMIN.toLowerCase();
}

// ¿El usuario actual puede gestionar usuarios (crear/eliminar/password)?
function puedeGestionarUsuarios() {
  return soyAdminPrincipal();
}

// ¿Puedo modificar (editar/password) al usuario objetivo?
function puedeModificarA(usernameObjetivo) {
  if (!currentUser) return false;
  const yo = currentUser.username.toLowerCase();
  const objetivo = String(usernameObjetivo || '').toLowerCase();
  // Si el objetivo es el admin principal → solo él mismo puede modificarse
  if (objetivo === PROTECTED_ADMIN.toLowerCase()) return yo === PROTECTED_ADMIN.toLowerCase();
  // Para los demás usuarios: solo el admin principal puede gestionarlos
  return soyAdminPrincipal();
}

// ¿Puedo eliminar al usuario objetivo?
function puedeEliminarA(usernameObjetivo) {
  if (!currentUser) return false;
  const objetivo = String(usernameObjetivo || '').toLowerCase();
  // El admin principal NUNCA puede eliminarse (ni por él mismo)
  if (objetivo === PROTECTED_ADMIN.toLowerCase()) return false;
  // Solo el admin principal puede eliminar
  return soyAdminPrincipal();
}

/* ---------- Activar modo edición (helper reutilizable) ---------- */
function activarModoEdicion() {
  if (typeof isEditableMode !== 'undefined' && !isEditableMode) {
    isEditableMode = true;
    document.body.classList.remove('is-locked');
    const lockBtn = document.getElementById('btn-lock-toggle');
    if (lockBtn) {
      lockBtn.className = 'btn btn-green';
      lockBtn.innerHTML = '<i class="ti ti-lock-open"></i> MODO EDICIÓN 🔓';
    }
    if (typeof renderPG === 'function') renderPG();
  }
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
      setTimeout(activarModoEdicion, 500);
    }
  } catch (e) { }
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
  activarModoEdicion();
  return { ok: true, user: currentUser };
}

function logoutUsuario() {
  currentUser = null;
  guardarSesion();
  actualizarUISesion();
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
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin() ? '' : 'none';
  });
  // 🔒 Solo el admin principal ve el módulo de usuarios
  document.querySelectorAll('.admin-principal-only').forEach(el => {
    el.style.display = soyAdminPrincipal() ? '' : 'none';
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

/* ---------- Administración de usuarios (SOLO ADMIN PRINCIPAL) ---------- */
function openAdminUsuarios() {
  // 🔒 Restricción real: solo el admin principal
  if (!soyAdminPrincipal()) {
    alert('🔒 Solo la cuenta principal puede administrar usuarios.');
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

  list.innerHTML = usuariosDB.map((u, idx) => {
    const esProtegido = esAdminProtegido(u.username);
    const esYo = currentUser && currentUser.username.toLowerCase() === u.username.toLowerCase();

    // Botón editar / password: oculto si el objetivo es el protegido y yo no soy él
    const puedeEditar = !esProtegido || esYo;
    // Botón eliminar: nunca en el protegido; nunca en uno mismo
    const puedeBorrar = !esProtegido && !esYo;

    return `
    <div class="access-chip" style="flex-wrap:wrap; gap:6px;">
      <span style="flex:1; min-width:150px;">
        <b>${escHtml(u.nombre)}</b>
        <span style="font-size:11px; color:var(--color-text-secondary);">(${escHtml(u.username)})</span>
        <span class="user-role-badge ${u.rol === 'admin' ? 'role-admin' : 'role-user'}">${u.rol === 'admin' ? '👑 ADMIN' : '👤 USUARIO'}</span>
        ${esProtegido ? '<span class="user-role-badge role-protected">🔒 PRINCIPAL</span>' : ''}
        ${u.activo ? '' : '<span class="user-role-badge role-inactive">⛔ INACTIVO</span>'}
      </span>
      ${puedeEditar
        ? `<button class="btn btn-xs btn-ghost" title="Editar" onclick="editAdminUsuario(${idx})"><i class="ti ti-pencil"></i></button>`
        : `<button class="btn btn-xs btn-ghost" disabled title="Solo el propio ${escHtml(u.nombre)} o la cuenta principal puede editar" style="opacity:0.35;cursor:not-allowed;"><i class="ti ti-pencil"></i></button>`
      }
      ${puedeEditar
        ? `<button class="btn btn-xs btn-amber" title="Cambiar contraseña" onclick="changeAdminPassword(${idx})"><i class="ti ti-key"></i></button>`
        : `<button class="btn btn-xs btn-amber" disabled title="Solo el propio ${escHtml(u.nombre)} puede cambiar su contraseña" style="opacity:0.35;cursor:not-allowed;"><i class="ti ti-key"></i></button>`
      }
      <button class="btn btn-xs ${u.activo ? 'btn-danger-ghost' : 'btn-green'}" title="${u.activo ? 'Desactivar' : 'Activar'}" onclick="toggleAdminUsuario(${idx})">
        <i class="ti ${u.activo ? 'ti-user-off' : 'ti-user-check'}"></i>
      </button>
      ${puedeBorrar
        ? `<button class="btn btn-xs btn-danger-ghost" title="Eliminar" onclick="deleteAdminUsuario(${idx})"><i class="ti ti-trash"></i></button>`
        : ''
      }
    </div>
  `;
  }).join('');
}

function editAdminUsuario(idx) {
  // 🔒 Restricción real
  if (!soyAdminPrincipal()) {
    alert('🔒 Solo la cuenta principal puede editar usuarios.');
    return;
  }
  const u = usuariosDB[idx];
  if (!u) return;

  if (esAdminProtegido(u.username) && !soyAdminPrincipal()) {
    alert('🔒 La cuenta principal solo puede ser editada por ella misma.');
    return;
  }

  const nuevoNombre = prompt('Nombre completo:', u.nombre);
  if (nuevoNombre === null) return;
  const nuevoUsername = prompt('Usuario (login):', u.username);
  if (nuevoUsername === null) return;
  const nuevoRol = prompt('Rol (admin / user):', u.rol);
  if (nuevoRol === null) return;
  if (!nuevoNombre.trim() || !nuevoUsername.trim()) { alert('Nombre y usuario son obligatorios.'); return; }
  if (nuevoRol !== 'admin' && nuevoRol !== 'user') { alert('Rol debe ser "admin" o "user".'); return; }

  // 🔒 El admin principal no puede perder el rol de admin
  if (esAdminProtegido(u.username) && nuevoRol !== 'admin') {
    alert('🔒 La cuenta principal no puede perder el rol de administrador.');
    return;
  }

  // 🔒 Si estoy editando la cuenta principal y cambio el username, aviso
  if (esAdminProtegido(u.username) && nuevoUsername.trim().toLowerCase() !== PROTECTED_ADMIN.toLowerCase()) {
    if (!confirm('⚠️ Estás cambiando el username de la cuenta principal.\n\nEsto romperá la protección hasta que actualices la constante PROTECTED_ADMIN en js/usuarios.js a "' + nuevoUsername.trim().toLowerCase() + '".\n\n¿Continuar de todas formas?')) {
      return;
    }
  }

  if (usuariosDB.some((x, i) => i !== idx && x.username.toLowerCase() === nuevoUsername.trim().toLowerCase())) {
    alert('Ya existe otro usuario con ese nombre de usuario.'); return;
  }
  u.nombre = nuevoNombre.trim();
  u.username = nuevoUsername.trim();
  u.rol = nuevoRol;
  renderAdminUsuarios();
}

async function changeAdminPassword(idx) {
  // 🔒 Restricción real
  const u = usuariosDB[idx];
  if (!u) return;

  const esProtegido = esAdminProtegido(u.username);
  const esYo = currentUser && currentUser.username.toLowerCase() === u.username.toLowerCase();

  // Si es la cuenta protegida → solo ella misma
  if (esProtegido && !esYo) {
    alert('🔒 La contraseña de la cuenta principal solo puede cambiarla el propio "' + u.nombre + '".');
    return;
  }
  // Si no es la cuenta protegida → solo el admin principal
  if (!esProtegido && !soyAdminPrincipal()) {
    alert('🔒 Solo la cuenta principal puede cambiar contraseñas de otros usuarios.');
    return;
  }

  const nueva = prompt('Nueva contraseña para "' + u.nombre + '":', '');
  if (nueva === null) return;
  if (!nueva || nueva.length < 4) { alert('La contraseña debe tener al menos 4 caracteres.'); return; }
  u.passwordHash = await hashPassword(nueva);
  alert('✅ Contraseña actualizada. Recuerda guardar en GitHub para que sea permanente.');
  renderAdminUsuarios();
}

function toggleAdminUsuario(idx) {
  // 🔒 Solo el admin principal puede activar/desactivar usuarios
  if (!soyAdminPrincipal()) {
    alert('🔒 Solo la cuenta principal puede activar/desactivar usuarios.');
    return;
  }
  const u = usuariosDB[idx];
  if (!u) return;
  // El admin principal no se puede desactivar a sí mismo
  if (esAdminProtegido(u.username) && currentUser && currentUser.username.toLowerCase() === u.username.toLowerCase()) {
    alert('🔒 No puedes desactivar tu propia cuenta principal.');
    return;
  }
  u.activo = !u.activo;
  renderAdminUsuarios();
}

function deleteAdminUsuario(idx) {
  // 🔒 Restricción real
  if (!soyAdminPrincipal()) {
    alert('🔒 Solo la cuenta principal puede eliminar usuarios.');
    return;
  }
  const u = usuariosDB[idx];
  if (!u) return;

  // El admin principal nunca puede ser eliminado (ni por él mismo)
  if (esAdminProtegido(u.username)) {
    alert('🔒 La cuenta principal no se puede eliminar.');
    return;
  }
  // No eliminar la propia cuenta logueada
  if (currentUser && currentUser.username.toLowerCase() === u.username.toLowerCase()) {
    alert('No puedes eliminar tu propio usuario mientras tienes la sesión activa.');
    return;
  }
  if (!confirm('¿Eliminar al usuario "' + u.nombre + '"?')) return;
  usuariosDB.splice(idx, 1);
  renderAdminUsuarios();
}

async function crearUsuarioAdmin() {
  // 🔒 Solo el admin principal
  if (!soyAdminPrincipal()) {
    alert('🔒 Solo la cuenta principal puede crear usuarios.');
    return;
  }
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

cargarUsuarios();
