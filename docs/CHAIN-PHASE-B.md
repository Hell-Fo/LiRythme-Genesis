# CHAIN Phase B — navigation contextuelle, INSERT, LOOP POINT

Base : `78925f2`, Phase A validée hardware/UI. **CHAIN Phase B validée hardware
par Dan**, avec navigation STOP/PAUSE, longpress contextuel, confirmation GREEN
120 ms, palette CHAIN finale, LOOP POINT / LoopMaster éditable live, feedbacks
Launchpad/page PLAY et flashes de butée. Aucun arrêt automatique en fin de chaîne.
Clôture par le commit `feat(chain): add contextual editing and live loop points`.
Aucun push ; arrêt après commit.

## Navigation STOP/PAUSE — conservée

En CHAIN, `<< / >>` parcourent les occurrences, y compris les doublons.
Sans sélection, la première pression choisit la tête dans les deux directions.
Les extrémités sont bornées ; une chaîne vide reste sans sélection.
Chaque sélection affiche son Motif au step 0 et annule la géométrie live suspendue,
sans démarrer le transport ni réinitialiser la phase MIDI.

`chainPlayingIndex` sert de sélection au repos. Le highlight vert du texte suit
cette occurrence en STOP/PAUSE. Les caractères `[NN]` et leur emplacement restent
fixes, sans nouveau label, FOCUS ou VIEW. En PLAY, l'affichage suit PLAYING.
Les gestes hors CHAIN restent inchangés.

Après navigation en PAUSE, CONTINUE reprend l'occurrence sélectionnée au step 0.
Sans navigation, PAUSE/CONTINUE conserve la position suspendue. PLAY depuis STOP
ou START explicite repart de la première occurrence.

## Feedback Launchpad des butées

Après traitement de `<< / >>` en CHAIN + STOP/PAUSE, les 16 pads BOOK affichent
un flash global de 120 ms si la direction atteint sa borne :

- `<<` sur la première occurrence, arrivée ou pression supplémentaire : YELLOW.
- `>>` sur la dernière occurrence, arrivée ou pression supplémentaire : RED.
- Sur une occurrence intermédiaire : aucun flash global.
- Un seul maillon : la direction décide, `<<` YELLOW et `>>` RED, sans combinaison.

Chaque nouvelle pression relance son flash. Celui-ci existe dans les deux vues,
PLAY et Bibliothèque, sans mutation ni sélection supplémentaire ni effet musical.
À son terme, chaque BOOK retrouve son état réel actuel : palette, DATA, membre
Chain, LoopMaster et phase du blink NEXT. Les timers visuels sous-jacents continuent.
Quitter la borne pour une occurrence intermédiaire retire le flash ; démarrer
PLAY ou sortir de CHAIN le désactive. Aucun flash sur chaîne vide ou pendant PLAY.

## Longpress contextuel — conservé

Le contexte au seuil de 300 ms décide de l'opération :

- PLAY : APPEND en fin de chaîne.
- STOP/PAUSE avec sélection : INSERT immédiatement après l'occurrence sélectionnée.
- STOP/PAUSE sans sélection : APPEND, chaîne vide comprise.

La sélection ne change pas. Une pression tenue produit une seule transaction ;
le relâchement, les pressions répétées et le clic court n'ajoutent rien.
COPY/DELETE conservent leur priorité et leur routage BOOK/INSTRUMENT.
Une transaction acceptée confirme sur le pad Motif par GREEN pendant 120 ms,
puis le pad retrouve son état CHAIN réel. Aucun feedback avant acceptation,
sur clic court ou sur opération refusée.

## LOOP POINT / LoopMaster

Une chaîne possède zéro ou un Loop Point. `chainLoopMasterIndex` vaut `null`
pour LOOP OFF, sinon référence une occurrence précise de la liste. Les mutations
ajustent cet index pour préserver la même occurrence, jamais simplement son Motif ID.

À la fin naturelle du LoopMaster, le moteur revient à la première occurrence,
step 0. Les occurrences suivantes restent intactes mais ne sont pas atteintes
par la lecture en boucle tant que le point existe. Sans Loop Point, la boucle
Phase A parcourt toute la chaîne puis revient à la tête.

Exemple de performance, `■` désignant ici la frontière après LoopMaster :

```text
[01][05][03] ■ [08][04][10]
Lecture : 01 → 05 → 03 → 01 → 05 → 03 → …
```

