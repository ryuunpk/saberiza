-- SABERIZA: esquema inicial do banco Supabase.
-- Aplique todo este arquivo em Supabase > SQL Editor > New query.
-- Pode ser executado novamente sem duplicar as categorias iniciais.

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 100),
  kind text not null check (kind in ('stage','grade','subject','general','topic')),
  parent_id uuid null references public.categories(id) on delete restrict,
  description text not null default '' check (char_length(description) <= 600),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teachings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 180),
  subtitle text not null default '' check (char_length(subtitle) <= 240),
  summary text not null default '' check (char_length(summary) <= 600),
  body text not null check (char_length(btrim(body)) between 1 and 50000),
  keywords text not null default '' check (char_length(keywords) <= 500),
  safety_notes text not null default '' check (char_length(safety_notes) <= 2000),
  references_text text not null default '' check (char_length(references_text) <= 5000),
  difficulty text not null default 'not-set' check (difficulty in ('not-set','beginner','intermediate','advanced')),
  category_id uuid not null references public.categories(id) on delete restrict,
  author_name text not null default 'Autor' check (char_length(author_name) between 1 and 80),
  cover_url text null check (cover_url is null or (cover_url ~* '^https://' and char_length(cover_url) <= 1000)),
  status text not null default 'draft' check (status in ('draft','published','unpublished')),
  title_bg text not null default '#e8f3ec' check (title_bg ~ '^#[0-9A-Fa-f]{6}$'),
  title_color text not null default '#174b3b' check (title_color ~ '^#[0-9A-Fa-f]{6}$'),
  subtitle_color text not null default '#23745b' check (subtitle_color ~ '^#[0-9A-Fa-f]{6}$'),
  body_color text not null default '#24352f' check (body_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text not null default '#17654f' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  title_align text not null default 'left' check (title_align in ('left','center')),
  title_scale numeric not null default 1.9 check (title_scale between 1.5 and 2.7),
  style_preset text not null default 'classic' check (style_preset in ('classic','minimal','note')),
  created_by uuid null references auth.users(id) on delete set null,
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    setweight(to_tsvector('portuguese'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('portuguese'::regconfig, coalesce(subtitle, '')), 'B') ||
    setweight(to_tsvector('portuguese'::regconfig, coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('portuguese'::regconfig, coalesce(body, '')), 'C') ||
    setweight(to_tsvector('portuguese'::regconfig, coalesce(keywords, '')), 'A') ||
    setweight(to_tsvector('portuguese'::regconfig, coalesce(safety_notes, '')), 'C') ||
    setweight(to_tsvector('portuguese'::regconfig, coalesce(references_text, '')), 'D')
  ) stored
);

-- Compatibilidade ao reaplicar o esquema após ajustes nesta versão.
alter table public.teachings add column if not exists safety_notes text not null default '';
alter table public.teachings add column if not exists references_text text not null default '';
alter table public.teachings add column if not exists difficulty text not null default 'not-set';
alter table public.teachings drop constraint if exists teachings_difficulty_check;
alter table public.teachings add constraint teachings_difficulty_check check (difficulty in ('not-set','beginner','intermediate','advanced'));

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (char_length(action) between 1 and 80),
  -- UUID simples para que o histórico mantenha o identificador mesmo após excluir o artigo.
  teaching_id uuid null,
  created_at timestamptz not null default now()
);

