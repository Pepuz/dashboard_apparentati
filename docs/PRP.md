# PRP — Dashboard Appartamento (`flat-dashboard`)

Versione: 0.6 (Fase 2: rinnovo solo vicino alla scadenza, promemoria fuori dal repo)
Riferimento: `docs/PRD.md`
Data: 2026-09-14, aggiornato 2026-09-15

Questo documento descrive **come** costruire quanto definito nel PRD: architettura, stack, data model, fasi di lavoro, criteri di accettazione e rischi noti. È pensato per essere dato in pasto a Claude Code come contesto di partenza per l'implementazione, non come specifica immutabile: ogni fase termina con un checkpoint in cui va verificato con l'uso reale prima di passare alla successiva.

## 1. Architettura generale

```
[App Android, coinquilini]  --scrive-->  [Supabase: Postgres + Realtime]  --legge (polling)-->  [App TV webOS, sola lettura]
        |
   distribuita via Obtainium (GitHub Releases)

[Attività pianificata, PC fisso di un coinquilino]  --rinnova vicino alla scadenza-->  [Developer Mode sessione TV]
        (ares-cli, rete locale della TV)

[Promemoria di sicurezza, fuori da questo repo]  -->  [Pietro: EXTEND a mano sulla TV]
```

Punti chiave della scelta architetturale (dettagli e alternative scartate nella conversazione precedente):

- **Nessun backend proprio.** Supabase (piano Free) fa da unica fonte di verità condivisa. Evita di dover tenere acceso un PC per servire dati, e funziona anche quando un coinquilino non è sulla rete di casa.
- **TV a sola lettura.** L'app webOS non scrive mai su Supabase, si limita a leggere. Questo la rende più semplice e più robusta: se si blocca o va riavviata, non perde nulla, basta che torni a leggere.
- **Telefono → Supabase → TV, non telefono → TV diretto.** Un collegamento diretto (TV come server locale) non è garantito dalla piattaforma webOS in modo documentato ed è comunque limitato alla LAN di casa; passare da Supabase risolve entrambi i problemi.

## 2. Stack tecnico

