# Pubblicare redirect-guard (checklist per il maintainer)

Questo file e' una guida interna. Non e' incluso nel pacchetto npm (vedi `files` in
`package.json`). Esegui i comandi **nell'ordine**, dalla cartella del progetto:

```sh
cd /Users/alemanna/Desktop/Unicodeit/redirect-guard
```

Stato attuale (preparato senza login e senza pubblicare nulla):

- repository git locale su `main`, con i primi commit gia' fatti;
- identita' git **solo locale** al repo: `user.name = Unicodeit`,
  `user.email = unicodeit@users.noreply.github.com` (vedi il passo 2, va corretta);
- `npm test` 157/157 ok, `npm pack --dry-run` 54 file, 57.5 kB;
- il nome npm `redirect-guard` risultava libero (`npm view redirect-guard` -> 404) il
  2026-11-13. Ricontrollalo subito prima di pubblicare;
- GitHub CLI (`gh`) installata con Homebrew, **nessun login fatto**.

---

## 1. Login su GitHub

```sh
gh auth login            # GitHub.com -> HTTPS -> login con browser
gh auth status
GH_USER="$(gh api user -q .login)"   # il tuo nome utente reale
GH_ID="$(gh api user -q .id)"
echo "$GH_USER $GH_ID"
```

Se vuoi pubblicare sotto un'organizzazione GitHub (es. un'org "Unicodeit" creata da
te), imposta invece `GH_USER=<nome-org>` e usa `<nome-org>/redirect-guard` nel passo 4.

## 2. Correggere l'email dei commit (IMPORTANTE, prima del push)

Il nome utente GitHub `unicodeit` **appartiene gia' a un'altra persona** (account del
2010, non tuo). Quindi `unicodeit@users.noreply.github.com` farebbe comparire i commit
come scritti da quell'account. Sostituiscila con la *tua* email noreply di GitHub
(formato `ID+utente@users.noreply.github.com`, la trovi anche in
GitHub -> Settings -> Emails) e riscrivi i commit locali, che non sono ancora pubblicati:

```sh
git config user.email "${GH_ID}+${GH_USER}@users.noreply.github.com"
git rebase --root --exec "git commit --amend --no-edit --reset-author"
git log --format='%h %an <%ae> %s'
```

Consigliato: in GitHub -> Settings -> Emails attiva "Keep my email addresses private"
e "Block command line pushes that expose my email".

## 3. Sostituire il segnaposto OWNER con il nome utente reale

`OWNER` compare in `package.json` (`repository`, `homepage`, `bugs`), README, docs
(anche `docs/index.html` per GitHub Pages), User-Agent di default, link alla
documentazione delle regole, SECURITY/CODE_OF_CONDUCT e in un test.

```sh
grep -rl OWNER --exclude-dir=node_modules --exclude-dir=.git . \
  | xargs sed -i '' "s/OWNER/${GH_USER}/g"
grep -rn OWNER --exclude-dir=node_modules --exclude-dir=.git .   # deve essere vuoto
```

Dopo la sostituzione `package.json` conterra':

```json
"repository": { "type": "git", "url": "git+https://github.com/<GH_USER>/redirect-guard.git" },
"homepage": "https://github.com/<GH_USER>/redirect-guard#readme",
"bugs": { "url": "https://github.com/<GH_USER>/redirect-guard/issues" }
```

Se preferisci il sito GitHub Pages come homepage del pacchetto, cambia a mano
`homepage` in `https://<GH_USER>.github.io/redirect-guard/`.

Metti la data della release nel CHANGELOG (`## [0.1.0] - unreleased` ->
`## [0.1.0] - AAAA-MM-GG`), poi verifica e committa:

```sh
npm test && npm run typecheck
npm pack --dry-run
git add -A
git commit -m "Set repository owner and release date for v0.1.0" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## 4. Creare il repository pubblico e fare il push

```sh
gh repo create "${GH_USER}/redirect-guard" --public --source . --remote origin --push \
  --description "Test a site migration before Google does: check redirect maps and old sitemaps against the live site, from the CLI or CI."
