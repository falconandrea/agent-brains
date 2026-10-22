# TDD nel ciclo agente: valutazione per agent-brains

Mode: assessment
Data: 2026-10-22
Checkout: `f065e5a970554b91fd86427a7e123c2fbc4caa7b`

## Stato aggiornato dopo la revisione locale (2026-10-22)

Riconfrontato con `af37cf6`: U9–U11 (puntatori workflow, avviso OpenCode e
ignore runtime Pi) sono completati e committati. Non cambiano le evidenze
tecniche pertinenti qui. Le fonti upstream restano agli snapshot originali:
questa revisione non è una nuova verifica upstream o un nuovo benchmark.
La [roadmap concordata](../plans/pi-plugin-adoption-roadmap.md#agreed-consolidation-sequence-2026-10-22)
possiede ordine e stato del lavoro futuro; questa ricerca conserva le evidenze.

Decisione: confluire nel blocco C2 con `test-review` e i controlli QA selezionati,
senza nuova skill o reviewer obbligatorio. Prima C1/U15; il lavoro sul contratto
degli esiti verify resta distinto e deve preservare retry e resume. Nessuna
modifica a istruzioni o codice implementata da questa revisione.

## Perimetro

Lettura dell'articolo originale e ispezione statica del checkout locale, confrontate con il report fornito dall'utente. Nessuna modifica a codice, skill o configurazione; nessuna suite o nuova mutazione eseguita. I risultati storici citati sotto appartengono ai relativi pilot, non a questa sessione. I file non tracciati già presenti sono rimasti intatti.

## Fatti upstream e limiti

L'[articolo di Birgitta Böckeler](https://martinfowler.com/articles/exploring-gen-ai/tdd-in-the-agent-loop.html) riguarda soprattutto il TDD svolto interamente dall'agente. Distingue questo caso da scenari definiti dall'umano e checkpoint umani sui test.

Il confronto esplorativo usa Sonnet 4.6, giudizi di Opus 4.8, task greenfield di business logic e coverage richiesta almeno all'80%. Non emerge un vantaggio chiaro del TDD su qualità o mutation score. I batch medi riutilizzano le soluzioni non-TDD: non sono repliche completamente indipendenti.

L'appendice riporta moltiplicatori dei token di circa 2,96–8,50, contando anche letture della cache e contesto ripetuto. Non equivalgono a moltiplicatori di costo economico. Il vantaggio attribuito al design iniziale è un'ipotesi ricavata dalle tracce, non una causa dimostrata.

**Inferenza per noi:** l'articolo giustifica riesaminare prescrizioni costose; non dimostra che test-first sia inutile né che test scritti dopo siano equivalenti in ogni contesto.

## Evidenza locale: cosa confermo e cosa correggo

| Punto del report ricevuto | Riscontro locale e conseguenza |
|---|---|
| Buona architettura di verifica già presente | Confermato: [feature.ts](../../src/workflows/feature.ts) esegue controlli prima della review e gestisce retry; [verify.ts](../../src/verify.ts) congela comandi e sezioni script. Queste protezioni non certificano l'efficacia delle assertion. |
| TDD disponibile al developer Pi senza shell | Confermato: [common.list](../../profiles/common.list), [skill-router.ts](../../src/skill-router.ts), allowlist e prompt developer. Disponibilità/routing non provano che la skill sia stata attivata o seguita in un run reale. |
| Serve cambiare soprattutto la skill TDD | Incompleto: [test-master](../../.agents/skills/test-master/SKILL.md) rimanda, quando il contesto è TDD, a [tdd-iron-laws.md](../../.agents/skills/test-master/references/tdd-iron-laws.md), con obblighi assoluti test-first. È un conflitto potenziale quando quella reference viene caricata, non un obbligo globale di test-master. [verification-before-completion](../../.agents/skills/verification-before-completion/SKILL.md), categoria craft instradata al developer, richiede esecuzioni che quel ruolo non può fare. Non basta correggere un solo file. |
| La nostra disciplina è red/green/refactor | Da precisare: [tdd](../../.agents/skills/tdd/SKILL.md) esclude esplicitamente il refactoring dal ciclo e lo rinvia alla review, mentre la reference di test-master lo include. È una scelta locale da valutare, non una conseguenza dell'articolo. |
| Feature prescrive sempre il procedimento | Sovrastimato: [feature](../../.agents/skills/feature/SKILL.md) dice già «TDD where applicable». Manca una definizione dell'applicabilità, non un'eccezione completamente nuova. Inoltre questa skill conversazionale è operativa ed esclusa dai figli Pi; non coincide con `/feature` implementato in TypeScript. |
| Review della qualità dei test da rafforzare | Confermato: [feature-prompts.ts](../../src/workflows/feature-prompts.ts) nomina test quality, senza una domanda esplicita su difetto rilevabile e origine dell'atteso. Il reviewer non riceve le testing skill tramite il router. |
| Zero check può risultare passed | Confermato: `blockingFailures.length === 0` produce `passed: true` anche per risultati vuoti. Il prompt mostra già «none configured» quando la lista è vuota: non manca ogni trasparenza, manca una distinzione strutturata. Su resume diretto in review la lista è vuota anche perché i check vengono saltati: vuoto non significa sempre non configurato. |

Il conteggio storico dei file di test non misura la protezione effettiva e non è un criterio di adozione.

## La parte già sperimentata qui

[test-review](../../extra/skills/test-review/SKILL.md) chiede già fonte indipendente dell'atteso, difetto plausibile intercettabile, proporzionalità dei test e riconoscimento della copertura esistente. È un extra sperimentale, non una fase obbligatoria.

Il [pilot locale](../evals/test-review/README.md) documenta una prova su copie isolate: togliendo due guardie di ownership la suite storica restava verde; due probe mirati fallivano sul codice alterato e passavano dopo il ripristino. È già un esempio concreto del metodo proposto nel report ricevuto.

Lo stesso pilot registra due race scoperte dall'utente e sfuggite sia alla review ordinaria sia a test-review: controllare solo lo stato finale può perdere garanzie sull'ordine degli eventi. **Inferenza:** per orchestrazione, ordine, cancellazione e cleanup sono candidati più motivati di una scelta automatica delle sole funzioni pure. La purezza rende economica una mutazione, non ne determina il valore.

## Cosa importare, con quale costo

1. **Scenari di accettazione mirati.** Per i comportamenti rischiosi, indicare stato iniziale/input, evento e risultato osservabile; aggiungere rifiuto o invariante solo dove materiale. Riutilizzare il gate PRD esistente. Niente quota happy/negative per ogni criterio: produrrebbe rumore anche nelle modifiche semplici.
2. **Tre domande nella review esistente.** Quale contratto protegge il test? Da dove viene l'atteso? Quale difetto realistico farebbe fallire l'assertion? Recuperare la formulazione da test-review, senza caricare l'intera skill né introdurre un altro reviewer obbligatorio. Non chiedere nuovi test se la copertura esistente basta.
3. **Contratto coerente con gli strumenti.** TDD rigoroso quando richiesto e quando si può osservare il ciclo. Nel developer Pi, autore dei test e responsabile della loro esecuzione sono distinti: l'agente scrive, l'orchestratore esegue, il reviewer valuta la protezione. Non dichiarare red/green non osservati. L'approvazione PRD può valere come accordo sui confini già definiti; chiedere di nuovo solo per nuove decisioni materiali.
4. **Esito della verifica, lavoro separato.** Distinguere zero comandi, controlli eseguiti, fallimenti non bloccanti e risultati riutilizzati/non disponibili al resume. Conservare la semantica dei retry nei log storici: [ports.ts](../../src/ports.ts) e [resume.ts](../../src/workflows/resume.ts) consumano il booleano attuale. È una modifica di contratto con verifiche mirate, non solo una stringa nel report.

I punti 1–3 sono un allineamento delle istruzioni; il quarto richiede progettazione e codice. Prima di attuare il terzo, controllare insieme tdd, feature, test-master e verification-before-completion, preservando l'utilità di queste skill nelle sessioni con shell. Nessuna necessità di rendere l'intera raccolta meno rigorosa.

## Alternative e cose da scartare

- **Status quo:** nessun costo immediato, ma restano conflitti documentati fra istruzioni e capacità del ruolo.
- **Importazione mirata:** basso costo e reversibilità alta; rischio di aggiungere prompt senza cambiarne il comportamento, da verificare con casi reali.
- **Riscrittura generale anti-TDD:** nessuna evidenza locale che la giustifichi; perderebbe un metodo utile per bug riproducibili e lavoro guidato dall'utente.
- **Framework mutation permanente, coverage target globale o nuovi gate:** prematuri. Non risolvono automaticamente requisiti omessi o aspettative sbagliate.
- **Nuovo benchmark esteso subito:** sproporzionato. Prima riutilizzare il pilot esistente e un problema reale; non sostituire il lavoro di prodotto con manutenzione degli esperimenti.

Per valutare successivamente le modifiche ai prompt: stesso commit, stessi task e strumenti, criterio di correttezza fissato prima delle esecuzioni, almeno un caso sano e uno con regressione nota. Separare l'effetto degli scenari da quello della rimozione delle prescrizioni, altrimenti non sapremo quale variazione aiuta. Confrontare difetti mancati, richieste inutili e overhead; distinguere token cache/fresh e costo solo se misurabile. Pochi casi orientano una decisione, non dimostrano una legge generale.

## Decisione

**Verdict: selectively import.** Il valore nuovo è limitato ma concreto: scenari osservabili e criteri di review più precisi, più la correzione dei conflitti fra istruzioni e capacità Pi. Il repository ha già sia l'architettura sia un primo esperimento sugli oracoli indipendenti. Non serve una nuova filosofia o una nuova skill.

Priorità: allineamento delle istruzioni e poche domande di review; trasparenza dell'esito deterministico come intervento distinto. Rivalutare mutation tooling solo quando ulteriori probe isolati trovano lacune materiali con costo sostenibile. Rivalutare l'integrazione di test-review sulla base del pilot e del suo overhead, non in virtù dell'articolo.
