-- Шинэ ангилал: Орос кино (russian). Хуучин categories check-ийг нэрээс үл хамааран солино.
do $$
declare r record;
begin
  for r in select conname from pg_constraint
    where conrelid = 'public.catalog'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%categories%'
  loop
    execute format('alter table public.catalog drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.catalog add constraint catalog_categories_check
  check (categories <@ array['old', 'ai', 'mongolian', 'chinese', 'korean', 'russian']::text[]);
