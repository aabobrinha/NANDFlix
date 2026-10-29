-- NANDFlix: banco da sincronia. Rode uma vez no SQL Editor do projeto do Supabase.
--
-- Cada filme e cada pedaço das configurações (um dia da watchlist, um filme do
-- mês, uma tierlist…) é um registro. `marcas` guarda quando cada campo mudou
-- (milissegundos), e a função mesclar_registros junta o que o aparelho manda
-- com o que já está na nuvem campo a campo: a marca mais nova vence. Um campo
-- com marca mas sem valor em `dados` foi apagado naquela hora.
--
-- Filmes: dados = { titulo, minhaNota, … }. O filme está apagado quando
-- apagado_em é maior que todas as marcas.
-- Configurações: dados = { v: valor }, marcas = { v: ms }.

create table if not exists public.registros (
  usuario uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('filme', 'config')),
  chave text not null,
  dados jsonb not null default '{}'::jsonb,
  marcas jsonb not null default '{}'::jsonb,
  apagado_em bigint,
  atualizado_em timestamptz not null default now(),
  primary key (usuario, tipo, chave)
);

create index if not exists registros_atualizados on public.registros (usuario, atualizado_em);

-- Cada pessoa só vê e mexe nos próprios registros.
alter table public.registros enable row level security;

drop policy if exists "registros: só os meus" on public.registros;
create policy "registros: só os meus" on public.registros
  for all to authenticated
  using (usuario = auth.uid())
  with check (usuario = auth.uid());

-- Junta uma lista de registros [{ tipo, chave, dados, marcas, apagado_em }]
-- e devolve como cada um ficou na nuvem.
create or replace function public.mesclar_registros(itens jsonb)
returns setof public.registros
language plpgsql
security invoker
set search_path = public
as $$
declare
  it jsonb;
  atual public.registros;
  d jsonb;
  m jsonb;
  k text;
  m_novo bigint;
begin
  if auth.uid() is null then
    raise exception 'precisa estar logado';
  end if;
  for it in select * from jsonb_array_elements(itens) loop
    select * into atual from public.registros r
      where r.usuario = auth.uid() and r.tipo = it->>'tipo' and r.chave = it->>'chave'
      for update;
    if not found then
      insert into public.registros (usuario, tipo, chave, dados, marcas, apagado_em)
      values (auth.uid(), it->>'tipo', it->>'chave',
              coalesce(it->'dados', '{}'::jsonb), coalesce(it->'marcas', '{}'::jsonb),
              (it->>'apagado_em')::bigint)
      returning * into atual;
    else
      d := atual.dados;
      m := atual.marcas;
      for k in select jsonb_object_keys(coalesce(it->'marcas', '{}'::jsonb)) loop
        m_novo := (it->'marcas'->>k)::bigint;
        if m_novo > coalesce((m->>k)::bigint, 0) then
          m := m || jsonb_build_object(k, m_novo);
          if coalesce(it->'dados', '{}'::jsonb) ? k then
            d := d || jsonb_build_object(k, it->'dados'->k);
          else
            d := d - k;
          end if;
        end if;
      end loop;
      update public.registros r
        set dados = d,
            marcas = m,
            apagado_em = greatest(r.apagado_em, (it->>'apagado_em')::bigint),
            atualizado_em = now()
        where r.usuario = auth.uid() and r.tipo = atual.tipo and r.chave = atual.chave
        returning * into atual;
    end if;
    return next atual;
  end loop;
end;
$$;

grant execute on function public.mesclar_registros(jsonb) to authenticated;

-- Os outros aparelhos ficam sabendo na hora quando algo muda.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'registros') then
    alter publication supabase_realtime add table public.registros;
  end if;
end $$;

-- Imagens que não vêm do TMDB (capas escolhidas por você, imagens das páginas
-- e shots favoritos), cada pessoa na sua pasta: imagens/<id do usuário>/<arquivo>.
insert into storage.buckets (id, name, public)
values ('imagens', 'imagens', false)
on conflict (id) do nothing;

drop policy if exists "imagens: só as minhas" on storage.objects;
create policy "imagens: só as minhas" on storage.objects
  for all to authenticated
  using (bucket_id = 'imagens' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'imagens' and (storage.foldername(name))[1] = auth.uid()::text);
