/**
 * firebase-config.js — PARCHE SYS Shared Configuration
 * Proyecto Firebase: parche-sys (elparche919@gmail.com)
 * Instalación: Negocio único — El Parche
 */

var FB_CFG = {
  apiKey: "AIzaSyD-fUuDfnNm1SANTImNZTlQrarMQqsWxQ4",
  authDomain: "parche-sys.firebaseapp.com",
  databaseURL: "https://parche-sys-default-rtdb.firebaseio.com",
  projectId: "parche-sys",
  storageBucket: "parche-sys.firebasestorage.app",
  messagingSenderId: "5761192689",
  appId: "1:5761192689:web:03201ae1790cbb2c7ccf50"
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
        window.location.href = 'index.html';
    }
}
