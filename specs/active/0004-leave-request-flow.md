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
  yasak (BR-6), kalan bakiyeyi aşan yıllık talep yasak (BR-5).
- **Bakiye:** hak kıdeme göre (BR-1: 1–5 yıl 14, 5–15 yıl 20, 15+ yıl 26), hak dönemi işe giriş yıl
  dönümünde başlar (BR-2), dönem sonunda kullanılmayan hakkın tamamı devreder (BR-3). Kullanılabilir
  bakiye = dönem hakkı + devir + İK düzeltmeleri − onaylı − bekleyen.
- **Onay:** yalnızca çalışanın **doğrudan yöneticisi** onaylar veya reddeder (BR-7). İK ve CEO
  onaylayamaz; İK tüm talepleri **görüntüler** ve gerekçeli bakiye düzeltmesi yapar (denetim üretir).
  Çalışan kendi talebini onaylayamaz; yöneticisi olmayan çalışan talep açamaz (İK önce bağ kurar).
- **Yaşam döngüsü:** `PENDING → APPROVED | REJECTED`; `APPROVED → CANCELLED` (yalnız başlangıçtan
  önce, bakiye geri yüklenir — BR-8). Red ve iptal bakiyeyi düşürmez.
- **Denetim:** talep oluşturma, onay, ret, iptal ve bakiye düzeltmesi `audit`'e yazılır; onay/ret
  kaydı **önce/sonra** durumunu taşır (backlog B-7 bu dilimde kapanır).
- **Yönetici bağı:** kullanıcı kaydına `manager` alanı eklenir (kendine referans, ağaç); İK atar.
  Kullanıcı oluşturma formu bu alanı kazanır.
- **Görünürlük:** çalışan kendi taleplerini, bakiyesini ve **hangi günlerde izinli olduğunu** görür;
  yönetici kendi ekibinin bekleyen taleplerini; İK herkesinkini (salt okuma) görür.
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
- **Kapsam dışı:** e-posta/Slack bildirimi, takvim (iCal/Google) entegrasyonu, mobil uygulama,
  raporlama/analitik ekranı, hastalık raporu dosyası veya eki, çok kademeli onay, vekalet (delegate),
  toplu onay, yarım günden küçük süreler (saatlik izin), başka para birimi/tatil takvimi.
- **Backend:** yeni modül yok; `leave` modülü kendi sınırları içinde (ArchUnit kuralları korunur).
  Yeni uçlar `/api/leave/**` altında; oturum + CSRF + rol kuralları 0002'deki gibi.
- **Veritabanı:** Flyway `V3__leave.sql` — `leave_request`, `public_holiday`, `leave_adjustment`,
  `users.manager_id`, `users.hire_date`. Geri dönüşü olmayan veri yok.
- **Performans:** yeni bir bütçe yok; liste uçları sayfalanır (varsayılan 20, en çok 100).
- **Split:** bu dilim büyük. Eğer plan aşamasında ikiye ayrılması gerekirse: **0004a** talep + onay +
  bakiye (tam gün, hafta sonu hesabı), **0004b** yarım gün + resmî tatil takvimi + devir. Karar plan
  kapısında verilir.

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
