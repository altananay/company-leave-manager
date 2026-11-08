# Spec 0002 — Identity and roles

- Status: Shipped (2026-11-08)
- Mode: lite
- Plan: `specs/plans/0002-plan.md`
- Self-critique: done

## Intent

Şirket içi izin yönetiminde ilk gerçek dilim: **çalışanın kim olduğunu bilmek.** Bugün uygulama
herkese açık bir sağlık sayfası; izin talebi, onay ve bakiye gibi her özellik "kim çağırıyor"
sorusuna dayanıyor. Başarı: dört rolün (çalışan, yönetici, İK, CEO) e-posta + parola ile giriş
yapabildiği, oturumun güvenli çerezle taşındığı, her ucun **varsayılan olarak kapalı** olduğu ve
İK'nın kullanıcı oluşturup pasife alabildiği bir dilim. Bilinçli olarak yapılmayanlar: SSO, CSV içe
aktarma (0003), e-posta ile parola sıfırlama, MFA.

## Requirements

- **R-1** Çalışan, kurumsal e-postası ve parolasıyla giriş yapar. Hatalı bilgide giriş reddedilir ve
  kullanıcı **genel** bir hata görür — hangi alanın yanlış olduğu söylenmez.
- **R-2** Giriş yapan kullanıcı çıkış yapabilir; çıkıştan sonra aynı oturumla hiçbir korumalı uca
  erişilemez.
- **R-3** Oturum **30 dakika boşta** veya **8 saat mutlak** süre sonunda biter; kullanıcı yeniden
  giriş yapması gerektiğini anlar.
- **R-4** Beş hatalı denemeden sonra hesap **15 dakika** kilitlenir; kullanıcıya kilit mesajı
  gösterilir, kilitliyken doğru parola da reddedilir.
- **R-5** İK yeni kullanıcı oluşturur (ad, e-posta, rol: çalışan veya yönetici) ve bir **geçici
  parola** üretir; kullanıcı ilk girişte parolasını değiştirmeden korumalı uçlara erişemez. Parola
  değiştirirken **mevcut parolasını da** girer.
- **R-6** İK kullanıcıyı pasife alır; pasif kullanıcı giriş yapamaz ve açık oturumları sona erer.
- **R-7** İK parola sıfırlar: yeni bir geçici parola üretilir ve bir kez gösterilir; kullanıcı ilk
  girişte değiştirmek zorundadır (mevcut parola sorulur).
- **R-8** İK **kendine veya başkasına İK/CEO rolü atayamaz**; bu iki rol yalnızca başlangıç
  seed'iyle verilir. İK kendini pasife alamaz ve kendi parolasını bu ekrandan sıfırlayamaz. CEO bu
  dilimde hiçbir yazma ucuna erişemez.
- **R-9** Her korumalı uç, oturum yoksa veya rol/kapsam yetmiyorsa isteği reddeder; sağlık ucu
  açıktır. Yetki kontrolü **varsayılan olarak reddeder** — yeni bir uç bilerek açılmadıkça kapalıdır.
- **R-10** Başarılı ve başarısız giriş, çıkış, kullanıcı oluşturma, pasife alma ve parola sıfırlama
  denetim kaydına yazılır (kim, ne zaman, ne). **Parola hiçbir kayda yazılmaz.**
- **R-11** Arayüz iki dilli (TR/EN); tüm metinler katalogdan gelir.

## User experience

- **Flow:** Kullanıcı `/login` ekranını açar (e-posta, parola, "Giriş") → başarılıysa uygulama
  kabuğuna geçer (durum sayfası + üstte ad/rol + "Çıkış"). İlk girişte ya da İK parolayı
  sıfırladıysa doğrudan **parola değiştirme** ekranı gelir. İK, "Kullanıcılar" ekranından kullanıcı
  oluşturur, pasife alır, parola sıfırlar. Yetkisi olmayan sayfa açılırsa **403** ekranı görünür;
  oturum bitince kullanıcı giriş ekranına yönlendirilir ve "oturum sona erdi" bilgisini görür.
- **States:**
  - Giriş: boş · yükleniyor · hatalı giriş (genel hata) · kilitli hesap · başarı
  - Parola değiştirme: boş · kural ihlali (kısa parola, eşleşmeyen tekrar) · başarı
  - Kullanıcılar (İK): boş liste · liste · oluşturma formu (doğrulama hataları) · geçici parolanın
    bir kez gösterildiği onay · pasife alma onayı · pasif kullanıcı işaretleri
  - Yetkisiz: 403 ekranı
  - Oturum bitti: giriş ekranı + "oturum sona erdi" bilgisi
- **Design reference:** none — the flow above is the design.
- **Accessibility:** form alanlarının etiketi var; hata mesajları `role="alert"` ile duyurulur; odak
  hatalı alana taşınır; klavyeyle tam akış; kontrast WCAG AA.

## Constraints & out of scope