| Componente | Scelta | Note |
|---|---|---|
| Datastore condiviso | Supabase Free (Postgres + Realtime) | Nessun limite di richieste, 500MB DB, realtime via WebSocket incluso. Va "toccato" almeno una volta a settimana o il progetto va in pausa per inattività — con uso quotidiano non è un problema reale. |
| App Android | Flutter (Dart) | Riusa l'esperienza già fatta su `money-manager-personal`. React Native è l'alternativa se si preferisce restare su TS, ma Flutter parte da zero attrito per te. |
| Distribuzione app | Obtainium, sorgente GitHub Releases | Repo pubblico su GitHub, l'APK va allegato a ogni Release. **Stessa chiave di firma (keystore) per tutte le release**, altrimenti gli aggiornamenti si rompono per i coinquilini già installati. |
| App TV | webOS homebrew app (HTML/CSS/JS, no framework pesante) | Sideload via Developer Mode + `ares-cli` (pacchetto npm `@webos-tools/cli`). Legge le API REST di Supabase con polling ogni 20 s, senza supabase-js né Realtime: nessuna dipendenza, nessuna migrazione, e codice con sintassi ES5 + `XMLHttpRequest`, per non dipendere dalla versione webOS della TV (TV finale: LG OLED48A16LA, webOS 6.5.3-47, motore Chromium 79); usa `Promise` e flexbox, quindi richiede un motore Chromium (verificato sul simulatore webOS TV 24). URL e publishable key in `tv-app/config.js`, generato dal `.env` e git-ignorato. L'app installata è un guscio: `index.html`, `config.js` e una copia di riserva di `app.js` restano sulla TV, mentre all'avvio `app.js` si carica da GitHub Pages (repo pubblico; il file pubblicato contiene solo codice, nessuna chiave), così gli aggiornamenti non richiedono un nuovo sideload. Screensaver: vedi §5. |
| Manutenzione Developer Mode | Attività pianificata con `ares-cli` sul PC fisso di un coinquilino, sulla rete della TV | La sessione dura circa 1000 ore e scorre anche a TV spenta (999h:55m il 2026-09-16, 838h:02m il 2026-09-23); alla scadenza le app installate in Developer Mode vengono disinstallate e la sessione non si può più prolungare. Il PC di sviluppo non è mai sulla rete della TV, quindi il rinnovo gira sul PC di un coinquilino, acceso quasi sempre o almeno una volta al giorno, con il suo consenso. Meccanismo, solo da fonte community (Dev Manager di webosbrew, issue #256): avviare sulla TV l'app Developer Mode con il parametro di estensione, via `luna://com.webos.applicationManager/launch` con `{"id": "com.palmdts.devmode", "params": {"extend": true}}`; verificato a mano sulla TV finale il 2026-09-24 con `ares-launch --device tv com.palmdts.devmode --params "{'extend':true}"`, che manda la stessa chiamata più `displayAffinity: 0`: Remain Session torna a circa 1000 h. L'app Developer Mode però compare in primo piano e resta aperta: `ares-launch --close` la rifiuta (chiude solo le app installate in Developer Mode) e `getForegroundAppInfo` è negato, quindi lo script non può né chiuderla né sapere quale app c'era prima. L'attività (`scripts/devmode/`) parte all'accesso e ogni ora, ma per rinnovare il meno possibile contatta la TV solo nelle ultime 240 ore della sessione, circa un rinnovo al mese: un file locale tiene l'ora del prossimo controllo, ricalcolata dal residuo letto a ogni rinnovo, e senza quel file (prima esecuzione) rinnova subito. Dopo l'avvio di Developer Mode apre Dashboard casa, che la copre. Se la TV è spenta o irraggiungibile riprova al giro successivo; le 240 ore coprono PC o TV spenti per qualche giorno. Se il rinnovo non sposta il timer riprova dopo 24 ore, per non far comparire Developer Mode a ogni giro; se il residuo non si può leggere, si fida dell'avvio per una sessione intera. Il residuo si legge solo con un metodo community, lo stesso di Dev Manager: token in `/var/luna/preferences/devmode_enabled` sulla TV, poi `developer.lge.com/secure/CheckDevModeSession.dev`. Il 2026-09-24 il valore combaciava con quello dell'app Developer Mode prima e dopo il rinnovo, e il token non è cambiato: lo script lo usa per correggere la stima e confermare il rinnovo. Chiave SSH della TV, file di stato e log restano su quel PC, fuori dal repo. L'IP della TV cambia (DHCP): meglio riservarlo sul router (§5). Rete di sicurezza, fuori da questo repo: un promemoria per premere EXTEND prima della scadenza; per spostarsi da solo a ogni rinnovo deve leggere il residuo dallo stesso servizio, con una soglia più bassa di quella dello script. Scartati: script Python con `aiowebostv` sul PC di sviluppo, che non vede la TV, e la richiesta HTTP a `developer.lge.com/secure/ResetDevModeSession.dev`, fonte community contestata (risponde "success" ma il timer non si muove). |

## 3. Data model (Supabase / Postgres)

Schema minimo per l'MVP. Nomi tabelle e campi in inglese per coerenza con il resto del codice. La fonte di verità sono i file in `supabase/migrations/`, da eseguire in ordine; il blocco qui sotto è lo schema che ne risulta.

```sql
create table roommates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  active boolean not null default true
);

create table meal_presence (
  id uuid primary key default gen_random_uuid(),
  roommate_id uuid not null references roommates(id),
  date date not null,
  meal text not null check (meal in ('lunch', 'dinner')),
  is_present boolean not null,
  required_time time,
  guest_names text[] not null default '{}',
  note text,
  updated_at timestamptz not null default now(),
  unique (roommate_id, date, meal),
  constraint absent_has_no_guests_or_time
    check (is_present or (cardinality(guest_names) = 0 and required_time is null))
);

create table cleaning_tasks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true
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
- `roommates` è popolata a mano da Pietro (nessuna UI di registrazione nell'MVP — coerente con l'identificazione "seleziona il tuo nome" del PRD). Chi lascia la casa si disattiva con `active = false` invece di essere cancellato: le chiavi esterne impediscono di cancellare righe con presenze o turni collegati. Stessa regola per `cleaning_tasks`.
- `cleaning_tasks` contiene le 7 aree del PRD (sala, camera 1, camera 2, bagno 1, bagno 2, cucina, pavimenti e polveri delle mensole), popolate a mano.
- Turni: nessuna rotazione automatica. Le righe di `cleaning_shifts` le crea e modifica l'app, da parte di qualsiasi coinquilino, settimana per settimana; un cambio all'ultimo è un update di `roommate_id` sulla riga esistente. Un solo responsabile per area per settimana (`unique (task_id, week_start)`).
- Pasti: una riga per coinquilino, giorno e pasto (`lunch`/`dinner`); nessuna riga significa "non specificato". `guest_names` è la lista dei nomi degli ospiti e il numero di ospiti è `cardinality(guest_names)`; gli ospiti mangiano al `required_time` di chi li invita, le eccezioni vanno in `note`. Il vincolo `absent_has_no_guests_or_time` impedisce ospiti e orario richiesto quando `is_present` è falso; la nota è ammessa anche da assenti.
- Row Level Security: abilitata su tutte le tabelle. Le app usano la **publishable key** (`sb_publishable_...`), che sostituisce la anon key legacy in dismissione entro fine 2026. È pubblica per design (finisce nell'APK e nell'app TV), quindi da sola non protegge nulla: la protezione sono le policy RLS, che danno al ruolo `anon` lettura su tutto e scrittura (insert/update, mai delete) solo sulle tabelle che l'app aggiorna (`meal_presence`, `cleaning_shifts`). `roommates` e `cleaning_tasks` si modificano solo dalla dashboard Supabase. La *secret key* non va mai in nessuna app né nel repo.
- Aggiornamenti: la TV fa polling ogni 20 s (deciso in Fase 1), quindi per la TV non serve la publication `supabase_realtime`. L'app Android invece deve vedere gli aggiornamenti in tempo reale (PRD §4.5): se aggiungere `meal_presence` e `cleaning_shifts` alla publication, con una migrazione dedicata, si decide in Fase 3.
- Date: "oggi" e `week_start` si calcolano nell'ora locale del dispositivo, impostato sul fuso italiano; `week_start` è sempre il lunedì della settimana. App TV e app Android usano la stessa convenzione.

## 4. Fasi di implementazione

Ogni fase ha un checkpoint esplicito: non si passa alla successiva finché quella corrente non è verificata a mano.

**Fase 0 — Setup Supabase**
Creare progetto, schema sopra, RLS di base, popolare `roommates` e `cleaning_tasks` a mano.
*Checkpoint:* riuscire a leggere/scrivere righe di test dalla dashboard web di Supabase.

**Fase 1 — App TV minima**
Pagina HTML/JS che legge da Supabase `meal_presence` (pranzo e cena di oggi, con ospiti e orari richiesti) e `cleaning_shifts` della settimana corrente (e della successiva il sabato e la domenica se ha già assegnazioni, o col tasto OK), e li mostra aggiornandosi con il polling. Nessuna grafica curata ancora, solo dati veri a schermo. L'app installata è un guscio che carica `app.js` da GitHub Pages, con la copia nel pacchetto come riserva. Screensaver: nel codice c'è solo il tentativo (1) di §5; il (2) resta un piano.
*Checkpoint:* dati corretti prima in un browser desktop, poi sulla TV dopo il sideload via Developer Mode; una modifica fatta dalla dashboard Supabase compare sulla TV entro 30 s senza toccarla. Osservazione facoltativa, non bloccante: se e dopo quanti minuti di inattività compare lo screensaver con l'app aperta.

**Fase 2 — Rinnovo automatico della Developer Mode**
Comando di rinnovo verificato prima a mano sulla TV, poi script e attività pianificata con `ares-cli` sul PC del coinquilino (§2). Il promemoria di sicurezza resta fuori da questo repo.
*Checkpoint:* almeno un rinnovo automatico osservato senza intervento manuale (Remain Session torna vicino a 1000h e il log lo registra; il primo giro pianificato rinnova subito, perché il file di stato non c'è ancora) e l'app installata ancora presente.

**Fase 3 — App Android MVP**
Schermata presenza ai pasti (pranzo e cena, oggi + prossimi giorni, con orario richiesto, ospiti e nota) e schermata turni pulizia (assegnazione delle aree della settimana, cambi all'ultimo, segna come fatto). Scrittura diretta su Supabase; gli aggiornamenti degli altri compaiono in tempo reale anche nell'app.
*Checkpoint:* una modifica dall'app si riflette sulla TV e sull'app di un altro coinquilino entro pochi secondi.

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
| Lo screensaver copre la dashboard | Secondo la documentazione ufficiale LG lo screensaver parte sempre, tranne durante un video a schermo intero, e `enablePigScreenSaver` riguarda solo i video non a schermo intero: da solo non basta. Ordine dei tentativi in Fase 1: (1) chiamata Luna non documentata `luna://com.webos.service.tvpower/power/registerScreenSaverRequest` con risposta `ack: false` (solo fonti community); (2) video nero muto in loop a schermo intero dietro la dashboard, solo se lo screensaver dà fastidio nell'uso reale (piano sotto la tabella). `"enablePigScreenSaver": false` resta in `appinfo.json` finché il test sulla TV non chiarisce se serve. Da webOS TV 26 le chiamate Luna passano dal controllo `requiredACG` e la guida ACG non elenca un gruppo per `tvpower`: su quelle versioni il tentativo (1) può essere rifiutato (`Denied method call`), e da webOS TV 27 il campo è obbligatorio per tutte le app. La TV finale ha webOS 6.5.3, quindi il controllo ACG non la riguarda: il campo servirebbe solo passando a una TV con webOS 26 o successivo. Verificato sulla TV finale il 2026-09-23: il servizio `tvpower` esiste e la chiamata non viene rifiutata, ma la registrazione di un'app chiusa resta attiva fino al riavvio della TV e un nuovo tentativo con lo stesso nome fallisce (`errorCode -3`, "The client is already registered"); per questo il nome del client cambia a ogni avvio. Resta da osservare se la risposta `ack: false` blocca davvero lo screensaver. |
| Il caricamento di `app.js` da GitHub Pages non funziona sulla TV | Nessuna documentazione LG dice se un'app locale possa caricare uno script da `https`: va verificato al primo avvio, e una riga di stato in basso dice quale copia è in uso. Se fallisce, il guscio usa la copia inclusa nel pacchetto e si torna ad aggiornare via sideload. Stessa riserva se la TV è offline o GitHub non risponde. |
| Sessione Developer Mode scade e l'app sparisce dalla TV | Rinnovo automatico dal PC del coinquilino (Fase 2) più promemoria di sicurezza per premere EXTEND a mano; nelle prime settimane controllare Remain Session, senza fidarsi ciecamente dello script al primo giro. Se scade comunque: riattivare la Developer Mode e rifare il sideload (`docs/sideload-tv.md`). |
| Il PC del coinquilino o la TV sono spenti quando parte il rinnovo | L'attività comincia a tentare 240 ore prima della scadenza e riprova a ogni giro: basta che PC e TV siano accesi insieme una volta in quei 10 giorni. Il promemoria copre i casi peggiori. |
| L'IP della TV cambia e lo script non la trova | Indirizzo riservato alla TV sul router (DHCP reservation), da verificare. Finché manca: se la TV non risponde all'IP registrato, lo script prova la porta 9922 (SSH della Developer Mode) sugli indirizzi della stessa /24 e aggiorna il dispositivo con `ares-setup-device --modify`; un host sbagliato non passa l'autenticazione SSH con la chiave della TV. `ares-setup-device --search` non serve: nel sorgente della 3.2.6 è interattivo e si ferma alla prima risposta SSDP che non viene da webOS. |
| Supabase va in pausa per inattività | Con uso quotidiano non dovrebbe accadere; se capita, il progetto si riattiva manualmente dalla dashboard Supabase — nessuna perdita dati. |
| Coinquilini non installano l'app per l'attrito di Obtainium | Rischio reale e non tecnico: va spiegato bene il perché (niente Play Store = niente costi/account sviluppatore) e accompagnata l'installazione la prima volta. |
| Firma APK cambiata tra una release e l'altra | Tenere il keystore in un posto sicuro fuori dal repo fin dalla prima build, mai rigenerarlo. |

**Tentativo (2) dello screensaver: piano pronto, non implementato.** L'app TV resta un'app normale, aperta quando serve; il video si implementa solo se il tentativo (1) fallisce e lo screensaver dà fastidio nell'uso reale.
1. Video nero muto, generato una volta (verificato sul PC: H.264 Main, 1920×1080, 25 fps, 10 s, circa 22 KB):
   `ffmpeg -f lavfi -i "color=c=black:s=1920x1080:r=25" -t 10 -c:v libx264 -profile:v main -pix_fmt yuv420p -tune stillimage -an -movflags +faststart tv-app/black-loop.mp4`
2. `app.js` crea un `<video src="black-loop.mp4" autoplay muted loop>` a tutto schermo (`position: fixed`, 100% × 100%, `z-index: -1`), dietro la dashboard, solo se `CONFIG.screensaverVideo` è vero.
3. `make-config.ps1` riceve un parametro `-Video` che scrive `screensaverVideo: true` in `config.js`; senza parametro il video resta spento.
4. Test con la stessa checklist del README (Fase 1, sezione E), annotando anche se la luminosità cala o compaiono controlli di riproduzione. Incognita da documentazione: se il testo sopra il video fa perdere lo stato di "video a schermo intero".

## 6. Criteri di accettazione MVP

- L'app TV, ogni volta che la si apre, mostra presenze a pranzo e cena (con ospiti e orari richiesti) e turni pulizie della settimana corrente, senza reinstallazioni o interventi manuali per almeno 2 settimane consecutive.
- Un coinquilino può segnalare la propria presenza a un pasto dall'app in meno di 10 secondi dall'apertura.
- Una modifica dall'app compare sulla TV entro 30 secondi e nelle app degli altri coinquilini, senza bisogno di refresh manuale.
- Il rinnovo della Developer Mode avviene senza intervento umano per almeno un ciclo completo osservato.
