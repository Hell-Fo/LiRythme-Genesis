# LiRythme — Grammaire contextuelle normative

Cette référence prévaut sur les descriptions historiques Phase A/B/C. CHAIN Phase C / FOCUS et sa stabilisation contextuelle validées hardware par Dan le 16 septembre 2026. Aucun push ; STOP après le commit de clôture.

## Contexte commun

Extension A/T Phase A : voir [AT-PHASE-A-VELOCITY.md](AT-PHASE-A-VELOCITY.md).
Elle définit la transaction VELOCITY et la réaffectation exclusive de VALUE
pendant celle-ci ; les matrices historiques ci-dessous restent normatives.

`LiRythmeActions.resolveContext()` expose le mode NORMAL / CHAIN / CHAIN_FOCUS, le Motif édité, le caractère structurel et la navigation applicable. DELETE et navigation interrogent cette résolution ; COPY utilise les projections du même Motif édité. Les futures commandes doivent interroger ce contexte plutôt qu'ajouter une décision hardware indépendante.

- NORMAL : édition du Motif courant.
- CHAIN : édition de la structure Chain ; les Instruments restent locaux.
- CHAIN+FOCUS : édition du Motif VIEW indépendante de PLAYING.

Le moteur musical continue de lire PLAYING. Les projections events/voiceLengths/motifLength suivent le Motif édité.

## DELETE

| Contexte | DELETE+PLAY | DELETE+Instrument | DELETE+BOOK |
| --- | --- | --- | --- |
| NORMAL | Delete Motif courant | Delete partition Instrument | Delete Motif ciblé |
| CHAIN | Delete Chain | Delete partition Instrument | Retire l'occurrence de la Chain |
| CHAIN+FOCUS | Delete Motif VIEW | Delete partition Instrument du VIEW | Delete Motif ciblé |

Cette matrice vaut en PLAY, PAUSE et STOP. **DELETE+Instrument reste toujours local au Motif édité** : effacement des 32 cellules de la Voice sans changer les longueurs. CHAIN sans FOCUS est le seul contexte qui détourne PLAY et BOOK vers la structure. BOOK retire la dernière occurrence correspondant au pad partagé, conformément à Phase A/B.

NORMAL+DELETE+PLAY conserve l'effacement historique des événements seuls. DELETE+BOOK efface événements et longueurs du Motif ciblé. FOCUS+DELETE+PLAY efface événements et longueurs du VIEW. Une cible valide désarme DELETE ; les maintiens et releases consommés ne deviennent jamais des actions ordinaires.

Différences runtime explicites : en PLAY, les protections historiques des destinations BOOK PLAYING/NEXT autres que le Motif édité restent actives ; une cible protégée conserve DELETE armé. Supprimer le VIEW lui-même reste permis ; s'il est PLAYING, la géométrie engagée reste active jusqu'à la frontière naturelle via le cycle différé existant. Les notes déjà émises terminent leur gate existant. Aucun arrêt, reset de clock ou All Notes Off n'est ajouté.

DELETE+NEXT, extension Phase B, reste structurel uniquement en CHAIN sans FOCUS ; il est invalide en NORMAL et en FOCUS. SOLO/MUTE conservent leurs commandes dédiées.

## Navigation individuelle << / >>

| Contexte | PLAY | STOP / PAUSE |
| --- | --- | --- |
| NORMAL | Motif ↔ Modulation : futur, ne pas implémenter | Steps du Motif affiché |
| CHAIN | Motif ↔ Modulation : futur, ne pas implémenter | Occurrences Chain |
| CHAIN+FOCUS | Occurrences Chain / VIEW | Steps du Motif VIEW |

En FOCUS+PLAY, `chainViewIndex` est distinct de `chainPlayingIndex`. Avec [01][05a][05b][03], les index 1 et 2 restent distincts même si VIEW affiche 05 dans les deux cas. La navigation est bornée. Elle ne change ni PLAYING, NEXT, Loop Point, playhead, cycle différé, transport ni timing MIDI.

Entrer en FOCUS ancre VIEW sur l'occurrence PLAYING attachée. Sans occurrence sélectionnée, le premier déplacement choisit la tête. BOOK sélectionne la première occurrence correspondant au Motif ; un Motif externe détache l'index VIEW. INSERT/APPEND et retrait ajustent cet index pour conserver l'identité de l'occurrence, ou le détachent si elle est retirée.

En FOCUS+STOP/PAUSE, les Steps utilisent la durée du VIEW et bouclent localement. En CHAIN sans FOCUS, la navigation conserve la sélection d'occurrence, le retour au Step 0 et les flashes de butée YELLOW/RED de 120 ms. Les raccourcis SHIFT hors CHAIN et les accords de tempo avec PLAY restent réservés.

## Chord FOCUS

[<<]+[>>] est exclusivement le toggle FOCUS lorsque CHAIN est activé. En NORMAL, il est consommé sans action. Les deux ordres d'appui et les releases décalés sont équivalents. Aucune action individuelle, preview, sélection de Timeline, FREEZE ou LOCK ne doit fuir du chord. Les gestes individuels ordinaires sont résolus au relâchement ; un appui tenu ne déclenche pas de navigation anticipée.

## Vérification et portée

Tests matriciels dans `scripts/test-polymetric.mjs` : 27 cases DELETE, 9 cases navigation et 9 cases chord (chacune dans les deux ordres), en plus des régressions Phase A/B/C : Loop Point, INSERT/APPEND, palette et butées, COPY/DELETE Voice, SOLO/MUTE, Instrument Focus, polymétrie, Leader/Follower, MIDI et Persistence.

Le format Persistence demeure inchangé : FOCUS, VIEW et son index d'occurrence sont des états de session non sérialisés. Validation par suite complète, syntaxe JS/MJS et `git diff --check`. Validation hardware confirmée par Dan ; les vérifications finales avant commit sont logicielles.
