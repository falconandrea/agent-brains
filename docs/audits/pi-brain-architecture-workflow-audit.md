# Audit architetturale e del workflow di pi-brain

**Data:** 2026-09-21  
**Repository:** `falconandrea/agent-brains`  
**Branch analizzato:** `pi-brain`  
**Tipo:** audit read-only dell'implementazione, dei contratti e della documentazione

## 1. Executive summary

Il harness è già maturo e coerente con l'architettura desiderata: il modello
svolge il lavoro fuzzy, mentre transizioni, limiti, freeze della spec, verifica
e principali proprietà di sicurezza sono governati dal codice.

Le modifiche a maggior valore sono:

1. Aggiungere un comando canonico `npm run check` e una CI che esegua
   esattamente quel comando.
2. Aggiungere un gate umano post-review molto ristretto per modifiche ad alto
   rischio o con evidenza incompleta, senza introdurre un nuovo agente.
3. Eliminare le contraddizioni tra task ID `U*` e `T*`, e aggiornare
   documentazione evidentemente obsoleta.
4. Estendere `lessons-gardener` con una classificazione `PROMOTE`, solo
   propositiva e sempre approvata dall'utente.

Non è consigliata una riscrittura, un motore di policy generico, un
security-reviewer obbligatorio o una nuova infrastruttura di knowledge
management.

L'audit è stato eseguito sul working tree locale `pi-brain` a `763387a`, un
commit avanti rispetto a `origin/pi-brain`. Erano presenti modifiche locali
preesistenti, ma nessun file centrale del workflow risultava modificato. Non
sono stati eseguiti test o comandi mutanti durante l'audit.

## 2. Findings

### F1 — Manca un comando canonico di salute del repository e manca la CI

- **Status:** `missing`
- **Evidenza:** `package.json` espone soltanto `test` e `typecheck`.
  `.pi/pi-brain.json` e `docs/pi-brain/README.md` duplicano manualmente i due
  comandi. Non risultano workflow GitHub Actions o altra CI tracciata.
- **Perché conta:** oggi “repository sano” significa ricordarsi due comandi.
  Documentazione, configurazione del workflow e futura CI possono divergere.
- **Modifica minima:** aggiungere:
  - `check: "npm run typecheck && npm test"` in `package.json`;
  - CI con Node 24, `npm ci`, `npm run check`;
  - `.pi/pi-brain.json` con `verify: ["npm run check"]`;
  - README che presenti `npm run check` come comando canonico.
- **Cosa deve controllare la CI:** soltanto typecheck e test. Non esiste un
  linter configurato, non c'è build e non emerge valore nell'aggiungerli
  soltanto per riempire la pipeline.
- **Rapporto con `src/verify.ts`:** nessun conflitto. `resolveVerifyCommands`
  deve continuare a risolvere test/typecheck per i repository generici. Solo
  questo repository dovrebbe configurare esplicitamente `npm run check`.
- **File coinvolti:** `package.json`, `.pi/pi-brain.json`,
  `docs/pi-brain/README.md`, nuovo `.github/workflows/ci.yml`.
- **Rischi:** CI più lenta di un controllo mirato locale; download dei peer
  dependency. Non giustifica introdurre caching o matrix multi-versione
  inizialmente.

### F2 — I gate umani basati sul rischio sono solo parzialmente coperti

- **Status:** `partial`
- **Evidenza già robusta:**
  - i submodule non osservabili causano `needs_human` prima del reviewer;
  - modifiche a ignore rules sono rilevate;
  - spec alterata dopo l'approvazione causa escalation;
  - non esiste auto-commit e il developer non ha shell;
  - il reviewer è strutturato e indipendente.
- **Gap reale:** un reviewer può restituire `approved` e il workflow può
  completare anche quando il diff modifica migration, dipendenze, CI/CD,
  infrastruttura, auth o pagamenti. Le ignore rules sono ancora più
  problematiche: il reviewer viene avvisato, ma alcuni nuovi file potrebbero
  essere diventati invisibili proprio a causa della modifica.
- **Valutazione delle alternative:**
  - **Changed paths:** miglior segnale deterministico disponibile, ma
    sufficiente solo per superfici convenzionali o configurate.
  - **Classificazione task/spec:** utile come contesto, non abbastanza
    affidabile per un gate deterministico perché prodotta dal planner.
  - **Categorie stack-aware:** ragionevoli per migration e manifest, ma
    rischiano di crescere rapidamente.
  - **Metadata del reviewer:** non soddisfa il requisito di indipendenza
    dall'opinione del reviewer.
  - **Configurazione esplicita:** miglior meccanismo per cartelle specifiche
    del progetto, come auth e pagamenti.
  - **Nessun nuovo gate:** difendibile grazie al no-auto-commit, ma lascia che
    `completed` comunichi un livello di autonomia e sicurezza eccessivo.
