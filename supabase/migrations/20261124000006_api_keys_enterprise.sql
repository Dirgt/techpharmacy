CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drogueria_id UUID NOT NULL REFERENCES public.droguerias(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['read:productos', 'read:inventario', 'read:facturas', 'read:clientes'],
  estado TEXT NOT NULL DEFAULT 'activa',
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  last_used_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT api_keys_estado_check CHECK (estado IN ('activa', 'revocada'))
);

CREATE INDEX IF NOT EXISTS idx_api_keys_drogueria_id ON public.api_keys(drogueria_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON public.api_keys(key_hash);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Aislamiento Multi-Tenant api_keys" ON public.api_keys;
CREATE POLICY "Aislamiento Multi-Tenant api_keys" ON public.api_keys
  FOR ALL
  TO authenticated
  USING (drogueria_id = public.get_current_drogueria_id())
  WITH CHECK (drogueria_id = public.get_current_drogueria_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
