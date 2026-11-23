-- Workspace addresses live at the top level (/{slug}/…), next to Kira's own pages. Keep an entity
-- named e.g. "Login" or "Dashboard" from taking those paths: such slugs get "-2" like a clash would.
create or replace function public.slugify(p text) returns text
language sql immutable as $$
  select case
    when s in ('login', 'signup', 'auth', 'post-auth', 'dashboard', 'new-org', 'terms', 'privacy', 'api',
               'settings', 'billing', 'admin', 'staff', 'demo', 'ms', 'en', 'icon', 'favicon', 'robots', 'sitemap')
      then s || '-2'
    else s
  end
  from (select coalesce(nullif(trim(both '-' from regexp_replace(lower(p), '[^a-z0-9]+', '-', 'g')), ''), 'entity') as s) t;
$$;
