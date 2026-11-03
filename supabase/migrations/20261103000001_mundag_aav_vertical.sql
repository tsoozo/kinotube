-- «Мундаг аавтай сэргэлэн охин» босоо кино тул Shorts-д харагдана (zoye, 2026-11-03).
-- Shorts = бүх босоо кино (цуврал ч, нэг ангитай кино ч). Цаашид админ кинон дээр "Хэлбэр: Босоо" сонгоно.
update public.catalog
   set orientation = 'vertical', updated_at = now()
 where title ilike '%ундаг аавтай%' and orientation <> 'vertical';
