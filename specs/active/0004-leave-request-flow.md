# Spec 0004 — İzin talebi akışı

- Status: Approved (altananay, 2026-11-09)
- Mode: lite
- Plan: `specs/plans/0004-plan.md`
- Business rules: `docs/domain.md` (BR-1…BR-11) — bu spec onları **yeniden tanımlamaz**, uygular.

## Intent

Bugün uygulama yalnız kimlik ve kullanıcı yönetimini biliyor: bir çalışan izin almak istediğinde bunu
İK'ya e-posta/Slack ile söylüyor, İK elle takip ediyor ve kimse kalan bakiyeyi tek ekranda göremiyor.
**Çalışan** yılda birkaç kez, çoğu zaman **telefonundan** talep açacak ve ilk denemede bitirmek
isteyecek; **yönetici** günde birkaç talebi tek ekranda onaylayacak; **İK** yalnız bakacak ve bakiye
düzeltmesi yapacak. Başarı: talep açma–onaylama–bakiye döngüsü uçtan uca çalışır, bakiye hiçbir
noktada elle tutulmaz, her karar denetim kaydında görünür ve 0003'ün tasarım dili/erişilebilirlik
çıtası korunur. Bilerek **yapılmayacak**: e-posta bildirimi, takvim entegrasyonu, mobil uygulama,
raporlama ekranı, hastalık raporu dosyası, çok kademeli onay.

## Requirements

- **Talep türleri:** `ANNUAL` (yıllık) ve `EXCUSE` (mazeret). Yalnız yıllık izin bakiye kullanır
  (BR-9); mazeret bakiyesizdir (BR-10).
- **Tarih:** başlangıç/bitiş + yarım gün seçimi (`NONE` | `AM` | `PM`; yalnız tek günlük talepte).
  Süre **iş günü** olarak hesaplanır: hafta sonu ve resmî tatil düşülür (BR-4). Resmî tatiller
  veritabanında tutulur, İK yıllık olarak ekler.
- **Kurallar (talep anında ve onay anında):** geçmiş başlangıç yasak (BR-11), çakışan aktif talep
  yasak (BR-6), kalan bakiyeyi aşan yıllık talep yasak (BR-5). Aynı üç kural onay anında da yeniden
  çalışır: talep beklerken başlangıcı geçmiş olabilir veya araya başka bir aktif talep girebilir.
- **Aralık ve mazeret sınırı:** tarih aralığı en çok 366 takvim günüdür; mazeret izni gerekçe
  zorunlu ve en çok 5 iş günüdür. İK, geçmiş başlangıçlı bir kaydı **yalnızca gerekçeyle** açabilir
  (BR-11 istisnası); bu kayıt `LEAVE_RETROACTIVE_REQUESTED` olarak denetlenir ve onay anındaki
  geçmiş tarih kuralından muaftır.
- **Bakiye:** hak kıdeme göre (BR-1: 1–5 yıl 14, 5–15 yıl 20, 15+ yıl 26), hak dönemi işe giriş yıl
  dönümünde başlar (BR-2), dönem sonunda kullanılmayan hakkın tamamı devreder (BR-3); devir
  **nettir**: önceki dönemlerin hakkı eksi o dönemlerde kullanılan günler. Kullanılabilir bakiye =
  dönem hakkı + net devir + İK düzeltmeleri − onaylı − bekleyen. İşe giriş tarihi yoksa yıllık hak
  **0**'dır ve yıllık talep `LEAVE_NO_HIRE_DATE` ile reddedilir; mazeret izni açılabilir.
- **Onay:** yalnızca çalışanın **doğrudan yöneticisi** onaylar veya reddeder (BR-7). İK ve CEO
  onaylayamaz; İK tüm talepleri **görüntüler** ve gerekçeli bakiye düzeltmesi yapar (denetim üretir).
  Çalışan kendi talebini onaylayamaz; yöneticisi olmayan çalışan talep açamaz (İK önce bağ kurar).
- **Yaşam döngüsü:** `PENDING → APPROVED | REJECTED`; `APPROVED → CANCELLED` (yalnız başlangıçtan
  önce, bakiye geri yüklenir — BR-8). Red ve iptal bakiyeyi düşürmez.
- **Denetim:** talep oluşturma, onay, ret, iptal ve bakiye düzeltmesi `audit`'e yazılır; onay/ret
  kaydı **önce/sonra** durumunu taşır (backlog B-7 bu dilimde kapanır).
