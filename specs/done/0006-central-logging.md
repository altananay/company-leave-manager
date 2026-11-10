# Spec 0006 — Merkezi loglama (ELK)

- Status: Shipped
- Mode: lite
- Plan: `specs/plans/0006-plan.md`
- Self-critique: done
- Source: B-1 (`specs/backlog.md`; bootstrap 2026-11-07) + insan talebi (2026-11-10)
- Design: yok (altyapı)
- Supersedes: yok

## Intent

Bugün uygulama stdout'a yazıyor; Docker'ın `json-file` sürücüsü yerel olarak döndürüyor ve CI
günlükleri iş bitince kayboluyor. Operasyon ekibi "dün 14:00'te bu istek neden 500 aldı?" sorusunu
tek bir yerde arayamıyor. İsteğe bağlı bir **`logging` compose profili** ekliyoruz: aynı stdout'u
Elasticsearch'e taşıyan Filebeat, Kibana ve 30 günlük ILM ile. Varsayılan `docker compose up -d db`
+ host uygulama yolu **değişmiyor**; ELK yalnız profille açılıyor. Uygulama sözleşmesi iki modda da
**JSON (ECS) stdout**; loglarda kişisel veri/sır yok.

## Requirements

- **R-1** Varsayılan geliştirme yolu aynı kalır: `docker compose up -d db`, host uygulama, tam
  `./scripts/check` yeşil; profil açılmadan hiçbir ELK konteyneri başlamaz.
- **R-2** `DB_HOST_PORT=0 docker compose -p leave-manager-logging --profile logging up -d` yedi
  servisi ayağa kaldırır: beş uzun ömürlü (db, app, Elasticsearch, Kibana, Filebeat) + iki tek
  seferlik (`kibana-setup`, `filebeat-setup`); uygulama `/api/health` yanıtlar, Kibana açılır.
  Stack kendi compose projesinde çalışır (`leave-manager-logging`), dev veritabanına dokunmaz.
- **R-3** Uygulama her modda **JSON stdout** yazar (Spring Boot structured logging, ECS): zaman,
  seviye, logger, mesaj, servis adı; istek bağlamı varsa `requestId`. Kişisel veri/sır yok.
- **R-4** Filebeat uygulama konteynerinin stdout'unu Docker soketiyle okur, JSON'u çözer, Docker
  metadata'sı ekler ve Elasticsearch'e yazar; Kibana'da `filebeat-*` veri görünümüyle aranır.
- **R-5** ILM politikası logları **30 gün** saklar, sonra siler; politika/şablon stack açılışında
  **idempotent** uygulanır.
- **R-6** Doğrulama sözleşmesi ELK'a bağlı kalmaz: CI Elasticsearch başlatmaz; profilin compose
  yapılandırması konteynersiz doğrulanır (`docker compose --profile logging config -q`).
- **R-7** README, `docs/security.md` (saklama/PII) ve `.env.example` güncellenir; portlar
  `127.0.0.1`'e bağlanır, imaj sürümleri sabitlenir, `down -v` temizler.

## Acceptance criteria

- [x] AC-1 — Varsayılan yol: ELK profili kapalıyken `docker compose config` yalnız `db`'yi gösterir;
  host uygulama + `./scripts/check` (full) yeşil; ELK konteyneri yok.
- [x] AC-2 — `DB_HOST_PORT=0 docker compose -p leave-manager-logging --profile logging up -d` beş
  uzun ömürlü servisi (db, app, Elasticsearch, Kibana, Filebeat) sağlıklı başlatır ve iki tek
  seferlik setup'ı çalıştırır; uygulama `/api/health` 200; Kibana `127.0.0.1:5601` yanıtlar.
- [x] AC-3 — Uygulama stdout'u geçerli JSON (ECS) satırlarıdır; bir log satırı Kibana/ES'te
  `service.name: leave-manager` (ve mesaj metni) ile bulunur; satırda PII/sır yok.
