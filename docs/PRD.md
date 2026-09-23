# PRD — Dashboard Appartamento (nome provvisorio: `flat-dashboard`)

Versione: 0.6 (rinnovo della Developer Mode dal PC di un coinquilino)
Autore: Pietro (con supporto Claude)
Data: 2026-09-14, aggiornato 2026-09-15

## 1. Problema

In casa servono coordinamento su tre cose che oggi probabilmente passano per messaggi sparsi in chat: chi c'è a pranzo e a cena (e con quali ospiti), di chi è il turno di pulizie questa settimana, e altre informazioni condivise di casa. Non c'è un punto unico, sempre visibile, che mostri lo stato aggiornato senza dover chiedere o scrollare una chat.

## 2. Obiettivo

Una dashboard sulla smart TV LG del soggiorno, aperta come app quando serve, che mostra lo stato condiviso di casa e si aggiorna da sola, alimentata da un'app Android che i coinquilini usano per aggiornare presenze e turni. Sulla TV è a sola lettura: una volta aperta non richiede interazione, pensata per essere vista al volo passando in salotto.

## 3. Utenti

- Pietro (admin/manutentore del sistema)
- Coinquilini (utenti finali dell'app Android)

Coinquilini attivi: 7. I nomi stanno solo in Supabase, non nel repo.

Non tutti hanno Android: chi ha iPhone non può installare l'app, perché Obtainium è Android-only. **[DA DEFINIRE]** quanti sono e come aggiornano presenze e turni. Opzioni: (a) un coinquilino con Android aggiorna per loro dall'app; (b) una versione web dell'app, usabile dal browser dell'iPhone (nuovo scope, da valutare).

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
Il messaggio iniziale menzionava "e altro" senza specificare cosa. Per l'MVP questo resta fuori scope esplicito — vedi §5 — ma il data model (PRP §3) è pensato per essere esteso senza ristrutturare tutto. La prima aggiunta candidata dopo l'MVP è una **bacheca avvisi**: messaggi brevi per tutti, visibili sulla TV. Resta fuori dall'MVP.

### 4.4 Vista TV
- La TV si usa normalmente e di notte si spegne: la dashboard è un'app che si apre quando serve, non un contenuto sempre acceso.
- Una volta aperta: fullscreen, nessuna interazione richiesta (unica eccezione facoltativa: il tasto OK per la settimana successiva, §4.2).
- È un'app normale: se resta aperta a lungo senza input può comparire lo screensaver della TV. Si interviene solo se nell'uso reale dà fastidio (PRP §5).
- Si aggiorna da sola quando qualcuno modifica qualcosa dall'app (refresh a breve intervallo, vedi PRP).
- Resta installata tra un'accensione e l'altra senza intervento manuale ricorrente (a parte la manutenzione periodica della Developer Mode, gestita da automazione — vedi PRP §5).
- L'app installata sulla TV è un guscio: il codice vero si carica da una pagina pubblicata, così aggiornarla non richiede di tornare sul posto con un computer (PRP §2).

### 4.5 App Android
- Distribuita fuori Play Store, via Obtainium, gratuitamente.
- Mostra in tempo reale gli aggiornamenti fatti dagli altri coinquilini (presenze ai pasti e turni), senza dover ricaricare.
- Identificazione: alla prima apertura ogni coinquilino sceglie il proprio nome dalla lista dei coinquilini attivi. Nessuna password, dato che l'app gira su dispositivi personali e i dati in gioco non sono sensibili.

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
- Il PC di sviluppo non sta sulla rete di casa dove vive la TV: installare il pacchetto richiede un computer sul posto, quindi il codice dell'app deve potersi aggiornare senza un nuovo sideload.
- Sulla rete della TV c'è il PC fisso di un coinquilino, acceso quasi sempre o almeno una volta al giorno: con il suo consenso, ospita il rinnovo automatico della Developer Mode.

## 7. Come si misura il successo

Progetto personale, quindi metriche informali:
- I coinquilini lo usano davvero al posto dei messaggi in chat per queste cose specifiche.
- L'app TV, quando la si apre, mostra dati corretti e aggiornati, senza reinstallazioni o interventi manuali per più di qualche settimana di fila.
- Aggiungere un coinquilino nuovo o un'area di pulizia richiede una modifica minima (dato in Supabase), non codice; chi lascia la casa si disattiva, non si cancella.

## 8. Domande aperte prima di iniziare l'implementazione

Riassunto dei punti **[DA DEFINIRE]** sopra, da chiudere idealmente prima o durante lo sviluppo dell'MVP:

1. ~~Numero e nomi dei coinquilini che useranno il sistema.~~ Risolto in v0.4: 7 coinquilini attivi, nomi solo in Supabase (§3).
2. Tutti su Android? No, alcuni hanno iPhone: resta da definire quanti sono e come aggiornano presenze e turni (§3).
3. ~~Elenco esatto dei task di pulizia e cadenza della rotazione.~~ Risolto in v0.2: 7 aree, cadenza settimanale, assegnazione manuale dall'app (§4.2).
4. ~~Meccanismo di identificazione nell'app (selezione nome vs qualcos'altro).~~ Risolto in v0.4: selezione del nome da lista, senza password (§4.5).
5. ~~Cosa entra in "e altro" oltre a pasti e pulizie, per una v2.~~ Risolto in v0.4: bacheca avvisi come prima aggiunta candidata dopo l'MVP (§4.3).

Il PRP (documento tecnico di implementazione) procede assumendo le scelte più semplici sui punti sopra, chiaramente segnalate, così puoi partire subito e correggere in corsa dove serve.
