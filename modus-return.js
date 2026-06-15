/**
 * MODUS · modus-return.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Gestor centralizado de retorno al portal con sesión intacta.
 *
 * PROBLEMA QUE RESUELVE:
 *   Al abrir páginas externas (POS, Citas, DTE, Contabilidad, Empleados)
 *   y luego volver al portal, este mostraba el login interno (admin/empleado)
 *   obligando a ingresar credenciales de nuevo.
 *
 * SOLUCIÓN:
 *   1. Cada página externa llama a ModusReturn.init() al cargar.
 *   2. Esto registra en sessionStorage que hay una sesión activa con
 *      negocioID + timestamp de actividad.
 *   3. Al regresar al portal, portal.html detecta la sesión en localStorage
 *      (modus_session_<negocioID>) y la muestra directamente sin login.
 *   4. Los botones "Volver al Portal" usan ModusReturn.goPortal() que
 *      construye la URL correcta con ?negocio= y opcionalmente ?section=resumen.
 *
 * USO EN PÁGINAS EXTERNAS:
 *   <script src="modus-return.js"></script>
 *   ...luego en tu JS:
 *   ModusReturn.init(negocioID);
 *   ModusReturn.wireButton('id-del-boton-volver');
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function(global) {
  'use strict';

  var STORAGE_KEY_NEGOCIO  = 'negocioID';
  var STORAGE_KEY_ACTIVE   = 'modus_active_page';   // sessionStorage — heartbeat de página activa
  var STORAGE_KEY_ORIGIN   = 'modus_portal_origin';  // de qué sección venía el usuario

  var ModusReturn = {

    _negocioID: null,

    /**
     * Llamar al inicio de cada página externa.
     * Lee negocioID de URL o localStorage y registra actividad.
     */
    init: function(negocioID) {
      // Resolver negocioID
      var nid = negocioID
        || new URLSearchParams(window.location.search).get('negocio')
        || localStorage.getItem(STORAGE_KEY_NEGOCIO)
        || null;

      if (!nid) {
        // Sin negocio → volver a index
        window.location.href = 'index.html';
        return;
      }

      this._negocioID = nid;

      // Persistir negocioID (garantiza que portal lo encuentre)
      localStorage.setItem(STORAGE_KEY_NEGOCIO, nid);

      // Registrar heartbeat en sessionStorage
      try {
        sessionStorage.setItem(STORAGE_KEY_ACTIVE, JSON.stringify({
          negocioID: nid,
          page: window.location.pathname.split('/').pop(),
          ts: Date.now()
        }));
      } catch(e) { /* sessionStorage no disponible */ }

      // Registrar sección de origen si hay hash en la URL del referrer
      // (portal.html guarda su sección activa en sessionStorage)
      var lastSection = null;
      try {
        var portalState = sessionStorage.getItem('modus_portal_section');
        if (portalState) lastSection = portalState;
      } catch(e) {}

      // DETECTAR PORTAL DE ORIGEN (Móvil vs Escritorio)
      try {
        var referrer = document.referrer || '';
        if (referrer.indexOf('portal-food-movil.html') > -1) {
          localStorage.setItem('modus_active_portal', 'portal-food-movil.html');
        } else if (referrer.indexOf('portal-food.html') > -1) {
          localStorage.setItem('modus_active_portal', 'portal-food.html');
        }
      } catch(e) {}

      return nid;
    },

    /**
     * Obtiene el negocioID actual (ya resuelto por init).
     */
    getNegocioID: function() {
      return this._negocioID
        || localStorage.getItem(STORAGE_KEY_NEGOCIO)
        || new URLSearchParams(window.location.search).get('negocio');
    },

    /**
     * Construye la URL de retorno al portal con sesión intacta.
     * @param {string} [section='resumen'] - sección del portal a abrir
     */
    buildPortalURL: function(section) {
      var nid = this.getNegocioID();
      if (!nid) return 'index.html';
      var sec = section || this._getLastSection() || 'resumen';
      var portal = 'portal-food.html';
      try {
        portal = localStorage.getItem('modus_active_portal') || 'portal-food.html';
      } catch(e) {}
      return portal + '?negocio=' + nid + '#' + sec;
    },

    /**
     * Navega de vuelta al portal MÓVIL preservando la sesión.
     */
    goPortalMovil: function(section) {
      try { sessionStorage.setItem('modus_return_from_external', '1'); } catch(e) {}
      var nid = this.getNegocioID();
      var sec = section || 'resumen';
      window.location.href = 'portal-food-movil.html?negocio=' + (nid||'') + '#' + sec;
    },

    /**
     * Navega de vuelta al portal preservando la sesión.
     * @param {string} [section] - sección opcional
     */
    goPortal: function(section) {
      // Marcar que venimos de una página externa (NO desde index.html)
      // Así portal.html NO limpiará la sesión
      try {
        sessionStorage.setItem('modus_return_from_external', '1');
      } catch(e) {}

      window.location.href = this.buildPortalURL(section);
    },

    /**
     * Conecta automáticamente uno o varios botones "Volver al Portal".
     * Acepta: string ID, elemento DOM, o array de ambos.
     * @param {string|Element|Array} targets
     * @param {string} [section='resumen']
     */
    wireButton: function(targets, section) {
      var self = this;
      var list = Array.isArray(targets) ? targets : [targets];

      list.forEach(function(t) {
        var el = (typeof t === 'string') ? document.getElementById(t) : t;
        if (!el) return;

        // Actualizar href para accesibilidad y ctrl+click
        var url = self.buildPortalURL(section);
        el.href = url;

        // Override click para navegación limpia
        el.onclick = function(e) {
          e.preventDefault();
          self.goPortal(section);
          return false;
        };
      });
    },

    /**
     * Auto-wire: busca todos los elementos con data-modus-return o
     * con clase .modus-portal-back y los conecta automáticamente.
     */
    autoWire: function() {
      var self = this;
      var nid = this.getNegocioID();
      if (!nid) return;

      // Por data attribute
      var byData = document.querySelectorAll('[data-modus-return]');
      byData.forEach(function(el) {
        var sec = el.getAttribute('data-modus-section') || 'resumen';
        self.wireButton(el, sec);
      });

      // Por clase CSS
      var byClass = document.querySelectorAll('.modus-portal-back');
      byClass.forEach(function(el) {
        self.wireButton(el, 'resumen');
      });
    },

    /**
     * Recupera la última sección activa guardada por portal.html
     */
    _getLastSection: function() {
      try {
        return sessionStorage.getItem('modus_portal_section') || 'resumen';
      } catch(e) { return 'resumen'; }
    }
  };

  // Exponer globalmente
  global.ModusReturn = ModusReturn;

  // Auto-wire al cargar DOM si hay elementos marcados
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      ModusReturn.autoWire();
    });
  } else {
    ModusReturn.autoWire();
  }

})(window);
