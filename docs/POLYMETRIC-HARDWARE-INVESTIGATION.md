# Polymétrie — incident MIDI résolu

Incident découvert pendant la validation de la Bibliothèque Motif Phase A.
Configuration : INTERNAL, CLOCK OUT et Default MIDI Output sur Arturia
DrumBrute Impact. Reproduction : Kick 4, OHat 7, CHat 5, FM 32.
PPCM : 1120 steps.

La comparaison logique avant/après Phase A sur 4480 ticks a confirmé les mêmes
événements et phases pour les quatre Voices. La capture renderer montrait des
dispatchs Kick espacés de 498,4 à 501,8 ms pour 500 ms attendus, sans erreur de
séquençage ; elle ne mesurait pas l'émission physique des messages MIDI.

Le port partagé routait les notes vers le worker d'horloge, qui ne vidait qu'un
message par pulse MIDI : environ 20,83 ms à 120 BPM. Une rafale de Voices pouvait
donc retarder le Kick de plusieurs pulses. Ce défaut existait dans e322070,
avant la banque de motifs.

Correction isolée dans `2086927` : vidage borné des messages en attente après
chaque pulse, avec vérification de la marge de 2 ms avant chaque envoi. La
priorité Note Off et l'ordre des Note On sont conservés. Le test associé reste
dans ce commit MIDI, distinct de la Phase A.

Validation hardware Dan : polymétrie 4/7/5/32 stable, CLOCK OUT stable,
disparition de l'hésitation et absence de flam entre les Kicks identiques du
DrumBrute et de LiRythme. La banque de 16 motifs a ensuite été validée.

La capture temporaire, son hook et son test ont été retirés avant le commit
Phase A. Le test logique comparatif de 4480 ticks est conservé comme protection
contre une régression polymétrique de la banque. Aucun outil de diagnostic
temps réel n'est ajouté au produit par cette investigation.

## A/T Phase A — régression d'édition, validée hardware (2026-09-21)

Validation finale Dan : **OK**. La correction du burst LED et la disparition
des hoquets sont confirmées hardware. Le moteur MIDI, le worker clock et la
correction de queue décrite ci-dessus restent inchangés. Aucun push.

### Reproduction instrumentée avant correction

`node --test --test-name-pattern="workload probe" scripts/test-at.mjs`
exerce les entrées hardware réelles (`handleMidiMessage`) avec transport PLAY,
sortie MIDI simulée, 1 puis 512 événements, et les 16 snapshots de vélocité
initialisés. COMMIT est mesuré directement à l'expiration logique du hold ;
les tests de gestes couvrent aussi le hold physique simulé.

| Geste | Messages LED avant | Après, différés (1 / 512 événements) |
| --- | ---: | ---: |
| BEGIN sans édition | 97 | 72 / 72 |
| TARGET voice seulement | 97 | 1 / 1 |
| première VALUE, cible MOTIF | 97 | 1 / 1 |
| 32 VALUES sans laisser tourner le rendu | 3104 | 2 / 2 |
| CANCEL | 77 | 10 / 41 |
| COMMIT après édition | 77 | 10 / 41 |

Après correction, aucun de ces gestes n'envoie de LED synchroniquement.
Les comptes dépendent des couleurs déjà affichées ; le test initialise une
surface connue. Les valeurs intermédiaires musicales sont toutes appliquées,
seules leurs représentations LED sont fusionnées.

Cause logicielle démontrée : `ATTransaction.changed` → `onATChange` →
`drawATChange` → `drawSelectedMotif` → motif/instruments/books/view + swap.
`drawATValues` était appelé une première fois, puis encore trois fois via
COPY/DELETE/SWITCH. Chaque VALUE produisait donc un rendu complet et 32 envois
pour les seuls huit boutons VALUE, même si un seul événement était ciblé.
Le clignotement était aussi réarmé à chaque pression et renvoyait 16 books.
En backend natif, chaque LED traverse renderer → main → utility → sortie
contrôleur. Ce trafic concurrence notamment le transfert des notes ; le
worker d'émission clock est toutefois distinct. Ces mesures ne prouvent pas
un retard physique de F8. Dan a ensuite confirmé hardware la résolution de
la régression clock après correction du burst LED ; aucune capture physique
de F8 supplémentaire n'est revendiquée.

Pas de notification cellule par cellule : une notification par geste, aucun
`onBankChange` à BEGIN/TARGET/APPLY/CANCEL, un seul à COMMIT modifié. L'autosave
programme ensuite son flush à 350 ms. BEGIN copie uniquement les matrices de
vélocité ; APPLY parcourt au maximum 16 × 32 cellules sans reconstruire le
séquenceur ; CANCEL restaure les matrices touchées. Le troisième panneau
reste sur son rendu UI existant, avec signature pour éviter les mutations DOM
identiques, hors callback A/T hardware. Aucun changement de ces mécanismes.
Les durées CPU du probe sont imprimées mais excluent IPC, driver et sortie
physique : elles ne constituent pas une mesure de jitter MIDI.

### Correction et vérification

