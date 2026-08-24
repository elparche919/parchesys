# Parche de ciclo de órdenes — 2026-08-23

Archivos funcionales modificados:
- `pos-food.html`
- `cocina.html`
- `bar.html`

`pos-food-tablet.html` no requiere cambio: carga `pos-food.html` dentro del iframe y hereda la misma lógica.

## Cambios
1. Pago y despacho quedan desacoplados. `estado` conserva el estado de cuenta/pago y `estado_servicio` representa el ciclo operativo.
2. Si una mesa previamente despachada recibe productos nuevos, Cocina/Bar regresan a `pendiente` aunque la cuenta se cobre antes de preparar esos nuevos productos.
3. Cobrar una orden con trabajo pendiente recrea o conserva `cocina_orders`; nunca la elimina solo porque una tanda anterior estaba entregada.
4. Cocina y Bar usan transacciones al despachar para impedir que una adición concurrente sea borrada por una operación de `remove()` basada en datos viejos.
5. Cocina/Bar nunca sustituyen `estado: pagado` por `estado: entregado`.
6. Al cobrar una mesa, el POS verifica que `pedido_activo_id` quede liberado y solo actúa si todavía apunta a la misma orden cobrada.
7. Si al abrir una mesa se detecta un `pedido_activo_id` residual que apunta a una orden ya pagada, el POS lo limpia y genera una orden nueva.

## Escenarios mínimos de prueba en producción controlada
- Orden de cocina -> despachar -> agregar otro plato -> cobrar antes de preparar: la nueva comanda debe permanecer visible en Cocina.
- Orden de bar -> despachar -> agregar otra bebida -> cobrar antes de preparar: debe permanecer visible en Bar.
- Orden mixta Cocina+Bar: despachar una estación primero; la comanda debe permanecer en la otra.
- Cobrar antes de terminar Cocina/Bar: la mesa queda libre, pero KDS conserva la comanda pendiente con distintivo PAGADO.
- Finalizar KDS después del cobro: `pedidos/<id>/estado` debe seguir siendo `pagado`; `estado_servicio` debe quedar `entregado`.
- Simular mesa con `pedido_activo_id` hacia una orden pagada: al abrirla debe autocorregirse y no reutilizar la venta anterior.
