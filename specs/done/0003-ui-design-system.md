# Spec 0003 — UI design system

- Status: Shipped (2026-11-09) (Revision 2)
- Mode: lite
- Plan: `specs/plans/0003-plan.md`
- Self-critique: done (C1–C7 onaylandı, 2026-11-08)
- Revision 2 (A-5, 2026-11-08): SHIP kapısında insan, ilk görsel dili "çok sade" buldu; yön olarak
  **uygulama kabuğu + iki kolonlu giriş + dozunda canlı yüzeyler** seçildi (AC-11…AC-15).

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
  kontrast, hata mesajlarının ekran okuyucuya duyurulması. Yapısal kurallar jsdom'da `jest-axe` ile
  her bileşen testinde doğrulanır; renk ve karşıtlık gerçek tarayıcıda (axe taraması + hesaplanan
  renk ölçümleri) ölçülür — jsdom'da stil sayfası yoktur (plan H-2).
- **Karanlık mod yok**, ama renkler yalnız tema değişkenlerinden gelir; sonradan tek dosyayla
  eklenebilecek yapı kurulur.
- **İkonlar** `lucide-react`'ten gelir ve yalnız kullanılanlar import edilir; **font** sistem yığınıdır
  (webfont yok, dış bağımlılık yok).
- Mevcut **testler davranış kanıtıdır**: bileşen testleri ve e2e yolculuğu, yalnız seçici/metin
  güncellemesiyle geçmeye devam eder; hiçbir assert zayıflatılmaz.
- **Favicon ve uygulama ikonu**: basit bir monogram işaret (uygulama baş harfleri veya takvim/yaprak
  glifi) SVG olarak; tam logo tasarımı değil. Backlog B-6 bu spec ile kapanır.
- **Uygulama kabuğu (A-5):** ekranlar artık tek tek kartlar değil, bir kabuğun içinde yaşar: masaüstünde
  solda kalıcı gezinme, üstte breadcrumb ve hesap menüsü, içerikte sayfa başlığı + eylem satırı. Kabuk
  yeni bir özellik getirmez; var olan üç görünümü (ana ekran, kullanıcılar, durum) ve 403'ü taşır.
- **Sabit görsel ölçek (A-5):** tipografi, yarıçap, gölge ve hareket tek yerden gelir; ekranlarda
  tek seferlik boyut/gölge yazılmaz. "İyi tasarım" iddiası bu ölçeğin tutarlılığına dayanır.
- **Giriş ekranı (A-5):** ≥1024 px'te iki kolon — solda marka paneli, sağda form; telefonda panel
  gizlenir, form tam genişlik olur. Davranış (doğrulama, mesajlar, dil) değişmez.

## User experience

- **Flow:** giriş ekranı → (gerekiyorsa) parola değiştirme → ana ekran → kullanıcılar (İK) veya 403
  (yetkisiz). Akış bugünküyle aynı; değişen yalnız görünüm, düzen ve erişilebilirlik.
- **States:** her ekran için boş, yükleniyor, hata ve başarı durumu tasarlanır ve korunur:
  - Giriş: boş · yükleniyor · hatalı giriş · kilitli hesap · oturum sona erdi
  - Parola değiştirme: boş · kural ihlali (kısa / eşleşmiyor) · sunucu hatası · başarı
  - Kullanıcılar: boş liste · liste · arama/filtre sonucu boş · yükleniyor (iskelet) · oluşturma
    formu · geçici parola (bir kez) · pasife alma onayı · doğrulama hatası · pasif kullanıcı işareti
  - Durum: kontrol ediliyor · çalışıyor · bağlantı hatası
  - 403: tek durum
- **Kabuk ve görsel dil (A-5):** masaüstünde solda 240 px'lik sabit gezinme (marka, iki düz menü
  öğesi, altta hesap kartı ve çıkış), üstte 56 px'lik bar (breadcrumb, dil, hesap menüsü). İçerikte
  her ekranın kendi başlığı, tek satır açıklaması ve sağa yaslı birincil eylemi vardır. 1024 px
  altında gezinme bir sheet'e dönüşür, üst bar sadeleşir; 360 px'te içerik tek kolondur. Kullanıcılar ekranı
  sayfa başlığı + üç özet + araç çubuğu (arama, rol filtresi) + avatarlı tablo + altbilgi sayfalama
  olarak kurulur; özet sayıları **listeden** hesaplanır (yeni uç yok). Giriş ekranı ≥1024 px'te iki
  kolondur: solda koyu gradyanlı marka paneli (monogram, tek cümle, üç madde), sağda form.
