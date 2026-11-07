# Spec 0001 — Walking skeleton

- Status: In progress
- Mode: lite
- Plan: `specs/plans/0001-plan.md`
- Self-critique: done

## Intent

Ekip, şirket içi izin yönetimini sıfırdan kuruyor. İlk izin özelliğinden önce, seçilen teknoloji
yığınının uçtan uca çalıştığını kanıtlamamız gerekiyor: Java/Spring Boot servisi, PostgreSQL
veritabanı, React arayüzü ve hepsini tek komutla doğrulayan bir kontrol. Başarı, repoyu temiz
kopyalayan birinin `./scripts/check` çalıştırıp **gerçek** (adım içeren, sahte olmayan) yeşil
alması ve aynı kontrolün CI'da da yeşil olmasıdır. Arayüz hem Türkçe hem İngilizce
kullanılabilecek. Bilinçli olarak yapılmayanlar: izin talebi/onay/bakiye gibi hiçbir iş özelliği,
kimlik doğrulama ve ELK yığını.

## Requirements

- **R-1** Tek komut, arka ucu ve arayüzü derler, tüm otomatik kontrolleri koşar ve sonucu tek bir
  yeşil/kırmızı satırla bildirir.
- **R-2** Uygulama bir veritabanına bağlanarak açılır ve kendi sağlığını — veritabanı bağlantısı
  dahil — bir insanın tarayıcıda açabileceği bir sayfadan bildirir.
- **R-3** Veritabanı şeması boş bir veritabanında otomatik ve sürümlü olarak kurulur; aynı şema
  ikinci açılışta yeniden uygulanmaz.
- **R-4** Sayfa, sistem durumunu üç durumda gösterir: kontrol ediliyor, çalışıyor, bağlantı hatası;
  hata durumunda kullanıcı yeniden deneyebilir.
- **R-5** Otomatik kontroller; birim, gerçek veritabanına karşı entegrasyon, arayüz durumları ve
  tek bir tarayıcı yolculuğu içerir.
- **R-6** CI, aynı kontrolleri her push ve pull request'te koşar.
- **R-7** Kontroller hiçbir süreç ve hiçbir veri bırakmaz; her koşu bilinen bir durumdan başlar.
- **R-8** Proje, belgelenmiş önkoşullarla (Java 25, Node 24, Docker) temiz bir makinede derlenir ve
  çalışır.
- **R-9** Arayüz iki dilli: kullanıcı ekrandaki denetimle Türkçe ve İngilizce arasında geçiş yapar;
  seçim kalıcıdır ve varsayılan dil tarayıcı dilinden türetilir.

## User experience

- **Flow:** Kullanıcı `/` adresini açar → uygulama kabuğu, durum satırı ve dil denetimi (TR/EN)
  görünür → istek tamamlanınca durum satırı "Sistem çalışıyor" ya da "Bağlantı hatası" olur → hata
  durumunda "Yeniden dene" düğmesi isteği tekrarlar → dil denetimi anında tüm görünür metinleri
  çevirir, sayfa yenilenmeden.
- **States:**
  - Yükleniyor: "Kontrol ediliyor…" / "Checking…"
  - Başarı: "Sistem çalışıyor" / "System is up"
  - Hata: "Bağlantı hatası" / "Connection error" + "Yeniden dene" / "Try again"
  - Boş: yok — sayfada listelenecek veri yok
  - Yetki yok: yok — bu spec'te kimlik doğrulama kapsam dışı
- **Design reference:** none — the flow above is the design.
- **Accessibility:** durum satırı `role="status"` ile duyurulur; dil denetimi ve "Yeniden dene"
  klavyeyle erişilebilir, görünür odak halkası taşır; dil değişiminde `document.documentElement.lang`
  güncellenir; metin/arka plan kontrastı WCAG AA.

## Constraints & out of scope

