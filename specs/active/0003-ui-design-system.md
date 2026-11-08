# Spec 0003 — UI design system

- Status: Approved
- Mode: lite
- Plan: `specs/plans/0003-plan.md`
- Self-critique: done (C1–C7 onaylandı, 2026-11-08)

## Intent

İzin yönetiminin bugün beş ekranı var ve her biri ayrı ayrı, elle yazılmış stillerle çizildi: aynı işi
yapan düğmeler farklı görünüyor, hata mesajları farklı yerde çıkıyor, klavyeyle gezinme ekrandan
ekrana değişiyor. Önümüzdeki adım izin talebi, onay ve bakiye ekranları — yani bugünkünün birkaç katı
form, tablo ve onay kutusu. **İK çalışanı** bu ekranları günde onlarca kez kullanacak; **çalışan** ise
yılda birkaç kez, çoğu zaman **telefonundan** girip izin talep edecek ve ilk denemede bitirmek
isteyecek. Başarı: beş ekran tek bir tasarım diline geçer, yeni bir ekran eklemek "sıfırdan stil
yazmak" olmaktan çıkar, her ekran klavye ve ekran okuyucuyla kullanılabilir olur ve telefonda da
düzgün çalışır — bunların hiçbiri bugünkü davranışı bozmadan yapılır. Bilerek **yapılmayacak**: yeni
özellik eklemek, karanlık mod, mobil uygulama, kurumsal marka yenilemesi (marka yok), backend'de
tek satır değişiklik.

## Requirements

- Beş ekran (giriş, parola değiştirme, kullanıcılar, durum, 403) **yeniden tasarlanır**: yalnız
  altyapı değişmez, görünüm de yenilenir. Amaç tutarlı ve iyi bir tasarım dili; birebir kopya değil.
- Tek bir **tasarım dili**: aynı işi yapan öğe (birincil/ikincil/tehlikeli düğme, form alanı, uyarı,
  tablo, diyalog) her ekranda **aynı** bileşenden gelir; ekrana özel tek seferlik stil yazılmaz.
- **Davranış sabit kalır:** akışlar, mesajlar, doğrulama kuralları, hata kodları, TR/EN metinleri ve
  yönlendirmeler bugünküyle aynıdır. Bu spec bir görünüm/erişilebilirlik işidir, davranış işi değil.
- **Duyarlı tasarım:** masaüstü önceliği korunur ama 360 px genişlikten 1440 px'e kadar yatay
  kaydırma olmadan kullanılabilir. Çalışanlar sisteme telefondan da girer.
- **Erişilebilirlik WCAG 2.1 AA:** klavyeyle tam kullanım, görünür odak, etiketli alanlar, yeterli
  kontrast, hata mesajlarının ekran okuyucuya duyurulması. Kontrast **axe-core** ile her bileşen
  testi koşusunda ölçülür.
- **Karanlık mod yok**, ama renkler yalnız tema değişkenlerinden gelir; sonradan tek dosyayla
  eklenebilecek yapı kurulur.
- **İkonlar** `lucide-react`'ten gelir ve yalnız kullanılanlar import edilir; **font** sistem yığınıdır
  (webfont yok, dış bağımlılık yok).
- Mevcut **testler davranış kanıtıdır**: bileşen testleri ve e2e yolculuğu, yalnız seçici/metin
  güncellemesiyle geçmeye devam eder; hiçbir assert zayıflatılmaz.
- **Favicon ve uygulama ikonu**: basit bir monogram işaret (uygulama baş harfleri veya takvim/yaprak
  glifi) SVG olarak; tam logo tasarımı değil. Backlog B-6 bu spec ile kapanır.

## User experience

- **Flow:** giriş ekranı → (gerekiyorsa) parola değiştirme → ana ekran → kullanıcılar (İK) veya 403
  (yetkisiz). Akış bugünküyle aynı; değişen yalnız görünüm, düzen ve erişilebilirlik.
- **States:** her ekran için boş, yükleniyor, hata ve başarı durumu tasarlanır ve korunur:
  - Giriş: boş · yükleniyor · hatalı giriş · kilitli hesap · oturum sona erdi
  - Parola değiştirme: boş · kural ihlali (kısa / eşleşmiyor) · sunucu hatası · başarı
  - Kullanıcılar: boş liste · liste · oluşturma formu · geçici parola (bir kez) · pasife alma onayı ·
    doğrulama hatası · pasif kullanıcı işareti
  - Durum: kontrol ediliyor · çalışıyor · bağlantı hatası
  - 403: tek durum
- **Design reference:** dış bir tasarım dosyası yok — tasarım dili bu spec'in kendisi, build sırasında
  kurulan **token seti + bileşen kataloğu** ve VERIFY'da alınan ekran görüntüleriyle somutlaşır.
  Görsel onay SHIP kapısında insan tarafından verilir.