Ce schéma explique le point ; l'affichage Chain validé garde son texte `[NN]`
stable. Seule l'occurrence LoopMaster utilise une typographie RED, même au repos.
Si elle porte aussi le highlight PLAYING, son texte reste rouge et un soulignement
vert conserve le feedback de lecture sans changer la largeur ni la position du texte.
Les autres occurrences PLAYING conservent leur highlight vert. Aucun label ou symbole ajouté.

## Gestes pendant PLAY

- Avec un Loop Point : `SHIFT + pad du LoopMaster` retire le point immédiatement,
  quel que soit le Motif PLAYING. Le cycle engagé continue sans interruption.
  Retirer LOOP pendant 01 permet ensuite 05 → 03 → 08 → 04 → 10.
  Retirer LOOP pendant 03 prépare immédiatement 08 comme NEXT.
- Sans Loop Point : `SHIFT + pad PLAYING` désigne l'occurrence actuellement
  PLAYING comme LoopMaster. Le retour à la tête se produit à sa prochaine fin
  naturelle, sans reset ni rephase du Motif engagé.
- Un autre pad ne crée pas de point sur une occurrence indéterminée. Avec un
  point actif, un autre pad ne le déplace pas pendant PLAY.
- Si PLAYING a été supprimé et termine encore son cycle, il est détaché de la
  chaîne : il ne peut pas créer de Loop Point sur un doublon survivant.

BOOK étant partagé par Motif ID, le pad du LoopMaster permet toujours LOOP OFF
pendant PLAY, même si une occurrence antérieure du même Motif joue.

## Édition STOP/PAUSE

Naviguer par `<< / >>`, puis `SHIFT + pad correspondant à l'occurrence sélectionnée`
pose le point après cette occurrence. Le même geste sur l'occurrence déjà
LoopMaster retire le point. Sur une autre occurrence sélectionnée, il déplace
l'unique point vers cette occurrence.

Dans `[01][05a][05b][03]`, la sélection permet de choisir précisément 05a ou 05b
malgré leur pad BOOK commun. Sans sélection valide, sur une chaîne vide ou sur
un pad qui ne correspond pas à la sélection, le geste ne crée rien.
SHIFT+BOOK est consommé et ne déclenche aucun longpress INSERT/APPEND.
Ce geste utilise la sélection d'occurrence en STOP et PAUSE dans les deux vues,
PLAY et Bibliothèque. Le routage pendant PLAY reste celui de la Bibliothèque.

## Frontière, phase et transport

Le Loop Point est un état immédiatement éditable, jamais un événement différé
à programmer ou annuler. Son toggle recalcule NEXT et redessine BOOK sans changer
PLAYING, la position, le cycle live, la phase MIDI ou la révision de transport.

La même fonction `getChainNextIndex()` détermine NEXT et le successeur réel à la
frontière naturelle : longueur explicite, PPCM polymétrique ou longueur par défaut 32.
À la frontière du LoopMaster, elle renvoie la tête. Le pipeline dispatch ensuite
le step 0 une seule fois, avec son beat normal. Il n'appelle pas STOP.
Les callbacks Note Off engagés, CLOCK, MIDI et Leader/Follower restent historiques.

STOP/START et PAUSE/CONTINUE conservent leurs règles validées. Le point reste en
mémoire après STOP ou sortie de CHAIN ; son effet est désactivé hors CHAIN.
Les occurrences derrière le point restent accessibles à la navigation STOP/PAUSE.

## Mutations structurelles

- INSERT avant LoopMaster : son index augmente, sa référence reste la même occurrence.
- INSERT après LoopMaster : son index reste inchangé.
- APPEND derrière LoopMaster : nouveaux maillons conservés derrière la frontière,
  accessibles à la lecture après LOOP OFF.
- DELETE d'un autre maillon : ajuste l'index si nécessaire, sans changer LoopMaster.
- DELETE du LoopMaster : LOOP OFF immédiatement ; aucun transfert au doublon voisin.
- DELETE du seul maillon ou DELETE+PLAY : chaîne vide, aucun Loop Point.
- DELETE+NEXT retire le successeur réellement préparé, donc la tête lorsque
  PLAYING est LoopMaster ; la référence LoopMaster est ajustée en conséquence.

Supprimer PLAYING conserve la règle Phase A : son cycle engagé se termine,
puis la lecture reprend au successeur disponible à l'emplacement supprimé.
Si cette occurrence était LoopMaster, son point est déjà retiré.

## LED BOOK

La palette des autres pads et les priorités COPY/confirmation sont conservées :

