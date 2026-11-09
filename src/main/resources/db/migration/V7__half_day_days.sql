-- V7: the day unit becomes decimal so a half day can be stored (spec 0004 D12/D16, phase B1).
--
-- Phase A's columns were integer, which cannot carry "0,5 gün". Both stay numeric(4,1): four
-- significant digits with one decimal place, so the largest value is 999.9 — a 366-day range and
-- the ±365-day HR adjustment bound both fit comfortably. The cast keeps every existing row exactly
-- as it was: an integer 3 becomes 3.0, whole days stay whole days.
alter table leave_request
    alter column business_days type numeric(4,1) using business_days::numeric(4,1);

alter table leave_adjustment
    alter column days type numeric(4,1) using days::numeric(4,1);

-- The two checks belong to these columns, so the migration states them explicitly (V3 created them
-- with the same names and expressions; they are re-created here over the numeric type so the
-- decimal rules — strictly positive days, a nonzero correction — are the ones enforced).
alter table leave_request drop constraint leave_request_days;
alter table leave_request add constraint leave_request_days check (business_days > 0);

alter table leave_adjustment drop constraint leave_adjustment_days;
alter table leave_adjustment add constraint leave_adjustment_days check (days <> 0);
