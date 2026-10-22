# Valutazione di Cloudflare `security-audit`

Mode: assessment  
Data: 2026-10-22  
Checkout locale: `f065e5a970554b91fd86427a7e123c2fbc4caa7b`  
Snapshot upstream: `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8` (2026-09-14)

## Stato aggiornato dopo la revisione locale (2026-10-22)

Riconfrontato con `af37cf6`: U9–U11 (puntatori workflow, avviso OpenCode e
ignore runtime Pi) sono completati e committati. Non cambiano le evidenze
tecniche pertinenti qui. Le fonti upstream restano agli snapshot originali:
questa revisione non è una nuova verifica upstream o un nuovo benchmark.
La [roadmap concordata](../plans/pi-plugin-adoption-roadmap.md#agreed-consolidation-sequence-2026-10-22)
possiede ordine e stato del lavoro futuro; questa ricerca conserva le evidenze.

Decisione: C3 migliora soltanto `security-reviewer` con i principi applicabili
oggi. L'utente esclude sandbox OS e installazione completa: nessun bundle extra,
ledger o orchestratore Cloudflare in coda. Le parti che richiedono nuova
infrastruttura si scartano. La revisione indipendente è riservata agli
approfondimenti espliciti, non aggiunge una fase automatica a `/feature`.

## Perimetro e fonti

Ho letto il checkout upstream al commit fissato, le skill locali `security-reviewer` e
`code-review`, il router e i profili rilevanti. Non ho eseguito un audit di sicurezza
del repository, installato la skill o modificato skill, codice o configurazione. Ho
eseguito solo i 65 test dei due validator upstream: tutti passano.

Fonti primarie: [README upstream](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/README.md),
[SKILL.md](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/skills/security-audit/SKILL.md),
[RECONNAISSANCE.md](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/skills/security-audit/RECONNAISSANCE.md),
[HUNTING.md](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/skills/security-audit/HUNTING.md),
[VALIDATION-AND-REPORTING.md](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/skills/security-audit/VALIDATION-AND-REPORTING.md),
[schema](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/skills/security-audit/report-schema.json),
[validator tests](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/skills/security-audit/validate-findings.test.cjs).

## Fatti upstream

Cloudflare non offre una checklist corta: il bundle contiene 22 file e circa 5.400
righe. Il workflow completo ha sei fasi: ricognizione, hunting guidato dalla
copertura, validazione avversariale dei candidati, output JSON validato, verifica
indipendente dei record e report derivati. Distingue inoltre una modalità guidance
da una full audit, quindi il caricamento della skill non dovrebbe avviare da solo
un audit o creare file.

Il modello di evidenza richiede un principale a bassa fiducia, il controllo atteso,
il confine attraversato, la risorsa colpita e un risultato osservato. I record sono
`confirmed`, `needs_validation` o `rejected`; solo il primo riceve severità. La
severità deve seguire l'impatto dimostrato, mentre un fatto di deployment mancante
resta un blocco esplicito.

La copertura è persistita in `coverage-ledger.json`, con profili `quick`, `standard`
e `deep`, budget di invocazioni, riuso prudente dei run precedenti e critic separati.
Il verificatore deve essere fresco rispetto all'hunter; una sostituzione materiale
richiede un'altra verifica. `findings.json` e il ledger hanno validator zero-dependency
con limiti di input e controlli di struttura.

Le istruzioni impongono un sandbox OS-enforced per eseguire codice del target:
rete esterna disabilitata, ambiente allowlist, target read-only, scratch isolato e
limiti di risorse. La promozione degli artefatti è parent-only e descritta con
controlli no-follow, link count, dimensioni e race safety. Senza queste garanzie il
risultato deve rimanere `needs_validation`; questo è un contratto operativo, non una
garanzia che ogni host lo applichi.

Il bundle include lenti specialistiche per web/auth, client, cloud, supply chain,
LLM, protocolli, disponibilità, isolamento dati e IPC. La licenza è MIT, ma il
[LICENSE upstream](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/LICENSE)
richiede di conservare copyright e notice nelle copie o porzioni sostanziali.

## Evidenza locale

La [skill locale `security-reviewer`](../../.agents/skills/security-reviewer/SKILL.md)
copre già scope e autorizzazione, SAST, dependency e secret scanning, review manuale,
proof of concept limitato, classificazione CVSS, posizione file/linea, remediation e
report con executive summary e findings table. È quindi una base reale per la parte
generica dell'upstream.

La [skill `code-review`](../../.agents/skills/code-review/SKILL.md) ha un perimetro
diverso: confronta un diff con un punto fisso su due assi indipendenti, Standards e
Spec. L'indipendenza dei due reviewer è affine, ma non sostituisce un audit del
repository, una coverage ledger o la validazione di una vulnerabilità.

`security-reviewer` è presente nei profili `full` e `nodejs-ai-backend`
([full.list](../../profiles/full.list), [nodejs-ai-backend.list](../../profiles/nodejs-ai-backend.list));
il router lo classifica come `review` e il suo ruolo accetta `review`, `craft` e
`stack` ([skill-router.ts](../../src/skill-router.ts)). La configurazione predefinita
lo lascia però disabilitato ([config.ts](../../src/config.ts)). Le occorrenze locali
del ruolo sono router, configurazione e test: il workflow feature corrente chiama
planner, developer e reviewer, senza una fase security-reviewer automatica.

L'inventario verificato dal parent non mostra `security-audit` nel catalogo locale o
globale, in `skills-lock.json` o nello script di installazione. L'assenza dal lock
significa anche che l'updater non ne governa la provenienza o gli aggiornamenti.
Per skill manuali e tool-specifiche il repository prescrive invece `extra/skills/`
([README](../../README.md#L327)).

## Confronto e compatibilità

| Dimensione | Cloudflare | Locale | Conseguenza |
|---|---|---|---|
| Intento | Audit completo o guidance focalizzata | Review security generica | Sovrapposizione sui casi ordinari, valore nuovo sui run completi |
| Evidenza | Boundary/result, tre verdict, severità separata dalla certezza | Finding con CVSS e remediation | Importare il gate e `needs_validation` riduce overclaim |
| Copertura | Ledger, critic, run additivi e budget | Nessun ledger di audit | Nuova capacità, ma anche stato persistente da progettare |
| Indipendenza | Hunter, verifier e final record verifier distinti | `code-review` separa Standards/Spec | Riutilizzare il principio, senza fondere i due perimetri |
| Esecuzione | Sandbox OS-enforced e artefatti isolati | Bash ammesso nella skill locale; nessun contratto equivalente | Incompatibilità operativa da risolvere prima della full audit |
| Distribuzione | Skills CLI, 22 file, companion docs e script | Store centrale, profili e router propri | Installazione diretta bypasserebbe il lifecycle locale |

Il valore aggiuntivo è metodologico e verificabile: confine concreto, severità solo
dopo evidenza, blocchi nominati, verifica indipendente, ledger e schema macchina.
SAST, secret scanning, OWASP/CWE, CVSS e reportistica di base sono invece già coperti
dalla skill locale. Il bundle non va quindi trattato come una sostituzione completa
o come un'estensione di `code-review`.

## Costi, rischi e gestione upstream

Importare tutto aggiungerebbe 22 file, migliaia di righe di prompt e due validator da
manutenere, oltre a un orchestratore di hunter/verifier, run directory esterne,
ledger, budget e promozione sicura. Il codice locale espone un `AgentRunner` per
chiamata e un ruolo security disabilitato; non c'è evidenza di un sandbox descriptor
aware né di una pipeline che possieda i file condivisi richiesti dall'upstream.

Aggiungere semplicemente `security-audit` a un profilo sarebbe ambiguo: gli skill
sconosciuti al router ricadono su `craft`, quindi finirebbero potenzialmente in più
ruoli. Una full audit richiede invece un ingresso esplicito e il solo ruolo security,
con output fuori dal target e capacità di delega/isolamento dichiarate.

La strada scelta è adattare selettivamente il metodo dentro `security-reviewer`,
senza installazione globale o bundle manuale aggiuntivo. Occorre mantenere il notice MIT,
registrare commit e provenienza e fissare un controllo upstream dedicato: oggi il
repository non lo aggiorna tramite lockfile.

## Decisione

**Verdict: selectively import.** Conservare `security-reviewer` come entrypoint per
le review ordinarie e recuperare da Cloudflare, in un cambiamento futuro separato,
questi elementi: boundary/result gate, `needs_validation` senza severità, calibrazione
impact/likelihood, schema minimo dei finding, verifica indipendente e hardening notes.
Non importare automaticamente companion, coverage ledger, six-phase orchestration
o promozione di artefatti. Il sandbox OS è escluso dal lavoro concordato.

Il pilot dovrebbe misurare su un audit locale reale finding unici, duplicati, blocchi
di validazione, token/invocazioni e tempo; va considerato positivo solo se aggiunge
evidenza o coverage senza moltiplicare report generici. L'integrazione completa non è in coda; richiederebbe una futura nuova decisione
dell'utente, non il semplice avanzamento di questa proposta.
