-- Pantalla pública de "Crear cuenta" (a pedido explícito del usuario,
-- eligiendo esto sobre "solo el admin da de alta" -- ver Signup.jsx).
-- Cualquier persona con un correo puede crear su propia cuenta de
-- analista, verificando el correo con un código de 6 dígitos (OTP
-- nativo de Supabase Auth, ver nota de configuración abajo).
--
-- Como ya no es el admin quien inserta la fila en profiles a mano
-- (022_profiles_roles.sql), hace falta crearla automáticamente cuando
-- se crea el auth.users -- vía trigger, no una policy de insert desde
-- el cliente (profiles sigue sin ser escribible directamente por la
-- app, mismo criterio que antes).
--
-- SEGURIDAD: el rol SIEMPRE se fuerza a 'analista' acá, sin importar
-- qué venga en raw_user_meta_data -- el auto-registro público NUNCA
-- debe poder crear un admin (eso lo sigue haciendo Hugo a mano, vía
-- UPDATE directo en profiles con la service_role key).
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nombre_corto, entidad, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre_corto', split_part(new.email, '@', 1)),
    nullif(new.raw_user_meta_data->>'entidad', ''),
    'analista'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------
-- CONFIGURACIÓN MANUAL REQUERIDA EN EL DASHBOARD DE SUPABASE (esto no
-- se puede hacer por SQL):
--
-- 1. Authentication > Providers > Email > "Confirm email" debe estar
--    ACTIVADO -- si no, signUp() crea la cuenta ya confirmada, sin
--    pedir ningún código.
-- 2. Authentication > Email Templates > "Confirm signup": el template
--    por defecto solo tiene un link mágico ({{ .ConfirmationURL }}).
--    Hay que agregar {{ .Token }} en el cuerpo del mail para que el
--    usuario reciba el código de 6 dígitos que el formulario le va a
--    pedir ingresar (en vez de solo poder hacer click en el link).
-- ---------------------------------------------------------------