```

## 5. Descrizione, homepage e topics del repo

```sh
gh repo edit "${GH_USER}/redirect-guard" \
  --homepage "https://${GH_USER}.github.io/redirect-guard/" \
  --add-topic redirects --add-topic seo --add-topic technical-seo \
  --add-topic site-migration --add-topic sitemap --add-topic robots-txt \
  --add-topic canonical --add-topic cli --add-topic ci --add-topic github-actions \
  --add-topic nodejs --add-topic 301-redirect \
  --enable-discussions=false --enable-wiki=false
```

Nelle impostazioni del repo (Settings -> Code security) abilita anche
"Private vulnerability reporting": `SECURITY.md` rimanda a quel modulo.

```sh
gh api -X PUT "repos/${GH_USER}/redirect-guard/private-vulnerability-reporting"
```

## 6. Abilitare GitHub Pages dalla cartella /docs

```sh
gh api -X POST "repos/${GH_USER}/redirect-guard/pages" \
  -f "source[branch]=main" -f "source[path]=/docs"
gh api "repos/${GH_USER}/redirect-guard/pages" -q .html_url
```

Dopo 1-2 minuti il sito e' su `https://<GH_USER>.github.io/redirect-guard/`.

## 7. Controllare che la CI sia verde PRIMA di pubblicare

La matrice (Linux, macOS, Windows, piu' versioni di Node) e gli SHA delle action non
sono mai stati eseguiti, perche' il repo non esisteva ancora.

```sh
gh run list --workflow ci.yml --limit 5
gh run watch            # attende la run in corso
```

Se una combinazione fallisce, correggi, committa e ripeti. Non pubblicare con CI rossa.

## 8. Pubblicare su npm (prima release, a mano)

```sh
npm view redirect-guard            # deve dare ancora 404
npm login                          # apre il browser; usa la 2FA
npm whoami
npm publish --dry-run --provenance=false
npm publish --access public --provenance=false
```

Perche' `--provenance=false`: in `package.json` c'e' `publishConfig.provenance: true`,
che funziona solo dentro GitHub Actions. Da un computer locale `npm publish` fallirebbe.
`prepublishOnly` esegue di nuovo test e typecheck prima dell'upload.

Verifica: `npm view redirect-guard` e `npx redirect-guard --version` (deve stampare 0.1.0).

## 9. Creare la release v0.1.0 su GitHub

Il workflow `.github/workflows/release.yml` parte al push di un tag `v*.*.*`: esegue i
test, controlla che il tag corrisponda alla versione di `package.json`, **salta
`npm publish` se la versione e' gia' su npm** (come dopo il passo 8) e crea la release
GitHub con il testo della sezione 0.1.0 del CHANGELOG.

```sh
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
gh run watch
gh release view v0.1.0
```

Alternativa senza workflow (solo se la run fallisce per motivi non legati al codice):

```sh
awk '/^## \[0.1.0\]/{f=1;next} f&&/^## \[/{exit} f' CHANGELOG.md > /tmp/notes.md
gh release create v0.1.0 --title v0.1.0 --notes-file /tmp/notes.md --verify-tag
```

## 10. Release successive con provenance (consigliato)

Per le versioni dopo la 0.1.0 conviene pubblicare solo dalla CI, con provenance:

1. su npmjs.com -> pacchetto `redirect-guard` -> Settings -> **Trusted publishing**:
   aggiungi GitHub Actions con repository `<GH_USER>/redirect-guard` e workflow
   `release.yml`. In alternativa crea un token "Automation" e salvalo con
   `gh secret set NPM_TOKEN`;
2. per ogni release: aggiorna CHANGELOG, `npm version patch|minor` (crea commit e tag),
   `git push --follow-tags`. Il workflow pubblica su npm e crea la release.

## Dopo la pubblicazione

- Controlla la pagina npm (README e logo dipendono dal campo `repository` corretto).
- Apri qualche issue "good first issue" vere con la roadmap (vedi `docs/limitations.md`).
- Pianifica `engines.node >= 22` nella prossima major (Node 20 e' fuori supporto).
- Candidatura Claude for Open Source: bozza in
  `/Users/alemanna/Desktop/Unicodeit/redirect-guard-candidatura-claude-oss.md`.