Les notifications A/T indiquent leur nature. VALUE actualise uniquement les
huit boutons ; TARGET uniquement sa surface et les boutons VALUE. Les LEDs
A/T sont dédupliquées et fusionnées par pad, envoyées dans les deux buffers
par lots de quatre, avec un timer de 4 ms entre lots. Les rendus plus récents
clock/vue/pulse supplantent les couleurs en attente. Aucun report de tick,
changement de tempo, rephasage ou filtrage de Note On/Off. Le clignotement
conserve sa phase ; reset/reconnexion vide la file visuelle.

Tests ajoutés : six chemins mesurés à deux densités, absence d'envoi LED
synchrone, limite par lot, fusion des pressions, dernière vélocité immédiate,
absence de redraw complet pour VALUE, phase de blink conservée, priorité au
rendu musical plus récent et nettoyage de la file. Les tests de feedback
attendent désormais le drainage visuel.

Validation : suite `npm.cmd test`, **268/268** ; syntaxe JS/MJS/CJS validée ;
`git diff --check` réussi. Le smoke test supplémentaire du portable existant
échoue au démarrage Electron (`GPU process isn't usable`, exit GPU
`-1073741515`) dans cet environnement ; il ne valide pas le patch source.
Ce test et ses artefacts Field Build restent hors du commit A/T.

**Validation hardware finale Dan : OK** pour VELOCITY, TARGET Instrument ×
Step et sélections, A–H, CANCEL/COMMIT, panneau PLAY, transfert vers le Livre
A/T préexistant et correction du burst LED/timing. Le blocage hardware est
levé ; le commit est limité à A/T Phase A, ses tests et sa documentation.

### Correction A/T — représentation PLAY (STOP hardware)

Clarification Dan : FOCUS choisit le Motif édité ; la sélection Instruments
filtre les Voices visibles ; la sélection Steps définit où agit A/T.
Entrer en A/T ne modifie ni FOCUS ni Instrument Focus. En FOCUS, la source
reste VIEW. Aucun Instrument sélectionné affiche le Motif complet ; une
sélection affiche l'union des événements des Instruments sélectionnés.
Les Steps conservent leur feedback et leur rôle dans TARGET, sans filtrer
les événements visibles.

Le rendu Timeline réutilise le parcours de visibilité Instrument Focus.
Une modification de sélection Instruments redessine aussi la Timeline via
la file LED existante. Les pads présents dans le Motif sont GREEN, les
sélectionnés YELLOW, les absents non sélectionnés inactifs (DIM_GREEN).
Aucune modification de la grammaire ou du calcul musical A/T ; CHAIN NEXT
reste hors de cette correction.

Validation logicielle : `npm.cmd test` **271/271**, syntaxe **47 fichiers**
JS/MJS/CJS, `git diff --check` réussi. Tests avec FOCUS actif et inactif,
VIEW distinct de PLAYING, union Instruments, Steps indépendants et sortie
A/T. Validation hardware finale : voir ci-dessous.

### A/T EDIT VIEW figé en CHAIN (STOP hardware)

Retour hardware Dan : représentation Instruments/Timeline validée à 99 %.
Dernière correction : BEGIN capture le motif contextuel dans la transaction
A/T en CHAIN (PLAYING sans FOCUS, VIEW avec FOCUS). Le même résolveur fournit
ce motif aux opérations A–H et au rendu Timeline + Instruments. Les Steps
restent TARGET/feedback ; le filtre Instruments et les couleurs sont conservés.
Ni FOCUS ni le contexte général du transport ne sont modifiés.

Les transitions CHAIN continuent de changer PLAYING/NEXT normalement, sans
déplacer A/T EDIT VIEW. CANCEL/COMMIT libèrent la capture et redessinent la
source normale du contexte courant via la file LED existante. Hors CHAIN,
le comportement reste contextuel comme auparavant. Aucun changement CHAIN NEXT.

Les anciens tests autorisant les valeurs A–H à suivre les changements de
PLAYING/VIEW sont adaptés à cette règle. Nouveau scénario : BEGIN sur 05,
transitions naturelles vers 03 puis 08, édition et représentation maintenues
sur 05, avec FOCUS actif/inactif et CANCEL/COMMIT. Vérification du transport,
de NEXT, du Loop Point, du filtre Instruments et du feedback Steps.

Validation : `npm.cmd test` **275/275**, syntaxe **47 fichiers** JS/MJS/CJS,
`git diff --check` réussi. **Aucun commit/push. STOP hardware : validation
physique Dan encore attendue.**

### Stabilisation Phase A ? approbation hardware finale

Dan confirme **100 % APPROUV? hardware**. Le contexte A/T fig?, le rendu
Instruments/Timeline, les s?lections, A?H et CANCEL/COMMIT sont valid?s.
La correction burst LED/clock est d?j? pr?sente dans `44790f1`.
Le commit `fix(at): stabilize contextual editing feedback` exclut Field Build
et le tweak CHAIN NEXT ? 500 ms ainsi que ses tests.

Validation finale : suite compl?te du working tree **276/276** ; p?rim?tre
exact du commit **275/275**, dont un test de conservation du contexte hors
CHAIN ; syntaxe JS/MJS/CJS et `git diff --check` r?ussis. Aucun push.
