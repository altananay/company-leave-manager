# Company Leave Manager

Şirket içi izin yönetimi — 1.000+ çalışan için izin talebi, onay ve bakiye takibi.
Java 25 + Spring Boot 4.1.2 API, PostgreSQL 18 ve React 19 + Vite 8 SPA (tek origin).

## Önkoşullar

- **Java 25** (LTS)
- **Node 24** (LTS) + npm
- **Docker** (compose)
- **Playwright Chromium** — e2e için bir kez: `npm --prefix web exec playwright install chromium`

## Hızlı başlangıç

```bash
cp .env.example .env            # Docker Compose bu dosyayı okur (uygulama okumaz — aşağıya bak)
docker compose up -d db         # PostgreSQL 18 (host portu: .env'deki DB_HOST_PORT)
./mvnw spring-boot:run          # API: http://localhost:8080
npm --prefix web run dev        # SPA: http://localhost:5173 (/api → :8080 proxy)
```

> Uygulama `.env` dosyasını okumaz; veritabanı ayarları ve ilk hesaplar **ortam değişkeni** olarak
> verilir: `DB_URL`, `DB_USER`, `DB_PASSWORD`, `SEED_HR_EMAIL`, `SEED_HR_PASSWORD`,
> `SEED_CEO_EMAIL`, `SEED_CEO_PASSWORD`. Seed her hesap için yalnızca o e-posta yoksa çalışır ve en
> az 12 karakterlik parola ister; değişkenler verilmezse uygulama açılır ama kimse giriş yapamaz.
> Örnek (Git Bash):
>
> ```bash
> SEED_HR_EMAIL=hr@example.test SEED_HR_PASSWORD=change-this-hr-password \
> DB_URL=... ./mvnw spring-boot:run
> ```

Sağlık kontrolü: `curl http://localhost:8080/api/health` → `{"status":"UP"}`

## Doğrulama

```bash
./scripts/check          # full: build + birim + entegrasyon + bileşen + lint + e2e (tek kanıt)
./scripts/check --fast   # iç döngü: build + birim + bileşen + lint
```

Full check e2e için Docker ve Playwright Chromium ister; `scripts/e2e` veritabanını kendi compose
projesinde açar ve her durumda kapatır.

## Yapı

| Yol | Ne |
|---|---|
| `src/main/java/com/company/leavemanager/` | Spring Boot API — modüler monolit, 6 modül (`docs/architecture.md`) |
| `src/main/resources/db/migration/` | Flyway migration'ları |
| `web/` | React + Vite SPA (TR/EN) |
| `scripts/check.conf` | Doğrulama adımları |
| `docs/` | Mimari, domain, konvansiyonlar, test, güvenlik, git |
| `specs/` | Spec'ler, planlar, backlog |
| `AGENTS.md` | Ajan kuralları ve işaretçiler |

## Dokümanlar

- [Mimari](docs/architecture.md) · [Domain ve iş kuralları](docs/domain.md) · [Konvansiyonlar](docs/conventions.md)
- [Test kuralları](docs/testing.md) · [Güvenlik](docs/security.md) · [Git](docs/git.md)
- [Komutlar](docs/commands.md) · [Kararlar (ADR)](docs/decisions/)

## Workspace

Bu depo **ANEW v1.24.1** çalışma alanı üzerine kuruludur: süreç, kapılar ve doğrulama kontratı
`AGENTS.md`, `workflows/`, `prompts/` ve `scripts/` altındaki ANEW çekirdeğindedir.
