-- NANDFlix: pasta das atualizações do app de Android. Rode uma vez no SQL Editor.
--
-- O app do celular baixa daqui as versões novas da interface (um .zip) sem
-- precisar instalar outro APK. Qualquer um pode LER (o app baixa sem login),
-- mas só a sua conta pode gravar: quem publica é o app do PC, logado nela.
-- Troque SEU-EMAIL@exemplo.com pelo e-mail da sua conta antes de rodar.

insert into storage.buckets (id, name, public)
values ('app', 'app', true)
on conflict (id) do update set public = true;

drop policy if exists "app: só eu publico" on storage.objects;
create policy "app: só eu publico" on storage.objects
  for all to authenticated
  using (bucket_id = 'app' and auth.jwt() ->> 'email' = 'SEU-EMAIL@exemplo.com')
  with check (bucket_id = 'app' and auth.jwt() ->> 'email' = 'SEU-EMAIL@exemplo.com');
