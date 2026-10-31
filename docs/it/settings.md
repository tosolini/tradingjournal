# Impostazioni e Profilo

Vai su **Impostazioni** nella barra laterale per gestire il tuo profilo e le preferenze dell'applicazione.

## Onboarding

Dopo il primo accesso, un banner eliminabile ti guida nella configurazione iniziale: cambia le credenziali, collega un broker, crea un conto e inizia a compilare il diario. Avvisa inoltre se è ancora in uso l'account amministratore predefinito.

## Account

### Fuso orario

Il campo **Fuso orario** è essenziale per il corretto funzionamento del calendario dei mercati.

- Seleziona la tua zona geografica (es. `Europe/Rome` per l'Italia)
- Il calendario dei mercati convertirà automaticamente tutti gli orari nel tuo fuso
- Se non configurato, viene usato il fuso del browser (può differire)

**Fusi orari comuni:**

| Fuso orario | Descrizione |
|---|---|
| `Europe/Rome` | Italia (CET/CEST) |
| `Europe/London` | Regno Unito (GMT/BST) |
| `America/New_York` | Stati Uniti Est (EST/EDT) |
| `America/Chicago` | Stati Uniti Centro (CST/CDT) |
| `Asia/Tokyo` | Giappone (JST) |

### Email, Nome utente e Password

La modifica di email o password richiede la conferma della **password corrente**.

1. Inserisci la **password corrente** nell'apposito campo
2. Inserisci la nuova email o la nuova password
3. Clicca **Salva modifiche**

Il tuo ruolo viene mostrato in sola lettura.

## Utenti Admin (solo admin)

Se il tuo account ha il ruolo `admin`, la sezione **Utenti Admin** ti consente di:

- Elencare tutti gli utenti con il loro ruolo
- Creare utenti (nome utente, email, password opzionale, ruolo `user` o `admin`)
- Modificare gli utenti (email, nome utente, password, ruolo)
- Eliminare utenti — non puoi eliminare te stesso né revocare il tuo ruolo admin

## Lingua

L'applicazione supporta:

- 🇮🇹 **Italiano**
- 🇬🇧 **Inglese** (predefinito)

La lingua viene rilevata automaticamente dal browser e può essere cambiata qui; il manuale in-app segue la selezione.

## Export / Import Dati

- **Esporta tutto** — scarica un backup JSON completo (`tradejournal-export-<data>.json`) di tutti i tuoi dati: borse, broker, conti, ticker, trade, esecuzioni, immagini, note giornaliere, assets, posizioni, uscite di portafoglio, snapshot giornalieri, libro cassa e snapshot di portafoglio
- **Importa tutto** — ripristina un backup JSON creato con Esporta

> ⚠️ L'import è **additivo/upsert**: i record corrispondenti vengono aggiornati in base alle chiavi naturali, i nuovi vengono creati; un import non elimina mai nulla.

## Ora Snapshot

Imposta l'orario (default `23:55`) in cui il backend esegue il **job di snapshot giornaliero**:

- **Snapshot di posizione** — per ogni trade aperto, recupera il prezzo di chiusura e salva quantità, valore di mercato, P&L realizzato e non realizzato
- **Snapshot di portafoglio** — per ogni conto, valore totale, costo, rendimento e rendimento % (usati dalla pagina Performance e dalle curve patrimoniali)

Il job viene eseguito una volta al giorno, nel fuso orario del server configurato con `APP_TIMEZONE`. In questa sezione puoi anche eseguire ricalcoli manuali per popolare una data.

Nello stesso job, se attivata l'apposita preferenza, viene eseguita anche la **registrazione automatica dei rimborsi obbligazionari a scadenza** (vedi sezione Portafoglio).


## Grafico Dashboard

Personalizza la visualizzazione predefinita del grafico del patrimonio nella Dashboard:

- **Visualizzazione di default del grafico**: scegli quale filtro applicare automaticamente all'apertura della Dashboard tra:
  - **Cumulato (Portafoglio e Azionario)** — visualizza la somma complessiva di tutti gli investimenti e dei trade azionari (predefinito)
  - **Portafoglio (ETF e Obbligazioni)** — mostra unicamente gli asset e le posizioni di portafoglio a lungo termine
  - **Azionario (Azioni e Trading)** — mostra unicamente le posizioni azionarie aperte e il capitale impiegato nel trading
- Clicca **Salva preferenze** per registrare l'impostazione nel tuo profilo utente.

## Portafoglio

Gestisci il comportamento automatico delle posizioni di portafoglio:

- **Registra automaticamente i rimborsi a scadenza** — se attivo, il job giornaliero chiude le obbligazioni scadute e registra:
  - rimborso del capitale a 100;
  - cedola finale;
  - premio fedeltà CUM, se spettante;
  - imposte stimate e movimenti del libro cassa.

L'operazione è idempotente e viene eseguita una sola volta per tranche. La preferenza è disattivata di default; puoi comunque registrare manualmente il rimborso dal dettaglio posizione.

## Sessione

- **Logout** — termina la sessione corrente e torna alla pagina di login

---

## Sicurezza

- L'autenticazione usa token JWT con durata limitata; alla scadenza vieni reindirizzato alla pagina di login
- La registrazione crea sempre un account `user` standard — il ruolo `admin` viene concesso solo da un amministratore
- Non condividere mai le tue credenziali
- Usa una password robusta di almeno 8 caratteri
- Le immagini caricate sui trade sono limitate a PNG/JPEG/GIF/WebP; gli altri file vengono rifiutati

## Versione e Informazioni

La versione corrente dell'applicazione è mostrata in fondo alla barra laterale. Includi questa informazione quando segnali un problema.
