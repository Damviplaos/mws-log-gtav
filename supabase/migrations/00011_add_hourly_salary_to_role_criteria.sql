ALTER TABLE public.role_criteria
  ADD COLUMN IF NOT EXISTS hourly_salary NUMERIC(10,2) DEFAULT NULL;

COMMENT ON COLUMN public.role_criteria.hourly_salary IS 'อัตราค่าตอบแทนต่อชั่วโมง (บาท) ใช้คำนวณรายได้ประจำสัปดาห์';
