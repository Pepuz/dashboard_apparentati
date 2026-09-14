# PRP — Dashboard Appartamento (`flat-dashboard`)

Versione: 0.1 (bozza iniziale, da rivedere prima di dare il via alla build)
Riferimento: PRD.md nello stesso progetto
Data: 2026-09-14

Questo documento descrive **come** costruire quanto definito nel PRD: architettura, stack, data model, fasi di lavoro, criteri di accettazione e rischi noti. È pensato per essere dato in pasto a Claude Code come contesto di partenza per l'implementazione, non come specifica immutabile: ogni fase termina con un checkpoint in cui va verificato con l'uso reale prima di passare alla successiva.

## 1. Architettura generale

```
[App Android, coinquilini]  --scrive-->  [Supabase: Postgres + Realtime]  --legge/si iscrive-->  [App TV webOS, sola lettura]
        |
   distribuita via Obtainium (GitHub Releases)

[Script Python, Hermes-agent]  --rinnova periodicamente-->  [Developer Mode sessione TV]
        (via aiowebostv/bscpylgtv, rete locale)
```

Punti chiave della scelta architetturale (dettagli e alternative scartate nella conversazione precedente):

- **Nessun backend proprio.** Supabase (piano Free) fa da unica fonte di verità condivisa. Evita di dover tenere acceso un PC per servire dati, e funziona anche quando un coinquilino non è sulla rete di casa.
- **TV a sola lettura.** L'app webOS non scrive mai su Supabase, si limita a leggere/iscriversi. Questo la rende più semplice e più robusta: se si blocca o va riavviata, non perde nulla, basta che torni a leggere.
- **Telefono → Supabase → TV, non telefono → TV diretto.** Un collegamento diretto (TV come server locale) non è garantito dalla piattaforma webOS in modo documentato ed è comunque limitato alla LAN di casa; passare da Supabase risolve entrambi i problemi.

## 2. Stack tecnico

| Componente | Scelta | Note |
|---|---|---|
| Datastore condiviso | Supabase Free (Postgres + Realtime) | Nessun limite di richieste, 500MB DB, realtime via WebSocket incluso. Va "toccato" almeno una volta a settimana o il progetto va in pausa per inattività — con uso quotidiano non è un problema reale. |
| App Android | Flutter (Dart) | Riusa l'esperienza già fatta su `money-manager-personal`. React Native è l'alternativa se si preferisce restare su TS, ma Flutter parte da zero attrito per te. |
| Distribuzione app | Obtainium, sorgente GitHub Releases | Repo pubblico su GitHub, l'APK va allegato a ogni Release. **Stessa chiave di firma (keystore) per tutte le release**, altrimenti gli aggiornamenti si rompono per i coinquilini già installati. |
| App TV | webOS homebrew app (HTML/CSS/JS, no framework pesante) | Sideload via Developer Mode + `ares-cli`. `appinfo.json` con `"enablePigScreenSaver": false` per bloccare lo screensaver. Si iscrive al canale Realtime di Supabase (WebSocket) con fallback a polling ogni 20-30s se il realtime dovesse dare problemi sul motore JS datato della TV. |
| Manutenzione Developer Mode | Script Python con `aiowebostv` (o `bscpylgtv`) | Schedulato in Hermes-agent (cron esistente). Simula via rete locale l'accensione TV + apertura app Developer Mode + sequenza tasti per estendere la sessione. Frequenza: da tarare sulla durata reale della sessione osservata sulla tua TV (le fonti online divergono tra ~50h e ~1000h a seconda di modello/versione webOS: verificare il valore reale nell'app Developer Mode prima di fissare la cadenza dello script, e schedularlo con margine, es. a metà della finestra osservata). |

## 3. Data model (Supabase / Postgres)

Schema minimo per l'MVP. Nomi tabelle e campi in inglese per coerenza con il resto del codice.

```sql
create table roommates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table dinner_presence (
  id uuid primary key default gen_random_uuid(),
  roommate_id uuid not null references roommates(id),
  date date not null,
  is_present boolean not null,
  updated_at timestamptz not null default now(),
  unique (roommate_id, date)
);

create table cleaning_tasks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0
);

create table cleaning_shifts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references cleaning_tasks(id),
  roommate_id uuid not null references roommates(id),
  week_start date not null,
  status text not null default 'pending' check (status in ('pending', 'done')),
  updated_at timestamptz not null default now(),
  unique (task_id, week_start)
);
```