| État | PLAY normal | CHAIN | Occurrence LoopMaster |
| --- | --- | --- | --- |
| EMPTY | OFF | OFF | — |
| DATA hors chaîne | DIM GREEN | DIM AMBER | — |
| Présent, ni PLAYING ni NEXT | DIM GREEN | YELLOW | DIM RED |
| NEXT | DIM GREEN ↔ GREEN | DIM AMBER ↔ YELLOW | DIM RED ↔ RED |
| PLAYING | GREEN fixe | GREEN fixe | GREEN ↔ DIM RED |

Pour les pads ordinaires, le blink de 160 ms signifie NEXT et GREEN fixe signifie PLAYING.
LoopMaster PLAYING alterne GREEN (joue maintenant) et DIM RED (frontière LOOP active)
avec le timer visuel existant de 160 ms. Les autres pads PLAYING restent GREEN fixes.
Après PLAYING, le pad redevient DIM RED ou DIM RED ↔ RED s'il est NEXT.
LOOP OFF restaure immédiatement la palette CHAIN correspondant à l'état réel,
sans perdre la phase du blink NEXT.

Sur un pad partagé, PLAYING garde la priorité sur NEXT. Une occurrence antérieure
du même Motif qui joue reste GREEN ; elle n'hérite pas du rôle du LoopMaster.
Si NEXT est un doublon antérieur, son blink reste DIM AMBER ↔ YELLOW ; si NEXT
est précisément LoopMaster, il utilise DIM RED ↔ RED. Au repos, le pad partagé
signale le LoopMaster par DIM RED. En PAUSE, l'occurrence sélectionnée conserve
le rendu GREEN plein historique, même si elle est LoopMaster.

La confirmation GREEN 120 ms après INSERT/APPEND accepté conserve sa priorité
ponctuelle. COPY garde ses feedbacks historiques. Le flash transport RED de 80 ms
à chaque occurrence reste indépendant de BOOK. Aucun flash BOOK de frontière identique.

## Persistance et exclusions

Chaîne, curseur et Loop Point restent en mémoire uniquement. La banque C.1
version 1 et les 16 Motifs persistants sont inchangés. COPY/DELETE Voice,
DELETE structurel, Instrument Focus et l'écran Chain texte sont préservés.
Aucun nouveau FOCUS Chain, Modulation, VIEW indépendant, FREEZE, drag/drop
ou édition souris.

## Validation logicielle

Les 178 tests de la suite complète passent et couvrent les comportements historiques, les gestes validés et
les scénarios Loop Point : préfixe répété et queue intacte, LOOP OFF pendant
PLAY ailleurs/sur LoopMaster, création sur PLAYING, phase inchangée, édition
STOP/PAUSE entre doublons, palette RED, restauration immédiate, mutations,
suppression de LoopMaster/chaîne, Note Off réel et frontières explicites/PPCM/32
sur les horloges INTERNAL et MIDI. Les tests de butée couvrent STOP et PAUSE
séparément, les doublons, le maillon unique, les pressions répétées et la restauration
exacte des 16 LEDs, notamment LoopMaster/DATA et le blink continuant sous le flash.
Syntaxe des 33 fichiers JS/MJS et
`git diff --check` vérifiés.

## Parcours hardware validé — Dan

1. Préparer `[01][05][03][08][04][10]`, sélectionner 03 en STOP/PAUSE et
   `SHIFT + 03` : LoopMaster après cette occurrence.
2. Jouer plusieurs tours de 01 → 05 → 03. Vérifier DIM RED au repos,
   DIM RED ↔ RED en NEXT et GREEN ↔ DIM RED lorsque LoopMaster joue.
   Vérifier son texte rouge sur la page PLAY, avec soulignement vert lorsqu'il joue.
3. Retirer LOOP avec `SHIFT + 03` pendant 01, puis refaire pendant 03 :
   vérifier la continuation naturelle vers 08 → 04 → 10 sans reset/rephase.
4. Sans LOOP, attendre 04 puis `SHIFT + PLAYING` : nouvelle frontière après 04,
   retour à 01 à sa fin naturelle. Un autre pad ne doit pas créer de point.
5. Tester 05a/05b, INSERT avant/après, APPEND derrière, DELETE d'un autre maillon,
   DELETE LoopMaster et DELETE+PLAY. Aucun doublon ne doit hériter du point supprimé.
6. Recontrôler navigation, INSERT/APPEND et GREEN 120 ms, palette CHAIN,
   texte stable, COPY/DELETE Voice, Instrument Focus, CLOCK et Note Off.
7. Vérifier les flashes YELLOW/RED des butées en STOP/PAUSE, y compris les pressions
   répétées, les doublons et le maillon unique ; vérifier la restauration après 120 ms.

Phase B validée hardware. Aucun push. STOP après le commit de clôture.
