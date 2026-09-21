# GENESIS — THE GATE

Extension actuelle : [A/T Phase A](AT-PHASE-A-VELOCITY.md) peuple le Livre A/T
préexistant dans la zone BOOK de PLAY. THE GATE conserve `PLAY ↔ MOTIF_LIBRARY`.
VELOCITY est RED fixe, puis RED clignotant pendant sa transaction ; les sept
Attributs EMPTY restent DIM RED et les huit Transformations EMPTY DIM AMBER.
VALUE est exclusivement réaffectée pendant une transaction. SWITCH reste note
120, en bas de la colonne. Les paragraphes suivants décrivent la phase initiale
THE GATE avant activation de VELOCITY ; la grammaire A/T liée ci-dessus prévaut
pour ses LEDs et ses gestes.

`LiRythmeState.currentView` démarre à `PLAY`. L’action indépendante du matériel
`LiRythmeActions.toggleView()` bascule entre `PLAY` et `MOTIF_LIBRARY`.
La future Bibliothèque pourra utiliser cet état sans modifier le transport,
`currentBook`, `currentTimeline` ou la matrice musicale existante.

Launchpad Mini Mk1 : `[SWITCH]` utilise le mapping existant, Note 120 (0x90),
en bas de la colonne VALUE. Un appui bascule une fois ; le relâchement (Note On
à zéro ou Note Off) permet le prochain appui. Ce bouton remplace son ancien
raccordement à `nextBook()`.

Feedback SWITCH : LED toujours OFF, en PLAY comme en MOTIF_LIBRARY, sans blink.
La zone BOOK seule indique le contexte actif. La LED SWITCH est copiée
dans les deux buffers et restaurée au redessin/rebranchement du contrôleur.
L'action de navigation notifie le renderer via `setViewChangeHandler()`.
`drawView()` rafraîchit SWITCH et la zone BOOK avec le renderer `drawBooks()`,
également utilisé au redessin global. Les LEDs BOOK sont copiées dans les deux
buffers sans swap de la surface musicale.

En PLAY, les huit pads Attributs sont DIM RED et les huit pads Transformations
DIM AMBER. En MOTIF_LIBRARY, le premier pad BOOK (note 68) est GREEN fixe,
les quinze autres sont DIM GREEN. Ces seize emplacements sont purement visuels :
le premier représente l'unique motif existant, sans sélection ni sauvegarde.
Le retour PLAY restaure immédiatement les réservations couleur.
Cette phase reste sans écran ni catalogue de motifs.
Les gestes SOLO/MUTE/COPY/DELETE en cours sont conservés pendant la bascule.
Le rendu commun `drawPersistentControls()` restaure COPY/DELETE au changement
de vue et au redessin global, avec les mêmes fonctions de rendu que leurs timers.
Il conserve leur phase de clignotement sans réarmer ni annuler les gestes.
Leur comportement reste celui des Voices existantes, sans copie entre motifs.
Les LEDs inactives restent OFF comme avant THE GATE ; COPY SOURCE clignote
YELLOW, TARGET reste YELLOW, DELETE armé clignote RED.

Validation automatique : 109 tests réussis, dont cinq tests THE GATE couvrant
la navigation, les gestes en cours, l’état musical et la poursuite polymétrique
5/7 avec Note Off en horloge interne et MIDI, ainsi que le rendu BOOK initial,
les deux bascules, les couleurs réservées et la navigation hors Launchpad.
Les tests vérifient aussi COPY et DELETE de Voice dans les deux vues, leurs LEDs
et timers à travers les bascules, SOLO/MUTE et le rendu DOM du Footer Zone 3.
Syntaxe JavaScript validée.

Validation Dan à effectuer : basculer pendant la lecture, vérifier SWITCH toujours
OFF, les seize pads BOOK GREEN / DIM GREEN, COPY/DELETE et le Footer Zone 3,
la restauration BOOK DIM RED / DIM AMBER,
le retour SWITCH éteint et la continuité musicale. Aucun commit ni push.
