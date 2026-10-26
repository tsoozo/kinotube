-- Сервер (functions/, service_role) хүснэгтүүдийг шууд уншиж/бичнэ (Telegram мессежийн дугаар г.м.).
-- Шинэ Supabase төсөлд public хүснэгтүүдэд автомат эрх олгогдохгүй байж болох тул тодорхой олгоно.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
