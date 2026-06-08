/**
 * dte-engine.js - MODUS Fiscal Engine v1.0
 * -------------------------------------------------
 * Motor Fiscal Central e Independiente para MODUS.
 *
 * PRINCIPIOS DE DISENO:
 *  - La UI (POS, DTE) NUNCA contiene logica fiscal.
 *  - Este archivo es el unico punto de verdad para reglas fiscales.
 *  - Compatible con: pos-food.html, dte.html, MODUS RETAIL, MODUS SERVICE.
 *
 * FLUJO:
 *  POS / DTE UI -> DteEngine -> Firebase / Cloud Functions -> Hacienda
 *
 * FASE 1 SOPORTADA:
 *  - Tiquete (Venta Simplificada: CAT-023, operacionEspecial = "02")
 *  - Consumidor Final
 *  - Credito Fiscal
 *  - Contingencia
 *
 * PENDIENTE VALIDACION DOCUMENTAL:
 *  - Codigo 97 (Comprobantes de Control Interno) - NO implementado.
 *    Se requiere validacion en los esquemas JSON oficiales del
 *    Ministerio de Hacienda antes de asignar su posicion en el payload.
 *    El campo `operacionEspecial` esta preparado para recibirlo en el futuro.
 *
 * USO:
 *  <script src="dte-engine.js"></script>
 *  DteEngine.prepararPayload(venta, opciones)
 *  DteEngine.registrarEnFirebase(payload, negocioID, db)
 */

