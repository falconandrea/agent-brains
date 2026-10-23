# Piano di centralizzazione skills e workflow

Data dell'inventario: 19 ottobre 2026. Riconciliazione: 22 ottobre 2026, rispetto a `cdf54f3`. Stato: piano da implementare.

Il piano è stato trasferito da `/Users/andreafalcon/dev/AI-WORKFLOW-MIGRATION.md` nel repository agent-brains. La [roadmap](pi-plugin-adoption-roadmap.md#cross-harness-workflow-migration-m) governa priorità e coordinamento con gli altri lavori; questo documento contiene la checklist dettagliata e lo stato per progetto. Non duplicare le checklist nella roadmap. I percorsi dei repository consumatori in questo documento sono relativi alla directory `dev`, non alla root di agent-brains.

Questo documento coordina il lavoro tra repository e configurazione del Mac. La sua creazione non modifica le skills, i progetti o le configurazioni globali. Spuntare le attività solo dopo averle implementate e verificate nel relativo ambito.

### Raccordo con le modifiche del 22 ottobre

Le modifiche `af37cf6`, `201ba14`, `cc05d97` e `cdf54f3` non cambiano l'obiettivo della migrazione. Sono parte della base da preservare, non attività di migrazione da ripetere:

- C1/C2 sono completati nella roadmap; non riaprire consolidamento TDD o politica dei verdetti come nuove attività di questo piano.
- La futura `spec-and-tasks` deve mantenere i criteri osservabili e le verifiche proporzionate introdotti in `feature`: stato/input, evento, risultato, invarianti quando rilevanti, riuso di copertura adeguata.
- Preservare la distinzione tra red/green osservato con accesso ai comandi e verifica differita del developer Pi senza shell. L'orchestratore esegue i controlli; l'agente non dichiara esiti non osservati.
- `tdd`, `test-master` e `verification-before-completion` sono a gestione locale: mantenere provenienza/licenze e protezioni contro reinstallazione o aggiornamento upstream. La separazione spec/sviluppo/review deve conservare le nuove domande su contratto, fonte del risultato atteso e regressione plausibile.
- Il nuovo adattatore OpenCode e il workflow link di `solution-capture` completano il sistema attuale. `tests/repo.test.ts` verifica ora la tabella README, i pointer e i link: migrare insieme documentazione, adattatori e test quando cambia il modello di distribuzione.
- Conservare le correzioni di `setup.sh` per newline del `.gitignore`, esclusioni runtime Pi e avviso della modalità OpenCode-only. Il nuovo installer non deve perdere queste garanzie dove ancora applicabili.
- Mantenere `needs_human` per `changes_requested` senza problemi bloccanti, senza un altro fix round; le review approvate con soli warning possono completare.
- C4 misura contesto e costi prima di ottimizzare; prima di esporre globalmente il catalogo completo registrare una baseline coordinata con C4. C5 possiede la valutazione di utilità/overlap delle skills: questo piano non autorizza eliminazioni autonome.

La centralizzazione globale, la rinomina di `feature` e la migrazione dei consumatori non risultano implementate nei commit esaminati. Le checklist sotto restano aperte.

## 1. Obiettivo e decisioni condivise

- `agent-brains` rimane la fonte unica delle skills e delle procedure condivise, indipendente dall'harness.
- Pi carica globalmente il pacchetto locale `agent-brains`; Codex e OpenCode accedono al catalogo globale condiviso.
- Nessun nuovo collegamento alle skills è necessario per ogni progetto.
- Ogni progetto mantiene documenti e stato propri in `.ai/`, con regole stabili in `AGENTS.md`.
- La skill oggi chiamata `feature` diventa `spec-and-tasks`: brainstorming, chiarimento dei requisiti, specifica e task. Non implementa e non esegue la review del codice.
- L'implementazione passa a un agente/sessione dedicato; la review a un altro agente/sessione. L'automazione del passaggio dipende dall'harness.
- Pi `/feature` rimane il comando dell'orchestratore programmato. Pi `/skill:spec-and-tasks` richiama invece la procedura documentale condivisa.
- Convenzione proposta per i nuovi lavori: `.ai/features/<slug>/spec.md` e `tasks.md`. Conservare leggibili i documenti storici `prd-<slug>.md` / `tasks-<slug>.md`.

## 2. Risultati dell'ispezione e limiti

- Il catalogo `agent-brains/.agents/skills` contiene 64 directory di skills, tutte dotate di `SKILL.md`.
- I progetti esistenti espongono selezioni differenti tramite collegamenti per skill: ad esempio linkedin-analytics 44, craftcv.online 42, appuntidalgiappone 34, careguru-brain 33. Non sono cataloghi completi.
- Nella scansione dei collegamenti delle configurazioni AI, limitata alla profondità esaminata, non sono emerse destinazioni rotte. Questo non dimostra il corretto caricamento da parte degli harness.
- `~/.agents/skills` contiene `diagnose`, `find-skills`, `i-have-adhd`; non espone il catalogo di agent-brains.
- `~/.config/opencode/skills` contiene anche `react-doctor`: controllare duplicazioni prima della migrazione.
- `~/.pi/agent/settings.json` registra già il pacchetto locale `../../dev/agent-brains`; il percorso risolve correttamente. Il manifest espone estensioni e skills. Il caricamento in una sessione Pi non è stato provato durante questo inventario.
- Cinque manifest di skills contengono riferimenti locali a `.agents/skills/`: `context-audit`, `feature`, `nextjs`, `astro`, `laravel`. Estendere la ricerca a riferimenti, script e template durante l'implementazione.
- Gli adattatori in `.opencode/agents/*.md` rimandano a `.agents/workflows/*.md` nel progetto. Globalizzarli senza correggerli lascerebbe una dipendenza locale.
- L'ispezione delle `.ai` ha controllato struttura, nomi e riferimenti nelle regole; non ha verificato l'accuratezza di tutti i documenti rispetto al codice.
- L'assenza di un file dal nucleo proposto non è automaticamente un difetto: valutare necessità e attività del progetto prima di crearlo.

## 3. Ordine di esecuzione

1. Sistemare portabilità e separazione delle responsabilità in agent-brains.
2. Preparare installazione globale, inventario, verifica e rollback.
3. Configurare il Mac preservando contenuti e configurazioni esistenti.
4. Provare i tre harness in un progetto pilota senza dipendenze dai vecchi collegamenti.
5. Allineare e migrare ogni progetto separatamente, iniziando dai boilerplate.
6. Rimuovere gli adattatori storici solo dopo aver verificato che nessun flusso attivo li richieda.

Non iniziare con una rimozione di massa delle directory `.agents` o `.opencode`.

## 4. Lavoro in agent-brains

### A. Catalogo portabile

- [ ] Inventariare skills, nomi dichiarati, licenze, provenienza, dipendenze, profili e metadati dei diversi harness.
- [ ] Correggere i riferimenti tra skills: usare i percorsi delle skills scoperte dall'harness o una risoluzione documentata a partire dal catalogo; non presumere `.agents/skills` nel progetto corrente.
- [ ] Distinguere esplicitamente percorsi relativi alla skill da percorsi relativi alla root del progetto.
- [ ] Cercare riferimenti obsoleti in tutti i manifest, references, script, template, documenti operativi e test, inclusi `.agents/skills/designer.md` e `.agents/workflows`.
- [ ] Aggiornare congiuntamente i test strutturali introdotti da `af37cf6`: sostituire le aspettative sul vecchio layout con le garanzie del nuovo sistema, senza eliminare la verifica di integrità dei workflow.
- [ ] Verificare i nomi delle dipendenze e la presenza effettiva delle skills invocate.
- [ ] Conservare `.ai/...` come percorsi del progetto su cui si lavora; verificare il comportamento quando l'harness parte da una sottocartella.
- [ ] Preservare metadati di gestione locale, licenze e patch locali durante gli aggiornamenti upstream.
- [ ] Separare skills generiche da output generati per un progetto: verificare in particolare Laravel Boost, che oggi può scrivere attraverso i collegamenti nel catalogo comune. Contenuti dipendenti da pacchetti/versioni del singolo progetto non devono sovrascrivere automaticamente la fonte globale.

### B. Separare spec, implementazione e review

- [ ] Rinominare la skill `feature` in `spec-and-tasks`: directory, `name`, descrizione, metadati UI, riferimenti, profili e adattatori. Non rinominare automaticamente il comando Pi `/feature`.
- [ ] Limitare la skill a esplorazione del repository, brainstorming, decisioni, criteri di accettazione e produzione dei documenti.
- [ ] Definire il contratto di `spec.md`: obiettivo, comportamento, confini, vincoli, casi limite, decisioni, criteri verificabili e assunzioni residue.
- [ ] Preservare nella nuova skill documentale le indicazioni C2 su scenari osservabili e verifiche proporzionate; lasciare esecuzione e valutazione dei test ai rispettivi ruoli.
- [ ] Definire il contratto di `tasks.md`: ID stabili, attività concrete, dipendenze, area/file interessati quando noti, verifiche e stato. Evitare pseudocodice vincolante e dettagli inventati.
- [ ] Terminare con documenti approvati e handoff; nessuna implementazione avviata implicitamente dalla skill di pianificazione.
- [ ] Leggere e armonizzare `grilling`, `grill-with-docs`, `to-spec` e `to-tickets`: evitare procedure concorrenti per gli stessi output.
- [ ] Risolvere il conflitto attuale tra intervista a gruppi di domande di `grilling` e intervista a domanda singola/checkpoint di `grill-with-docs`. La seconda contiene anche una descrizione del comportamento della prima che non coincide con il contenuto attuale.
- [ ] Scegliere e documentare quale procedura usare per brainstorming ordinario e stress test documentale; evitare interviste e approvazioni duplicate per la medesima decisione.
- [ ] Non obbligare piccoli fix o manutenzioni a passare da una nuova spec.
- [ ] Rivedere le skills di implementazione `laravel`, `nextjs`, `astro`: consumano documenti approvati e non ripetono l'intera discovery. Definire anche il percorso per stack generici.
- [ ] Rivedere `code-review`: input spec/task/diff, verifica dei criteri, rilievi prioritizzati e distinzione tra review e correzione.
- [ ] Conservare le indicazioni C2 già presenti nel reviewer Pi; trasferire eventuali parti pertinenti alla review condivisa senza introdurre un reviewer obbligatorio aggiuntivo.
- [ ] Documentare passaggi manuali tra sessioni e possibilità di delega per harness, senza promettere automazione non implementata.

### C. Compatibilità del motore Pi

- [ ] Conservare `/feature`, `/flow`, `/stack` e la configurazione globale del pacchetto.
- [ ] Verificare se planner, context router, skill router, replay/resume e log dipendono dal nome `feature` o dai nomi dei documenti. Non confondere il nome del workflow con quello della skill.
- [ ] Aggiornare profili e policy dei ruoli per la rinomina della skill senza rimuovere accidentalmente istruzioni necessarie a planner/developer/reviewer.
- [ ] Allineare il planner Pi ai contratti spec/task dove possibile; se produce ancora nomi storici, documentare e mantenere compatibilità prima di cambiare formato.
- [ ] Garantire lettura di run interrotti e documenti esistenti; non rinominare in massa gli artefatti necessari al resume.
- [ ] Verificare che il developer riceva documenti approvati e il reviewer riceva requisiti e diff, con verifiche e ruoli separati come previsto dal motore.
- [ ] Preservare e verificare la politica dei verdetti incoerenti di C1 durante eventuali modifiche a workflow e review; non riscriverla come parte della rinomina.

### D. Installazione globale e manutenzione

- [ ] Introdurre un'operazione di installazione globale distinta dallo scaffold del progetto, con anteprima, rilevamento conflitti e rollback.
- [ ] Esporre il catalogo completo in `~/.agents/skills` mediante un collegamento della directory, preservando prima le skills personali esistenti.
- [ ] Coordinare con C4 la baseline del catalogo scoperto prima del cambiamento e il confronto successivo; eventuali fusioni/rimozioni di skills restano decisioni motivate di C5.
- [ ] Verificare il riconoscimento del collegamento di directory con le versioni installate di Codex e OpenCode.
- [ ] Configurare eventuali agenti/comandi OpenCode globali senza collegare l'intera `.opencode` del repository: contiene anche dipendenze e altri file non necessari.
- [ ] Verificare l'esposizione di `/spec-and-tasks` in OpenCode tramite metadati supportati dalla versione installata oppure un adattatore globale minimale.
- [ ] Conservare i profili per selezione per ruoli/stack nel motore Pi; non usarli più per limitare il catalogo interattivo di ogni progetto.
- [ ] Trasformare `setup.sh` nel percorso nuovo o dichiarare esplicitamente deprecata la modalità di collegamento per progetto. Aggiornare `unlink.sh` per la migrazione preservando contenuti non gestiti.
- [ ] Verificare `install-global-skills.sh`: oggi il nome suggerisce installazione globale, ma scrive nel repository. Chiarire nome, destinazione e responsabilità.
- [ ] Aggiornare README e guida Pi con installazione per computer, invocazioni, aggiornamenti, diagnosi e rollback.
- [ ] Prevedere un controllo diagnostico di catalogo, manifest, dipendenze, duplicati, collegamenti e configurazione; riportare solo verifiche realmente eseguite.

### E. Template e scaffold

- [ ] Aggiornare `templates/AGENTS.md`, `templates/.ai`, `scaffold.sh` e tracker locale secondo le convenzioni del piano.
- [ ] Non imporre la creazione di ogni documento di contesto in ogni progetto; distinguere nucleo minimo e documenti per area.
- [ ] Rendere lo scaffold idempotente e conservativo: aggiungere solo file necessari e mancanti, senza sovrascrivere contenuti.
- [ ] Garantire che regole UI non obblighino a leggere un `DESIGN_SYSTEM.md` inesistente o privo di contenuti.
- [ ] Allineare anche la `.ai` di agent-brains: al momento manca `context/TECH_STACK.md`; aggiungerlo se richiesto dalle nuove regole.

## 5. Configurazione del Mac

- [ ] Inventariare le configurazioni rilevanti di Codex, OpenCode e Pi senza includere credenziali nel report o nei backup versionati.
- [ ] Salvare una copia recuperabile delle configurazioni e dei contenuti che verranno modificati.
- [ ] Confrontare e adottare in agent-brains `diagnose`, `find-skills`, `i-have-adhd`, con licenza/provenienza e senza sovrascrivere omonimi.
- [ ] Confrontare `~/.config/opencode/skills/react-doctor` con la versione centrale e rimuovere duplicazioni solo dopo la verifica.
- [ ] Configurare `~/.agents/skills` verso il catalogo centrale, usando l'installer preparato sopra.
- [ ] Verificare esclusioni di skills in Codex e permessi, agenti o configurazioni che nascondono skills in OpenCode.
- [ ] Mantenere il pacchetto Pi globale già registrato; non reinstallarlo senza necessità.
- [ ] Verificare aggiornamento/ricaricamento nelle sessioni nuove e in quelle già aperte; documentare quando serve riavviare.
- [ ] Documentare come ripristinare la configurazione precedente e come ripetere l'installazione su un altro computer.

La fonte dei contenuti resta agent-brains. Il collegamento globale è un punto di accesso locale, non uno spostamento della fonte in un harness. Per ambienti remoti o container servirà un'installazione equivalente nel loro filesystem.

## 6. Struttura comune dei progetti

```text
AGENTS.md                         # policy stabili e context routing
.ai/
  context/
    TECH_STACK.md                 # stack verificato sul progetto
  agents/
    issue-tracker.md              # convenzione dei documenti di lavoro
  features/
    <slug>/
      spec.md
      tasks.md
  memory/
    progress.md                   # stato, task corrente e blocchi
    lessons.md                    # lezioni concrete e riutilizzabili
```

Il nucleo è una destinazione per i progetti attivi, non un obbligo di creare placeholder in repository inattivi. `AGENTS.md` deve descrivere file realmente presenti.

Estensioni da mantenere quando utili: `context/PROJECT.md`, `PRD.md` di prodotto, `APP_FLOW.md`, `GLOSSARY.md`, `DESIGN_SYSTEM.md`, contratti API, schema DB, `adr/`, `memory/solutions/`, `knowledge/`, `inbox/`, `research/`, `reviews/`. Una struttura comune non richiede contenuti identici.

Distinguere il PRD generale del prodotto dalla spec di una feature. Conservare eventuali convenzioni linguistiche locali: per esempio craftcv richiede documentazione AI in inglese, careguru-brain in italiano.

### Checklist da applicare a ogni repository migrato

- [ ] Leggere istruzioni applicabili e stato git; inventariare `.ai`, `.agents`, `.opencode`, `.pi`, configurazioni e contenuti locali.
- [ ] Verificare accuratezza del contesto essenziale rispetto al codice; classificare documenti attivi, storici e ridondanti.
- [ ] Correggere riferimenti a file mancanti, vecchi percorsi e vecchia semantica di `feature`.
- [ ] Aggiornare `AGENTS.md`, tracker locale ed eventuale `.ai/agents/agent-brains.md` senza duplicare la documentazione globale.
- [ ] Gestire prompt PRD/task storici: adottare contenuti utili e archiviare solo quelli sostituiti, dopo aver aggiornato i riferimenti.
- [ ] Mantenere i documenti storici leggibili; applicare `spec.md`/`tasks.md` ai nuovi lavori, senza rinomina massiva.
- [ ] Verificare l'accesso globale alle skills prima di rimuovere i collegamenti locali gestiti da agent-brains.
- [ ] Preservare skills, agenti, plugin e file locali/di terze parti; rimuovere directory soltanto se vuote.
- [ ] Verificare eventuali configurazioni Pi e conservare gli override; escludere lock e run locali da nuovi commit.
- [ ] Registrare risultato della migrazione, controlli effettuati e limitazioni. Commit separato per repository con Conventional Commits in inglese.

## 7. Attività per progetto

Le attività seguenti si aggiungono alla checklist comune. “Nucleo presente” significa che sono stati trovati TECH_STACK, progress, lessons e issue-tracker; non certifica l'accuratezza dei contenuti.

| Stato | Repository | Situazione osservata e intervento specifico |
|---|---|---|
| [ ] | `agent-brains` | Implementare la sezione 4; applicare la migrazione anche alle proprie regole e alla propria `.ai`. |
| [ ] | `_tests/laravel-ai-boilerplate` | Nucleo presente; contiene prompt storici e `.ai/agents/agent-brains.md`. Allinearlo presto per evitare nuovi progetti con convenzioni vecchie. Preservare le regole Laravel Zero rilevate. |
| [ ] | `_tests/nextjs-ai-boilerplate` | Nucleo presente; conserva `guidelines`, `blockers.md` e prompt di setup. Allineare template e regole senza perdere indicazioni Next.js. |
| [ ] | `linkedin-analytics` | Nucleo presente; prompt PRD/task/setup e istruzioni agent-brains locali. Consolidare le note duplicate in AGENTS e controllare le regole UI rispetto ai documenti realmente presenti. |
| [ ] | `ga-analytics` | Nucleo presente, configurazione Pi, solutions e roadmap specialistiche. Buon candidato per verificare la coesistenza Pi/Codex/OpenCode dopo un primo test isolato; preservare run e compatibilità dei documenti. Consolidare prompt e note duplicate. |
| [ ] | `craftcv.online` | Nucleo presente; contesto articolato, `FRONTEND_GUIDELINES.md`, `blockers.md`, prompt storici e più convenzioni task. Preservare l'inglese per la documentazione e il routing UI specifico. |
| [ ] | `appuntidalgiappone` | Nucleo presente; aggiornare riferimenti a `/feature` e vecchi nomi PRD/task. Valutare classificazione di `.ai/SEO-STRATEGY.md` e `.ai/to.md` dopo lettura, senza spostarli automaticamente. |
| [ ] | `careguru/carefinder-backend` | Nucleo presente; conservare `workflow-decisions.md`, override locali e regole Boost/Filament. Evitare che la generazione Boost sovrascriva policy manuali o catalogo centrale. |
| [ ] | `careguru-brain` | Nucleo presente, sicurezza, guida KB, research e reviews. Preservare lingua italiana e routing SECURITY/KB; rimuovere la dipendenza dal profilo locale e aggiornare le istruzioni feature/to-spec. Nessun obbligo di design system per un backend senza UI. |
| [ ] | `andreafalcon.dev` | Nucleo presente; AGENTS descrive esplicitamente il vecchio sistema di symlink. Aggiornarlo e preservare prompt OG, design system e documenti di redesign. |
| [ ] | `itinerary-ai` | Nucleo presente e istruzioni locali agent-brains. Correggere il riferimento `.agents/skills/designer.md`; mantenere design system e regole Laravel specifiche. |
| [ ] | `ardizio-design` | Nucleo presente; mantenere ADR, publishing pipeline, knowledge, inbox e research. Verificare `.ai/agents/legacy-skills` prima di archiviare. Correggere vecchi percorsi designer e semantica feature preservando il trattamento delle fonti inbox come dati non fidati. |
| [ ] | `_tests/search-flights` | Presenti `.ai/features` e configurazione Pi; mancano i quattro file del nucleo. Ricostruire contesto minimo dal progetto se ancora attivo; non rinominare documenti necessari ai run Pi esistenti. |
| [ ] | `_tests/meal-planner` | Contesto e memoria sono ancora sotto `.agents`, citati da AGENTS. Inventariare e migrare selettivamente in `.ai`, aggiornando tutti i riferimenti; non trattare `.agents` come directory composta soltanto da symlink. |
| [ ] | `voicefully` | AGENTS presente, `.ai` assente. Valutare attività e istruzioni esistenti; predisporre il nucleo solo se il progetto è in uso. |
| [ ] | `careguru/carefinder` | `.agents` presente, `.ai` non rilevata. Ispezionare contenuti e istruzioni ulteriori prima di scegliere migrazione o scaffold; preservare eventuali skills locali. |
| [ ] | `careguru/carefinder-docker` | Nessuna configurazione AI tra quelle rilevate. Valutare contesto operativo minimo dedicato e collegamenti documentali al backend/frontend; non copiare i loro documenti. |
| [ ] | `linkedinsights-extension` | Nessuna configurazione AI rilevata. Se attivo, documentare stack, contratti con linkedin-analytics e verifiche della sola estensione. |
| [ ] | `_nerwo/nerwo-frontend` | Nessuna configurazione AI rilevata. Valutare attività e creare solo il contesto necessario. |
| [ ] | `_nerwo/nerwo-landing` | Nessuna configurazione AI rilevata. Valutare attività e creare solo il contesto necessario. |
| [ ] | `_tests/spacebooking` | AGENTS presente, `.ai` assente. Verificare convenzioni monorepo e scope delle istruzioni prima di aggiungere il nucleo. |
| [ ] | `_tests/jointobuild` | Nessuna configurazione AI rilevata. Decidere se includerlo tra i progetti attivi prima dello scaffold. |
| [ ] | `test-python-django` | Nessuna configurazione AI rilevata. Se attivo, adottare nucleo e verifiche coerenti con Python/Django. |

Per altre sottocartelle e repository annidati non emersi nell'inventario, effettuare una ricerca dedicata prima di dichiarare completata la migrazione dell'intera directory dev. Non includere automaticamente archivi e dati di applicazioni nei progetti da migrare.

## 8. Verifiche e criteri di completamento

- [ ] In un progetto senza collegamenti locali, Codex trova e carica `$spec-and-tasks` dal catalogo centrale.
- [ ] OpenCode scopre la stessa skill; verificare separatamente il comando `/spec-and-tasks`, che richiede esposizione supportata.
- [ ] Pi trova `/skill:spec-and-tasks` e registra `/feature`, `/flow`, `/stack` dal pacchetto globale.
- [ ] La skill documentale produce spec e task nella `.ai` del progetto corrente e non modifica codice applicativo.
- [ ] Le dipendenze tra skills funzionano anche senza `.agents` nel progetto e partendo da una sottocartella.
- [ ] Un passaggio a una nuova sessione di implementazione funziona leggendo i documenti, senza ricostruire la conversazione precedente.
- [ ] Una review separata confronta requisiti e diff e restituisce rilievi verificabili.
- [ ] Pi mantiene compatibilità dei run esistenti; eventuali prove complete di implementazione avvengono in un repository di prova, non su un progetto attivo per sola verifica del caricamento.
- [ ] Una nuova skill e una modifica a una skill diventano disponibili senza rilanciare setup nei progetti; annotare eventuale necessità di reload/riavvio.
- [ ] Eseguire i test significativi del motore e degli script modificati, compreso `npm test` e `npm run typecheck` quando si modifica il codice Pi. Non avviare suite applicative complete per sole modifiche documentali prive di effetti eseguibili.
- [ ] Nessun contenuto locale o di terze parti è stato perso; rollback dell'installazione globale documentato e verificato.

## 9. Riferimenti

- Codex: https://learn.chatgpt.com/docs/build-skills — scoperta globale in `~/.agents/skills`, collegamenti, invocazione e metadati.
- OpenCode: https://opencode.ai/docs/skills/ — scoperta globale, permessi e metadati per comandi slash; verificare versione installata.
- Pi locale: `agent-brains/node_modules/@earendil-works/pi-coding-agent/docs/skills.md` e `docs/packages.md` — pacchetti locali e `/skill:<name>`.
- Implementazione corrente: `agent-brains/package.json`, `extensions/pi-brain.ts`, `src/pi/`, `src/workflows/`, `docs/pi-brain/README.md`.
- [Roadmap di coordinamento](pi-plugin-adoption-roadmap.md#cross-harness-workflow-migration-m) e [consolidamento C1–C5](pi-plugin-adoption-roadmap.md#agreed-consolidation-sequence-2026-10-22).
- [Valutazione C2](../evals/tdd-review/C2-2026-10-22.md): evidenze e limiti del consolidamento TDD/review già completato.

## 10. Registro di avanzamento

| Data | Ambito | Modifica completata | Verifica | Limitazioni / prossimo passo |
|---|---|---|---|---|
| 2026-10-19 | Piano | Creato inventario e piano trasversale | Ispezione in lettura di strutture, configurazioni e skills rilevanti | Implementazione non iniziata; configurazioni harness non provate in sessione |
| 2026-10-22 | Documentazione | Trasferito il piano nel repository e collegato alla roadmap; integrate le garanzie dei commit fino a cdf54f3 | Confronto dei commit e controllo dei collegamenti documentali | Solo documentazione; migrazione e configurazione del Mac non iniziate |
