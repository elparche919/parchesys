'use strict';

const {onRequest} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const DTE_EXPORT_KEY = defineSecret('DTE_EXPORT_KEY');

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numeroFinito(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function itemsArray(items) {
  if (Array.isArray(items)) return items.filter(Boolean);
  if (items && typeof items === 'object') return Object.keys(items).sort().map(k => items[k]).filter(Boolean);
  return [];
}

function origenVenta(id, venta) {
  const codigo = String((venta && (venta.codigo || venta.orden || venta.ventaId)) || id || '');
  if (/^SV-/i.test(codigo)) return 'SV';
  if (/^DTE-/i.test(codigo)) return 'DTE';
  return 'EST';
}

function normalizarVenta(id, venta) {
  const activos = itemsArray(venta.items).filter(i => !i.eliminado);
  const pagadoAt = num(venta.pagadoAt || venta.cobrado_at || venta.timestamp);
  return {
    ventaId: String(venta.ventaId || id),
    ordenId: String(venta.orden || id),
    origen: origenVenta(id, venta),
    negocioId: 'elparche',
    fecha: venta.fecha_iso || venta.fecha || null,
    pagadoAt,
    cajaSesionId: venta.cajaSesionId || null,
    caja_num: venta.caja_num || null,
    cliente: venta.cliente || null,
    forma_pago: venta.forma_pago || venta.pago || 'efectivo',
    subtotal: num(venta.subtotal),
    descuento: num(venta.descuento_monto),
    propina: num(venta.propina),
    total: num(venta.total),
    estado: venta.estado || 'pagado',
    anulada: venta.anulada === true || String(venta.estado || '').toUpperCase() === 'ANULADA',
    dteEmitido: venta.dte_emitido === true || venta.dte_emitido === 1 || String(venta.dte_emitido || '').toLowerCase() === 'true' || origenVenta(id, venta) === 'DTE',
    dteCodigoGeneracion: venta.dte_codigo_generacion || venta.codigo_generacion || null,
    dteNumeroControl: venta.dte_num_control || venta.numero_control || null,
    items: activos.map(i => ({
      lineaId: i.linea_id || null,
      productoId: i.id || null,
      descripcion: i.desc || i.nombre || '',
      cantidad: num(i.cant || 1),
      precioUnitario: num(i.precio),
      total: num(i.total || num(i.cant || 1) * num(i.precio)),
      categoria: i.cat || i.categoria || null,
      variante: i.variante || null,
      nota: i.nota || null
    }))
  };
}

function validarVentaExportable(id, venta) {
  const total = numeroFinito(venta.total);
  const pagadoAt = numeroFinito(venta.pagadoAt || venta.cobrado_at || venta.timestamp);
  const activos = itemsArray(venta.items).filter(i => !i.eliminado);

  if (total === null || total <= 0) return 'TOTAL_INVALIDO';
  if (pagadoAt === null || pagadoAt <= 0) return 'FECHA_INVALIDA';
  if (!activos.length) return 'SIN_ITEMS';

  for (const item of activos) {
    const descripcion = String(item.desc || item.nombre || '').trim();
    const cantidad = numeroFinito(item.cant ?? item.cantidad);
    const precio = numeroFinito(item.precio ?? item.precioUnitario);
    if (!descripcion) return 'ITEM_SIN_DESCRIPCION';
    if (cantidad === null || cantidad <= 0) return 'ITEM_CANTIDAD_INVALIDA';
    if (precio === null || precio < 0) return 'ITEM_PRECIO_INVALIDO';
  }

  return null;
}

function autorizado(req) {
  const configurada = DTE_EXPORT_KEY.value();
  if (!configurada) return true;
  const recibida = req.get('x-modus-api-key') || String(req.query.api_key || '');
  return recibida === configurada;
}

exports.ventasDteApi = onRequest({region: 'us-central1', secrets: [DTE_EXPORT_KEY], cors: true}, async (req, res) => {
  try {
    if (!autorizado(req)) return res.status(401).json({ok: false, error: 'NO_AUTORIZADO'});
    if (req.method !== 'GET') return res.status(405).json({ok: false, error: 'METODO_NO_PERMITIDO'});

    const desde = Math.max(0, num(req.query.desde));
    const cursorRaw = String(req.query.cursor || desde || '0');
    const partesCursor = cursorRaw.split('|');
    const cursorTs = Math.max(desde, num(partesCursor[0]));
    const cursorId = partesCursor.slice(1).join('|');
    const limite = Math.min(500, Math.max(1, num(req.query.limite) || 100));
    const origen = String(req.query.origen || '').toUpperCase();
    const snap = await admin.database().ref('negocios/elparche/ventas').once('value');
    const ventas = [];
    const descartadas = {};
    snap.forEach(child => {
      const ventaRaw = child.val() || {};
      const motivoInvalido = validarVentaExportable(child.key, ventaRaw);
      if (motivoInvalido) {
        descartadas[motivoInvalido] = (descartadas[motivoInvalido] || 0) + 1;
        console.warn('[ventasDteApi] VENTA_DESCARTADA', child.key, motivoInvalido);
        return;
      }
      const v = normalizarVenta(child.key, ventaRaw);
      if (v.anulada) return;
      if (v.pagadoAt < cursorTs || (v.pagadoAt === cursorTs && v.ventaId <= cursorId)) return;
      if (origen && v.origen !== origen) return;
      ventas.push(v);
    });
    ventas.sort((a, b) => a.pagadoAt - b.pagadoAt || a.ventaId.localeCompare(b.ventaId));
    const pagina = ventas.slice(0, limite);
    const siguienteCursor = pagina.length ? (pagina[pagina.length - 1].pagadoAt+'|'+pagina[pagina.length - 1].ventaId) : cursorRaw;
    return res.status(200).json({
      ok: true,
      contrato: 'modus-food-dte-v1',
      negocioId: 'elparche',
      ventas: pagina,
      siguienteCursor,
      hayMas: ventas.length > pagina.length,
      diagnostico: {
        ventasDescartadas: Object.values(descartadas).reduce((suma, cantidad) => suma + cantidad, 0),
        motivos: descartadas
      }
    });
  } catch (error) {
    console.error('[ventasDteApi]', error);
    return res.status(500).json({ok: false, error: 'ERROR_INTERNO'});
  }
});
