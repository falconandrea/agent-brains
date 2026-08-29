# Confronto skill UI/UX per landing page anti-slop

Data: 2026-08-29

## Sintesi

Le skill UI/UX già presenti coprono quasi tutto il ciclo necessario:

- `frontend-design`: direzione artistica, brief, tipografia, layout distintivo e autocritica anti-template.
- `ui-ux-pro-max`: esplorazione strutturata di product type, stili, palette, font, landing pattern e UX; può generare e persistere un design system.
- `designer`: gerarchia, coerenza, stati, accessibilità e requisito di leggere prima il design system del progetto.
- `tailwind-design-system`: token, componenti e responsive design con Tailwind v4.
- `emil-design-eng`: criteri per decidere se animare, durata, easing, performance, accessibilità e motion restraint.
- `web-design-guidelines`: revisione finale contro le linee guida web aggiornate.
- `webapp-testing` e `pagespeed-optimizer`: verifica visuale, browser, performance e responsive.

Per una landing nuova non serve installare un secondo grande “design brain”. Serve soprattutto un workflow che componga bene queste skill e renda obbligatorie esplorazione, scelta motivata, asset reali e verifica desktop/mobile.

## Risorse esaminate

### UI Skills

Il sito è un catalogo/registry, non una singola skill. Elenca diverse skill già presenti localmente, tra cui `frontend-design`, `ui-ux-pro-max`, `improve-animations` e `web-design-guidelines`, oltre a possibili aggiunte come `better-ui`, `design-lab`, `impeccable` e `create-design-md`.

