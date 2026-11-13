<p align="center">
  <img src="docs/assets/logo.svg" width="88" height="88" alt="">
</p>

<h1 align="center">redirect-guard</h1>

<p align="center">
  Verifica la migrazione del sito prima che lo faccia Google.<br>
  Controlla una mappa di redirect o la vecchia sitemap sul sito live e trova 301 rotti,
  catene, loop e pagine di destinazione non indicizzabili. Da terminale o in CI.
</p>

English version: [README.md](README.md)

---

Quando un sito viene rifatto o cambia dominio, i vecchi URL si rompono senza far rumore:
un redirect mancante, un 302 al posto di un 301, una catena di tre salti, un redirect che
porta a una pagina `noindex`. Il danno si vede settimane dopo in Search Console.
redirect-guard controlla ogni vecchio URL prima e dopo il lancio e fa fallire la build se
qualcosa non va.

## Avvio rapido

```sh
# redirects.csv:  from,to
#                 /chi-siamo,/about
#                 /servizi/seo,/services/seo
npx redirect-guard redirects.csv --base https://www.example.com
```

Non hai una mappa? Usa la sitemap salvata dal vecchio sito:

```sh
npx redirect-guard --sitemap vecchia-sitemap.xml --base https://www.example.com
```

Serve Node.js 20.3 o successivo. Nessuna installazione e nessuna dipendenza a runtime.

Exit code: `0` nessun errore, `1` errori trovati, `2` errore di uso, configurazione o input.
Gli avvisi (warning) non fanno fallire l'esecuzione, a meno di usare `--strict`.

## Cosa controlla

| Area | Regole |
|---|---|
| Redirect | `no-redirect`, `status-not-permanent`, `wrong-destination`, `redirect-loop`, `too-many-redirects`, `chain-too-long`, `trailing-slash-hop` |
| Destinazione | `target-not-ok`, `target-noindex`, `canonical-mismatch`, `robots-blocked`, `robots-unreachable`, `unexpected-status` (per pagine rimosse di proposito) |
| Migrazione | `redirect-to-homepage`, `redirect-collapse`, `query-dropped`, `protocol-inconsistent`, `host-inconsistent` |
| Diff sitemap | `orphan-url`, `sitemap-url-redirects`, `sitemap-url-not-indexable` |
| Rete | `request-failed` (DNS, TLS, timeout dopo i tentativi) |

Dettagli su ogni regola (perché conta, come si corregge, come si disattiva):
[docs/rules.md](docs/rules.md) (in inglese).

Nel CSV sono riconosciuti i separatori `,` `;` e tab (anche gli export di Excel in italiano).
Lascia `to` vuoto e metti `410` (o `404`) per le pagine eliminate di proposito.

## Test su staging prima del cambio DNS

```sh
STAGING_AUTH="utente:password" npx redirect-guard redirects.csv \
  --host-rewrite https://www.example.com=https://staging.example.com \
  --auth-env STAGING_AUTH
```

I report continuano a mostrare gli URL di produzione. Le credenziali vengono inviate
**solo** agli host che stai testando: un redirect verso un dominio esterno non le riceve mai.

## In CI

```yaml
- name: Controllo redirect
  run: >
    npx redirect-guard@0 redirects.csv --base "$PREVIEW_URL"
    --reporter text --reporter markdown:rg.md --reporter junit:rg.xml
- name: Riepilogo
  if: always()
  run: cat rg.md >> "$GITHUB_STEP_SUMMARY"
```

Workflow completo: [examples/github-actions.yml](examples/github-actions.yml) e
[docs/ci.md](docs/ci.md).

## Limiti

- Legge l'HTML grezzo: un `noindex` o un canonical inseriti via JavaScript non vengono visti.
- Le protezioni anti-bot (WAF, challenge) possono rispondere 403 ai client non browser.
  Metti in allowlist il runner o testa su staging. redirect-guard non prova mai ad aggirarle.
- Controlla gli URL che gli fornisci, non fa crawling.

Altro: [docs/limitations.md](docs/limitations.md).

Configurazione, API programmatica e contributi: vedi [README.md](README.md),
[docs/configuration.md](docs/configuration.md) e [CONTRIBUTING.md](CONTRIBUTING.md).

## Licenza

MIT © 2026 Unicodeit. Vedi [LICENSE](LICENSE).
