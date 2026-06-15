/**
 * firebase-config.js — PARCHE SYS Shared Configuration
 * Proyecto Firebase: parche-sys (elparche919@gmail.com)
 * Instalación: Negocio único — El Parche
 */

var FB_CFG = {
  apiKey: "AIzaSyC44rgiRq-cdDgcwy93GgzVXncWbugKCyY",
  authDomain: "parche-sys-v2.firebaseapp.com",
  databaseURL: "https://parche-sys-v2-default-rtdb.firebaseio.com",
  projectId: "parche-sys-v2",
  storageBucket: "parche-sys-v2.firebasestorage.app",
  messagingSenderId: "367489065915",
  appId: "1:367489065915:web:300a2bca022c6eb6a41a9e"
};

// Initialize Firebase if not already initialized
if (!firebase.apps.length) {
    firebase.initializeApp(FB_CFG);
}
var db = firebase.database();

// ── NEGOCIO ÚNICO ──────────────────────────────────────────
// Esta instalación es exclusiva para El Parche.
// El negocioID está fijo; no se necesita multi-tenant.
var NEGOCIO_ID = "elparche";

// Compatibilidad con código existente que use la variable negocioID
var negocioID = localStorage.getItem('food_negocioID') || NEGOCIO_ID;

// Siempre asegurar que el negocioID correcto esté en sesión
localStorage.setItem('food_negocioID', NEGOCIO_ID);
localStorage.setItem('modus_food_negocio', NEGOCIO_ID);
localStorage.setItem('negocioID', NEGOCIO_ID);
negocioID = NEGOCIO_ID;

// Redirigir al login si no hay sesión activa
if (!localStorage.getItem('food_session_' + NEGOCIO_ID)) {
    if (!window.location.pathname.includes('login') &&
        !window.location.pathname.endsWith('index.html')) {
        if (window.location.protocol === 'file:') {
            // En local (WebView / Android), redirigir a login.html
            var currentFile = window.location.pathname.substring(window.location.pathname.lastIndexOf('/') + 1);
            window.top.location.href = 'login.html?redirect=' + encodeURIComponent(currentFile);
        } else {
            window.top.location.href = 'index.html';
        }
    }
}