Note:
- `roommates` è popolata a mano da Pietro (nessuna UI di registrazione nell'MVP — coerente con l'identificazione "seleziona il tuo nome" del PRD).
- La rotazione dei turni (chi tocca quale task ogni settimana) può partire come generata via script una tantum (o ricalcolata a runtime lato app da un ordine fisso + data di riferimento) piuttosto che gestita a mano riga per riga — da decidere in fase di implementazione, non blocca l'MVP.
- Row Level Security: anche se i dati non sono sensibili, va comunque abilitata una policy base (es. richiede la anon key, niente scrittura libera da internet senza nemmeno quella) per evitare che il progetto Supabase sia scrivibile da chiunque trovi l'URL.

## 4. Fasi di implementazione

Ogni fase ha un checkpoint esplicito: non si passa alla successiva finché quella corrente non è verificata a mano.

**Fase 0 — Setup Supabase**
Creare progetto, schema sopra, RLS di base, popolare `roommates` e `cleaning_tasks` a mano.
*Checkpoint:* riuscire a leggere/scrivere righe di test dalla dashboard web di Supabase.

**Fase 1 — App TV minima**
Pagina HTML/JS che legge `dinner_presence` e `cleaning_shifts` di oggi/questa settimana da Supabase e li mostra. Nessuna grafica curata ancora, solo dati veri a schermo.
*Checkpoint:* sideload via Developer Mode riuscito, dati corretti mostrati, TV non va in screensaver dopo 30+ minuti di inattività reale (test lungo, non solo pochi minuti).

**Fase 2 — Script di rinnovo Developer Mode**
Script Python + integrazione in Hermes-agent.
*Checkpoint:* osservare almeno un rinnovo automatico andato a buon fine senza intervento manuale, verificare che l'app installata sopravviva.

**Fase 3 — App Android MVP**
Schermata presenza cena (oggi + prossimi giorni) e schermata turni pulizia (stato corrente, segna come fatto). Scrittura diretta su Supabase.
*Checkpoint:* una modifica dall'app si riflette sulla TV entro pochi secondi.

**Fase 4 — Distribuzione**
Build APK firmata, repo GitHub pubblico con Release, verifica che Obtainium la riconosca e la installi.
*Checkpoint:* Pietro installa via Obtainium su un dispositivo di test pulito, come farebbe un coinquilino.

**Fase 5 — Rifinitura UI**
Solo a questo punto: stile della vista TV (coerente con `pietro-neutral-ui`, essendo rivolta anche ai coinquilini) e dell'app.
*Checkpoint:* leggibilità della TV da qualche metro di distanza, a colpo d'occhio.

**Fase 6 — Rollout reale**
Coinvolgere i coinquilini, raccogliere feedback sull'uso reale per una settimana prima di considerarlo "stabile".

## 5. Rischi noti e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Screensaver copre la dashboard nonostante `enablePigScreenSaver: false` | Verificato solo da fonti community, non da test diretto: prima cosa da validare in Fase 1, con margine di tempo per un piano B (video fullscreen in loop) se il flag non bastasse. |
| Sessione Developer Mode scade e l'app sparisce dalla TV | Fase 2 copre il rinnovo automatico; comunque monitorare le prime settimane, non fidarsi ciecamente dello script al primo giro. |
| Supabase va in pausa per inattività | Con uso quotidiano non dovrebbe accadere; se capita, il progetto si riattiva manualmente dalla dashboard Supabase — nessuna perdita dati. |
| Coinquilini non installano l'app per l'attrito di Obtainium | Rischio reale e non tecnico: va spiegato bene il perché (niente Play Store = niente costi/account sviluppatore) e accompagnata l'installazione la prima volta. |
| Firma APK cambiata tra una release e l'altra | Tenere il keystore in un posto sicuro fuori dal repo fin dalla prima build, mai rigenerarlo. |

## 6. Criteri di accettazione MVP

- La TV mostra presenze a cena e turno pulizie della settimana corrente, sempre, senza intervento manuale per almeno 2 settimane consecutive.
- Un coinquilino può segnalare la propria presenza a cena dall'app in meno di 10 secondi dall'apertura.
- Una modifica dall'app compare sulla TV senza bisogno di refresh manuale.
- Il rinnovo della Developer Mode avviene senza intervento umano per almeno un ciclo completo osservato.
