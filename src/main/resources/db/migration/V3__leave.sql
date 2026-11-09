-- V3: leave requests, the public-holiday calendar, HR balance adjustments (spec 0004, phase A).
--
-- users.manager_id and users.hire_date are nullable on purpose: every account that V2 created keeps
-- working untouched (AC-8), and the balance screen says so when the seniority is unknown
-- (spec 0004, Risks: "hire_date null → 1–5 yıl varsayılanı").

alter table users add column manager_id uuid;
alter table users add column hire_date date;

alter table users
    add constraint users_manager_fk foreign key (manager_id) references users (id);
create index users_manager_idx on users (manager_id);

-- The business calendar is data, not code (BR-4, docs/conventions.md: "Turkish public holidays as
-- data"). The 2026 list is the full official set: the three-day Ramazan and four-day Kurban holidays
-- plus the fixed national days. Half days (arife) are not public holidays.
create table public_holiday (
    day  date primary key,
    name text not null
);

insert into public_holiday (day, name) values
    ('2026-01-01', 'Yılbaşı'),
    ('2026-03-20', 'Ramazan Bayramı 1. gün'),
    ('2026-03-21', 'Ramazan Bayramı 2. gün'),
    ('2026-03-22', 'Ramazan Bayramı 3. gün'),
    ('2026-04-23', 'Ulusal Egemenlik ve Çocuk Bayramı'),
    ('2026-05-01', 'Emek ve Dayanışma Günü'),
    ('2026-05-19', 'Atatürk''ü Anma, Gençlik ve Spor Bayramı'),
    ('2026-05-27', 'Kurban Bayramı 1. gün'),
    ('2026-05-28', 'Kurban Bayramı 2. gün'),
    ('2026-05-29', 'Kurban Bayramı 3. gün'),
    ('2026-05-30', 'Kurban Bayramı 4. gün'),
    ('2026-07-15', 'Demokrasi ve Millî Birlik Günü'),
    ('2026-08-30', 'Zafer Bayramı'),
    ('2026-10-29', 'Cumhuriyet Bayramı');

-- business_days is the working-day count fixed when the request is created: a holiday added later
-- must not rewrite the past (BR-4 is applied once, at request time).
-- half_day is written by phase B; phase A always stores NONE, so the column and its check exist now
-- and the migration that starts using it changes no schema.
create table leave_request (
    id            uuid        primary key,
    employee_id   uuid        not null references users (id),
    type          text        not null,
    start_date    date        not null,
    end_date      date        not null,
    half_day      text        not null default 'NONE',
    business_days integer     not null,
    reason        text,
    status        text        not null,
    decided_by    uuid        references users (id),
    decided_at    timestamptz,
    decision_note text,
    created_at    timestamptz not null,
    constraint leave_request_range check (end_date >= start_date),
    constraint leave_request_type check (type in ('ANNUAL', 'EXCUSE')),
    constraint leave_request_status check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    constraint leave_request_half_day check (half_day in ('NONE', 'AM', 'PM')),
    constraint leave_request_days check (business_days > 0)
);

create index leave_request_employee_status_idx on leave_request (employee_id, status);
create index leave_request_dates_idx on leave_request (start_date, end_date);

-- HR corrections are their own rows: the reason is mandatory and every row is audited (BR-8, BR-13).
create table leave_adjustment (
    id          uuid        primary key,
    employee_id uuid        not null references users (id),
    days        integer     not null,
    reason      text        not null,
    created_by  uuid        not null references users (id),
    created_at  timestamptz not null,
    constraint leave_adjustment_days check (days <> 0)
);

create index leave_adjustment_employee_idx on leave_adjustment (employee_id);

-- Backlog B-7: a decision records the state it changed from and the state it moved to, so the trail
-- answers "önce/sonra" instead of leaving it inside free text (BR-13).
alter table audit_event add column before_state text;
alter table audit_event add column after_state text;
