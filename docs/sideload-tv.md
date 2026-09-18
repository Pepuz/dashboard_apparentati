# Installare l'app TV da un PC qualsiasi

Guida autosufficiente. Non servono il repo del progetto, il file `.env` né altri strumenti: bastano questo documento, il pacchetto `com.apparentati.dashboard_0.2.0_all.ipk` e un PC Windows sulla stessa rete della TV. Comandi in PowerShell.

## Dati della TV

- LG OLED48A16LA, webOS 6.5.3-47, firmware 03.53.45
- Indirizzo IP: lo mostra l'app Developer Mode sulla TV; nei comandi sotto sostituisci `IP_DELLA_TV`
- App: `com.apparentati.dashboard`, a sola lettura: legge Supabase ogni 20 secondi e non scrive mai

## Prima di iniziare

1. TV accesa e connessa alla rete di casa.
2. Sulla TV apri **Developer Mode** e attiva **Key Server**: si spegne a ogni riavvio della TV.
3. Annota **Remain Session**. Alla scadenza della sessione le app installate in Developer Mode vengono disinstallate (documentazione LG).
4. Il PC deve stare sulla stessa rete: niente VPN aziendale attiva, e se è collegato via cavo verifica che sia la stessa rete del Wi-Fi di casa.

## 1. Node

```powershell
node --version
```

Serve la versione 20 o successiva, richiesta dal pacchetto `@webos-tools/cli`. Se manca o è più vecchia e non vuoi installare nulla: scarica da [nodejs.org](https://nodejs.org) l'archivio ZIP per Windows x64, decomprimilo e aggiungilo al PATH della sola finestra corrente.

```powershell
$env:Path = "C:\percorso\node-vXX-win-x64;$env:Path"
```

## 2. CLI di LG

```powershell
npm install -g @webos-tools/cli
```

Le righe `npm warn deprecated` sono normali: vengono dalle librerie interne del CLI. Poi chiudi e riapri PowerShell.

```powershell
ares -V
```

Atteso: `Version: 3.2.6`. Se PowerShell risponde che `ares` non è riconosciuto, aggiungi al PATH la cartella dei pacchetti globali di npm.

```powershell
$env:Path = "$(npm config get prefix);$env:Path"
```

## 3. Rete

```powershell
Test-Connection -Count 2 IP_DELLA_TV
```

Deve rispondere. Se non risponde: TV spenta, indirizzo IP sbagliato, o PC su un'altra rete.

## 4. Registra la TV

```powershell
ares-setup-device --add tv -i "host=IP_DELLA_TV" -i "port=9922" -i "username=prisoner"
```

## 5. Chiave di accesso

Sulla TV, nell'app Developer Mode, attiva **Key Server**: compare una passphrase di 6 caratteri.

```powershell
ares-novacom --device tv --getkey
```

Digitala esattamente, maiuscole e minuscole comprese.

## 6. Verifica il collegamento

```powershell
ares-device --device tv --system-info
```

Atteso: modello `OLED48A16LA` e firmware `03.53.45`.

## 7. Installa e avvia

Dalla cartella dove hai messo il pacchetto:

```powershell
ares-install --device tv com.apparentati.dashboard_0.2.0_all.ipk
```

```powershell
ares-launch --device tv com.apparentati.dashboard
```

L'app resta anche nella lista app della TV, quindi dopo si apre dal telecomando.

## 8. Verifiche sulla TV

1. In alto la data di oggi, corretta.
2. Pranzo e Cena con i 7 coinquilini attivi: presente, assente o non specificato, più orario, ospiti e nota dove ci sono.
3. Turni della settimana: le 7 aree in ordine, con nome e stato, oppure "non assegnata".
4. Modifica una riga dalla dashboard Supabase senza toccare la TV: deve comparire entro 30 secondi, e l'orario di `Aggiornato alle` deve avanzare.
5. Tasto **OK** del telecomando: la settimana successiva compare e sparisce.
6. Copia il testo della riga `Screensaver:` in basso: dice cosa ha risposto la TV al tentativo di impedire lo screensaver.

## Se qualcosa non va

- **Pagina vuota o bianca:** `ares-inspect --device tv --app com.apparentati.dashboard` apre i DevTools sul PC. Serve un Chromium compatibile con webOS 6.x.
- **Riga rossa che inizia con `Errore`:** la TV non raggiunge Supabase. Controlla che abbia accesso a internet.
- **`ares-novacom` o `ares-install` falliscono:** riattiva **Key Server** sulla TV e ripeti dal punto 5.
- **Dopo settimane l'app sparisce dalla TV:** la sessione Developer Mode è scaduta. Riattivala dall'app sulla TV e reinstalla ripetendo dal punto 5.

## Se il PC non è tuo

A fine lavoro rimuovi il dispositivo dal menu interattivo di `ares-setup-device`: la chiave privata della TV resta altrimenti nel profilo utente di quel PC. Se vuoi, disinstalla anche il CLI.

```powershell
npm uninstall -g @webos-tools/cli
```

## Da riportare

Output dei punti 6 e 7, esito delle sei verifiche del punto 8, testo della riga `Screensaver:`, ed eventuali errori copiati esatti.