- [x] AC-4 — ILM politikası 30 gün (`min_age: 30d`, `delete`); şablon/politika stack açılışında
  uygulanır ve ikinci açılışta hata vermez.
- [x] AC-5 — Profilin yapılandırması konteynersiz doğrulanır (check adımı; `check.conf` değişir →
  residue); CI ELK'sız yeşil kalır.
- [x] AC-6 — README (logging bölümü, bellek gereksinimi), `docs/security.md` (30 gün saklama, PII
  yasağı, yerel dev stack'in auth'suz olduğu notu) ve `.env.example` güncel.
- [x] AC-7 — İmajlar sabit sürümlü (9.x), portlar yalnız `127.0.0.1`, adlandırılmış volume'lar;
  `DB_HOST_PORT=0 docker compose -p leave-manager-logging --profile logging down -v` her şeyi siler
  (yalnız logging projesi; dev `db-data` sağlam); 5434/8080/e2e ile çakışma yok.

## Decisions

- **D-1 — Profil şekli.** ELK, isteğe bağlı `logging` profili; varsayılan yol değişmez. *Öneri:
  onayla.*
- **D-2 — Toplayıcı.** Filebeat (Docker autodiscover + soket, `decode_json_fields`,
  `add_docker_metadata`). Fluent Bit daha hafif ama Docker log ayrıştırması elle; Logstash ağır.
  *Öneri: Filebeat.*
- **D-3 — Sürümler.** Elasticsearch/Kibana/Filebeat **9.x**, tek bir yamaya sabitlenir (plan
  registry'den doğrular; `latest` yok). *Öneri: 9.x sabit.*
- **D-4 — Log biçimi.** Spring Boot'un yerleşik structured logging'i: `logging.structured.format.console: ecs`
  (yeni bağımlılık yok). *Öneri: ECS JSON, her profilde.*
- **D-5 — Saklama.** ILM 30 gün; politika/şablon açılışta idempotent uygulanır. *Öneri: 30 gün,
  Filebeat setup ya da tek seferlik `es-init`.*
- **D-6 — Doğrulama.** CI'da ELK yok; `docker compose --profile logging config -q` yeni bir check
  adımında (check.conf değişir; residue çalışır). *Öneri: yeni `logging-config` adımı.*
- **D-7 — Yerel güvenlik.** Yerel dev stack: `xpack.security.enabled=false`, portlar `127.0.0.1`;
  üretim için yönetilen ES/TLS/auth kapsam dışı. *Öneri: bu ayrımı README'de açık yaz.*
- **D-8 — PII.** Log satırlarında kişisel veri/sır yok; mevcut `docs/security.md` kuralları geçerli.
  *Öneri: aynen.*

## Out of scope

- Üretim ELK dağıtımı, kimlik doğrulama/TLS, çok düğümlü küme, yedekleme.
- Kibana'da özel dashboard/alert; ilk sürümde yalnız veri görünümü + arama.
- Uygulama log **içeriğinin** yeniden tasarımı (yalnız biçim/taşıma); yeni metrik/tracing.
- e2e ve CI'ın ELK ile çalıştırılması.

## Definition of Done

- [x] Her AC kanıta bağlı (test veya tekrarlanabilir gözlem)
- [x] `./scripts/check` (full) yeşil; `check.conf` değiştiği için `./scripts/residue` yeşil
- [x] Bağımsız inceleme; gerçek bulgular düzeltildi, gürültü gerekçeli reddedildi, defer'ler
  `specs/backlog.md`'de
- [x] README + `docs/security.md` güncel
- [x] Spec `specs/done/`'a taşındı

## Scorecard (fill at ship — honest numbers make the process improvable)

| Metric | Value |
|---|---|
| Spec revisions | 2 (R-4 `filebeat-*`; S1 proje/komut) |
| Fix rounds | 2 (review round 1, re-review round 1) |
| Review findings: real / noise / deferred | 12 / 1 / 0 (+2 kabul edilen Info: I-2, I-3) |
| Regressions introduced | 0 |
| Bugs escaped to production | 0 |
