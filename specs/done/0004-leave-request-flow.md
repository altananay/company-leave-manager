# Spec 0004 — İzin talebi akışı

- Status: Shipped
- Phase: **A shipped (2026-11-09)** · **B1 shipped (2026-11-09)** · **B2 shipped (2026-11-10)**
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

- **Talep türleri:** `ANNUAL` (yıllık), `EXCUSE` (mazeret) ve B2'de BR-10'un altı özel türü
  (evlilik, vefat, eş doğumu, karne, doğum günü, okulun ilk günü; D14). Yalnız yıllık izin bakiye
  kullanır (BR-9); mazeret ve özel türler bakiyesizdir (BR-10).
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
  - İzinli günlerim: boş ("Önümüzdeki 90 günde izniniz yok") · liste · iskelet · hata
- **Design reference:** yeni görsel dil yok; 0003'ün token'ları ve primitifleri. Yeni bileşen
  gerekirse yalnız kullanıldığı yerde doğar (ör. tarih aralığı alanı iki `Input` + takvim yerine
  metin alanı; takvim primitifi bu dilimde yok).
- **Accessibility:** talep formu klavyeyle tamamlanabilir, hata `role="alert"`, tarih alanları
  etiketli, onay/ret diyalogları odak tuzağı ve Escape ile; durum rozetleri metinle birlikte.

## Constraints & out of scope

- **Sensitive area: evet** (izin hakkı ve onay yetkisi) — bu yüzden bağımsız inceleme ve iki turlu
  doğrulama zorunlu.
- **BR-10'un altı özel türü B2'de açılır** (evlilik, vefat, eş doğumu, karne, doğum günü, okulun ilk
  günü). Faz A'da bunların yerine `EXCUSE` gerekçe zorunlu ve en çok 5 iş günü olarak sınırlandı;
  B2 bu türleri kendi süre/koşul/pencereleriyle ekler (D17, D19). Çocuk/akraba verisi minimal
  tutulur: yalnız doğum tarihi, okul çağı bayrağı ve yakınlık derecesi; çocuğun/akrabaların kimliği
  toplanmaz.
- **Kapsam dışı:** e-posta/Slack bildirimi, takvim (iCal/Google) entegrasyonu, mobil uygulama,
  raporlama/analitik ekranı, hastalık raporu dosyası veya eki, çok kademeli onay, vekalet (delegate),
  toplu onay, yarım günden küçük süreler (saatlik izin), çocuk/akraba kaydı (ad, doğum tarihi, okul;
  D17'de reddedildi), başka para birimi/tatil takvimi.
- **Backend:** yeni modül yok; `leave` modülü kendi sınırları içinde (ArchUnit kuralları korunur).
  Yeni uçlar `/api/leave/**` altında; oturum + CSRF + rol kuralları 0002'deki gibi.
- **Veritabanı:** Flyway `V3__leave.sql` — `leave_request`, `public_holiday`, `leave_adjustment`,
  `users.manager_id`, `users.hire_date`. İnceleme turu 1 ekleri: `V4` iptal kaydı + İK geçmiş kayıt
  işareti, `V5` denetim durumlarının `jsonb`'ye geçişi, `V6` 2027 tatil seed'i. Faz B ekleri:
  `V7` ondalık gün (`business_days`, `days`), `V8` doğum tarihi + okul çağı bayrağı + yakınlık
  derecesi. Geri dönüşü olmayan veri yok.
- **Tarih aralığı sınırı:** bir talep en çok **366 takvim günü** olabilir (`LEAVE_RANGE_TOO_LONG`);
  sınır hem `create` hem `preview` içinde, iş günü sayımından önce uygulanır.
- **İş günü sayımı:** `business_days` **oluşturma anında dondurulur** (bilinçli): sonradan eklenen
  bir resmî tatil geçmiş bir talebi yeniden yazmaz. Sayım kısa yoldan yapılır (tam haftalar +
  kalan günler + aralıktaki tatiller), böylece 366 günlük aralık da sabit zamanda sayılır.
- **Performans:** yeni bir bütçe yok; liste uçları sayfalanır (varsayılan 20, en çok 100).
- **Eşzamanlılık:** aynı çalışanın yazma işlemleri (oluştur/karar/iptal/düzeltme) çalışan satırı
  kilitlenerek sıraya alınır; bakiye ve çakışma kontrolü kilit altında taze durumla yapılır.
- **Split:** Faz A tek PR olarak ship edildi. Faz B iki PR'a ayrıldı (D14): **B1** yarım gün +
  ondalık gün + "izinli günlerim", **B2** BR-10'un altı özel türü + kişisel veri. B1 merge olmadan
  B2 başlamaz.

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

## Phase B decisions (2026-11-09)

Faz B iki PR'a ayrıldı ve kararlar insan onayıyla verildi. Plan: `specs/plans/0004-plan.md` →
"Phase B". B1 merge olmadan B2 başlamaz: B2, B1'in getirdiği ondalık gün birimini ve form altyapısını
kullanır.

- **D14 — B1/B2 ayrımı.** **B1**: yarım gün (AM/PM, 0,5), `business_days` `numeric(6,1)`, İK
  düzeltmesinde 0,5 adımı, "izinli günlerim" görünümü. **B2**: BR-10'un altı özel türü (evlilik,
  vefat, eş doğumu, karne, doğum günü, okulun ilk günü), süre/koşul/pencereleri ve gerektirdiği
  minimal kişisel veri. Neden: B2 altı ayrı kural seti ve KVKK kararı getiriyor; ayrı inceleme ve
  ayrı merge her dilimin kanıtını küçük tutar.
