-- V6: the 2027 public-holiday calendar (spec 0004 review round 1, L-08).
--
-- Same source as the 2026 seed in V3: the official Turkish list, with the religious days fixed by
-- the Hijri calendar (a lunar year is eleven days shorter, so 2027's Ramazan Bayramı starts on
-- 9 March and Kurban Bayramı on 16 May). Half days (arife) are not public holidays.
--
-- 19 May 2027 is both Atatürk'ü Anma, Gençlik ve Spor Bayramı and the fourth day of Kurban Bayramı:
-- one date is one row in a calendar keyed by day, so its name carries both.
insert into public_holiday (day, name) values
    ('2027-01-01', 'Yılbaşı'),
    ('2027-03-09', 'Ramazan Bayramı 1. gün'),
    ('2027-03-10', 'Ramazan Bayramı 2. gün'),
    ('2027-03-11', 'Ramazan Bayramı 3. gün'),
    ('2027-04-23', 'Ulusal Egemenlik ve Çocuk Bayramı'),
    ('2027-05-01', 'Emek ve Dayanışma Günü'),
    ('2027-05-16', 'Kurban Bayramı 1. gün'),
    ('2027-05-17', 'Kurban Bayramı 2. gün'),
    ('2027-05-18', 'Kurban Bayramı 3. gün'),
    ('2027-05-19', 'Atatürk''ü Anma, Gençlik ve Spor Bayramı (Kurban Bayramı 4. gün)'),
    ('2027-07-15', 'Demokrasi ve Millî Birlik Günü'),
    ('2027-08-30', 'Zafer Bayramı'),
    ('2027-10-29', 'Cumhuriyet Bayramı');