create index if not exists categories_parent_active_idx on public.categories(parent_id, is_active, sort_order);
create index if not exists teachings_publication_idx on public.teachings(status, published_at desc);
create index if not exists teachings_category_status_idx on public.teachings(category_id, status, published_at desc);
create index if not exists teachings_search_idx on public.teachings using gin(search_vector);
create index if not exists admin_logs_created_idx on public.admin_logs(created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.set_teaching_publication_dates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.status = 'published' then
    if tg_op = 'INSERT' then
      new.published_at := coalesce(new.published_at, now());
    elsif old.status is distinct from 'published' then
      new.published_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at before update on public.categories
for each row execute function public.set_updated_at();

drop trigger if exists teachings_set_dates on public.teachings;
create trigger teachings_set_dates before insert or update on public.teachings
for each row execute function public.set_teaching_publication_dates();

-- Função usada por políticas RLS. Ela consulta a tabela administrativa sem criar recursão nas políticas.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.categories enable row level security;
alter table public.teachings enable row level security;
alter table public.admin_users enable row level security;
alter table public.admin_logs enable row level security;

-- Remova políticas antigas com estes nomes antes de recriá-las.
drop policy if exists "Public read active categories" on public.categories;
drop policy if exists "Admins read all categories" on public.categories;
drop policy if exists "Admins manage categories" on public.categories;
drop policy if exists "Public read published teachings" on public.teachings;
drop policy if exists "Admins manage teachings" on public.teachings;
drop policy if exists "Admin can read own admin row" on public.admin_users;
drop policy if exists "Admins read logs" on public.admin_logs;
drop policy if exists "Admins insert logs" on public.admin_logs;

create policy "Public read active categories"
on public.categories for select to anon, authenticated
using (is_active = true);

create policy "Admins read all categories"
on public.categories for select to authenticated
using (public.is_admin());

create policy "Admins manage categories"
on public.categories for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "Public read published teachings"
on public.teachings for select to anon, authenticated
using (
  status = 'published'
  and exists (
    select 1 from public.categories c
    where c.id = teachings.category_id and c.is_active = true
  )
);

create policy "Admins manage teachings"
on public.teachings for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "Admin can read own admin row"
on public.admin_users for select to authenticated
using (user_id = (select auth.uid()));

create policy "Admins read logs"
on public.admin_logs for select to authenticated
using (public.is_admin());

create policy "Admins insert logs"
on public.admin_logs for insert to authenticated
with check (public.is_admin() and actor_id = (select auth.uid()));

-- Privilégios de tabela: RLS continua sendo a barreira de autorização.
grant usage on schema public to anon, authenticated;
grant select on public.categories, public.teachings to anon, authenticated;
grant select, insert, update, delete on public.categories, public.teachings to authenticated;
grant select on public.admin_users to authenticated;
grant select, insert on public.admin_logs to authenticated;
revoke insert, update, delete on public.admin_users from anon, authenticated;
revoke update, delete on public.admin_logs from anon, authenticated;

-- CATEGORIAS INICIAIS: estrutura editável, pensada como ponto de partida (não é um currículo oficial).
insert into public.categories (code, name, kind, parent_id, description, sort_order) values
  ('fundamental-i','Ensino Fundamental I','stage',null,'Conteúdos para os anos iniciais do Ensino Fundamental.',10),
  ('fundamental-ii','Ensino Fundamental II','stage',null,'Conteúdos para os anos finais do Ensino Fundamental.',20),
  ('ensino-medio','Ensino Médio','stage',null,'Conteúdos para as séries do Ensino Médio.',30),
  ('conhecimentos-gerais','Conhecimentos Gerais','general',null,'Tutoriais práticos e explicações sobre assuntos do cotidiano.',40)
on conflict (code) do nothing;

with grade_seed(code, name, parent_code, sort_order) as (
  values
  ('f1-ano-1','1º ano','fundamental-i',10),('f1-ano-2','2º ano','fundamental-i',20),('f1-ano-3','3º ano','fundamental-i',30),('f1-ano-4','4º ano','fundamental-i',40),('f1-ano-5','5º ano','fundamental-i',50),
  ('f2-ano-6','6º ano','fundamental-ii',10),('f2-ano-7','7º ano','fundamental-ii',20),('f2-ano-8','8º ano','fundamental-ii',30),('f2-ano-9','9º ano','fundamental-ii',40),
  ('em-serie-1','1ª série','ensino-medio',10),('em-serie-2','2ª série','ensino-medio',20),('em-serie-3','3ª série','ensino-medio',30)
)
insert into public.categories(code, name, kind, parent_id, description, sort_order)
select gs.code, gs.name, 'grade', stages.id, 'Organize os ensinamentos desta etapa por matéria.', gs.sort_order
from grade_seed gs join public.categories stages on stages.code = gs.parent_code
on conflict (code) do nothing;

with subject_seed(stage_code, subject_code, subject_name, sort_order) as (
  values
  ('fundamental-i','portugues','Língua Portuguesa',10),('fundamental-i','matematica','Matemática',20),('fundamental-i','ciencias','Ciências',30),('fundamental-i','historia','História',40),('fundamental-i','geografia','Geografia',50),('fundamental-i','arte','Arte',60),('fundamental-i','educacao-fisica','Educação Física',70),
  ('fundamental-ii','portugues','Língua Portuguesa',10),('fundamental-ii','matematica','Matemática',20),('fundamental-ii','ciencias','Ciências',30),('fundamental-ii','historia','História',40),('fundamental-ii','geografia','Geografia',50),('fundamental-ii','ingles','Língua Inglesa',60),('fundamental-ii','arte','Arte',70),('fundamental-ii','educacao-fisica','Educação Física',80),
  ('ensino-medio','portugues','Língua Portuguesa',10),('ensino-medio','literatura','Literatura',20),('ensino-medio','matematica','Matemática',30),('ensino-medio','biologia','Biologia',40),('ensino-medio','fisica','Física',50),('ensino-medio','quimica','Química',60),('ensino-medio','historia','História',70),('ensino-medio','geografia','Geografia',80),('ensino-medio','filosofia','Filosofia',90),('ensino-medio','sociologia','Sociologia',100),('ensino-medio','ingles','Língua Inglesa',110),('ensino-medio','arte','Arte',120),('ensino-medio','educacao-fisica','Educação Física',130)
)
insert into public.categories(code, name, kind, parent_id, description, sort_order)
select ss.subject_code || '-' || grades.code, ss.subject_name, 'subject', grades.id,
       'Matéria inicial sugerida; ajuste a organização conforme a necessidade e o currículo aplicável.', ss.sort_order
from subject_seed ss
join public.categories stages on stages.code = ss.stage_code
join public.categories grades on grades.parent_id = stages.id and grades.kind = 'grade'
on conflict (code) do nothing;

with topic_seed(code, name, sort_order, description) as (
  values
  ('casa','Casa',10,'Cuidados domésticos e organização.'),
  ('tecnologia','Tecnologia',20,'Celulares, computadores e ferramentas digitais.'),
  ('ciencia','Ciência',30,'Explicações e conceitos científicos.'),
  ('organizacao','Organização',40,'Métodos para organizar tarefas e informações.'),
  ('seguranca','Segurança',50,'Prevenção de riscos e tomada de decisões seguras.'),
  ('cultura','Cultura',60,'Cultura, sociedade e cidadania.'),
  ('habilidades-praticas','Habilidades Práticas',70,'Habilidades úteis para situações do cotidiano.')
)
insert into public.categories(code, name, kind, parent_id, description, sort_order)
select 'geral-' || ts.code, ts.name, 'topic', root.id, ts.description, ts.sort_order
from topic_seed ts join public.categories root on root.code = 'conhecimentos-gerais'
on conflict (code) do nothing;

-- Conteúdo marcado explicitamente como demonstração para testar a leitura e a paginação.
insert into public.teachings (
  title, subtitle, summary, body, keywords, category_id, author_name, status,
  title_bg, title_color, subtitle_color, body_color, accent_color, title_align, title_scale, style_preset, published_at
)
select
  'EXEMPLO — Como organizar um pequeno estudo',
  'Um modelo de como transformar um assunto em etapas menores.',
  'Este conteúdo demonstra a aparência de um ensinamento. Substitua-o por um texto seu quando estiver pronto.',
  '# Comece pelo objetivo\n\nEste é um **conteúdo de demonstração**. Ele serve para conferir se a página e o banco funcionam; não é apresentado como material didático revisado.\n\n## Um método simples\n\n1. Escolha um assunto específico.\n2. Escreva o que você já sabe.\n3. Divida o tema em perguntas menores.\n4. Consulte materiais confiáveis e anote as fontes.\n5. Explique o que aprendeu com suas próprias palavras.\n\n> Dica: antes de publicar um ensinamento real, revise o texto e confira os fatos e as referências.',
  'demonstração, estudo, organização, aprendizagem',
  cat.id,
  'Conteúdo de demonstração',
  'published',
  '#e8f3ec', '#174b3b', '#23745b', '#24352f', '#17654f', 'left', 1.9, 'classic', now()
from public.categories cat where cat.code = 'geral-organizacao'
  and not exists (select 1 from public.teachings t where t.title = 'EXEMPLO — Como organizar um pequeno estudo')
on conflict do nothing;

-- Após executar este arquivo, siga o README para criar uma conta Auth e adicioná-la
-- manualmente a public.admin_users. Não abra o cadastro público para conceder privilégios.
