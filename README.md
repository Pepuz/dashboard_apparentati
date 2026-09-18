# dashboard_apparentati

Dashboard di casa (presenze a pranzo e cena, turni pulizia) mostrata su una TV LG webOS e alimentata da un'app Android. Supabase è l'unico datastore condiviso, nessun backend proprio. Specifiche: [docs/PRD.md](docs/PRD.md), [docs/PRP.md](docs/PRP.md).

## Struttura

- `supabase/migrations/` — schema e policy RLS (Fase 0)
- `tv-app/` — app webOS, sola lettura (Fase 1)
- `scripts/hermes/` — script Python di rinnovo Developer Mode (Fase 2)
- `mobile-app/` — app Android Flutter (Fase 3)

## Fase 0 — passi manuali prima della Fase 1

1. **Crea il progetto su [supabase.com](https://supabase.com)**, piano Free. Conserva la password del database in un password manager, mai nel repo.

2. **Esegui le migrazioni dal SQL Editor** del progetto, in quest'ordine, incollando ed eseguendo il contenuto di ciascun file:
   1. `supabase/migrations/20260915000000_initial_schema.sql`
   2. `supabase/migrations/20260915000001_rls_policies.sql`
   3. `supabase/migrations/20260916000000_active_flags.sql`
   4. `supabase/migrations/20260916000001_meal_presence.sql`

3. **Popola a mano `roommates` e `cleaning_tasks`**, dal Table Editor oppure dal SQL Editor (che gira con un ruolo privilegiato, quindi non è bloccato dalla RLS). Esempio, con i nomi dei coinquilini da sostituire:

   ```sql
   insert into roommates (name) values ('Nome 1'), ('Nome 2');
   insert into cleaning_tasks (name, sort_order) values
     ('Sala', 1), ('Camera 1', 2), ('Camera 2', 3), ('Bagno 1', 4),
     ('Bagno 2', 5), ('Cucina', 6), ('Pavimenti e polveri mensole', 7);
   ```

   `meal_presence` e `cleaning_shifts` restano vuote: le riempie l'app. Chi lascia la casa non si cancella, si imposta `active = false`.

4. **Copia URL e publishable key nel tuo `.env` locale:**

   ```powershell
   Copy-Item .env.example .env
   ```

   Compila `SUPABASE_URL` (`https://<project-ref>.supabase.co`, il ref è nell'indirizzo della dashboard dopo `/project/`) e `SUPABASE_PUBLISHABLE_KEY` (Project Settings → API Keys, inizia con `sb_publishable_`). Non usare le chiavi legacy `anon`/`service_role`, in dismissione entro fine 2026, e **mai** la *secret key*: bypassa la RLS e non deve finire in nessuna app né nel repo. `.env` è già escluso da `.gitignore`.

**Checkpoint Fase 0 (dal PRP):** dalla dashboard web di Supabase riesci a leggere e scrivere righe di test. Solo dopo si passa alla Fase 1.

## Fase 1 — passi manuali

L'app TV è in `tv-app/`: HTML e JS senza dipendenze, legge Supabase via REST ogni 20 s e non scrive mai. Riferimento ufficiale LG: [Developer Mode](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app), [CLI](https://webostv.developer.lge.com/develop/tools/cli-dev-guide).

### A. Prova nel browser del PC

1. **Genera la config dal `.env`:**

   ```powershell
   pwsh -File tv-app/make-config.ps1
   ```

   Se va a buon fine non stampa nulla e crea `tv-app/config.js`, git-ignorato. Rifiuta chiavi che non iniziano con `sb_publishable_`.

2. **Apri `tv-app/index.html`** con doppio clic (Chrome o Edge). Devi vedere: la data di oggi in alto; Pranzo e Cena con ogni coinquilino attivo (presente / assente / non specificato, orario, ospiti, nota); i turni della settimana corrente in ordine di area; in basso `Aggiornato alle HH:MM:SS`, `Screensaver: WebOSServiceBridge non disponibile (normale fuori dalla TV)` e `Codice: remoto` (oppure `Codice: copia locale` finché GitHub Pages non è attivo, sezione G).

3. **Confronta con Supabase** (Table Editor): `meal_presence` con `date` = oggi, `cleaning_shifts` con `week_start` = lunedì di questa settimana.

4. **Modifica una riga** dal Table Editor senza toccare la pagina: entro circa 20 s la pagina cambia.

5. **Premi Invio** (sulla TV: OK): la settimana successiva compare o sparisce.

Controllo della logica di date e testi, senza rete:

```powershell
node tv-app/app.test.js
```

### B. Developer Mode sulla TV

1. Crea un account sul sito [LG Developer](https://webostv.developer.lge.com): la Developer Mode richiede quello, non basta l'account LG della TV.
2. Sulla TV premi **Home**, apri lo store (**Apps** sui modelli recenti, **LG Content Store** sui più vecchi), cerca `Developer Mode` e installala.
3. Aprila, accedi con l'account LG Developer e attiva **Dev Mode Status**: la TV si riavvia.
4. Riapri Developer Mode: annota l'indirizzo IP mostrato e attiva **Key Server**.

Alla scadenza della sessione Developer Mode le app installate così vengono disinstallate (doc LG). Solo da fonte community ([webosbrew](https://www.webosbrew.org/devmode/)): un account LG Developer resta collegato a una sola TV alla volta, e il Key Server si spegne quando la TV si riavvia.

### C. ares-cli sul PC

1. Controlla Node: `@webos-tools/cli` 3.2.6 richiede Node 20 o successivo (campo `engines` del pacchetto npm; la pagina di installazione LG indica ancora 14.15.1–16.20.2, superata).

   ```powershell
   node --version
   ```

2. Installa e verifica il CLI:

   ```powershell
   npm install -g @webos-tools/cli
   ares -V
   ```

3. Registra la TV (sostituisci l'IP con quello annotato al passo B4):

   ```powershell
   ares-setup-device --add tv -i "host=192.168.1.50" -i "port=9922" -i "username=prisoner"
   ```

4. Scarica la chiave: il comando chiede la passphrase di 6 caratteri mostrata sulla TV (maiuscole e minuscole contano).

   ```powershell
   ares-novacom --device tv --getkey
   ```

5. Verifica la connessione e leggi modello e firmware:

   ```powershell
   ares-device --device tv --system-info
   ```

### D. Pacchetto, installazione, avvio

Dalla root del repo. Il file `.ipk` viene creato nella root ed è git-ignorato; contiene la publishable key, che è pubblica per design.

```powershell
pwsh -File tv-app/make-config.ps1
ares-package tv-app -e "app.test.js" -e "make-config.ps1" -e "config.example.js"
ares-install --device tv com.apparentati.dashboard_0.2.0_all.ipk
ares-launch --device tv com.apparentati.dashboard
```

Poi, senza toccare la TV: i dati devono essere gli stessi del browser, e una riga modificata dalla dashboard Supabase (Table Editor o SQL Editor) deve comparire entro 30 s.

Se la pagina resta vuota, `ares-inspect --device tv --app com.apparentati.dashboard` apre i DevTools (serve un Chromium compatibile con la versione webOS della TV).

### E. Osservazione screensaver (facoltativa)

L'app TV è un'app normale, aperta quando serve: lo screensaver non blocca la Fase 1, si osserva e basta.

1. La data in alto nella dashboard è quella giusta (se no, correggi il fuso orario della TV).
2. Apri la dashboard, annota l'ora di inizio e il testo esatto della riga `Screensaver:` in basso.
3. Lasciala aperta senza toccare telecomando, app ThinQ o sorgenti HDMI, per quanto ti è comodo: un utente del forum LG lo vedeva comparire dopo circa 45 minuti.
4. Annota: se e dopo quanti minuti compare lo screensaver (o lo schermo diventa nero), il testo della riga `Screensaver:` e l'orario di `Aggiornato alle`.
5. Se nell'uso reale lo screensaver dà fastidio, c'è il piano del video in loop (PRP §5), pronto ma non implementato.

### F. Sideload da un PC diverso da quello di sviluppo

`ares-cli` si collega alla TV sulla porta 9922 del suo indirizzo IP, quindi serve un computer sulla stessa rete della TV. Se non è il PC dove sviluppi, la procedura completa e autosufficiente sta in [docs/sideload-tv.md](docs/sideload-tv.md): basta portare quel file e il `.ipk`, senza repo.

### G. Aggiornare l'app senza sideload (GitHub Pages)

L'app installata è un guscio: all'avvio carica `tv-app/app.js` da `https://pepuz.github.io/dashboard_apparentati/tv-app/app.js` e, se non ci riesce, usa la copia inclusa nel pacchetto. La riga `Codice:` in basso dice quale sta usando. GitHub Pages è gratuito per i repo pubblici con GitHub Free ([doc GitHub](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)); il repo pubblicato non contiene chiavi, perché `tv-app/config.js` è git-ignorato e resta solo nel pacchetto.

Una volta sola:

1. Su github.com, in alto a destra, **+** → **New repository**. Owner: il tuo account; nome `dashboard_apparentati`; visibilità **Public**; nessun README, `.gitignore` o licenza, perché il repo esiste già in locale. Poi **Create repository**.

2. Collega il repo locale e pubblicalo:

   ```powershell
   git remote add origin https://github.com/Pepuz/dashboard_apparentati.git
   ```

   ```powershell
   git push -u origin master
   ```

3. Nel repo su GitHub: **Settings** → nella barra laterale, sezione **Code, planning, and automation**, **Pages** → sotto **Build and deployment**, in **Source** scegli **Deploy from a branch** → nel menu del branch scegli `master` e in quello della cartella la radice del repo → **Save**.

4. Quando la pubblicazione è finita (la doc non dice quanto ci vuole), l'indirizzo `https://pepuz.github.io/dashboard_apparentati/tv-app/app.js` aperto nel browser mostra il codice.

5. Un ultimo sideload del pacchetto 0.2.0 (sezione D, o F da un altro PC). Sulla TV la riga in basso deve dire `Codice: remoto`.

A ogni aggiornamento successivo:

1. Modifica `tv-app/app.js`, esegui `node tv-app/app.test.js` e prova nel browser (sezione A).
2. Commit e push su `master`.
3. Sulla TV chiudi e riapri l'app.

Un nuovo sideload serve ancora per modifiche a `index.html`, `appinfo.json` o `config.js` (URL o chiave), o per cambiare l'indirizzo da cui si carica il codice.

**Checkpoint Fase 1 (dal PRP):** dati corretti nel browser e sulla TV, una modifica da Supabase compare sulla TV entro 30 s senza toccarla. L'osservazione dello screensaver è facoltativa.

## Licenza

MIT, vedi [LICENSE](LICENSE).
