# Reparación de mesas y KDS — 12 de septiembre de 2026

## Archivos modificados

- `pos-food.html`
- `bar.html`
- `cocina.html`
- `firebase.json`
- `tests/estabilidad.test.js` (nuevo)

No se modificaron `firebase-rules.json`, Functions, login, seguridad, inventario ni DTE.

## Correcciones

- Reserva exclusiva de mesa mediante transacción; una pantalla atrasada ya no puede apropiarse de una mesa ocupada.
- Verificación del propietario usando la lectura reciente de Firebase antes de abrir una mesa en tablet.
- Nombre e identificador del mesero se guardan juntos.
- El modal de comensales ya no sobrescribe directamente al mesero.
- Liberación de mesa protegida contra una orden nueva creada desde otro equipo.
- Solicitudes QR conservan al dueño de una mesa que ya estaba ocupada.
- Enviar a producción confirma que cada `linea_id` existe tanto en pedido como en KDS.
- Reintento idempotente ante retrasos transitorios de sincronización.
- Bar y Cocina ya no convierten una réplica fallida en un resultado exitoso.
- Las cuentas divididas identifican productos repetidos por `linea_id`.
- Hosting indica que las páginas HTML no deben permanecer en caché.

## Validación previa al despliegue

Desde PowerShell, dentro de la carpeta del proyecto:

```powershell
node .\tests\estabilidad.test.js
```

Resultado esperado:

```text
OK: controles estáticos de mesas, KDS, Bar/Cocina y caché superados
```

## Despliegue recomendado

Hacerlo cuando no haya órdenes activas. Este paquete no requiere desplegar reglas ni funciones:

```powershell
firebase deploy --only hosting --project parche-sys-v2 --account cast152025@gmail.com
```

## Prueba controlada

1. Abrir una mesa con una tablet de mesero.
2. Sin cerrar esa mesa, abrirla desde el POS administrativo. Debe conservar el mesero original.
3. Agregar una bebida y un platillo desde la tablet y pulsar Enviar.
4. Confirmar que la bebida aparece en Bar y el platillo en Cocina.
5. Marcar ambos ítems y comprobar que no aparezca un falso mensaje de éxito o línea cambiada.
6. Agregar una segunda tanda a la misma mesa y repetir.
7. Cobrar y verificar que la mesa se libere sin afectar otra orden.

No ejecutar `firebase deploy --only database` para esta reparación.