- **Yönetici bağı:** kullanıcı kaydına `manager` alanı eklenir (kendine referans, ağaç); İK atar.
  Kullanıcı oluşturma formu bu alanı kazanır. İnceleme turu 1: İK mevcut kullanıcının `manager` ve
  `hire_date` alanlarını `PATCH /api/users/{id}` ile **tek tek** düzenleyebilir (toplu göç yok);
  yönetici aktif bir MANAGER olmalıdır ve döngü kuramaz. Aktif çalışanı olan bir yönetici pasife
  alınamaz (önce çalışanlar başka yöneticiye bağlanır), böylece hiçbir talep onaylayıcısız kalmaz.
- **Görünürlük:** çalışan kendi taleplerini, bakiyesini ve **hangi günlerde izinli olduğunu** görür;
  yönetici kendi ekibinin bekleyen taleplerini ve alt ağacının bakiyesini; İK herkesinkini (salt
  okuma) görür. Kapsam dışı bir kimlik 403 değil **404** alır: uç, nesnenin varlığını doğrulamaz.
- **Rota:** `/leave/requests` gibi iç içe yollar doğrudan açılabilir (backlog B-4 bu dilimde kapanır).
- **Tasarım/erişilebilirlik:** 0003'ün kabuğu, bileşenleri ve çıtası aynen kullanılır (WCAG 2.1 AA,
  44 px hedefler, 360/768/1440 yatay kaydırma yok, klavye tam).

## User experience

- **Flow:** giriş → ana ekran (bakiye özeti + son talepler) → **İzin talepleri** ekranı. Çalışan:
  "Yeni talep" → tür, tarih aralığı, yarım gün, gerekçe → özet (kaç iş günü, bakiyeden düşecek) →
  gönder. Yönetici: kendi kuyruğunda bekleyen talepleri görür → onayla/reddet (ret gerekçesi zorunlu).
  İK: tüm talepleri filtreleyerek görür, satır detayında karar geçmişini görür.
- **States:** her ekran için boş, yükleniyor, hata, başarı:
  - Talep listesi: boş (henüz talep yok) · liste · filtre sonucu boş · iskelet · hata
  - Talep formu: boş · doğrulama hatası (geçmiş tarih, çakışma, bakiye) · gönderiliyor · başarı
  - Yönetici kuyruğu: boş ("bekleyen talep yok") · liste · onay/ret sonrası güncellenmiş liste
  - Bakiye kartı: hesaplanıyor · bakiye · yönetici yok uyarısı
- **Design reference:** yeni görsel dil yok; 0003'ün token'ları ve primitifleri. Yeni bileşen
  gerekirse yalnız kullanıldığı yerde doğar (ör. tarih aralığı alanı iki `Input` + takvim yerine
  metin alanı; takvim primitifi bu dilimde yok).
- **Accessibility:** talep formu klavyeyle tamamlanabilir, hata `role="alert"`, tarih alanları
  etiketli, onay/ret diyalogları odak tuzağı ve Escape ile; durum rozetleri metinle birlikte.

## Constraints & out of scope

- **Sensitive area: evet** (izin hakkı ve onay yetkisi) — bu yüzden bağımsız inceleme ve iki turlu
  doğrulama zorunlu.
- **BR-10'un altı özel izin türü Faz B'ye ertelendi** (evlilik, vefat, eş doğumu, karne, doğum günü,
  okulun ilk günü). Neden: her biri kendi süresini, koşulunu ve penceresini getiriyor (doğum günü
  180 gün, karne/okul günü yılda 1 gün, vefat için yakınlık derecesi) ve çocuk/akrabalık verisi
  KVKK kapsamında ayrı bir inceleme ister; Faz A'da bunların yerine `EXCUSE` **gerekçe zorunlu ve
  en çok 5 iş günü** olarak sınırlandı. Böylece "mazeret" ikinci bir yıllık izin gibi kullanılamaz.
- **Kapsam dışı:** e-posta/Slack bildirimi, takvim (iCal/Google) entegrasyonu, mobil uygulama,
  raporlama/analitik ekranı, hastalık raporu dosyası veya eki, çok kademeli onay, vekalet (delegate),
  toplu onay, yarım günden küçük süreler (saatlik izin), başka para birimi/tatil takvimi.