- **Modifica minima consigliata:**
  1. rendere immediatamente `needs_human` una modifica alle ignore rules,
     perché l'evidenza può essere incompleta;
  2. dopo un review verde, valutare una piccola lista built-in di superfici ad
     alta precisione: manifest/lockfile, migration, CI workflow,
     `.gitmodules`, IaC;
  3. permettere una lista configurabile di path sensibili per auth, pagamenti
     o convenzioni locali;
  4. se scatta, conservare il review ma terminare come `needs_human` con le
     categorie/path rilevate.
- **File coinvolti:** `src/workflows/feature.ts`, `src/config.ts`, test in
  `tests/feature-workflow.test.ts`; eventualmente un piccolo helper puro, ma
  non un nuovo sottosistema.
- **Rischi:** falsi positivi e manutenzione dei pattern. Per questo vanno
  evitate classificazione semantica generica e keyword matching sul testo.

### F3 — La promozione delle lesson avviene già, ma solo implicitamente

- **Status:** `partial`
- **Evidenza:** un incidente reale in cui il developer ha creato commit è
  documentato in `docs/pi-brain/IDEAS.md`. Successivamente il divieto è
  diventato una allowlist meccanica senza shell in
  `src/workflows/feature.ts`, coperta anche da test. Questo è già il ciclo
  “incidente → lesson → guardrail”, ma non viene nominato come tale.
- **Gap:** `lessons-gardener` conosce solo `KEEP`, `COMPRESS`, `MERGE`, `DROP`.
  Non può distinguere una lesson che dovrebbe diventare test, invariant,
  direttiva o ADR.
- **Modifica minima:** aggiungere `PROMOTE` alla classificazione del gardener:
  - deve indicare il target consigliato: test, invariant, AGENTS, ADR o skill;
  - non deve implementarlo automaticamente;
  - la lesson resta finché il guardrail non esiste;
  - dopo promozione verificata può essere rimossa o ridotta a contesto
    residuo.
- **Automazione:** solo suggerita dall'agente; applicazione sempre approvata
  dall'utente. Nessuna workflow phase aggiuntiva.
- **Contenimento della crescita:** mantenere l'attuale admission rule, soglia
  di circa 50 entry, formato monoriga e pruning. `PROMOTE` non deve significare
  “copia anche in AGENTS.md”.
- **File coinvolti:** `.agents/skills/lessons-gardener/SKILL.md`,
  eventualmente `templates/.ai/memory/lessons.md`.
- **Rischi:** promuovere troppo presto incidenti una tantum. Il criterio
  dovrebbe essere “ricorrente oppure grave e meccanicamente prevenibile”, non
  semplicemente “importante”.

### F4 — Il contratto degli ID task è contraddittorio

- **Status:** `missing`
- **Evidenza:** il planner Pi richiede `T1`, `T2` in
  `src/workflows/feature-prompts.ts`, e il parser accetta deterministicamente
  soltanto `T\d+` in `src/workflows/feature.ts`. La feature reale usa
  `T1…T8`. La skill standalone richiede invece `U1`, `U2`. Anche `SPEC.md`
  conserva esempi `U*`.
- **Perché conta:** gli artifact `.ai/features` sono condivisi tra modalità
  manuale e Pi. Un task file valido per la skill può essere rifiutato dal
  workflow.
- **Modifica minima:** standardizzare su `T*`, perché è già il contratto
  eseguibile e testato. Aggiornare skill ed esempi; non ampliare il parser per
  accettare due formati.
- **Fonte autorevole:** parser e test per la sintassi; prompt e skill devono
  documentare quel contratto.
- **File coinvolti:** `.agents/skills/feature/SKILL.md`,
  `docs/pi-brain/SPEC.md`, eventuali esempi.
- **Rischi:** vecchi task file con `U*` non saranno retrocompatibili, ma già
  oggi non sono accettati dal planner contract Pi.

### F5 — Alcuna documentazione operativa è verificabilmente obsoleta

- **Status:** `partial`
- **Evidenza:**
  - `ARCHITECTURE.md` dice che developer → verify → reviewer non è mai stato
    eseguito, mentre il README documenta run complete;
  - `ARCHITECTURE.md` dice che resume è ancora mancante; il modulo resume e il
    README lo documentano come implementato;
  - `src/pi/pi-agent-runner.ts` dice “nothing here has executed”, contraddetto
    dai run reali documentati;
  - il README rimanda a `ROLE_POLICIES`, ma l'implementazione usa
    `ROLE_CATEGORIES`.
