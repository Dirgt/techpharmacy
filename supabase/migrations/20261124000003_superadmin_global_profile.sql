-- Migración: Desacoplar al rol superadmin de droguerias operativas

-- 1. Permitir drogueria_id NULL solo cuando el rol es 'superadmin'
ALTER TABLE public.profiles
  ALTER COLUMN drogueria_id DROP NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_drogueria_required_for_tenant_roles;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_drogueria_required_for_tenant_roles
  CHECK (role = 'superadmin' OR drogueria_id IS NOT NULL);

-- 2. Permitir que cada usuario lea/actualice su propio perfil aunque drogueria_id sea NULL,
--    sin exponer perfiles de superadmin (drogueria_id IS NULL) a administradores de droguerías.
DROP POLICY IF EXISTS "Aislamiento Multi-Tenant" ON public.profiles;
CREATE POLICY "Aislamiento Multi-Tenant" ON public.profiles
  FOR ALL TO authenticated
  USING (id = auth.uid() OR drogueria_id = public.get_current_drogueria_id())
  WITH CHECK (id = auth.uid() OR drogueria_id = public.get_current_drogueria_id());

-- 3. Desvincular al superadmin global de cualquier droguería operativa
UPDATE public.profiles
SET drogueria_id = NULL
WHERE id = '573ff0e2-6381-4f43-9b20-d549fcb92abf'
  AND role = 'superadmin';
