-- admin_list_payments дотроо хугацаа дууссан хүсэлтийг шинэчилдэг тул stable биш.
-- (PostgREST stable функцийг read-only транзакцид ажиллуулж, UPDATE хийхэд 405 буцаадаг.)
alter function public.admin_list_payments(text) volatile;