- **Design reference:** dış bir tasarım dosyası yok — tasarım dili bu spec'in kendisi, build sırasında
  kurulan **token seti + bileşen kataloğu** ve VERIFY'da alınan ekran görüntüleriyle somutlaşır.
  Görsel onay SHIP kapısında insan tarafından verilir.
- **Accessibility:** her ekran klavyeyle baştan sona kullanılabilir (Tab sırası mantıklı, odak
  görünür); alanlar `label` ile bağlı; hata `role="alert"`; dokunma hedefleri en az 44×44 px;
  metin kontrastı 4.5:1, büyük metin ve arayüz öğeleri 3:1. VERIFY'da **NVDA** ile üç akış elle
  kontrol edilir: giriş, kullanıcı oluşturma, 403; ayrıca 360 px'te kullanıcılar düzeninin kart
  görünümü ve `::before` sütun etiketleri.

## Constraints & out of scope

- **Sensitive area: yok** — yetkilendirme ve veri işleme değişmiyor; ekranlar bugün gösterdiği veriyi
  gösterir. Backend'de değişiklik yok, yeni uç yok, veritabanı değişmiyor.
- **Kapsam dışı:** yeni özellik, karanlık mod, mobil uygulama, marka/logo yenilemesi (marka yok),
  i18n'e yeni dil, yeni bileşen kataloğu (kullanılmayan bileşen yazılmaz), animasyon/geçiş
  kütüphanesi, ikon kütüphanesinin tamamı, webfont, backend değişikliği.
- **Bileşen kapsamı:** bugün kullanılan bileşenler + A-5'in kabuğu için **fiilen kullanılan** beş
  primitif: `Avatar`, `Skeleton`, `DropdownMenu`, `Sheet`, `Breadcrumb`. Kullanılmayan bileşen
  yazılmaz (`Separator`/`Tooltip` bu yüzden hiç eklenmedi); tarih seçici ve benzerleri kendi
  spec'leriyle gelir.
- **Kanıt yöntemleri (C1–C3):** yapısal kurallar jsdom'da `jest-axe` ile bileşen testlerinde; renk ve
  karşıtlık gerçek tarayıcıda axe taraması + hesaplanan renk kontrolleriyle (metin, gradyan paneli ve
  kontrol sınırları); "sabit renk yok ve ölçek dışı boyut/gölge/yarıçap yok" kuralı `scripts/check`
  içinde `web/src/**/*.{ts,tsx,css}` üzerinde aramayla (`index.css` hariç); yatay kaydırma
  Playwright'ta 360/768/1440 px'te `scrollWidth <= clientWidth` assert'iyle.
- **Performans:** sert bir boyut bütçesi yok. Yeni boyut ölçülür ve planın Build evidence satırına
  yazılır; beklenmedik bir sıçrama SHIP kapısında insan tarafından sorgulanır.
- **Davranış değişmezliği:** bu spec hiçbir kullanıcı akışını, mesajı veya kuralı değiştirmez.
  Değişmesi gerekiyorsa ayrı spec olur. **A-5 istisnası (bilinçli):** (a) 403 ekranındaki "Geri"
  düğmesi kaldırıldı — telefonda dönüş yolu sheet'teki gezinmedir; (b) kullanıcılar ekranındaki
  "Geri" düğmesi kalktı — dönüş kabuk gezinmesinden (masaüstünde sidebar, telefonda sheet); (c)
  liste yenilemesinde gelen 403 de artık 403 ekranına geçer (önceden yalnız ilk yükleme geçiyordu).
  Akış ve mesajlar aynı kalır.
- **Split:** önerilmedi — tek yetenek ("tasarım dili"), 15 kriter (A-5 ile 5 kriter eklendi).

## Acceptance criteria

