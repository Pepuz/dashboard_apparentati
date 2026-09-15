# PRD — Dashboard Appartamento (nome provvisorio: `flat-dashboard`)

Versione: 0.3 (vista TV aperta quando serve, settimana successiva dal sabato)
Autore: Pietro (con supporto Claude)
Data: 2026-09-14, aggiornato 2026-09-15

## 1. Problema

In casa servono coordinamento su tre cose che oggi probabilmente passano per messaggi sparsi in chat: chi c'è a pranzo e a cena (e con quali ospiti), di chi è il turno di pulizie questa settimana, e altre informazioni condivise di casa. Non c'è un punto unico, sempre visibile, che mostri lo stato aggiornato senza dover chiedere o scrollare una chat.

## 2. Obiettivo

Una dashboard sulla smart TV LG del soggiorno, aperta come app quando serve, che mostra lo stato condiviso di casa e si aggiorna da sola, alimentata da un'app Android che i coinquilini usano per aggiornare presenze e turni. Sulla TV è a sola lettura: una volta aperta non richiede interazione, pensata per essere vista al volo passando in salotto.

## 3. Utenti

- Pietro (admin/manutentore del sistema)
- Coinquilini (utenti finali dell'app Android)

**[DA DEFINIRE]** Quanti coinquilini in totale, e se tutti hanno un telefono Android (Obtainium è Android-only: chi ha iPhone resta escluso dall'app e dovrebbe passare da un canale alternativo, es. messaggio a un familiare/coinquilino che aggiorna per lui — da chiarire se è un caso reale in casa vostra).

## 4. Funzionalità — MVP

### 4.1 Presenza ai pasti
- Ogni coinquilino segna, dall'app, se ci sarà a **pranzo** e a **cena** (oggi e idealmente per i prossimi giorni della settimana). Chi non ha ancora risposto per un pasto resta in uno stato "non specificato".
- Se è presente a un pasto, può indicare:
  - un **orario richiesto** facoltativo, quando per impegni deve mangiare a un'ora precisa;
  - gli **ospiti** che invita, come lista di nomi: il numero di ospiti è quanti nomi ci sono. Gli ospiti mangiano allo stesso orario di chi li invita; eventuali eccezioni vanno nella nota. Chi è assente non può segnare ospiti.
- Per ogni pasto può aggiungere una **nota** libera facoltativa, anche se assente (es. "rientro tardi").
- La TV mostra, per il pranzo e la cena di oggi, chi c'è, chi no, chi non ha risposto, gli ospiti e gli orari richiesti.

### 4.2 Turni di pulizia
- Aree di pulizia (7): sala, camera 1, camera 2, bagno 1, bagno 2, cucina, pavimenti e polveri delle mensole. I nomi si possono cambiare dalla dashboard Supabase.
- Cadenza settimanale, nessuna rotazione automatica: chi fa cosa si imposta settimana per settimana.
- Qualsiasi coinquilino, dall'app, assegna le aree della settimana e può cambiarle anche all'ultimo (riassegnare un'area a un altro coinquilino, senza conferma).
- Ogni area ha un solo responsabile per settimana.
- La TV mostra le assegnazioni della settimana corrente con il loro stato. La settimana successiva compare da sola il sabato e la domenica, se ha già almeno un'assegnazione; in qualsiasi giorno il tasto OK del telecomando la mostra o la nasconde, anche se è vuota.
- Dall'app si segna un'area come completata.

### 4.3 "E altro"
Il messaggio iniziale menzionava "e altro" senza specificare cosa. Per l'MVP questo resta fuori scope esplicito — vedi §5 — ma il data model (PRP §3) è pensato per essere esteso senza ristrutturare tutto. **[DA DEFINIRE]** cosa vuoi aggiungere dopo l'MVP: lista spesa condivisa? bollette? avvisi/bacheca? calendario eventi di casa?

### 4.4 Vista TV
- La TV si usa normalmente e di notte si spegne: la dashboard è un'app che si apre quando serve, non un contenuto sempre acceso.
- Una volta aperta: fullscreen, nessuna interazione richiesta (unica eccezione facoltativa: il tasto OK per la settimana successiva, §4.2).
- È un'app normale: se resta aperta a lungo senza input può comparire lo screensaver della TV. Si interviene solo se nell'uso reale dà fastidio (PRP §5).
- Si aggiorna da sola quando qualcuno modifica qualcosa dall'app (refresh a breve intervallo, vedi PRP).
- Resta installata tra un'accensione e l'altra senza intervento manuale ricorrente (a parte la manutenzione periodica della Developer Mode, gestita da automazione — vedi PRP §5).

### 4.5 App Android
- Distribuita fuori Play Store, via Obtainium, gratuitamente.
- Mostra in tempo reale gli aggiornamenti fatti dagli altri coinquilini (presenze ai pasti e turni), senza dover ricaricare.
- Login/identificazione semplice: **[DA DEFINIRE]** — la scelta più semplice è che ogni coinquilino selezioni il proprio nome da una lista fissa alla prima apertura (nessuna password, dato che l'app gira su dispositivi personali e i dati in gioco non sono sensibili); da confermare che vada bene così.

## 5. Fuori scope per l'MVP (non-goal)

- App iOS (Obtainium copre solo Android; se serve iOS si valuta in un secondo momento con un canale diverso, es. bot Telegram come discusso in alternativa).
- Autenticazione vera (password, OAuth) — si parte da selezione nome, senza protezione seria: non mettere nell'app nulla che non vada bene renda pubblico ai coinquilini stessi.
- Notifiche push.
- Multi-appartamento / multi-tenant.
- Personalizzazione avanzata della UI sulla TV (temi, layout configurabile).
- Rotazione automatica dei turni di pulizia: le assegnazioni si impostano a mano, settimana per settimana.
- Scambi turno con conferma dall'altro coinquilino: per l'MVP chiunque può riassegnare un'area dall'app, senza conferma.
- Avvio automatico della dashboard all'accensione della TV: si apre a mano quando serve.

## 6. Vincoli

- **Budget: zero.** Nessun hardware aggiuntivo (niente Raspberry Pi/mini PC), nessun servizio a pagamento, nessun account Google Play a pagamento.
- La TV è una LG con webOS; l'app ci gira come app homebrew via Developer Mode (gratuita, ma con sessione a tempo da rinnovare — vedi PRP).
- Il PC di Pietro non è un server sempre acceso: nessun componente critico del sistema può dipendere dal fatto che resti acceso.

## 7. Come si misura il successo

Progetto personale, quindi metriche informali:
- I coinquilini lo usano davvero al posto dei messaggi in chat per queste cose specifiche.
- L'app TV, quando la si apre, mostra dati corretti e aggiornati, senza reinstallazioni o interventi manuali per più di qualche settimana di fila.
- Aggiungere un coinquilino nuovo o un'area di pulizia richiede una modifica minima (dato in Supabase), non codice; chi lascia la casa si disattiva, non si cancella.

## 8. Domande aperte prima di iniziare l'implementazione

Riassunto dei punti **[DA DEFINIRE]** sopra, da chiudere idealmente prima o durante lo sviluppo dell'MVP:

1. Numero e nomi dei coinquilini che useranno il sistema.
2. Tutti su Android? Se no, come gestire chi non può installare l'app.
3. ~~Elenco esatto dei task di pulizia e cadenza della rotazione.~~ Risolto in v0.2: 7 aree, cadenza settimanale, assegnazione manuale dall'app (§4.2).
4. Meccanismo di identificazione nell'app (selezione nome vs qualcos'altro).
5. Cosa entra in "e altro" oltre a pasti e pulizie, per una v2.

Il PRP (documento tecnico di implementazione) procede assumendo le scelte più semplici sui punti sopra, chiaramente segnalate, così puoi partire subito e correggere in corsa dove serve.
