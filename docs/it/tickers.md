# Ticker e Autocompletamento

Il database ticker permette di cercare e selezionare automaticamente il simbolo corretto quando crei un nuovo trade, evitando errori di digitazione.

## Scaricare o importare i ticker

### 1. Sincronizzazione automatica con un click (Consigliata)

È possibile scaricare e aggiornare i ticker azionari direttamente dai server Euronext in tempo reale senza dover scaricare file manualmente:

- **Dalla pagina Broker $\rightarrow$ Mercati**: nella tabella dei mercati, per ogni mercato Euronext supportato (es. *MTA Euronext Milan*, *Euronext Paris*, *Euronext Amsterdam*, *EuroTLX*), clicca sull'icona di download nella colonna **Azioni**.
- **Dalla pagina Ticker**: nella sezione **Scarica da Euronext**, clicca su **Sincronizza Milano (Euronext)** o su **Sincronizza Tutti i mercati Euronext**.

Il download e l'aggiornamento avvengono in memoria in pochi secondi, mantenendo intatti i trade esistenti.

### 2. Importazione manuale da CSV

In alternativa, puoi continuare a caricare manualmente un file CSV scaricato da [euronext.com](https://live.euronext.com/en/products/equities/list):
### Procedura di importazione

1. Vai su **Ticker** nel menu laterale (sezione Impostazioni)
2. Clicca **Importa CSV**
3. Seleziona il file `Euronext_Equities_*.csv`
4. L'importazione è automatica — al termine vengono mostrate le statistiche:
   - Ticker **nuovi** inseriti
   - Ticker **aggiornati** (già presenti, dati modificati)
   - Righe **saltate** (incomplete o non valide)
   - **Totale** nel database

> ⚠️ Il file CSV di Euronext è separato da `;` (punto e virgola) e contiene 4 righe di intestazione/metadata prima dei dati effettivi. Il sistema le gestisce automaticamente.

## Ricerca e anteprima

Dopo l'importazione, nella stessa pagina puoi cercare i ticker inseriti:

- Digita un simbolo o nome nella barra di ricerca
- La tabella mostra: **Simbolo**, **Nome**, **ISIN**, **Mercato**, **Valuta**

## Autocompletamento nel nuovo trade

Con i ticker importati, il campo **Simbolo** nella finestra "Nuovo Trade" mostra suggerimenti in tempo reale:

1. Inizia a digitare il ticker (es. `ENEL`)
2. Appare un dropdown con i risultati corrispondenti
3. I risultati mostrano: simbolo (in evidenza) + nome + mercato
4. Clicca per selezionare

### Stessa azienda su mercati diversi

Lo stesso titolo può avere simboli diversi su mercati diversi:

| Simbolo | Mercato | Descrizione |
|---|---|---|
| `AAPL` | NASDAQ | Apple Inc. quotata al NASDAQ |
| `1AAPL.MI` | Borsa Italiana | Apple Inc. su Borsa Italiana |

L'autocompletamento mostra entrambe le opzioni con il mercato di riferimento.

## Aggiornare il database

I ticker vengono aggiornati periodicamente da Euronext. Per aggiornare il database:

1. Scarica il nuovo CSV da Euronext
2. Reimporta il file — i ticker esistenti vengono aggiornati (upsert), i nuovi aggiunti

Per cancellare tutti i ticker e ricominciare da zero, usa il bottone **Cancella tutti** nella pagina Ticker.
