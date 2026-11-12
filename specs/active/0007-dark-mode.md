# Spec 0007 — Karanlık mod

- Status: In progress
- Mode: lite
- Plan: `specs/plans/0007-plan.md`
- Self-critique: done
- Source: insan talebi (2026-11-12); spec 0003 AC-5 ("Karanlık mod yoktur, ancak renkler yalnız tema
  değişkenlerinden gelir; tema tek dosyadan değiştirilebilir") ve 0003'ün kapsam notu
- Design: mevcut tasarım sistemi (0003) + `web/src/index.css`'teki `.dark` token bloğu; yeni ekran
  tasarımı yok
- Supersedes: yok

## Intent

Kullanıcılar gün boyu ekranda ve işletim sistemlerinin karanlık tercihi yaygın. Uygulama bugün yalnız
açık tema: `index.css`'te **`.dark` token bloğu zaten var** (0003'ün bilinçli olarak bıraktığı dilim),
ama hiçbir şey `.dark` sınıfını set etmiyor. Karanlık modu ekliyoruz: **Açık / Koyu / Sistem**
seçenekleri, cihaz tercihine göre kalıcı, ilk boyamada titremesiz, iki temada da WCAG AA kontrastlı ve
axe sıfır ihlalli.

## Requirements

- **R-1 — Tema seçici.** Shell başlığında ve giriş/parola ekranlarında; tek ikon düğme + menü
  (Açık/Koyu/Sistem); TR/EN; klavye ve ekran okuyucu ile kullanılabilir; 44 px hedef; seçili tema
  işaretli (`aria-checked`).
- **R-2 — Tema uygulaması.** `<html>` üzerinde `class="dark"`; mevcut `.dark` token bloğu; `color-scheme`
  tema ile; localStorage'da kalıcı; varsayılan **sistem**; `prefers-color-scheme` değişimini canlı izle.
- **R-3 — İlk boyama.** Kayıtlı/sistem teması React'ten önce uygulanır (FOUC yok); uygulamada CSP
  yok (kontrol edildi), inline script güvenli; ileride CSP eklenirse hash ile.
- **R-4 — Marka yüzeyleri.** `brand-action`/`brand-panel` gradyanlarının metni iki temada da okunur;
  karanlık gölgeler koyu; login marka paneli ve logo.
- **R-5 — Erişilebilirlik.** İki temada normal metin ≥4.5:1, büyük metin ≥3:1, kontrol sınırı ≥3:1;
  odak halkası görünür; axe sıfır ihlal (giriş, ana ekran, kullanıcılar, izinler, kuyruk);
  360/768/1440 px'te yatay kaydırma yok; 44 px.
- **R-6 — Testler.** Tema sağlayıcı ve toggle bileşen testleri; e2e'nin karanlık a11y/kontrast
  taramaları mevcut testlere eklenir (iki-journey bütçesi korunur); `scripts/tokens` yeşil; yeni
  token'lar yalnız `index.css`'te.
- **R-7 — Doküman.** README tema bölümü; spec 0003'ün "karanlık mod yok" notu 0007 ile tarihsel
  kalır; conventions/token listesi güncel.

## Acceptance criteria

- [ ] AC-1 — Tema seçici giriş, parola ve shell ekranlarında görünür; menüde üç seçenek (Açık/Koyu/
  Sistem); TR/EN; seçili tema işaretli; yalnız klavyeyle erişilir; 44 px; 360 px'te taşma yok.
- [ ] AC-2 — Koyu seçilince `<html class="dark">`; token'lar koyu; `color-scheme: dark`; reload
  sonrası kalıcı; "Sistem" OS temasını izler (canlı değişim); varsayılan Sistem.
- [ ] AC-3 — İlk boyamada FOUC yok: kayıtlı/sistem teması ilk karede doğru (inline script).
- [ ] AC-4 — Karanlıkta kontrast: normal ≥4.5:1, büyük ≥3:1, kontrol sınırı ≥3:1; axe sıfır; marka
  yüzeylerinin metni okunur.