- **D15 — Yarım gün kapsamı.** Yalnız `ANNUAL` ve `EXCUSE`; yalnız tek günlük talepte
  (`startDate = endDate`) ve o gün iş günüyse; 0,5 gün sayılır. Özel türler tam gündür. Aynı gün
  ikinci bir talep (biri öğleden önce, biri öğleden sonra olsa bile) BR-6 çakışmasıdır: kural gün
  aralığına bakar, saat dilimine değil.
- **D16 — Gün birimi.** `leave_request.business_days` ve `leave_adjustment.days` `numeric(6,1)`;
  bakiye alanları (hak, devir, düzeltme, onaylı, bekleyen, kalan) 0,1 duyarlılığında döner. İK
  düzeltmesi 0,5'in katı olmalı ve ±365 günle sınırlıdır. Neden: 0,5 gün taşıyan bir bakiye tam sayı
  olamaz; tek birim her yerde aynı kalır (D12'nin uygulanışı). **6,1 (inceleme S-1):** Faz A'nın
  düzeltme ucu sınırsız `Integer` aldığı için eski bir satır `numeric(4,1)`i taşırabilir (ör. 1000);
  göç eski satırı korumalı, başarısız olmamalı. Yeni düzeltmeler yine ±365 ve 0,5 adımdır.
- **D17 — Kişisel veri (KVKK) minimal set.** BR-10'un koşullarını denetlemek için yalnız üç alan
  tutulur: `users.birth_date` (doğum günü penceresi), `users.has_school_age_child` (karne ve okulun
  ilk günü), `leave_request.kinship` (yalnız vefat; eş, çocuk, anne-baba, kardeş). Çocuğun adı,
  doğum tarihi, okulu ve akrabanın kimliği **toplanmaz**. Amaç yalnız izin hakkının doğrulanmasıdır;
  görünürlük D18'de; saklama istihdam süresi + yasal saklama, ayrıntı `docs/security.md`. Neden:
  koşullar denetlenmeden BR-10 uygulanamaz; bayrak + enum, çocuk/akraba kaydından çok daha az veri
  taşır.
- **D18 — Görünürlük.** Doğum tarihi ve okul çağı bayrağı yalnız İK'nın kullanıcı uçlarında
  (`GET/POST/PATCH /api/users`) görünür ve değişir; `/api/auth/me`, bakiye ve izin yanıtlarında
  **yoktur**. Yakınlık derecesi talebin kendi kaydındadır ve yalnız çalışan, doğrudan yöneticisi ve
  İK görür. Çalışan kendi doğum tarihini/bayrağını bu uygulamadan düzenleyemez (İK girer).
- **D19 — BR-10 süre ve pencereleri.** "Süre" sütunu **üst sınırdır**: evlilik, vefat ve eş doğumu
  en çok 5 iş günü; karne, doğum günü ve okulun ilk günü tam **1 iş günü** (tek gün). Karne ve okulun
  ilk günü kotası **her tür için takvim yılında 1 gün** (ikisi ayrı kova); doğum günü hakkı **en son doğum gününden itibaren 180
  gün** içinde kullanılır ve o pencere başına 1 gündür. Kota onaylı **ve** bekleyen talepleri sayar;
  onay anında kendi dışındakilerle yeniden kontrol edilir (D8 deseni). Altı tür de bakiyesizdir
  (BR-9).
- **D20 — "İzinli günlerim".** Çalışan yalnız kendi **onaylı** izin günlerini görür; uç
  `GET /api/leave/days` tarih aralığı alır (varsayılan bugün…+90 gün, en çok 366 gün). Gün listesi
  bugünkü tatil takvimiyle açılır; talebin dondurulmuş iş günü sayısı değişmez (D5). Bekleyen ve
  iptal günler bu görünümde yoktur, talep listesindedir. Yönetici ve İK bu uçtan başkasının gün
  listesini okuyamaz.

### B1 — yarım gün, ondalık gün, izinli günlerim

- `HalfDay` (`NONE|AM|PM`) talepte saklanır. Yarım gün seçimi tek günlük `ANNUAL`/`EXCUSE` talebinde
  geçerlidir; iş günü sayısı 0,5 olur. Hafta sonu/tatil gününe yarım gün `LEAVE_NO_WORKING_DAY`,
  birden çok güne veya özel türe yarım gün `LEAVE_HALF_DAY_INVALID`.
- Özet (`preview`) ve bakiye 0,5 duyarlılığında döner; form "0,5 gün" gösterir.
- "İzinli günlerim" kartı izin ekranındadır: tarih, tür ve yarım gün bilgisi; boş, yükleniyor ve
  hata durumları; liste olarak ekran okuyucuyla okunur.
- Göç: `V7__half_day_days.sql` — iki kolon `numeric(6,1)`, `business_days > 0` ve `days <> 0`
  kontrolleri. Mevcut satırlar (1000 günlük eski düzeltme dahil) tam gün olarak korunur.

### B2 — BR-10'un altı özel türü

- Yeni türler: `MARRIAGE`, `BEREAVEMENT`, `SPOUSE_BIRTH`, `SCHOOL_REPORT`, `BIRTHDAY`,
  `FIRST_SCHOOL_DAY`; hepsi bakiyesizdir. Gerekçe isteğe bağlıdır (mazerette olduğu gibi zorunlu
  değil); vefat talebi yakınlık derecesini taşır ve zorunludur.
- Karne ve okulun ilk günü okul çağında çocuk bayrağını, doğum günü doğum tarihini ister. Veri yoksa
  talep kendi koduyla reddedilir: `LEAVE_NO_SCHOOL_AGE_CHILD`, `LEAVE_NO_BIRTH_DATE`.
- İK kullanıcı formu doğum tarihi ve okul çağı bayrağını kazanır; ikisi de `USER_UPDATED`
  denetiminde önce/sonra olarak görünür; `POST /api/users` da bu alanları kabul eder.
- Göç: `V8__special_leave.sql` — `users.birth_date`, `users.has_school_age_child`,
  `leave_request.kinship` ve üç kontrol kısıtı (yalnız vefatta zorunlu, dört değer, başka türde yok).
- Yeni hata kodları: `LEAVE_SPECIAL_TOO_LONG`, `LEAVE_SPECIAL_ONE_DAY`, `LEAVE_KINSHIP_REQUIRED`,
  `LEAVE_NO_SCHOOL_AGE_CHILD`, `LEAVE_NO_BIRTH_DATE`, `LEAVE_BIRTHDAY_WINDOW`,
  `LEAVE_SPECIAL_QUOTA_USED`.

## Acceptance criteria

- [x] AC-1 — Çalışan `ANNUAL` veya `EXCUSE` türünde talep açar; süre iş günü olarak hesaplanır (hafta sonu ve resmî tatil düşülür) ve yarım gün seçimi tek günlük talepte 0,5 gün sayılır. **(Faz A: tür + iş günü; yarım gün B1'de tamamlandı)**
- [x] AC-2 — Talep kuralları uygulanır: geçmiş başlangıç, çakışan aktif talep ve bakiyeyi aşan yıllık talep reddedilir; kontrol hem talep hem onay anında çalışır.
- [x] AC-3 — Bakiye kıdeme göre hak + devir + İK düzeltmeleri − onaylı − bekleyen olarak hesaplanır; yalnız yıllık izin bakiyeden düşer, mazeret düşmez.
- [x] AC-4 — Onayı yalnızca çalışanın doğrudan yöneticisi verir; İK, CEO ve çalışanın kendisi onaylayamaz (403); yöneticisi olmayan çalışan talep açamaz.
- [x] AC-5 — Yaşam döngüsü: `PENDING → APPROVED | REJECTED`, `APPROVED → CANCELLED` (yalnız başlangıçtan önce, bakiye geri yüklenir); red/iptal bakiyeyi düşürmez.
- [x] AC-6 — Çalışan kendi taleplerini, bakiyesini ve izinli olduğu günleri görür; yönetici kendi ekibinin bekleyen taleplerini; İK tüm talepleri salt okuma görür (onay düğmesi yok).
- [x] AC-7 — Talep oluşturma, onay, ret, iptal ve bakiye düzeltmesi denetim kaydına yazılır; onay/ret kaydı önce/sonra durumunu taşır (B-7 kapanır).
- [x] AC-8 — Kullanıcı kaydı `manager` ve `hire_date` alanlarını kazanır; İK kullanıcı oluştururken yönetici atar; mevcut kullanıcılar etkilenmez (göç geriye dönük uyumlu).
- [x] AC-9 — İç içe rota (`/leave/requests`) doğrudan açıldığında 200 döner ve doğru ekranı gösterir (B-4 kapanır).
- [x] AC-10 — Arayüz 0003'in kabuğunu ve bileşenlerini kullanır; 360/768/1440 px'te yatay kaydırma yok, tüm dokunma hedefleri ≥44 px, axe taraması sıfır ihlal, klavyeyle tam kullanım.
- [x] AC-11 — Mevcut davranış korunur: giriş, kullanıcı yönetimi, parola akışı ve 0003'ün testleri değişmeden geçer; yeni uçlar oturum + CSRF olmadan 401/403 döner.
- [x] AC-12 — (B1) Yarım gün: tek günlük `ANNUAL`/`EXCUSE` talebinde `AM`/`PM` seçimi 0,5 iş günü sayılır ve `business_days` ondalık saklanır; özet, bakiye ve İK düzeltmesi 0,5 duyarlılığında çalışır; birden çok güne, özel türe veya iş günü olmayan güne yarım gün reddedilir.
- [x] AC-13 — (B1) Çalışan "İzinli günlerim" görünümünde yalnız kendi onaylı izin günlerini (tarih, tür, yarım gün) görür; bekleyen/iptal ve başkasının günleri görünmez; boş, yükleniyor ve hata durumları gösterilir.
- [x] AC-14 — (B2) Altı özel tür kendi süresi, koşulu ve penceresiyle açılır: evlilik/vefat/eş doğumu en çok 5 iş günü; karne/doğum günü/okulun ilk günü tam 1 iş günü; karne ve okulun ilk günü **her biri için** takvim yılında 1 gün; doğum günü en son doğum gününden 180 gün içinde 1 gün; hiçbiri bakiyeden düşmez; kota onay anında yeniden kontrol edilir.
- [x] AC-15 — (B2) Özel tür verisi minimal ve yetkilidir: doğum tarihi ile okul çağı bayrağı yalnız İK kullanıcı uçlarında yönetilir, değişikliği denetlenir ve izin/bakiye/`/me` yanıtlarında görünmez; yakınlık derecesi yalnız vefat talebinde saklanır ve yalnız çalışan, doğrudan yöneticisi ve İK görür; çocuk/akraba kimliği toplanmaz ve KVKK notu `docs/security.md`'de yer alır.
- [x] AC-16 — (B1+B2) Faz A ve 0003 davranışı korunur: tam gün taleplerin süresi ve bakiyesi değişmez, mevcut testler zayıflatılmadan geçer (gün birimi değiştiği için yalnız sayı tipi beklentileri güncellenir); yeni uçlar oturum + CSRF ister, kapsam dışına 404 döner; 360/768/1440 px'te yatay kaydırma yok, dokunma hedefleri ≥44 px, axe sıfır ihlal.

## Definition of Done

- [x] Every acceptance criterion mapped to proof (test or reproducible observation)
- [x] `scripts/check` green
- [x] Independent review done; real findings fixed, noise rejected with written rationale, deferred ones in `specs/backlog.md`
- [x] Docs / ADRs updated if behavior or architecture changed
- [x] Spec moved to `specs/done/` (it becomes immutable there)

## Scorecard (fill at ship — honest numbers make the process improvable)

| Metric | Value |
|---|---|
| Spec revisions | 1 (Faz B amendment, D14–D20) |
| Fix rounds | 5 (Faz A 3, B1 1, B2 1) |
| Review findings: real / noise / deferred | 57 / 8 / 0 (+1 belirsiz→karar: R-3 tür başına) |
| Regressions introduced | 0 |
| Bugs escaped to production | 0 |