Fonte: [UI Skills](https://www.ui-skills.com/)

### `better-ui`

È un buon complemento di craft: raggi dei bordi concentrici, allineamento ottico, uso di bordi vs ombre, transizioni interruptible, stroke delle icone e micro-interazioni con valori precisi. È più utile nella rifinitura di componenti che nella definizione della direzione di una landing. Alcune aree sono delegate a skill sorelle (`better-typography`, `better-accessibility`, `better-layout`).

Fonte: [better-ui](https://www.ui-skills.com/skills/jakubkrehel/better-ui)

### `impeccable`

È il candidato più interessante se si desidera un unico sistema operativo per design e review: distingue modalità `Persuade` per landing/marketing, propone `shape`, `critique`, `audit`, `polish`, `bolder`, `quieter`, `distill` e `animate`, e usa artefatti come `PRODUCT.md` e `DESIGN.md`. È però molto sovrapposto a `frontend-design` + `designer` + `web-design-guidelines`; adottarlo insieme senza una gerarchia chiara può creare conflitti di processo e di naming dei documenti.

Fonte: [impeccable](https://www.ui-skills.com/skills/pbakaus/impeccable)

### `design-lab`

È utile per esplorare varianti e raccogliere feedback: preflight, inferenza dello stile esistente, intervista, generazione di variazioni e raffinamento. È un workflow interattivo più che una fonte di regole estetiche. Ha senso quando bisogna confrontare 2–3 direzioni; è sovradimensionato per una modifica piccola.

Fonte: [design-lab](https://www.ui-skills.com/skills/0xdesign/design-lab)

### `create-design-md`

È molto utile per estrarre un linguaggio visuale da un repository o da un sito esistente, usando evidenze come token, CSS computato, componenti e comportamento desktop/mobile. Per una landing greenfield non sostituisce la fase di art direction: non c'è ancora un sistema da estrarre. È invece un buon modello per migliorare la disciplina con cui generiamo il nostro `DESIGN_SYSTEM.md`.

Fonte: [create-design-md](https://www.ui-skills.com/skills/ibelick/create-design-md)

### `design-taste-frontend` / `gpt-taste`

Ha buone intenzioni e alcuni controlli validi: legge il brief, esplicita audience e riferimenti, introduce dials per variance/motion/density, evita meta-label generiche e prevede una pre-flight checklist.

Non lo userei però così com'è. Impone randomizzazione pseudo-casuale, AIDA, H1 di massimo 2–3 righe, bento senza celle vuote, grandi padding e soprattutto GSAP/motion obbligatori. Sono euristiche valide solo in alcuni casi; applicate sempre diventano un nuovo template “Awwwards”, con possibili problemi di performance, accessibilità e conversione.

Fonte: [design-taste-frontend](https://www.skills.sh/leonxlnx/taste-skill/design-taste-frontend) e [gpt-taste nel catalogo UI Skills](https://www.ui-skills.com/skills/leonxlnx/gpt-tasteskill)

### `designsystemchecklist.com`

È una checklist di fondazioni, linguaggio, componenti e manutenzione, non una skill operativa per creare una landing. Le fondazioni includono colore, layout, tipografia, elevation, motion e iconografia; il catalogo componenti copre anche button, card, carousel, form, modal, tabs, toast e altri pattern. Il repository richiede inoltre riferimenti per ogni nuovo item.

Fonte: [repository Design System Checklist](https://github.com/ardakaracizmeli/design-system-checklist), [fondazioni](https://raw.githubusercontent.com/ardakaracizmeli/design-system-checklist/master/src/data/designFoundations.js), [linguaggio](https://raw.githubusercontent.com/ardakaracizmeli/design-system-checklist/master/src/data/designLanguage.js)

La userei come reference/checklist di audit, non come skill sempre attiva. Se serve una nuova skill locale, sarebbe più utile una `design-system-audit` focalizzata su token, componenti, accessibilità e consistenza del progetto, con output evidence-based.

### Articolo di Emil Kowalski

Non è principalmente una skill da installare: è una regola decisionale sul motion. I criteri centrali sono scopo, frequenza d'uso, velocità percepita e assenza di animazione quando l'interazione è ripetuta o keyboard-driven; come regola generale indica di restare sotto 300 ms per le animazioni UI. Questi principi sono già rappresentati da `emil-design-eng`, `review-animations` e `improve-animations` locali.

Fonte: [You Don't Need Animations](https://emilkowal.ski/ui/you-dont-need-animations)

## Decisione consigliata

1. Non installare tutto il catalogo UI Skills.
2. Non aggiungere ora `design-system-checklist` come skill autonoma.
3. Valutare `impeccable` solo come alternativa/coordinatore principale, non in parallelo pieno con le skill creative già presenti.
4. Prendere da `better-ui` i principi di craft che mancano, oppure installarlo soltanto se la landing richiederà una rifinitura intensa di micro-interazioni e componenti.
5. Usare `design-lab` solo quando serve davvero confrontare varianti con feedback.
6. Per il futuro, creare una skill locale `landing-page-design` che orchestra il set esistente: brief → 2–3 direzioni → design system evidence-based → implementazione → screenshot desktop/mobile → audit finale.

## Stack operativo consigliato per la prossima landing

- Direzione e anti-slop: `frontend-design`.
- Palette/font/layout alternativi motivati: `ui-ux-pro-max`.
- Design contract persistente: `designer` + `DESIGN_SYSTEM.md` coerente con il progetto.
- Token e componenti: `tailwind-design-system` se il progetto usa Tailwind.
- Motion solo se serve: `emil-design-eng`.
- QA: `web-design-guidelines`, `webapp-testing`, `pagespeed-optimizer`.

## Workflow a ruoli per le landing page

La direzione più utile non è attivare tutte le skill insieme, ma separare quattro responsabilità. Gli agenti devono avere output, limiti e momenti di attivazione diversi.

| Ruolo | Responsabilità | Limite |
| --- | --- | --- |
| `landing-art-director` / Awwwards | Generare 2–3 direzioni visive specifiche, con concept, hero, tipografia, palette, layout, asset, motion e signature element. | Non scrive subito codice e non impone AIDA, bento, GSAP o altri pattern se non motivati dal brief. |
| `design-system-author` | Trasformare la direzione approvata in un design system persistente e utilizzabile dal coding agent. | Non inventa una nuova direzione estetica. |
| `impeccable-reviewer` | Verificare brief, gerarchia, coerenza visuale, UX, responsive e qualità percepita; produce finding con evidenze. | Non rifà il layout secondo il proprio gusto e non modifica il codice senza mandato. |
| `design-system-auditor` | Controllare in modo meccanico token, componenti, stati, accessibilità, motion e responsive. | Non decide se il design è “bello”: controlla completezza e coerenza. |

### Workflow completo per una landing nuova

```text
brief
  → landing-art-director
  → scelta umana di una direzione
  → design-system-author
  → implementazione frontend
  → impeccable-reviewer
  → design-system-auditor
  → web-design-guidelines + screenshot/performance QA
```

La scelta umana dopo le direzioni visive è un gate obbligatorio. Il sistema non deve passare automaticamente da esplorazione a implementazione.

### Scenari

1. **Landing greenfield**: eseguire il workflow completo.
2. **Sito esistente con brand**: usare prima `create-design-md`, poi limitare l’art direction al linguaggio visuale estratto.
3. **Landing già pronta ma piatta**: usare direttamente `impeccable-reviewer`, eventualmente con una modalità “bolder”.
4. **Landing con molto motion**: aggiungere `emil-design-eng` solo dopo aver deciso che il motion ha uno scopo.
5. **Confronto tra varianti**: usare opzionalmente `design-lab` per esplorazione e feedback.

### Ruolo di `impeccable`

`impeccable` può funzionare da validatore qualitativo. Va eseguito contro tre fonti, in questo ordine:

1. brief e obiettivo della pagina;
2. design system approvato;
3. implementazione e screenshot desktop/mobile.

Il suo output dovrebbe essere una tabella di finding con severità, evidenza, impatto e correzione proposta. Non deve diventare un secondo art director che sostituisce la direzione scelta.

### Ruolo della checklist

La checklist è un gate di completezza separato dalla review estetica. Deve rispondere a domande binarie come:

- esistono token semantici per colori, tipografia, spaziatura e radius?
- sono coperti hover, focus, active, disabled e loading?
- le immagini hanno aspect ratio, dimensioni e alt text?
- sono rispettati contrasto, touch target, reduced motion e responsive behavior?
- il sistema evita valori hardcoded e componenti duplicati?

### Artefatto canonico

Non creare contemporaneamente `DESIGN.md` e `.ai/context/DESIGN_SYSTEM.md`. La skill locale `designer` legge oggi `.ai/context/DESIGN_SYSTEM.md`, mentre `create-design-md` usa `DESIGN.md`. La V1 dovrebbe scegliere un solo formato; la scelta consigliata è `.ai/context/DESIGN_SYSTEM.md`, con eventuale supporto a `DESIGN.md` come fallback.

Il documento dovrebbe contenere almeno:

- audience, obiettivo e tesi visiva;
- font, scala tipografica e regole di wrapping;
- palette con token semantici;
- container, griglia, spacing e breakpoint;
- componenti e stati principali;
- regole per immagini, icone e asset;
- motion budget e reduced-motion behavior;
- responsive behavior;
- anti-pattern espliciti specifici del progetto.

### V1 consigliata

Non creare subito quattro agenti autonomi esposti separatamente. Creare un unico workflow user-facing, per esempio `landing-page`, con modalità:

- `concept`: attiva l’art director;
- `document`: crea o aggiorna il design system;
- `review`: attiva la review qualitativa;
- `audit`: esegue checklist e QA tecnico.

In questo modo gli agenti restano specializzati, ma l’utente segue un percorso unico e non deve sapere quale skill combinare manualmente. Aggiungere agenti separati solo quando il workflow viene riutilizzato abbastanza da giustificare il costo di manutenzione.
