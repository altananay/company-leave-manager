# Domain

## Ubiquitous language

| Term | Meaning | Notes / not to be confused with |
|---|---|---|
| Çalışan (Employee) | Şirkette çalışan, izin talebinde bulunan kişi | Yönetici de bir çalışandır |
| Yönetici (Manager) | Çalışanın org ağacındaki doğrudan üstü; talebin tek onay mercii | "Departman yöneticisi" değil — ağaçtaki doğrudan üst |
| İK (HR) | Kullanıcı/org yönetimi, bakiye düzeltmesi, raporlama | Onay yetkisi yok |
| CEO | Şirket geneli okuma ve raporlama | Onay/yazma yetkisi yok |
| İzin talebi (Leave request) | Tarih aralığı + izin türü + gerekçe içeren kayıt | Onaylanmış izinle karışmasın |
| İzin türü (Leave type) | Yıllık, hastalık, ücretsiz ve altı özel izin türü | — |
| Kıdem (Seniority) | İşe giriş tarihinden itibaren tam yıl | Kıdem tazminatı ile karışmasın |
| Hak dönemi (Entitlement period) | İşe giriş yıl dönümünde başlayan 12 aylık dönem | Takvim yılı ile karışmasın |
| Hak (Entitlement) | Hak dönemi için kazanılan yıllık izin günü (14/20/26) | Bakiye ile karışmasın |
| Bakiye (Balance) | Kullanılabilir kalan yıllık izin günü: toplam hak + İK düzeltmeleri − kullanılan | Dönemsel değil, kümülatif |
| Devir (Carryover) | Önceki dönemden aktarılan hak | Üst sınır yok |
| Kullanım penceresi (Validity window) | Hakkın kullanılabileceği son tarih aralığı | Yalnızca doğum günü izni (180 gün) |
| İş günü (Business day) | Hafta sonu ve resmî tatil dışındaki gün | Takvim günü ile karışmasın |
| Resmî tatil (Public holiday) | Türkiye resmî tatilleri | — |
| Onay / Red (Approved / Rejected) | Yöneticinin talebe verdiği karar | — |
| İptal (Cancellation) | Onaylanmış talebin geri alınması | Red ile karışmasın |
| Bakiye düzeltmesi (Adjustment) | İK'nın gerekçeli manuel düzeltmesi | Denetim kaydı üretir |
| Denetim kaydı (Audit event) | Yazma olayının kim/ne zaman/önce-sonra kaydı | Uygulama logu ile karışmasın |

## Business rules

- **BR-1** Yıllık izin hakkı kıdeme göre: 1–5 yıl **14**, 5–15 yıl **20**, 15 yıl ve üzeri **26
  iş günü**.
- **BR-2** Hak dönemi işe giriş yıl dönümünde başlar ve 12 ay sürer; ilk hak için 1 yıl fiili
  çalışma şartı vardır.
- **BR-3** Dönem sonunda kullanılmayan yıllık izin hakkının **tamamı** sonraki döneme devreder;
  üst sınır yok. Örnek: 14 gün haktan 4 gün kullanıldıysa 10 gün devreder. Devir **nettir**: önceki
  dönemlerin hakkından o dönemlerde kullanılan günler düşülür, kullanılmış bir gün sonraki dönemde
  ikinci kez teklif edilmez.
- **BR-4** İzin süresi **iş günü** olarak hesaplanır; hafta sonu ve resmî tatiller düşülür. Yarım gün
  (`AM`/`PM`) yalnızca **tek günlük** `ANNUAL`/`EXCUSE` talebinde seçilebilir ve o gün iş günüyse
  **0,5 iş günü** sayılır; birden çok güne, başka bir türe veya iş günü olmayan bir güne yarım gün
  geçersizdir.
- **BR-5** Talep kalan bakiyeyi aşamaz; kontrol hem talep anında hem onay anında yapılır.
- **BR-6** Aynı çalışanın tarih aralıkları çakışan iki aktif talebi olamaz.
- **BR-7** Onayı yalnızca **doğrudan yönetici** verir; İK ve CEO onaylayamaz, çalışan kendi
  talebini onaylayamaz.
- **BR-8** Onaylanan talep bakiyeden düşer; reddedilen düşmez. Onaylı talep, başlangıç tarihi
  gelmeden iptal edilirse bakiye geri yüklenir; başlamış talebin düzeltmesi İK'nın kayıtlı
  düzeltmesidir.
- **BR-9** Yalnızca yıllık izin bakiye kullanır; diğer tüm türler bakiyesizdir.
- **BR-10** Özel izin süreleri (hepsi iş günü, hepsi bakiyesiz):

  | Tür | Süre | Koşul |
  |---|---|---|
  | Evlilik | 5 | — |
  | Vefat | 5 | Eş, çocuk, anne, baba, kardeş |
  | Eş doğumu | 5 | — |
  | Karne | 1 | İzni alan çalışanın okul çağında çocuğu olması; yılda 1 gün toplam |
  | Doğum günü | 1 | Doğum gününde hak kazanılır; **180 gün** içinde kullanılmalı, sonunda düşer |
  | Okulun ilk günü | 1 | İzni alan çalışanın okul çağında çocuğu olması; yılda 1 gün toplam |

- **BR-11** Başlangıcı geçmişte kalan talep açılamaz; istisna yalnızca İK'nın gerekçeli kaydıdır.
- **BR-12** Görünürlük: çalışan yalnızca kendi taleplerini, yönetici kendi alt ağacını, İK ve CEO
  şirket genelini görür. Onay yetkisi yalnızca doğrudan yöneticidedir.
- **BR-13** Her yazma işlemi (talep, karar, iptal, bakiye düzeltmesi, kullanıcı/rol/departman
  değişikliği) bir denetim kaydı üretir: kim, ne zaman, ne, önce/sonra.
- **BR-14** Belge/dosya yükleme yoktur; hastalık izninde çalışan rapor tarih ve süresini girer.

## Key domain invariants

- Bakiye hiçbir zaman negatif olamaz — bakiye düzeltmesinde olduğu gibi **İK'nın işe giriş tarihi
  düzenlemesinde de**: bakiyeyi eksiye düşürecek bir tarih reddedilir ve satır değişmez.
- İzin, çalışanın işe giriş tarihinden önce başlayamaz; İK'nın geçmiş tarihli kaydı da bu sınırın
  dışında değildir ve işe giriş tarihi sonradan düzenlense de kural korunur (aktif bir iznin
  başlangıcından sonraya taşınamaz).
- Bir talep aynı anda tek durumdadır: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`.
- Onaylanmış talebin tarihleri değiştirilemez; değişiklik = iptal + yeni talep.
- Aynı çalışanın çakışan iki aktif talebi olamaz.
- Kişisel veri uygulama loguna yazılmaz; yalnızca kimlik (UUID) taşınır.

## Sensitive areas

- **Kişisel veri (KVKK)** — ad, e-posta, doğum tarihi, izin geçmişi, hastalık izni (sağlık verisi)
  ve çocuk bilgisi. Bir spec bu alana dokunuyorsa `Constraints` bölümünde
  `Sensitive area: Kişisel veri` yazar.
- **Yetkilendirme** — kimin hangi çalışanın verisini gördüğü ve kimin onaylayabildiği. Bir spec
  bu alana dokunuyorsa `Constraints` bölümünde `Sensitive area: Yetkilendirme` yazar.
