-- Fase de cierre: se aplica después de desplegar la versión de la app que usa
-- crear_factura_v2_tx, anular_factura_v2_tx, registrar_compra_v2_tx y
-- upsert_inventario_v2_tx. Las versiones heredadas quedan disponibles solo para
-- las RPC V2 (que corren como su dueño) y para service_role.

REVOKE EXECUTE ON FUNCTION public.crear_factura_tx(
  text, text, text, text, integer, text, numeric, numeric, uuid, uuid,
  public.factura_item_input[], numeric, numeric, numeric
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.anular_factura_tx(uuid, text) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.registrar_compra_tx(
  uuid, text, numeric, text, text, uuid, public.compra_detalle_input[], uuid, text, text
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.upsert_inventario_tx(
  uuid, text, text, text, uuid, uuid, integer, integer, integer, integer,
  numeric, numeric, numeric, numeric, numeric, numeric, text, text, text, text, text, integer, integer
) FROM PUBLIC, anon, authenticated;

-- Solo se invoca dentro de RPC SECURITY DEFINER (que corren como su dueño).
REVOKE EXECUTE ON FUNCTION public.sync_inventario_from_lotes(uuid) FROM PUBLIC, anon, authenticated;
