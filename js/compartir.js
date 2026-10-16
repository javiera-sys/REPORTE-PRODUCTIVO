/* ============================================================
   COMPARTIR CAMBIOS  (js/compartir.js)
   Genera una imagen tipo tarjeta de uno o varios cambios
   (de naves y de Pendientes Generales) y la comparte por
   WhatsApp u otra app. Archivo independiente: si algo falla
   aquí, el resto de la página sigue funcionando.
   ============================================================ */
(function () {
  'use strict';

  const F = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const COLORES = { error: '#dc2626', ajuste: '#d97706', mejora: '#0f6e8c', pg: '#7c3aed' };
  const ETIQUETAS = { error: 'ERROR', ajuste: 'AJUSTE', mejora: 'MEJORA' };
  const seleccion = new Set();   // claves 'i:ID' (cambio de nave) o 'p:ID' (pendiente general)
  let ocupado = false;

  /* ---------- Estilos (se inyectan solos) ---------- */
  const css = `
.share-row{display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-shrink:0}
.share-btn{width:30px;height:30px;border-radius:8px;border:1px solid var(--color-border-secondary,#cbd5e1);
  background:var(--color-background-primary,#fff);color:var(--color-text-secondary,#475569);
  display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:15px;padding:0}
.share-btn:hover{background:#e0f2f1;color:#0f6e8c;border-color:#99e6df}
.share-check i{opacity:0}
.share-check.on{background:#0f6e8c;border-color:#0f6e8c;color:#fff}
.share-check.on i{opacity:1}
.share-bar{position:fixed;left:12px;bottom:16px;max-width:calc(100vw - 100px);z-index:9000;
  display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 14px;background:#0f172a;color:#fff;
  border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.3);font-size:14px}
.share-bar-btn{border:0;border-radius:10px;padding:8px 14px;font-weight:700;cursor:pointer;
  background:rgba(255,255,255,.15);color:#fff;font-family:inherit;font-size:13px}
.share-bar-btn.primary{background:#16a34a}
.exporting-pdf .share-row,.exporting-pdf .share-bar{display:none !important}
@media print{.share-row,.share-bar{display:none !important}}
`;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  function aviso(msg, tipo) {
    try { if (typeof showToast === 'function') showToast(msg, tipo); } catch (e) {}
  }

  /* ---------- Datos: convertir un cambio en un "registro" simple ---------- */
  function aTexto(html) {
    if (html == null || html === '') return '';
    let s = String(html);
    try { if (typeof renderDescripcion === 'function') s = renderDescripcion(s); } catch (e) {}
    const d = new DOMParser().parseFromString(s, 'text/html').body;   // documento inerte: no ejecuta nada
    d.querySelectorAll('li').forEach(li => li.prepend('• '));
    d.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
    d.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6,tr').forEach(b => b.append('\n'));
    return (d.textContent || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function imgsValidas(arr) {
    return (Array.isArray(arr) ? arr : []).filter(a =>
      typeof a === 'string' && a && !/^data:application\/pdf/i.test(a) && !/\.pdf(\?|$)/i.test(a));
  }

  function estadoItem(it) {
    if (it.cancelado) return 'CANCELADO';
    if (it.proceso && it.proceso.planoTerminado && it.validadoPorAdmin) return 'TERMINADO';
    if (it.proceso && it.proceso.planoTerminado) return 'POR REVISAR';
    return 'PENDIENTE';
  }

  function recItem(n, it) {
    const modelos = (n.models || []).map(m => m && m.name).filter(Boolean);
    return {
      tipo: COLORES[it.type] ? it.type : 'ajuste',
      etiqueta: ETIQUETAS[it.type] || 'CAMBIO',
      estado: estadoItem(it),
      title: it.title || '(sin título)',
      desc: aTexto(it.desc),
      fecha: (typeof formatDateEs === 'function') ? formatDateEs(it.fecha) : (it.fecha || ''),
      contexto: [n.nave, n.consola].filter(Boolean).join(' · '),
      modelos: modelos,
      extra: it.odt && it.odt !== 'undefined' ? 'ODT: ' + it.odt : '',
      imgs: imgsValidas(it.adjuntos)
    };
  }

  function recPG(pg) {
    const subs = Array.isArray(pg.subItems) ? pg.subItems : [];
    const activos = subs.filter(s => !s.cancelado);
    const hechos = activos.filter(s => s.completado === true).length;
    const todo = activos.length > 0 && hechos === activos.length;
    return {
      tipo: 'pg',
      etiqueta: 'PENDIENTE GENERAL',
      estado: todo ? 'TERMINADO' : '',
      title: pg.title || '(sin título)',
      desc: aTexto(pg.desc),
      fecha: pg.createdAt ? new Date(pg.createdAt).toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '',
      contexto: '',
      modelos: [],
      extra: activos.length ? 'Muebles: ' + hechos + ' de ' + activos.length + ' listos' : '',
      imgs: imgsValidas(pg.adjuntos)
    };
  }

  function buscar(clave) {
    const k = String(clave);
    const tipo = k.charAt(0), id = k.slice(2);
    if (tipo === 'p') {
      const pg = (data.pendientesGenerales || []).find(p => p.id === id);
      return pg ? recPG(pg) : null;
    }
    for (const n of (data.naves || [])) {
      const it = (n.items || []).find(i => i.id === id);
      if (it) return recItem(n, it);
    }
    return null;
  }

  /* ---------- Dibujo de la imagen ---------- */
  function envolver(ctx, texto, maxW, maxLineas) {
    const lineas = [];
    String(texto || '').split('\n').forEach(par => {
      if (!par.trim()) { lineas.push(''); return; }
      let linea = '';
      par.split(/\s+/).filter(Boolean).forEach(pal => {
        const prueba = linea ? linea + ' ' + pal : pal;
        if (ctx.measureText(prueba).width <= maxW) { linea = prueba; return; }
        if (linea) lineas.push(linea);
        if (ctx.measureText(pal).width <= maxW) { linea = pal; return; }
        let trozo = '';                                   // palabra más ancha que la tarjeta
        for (const ch of pal) {
          if (ctx.measureText(trozo + ch).width > maxW) { lineas.push(trozo); trozo = ch; } else trozo += ch;
        }
        linea = trozo;
      });
      if (linea) lineas.push(linea);
    });
    while (lineas.length && lineas[lineas.length - 1] === '') lineas.pop();
    if (maxLineas && lineas.length > maxLineas) {
      lineas.length = maxLineas;
      let ult = lineas[maxLineas - 1];
      while (ult && ctx.measureText(ult + '…').width > maxW) ult = ult.slice(0, -1);
      lineas[maxLineas - 1] = ult.trimEnd() + '…';
    }
    return lineas;
  }

  function cargarImg(src) {
    return new Promise(res => {
      const im = new Image();
      if (/^https?:/i.test(src) && src.indexOf(location.origin) !== 0) im.crossOrigin = 'anonymous';
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    });
  }

  function dibujarContener(ctx, im, x, y, w, h) {
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(x, y, w, h);
    const r = Math.min(w / im.width, h / im.height);
    const dw = im.width * r, dh = im.height * r;
    ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  function hoyTexto() {
    return new Date().toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  // Tarjeta de UN cambio (grande, con fotos)
  function dibujarUno(ctx, W, rec, imgs, seco) {
    const P = 56, ancho = W - P * 2, col = COLORES[rec.tipo] || '#0f6e8c';
    let y = 0;
    const bloque = (font, color, texto, maxLineas, lh) => {
      ctx.font = font; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      const ls = envolver(ctx, texto, ancho, maxLineas);
      ls.forEach(l => { y += lh; if (!seco) { ctx.fillStyle = color; ctx.fillText(l, P, y); } });
      return ls.length;
    };

    if (!seco) {
      ctx.fillStyle = col; ctx.fillRect(0, 0, W, 124);
      ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff';
      ctx.font = '800 40px ' + F; ctx.textAlign = 'left'; ctx.fillText(rec.etiqueta, P, 62);
      ctx.font = '600 28px ' + F; ctx.textAlign = 'right';
      ctx.fillText([rec.estado, rec.fecha].filter(Boolean).join('  ·  '), W - P, 62);
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    }
    y = 124 + 24;

    if (rec.contexto) bloque('700 32px ' + F, '#0f172a', rec.contexto, 2, 42);
    if (rec.modelos.length) {
      const txt = 'Modelos: ' + rec.modelos.slice(0, 4).join(', ') +
        (rec.modelos.length > 4 ? '  +' + (rec.modelos.length - 4) + ' más' : '');
      bloque('500 26px ' + F, '#64748b', txt, 2, 34);
    }
    y += 18;
    bloque('800 54px ' + F, '#0f172a', rec.title, 3, 64);
    y += 22;
    if (!seco) { ctx.fillStyle = col; ctx.fillRect(P, y, 120, 6); }
    y += 6 + 12;
    if (rec.desc) { bloque('400 34px ' + F, '#334155', rec.desc, 14, 48); y += 20; }
    if (rec.extra) { bloque('700 30px ' + F, col, rec.extra, 2, 42); y += 12; }

    if (imgs.length) {
      y += 24;
      const n = Math.min(imgs.length, 4), cols = n === 1 ? 1 : 2, gap = 16;
      const cw = (ancho - gap * (cols - 1)) / cols, ch = n === 1 ? 640 : 380;
      const filas = Math.ceil(n / cols);
      if (!seco) {
        for (let i = 0; i < n; i++) {
          dibujarContener(ctx, imgs[i], P + (i % cols) * (cw + gap), y + Math.floor(i / cols) * (ch + gap), cw, ch);
        }
      }
      y += filas * ch + (filas - 1) * gap + 30;
    }

    y += 8;
    if (!seco) { ctx.fillStyle = '#e2e8f0'; ctx.fillRect(0, y, W, 2); }
    y += 40;
    if (!seco) {
      ctx.font = '500 24px ' + F; ctx.fillStyle = '#64748b';
      ctx.textAlign = 'left'; ctx.fillText('Errores y Mejoras de Producción · ISO 1.5', P, y);
      ctx.textAlign = 'right'; ctx.fillText('Compartido ' + hoyTexto(), W - P, y);
      ctx.textAlign = 'left';
    }
    return y + 36;
  }

  // Tarjeta con VARIOS cambios (lista compacta)
  function dibujarVarios(ctx, W, recs, imgsLista, seco, pagina, paginas) {
    const P = 44, ancho = W - P * 2;
    let y = 120;
    if (!seco) {
      ctx.fillStyle = '#0f6e8c'; ctx.fillRect(0, 0, W, 120);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#ffffff';
      ctx.font = '800 38px ' + F; ctx.fillText('Errores y Mejoras de Producción', P, 54);
      ctx.font = '500 26px ' + F;
      ctx.fillText(hoyTexto() + (paginas > 1 ? '  ·  Hoja ' + pagina + ' de ' + paginas : ''), P, 94);
    }

    recs.forEach((rec, i) => {
      const col = COLORES[rec.tipo] || '#0f6e8c';
      const img = imgsLista[i] && imgsLista[i][0];
      const tw = 220, th = 165, xTxt = P + 30;
      const anchoTxt = ancho - 30 - (img ? tw + 24 : 0);
      const et = rec.etiqueta + (rec.estado ? '  ·  ' + rec.estado : '');

      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.font = '700 34px ' + F;
      const lt = envolver(ctx, rec.title, anchoTxt, 2);
      ctx.font = '500 24px ' + F;
      const lc = rec.contexto ? envolver(ctx, rec.contexto, anchoTxt, 1) : [];
      ctx.font = '400 28px ' + F;
      const ld = rec.desc ? envolver(ctx, rec.desc, anchoTxt, 3) : [];

      const hTxt = 30 + lt.length * 42 + lc.length * 32 + ld.length * 38;
      const alto = Math.max(hTxt, img ? th : 0) + 56;

      if (!seco) {
        ctx.fillStyle = col; ctx.fillRect(P, y + 24, 10, alto - 48);
        let ty = y + 28 + 24;
        ctx.font = '800 22px ' + F; ctx.fillStyle = col; ctx.fillText(et, xTxt, ty);
        ty += 6;
        ctx.font = '700 34px ' + F; ctx.fillStyle = '#0f172a';
        lt.forEach(l => { ty += 42; ctx.fillText(l, xTxt, ty); });
        ctx.font = '500 24px ' + F; ctx.fillStyle = '#64748b';
        lc.forEach(l => { ty += 32; ctx.fillText(l, xTxt, ty); });
        ctx.font = '400 28px ' + F; ctx.fillStyle = '#334155';
        ld.forEach(l => { ty += 38; ctx.fillText(l, xTxt, ty); });
        if (img) dibujarContener(ctx, img, W - P - tw, y + 28, tw, th);
        if (i < recs.length - 1) { ctx.fillStyle = '#e2e8f0'; ctx.fillRect(P, y + alto - 1, ancho, 2); }
      }
      y += alto;
    });

    y += 14;
    if (!seco) {
      ctx.fillStyle = '#e2e8f0'; ctx.fillRect(0, y, W, 2);
      ctx.font = '500 22px ' + F; ctx.fillStyle = '#64748b'; ctx.textAlign = 'left';
      ctx.fillText('ISO 1.5 · ' + recs.length + (recs.length === 1 ? ' cambio' : ' cambios') + ' en esta hoja', P, y + 36);
    }
    return y + 60;
  }

  async function generarPaginas(recs) {
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
    const W = 1080, paginas = [];
    const crear = (dibujar) => {
      const c = document.createElement('canvas');
      c.width = W; c.height = 100;
      const h = dibujar(c.getContext('2d'), true);      // 1ª pasada: solo medir
      c.height = Math.ceil(h);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, c.height);
      dibujar(ctx, false);                                // 2ª pasada: dibujar
      return c;
    };
    if (recs.length === 1) {
      const imgs = (await Promise.all(recs[0].imgs.slice(0, 5).map(cargarImg))).filter(Boolean);
      paginas.push(crear((ctx, seco) => dibujarUno(ctx, W, recs[0], imgs, seco)));
    } else {
      const POR = 6, total = Math.ceil(recs.length / POR);
      for (let p = 0; p < total; p++) {
        const lote = recs.slice(p * POR, (p + 1) * POR);
        const lista = await Promise.all(lote.map(r =>
          Promise.all(r.imgs.slice(0, 2).map(cargarImg)).then(a => a.filter(Boolean))));
        paginas.push(crear((ctx, seco) => dibujarVarios(ctx, W, lote, lista, seco, p + 1, total)));
      }
    }
    return paginas;
  }

  /* ---------- Compartir ---------- */
  const aBlob = c => new Promise((ok, mal) =>
    c.toBlob(b => b ? ok(b) : mal(new Error('No se pudo crear la imagen')), 'image/png'));

  function leyenda(recs) {
    if (recs.length === 1) {
      const r = recs[0], l = ['*' + r.title + '*'];
      if (r.contexto) l.push(r.contexto);
      const sub = [r.estado, r.fecha].filter(Boolean).join(' · ');
      if (sub) l.push(sub);
      return l.join('\n');
    }
    return '*Cambios (' + recs.length + ')*\n' +
      recs.map(r => '• ' + r.title + (r.contexto ? ' — ' + r.contexto : '')).join('\n');
  }

  async function respaldo(blobs, archivos, texto) {
    let copiada = false;
    if (blobs.length === 1 && navigator.clipboard && window.ClipboardItem) {
      try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobs[0] })]); copiada = true; } catch (e) {}
    }
    if (!copiada) {
      archivos.forEach((f, i) => setTimeout(() => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(f); a.download = f.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }, i * 400));
    }
    aviso(copiada ? 'Imagen copiada. En WhatsApp pégala con Ctrl+V.' : 'Imagen descargada. Adjúntala en WhatsApp.', 'success');
    try { window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank', 'noopener'); } catch (e) {}
  }

  async function compartirRecs(recs) {
    if (ocupado || !recs.length) return;
    ocupado = true;
    try {
      aviso('Preparando imagen…', 'info');
      const canvases = await generarPaginas(recs);
      const blobs = await Promise.all(canvases.map(aBlob));
      const stamp = new Date().toISOString().slice(0, 10);
      const archivos = blobs.map((b, i) => new File([b],
        'cambio-' + stamp + (blobs.length > 1 ? '-' + (i + 1) : '') + '.png', { type: 'image/png' }));
      const texto = leyenda(recs);
      let compartido = false;
      if (navigator.canShare && navigator.canShare({ files: archivos })) {
        try {
          await navigator.share({ files: archivos, title: 'Errores y Mejoras de Producción', text: texto });
          compartido = true;
        } catch (e) {
          if (e && e.name === 'AbortError') return;       // el usuario cerró el menú: no hacemos nada más
        }
      }
      if (!compartido) await respaldo(blobs, archivos, texto);
      limpiarSeleccion();
    } catch (e) {
      console.error('[Compartir]', e);
      aviso('No se pudo generar la imagen' +
        (e && e.name === 'SecurityError' ? ': una de las fotos bloquea la exportación.' : '.'), 'error');
    } finally {
      ocupado = false;
    }
  }

  /* ---------- Botones y selección ---------- */
  function controles(tipo, id) {
    const k = tipo + ':' + id, on = seleccion.has(k);
    return '<div class="share-row">' +
      '<button type="button" class="share-btn share-check' + (on ? ' on' : '') + '" data-sk="' + k + '" ' +
        'title="Seleccionar para compartir varios" onclick="toggleShareSel(\'' + tipo + '\',\'' + id + '\', event)">' +
        '<i class="ti ti-check"></i></button>' +
      '<button type="button" class="share-btn" title="Compartir este cambio" ' +
        'onclick="compartirUno(\'' + tipo + '\',\'' + id + '\', event)"><i class="ti ti-share"></i></button>' +
      '</div>';
  }

  function barra() {
    let b = document.getElementById('share-bar');
    const n = seleccion.size;
    if (!n) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement('div');
      b.id = 'share-bar'; b.className = 'share-bar';
      document.body.appendChild(b);
    }
    b.innerHTML = '<span><b>' + n + '</b> seleccionado' + (n === 1 ? '' : 's') + '</span>' +
      '<button type="button" class="share-bar-btn primary" onclick="compartirSeleccion()"><i class="ti ti-share"></i> Compartir</button>' +
      '<button type="button" class="share-bar-btn" onclick="limpiarSeleccionShare()">Cancelar</button>';
  }

  function limpiarSeleccion() {
    seleccion.clear();
    document.querySelectorAll('.share-check.on').forEach(b => b.classList.remove('on'));
    barra();
  }

  window.shareControlsHtml = controles;
  window.toggleShareSel = function (tipo, id, ev) {
    if (ev) ev.stopPropagation();
    const k = tipo + ':' + id;
    if (seleccion.has(k)) seleccion.delete(k); else seleccion.add(k);
    document.querySelectorAll('.share-check').forEach(b => {
      if (b.dataset.sk === k) b.classList.toggle('on', seleccion.has(k));
    });
    barra();
  };
  window.compartirUno = function (tipo, id, ev) {
    if (ev) ev.stopPropagation();
    const r = buscar(tipo + ':' + id);
    if (r) compartirRecs([r]); else aviso('No se encontró ese cambio.', 'error');
  };
  window.compartirSeleccion = function () {
    const recs = Array.from(seleccion).map(buscar).filter(Boolean);
    if (recs.length) compartirRecs(recs);
  };
  window.limpiarSeleccionShare = limpiarSeleccion;
  window.compartirGenerarImagenes = generarPaginas;   // para pruebas
  window.compartirBuscar = buscar;                    // para pruebas
})();
