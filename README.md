# Research Studio

Víceagentní výzkumný asistent. Ze zadání uživatele postupně vytvoří závěrečnou zprávu ve čtyřech fázích, z nichž každou zpracovává samostatný agent s vlastní rolí:

1. **Gateway** — rozpracuje zadání do briefu: cíl, publikum, rozsah, výzkumné otázky a vyhledávací dotazy.
2. **Research** — hledá na webu přes serverový nástroj OpenRouteru `openrouter:web_search` a sepíše nálezy se zdroji.
3. **Super analytik** — nálezy vyhodnotí podle vlastní metodiky (skillu).
4. **Writer** — sestaví závěrečnou zprávu z analýzy a původních nálezů.

Každá fáze dostane původní zadání a výstup předchozí fáze. Průběh, výstupy jednotlivých agentů i výsledná zpráva jsou průběžně vidět v dashboardu.

Aplikace nemá žádné závislosti, používá jen Node.js a jeho standardní knihovnu (`node:http`, `node:sqlite`, `fetch`).

## Funkce

- **Příprava zadání v chatu s analytikem.** Rozhovor pomůže zadání upřesnit (nejvýše 10 výměn). Návrh lze převzít do formuláře a ručně upravit. Výzkum se spustí tlačítkem nebo jednoznačným příkazem v chatu (např. „rovnou začni“).
- **Přílohy.** Soubory TXT, MD a CSV, celkem do 25 000 znaků. Obsah příloh se agentům předává jako data, ne jako instrukce.
- **Dashboard výzkumu.** Každý běh má vlastní adresu `/research/<id>`. Detail obsahuje pipeline čtyř agentů se stavem fází, závěrečnou zprávu, rozbalovací výstupy agentů, časovou osu skutečných událostí a statistiky fází (čas, model, tokeny a cena podle OpenRouteru).
- **Přehled výzkumů.** Uložené běhy přežijí restart. Rozpracovaný běh se po restartu označí jako přerušený a znovu se automaticky nespouští.
- **Vlastní skilly.** Metodiky v `skills/*/SKILL.md` se vkládají do systémové zprávy příslušné fáze.
- **Vstupní brána (volitelná).** Pokud je nastavené `APP_PASSWORD`, aplikace vyžaduje přihlášení jménem a heslem. Relace je podepsaná cookie (HMAC, `HttpOnly`, `SameSite=Lax`, platnost 12 hodin). Po 10 neúspěšných pokusech z jedné IP adresy se přihlášení na 15 minut zablokuje.
- **Auditní log.** SQLite databáze `data/audit.db` zaznamenává čas, IP adresu, jméno uživatele a akci: přihlášení (úspěšné, neúspěšné, zablokované), zprávy v chatu, spuštění výzkumu (téma, cíl, publikum, rozsah) a jeho výsledek včetně ceny.

## Spuštění

Požadavky: **Node.js 22.19+** a klíč [OpenRouteru](https://openrouter.ai/keys) s kreditem.

```bash
cp .env.example .env        # vyplňte alespoň OPENROUTER_API_KEY
node --env-file=.env --use-system-ca server.mjs
```

Nebo bez souboru `.env`:

```powershell
$env:OPENROUTER_API_KEY = 'váš-klíč'
npm start
```

Aplikace poběží na http://127.0.0.1:3000. Bez `APP_PASSWORD` se spustí bez přihlášení, což je vhodné jen pro lokální použití.

Testy: `npm test`

### Proměnné prostředí

| Proměnná | Význam | Výchozí |
|---|---|---|
| `OPENROUTER_API_KEY` | Klíč OpenRouteru (povinný) | — |
| `OPENROUTER_MODEL` | Model pro všechny fáze | `openrouter/auto` |
| `APP_PASSWORD` | Heslo vstupní brány; prázdné = bez přihlášení | — |
| `BASE_PATH` | Cesta, pod kterou aplikaci publikuje reverzní proxy (např. `/research/`) | `/` |
| `APP_ORIGIN` | Veřejný origin (např. `https://example.com`); povolí požadavky z této domény a zapne `Secure` cookie | — |
| `HOST` / `PORT` | Adresa a port serveru | `127.0.0.1` / `3000` |

## Nasazení za reverzní proxy

Aplikace se připojuje pouze k adrese z `HOST` a předpokládá, že před ní stojí reverzní proxy s TLS (např. nginx). Při veřejném nasazení:

- nastavte `APP_PASSWORD` (silné heslo), `APP_ORIGIN` a případně `BASE_PATH`,
- proxy musí předávat skutečnou IP klienta v hlavičce `X-Real-IP`, jinak audit zaznamená adresu proxy,
- doporučený `proxy_read_timeout` je alespoň 400 s a `client_max_body_size` 1 MB,
- složku `data/` chraňte, protože obsahuje zadání, přílohy, výstupy a auditní log.

Příklad pro nginx:

```nginx
location ^~ /research/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 400s;
    client_max_body_size 1m;
}
```

## API

Všechny endpointy vyžadují přihlášení, pokud je brána zapnutá.

- `GET /api/jobs` — souhrny běhů pro přehled (bez výstupů a příloh).
- `GET /api/jobs/<id>` — celý běh včetně výstupů agentů, událostí a statistik.
- `POST /api/jobs` — spustí výzkum, vrátí `{id}`.
- `POST /api/brief-chat` — jedna výměna s analytikem při přípravě zadání.

POST požadavky musí mít `Content-Type: application/json` a pocházet z localhostu nebo z `APP_ORIGIN`.

## Struktura

- `server.mjs` — HTTP server, validace, API a orchestrace agentů (`run`, `callModel`).
- `gate.mjs` — vstupní brána, podepsané relace, omezení pokusů a auditní log.
- `public/` — dashboard (HTML, CSS, JavaScript bez frameworku) a logo.
- `skills/` — metodiky pro agenty Research, super analytik a writer.
- `test*.mjs` — testy orchestrace, API, brány a vykreslení (`node --test`).
- `data/` — vzniká za běhu (`jobs.json`, `audit.db`) a není součástí repozitáře.

## Bezpečnost a omezení

- Zadání a přílohy se odesílají do OpenRouteru a dál k poskytovatelům modelů. Neposílejte citlivá data.
- Webové vyhledávání a modely jsou placené. Aplikace nemá výdajový limit, ten nastavte přímo u klíče v OpenRouteru.
- Počet odkazů je počet unikátních URL ve výstupu, nikoli nezávisle ověřené zdroje. Výstupy modelu je třeba zkontrolovat.
- Vstupy se při vykreslení escapují; Markdown výstupů se převádí na omezenou sadu HTML prvků.
- Klíč API zůstává na serveru a do prohlížeče se nikdy neposílá.

Bezpečnostní problém prosím nahlaste soukromě přes GitHub Security Advisories, ne veřejným issue.