(function(global) {
  'use strict';

  var VERSION = '1.0.0';

  /**
   * CAT-009: Tipos de Documento Tributario Electronico (DTE).
   */
  var TIPOS_DTE = {
    '01': 'Factura de Venta',
    '03': 'Comprobante de Credito Fiscal',
    '04': 'Nota de Remision',
    '05': 'Nota de Credito',
    '06': 'Nota de Debito',
    '11': 'Factura de Exportacion',
    '14': 'Factura de Sujeto Excluido'
    // '97': PENDIENTE DE VALIDACION - NO usar hasta confirmar esquema JSON en Hacienda.
  };

  /**
   * CAT-023: Operaciones Especiales.
   * Estos codigos SE ENVIAN dentro de un DTE existente,
   * NO son un tipoDte independiente.
   * NOTA: El codigo 97 esta registrado aqui pero NO se usara
   *       en transmisiones reales hasta obtener validacion oficial.
   */
  var OPERACIONES_ESPECIALES = {
    '02': 'Factura de Venta Simplificada', // FASE 1
    '97': 'Comprobantes de Control Interno' // FASE 3 - Pendiente validacion
  };

  /**
   * Estados del ciclo de vida fiscal de un documento.
   */
  var ESTADOS_FISCALES = {
    PENDIENTE:    'pendiente',
    PROCESANDO:   'procesando',
    COMPLETADO:   'completado',
    RECHAZADO:    'rechazado',
    CONTINGENCIA: 'contingencia'
  };

  // -------------------------------------------------------
  // FUNCIONES PRIVADAS
  // -------------------------------------------------------

  function _inferirTipoDte(tipoDocUI) {
    switch ((tipoDocUI || 'TIQ').toUpperCase()) {
      case 'CCF': return '03';
      case 'TIQ':
      case 'CF':
      default:    return '01';
    }
  }

  function _inferirOperacionEspecial(tipoDocUI) {
    switch ((tipoDocUI || 'TIQ').toUpperCase()) {
      case 'TIQ': return '02'; // CAT-023: Factura de Venta Simplificada
      case 'CF':
      case 'CCF':
      default:    return null;
    }
  }

  function _construirReceptor(tipoDte, operacionEspecial, ventaData) {
    if (operacionEspecial === '02') {
      return { tipo: 'simplificado' };
    }
    if (tipoDte === '03') {
      return {
        tipo:         'juridico',
        nrc:          ventaData.dte_nrc      || null,
        nit:          ventaData.dte_nit      || null,
        nombre:       ventaData.dte_razon    || null,
        codActividad: ventaData.dte_actividad || null,
        giro:         ventaData.dte_giro     || null,
        direccion:    ventaData.dte_dir      || null,
        telefono:     ventaData.dte_tel      || null,
        correo:       ventaData.dte_correo   || null
      };
    }
    return {
      tipo:     'natural',
      nombre:   ventaData.cliente  || null,
      telefono: ventaData.telefono || null,
      correo:   ventaData.dte_correo || null
    };
  }

  // -------------------------------------------------------
  // FUNCIONES PUBLICAS
  // -------------------------------------------------------

  /**
   * prepararPayload(ventaData, opciones)
   * Construye la estructura de datos fiscal estandarizada.
   *
   * @param {Object} ventaData - Datos de la venta desde el POS.
   * @param {Object} opciones  - { tipoDocUI, tipoDte, operacionEspecial, contingencia }
   * @returns {Object} Payload fiscal listo para Firebase.
   */
  function prepararPayload(ventaData, opciones) {
    opciones = opciones || {};
    var tipoDte           = opciones.tipoDte           || _inferirTipoDte(opciones.tipoDocUI);
    var operacionEspecial = opciones.operacionEspecial !== undefined
                              ? opciones.operacionEspecial
                              : _inferirOperacionEspecial(opciones.tipoDocUI);

    if (operacionEspecial === '97') {
      console.warn('[DteEngine] ADVERTENCIA: operacionEspecial "97" pendiente de validacion ' +
                   'documental. Se guarda en Firebase pero NO se transmitira a Hacienda.');
    }

    return {
      ordenId:           ventaData.orden      || null,
      negocioID:         ventaData.negocioID  || null,
      fechaEmision:      ventaData.fecha_iso  || new Date().toISOString(),

      tipoDte:           tipoDte,
      tipoDteDesc:       TIPOS_DTE[tipoDte]   || 'Desconocido',
      operacionEspecial: operacionEspecial,

      estadoFiscal:      opciones.contingencia
                           ? ESTADOS_FISCALES.CONTINGENCIA
                           : ESTADOS_FISCALES.PENDIENTE,
      contingencia:      opciones.contingencia || false,

      codigoGeneracion:  null,
      numeroControl:     null,
      selloRecepcion:    null,
      qrLink:            null,
      fechaSello:        null,
      mensajeHacienda:   null,

      emisor: {
        nit:           ventaData.emisor_nit            || null,
        nrc:           ventaData.emisor_nrc            || null,
        nombre:        ventaData.emisor_nombre         || null,
        codActividad:  ventaData.emisor_actividad      || null,
        descActividad: ventaData.emisor_actividad_desc || null,
        direccion:     ventaData.emisor_direccion      || null,
        telefono:      ventaData.emisor_telefono       || null,
        correo:        ventaData.emisor_correo         || null
      },

      receptor: _construirReceptor(tipoDte, operacionEspecial, ventaData),

      subtotal:   parseFloat(ventaData.subtotal)        || 0,
      descuento:  parseFloat(ventaData.descuento_monto) || 0,
      iva:        0,
      total:      parseFloat(ventaData.total)           || 0,
      formaPago:  ventaData.forma_pago                  || 'efectivo',
      propina:    parseFloat(ventaData.propina)         || 0,
      items:      ventaData.items                       || [],

      mesero:       ventaData.mesero    || null,
      caja:         ventaData.caja_num  || null,
      canal:        ventaData.canal     || null,
      mesa:         ventaData.mesa_num  || null,
      motorVersion: VERSION,
      creadoEn:     Date.now()
    };
  }

  /**
   * registrarEnFirebase(payload, negocioID, db)
   * Persiste el payload en Firebase bajo `dte_pendientes`.
   */
  function registrarEnFirebase(payload, negocioID, db) {
    if (!payload || !negocioID || !db) {
      return Promise.reject(new Error('[DteEngine] Faltan parametros requeridos.'));
    }
    var ordenId = payload.ordenId;
    if (!ordenId) {
      return Promise.reject(new Error('[DteEngine] El payload no tiene ordenId.'));
    }
    return Promise.all([
      db.ref('negocios/' + negocioID + '/dte_pendientes/' + ordenId).set(payload),
      db.ref('negocios/' + negocioID + '/pedidos/' + ordenId).update({
        tipoDte:           payload.tipoDte,
        operacionEspecial: payload.operacionEspecial,
        estadoFiscal:      payload.estadoFiscal,
        contingencia:      payload.contingencia
      })
    ]).then(function() {
      console.log('[DteEngine] Payload fiscal registrado para orden: ' + ordenId);
      return payload;
    });
  }

  /**
   * actualizarEstadoFiscal(ordenId, negocioID, db, respuestaHacienda)
   * Actualiza el documento con la respuesta oficial de Hacienda.
   * Se llama desde Cloud Functions o dte.html despues de transmitir.
   */
  function actualizarEstadoFiscal(ordenId, negocioID, db, respuestaHacienda) {
    var update = {
      estadoFiscal:     respuestaHacienda.estado            || ESTADOS_FISCALES.RECHAZADO,
      codigoGeneracion: respuestaHacienda.codigoGeneracion  || null,
      numeroControl:    respuestaHacienda.numeroControl      || null,
      selloRecepcion:   respuestaHacienda.selloRecepcion     || null,
      qrLink:           respuestaHacienda.qrLink             || null,
      fechaSello:       respuestaHacienda.fechaSello         || new Date().toISOString(),
      mensajeHacienda:  respuestaHacienda.mensaje            || null
    };
    return Promise.all([
      db.ref('negocios/' + negocioID + '/dte_pendientes/' + ordenId).update(update),
      db.ref('negocios/' + negocioID + '/pedidos/' + ordenId).update({
        estadoFiscal:   update.estadoFiscal,
        selloRecepcion: update.selloRecepcion,
        qrLink:         update.qrLink
      })
    ]);
  }

  /** requiresCCFRedirect - true si el documento requiere ir a dte.html */
  function requiresCCFRedirect(tipoDocUI) {
    return tipoDocUI === 'CCF';
  }

  /** getCCFRedirectUrl - URL de redireccion a dte.html con parametros de la orden */
  function getCCFRedirectUrl(negocioID, ordenId) {
    return 'dte.html?negocio=' + negocioID + '&orden=' + ordenId + '&tipoDte=03';
  }

  // -------------------------------------------------------
  // EXPOSICION PUBLICA
  // -------------------------------------------------------
  global.DteEngine = {
    version:                VERSION,
    TIPOS_DTE:              TIPOS_DTE,
    OPERACIONES_ESPECIALES: OPERACIONES_ESPECIALES,
    ESTADOS_FISCALES:       ESTADOS_FISCALES,
    prepararPayload:        prepararPayload,
    registrarEnFirebase:    registrarEnFirebase,
    actualizarEstadoFiscal: actualizarEstadoFiscal,
    requiresCCFRedirect:    requiresCCFRedirect,
    getCCFRedirectUrl:      getCCFRedirectUrl
  };

  console.log('[MODUS DteEngine v' + VERSION + '] Motor Fiscal cargado correctamente.');

})(typeof window !== 'undefined' ? window : this);