- **Backend:** yeni modül yok; `leave` modülü kendi sınırları içinde (ArchUnit kuralları korunur).
  Yeni uçlar `/api/leave/**` altında; oturum + CSRF + rol kuralları 0002'deki gibi.
- **Veritabanı:** Flyway `V3__leave.sql` — `leave_request`, `public_holiday`, `leave_adjustment`,
  `users.manager_id`, `users.hire_date`. İnceleme turu 1 ekleri: `V4` iptal kaydı + İK geçmiş kayıt
  işareti, `V5` denetim durumlarının `jsonb`'ye geçişi, `V6` 2027 tatil seed'i. Geri dönüşü olmayan
  veri yok.
- **Tarih aralığı sınırı:** bir talep en çok **366 takvim günü** olabilir (`LEAVE_RANGE_TOO_LONG`);
  sınır hem `create` hem `preview` içinde, iş günü sayımından önce uygulanır.
- **İş günü sayımı:** `business_days` **oluşturma anında dondurulur** (bilinçli): sonradan eklenen
  bir resmî tatil geçmiş bir talebi yeniden yazmaz. Sayım kısa yoldan yapılır (tam haftalar +
  kalan günler + aralıktaki tatiller), böylece 366 günlük aralık da sabit zamanda sayılır.
- **Performans:** yeni bir bütçe yok; liste uçları sayfalanır (varsayılan 20, en çok 100).
- **Eşzamanlılık:** aynı çalışanın yazma işlemleri (oluştur/karar/iptal/düzeltme) çalışan satırı
  kilitlenerek sıraya alınır; bakiye ve çakışma kontrolü kilit altında taze durumla yapılır.
- **Split:** bu dilim büyük. Eğer plan aşamasında ikiye ayrılması gerekirse: **0004a** talep + onay +
  bakiye (tam gün, hafta sonu hesabı), **0004b** yarım gün + resmî tatil takvimi + devir. Karar plan
  kapısında verilir.

## Review round 1 decisions (2026-11-09)

Bağımsız incelemenin triyajı insan tarafından onaylandı. Bu dilimde uygulanan kararlar (kanıt ve
ayrıntı: plan `## Triage`):

- **D1 (L-02) — BR-10 Faz B.** Altı özel tür ertelendi; Faz A'da `EXCUSE` gerekçe zorunlu ve en çok
  5 iş günü. Gerekçe: tür başına süre/koşul/pencereler ve çocuk-akrabalık verisi kendi spec'ini ister.
- **D2 (L-03) — aralık ve hesap.** Aralık en çok 366 takvim günü; iş günü sayımı tam hafta + kalan
  gün + tatil farkı ile yapılır (gün gün döngü yok), tatiller tam kalır.
- **D3 (L-05) — işe giriş tarihi yoksa hak 0.** Yıllık talep `LEAVE_NO_HIRE_DATE` ile reddedilir,
  mazeret açılabilir, bakiye ekranı durumu gösterir. **Bilinçli kural değişikliği:** planın risk
  kaydındaki "14 gün varsayılanı" kaldırıldı; varsayım yerine İK'nın tarihi girmesi beklenir.
- **D4 (L-06) — BR-11 istisnası.** Yalnız İK, yalnız gerekçeyle geçmiş başlangıçlı kayıt açar;
  `LEAVE_RETROACTIVE_REQUESTED` denetim olayı ve `retroactive` işareti kalıcıdır. Çalışan ve
  yönetici istisnayı kullanamaz.
- **D5 (L-08) — tatil takvimi.** 2027 resmî tatilleri aynı kaynaktan seed edilir; `business_days`
  oluşturma anında **bilinçli olarak** dondurulur, sonradan eklenen tatil geçmiş talebi değiştirmez.
- **D6 (L-17) — iptal kaydı.** `cancelled_at`/`cancelled_by` ayrı tutulur; karar zamanı ve karar
  veren **korunur**, ekran iptal edeni ayrıca gösterir.
- **D7 (L-19) — net devir.** Devir = önceki dönemlerin hakkı − o dönemlerde kullanılan günler;
  böylece kullanılmış bir gün ikinci kez teklif edilmez.
- **D8 (L-01) — onay anında kurallar.** BR-11 (geçmiş başlangıç) ve BR-6 (kendi dışındaki aktif
  taleple çakışma) onay anında yeniden çalışır; `LEAVE_PAST_DATE` / `LEAVE_OVERLAP`.
