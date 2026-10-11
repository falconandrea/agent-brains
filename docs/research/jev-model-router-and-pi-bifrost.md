# JEV model router e Pi-Bifrost

Date: 2026-10-11
Mode: research

## Esito

Sì: l’idea generale era già stata analizzata nel report del 2026-09-21 sul
free-form Pi e sull’entry router. Il thread Reddit e Pi-Bifrost aggiungono però
un’implementazione concreta e due vincoli da tenere espliciti: il pin della
sessione principale preserva meglio la locality della cache, mentre i child che
caricano Bifrost possono perdere un assegnamento esplicito di modello. Bifrost
può essere un adapter di classificazione/routing, ma non sostituisce la policy
locale dei workflow.

## Cosa propone il thread

L’autore propone `prompt → JEV → modello`, usando JEV per scegliere fra opzioni
limitate e codice deterministico per applicare la scelta. Nei commenti emerge
il workflow più interessante per questo repository: modello principale fissato
con `/bifrost pin`, child/subagent instradati separatamente, e un eventuale
router più costoso solo per i casi ambigui. La preoccupazione corretta è la
prompt cache: cambiare provider/modello a ogni turno può frammentare la cache.
Queste sono affermazioni della discussione, non una verifica indipendente
([thread Reddit](https://www.reddit.com/r/PiCodingAgent/comments/1wlczow/i_think_i_found_the_best_use_case_for_jev_and_pi/)).

## Fatti upstream verificati

### Bifrost separa classificazione e selezione

Pi-Bifrost è un’estensione Pi, non un proxy: configura tier come `quick`,
`general` e `frontier`, filtra i modelli non sani e applica una strategia
(`first`, prezzo, contesto o `random`) al pool del tier. Un classificatore sceglie
solo il tier; non vede il pool provider e non sceglie il modello esatto. La
pipeline sorgente esegue, in ordine, override/regole dirette, cache locale,
classificatore diretto, classificatore prompt, regole regex e default
([README](https://github.com/iamaamir/pi-bifrost/blob/main/README.md),
[configuration](https://github.com/iamaamir/pi-bifrost/blob/main/docs/guide/configuration.md),
[classification-pipeline.ts](https://github.com/iamaamir/pi-bifrost/blob/main/classification-pipeline.ts)).

Questo conferma la formula architetturale che avevamo già usato: il giudizio
probabilistico propone una categoria, mentre Bifrost e il codice locale
mantengono eleggibilità, policy e scelta eseguibile.

### Cosa riceve JEV e cosa restituisce

Il backend TypeSafe/Jev riceve il prompt corrente e i criteri dei tier; restituisce
un tier configurato, le probabilità per i tier e una confidence. Non riceve per
default cronologia, file, output dei tool o pool dei modelli. È un endpoint
TypeSafe hosted con credenziale; l’implementazione upstream non espone un
trasporto locale o un base URL OpenRouter generico
([classifier guide](https://github.com/iamaamir/pi-bifrost/blob/main/docs/guide/classifiers.md),
[typesafe-classifier.ts](https://github.com/iamaamir/pi-bifrost/blob/main/typesafe-classifier.ts)).

La confidence misura quanto la distribuzione è concentrata, non la correttezza.
La documentazione Bifrost riporta una valutazione esplorativa con giudizi stabili
su prompt chiari ma anche casi di under-routing ad alta confidence per task
meccanicamente piccoli e ad alta conseguenza. È un limite materiale per una
policy `quick` basata soltanto sulla confidence; i criteri vanno versionati e
provati su casi rappresentativi
([classifier guide, sezione TypeSafe/Jev](https://github.com/iamaamir/pi-bifrost/blob/main/docs/guide/classifiers.md)).

### Fallback, timeout e circuit breaker

La configurazione prevede una soglia di confidence, tipicamente `0.8`, e un
fallback `prompt` o `regex`. Una risposta sotto soglia diventa un “miss” e la
pipeline può proseguire verso il classificatore prompt, le regole e il default.
Credenziale mancante, timeout, errore di rete, risposta invalida, rate limit o
circuito aperto seguono lo stesso percorso di fallback; il trasporto diretto
usa retry limitati e non ripete automaticamente il prompt utente su un altro
modello. I circuiti di affidabilità persistono e servono a evitare nuovi
tentativi sul backend/modello guasto
([classifiers guide](https://github.com/iamaamir/pi-bifrost/blob/main/docs/guide/classifiers.md),
[typesafe-classifier.ts](https://github.com/iamaamir/pi-bifrost/blob/main/typesafe-classifier.ts),
[reliability guide](https://github.com/iamaamir/pi-bifrost/blob/main/docs/guide/reliability-and-cache.md)).

### Cache: due meccanismi diversi

Bifrost ha una cache locale della classificazione: conserva termini normalizzati
del prompt e tier scelto per evitare di riclassificare. Non conserva risposte e
non mostra hit, durata o risparmio della provider prompt cache; i termini
normalizzati possono comunque essere sensibili.

La prompt/prefix cache del provider resta gestita da Pi e dal provider. Ogni
coppia provider/modello ha una storia indipendente: nel percorso `A → B → A`, A
può riusare il prefisso ancora valido della propria richiesta precedente, mentre
il contenuto aggiunto durante B è una coda non cached. Bifrost non garantisce hit,
risparmio o minore latenza. Il pin è quindi la scelta giusta per una lunga
sessione iterativa dove la continuità conta più del task-fit
([prompt-caching guide](https://github.com/iamaamir/pi-bifrost/blob/main/docs/guide/prompt-caching.md)).

Il pattern documentato è precisamente quello del thread: `main session → pinned
model`, child non assegnati → routing proprio. Il pin è locale alla sessione e
non si propaga ai child. Un child che carica Bifrost parte unpinned e Bifrost
non sa distinguere il suo modello iniziale da un assegnamento esplicito per ruolo;
se il modello del child deve restare fisso, quel child non deve caricare Bifrost
([routing controls](https://github.com/iamaamir/pi-bifrost/blob/main/docs/guide/routing-controls.md),
[prompt-caching guide](https://github.com/iamaamir/pi-bifrost/blob/main/docs/guide/prompt-caching.md)).

## Evidenza locale

L’analisi precedente aveva già proposto un `EntryDecision` con intent, scope,
rischio, ambiguità e confidence, policy deterministica, shadow mode, evaluation
set e un `runQuickWorkflow`; Jev era indicato come adapter opzionale dopo aver
definito policy e casi di prova
([dynamic harness assessment](./dynamic-harness-and-seo-integration-assessment.md)).

Il report più recente aveva inoltre separato entry routing e semantic discovery
degli strumenti: autorizzazione e policy devono restare locali, mentre un
classificatore può solo classificare o ordinare candidati
([web chat package assessment](./web-chat-pi-packages-assessment.md)). Non ho
trovato codice o dipendenza JEV/Bifrost nel repository; il lockfile usa Pi
`@earendil-works/pi-coding-agent` `0.84.2`
([package-lock.json](../../package-lock.json#L544)).

Questo crea un vincolo di compatibilità immediato: Bifrost `0.4.5` dichiara Pi
minimo `1.0.1`, quindi non è un trial installabile sull’attuale Pi senza una
tranche separata di upgrade e spike
([pi-bifrost package.json](https://raw.githubusercontent.com/iamaamir/pi-bifrost/main/package.json)).

Inoltre `PiAgentRunner` crea child session isolate, applica skill e tool
allowlist e risolve esplicitamente provider/modello per ruolo. Un provider
assegnato deve rimanere quel provider per conservare, fra l’altro, l’indipendenza
della review; il resource loader viene costruito per ogni child
([pi-agent-runner.ts](../../src/pi/pi-agent-runner.ts#L167)). Un’estensione Bifrost
caricata indiscriminatamente nei child potrebbe interferire con quel contratto,
quindi il pattern “main pinned, child routed” è applicabile solo ai child senza
assegnamento rigido, oppure richiede esclusione esplicita di Bifrost.

## Alternative citate nel thread

[Von](https://github.com/wfzyx/von) è un decision model locale Apache-2.0,
compatibile con il wire protocol `/v1/systemone`, ma il README avverte che è
English-only e che fuori distribuzione la confidence può degradare. [Laya](https://github.com/NandhaKishorM/laya)
è un decision engine Apache-2.0 dichiarato multilingue con router fra checkpoint.
Sono alternative interessanti per una futura interfaccia `ClassifierBackend`, ma
Bifrost oggi punta all’endpoint TypeSafe fisso: nessuno dei due è un cambio di
configurazione già supportato dal package.

## Implicazioni per il progetto

1. Il nuovo materiale rafforza, non cambia, la direzione già scelta: definire
   prima policy, evaluation set e fallback; poi provare JEV in shadow mode come
   adapter opzionale.
2. Non usare JEV per autorizzare workflow, tool, scritture, approvazioni o azioni
   distruttive. Un tier `quick` deve essere bloccato dalla policy locale quando
   compaiono rischio, conseguenza o ambiguità, anche con confidence alta.
3. Il primo esperimento utile deve misurare separatamente main session e child:
   modello effettivo, cache-read/cache-write se disponibili, latenza, costo,
   route scelta, under-routing e fallback. Il solo risparmio di token non basta.
4. Per il caso concreto dei nostri child, mantenere Bifrost fuori dai ruoli con
   modello provider-specifico (in particolare review indipendente) finché non
   esiste un’integrazione che preservi assegnamenti espliciti.
5. Considerare l’upgrade Pi come prerequisito tecnico indipendente, non come
   parte nascosta di un’eventuale prova JEV.

Nessuna installazione, modifica al codice o trial live è stata eseguita.