- [ ] AC-5 — Karanlıkta 360/768/1440 yatay kaydırma yok; 44 px; odak halkası görünür.
- [ ] AC-6 — Karanlık değerler yalnız `index.css`'te; bileşenlerde sabit renk yok; `scripts/tokens`
  yeşil; yeni `--brand-foreground` ve karanlık gölgeler token olarak tanımlı.
- [ ] AC-7 — Sağlayıcı (depolama/sistem/OS değişimi) ve toggle bileşen testleri; e2e karanlık
  a11y/kontrast taramaları; iki-journey bütçesi korunmuş.
- [ ] AC-8 — README tema notu + bu spec.

## Decisions

- **D-1 — Strateji.** shadcn/ui'nin Vite yaklaşımı: `<html>`'e `.dark` sınıfı + mevcut `.dark` CSS
  değişkenleri; `next-themes` yok, küçük bir `ThemeProvider` (React + Vite, yeni bağımlılık yok).
  *Öneri: onayla.*
- **D-2 — Seçenekler.** `light` / `dark` / `system`; varsayılan `system`; localStorage anahtarı
  `leave-manager.theme`; `matchMedia` + `change` dinleyicisi. *Öneri: onayla.*
- **D-3 — FOUC.** `index.html`'e küçük inline script (localStorage/sistem → `.dark` + `color-scheme`);
  CSP yok, gerekirse hash. *Öneri: inline script.*
- **D-4 — Toggle UI.** shadcn'in `ModeToggle` deseni: tek ikon düğme (Sun/Moon) + dropdown
  (Açık/Koyu/Sistem, seçili öğe işaretli); shell başlığı + giriş/parola üst satırı. Tek 44 px hedef
  360 px başlıkta sığar; segmented 3 × 44 px dil anahtarıyla birlikte taşardı. *Öneri: onayla.*
- **D-5 — Marka ve gölge.** Yeni `--brand-foreground` (iki temada açık) `brand-action`/`brand-panel`
  metnine bağlanır; karanlık `--shadow-*` koyu. *Öneri: onayla.*
- **D-6 — `color-scheme`.** `:root` light; `.dark` dark (scrollbar/autofill). *Öneri: onayla.*
- **D-7 — `@custom-variant dark`.** Tailwind v4'te `dark:` utility'leri için
  `@custom-variant dark (&:is(.dark *));` eklensin (shadcn konvansiyonu; token tabanlı tema onsuz da
  çalışır). *Öneri: ekle.*
- **D-8 — Kapsam dışı.** Sunucu tarafı kullanıcı tercihi, `prefers-contrast`/forced-colors, print,
  Kibana, e-posta, PWA tema rengi. *Öneri: onayla.*
- **D-9 — Testler.** Mevcut a11y/kontrast taramalarına karanlık geçişi eklenir; yeni journey yok;
  kontrast iki temada ölçülür. *Öneri: onayla.*
- **D-10 — PWA/manifest.** `theme_color`/`background_color` statik kalır; dokümanda not. *Öneri:
  kapsam dışı.*

## Out of scope

- Sunucu tarafı tema tercihi / kullanıcı bazlı tema.
- `prefers-contrast`, forced-colors, print stilleri, Kibana/e-posta temaları, PWA tema rengi.
- Yeni bileşen/tasarım dili; mevcut token'lar ve bileşenler kullanılır.

## Definition of Done

- [ ] Her AC kanıta bağlı (test veya tekrarlanabilir gözlem)
- [ ] `./scripts/check` (full) + `./scripts/residue` yeşil
- [ ] Bağımsız inceleme; gerçek bulgular düzeltildi, gürültü gerekçeli reddedildi, defer'ler
  `specs/backlog.md`'de
- [ ] README + docs güncel
- [ ] Spec `specs/done/`'a taşındı