- **D9 (L-12) — onaylayıcısız talep yok.** Talep açılırken yönetici aktif MANAGER olmalı; aktif
  çalışanı olan yönetici pasife alınamaz (`MANAGER_HAS_REPORTS`).
- **D10 (L-14) — bakiye kapsamı.** Yönetici alt ağacının bakiyesini okur; `docs/security.md` ile kod
  aynı kuralı söyler.
- **D11 (L-15) — denetim durumları `jsonb`.** İnsan kararıyla ilk REJECT geri alındı; `before_state`
  / `after_state` gerçek `jsonb`, Jackson ile yazılır, testler SQL operatörüyle okur.
- **D12 (L-24) — Faz B notu.** Yarım gün için `business_days` `numeric(4,1)` (ya da dakika) olmalı;
  kolon bugünden tam sayı olduğu için Faz B göçü bunu değiştirir.
- **D13 (L-23) — kanıt.** Planın kanıt satırı, VERIFY'da bu commit'in CI koşu linki ve SHA'sı ile
  tamamlanır; o zamana kadar yer tutucudur.

## Acceptance criteria

- [ ] AC-1 — Çalışan `ANNUAL` veya `EXCUSE` türünde talep açar; süre iş günü olarak hesaplanır (hafta sonu ve resmî tatil düşülür) ve yarım gün seçimi tek günlük talepte 0,5 gün sayılır.
- [ ] AC-2 — Talep kuralları uygulanır: geçmiş başlangıç, çakışan aktif talep ve bakiyeyi aşan yıllık talep reddedilir; kontrol hem talep hem onay anında çalışır.
- [ ] AC-3 — Bakiye kıdeme göre hak + devir + İK düzeltmeleri − onaylı − bekleyen olarak hesaplanır; yalnız yıllık izin bakiyeden düşer, mazeret düşmez.
- [ ] AC-4 — Onayı yalnızca çalışanın doğrudan yöneticisi verir; İK, CEO ve çalışanın kendisi onaylayamaz (403); yöneticisi olmayan çalışan talep açamaz.
- [ ] AC-5 — Yaşam döngüsü: `PENDING → APPROVED | REJECTED`, `APPROVED → CANCELLED` (yalnız başlangıçtan önce, bakiye geri yüklenir); red/iptal bakiyeyi düşürmez.
- [ ] AC-6 — Çalışan kendi taleplerini, bakiyesini ve izinli olduğu günleri görür; yönetici kendi ekibinin bekleyen taleplerini; İK tüm talepleri salt okuma görür (onay düğmesi yok).
- [ ] AC-7 — Talep oluşturma, onay, ret, iptal ve bakiye düzeltmesi denetim kaydına yazılır; onay/ret kaydı önce/sonra durumunu taşır (B-7 kapanır).
- [ ] AC-8 — Kullanıcı kaydı `manager` ve `hire_date` alanlarını kazanır; İK kullanıcı oluştururken yönetici atar; mevcut kullanıcılar etkilenmez (göç geriye dönük uyumlu).
- [ ] AC-9 — İç içe rota (`/leave/requests`) doğrudan açıldığında 200 döner ve doğru ekranı gösterir (B-4 kapanır).
- [ ] AC-10 — Arayüz 0003'in kabuğunu ve bileşenlerini kullanır; 360/768/1440 px'te yatay kaydırma yok, tüm dokunma hedefleri ≥44 px, axe taraması sıfır ihlal, klavyeyle tam kullanım.
- [ ] AC-11 — Mevcut davranış korunur: giriş, kullanıcı yönetimi, parola akışı ve 0003'ün testleri değişmeden geçer; yeni uçlar oturum + CSRF olmadan 401/403 döner.

## Definition of Done

- [ ] Every acceptance criterion mapped to proof (test or reproducible observation)
- [ ] `scripts/check` green
- [ ] Independent review done; real findings fixed, noise rejected with written rationale, deferred ones in `specs/backlog.md`
- [ ] Docs / ADRs updated if behavior or architecture changed
- [ ] Spec moved to `specs/done/` (it becomes immutable there)

## Scorecard (fill at ship — honest numbers make the process improvable)

| Metric | Value |
|---|---|
| Spec revisions | |
| Fix rounds | |
| Review findings: real / noise / deferred | |
| Regressions introduced | |
| Bugs escaped to production | |
