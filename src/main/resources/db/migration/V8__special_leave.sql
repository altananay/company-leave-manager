-- V8: BR-10's six special leave types and the minimal personal data their conditions need
-- (spec 0004, phase B2; D17/D18/D19).
--
-- The three personal-data fields are the minimum that lets the application verify BR-10: a birth
-- date for the birthday window, a boolean flag for the two school types, and a kinship value for
-- bereavement only. A child's name, birth date or school and a relative's identity are not
-- collected (D17, docs/security.md).
--
-- Both user columns are nullable/defaulted so every existing account keeps working untouched: an
-- account without a birth date or the flag is refused by its own leave error code until HR fills
-- the field in (phase B2 risks).
alter table users add column birth_date date;
alter table users add column has_school_age_child boolean not null default false;

alter table leave_request add column kinship varchar(16);

-- A-6: V3's type check named only the two phase A types. The six BR-10 types are added without
-- touching the existing rows (they are all ANNUAL or EXCUSE, which the new list still accepts).
alter table leave_request drop constraint leave_request_type;
alter table leave_request add constraint leave_request_type check (type in (
    'ANNUAL',
    'EXCUSE',
    'MARRIAGE',
    'BEREAVEMENT',
    'SPOUSE_BIRTH',
    'SCHOOL_REPORT',
    'BIRTHDAY',
    'FIRST_SCHOOL_DAY'
));

-- D19: kinship is mandatory exactly for bereavement, holds one of BR-10's four values, and is
-- absent on every other type. The three checks say those three facts separately, so the database
-- refuses a row the service would never write rather than trusting the application alone.
alter table leave_request
    add constraint leave_request_kinship_required
    check ((type = 'BEREAVEMENT' and kinship is not null)
        or (type <> 'BEREAVEMENT' and kinship is null));

alter table leave_request
    add constraint leave_request_kinship_values
    check (kinship is null or kinship in ('SPOUSE', 'CHILD', 'PARENT', 'SIBLING'));

alter table leave_request
    add constraint leave_request_kinship_type
    check (kinship is null or type = 'BEREAVEMENT');
