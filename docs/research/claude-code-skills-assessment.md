# Valutazione di claude-code-skills e verifica del report ChatGPT

Mode: assessment
Data: 2026-10-20

## Stato aggiornato dopo la revisione locale (2026-10-22)

Riconfrontato con `af37cf6`: U9–U11 (puntatori workflow, avviso OpenCode e
ignore runtime Pi) sono completati e committati. Non cambiano le evidenze
tecniche pertinenti qui. Le fonti upstream restano agli snapshot originali:
questa revisione non è una nuova verifica upstream o un nuovo benchmark.
La [roadmap concordata](../plans/pi-plugin-adoption-roadmap.md#agreed-consolidation-sequence-2026-10-22)
possiede ordine e stato del lavoro futuro; questa ricerca conserva le evidenze.

Decisione: importare nel blocco C2 soltanto i controlli di qualità dei test e
l'enforcement dei gate pertinenti, riusando la review esistente. I pilot 55/53
restano condizionati a un bisogno reale, senza una coda parallela. I controlli
81 possono alimentare il futuro audit C5 dell'utilità delle skill, con confronto
con/senza guida sui modelli attuali; nessuna nuova skill `skills-audit` implicita.

## Perimetro e fonti

Esaminato il checkout upstream al commit `e688949073c43212d7cef4f0d0ef623a5b05d0d1`, coincidente con quello citato nel report. Checkout locale di agent-brains: `f065e5a970554b91fd86427a7e123c2fbc4caa7b`. La directory preesistente non tracciata `extra/skills/ga4-analytics/` è esclusa.

Lettura approfondita delle candidate QA, del reviewer di skill e delle opportunità aggiuntive sotto indicate; ricognizione del catalogo restante. Analisi statica di istruzioni, fixture, grader e workflow, senza eseguire skill su modelli, benchmark o validator upstream. Nessuna installazione o modifica alle skill locali. Questo documento è l'unico artefatto prodotto.

I link upstream seguenti fissano il commit, evitando che la valutazione segua implicitamente modifiche future:

- [Catalogo](https://github.com/levnikolaevich/claude-code-skills/blob/e688949073c43212d7cef4f0d0ef623a5b05d0d1/README.md).
- [Regole del repository](https://github.com/levnikolaevich/claude-code-skills/blob/e688949073c43212d7cef4f0d0ef623a5b05d0d1/AGENTS.md).
- [Metodo di valutazione comportamentale](https://github.com/levnikolaevich/claude-code-skills/blob/e688949073c43212d7cef4f0d0ef623a5b05d0d1/docs/behavioral-validation.md).

## Cosa confermo e cosa correggo nel report

**Fatti upstream.** QA contiene sette skill autonome, con le responsabilità descritte correttamente. I contratti distinguono audit, scrittura dei test e implementazione. Evidenza fresca, oracoli indipendenti e materialità dei finding sono richieste reali, non una lettura ottimistica del README. Tuttavia sono istruzioni: non provano da sole che l'agente le segua.

**Correzione verificata:** allo stesso commit il catalogo contiene **41 skill in 9 suite**, non 40 in 10. Conteggio riproducibile: file `plugins/*/skills/*/SKILL.md` e directory immediatamente sotto `plugins/`. Non cambia la decisione, ma il report non è esatto su tutti i fatti.

**Evidenza locale.** La separazione fra `test-review` sul diff e audit del portafoglio è corretta. Però `test-master` già tratta strategia, coverage gaps, flakiness, fixture e manutenzione: il contributo nuovo di 55 è più stretto di quanto suggerisca un confronto basato solo sui nomi. Anche indipendenza dei reviewer e congelamento delle evidenze sono già presenti, in parte in forma eseguibile, in Pi Brain.

**Inferenza da correggere:** il pilot che rinvia `skills-audit` riguarda soprattutto il controllo delle modifiche upstream e della provenienza; 81 controlla anche contraddizioni interne, trigger e distribuzione. La ricorrenza del primo processo non misura automaticamente il bisogno del secondo. Il pilot è un vincolo di contesto da riesaminare, non la prova che 81 sia superflua o necessaria.

**Limite di verifica:** non ho riconfermato il singolo run Actions del 18 ottobre citato nel report. Il workflow ispezionato separa validazioni strutturali e valutazioni comportamentali; non attribuisco un PASS comportamentale alla presenza della CI.

## Valore per la nostra raccolta

| Candidata | Valore aggiuntivo concreto | Destinazione consigliata |
|---|---|---|
| 55 — Test Suite Auditor | Decisioni KEEP/ADD/UPDATE/MERGE/DELETE/NO_TEST, sostituzione delle protezioni prima della cancellazione, quarantena visibile, costi dei gate | Primo pilot di un protocollo read-only per il portafoglio; separato dal contratto diff-only di test-review |
| 53 — Documentation Auditor | Journey dell'operatore, comandi e flag documentati contro parser reale, esempi e docstring contro firme/effetti | Secondo pilot dedicato alla documentazione tecnica; preservare context-audit |
| 81 — Skill Reviewer | Contraddizioni fra trigger, permessi, workflow, output e distribuzione; distinzione statico/comportamentale | Checklist nel prossimo audit manuale delle skill; formalizzazione solo dopo utilità osservata |
| 46 — Quality Gate Engineer | Dimostrare che un controllo rifiuta input invalido e accetta input valido passando dal vero entrypoint | Importare selettivamente il metodo; candidata trascurata dal report |
| 57 — Persistence Auditor | Invarianti, transazioni, retry, cancellazione, stream abbandonati, budget connessioni fra repliche | Lente opzionale per progetti con persistenza rilevante |
| 98 — Mutation Reliability Engineer | Risposta persa dopo effetto riuscito, idempotenza, concorrenti, recupero dopo interruzione | Materiale specialistico da adattare quando emerge un caso reale |
| 99 — Database Lifecycle Engineer | Migrazioni da stato precedente, backfill interrotto, compatibilità fra versioni e restore verificato | Materiale per migrazioni/recupero; distinto dal tuning SQL |
| 33 — Plan Reviewer | Riutilizzo esistente, decisioni mancanti, fattibilità e verifica del piano | Pochi controlli nel planning attuale, senza nuova skill generalista |
| 45 — Benchmark Comparator | Confronto simmetrico, regole fissate prima dei risultati, correttezza prima dei costi | Metodo per i pilot e confronti di modelli, senza nuovo componente |
| 51/52/54/56 | Responsabilità già ampiamente coperte | Nessuna importazione completa; recuperare solo controlli specifici mancanti |

Fonti delle priorità principali: [55](https://github.com/levnikolaevich/claude-code-skills/blob/e688949073c43212d7cef4f0d0ef623a5b05d0d1/plugins/quality-assurance-suite/skills/ln-55-test-suite-auditor/SKILL.md), [53](https://github.com/levnikolaevich/claude-code-skills/blob/e688949073c43212d7cef4f0d0ef623a5b05d0d1/plugins/quality-assurance-suite/skills/ln-53-documentation-auditor/SKILL.md), [81](https://github.com/levnikolaevich/claude-code-skills/blob/e688949073c43212d7cef4f0d0ef623a5b05d0d1/plugins/skill-maintenance-suite/skills/ln-81-skill-reviewer/SKILL.md), [46](https://github.com/levnikolaevich/claude-code-skills/blob/e688949073c43212d7cef4f0d0ef623a5b05d0d1/plugins/implementation-suite/skills/ln-46-quality-gate-engineer/SKILL.md), [98](https://github.com/levnikolaevich/claude-code-skills/blob/e688949073c43212d7cef4f0d0ef623a5b05d0d1/plugins/engineering-foundation-suite/skills/ln-98-mutation-reliability-engineer/SKILL.md), [99](https://github.com/levnikolaevich/claude-code-skills/blob/e688949073c43212d7cef4f0d0ef623a5b05d0d1/plugins/engineering-foundation-suite/skills/ln-99-database-lifecycle-engineer/SKILL.md).

### Perché 46 merita attenzione

Un comando lint verde può aver selezionato zero file oppure il wrapper può aver ignorato il fallimento. 46 richiede fixture valide/invalide attraverso l'entrypoint effettivo e distingue «controllo funzionante» da «progetto conforme». È un metodo più concreto di aggiungere una generica checklist QA. `agent-readiness` distingue già configurato/documentato/eseguito: la novità incrementale è la prova negativa del gate e della propagazione dell'errore, soprattutto quando si configura quel gate.

### Sovrapposizioni locali verificate

- [test-review](../../extra/skills/test-review/SKILL.md) già contesta aspettative circolari, mock che sostituiscono il comportamento e test ridondanti. [Il pilot](../evals/test-review/README.md) include mutazioni che lasciano verde la suite esistente e probe mirati che falliscono: non partiamo da zero sugli oracoli.
- [test-master](../../.agents/skills/test-master/SKILL.md) copre già ampia QA. Un suo eventuale protocollo di portfolio audit deve distinguere esplicitamente analisi read-only e creazione dei test; aggiungere una reference da sola non garantisce routing corretto.
- [context-audit](../../.agents/skills/context-audit/SKILL.md) possiede gerarchia agentica e authority. README operativi, API docs e docstring costituiscono un perimetro distinto; i documenti condivisi vanno assegnati in base alla domanda dell'audit.
- [code-review](../../.agents/skills/code-review/SKILL.md) ha già due assi indipendenti. [review.ts](../../src/review.ts) e [feature.ts](../../src/workflows/feature.ts) aggiungono schema, limiti, controllo read-only e verifica deterministica. Eviterei di ricreare tutto nelle istruzioni di 52.
- [agent-readiness](../../.agents/skills/agent-readiness/SKILL.md), security-reviewer e gli strumenti architetturali rendono poco utile un altro auditor generale. sql-pro, riferimenti PostgreSQL e best practice Laravel coprono porzioni di 57/98/99, senza equivalere a un workflow unico di verifica dei fallimenti parziali.
- [Il precedente su skills-audit](upstream-review-pilot-assessment.md) rinvia la creazione fino a maggiore ricorrenza. Un audit manuale con i controlli nuovi di 81 può verificare se esiste una domanda diversa dal semplice aggiornamento upstream.

## Cosa non trasferire

55 prescrive E2E come preferenza generale e limita unit/integration ai casi difficili da verificare attraverso E2E. Non è una preferenza neutra: per orchestrazione e contratti interni stabili può aumentare costo e fragilità. Manteniamo la scelta locale del confine più efficace per il rischio.

I file misurati sono corposi: 55 circa 19.000 caratteri, 53 circa 17.000, 52 circa 25.500, prima delle reference. Il contratto comune e la contabilità di ogni checkbox aumentano il carico. Non esiste qui una misura che dimostri un miglioramento proporzionale della qualità. Eviterei il protocollo Six Hats, il formato obbligatorio a cinque campi e stati dettagliati per tutte le verifiche.

Le fixture sono un punto interessante, ma non una certificazione. Il caso 55 presenta un cap tariffario mancante con test che riproducono la formula; 53 presenta un falso `--dry-run` ignorato dal parser; 81 combina un contratto read-only con scrittura/commit. Sono difetti ben costruiti, ma evidenti e singoli: servono anche casi sani e near-negative. Alcuni grader controllano tool Edit/Write o pattern finali, che non provano da soli l'assenza di ogni modifica tramite shell. La documentazione upstream stessa dichiara limiti di osservazione delle scritture ripristinate prima dello snapshot finale.

## Esperimento proposto, senza proliferare le skill

1. **Portafoglio test:** incarico identico a baseline e candidato: audit dell'intera suite, stesso commit, tempo, strumenti e criteri. Baseline test-master; test-review solo nel suo sottoperimetro diff. Usare un caso locale con oracolo debole noto, uno con isolamento/ordine e uno sano. Un confronto diretto 55-vs-test-review sull'intero portafoglio favorirebbe 55 per costruzione.
2. **Documentazione tecnica:** stesso README/CLI e stessa domanda operativa. Confrontare audit normale e protocollo 53; context-audit è il confronto appropriato solo per i documenti che rientrano nel suo ambito. Includere esempi intenzionali e documenti storici corretti per misurare falsi positivi.
3. **Skill:** audit statico di una skill locale e dei suoi confini con le vicine, distinguendo qualità intrinseca e revisione delle modifiche upstream. Nessuna esecuzione su modelli implicita.

Prima dei risultati fissare finding materiali attesi, falsi positivi, duplicati, finding fuori scope e costo osservabile. Valutare i risultati senza conoscere il braccio, dove possibile. Un finding aggiuntivo in una fixture nota è un segnale per proseguire, non prova sufficiente per distribuire una nuova skill: chiederei ricorrenza in un incarico reale e un caso sano senza richieste di test o modifiche inutili.

Se il pilot conferma valore, creare al massimo un protocollo opzionale per volta. Conservare sorgente, commit e notice MIT completo per testo adattato sostanzialmente; i soli metadati non sostituiscono il notice. [Licenza upstream](https://github.com/levnikolaevich/claude-code-skills/blob/e688949073c43212d7cef4f0d0ef623a5b05d0d1/LICENSE).

## Decisione

**Verdict: selectively import.** Il report è sostanzialmente sensato, con un errore di inventario e un confronto sperimentale da rendere più equo. Recuperare selettivamente metodi e casi: nel lavoro concordato C2 iniziare dai controlli utili alla review esistente e dalla prova di enforcement di 46. Il pilot di portafoglio 55 e quello documentale 53 restano condizionati a un bisogno reale; 81 alimenta il futuro audit C5. Non installare la suite completa né sostituire i workflow locali. Rivalutare skill permanenti quando i pilot producono valore ricorrente; rivalutare 57/98/99 al primo incarico concreto su concorrenza, retry o migrazione con rischio di dati.
