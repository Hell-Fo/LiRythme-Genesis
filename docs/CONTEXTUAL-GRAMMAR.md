# LiRythme — Grammaire contextuelle normative

Cette référence prévaut sur les descriptions historiques Phase A/B/C. CHAIN Phase C / FOCUS et sa stabilisation contextuelle validées hardware par Dan le 16 septembre 2026. Aucun push ; STOP après le commit de clôture.

## Contexte commun

Extension A/T Phase A : voir [AT-PHASE-A-VELOCITY.md](AT-PHASE-A-VELOCITY.md).
Extension COLOR : voir [AT-COLOR.md](AT-COLOR.md) pour le deuxième pad A/T,
la commande collective A, son feedback de lecture et la cible capturée au BEGIN.
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

Extension DOUBLE : `SHIFT + >>` double la cible musicale contextuelle au
relâchement, sans navigation ni répétition. Ce geste est disponible dans les
trois contextes, hors transaction A/T, et reste subordonné au chord FOCUS.
Les règles, limites et frontières d'activation sont précisées dans
[DOUBLE-CONTEXTUEL.md](DOUBLE-CONTEXTUEL.md).

[<<]+[>>] est exclusivement le toggle FOCUS lorsque CHAIN est activé. En NORMAL, il est consommé sans action. Les deux ordres d'appui et les releases décalés sont équivalents. Aucune action individuelle, preview, sélection de Timeline, FREEZE ou LOCK ne doit fuir du chord. Les gestes individuels ordinaires sont résolus au relâchement ; un appui tenu ne déclenche pas de navigation anticipée.

## Vérification et portée

Tests matriciels dans `scripts/test-polymetric.mjs` : 27 cases DELETE, 9 cases navigation et 9 cases chord (chacune dans les deux ordres), en plus des régressions Phase A/B/C : Loop Point, INSERT/APPEND, palette et butées, COPY/DELETE Voice, SOLO/MUTE, Instrument Focus, polymétrie, Leader/Follower, MIDI et Persistence.

Le format Persistence demeure inchangé : FOCUS, VIEW et son index d'occurrence sont des états de session non sérialisés. Validation par suite complète, syntaxe JS/MJS et `git diff --check`. Validation hardware confirmée par Dan ; les vérifications finales avant commit sont logicielles.

### DELETE court/long en CHAIN — amendement hardware

Cet amendement précise DELETE+BOOK en CHAIN sans FOCUS. DELETE armé puis
PRESS sur le pad Motif commence une intention sans mutation. RELEASE avant
le seuil existant de 300 ms retire une seule occurrence : celle sélectionnée
si son Motif correspond au pad, sinon la dernière occurrence correspondante.
Au seuil, DELETE MOTIF vide événements, vélocités et longueurs dans le Book
et retire toutes les occurrences du Motif. RELEASE ne déclenche ensuite
aucune action. Ce geste de confirmation ne répète jamais DELETE occurrence.

CHAIN+FOCUS conserve DELETE local existant, court ou maintenu : le Motif
ciblé est vidé sans retirer ses occurrences ni modifier LoopMaster/FOCUS.
Hors CHAIN, DELETE reste inchangé. DELETE+Instrument et DELETE+PLAY gardent
leur grammaire. Les suppressions structurelles réutilisent removeChainOccurrence.
Si PLAYING est vidé en PLAY, la géométrie engagée est conservée via le cycle
différé existant jusqu'à la frontière naturelle ; aucun reset/rephase ajouté.

## Harmonisation d'édition — retour hardware du 28 septembre 2026

Cet amendement remplace les descriptions précédentes de navigation silencieuse
et de feedback A/T statique.

- CHAIN sans FOCUS, STOP/PAUSE, hors transaction : << >> naviguent les occurrences,
  même sur la page PLAY. La page affichée ne détourne plus cette grammaire.
- Motif et transaction A/T, STOP/PAUSE : << >> avancent le curseur et préécoutent
  les événements de la cellule éditée. A/T conserve son Motif capturé ; FOCUS
  utilise VIEW. PLAYING n'est pas déplacé pour effectuer cette préécoute.
- La préécoute lit les cellules de la Timeline, sans modulo de longueur Voice :
  elle inspecte les données éditées, y compris une cellule hors cycle local.
  Le playback conserve ses cycles polymétriques et captures temporelles DOUBLE.
- Chaque déplacement (clic ou répétition tenue) produit au plus une préécoute,
  sans rattrapage ni queue de ticks. Les Note Off capturent toujours sortie,
  canal et note réellement jouée. Le chord FOCUS et SHIFT+>> restent exclusifs.
- En A/T, le curseur est visible : GREEN sur événement ciblé, DIM GREEN sur vide.
  À son départ, le Step retrouve sa couleur de sélection/événement. Une sélection
  de Steps restaure également le curseur après le rendu.
- Les pads Instruments suivent les événements du Step courant dans le Motif
  édité : GREEN sur événement, DIM GREEN sur vide ; pour une Voice sélectionnée,
  YELLOW sur événement et DIM AMBER sur vide. Aucun flash de 80 ms pendant A/T.
- COLOR : A est désormais RED dès qu'au moins un événement ciblé sous le curseur
  porte COLOR, OFF sinon. Cette consigne remplace le précédent DIM RED pour un
  seul événement. La commande collective ON/OFF reste indépendante du curseur.
- VELOCITY : chaque ligne A–H est RED si sa valeur est présente sur un événement
  ciblé sous le curseur, DIM AMBER sinon. Les valeurs neutres non matérialisées
  ne signalent aucun attribut. Le panneau PLAY conserve la valeur collective
  appliquée, indépendamment de cette inspection.

Les retours A/T utilisent le rendu LED différentiel et coalescé existant.
361 tests : matrice de navigation mise à jour, répétition/préécoute sans tick
supplémentaire, dispatch réel VIEW/A/T avec vélocité et COLOR, Note Off conservés,
curseur PLAY et feedback Instruments stable. Validation hardware encore attendue.
Aucun commit/push ; hardware non sollicité.
