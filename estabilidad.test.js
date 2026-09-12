const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

function scriptsOf(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) if (m[1].trim()) out.push(m[1]);
  return out;
}

for (const name of ['pos-food.html', 'bar.html', 'cocina.html']) {
  scriptsOf(read(name)).forEach((code, i) => {
    try { new vm.Script(code, { filename: `${name}:script-${i + 1}` }); }
    catch (e) { throw new Error(`Sintaxis inválida en ${name}, script ${i + 1}: ${e.message}`); }
  });
}

const pos = read('pos-food.html');
const bar = read('bar.html');
const cocina = read('cocina.html');
const firebase = JSON.parse(read('firebase.json'));

const confirmar = pos.match(/function confirmarModalComensales\(\)[\s\S]*?\n}/)[0];
assert(!/mesas\/['"+]/.test(confirmar) || !/\.update\s*\(/.test(confirmar),
  'confirmarModalComensales no debe escribir directamente la mesa');
assert(pos.includes("if(m.pedido_activo_id)return;"),
  'la reserva debe abortar cuando otra orden ya ocupa la mesa');
assert(pos.includes("e.code='MESA_RESERVA_CONFLICTO'"),
  'la colisión de reserva debe ser explícita');
assert(pos.includes('verificarPedidoKdsSincronizados'),
  'el envío debe confirmar pedido y KDS');
assert(!bar.includes("}).then(function(){return true;})"),
  'Bar no debe convertir un fallo de réplica en éxito');
assert(!cocina.includes("}).then(function(){return true;})"),
  'Cocina no debe convertir un fallo de réplica en éxito');
assert(bar.includes('intento<3') && cocina.includes('intento<3'),
  'Bar y Cocina deben reintentar la sincronización transitoria');
assert(pos.includes("String(oItem.linea_id)===String(pagItem.linea_id)"),
  'la cuenta dividida debe identificar líneas repetidas por linea_id');
assert(firebase.hosting.headers.some(h => h.source === '**/*.html' &&
  h.headers.some(x => x.key === 'Cache-Control' && /no-store/.test(x.value))),
  'hosting debe impedir que tablets conserven HTML antiguo');

console.log('OK: controles estáticos de mesas, KDS, Bar/Cocina y caché superados');
