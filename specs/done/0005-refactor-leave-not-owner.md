# Spec 0005 — LEAVE_NOT_OWNER ölü kod temizliği (mini)

- Status: Shipped
- Mode: lite
- Plan: `specs/plans/0005-plan.md`
- Self-critique: done
- Source: B-9 (`specs/backlog.md`; spec 0004 review round 3, L-22)
- Design: yok
- Supersedes: yok

## Intent

`LEAVE_NOT_OWNER` sabiti ve SPA eşlemesi var ama hiçbir uç onu döndürmüyor: kapsam dışı bir iptal
isteği sahiplik kapısına değil kapsam kuralına takılıp **404** alıyor (spec 0004 review round 3,
L-22), yani 403'lük bir sahiplik yolu kalmadı. Ölü sabiti, eşlemeyi ve `docs/conventions.md`
listesindeki satırı kaldırıyoruz; hata kataloğu API'nin gerçekten döndürebildiği kodlarla eşleşsin.
Kullanıcıya görünen davranış değişmiyor.

## Changed behavior

- [x] CB-1 — none — no observable behavior change

## Preserved behavior

- [x] PB-1 — API'nin döndürebildiği her izin kodu SPA'da mesaja eşlenmeye devam eder;
  `LEAVE_NOT_MANAGER` → `leaveNotManager` eşlemesi (silinen case'in fallthrough komşusu) bozulmaz.
- [x] PB-2 — Kapsam dışı iptal isteği **404** alır (L-22); kaldırma 403'lük bir sahiplik yolu geri
  getirmez.
- [x] PB-3 — `docs/conventions.md`'deki izin kodu listesi `LeaveError` sabitleriyle birebir kalır;
  yalnız `LEAVE_NOT_OWNER` çıkar, başka kod düşmez.

## Out of scope

- Başka hata kodu, uç, mesaj veya davranış değişmez; yeni bir sahiplik yolu eklenmez.
- `LEAVE_NOT_MANAGER`'ın `leaveNotManager` mesajı ve `NOT_FOUND`/`NOT_AUTHORIZED` ortak kodları
  olduğu gibi kalır.
- B-9 backlog kaydı kapatma commit'inde silinir (backlog kuralı).

## Definition of Done

- [x] `scripts/check` green
- [x] Independent review done; real findings fixed, noise rejected with written rationale, deferred
  ones in `specs/backlog.md`
- [x] Criterion ↔ evidence table complete for CB-* and PB-* (UI değişikliği yok → görsel yok)
- [x] Spec moved to `specs/done/` (immutable there)