- **Accessibility:** her ekran klavyeyle baştan sona kullanılabilir (Tab sırası mantıklı, odak
  görünür); alanlar `label` ile bağlı; hata `role="alert"`; dokunma hedefleri en az 44×44 px;
  metin kontrastı 4.5:1, büyük metin ve arayüz öğeleri 3:1. VERIFY'da **NVDA** ile üç akış elle
  kontrol edilir: giriş, kullanıcı oluşturma, 403.

## Constraints & out of scope

- **Sensitive area: yok** — yetkilendirme ve veri işleme değişmiyor; ekranlar bugün gösterdiği veriyi
  gösterir. Backend'de değişiklik yok, yeni uç yok, veritabanı değişmiyor.
- **Kapsam dışı:** yeni özellik, karanlık mod, mobil uygulama, marka/logo yenilemesi (marka yok),
  i18n'e yeni dil, yeni bileşen kataloğu (kullanılmayan bileşen yazılmaz), animasyon/geçiş
  kütüphanesi, ikon kütüphanesinin tamamı, webfont, backend değişikliği.
- **Bileşen kapsamı:** bugün kullanılan bileşenler + izin akışında **kesin** çıkacak üç tanesi (form
  alanı, tablo, onay diyaloğu). Tarih seçici ve benzerleri kendi spec'leriyle gelir.
- **Kanıt yöntemleri (C1–C3):** kontrast `axe-core` ile bileşen testlerinde; "sabit renk yok" kuralı
  `scripts/check` içinde `web/src/**/*.tsx` üzerinde renk literali aramasıyla (token dosyası hariç);
  yatay kaydırma Playwright'ta 360/768/1440 px'te `scrollWidth <= clientWidth` assert'iyle.
- **Performans:** sert bir boyut bütçesi yok. Yeni boyut ölçülür ve planın Build evidence satırına
  yazılır; beklenmedik bir sıçrama SHIP kapısında insan tarafından sorgulanır.
- **Davranış değişmezliği:** bu spec hiçbir kullanıcı akışını, mesajı veya kuralı değiştirmez.
  Değişmesi gerekiyorsa ayrı spec olur.
- **Split:** önerilmedi — tek yetenek ("tasarım dili"), 10 kriter.

## Acceptance criteria

- [ ] AC-1 — Beş ekran (giriş, parola değiştirme, kullanıcılar, durum, 403) yeni tasarım diliyle yeniden yazılır; ekranlarda tek seferlik elle yazılmış stil kalmaz, tüm görsel değerler token veya ortak bileşenden gelir.
- [ ] AC-2 — Davranış değişmez: mevcut bileşen testleri ve e2e yolculuğu (yalnız seçici/metin güncellemesiyle) geçer; akışlar, mesajlar, doğrulama ve TR/EN metinleri bugünküyle aynıdır.
- [ ] AC-3 — Erişilebilirlik: her ekran klavyeyle baştan sona kullanılabilir, odak görünür ve sırası mantıklıdır; her form alanı etiketlidir; hata mesajları `role="alert"` ile duyurulur; her ekranın axe-core taraması **sıfır ihlal** verir (kontrast dahil).
- [ ] AC-4 — Duyarlılık: 360, 768 ve 1440 px genişlikte hiçbir ekranda yatay kaydırma yoktur (`scrollWidth <= clientWidth`); kullanıcılar tablosu 360 px'te de kullanılabilir kalır (öncelikli sütunlar veya kart görünümü).
- [ ] AC-5 — Karanlık mod yoktur, ancak renkler yalnız tema değişkenlerinden gelir: `web/src` altındaki bileşenlerde sabit renk literali yoktur ve tema tek dosyadan değiştirilebilir (kanıt: `check` adımı).
- [ ] AC-6 — Tek tasarım dili: birincil/ikincil/tehlikeli düğme, form alanı, uyarı ve tablo her ekranda aynı bileşenden gelir; aynı işi yapan iki farklı görünüm yoktur.
- [ ] AC-7 — Her ekranın boş, yükleniyor, hata ve başarı durumu tasarlanmıştır ve testle kanıtlanır; kullanıcılar ekranına boş liste durumu eklenir.
- [ ] AC-8 — Mobil kullanım: giriş ve parola değiştirme ekranları 360 px'te tamamlanabilir; tüm dokunma hedefleri en az 44×44 px'dir ve alanlar zoom gerektirmeden okunur.
- [ ] AC-9 — Favicon ve uygulama ikonu proje kimliğine uygun bir **monogram işaret**tir; tarayıcı sekmesinde ve kısayolda tanınır (backlog B-6 kapanır).
- [ ] AC-10 — Belgeler: `docs/conventions.md`'ye UI/tasarım sistemi bölümü eklenir ve seçim bir ADR'de gerekçesiyle (shadcn/ui + Tailwind, alternatifler ve neden seçilmediği) kaydedilir.

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
