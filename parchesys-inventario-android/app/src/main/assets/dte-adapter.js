/**
 * dte-adapter.js — PARCHE SYS DTE Integration Adapter
 * ─────────────────────────────────────────────────
 * Archivo de integración MODULAR. NO modifica ningún
 * archivo existente. Se incluye como <script> adicional
 * en dashboard.html o portal.html.
 *
 * Uso: <script src="dte-adapter.js"></script>
 *
 * Lo que hace:
 * 1. Agrega "Módulo DTE" en el sidebar de dashboard
 * 2. Agrega acceso rápido en el portal
 * 3. Lee negocioID del localStorage (compatible con MODUS)
 * 4. No rompe ninguna funcionalidad existente
 */

(function() {
  'use strict';

  const PARCHE_SYS_DTE_VERSION = '3.0.0';
  const negocioID = localStorage.getItem('negocioID') || new URLSearchParams(window.location.search).get('negocio');

  function dteURL() {
    return 'dte.html' + (negocioID ? '?negocio=' + negocioID : '');
  }

  /**
   * Inyección en DASHBOARD — agrega link "Módulo DTE Completo"
   * junto al link existente de "POS + DTE"
   */
  function injectDashboard() {
    // Buscar el enlace pos-link-dte existente
    const posLinkDte = document.getElementById('pos-link-dte');
    if (posLinkDte && posLinkDte.parentNode) {
      // Crear nuevo enlace modular
      const newLink = document.createElement('a');
      newLink.id = 'dte-modulo-link';
      newLink.href = dteURL();
      newLink.style.cssText = 'display:flex;align-items:center;gap:9px;padding:9px 14px;text-decoration:none;transition:background .12s;border-top:1px solid #f1f5f9';
      newLink.onmouseover = function() { this.style.background = '#eef2ff'; };
      newLink.onmouseout  = function() { this.style.background = ''; };
      newLink.innerHTML = `
        <span style="font-size:16px">📋</span>
        <div>
          <div style="font-size:11px;font-weight:800;color:#1e293b">Módulo DTE Completo</div>
          <div style="font-size:9px;color:#6366f1;font-weight:700">Emisión · Listado · Importar · Config</div>
        </div>
        <span style="margin-left:auto;background:#6366f1;color:white;font-size:7px;font-weight:800;padding:2px 5px;border-radius:10px;flex-shrink:0">NUEVO</span>
      `;
      posLinkDte.parentNode.insertBefore(newLink, posLinkDte.nextSibling);
    }

    // También en el topbar DTE (versión móvil / topbar)
    const posTopDte = document.getElementById('pos-top-dte');
    if (posTopDte && posTopDte.parentNode) {
      const topLink = document.createElement('a');
      topLink.id = 'dte-modulo-top';
      topLink.href = dteURL();
      topLink.style.cssText = 'display:flex;align-items:center;gap:10px;padding:11px 14px;text-decoration:none;transition:background .12s;border-top:1px solid #f1f5f9';
      topLink.onmouseover = function() { this.style.background = '#eef2ff'; };
      topLink.onmouseout  = function() { this.style.background = ''; };
      topLink.innerHTML = `
        <span style="font-size:18px">📋</span>
        <div>
          <div style="font-size:12px;font-weight:800;color:#1e293b">Módulo DTE Completo</div>
          <div style="font-size:9px;color:#6366f1;font-weight:700">Emisión · Historial · Importar</div>
        </div>
      `;
      posTopDte.parentNode.insertBefore(topLink, posTopDte.nextSibling);
    }

    // Agregar en sidebar nav (junto a contabilidad)
    const linkContabilidad = document.getElementById('link-contabilidad');
    if (linkContabilidad && linkContabilidad.parentNode) {
      const navItem = document.createElement('a');
      navItem.id = 'link-dte-modulo';
      navItem.href = dteURL();
      navItem.className = linkContabilidad.className; // hereda clase nav-item
      navItem.style.textDecoration = 'none';
      navItem.innerHTML = `
        <i class="fa-solid fa-file-invoice" style="width:16px;text-align:center;flex-shrink:0;color:#6366f1"></i>
        <span class="nav-label">Módulo DTE <span style="background:#6366f1;color:white;font-size:8px;padding:1px 5px;border-radius:6px;margin-left:2px">v3</span></span>
      `;
      linkContabilidad.parentNode.insertBefore(navItem, linkContabilidad);
    }
  }

  /**
   * Inyección en PORTAL — agrega tarjeta de acceso al módulo DTE
   */
  function injectPortal() {
    // Buscar el contenedor de tarjetas secundarias
    const scDash = document.getElementById('sc-dashboard');
    if (scDash && scDash.parentNode) {
      const card = document.createElement('a');
      card.id = 'sc-dte-modulo';
      card.href = dteURL();
      card.className = scDash.className;
      card.style.textDecoration = 'none';
      card.style.marginBottom = '8px';
      card.innerHTML = `
        <div style="width:44px;height:44px;background:#eef2ff;color:#6366f1;border-radius:18px;display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0" class="dte-card-ico">
          <i class="fa-solid fa-file-invoice" style="font-size:18px"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:900;color:#1e293b;text-transform:uppercase;line-height:1">Módulo DTE</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:3px;font-weight:600">Emisión · Historial · Importar · Configuración DTE</div>
        </div>
        <span style="background:#6366f1;color:white;font-size:9px;font-weight:800;padding:3px 8px;border-radius:20px;flex-shrink:0">v3.0</span>
      `;
      // Hover effect
      card.onmouseover = function() {
        this.querySelector('.dte-card-ico').style.background = '#6366f1';
        this.querySelector('.dte-card-ico').style.color = 'white';
      };
      card.onmouseout = function() {
        this.querySelector('.dte-card-ico').style.background = '#eef2ff';
        this.querySelector('.dte-card-ico').style.color = '#6366f1';
      };
      scDash.parentNode.insertBefore(card, scDash);
    }
  }

  /**
   * Inyección en CONTABILIDAD — agrega link rápido al módulo DTE
   */
  function injectContabilidad() {
    const sbItems = document.querySelectorAll('.sb-item');
    if (!sbItems.length) return;
    const lastItem = sbItems[sbItems.length - 1];
    if (!lastItem || !lastItem.parentNode) return;

    const newItem = document.createElement('div');
    newItem.className = 'sb-item';
    newItem.style.cssText = 'cursor:pointer;background:#eef2ff;color:#4338ca;margin-top:4px';
    newItem.innerHTML = `<i class="fa-solid fa-file-invoice"></i> <span>Módulo DTE v3</span>`;
    newItem.onclick = function() { window.location.href = dteURL(); };
    lastItem.parentNode.appendChild(newItem);
  }

  /**
   * Actualiza los hrefs existentes de pos-link-dte para agregar
   * parámetro negocio si falta
   */
  function patchExistingLinks() {
    if (!negocioID) return;
    ['pos-link-dte','pos-top-dte'].forEach(function(id) {
      const el = document.getElementById(id);
      if (el && el.href && !el.href.includes('negocio=')) {
        el.href = el.getAttribute('href') + '?negocio=' + negocioID;
      }
    });
  }

  /**
   * Auto-detecta en qué página está y ejecuta la inyección correcta
   */
  function init() {
    const path = window.location.pathname.toLowerCase();
    const filename = path.split('/').pop() || '';

    if (filename.includes('dashboard')) {
      injectDashboard();
    } else if (filename.includes('portal')) {
      injectPortal();
    } else if (filename.includes('contabilidad')) {
      injectContabilidad();
    } else {
      // Intenta todas (modo universal)
      injectDashboard();
      injectPortal();
    }

    patchExistingLinks();

    console.log('[PARCHE SYS DTE Adapter v' + PARCHE_SYS_DTE_VERSION + '] Integración modular activa — negocioID:', negocioID || 'no detectado');
  }

  // Ejecutar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM ya listo (script al final del body)
    setTimeout(init, 50);
  }

})();