- **Sensitive area: Yetkilendirme** ve **Sensitive area: Kişisel veri** — bu spec ikisine de dokunur.
- **Kapsam dışı:** SSO (Entra ID/Google), CSV içe aktarma (0003), e-posta ile parola sıfırlama, MFA,
  "beni hatırla", oturum listesi/yönetimi, İK'nın kilidi elle açması (V2), denetim ekranı (V2),
  parola geçmişi, çalışan/departman verisi ve yönetici ağacı (0003).
- **API yüzeyi:** `/api/auth/*` (giriş, çıkış, mevcut kullanıcı, CSRF, parola değiştirme) ve
  `/api/users` (yalnız İK). `/api/health` açık kalır.
- **Oturum:** sunucu tarafı oturum PostgreSQL'de tutulur; çerez `HttpOnly`, `SameSite=Lax`;
  üretimde `Secure`. Durum değiştiren istekler CSRF belirteci ister: SPA belirteci
  `GET /api/auth/csrf` ile alır ve `X-CSRF-TOKEN` başlığıyla gönderir.
- **Hata davranışı:** API oturumsuz istekte **401**, yetkisiz istekte **403** döner. SPA, **var olan
  bir oturum** 401 ile bittiyse giriş ekranına yönlendirir ve "oturum sona erdi" bilgisini gösterir
  (bu bilgi sekme yenilense de gösterilir); ilk ziyaret ve hatalı giriş kendi mesajını gösterir.
  403'te 403 ekranını açar; CSRF hatası ayrı kodla (`CSRF_INVALID`) döner.
- **Kilit:** hatalı deneme sayacı ve kilit bitişi **veritabanında** tutulur; uygulama yeniden
  başlasa da kilit sürer.
- **Parola:** BCrypt ile saklanır; en az 12 karakter; hiçbir yerde düz metin yok.
- **Denetim:** başarısız girişte e-posta **maskeli** yazılır (`a***@domain`); parola hiçbir kayıtta
  (düz metin veya hash) yer almaz.
- **Seed:** boş veritabanında, ortam değişkenleriyle (`SEED_HR_EMAIL`/`SEED_HR_PASSWORD`,
  `SEED_CEO_EMAIL`/`SEED_CEO_PASSWORD`) bir İK ve bir CEO hesabı oluşturulur. Değişkenler yoksa
  uygulama açılır ve **WARN** loglar; kodda varsayılan parola yoktur, seed yalnızca o hesaplar
  yoksa çalışır.
- **Split:** önerilmedi — tek yetenek ("kimlik ve roller"), 10 kriter.

## Acceptance criteria

- [x] AC-1 — Doğru e-posta/parola ile giriş 200 döner ve `HttpOnly` oturum çerezi kurar; yanlış parola 401 ve genel hata döner (hangi alanın yanlış olduğu söylenmez); çıkıştan sonra aynı çerezle korumalı uç 401 döner.
- [x] AC-2 — Oturum yapılandırması 30 dakika boşta / 8 saat mutlaktır; süresi dolmuş (sunucuda sonlandırılmış) oturumla korumalı uç 401 döner.
- [x] AC-3 — Beş hatalı denemeden sonra hesap 15 dakika kilitlenir; kilitliyken doğru parola 423 ve kilit mesajı döner; kilit denetim kaydına yazılır.
- [x] AC-4 — İK, çalışan veya yönetici rolüyle kullanıcı oluşturur ve geçici parola bir kez döner; kullanıcı ilk girişte parola değiştirmeden korumalı uçlara erişemez (403); parola değiştirme mevcut parolayı ister ve başarılıysa erişim açılır.
- [x] AC-5 — Pasife alınan kullanıcı giriş yapamaz (401) ve açık oturumu 401 döner; İK kendini pasife alamaz ve kendi parolasını bu ekrandan sıfırlayamaz (403).
- [x] AC-6 — İK, İK veya CEO rolü atayamaz (403); seed ile gelen İK ve CEO hesapları giriş yapar; CEO hiçbir **iş** yazma ucuna erişemez (403) — kendi parolasını değiştirmesi self-servis olduğu için serbesttir. Seed ile gelen İK/CEO hesapları yönetim ekranından **pasife alınamaz ve parolaları sıfırlanamaz** (403 `PROTECTED_ACCOUNT`); bu hesaplar yalnız ortam değişkenleriyle yönetilir.
- [x] AC-7 — Oturumsuz korumalı uç 401, yetersiz rol 403, `/api/health` oturumsuz 200 döner; listede olmayan yeni bir uç varsayılan olarak kapalıdır.
- [x] AC-8 — Başarılı/başarısız giriş, çıkış, kullanıcı oluşturma, pasife alma ve parola sıfırlama için denetim kaydı oluşur; başarısız girişte e-posta maskelidir; hiçbir kayıtta parola (düz metin veya hash) yoktur.
- [x] AC-9 — Giriş, parola değiştirme, kullanıcılar ve 403 ekranlarının tüm görünür metinleri TR/EN katalogdan gelir; dil denetimi bu ekranlarda da çalışır.
- [x] AC-10 — Tarayıcı yolculuğu: kullanıcı giriş yapar, yetkisi olmayan kullanıcılar ekranına erişemez (403), çıkış yapar ve korumalı sayfa onu girişe yönlendirir.

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
