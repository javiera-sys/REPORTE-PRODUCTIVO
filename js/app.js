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
    console.error('Error al subir a GitHub:', err);
    setGithubStatus('❌ ' + (err.message || 'Verifica el token y el repositorio.'), 'error');
    if(!isModalOpen) alert('❌ Falló el guardado en GitHub:
' + (err.message || 'Error de red o permisos. Verifica tu token.'));
    
    if(mainBtn) {
        mainBtn.innerHTML = '<i class="ti ti-alert-triangle"></i> Falló al guardar';
        mainBtn.style.backgroundColor = '#ef4444';
        mainBtn.style.color = '#fff';
        mainBtn.style.borderColor = '#ef4444';
        setTimeout(() => {
            mainBtn.innerHTML = originalMainHtml;
            mainBtn.style.backgroundColor = '';
            mainBtn.style.color = '';
            mainBtn.style.borderColor = '';
            mainBtn.disabled = false;
        }, 4000);
    }
  } finally {
    if(btn) { btn.innerHTML = originalHtml; btn.disabled = false; }
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
      
  } catch (err) {
    console.error('Error al subir a GitHub:', err);
    setGithubStatus('❌ ' + (err.message || 'Verifica el token y el repositorio.'), 'error');
    if(!isModalOpen) alert('❌ Falló el guardado en GitHub:
' + (err.message || 'Error de red o permisos. Verifica tu token.'));
    
    if(mainBtn) {
        mainBtn.innerHTML = '<i class="ti ti-alert-triangle"></i> Falló al guardar';
        mainBtn.style.backgroundColor = '#ef4444';
        mainBtn.style.color = '#fff';
        mainBtn.style.borderColor = '#ef4444';
        setTimeout(() => {
            mainBtn.innerHTML = originalMainHtml;
            mainBtn.style.backgroundColor = '';
            mainBtn.style.color = '';
            mainBtn.style.borderColor = '';
            mainBtn.disabled = false;
        }, 4000);
    }
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
  }catch (err) {
    console.error('Error al subir a GitHub:', err);
    setGithubStatus('❌ ' + (err.message || 'Verifica el token y el repositorio.'), 'error');
    if(!isModalOpen) alert('❌ Falló el guardado en GitHub:
' + (err.message || 'Error de red o permisos. Verifica tu token.'));
    
    if(mainBtn) {
        mainBtn.innerHTML = '<i class="ti ti-alert-triangle"></i> Falló al guardar';
        mainBtn.style.backgroundColor = '#ef4444';
        mainBtn.style.color = '#fff';
        mainBtn.style.borderColor = '#ef4444';
        setTimeout(() => {
            mainBtn.innerHTML = originalMainHtml;
            mainBtn.style.backgroundColor = '';
            mainBtn.style.color = '';
            mainBtn.style.borderColor = '';
            mainBtn.disabled = false;
        }, 4000);
    }
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
      alert("⚠️ Aún no has configurado la conexión con GitHub.\nPor favor, haz clic en el icono de engranaje para ingresar tu Token y Repositorio.");
      openGithubModal();
  }
}

// Atajo de teclado: Ctrl + S para guardado rápido
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if(isEditableMode) quickSaveGithub();
  }
});

