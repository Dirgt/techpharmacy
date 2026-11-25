-- Migración: Soporte para rol 'superadmin' y URL personalizada en droguerias

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['superadmin'::text, 'admin'::text, 'vendedor'::text]));

ALTER TABLE public.droguerias
  ADD COLUMN IF NOT EXISTS url_personalizada TEXT;
