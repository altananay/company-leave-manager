# Backlog — deferred findings

Findings a human triaged as **defer**: real, but fixed later by decision (`workflows/feature-development.md`,
step 7). Nothing lands here without that decision; noise is rejected in the triage record, not parked here.

- A criterion moved out at the ship gate (R-08, `→ moved to B-<n>`) lands here too, by the
  human's ship decision; the entry names the spec and criterion.
- One entry per finding, newest last. Delete the entry in the commit of the work that closes it.
- An entry that grows into new behavior becomes a spec (`specs/active/`), not a fix.

<!-- Format (labels stay English):
- **B-<n>** — <finding, one line> — Source: spec <NNNN>, review round <n> (<file:line>) — Severity: <…>
  — Recommendation: <the reviewer's action> — Deferred by: <name>, <YYYY-MM-DD>, <why>
  A decision deferred at bootstrap (its REPORT) uses Source: bootstrap <YYYY-MM-DD>.
-->

- **B-1** — Merkezi log platformu: ELK (Elasticsearch + Kibana + toplayıcı) bu projeye kurulsun mu, yoksa stdout + Docker log rotation yeterli mi? — Source: bootstrap 2026-11-07 — Severity: low (operational) — Recommendation: V1 stdout + rotation ile ilerlesin; ELK ayrı bir altyapı spec'i olarak, docker-compose'da opsiyonel `logging` profiliyle eklensin (uygulama sözleşmesi iki durumda da JSON stdout; ILM ile 30 gün saklama). — Deferred by: human, 2026-11-07, bir sonraki oturumda değerlendirilecek.

- **B-2** — Health ucunun 2 sn sınırı ölçülmüyor: `HealthDownIT` yalnız bağlantı reddi yolunu görüyor, yavaş/askıda bir veritabanında süre sınırı kanıtsız. — Source: spec 0001, review round 1 (`src/test/java/com/company/leavemanager/health/HealthDownIT.java:37`) — Severity: low — Recommendation: ağ hatası enjeksiyonu (toxiproxy ya da geciktirici proxy) ile süre ölçen bir test ekle; ölçüm kararsızsa Hikari `connection-timeout` değerini açıkça assert et. — Deferred by: altananay, 2026-11-07, test altyapısına proxy eklemek ayrı bir iş.

- **B-5** — Testcontainers 2.x'e geçiş: Boot 4.1.2 BOM'u `testcontainers-bom:2.0.5` import ediyor; proje eski `postgresql`/`junit-jupiter` koordinatlarında 1.21.4'e sabit. — Source: spec 0001, review round 1 (`pom.xml:25`) — Severity: low — Recommendation: `testcontainers-postgresql` / `testcontainers-junit-jupiter` 2.0.5 koordinatlarına geç, sürüm pinini kaldır. — Deferred by: altananay, 2026-11-07, ayrı ve izlenebilir bir bağımlılık değişikliği.