- **Perché conta:** le “known gaps” guidano decisioni architetturali; se
  obsolete possono provocare lavoro duplicato.
- **Modifica minima:** aggiornare soltanto le affermazioni contraddette.
  Etichettare `SPEC.md` come design storico/iniziale, non come stato corrente.
- **Fonte autorevole:** codice e test per lo stato implementativo;
  `ARCHITECTURE.md` per decisioni; README per uso corrente; `SPEC.md` per
  intenti e storia.
- **File coinvolti:** `docs/pi-brain/ARCHITECTURE.md`,
  `docs/pi-brain/README.md`, `docs/pi-brain/SPEC.md`,
  `src/pi/pi-agent-runner.ts`.
- **Rischi:** nessuno tecnico; il rischio è trasformare nuovamente la
  documentazione in un changelog. Va mantenuta sintetica.

### F6 — Il repository contiene una direttiva scoped incompatibile con il proprio stack

- **Status:** `missing`
- **Evidenza:** `.agents/AGENTS.md` impone Pint, PHPStan e
  `php artisan boost:update`, ma questo branch è un package Node/TypeScript e
  non contiene il relativo stack Laravel.
- **Perché conta:** un agente che modifica skill sotto `.agents/` può ricevere
  istruzioni non eseguibili o aggiornare file di memoria inesistenti.
- **Modifica minima:** sostituire quel file con direttive realmente scoped alla
  manutenzione delle skill, oppure eliminarlo se non ha più una funzione.
- **Fonte autorevole:** un eventuale root `AGENTS.md` per policy di repository;
  `.agents/AGENTS.md` soltanto per regole specifiche dell'albero skill.
- **File coinvolti:** `.agents/AGENTS.md`.
- **Rischi:** verificare prima se il file serve ancora al percorso
  `main`/OpenCode; non va cancellato alla cieca.

### F7 — Il lifecycle delle lesson contiene una piccola contraddizione di ammissione

- **Status:** `partial`
- **Evidenza:** la feature skill dice di aggiungere una lesson per qualsiasi
  bug, pattern o gotcha. Il template esclude invece typo, one-off e problemi
  già catturati dal tooling.
- **Perché conta:** la regola più permissiva alimenta esattamente la crescita
  che il gardener deve poi ripulire.
- **Modifica minima:** far deferire la feature skill all'admission rule del
  template: solo informazione non ovvia, project-specific, riutilizzabile e
  non già codificata.
- **Fonte autorevole:** `templates/.ai/memory/lessons.md` per admission e
  formato; gardener per manutenzione.
- **File coinvolti:** `.agents/skills/feature/SKILL.md`, forse correzione degli
  esempi nel template.
- **Rischi:** criteri troppo severi potrebbero perdere contesto utile; in
  dubbio si può mantenere la lesson fino al prossimo gardening.

### F8 — Le invariant fondamentali sono già molto più robuste del solo prompt

- **Status:** `already covered`
- **Evidenza:**
  - planner read-only tramite allowlist;
  - approvazione umana obbligatoria e freeze hash;
  - struttura planner validata prima della scrittura;
  - developer senza shell;
  - verifica prima del reviewer e retry separati;
  - reviewer forzatamente read-only anche se la config chiede il contrario;
  - risultato reviewer validato;
  - blocking issue prevale su un verdict `approved`, limite round e
    no-progress;
  - submodule non osservabile → escalation.
- **Perché conta:** queste protezioni non vanno sostituite con prompt più
  lunghi o nuovi agenti.
- **Modifica consigliata:** nessuna, salvo mantenere i test.
- **Rischi di cambiarle:** aumento di token, dipendenza da disciplina del
  modello e perdita della fail-safe behavior.

### Classificazione delle principali regole prompt-only

1. **Già meccanicamente enforced:** read-only planner/reviewer, no shell
   developer, spec freeze, schema planner/reviewer, ordine
   verify-before-review, retry/round bounds, no-progress, submodule gate,
   one-writer lock, no auto-commit del workflow.
2. **Prompt-only ma accettabile:** mantenere il cambiamento focalizzato,
   seguire pattern esistenti, lingua, granularità semantica dei task, quando
   una domanda è davvero materiale, severità appropriata delle issue, massimo
   due batch del planner.
3. **Da trasformare in invariant:** ignore-rule change quando rende incompleta
   l'evidenza; gate finale per superfici sensibili ad alta precisione o
   configurate. Non è utile rendere invariant ogni dettaglio Markdown o il
   `submit_review` esattamente una volta: la validazione del risultato finale
   offre già il beneficio sostanziale.

## 3. Things I should NOT change

- Non aggiungere un security-reviewer automatico o una review swarm. Il
  reviewer esistente è indipendente, strutturato e bounded.
