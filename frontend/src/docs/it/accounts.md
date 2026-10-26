# Conti e Broker

## Broker

I broker rappresentano gli intermediari finanziari attraverso cui operi sui mercati. Devi configurare almeno un broker prima di creare un conto.

### Preset Rapidi e Profili Broker

In fase di creazione o modifica di un broker, puoi selezionare un **profilo rapido** preimpostato con un solo click:

- **Fineco - Conto Trading**: commissione variabile dello 0,19% del controvalore dell'operazione, con **minimo di 2,95 €** e **massimo di 19,00 €** per eseguito. Canone mensile zero.
- **Fineco - Under 30**: tariffa agevolata fissa a **2,95 €** per ordine su azioni ed ETF italiani/europei e **3,95 $** per ordini sui mercati USA. Canone mensile zero.
- **Fineco - Conto One / Classic / Max (Fasce di Volume)**: commissioni decrescenti in base alle commissioni generate nel mese solare:
  - **Fascia 1** (< 99 €/mese): 19,00 € (o 12,95 $ su mercati USA)
  - **Fascia 2** (100 € – 1.499,99 €/mese): 9,95 € (o 9,95 $ su mercati USA)
  - **Fascia 3** (1.500 € – 2.499,99 €/mese): 6,95 € (o 8,95 $ su mercati USA)
  - **Fascia 4** (≥ 2.500 €/mese): 2,95 € (o 3,95 $ su mercati USA)
  - **Canone mensile**: Conto One = 0 €/mese, Classic = 3,95 €/mese, Max = 29,95 €/mese.
  - *Calcolo automatico o Override*: la piattaforma calcola automaticamente la fascia in base alle commissioni reali maturate nel mese, ma permette di impostare una fascia fissa manuale (override 1-4).
- **Directa - Profilo Semplice**: commissione fissa a 5,00 € per eseguito. Canone mensile zero.
- **Directa - Profilo Variabile**: 0,19% del controvalore con minimo 1,50 € e massimo 18,00 €. Canone mensile zero.
- **Personalizzato**: inserisci liberamente qualsiasi modalità commissionale.

### Campi di Configurazione Broker

| Campo | Descrizione |
|---|---|
| **Nome** | Nome descrittivo del broker (es. "Fineco Trading", "Directa SIM") |
| **Profilo** | Profilo di riferimento preimpostato o personalizzato |
| **Modalità commissioni** | `Fissa`, `Percentuale`, `Percentuale con Min/Max`, `Under 30` (Fineco), `Fasce per volume mensile` |
| **Valore commissione** | Valore numerico (importo fisso in € o percentuale) |
| **Minimo / Massimo commissione** | Soglie minime e massime per le commissioni percentuali con capping (es. 2,95 € / 19,00 €) |
| **Commissione USA** | Tariffa applicata agli ordini eseguiti in USD (es. 3,95 $ per Under 30 Fineco) |
| **Canone mensile** | Costo fisso di mantenimento del conto addebitato mensilmente |
| **Override fascia** | Forza una fascia specifica (1, 2, 3 o 4) per i conti a volume |
| **Tassazione ordinaria** | Aliquota sulle plusvalenze per azioni, ETF, derivati e obbligazioni societarie (default 26%) |
| **Aliquota Titoli di Stato** | Aliquota agevolata per titoli di stato whitelist (default 12,50%) |

---

## Tassazione e Titoli di Stato (DLgs 461/97)

La piattaforma distingue automaticamente la tassazione in base allo strumento finanziario negoziato:

1. **Aliquota Ordinaria (26%)**: applicata a plusvalenze su azioni, ETF, materie prime, derivati e obbligazioni corporate.
2. **Aliquota Titoli di Stato (12,50%)**: applicata a titoli di stato italiani (BTP, BOT, CCT, CTZ) e titoli di stato esteri compresi nella cosiddetta *white list* (Treasuries USA, Bund tedeschi, OAT francesi, Bonos spagnoli).
3. **Compensazione Ponderata delle Minusvalenze (Circolare AdE 19/E)**:
   - Una perdita nominale su un titolo di stato tassato al 12,50% non può compensare euro per euro una plusvalenza tassata al 26%.
   - In conformità con la normativa fiscale italiana, le minusvalenze su titoli di stato vengono inserite nello zainetto fiscale ponderate al **48,08%** (rapporto esatto $12{,}5 / 26 = 0{,}480769...$).
   - La dashboard e le schede trade mostrano sia la perdita nominale che l'effettiva compensazione fiscale generata.

### Selezione e Rilevamento dello Strumento

Quando inserisci o modifichi un'operazione, puoi specificare il tipo di strumento (`Azione`, `ETF`, `Obbligazione Corporate`, `Titolo di Stato`, `Crypto`, `Altro`).

Se inserisci un ISIN italiano che inizia per `IT0005` (BTP, BOT) o selezioni il mercato `MOT`, la piattaforma riconosce automaticamente lo strumento come Titolo di Stato e applica l'aliquota del 12,50%.

---

## Mercati / Borse

Ogni broker può avere uno o più **mercati** (borse) abilitati. I mercati definiscono:

- Su quali borse puoi operare tramite quel broker
- Orari di apertura e chiusura
- Fuso orario di riferimento
- Se il mercato è chiuso nel fine settimana

### Aggiungere un Mercato

Nella scheda del broker, clicca **+ Aggiungi mercato** (scheda Mercati).

> 💡 Per Directa SIM è disponibile un **seed** automatico che importa tutti i mercati dalla pagina ufficiale [directa.it/mercati](https://www.directa.it/mercati). Clicca **Importa mercati Directa** per popolare l'elenco automaticamente.

**Campi del mercato (borsa):**

| Campo | Descrizione |
|---|---|
| **Nome** | Nome del mercato (es. "Borsa Italiana", "MOT", "MTA") |
| **MIC** | Codice identificativo ISO 10383 (es. `XMIL`) |
| **Suffisso** | Suffisso del ticker Yahoo Finance (es. `.MI` per Milano) |
| **Paese** | Paese della borsa |
| **Valuta** | Valuta di negoziazione |
| **Fuso orario** | Fuso orario della borsa (es. `Europe/Rome`) |
| **Apertura / Chiusura** | Orari di negoziazione locali |
| **Chiuso nel weekend** | Se `Sì`, il mercato è considerato chiuso di sabato e domenica |

---

## Conti

I conti rappresentano portafogli di trading individuali, collegati a un broker.

### Aggiungere un Conto

Vai su **Conti** e clicca **+ Nuovo conto**.

| Campo | Descrizione |
|---|---|
| **Nome** | Nome identificativo (es. "Conto Fineco Trading", "Directa Principale") |
| **Broker** | Broker di riferimento per questo conto |
| **Valuta** | Valuta di denominazione del conto |
| **Saldo iniziale** | Capitale iniziale del conto |
| **Descrizione** | Note opzionali |

### Collegamento Broker-Conto

Un conto è sempre associato a un singolo broker. Questa associazione:

- Applica automaticamente le commissioni stimate (inclusi scaglioni e minimi/massimi)
- Usa l'aliquota ordinaria o titoli di stato del broker per la stima del P&L netto e del capital gain
- Limita l'autocompletamento dei simboli ai mercati abilitati del broker

### Libro Cassa (Cash Ledger)

Seleziona un conto per gestirne il **libro cassa** (depositi e prelievi):

- Registra un **deposito** o un **prelievo** con data, importo e descrizione opzionale
- Il libro cassa mostra i totali **Entrate / Uscite / Saldo** per il conto
- Le voci possono essere modificate o eliminate; il saldo del conto riflette i movimenti