- **Sensitive area:** none — kişisel veri ve yetkilendirme bu spec'te yok.
- **Kapsam dışı:** kimlik doğrulama/oturum, izin talebi/onay/bakiye, çalışan ve departman verisi,
  CSV içe aktarma, e-posta bildirimi, raporlama, denetim ekranı, ELK, üçüncü bir dil, RTL düzeni,
  sunucu tarafı çeviri (API yalnızca İngilizce kararlı `code` döner, metin arayüzden gelir).
- **Sağlık sözleşmesi:** `GET /api/health` tam `{"status":"UP"}` (200) veya `{"status":"DOWN"}`
  (503) döner; veritabanı kontrolü en fazla **2 sn** sürer; uç kimlik doğrulaması istemez ve
  kişisel veri taşımaz; kontrol `SELECT 1` yapar, iş tablosuna bağlı değildir.
- **İlk şema sürümü:** yalnızca `app_metadata(key, value)` — iş tablosu yok; her tablo kendi
  spec'iyle gelir.
- **Tek origin:** üretimde arayüz aynı uygulamadan servis edilir; geliştirmede Vite proxy kullanılır.
- **Sürümler sabit:** Java 25, Spring Boot 4.1.2, PostgreSQL 18, React 19.3.1, Vite 8.3.6,
  TypeScript 7.0.2, Node 24, Maven.
- **e2e yaşam döngüsü:** tek proje script'i (`scripts/e2e`) veritabanını ve uygulamayı açar, health
  bekler, Playwright'ı koşar, her durumda kapatır; adımın exit kodu korunur.
- **Belge güncellemeleri:** `docs/testing.md` e2e yolculuk listesi ikiye çıkar (smoke + ileride izin
  akışı, bütçe ~3 dk); `docs/conventions.md` arayüz dili ve kullanıcıya görünen mesaj kuralını alır.
- **Kanıt yeri:** AC-1'in "temiz kopya" kanıtı **CI'da** taze checkout'tur; yerel koşu kanıt sayılmaz.
- **Split:** önerilmedi — tek yetenek ("araç zincirinin uçtan uca çalıştığını kanıtla"), 9 kriter.

## Acceptance criteria

- [ ] AC-1 — Temiz bir kopyada `./scripts/check` arka ucu ve arayüzü derler, tüm adımları koşar ve `CHECK GREEN (full, …)` ile biter.
- [ ] AC-2 — Veritabanı açıkken `GET /api/health` 200 ve `{"status":"UP"}` döner; veritabanı erişilemezken 503 ve `{"status":"DOWN"}` döner.
- [ ] AC-3 — Boş bir veritabanında şema sürümlü migration ile kurulur; aynı veritabanında ikinci açılış hiçbir migration uygulamaz.
- [ ] AC-4 — `/` açıldığında istek tamamlanana kadar sayfa "Kontrol ediliyor…", başarılı olduğunda "Sistem çalışıyor" gösterir.
- [ ] AC-5 — Sağlık isteği başarısız olduğunda sayfa "Bağlantı hatası" ve "Yeniden dene" düğmesi gösterir; düğme isteği yeniden gönderir.
- [ ] AC-6 — Tarayıcı yolculuğu (tek worker, headless, gerçek veritabanı) uygulamayı açar ve "Sistem çalışıyor" durumunu görür.
- [ ] AC-7 — `./scripts/check --fast` yalnızca hızlı adımları (derleme, birim, bileşen, lint) koşar ve yeşil biter; entegrasyon ve e2e yalnızca full profilde koşar.
- [ ] AC-8 — Arayüz varsayılan olarak tarayıcı dilini kullanır (tr → Türkçe, en → İngilizce, diğer → Türkçe); TR/EN denetimi tüm görünür metinleri anında değiştirir, `document.lang` güncellenir ve seçim sayfa yenilendikten sonra korunur.
- [ ] AC-9 — CI, push ve PR'da `doctor --strict`, `selftest` ve full `check`'i kurulu araç zinciriyle koşar ve dalda yeşildir.

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