- Non creare un risk engine generico, una tassonomia estesa o classificazione
  LLM-based per decidere il gate.
- Non creare nuovi file di memoria, database di lesson o una fase workflow
  “knowledge promotion”.
- Non promuovere automaticamente una lesson in AGENTS, skill o ADR.
- Non aggiungere lint, formatter, build o audit dependency alla CI senza
  un'esigenza concreta.
- Non modificare `resolveVerifyCommands()` affinché preferisca globalmente
  `npm run check`: è un resolver per repository eterogenei.
- Non rendere rigidamente validabili tutti i contenuti del PRD/task file. ID
  univoci e sezioni non vuote sono invariant sensate; qualità, granularità e
  “WHAT over HOW” restano giudizi fuzzy.
- Non introdurre worktree, rollback automatico o auto-commit per risolvere il
  rischio: il lock one-writer, gli snapshot Git e il no-auto-commit sono già
  una soluzione semplice e solida.
- Non sostituire il JSONL run log o il resume logic: sono più robusti della
  proposta generica di “salvare stato”.
- Non caricare più contesto “per sicurezza”: il context router implementa già
  routing progressivo e role-aware.

## 4. Inconsistencies / sources of truth

| Contratto | Inconsistenza | Fonte autorevole consigliata |
|---|---|---|
| Task ID | Skill usa `U*`; planner/parser usano `T*` | `validateTaskList` + test; documentare `T*` ovunque |
| Stato implementativo | ARCHITECTURE e commenti dicono pipeline/resume non provati | Codice e test; README come riepilogo corrente |
| Spec iniziale vs comportamento corrente | `SPEC.md` conserva discovery one-by-one ed esempi `U*`; implementazione usa batch e `T*` | Codice/prompts/test per l'esecuzione; SPEC etichettato come design storico |
| Verifica manuale vs `/feature` | AGENTS template preferisce il minimo check mirato; Pi esegue gate completi configurati dopo ogni pass | AGENTS per lavoro manuale/per-task; `src/verify.ts` e `.pi/pi-brain.json` per il workflow |
| Stato corrente | `progress.md` rivendica “current phase”, mentre Pi usa run log e `/flow status` | Run log per fase runtime; `progress.md` solo per snapshot progettuale e prossime azioni |
| Lesson admission | Feature skill registra quasi ogni bug; template esclude one-off/tool-caught | Template lessons per admission; gardener per pruning/promozione |
| Reviewer read-only | Campo di config appare configurabile, ma il codice ignora `false` | Codice come invariant; esempi/config dovrebbero chiarire che non è disattivabile |
| Security reviewer | Presente in config e routing ma non viene invocato da `/feature` | Rimuovere o marcare esplicitamente come riservato/futuro; non presentarlo come capacità attiva |
| Role policy | README cita `ROLE_POLICIES`, codice usa `ROLE_CATEGORIES` | `src/skill-router.ts` |
| Regole sotto `.agents/` | Direttive Laravel in un repository Node | Root policy del repository; scoped file solo per skill |

## 5. Proposed implementation order

1. Aggiungere `npm run check` e CI che esegue lo stesso comando.
2. Uniformare i contratti documentali: `T*`, stato resume/runtime,
   `ROLE_CATEGORIES`, `.agents/AGENTS.md`.
3. Aggiungere il gate di rischio ristretto: ignore rules fail-safe, superfici
   built-in ad alta precisione e override configurabile.
4. Aggiungere `PROMOTE` a `lessons-gardener` e armonizzare l'admission rule
   della feature skill.
5. Solo dopo utilizzo reale, rivalutare falsi positivi dei risk pattern; non
   espandere preventivamente la tassonomia.

## 6. First change

La prima modifica da implementare è il comando canonico di verifica con CI.

### Comportamento previsto

- `npm run check` esegue `npm run typecheck` e poi `npm test`.
- La CI usa Node 24, installa tramite `npm ci` ed esegue soltanto
  `npm run check`.
- La configurazione locale di pi-brain usa `verify: ["npm run check"]`.
- Il README presenta `npm run check` come prova completa della salute del
  repository; i due comandi singoli restano disponibili per diagnosi locale.
- Nessun lint, build o dependency audit viene aggiunto.

### Criteri di accettazione

- Esiste un solo comando documentato come gate completo.
- `npm run check` fallisce se fallisce typecheck oppure qualsiasi test.
- GitHub Actions esegue esattamente `npm run check`, senza ricostruire
  manualmente la lista.
- `/feature` su questo repository esegue lo stesso comando tramite
  `.pi/pi-brain.json`.
- `src/verify.ts` resta invariato per gli altri repository.
- `npm run check` passa localmente prima di dichiarare completata la modifica.