- [x] AC-1 — Beş ekran (giriş, parola değiştirme, kullanıcılar, durum, 403) yeni tasarım diliyle yeniden yazılır; ekranlarda tek seferlik elle yazılmış stil kalmaz, tüm görsel değerler token veya ortak bileşenden gelir.
- [x] AC-2 — Davranış değişmez: mevcut bileşen testleri ve e2e yolculuğu (yalnız seçici/metin güncellemesiyle) geçer; akışlar, mesajlar, doğrulama ve TR/EN metinleri bugünküyle aynıdır.
- [x] AC-3 — Erişilebilirlik: her ekran klavyeyle baştan sona kullanılabilir, odak görünür ve sırası mantıklıdır; her form alanı etiketlidir; hata mesajları `role="alert"` ile duyurulur; her ekranın axe-core taraması **sıfır ihlal** verir (kontrast dahil).
- [x] AC-4 — Duyarlılık: 360, 768 ve 1440 px genişlikte hiçbir ekranda yatay kaydırma yoktur (`scrollWidth <= clientWidth`); kullanıcılar tablosu 360 px'te de kullanılabilir kalır (öncelikli sütunlar veya kart görünümü).
- [x] AC-5 — Karanlık mod yoktur, ancak renkler yalnız tema değişkenlerinden gelir: `web/src` altındaki bileşenlerde sabit renk literali yoktur ve tema tek dosyadan değiştirilebilir (kanıt: `check` adımı).
- [x] AC-6 — Tek tasarım dili: birincil/ikincil/tehlikeli düğme, form alanı, uyarı ve tablo her ekranda aynı bileşenden gelir; aynı işi yapan iki farklı görünüm yoktur.
- [x] AC-7 — Her ekranın boş, yükleniyor, hata ve başarı durumu tasarlanmıştır ve testle kanıtlanır; kullanıcılar ekranına boş liste durumu eklenir.
- [x] AC-8 — Mobil kullanım: giriş ve parola değiştirme ekranları 360 px'te tamamlanabilir; tüm dokunma hedefleri en az 44×44 px'dir ve alanlar zoom gerektirmeden okunur.
- [x] AC-9 — Favicon ve uygulama ikonu proje kimliğine uygun bir **monogram işaret**tir; tarayıcı sekmesinde ve kısayolda tanınır (backlog B-6 kapanır).
- [x] AC-10 — Belgeler: `docs/conventions.md`'ye UI/tasarım sistemi bölümü eklenir ve seçim bir ADR'de gerekçesiyle (shadcn/ui + Tailwind, alternatifler ve neden seçilmediği) kaydedilir.
- [x] AC-11 — Uygulama kabuğu: ≥1024 px'te solda 240 px'lik kalıcı gezinme (marka, iki düz menü öğesi, hesap kartı, çıkış), üstte breadcrumb + dil + hesap menüsü; <1024 px'te gezinme bir sheet olarak açılır ve içerik tam genişlik kullanır. Aktif öğe `aria-current` ile bildirilir, gezinme klavyeyle tam çalışır ve 360 px'te yatay kaydırma yoktur.
- [x] AC-12 — Sabit görsel ölçek: tipografi (display/h1/h2/body/small/label), semantik yarıçap (chip/control/panel/card/pill), gölge ve hareket token'ları tanımlanır; ekran metinleri bu ölçekten gelir, `scripts/tokens` token dosyası dışında gölge/yarıçap literali ile adlandırılmış Tailwind boyut/gölge/yarıçap basamaklarını da yakalar.
- [x] AC-13 — Giriş ekranı: ≥1024 px'te iki kolon (solda marka paneli, sağda form); <1024 px'te panel gizlenir, form tam genişlik. Doğrulama, mesajlar ve dil davranışı bugünküyle aynıdır.
- [x] AC-14 — Kullanıcılar ekranı: sayfa başlığı + açıklama + birincil eylem; listeden hesaplanan üç özet (toplam/aktif/pasif); ad veya e-posta araması ve rol filtresi; avatarlı satırlar, rol rozeti, durum göstergesi; satır eylemleri menüde; 10 satırlık sayfalama; yüklenirken iskelet, sonuç boşken tasarlanmış boş durum. Arama/filtre/sayfalama istemci tarafındadır (yeni uç yok). `md` altında tablo bloklara dönüşür: sütun etiketi CSS `::before` üretilmiş içeriğidir, tablo başlığı `display:none`'dır; ekran okuyucu satır değerlerini görünür metin olarak, sütun etiketini üretilmiş içerik olarak alır (NVDA elle kontrolü VERIFY'da).
- [x] AC-15 — Görsel dil: birincil eylem ve giriş paneli marka renginin gradyanını kullanır; kartlar yumuşak gölge ve 12–16 px yarıçapla gelir; durum renkleri (aktif/pasif/uyarı) rozet ve nokta olarak tutarlıdır; hareket 150–200 ms ile sınırlıdır ve `prefers-reduced-motion` altında kapanır. Hepsi token'lardan gelir.

## Definition of Done

- [x] Every acceptance criterion mapped to proof (test or reproducible observation)
- [x] `scripts/check` green
- [x] Independent review done; real findings fixed, noise rejected with written rationale, deferred ones in `specs/backlog.md`
- [x] Docs / ADRs updated if behavior or architecture changed
- [x] Spec moved to `specs/done/` (it becomes immutable there)

## Scorecard (fill at ship — honest numbers make the process improvable)

| Metric | Value |
|---|---|
| Spec revisions | 2 (ilk taslak + A-5 görsel dil) |
| Fix rounds | 6 (inceleme 1–6, VERIFY dahil) |
| Review findings: real / noise / deferred | 84 / 1 / 0 |
| Regressions introduced | 5 (hepsi inceleme/VERIFY’da yakalandı) |
| Bugs escaped to production | 0 |
