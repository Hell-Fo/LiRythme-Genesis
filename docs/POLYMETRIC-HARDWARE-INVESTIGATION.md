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

### Navigation par Book et feedback Step — STOP hardware

En STOP/PAUSE, les flèches du Book A/T parcourent les Steps, y compris en
CHAIN et CHAIN + FOCUS. MOTIFS conserve la navigation des occurrences en
CHAIN. Le chord FOCUS reste exclusif. Le bouclage des Steps utilise la durée
du motif A/T capturé si une transaction existe.

Après navigation Step, les Instruments présents sont GREEN fixes, les
absents inactifs. Les pulses précédents sont annulés et le preview ne réarme
pas de pulse LED. Les priorités A/T, performance et sélection Instrument
Focus sont conservées. La reprise PLAY retrouve les pulses de lecture.
Aucun changement aux transactions, au filtrage A/T ou à CHAIN NEXT.

Validation : 289/289 tests, syntaxe 47 fichiers JS/MJS/CJS,
git diff --check réussi. Matrice MOTIFS/A/T × NORMAL/CHAIN × STOP/PAUSE,
0/1/3 Instruments avec temporisation, chord exclusif, motif capturé et
priorité YELLOW A/T. Aucun commit/push. STOP hardware : validation Dan attendue.

### Régression hold Step — diagnostic et correction (STOP hardware)

Cause démontrée du hold inopérant : le routage exclusif FOCUS intercepte
PRESS/RELEASE puis retourne avant les anciens blocs PREVIOUS/NEXT. Ces
blocs faisaient un déplacement immédiat puis armaient un timeout d'une
durée Step et un interval de même durée, issu de getStepDurationMs().
Ce sont des timers UI, pas les ticks du clock musical. Le contournement
est déjà présent dans 0f67135, avant le dernier tweak non commité.
Le chemin intercepté n'armait aucun repeat et ne naviguait qu'au release.

STOP rejette les pulses MIDI entrants ; PAUSE ne fait pas avancer le
pipeline musical. Les événements de Step natif sont rejetés hors PLAY.
Aucune queue de ticks de navigation n'a été trouvée dans ce chemin.
En revanche navigate appelait onStepPreview, relié à triggerMotifStep,
qui émet des Note On et programme des Note Off. Le backend possède une
file pendingNotesMessages en attente de routage et des files MIDI worker ;
le worker dispose aussi d'un flush idle. La rafale hardware au PLAY n'a
pas été reproduite : son attribution à une de ces files reste non prouvée.

Correction : le handler actif gère maintenant les holds STEP par un seul
timeout UI renouvelé à getStepDurationMs(), sans boucle de rattrapage.
Le premier déplacement a lieu à la première échéance pour laisser le
chord simultané exclusif ; un short tap déplace au release. Chaque tick
rend immédiatement le Step et les Instruments. RELEASE annule le timer
sans déplacement supplémentaire. Chord, reset et entrée PLAY l'annulent
également. La navigation Step n'appelle plus le preview musical : aucun
Note On/Off ni action musicale à mettre en attente. Les previews explicites
hors de ce chemin restent disponibles. Aucun fichier clock/tempo/backend
MIDI n'est modifié ; CHAIN NEXT et les occurrences restent inchangés.

Validation : 306/306 tests, syntaxe 47 fichiers JS/MJS/CJS et git diff --check.
Matrice quatre contextes × STOP/PAUSE × deux directions : huit Steps pendant
le hold, feedback immédiat, arrêt au release, timer nul, aucune entrée dans
le callback preview, attente sans navigation différée, PLAY sans dispatch
supplémentaire puis exactement un dispatch au premier Step natif. Tests du
chord, reset, PLAY press et absence de repeat sur les occurrences.
Ces tests logiciels ne constituent pas une capture de la rafale physique.
Aucun commit/push. STOP hardware : revalidation Dan nécessaire.

### Sélection Instrument rapide en PLAY — diagnostic et correction

Dan confirme le correctif de navigation << / >> hardware OK.
Nouveau stress : 1 024 frappes sans attente, soit 2 048 messages PRESS/RELEASE.
Instrumentation de test : entrée pad, mutation, demande de rendu, drawMotif,
appel sendController, envoi midiManager.send et taille de la Map LED.

Cause logicielle démontrée : chaque sélection normale/Instrument Focus
redessinait 16 Instruments + 32 Steps + playhead + swap, soit 50 messages
contrôleur synchrones par frappe. Ce n'est pas un redraw complet des Books,
mais une surface trop large envoyée intégralement pour chaque état intermédiaire.
Le chemin Native MIDI transmet ces messages SEND_CONTROLLER au backend ;
aucune fusion des anciens états n'est alors possible depuis le renderer.
Le probe ne mesure pas les files internes IPC/driver ni la latence physique :
il démontre l'amplification à leur entrée, pas leur profondeur exacte.

Mesures avant/après (même rafale, temps simulé) :

| Mode | Mutations | Rendus avant → après | Envois LED avant → après | Pic file LED avant → après |
| --- | ---: | ---: | ---: | ---: |
| NORMAL | 1024 | 1024 → 1 | 51200 → 48 | 0 → 48 |
| Alternance 2 pads | 1024 | 1024 → 1 | 51200 → 48 | 0 → 48 |
| Instrument Focus | 1024 | 1024 → 1 | 51200 → 48 | 0 → 48 |
| A/T | 1024 | 1024 → 1 | 48 → 48 | 48 → 48 |
| CHAIN / CHAIN FOCUS | 1024 | 1024 → 1 | 51200 → 48 | 0 → 48 |

Avant, zéro dans la Map normale signifie envois immédiats au backend,
aucunement absence de backlog en aval. Après : zéro envoi synchrone pendant
les frappes, une demande de rendu courante, 48 couleurs au plus dans ce probe,
quatre envois par lot de 4 ms, convergence en 48 ms simulées, puis file vide.
Les 1 024 demandes de rendu sont fusionnées ; les 1 024 mutations sont toutes
exécutées. Le rendu normal génère 49 écritures candidates, sans swap, puis
48 envois après fusion du playhead. Une sélection suivante entre deux Voices
vides ne transmet que les deux pads Instruments modifiés.

Stratégie : réutilisation du mécanisme A/T existant, étendu aux sélections
normales et Instrument Focus. La demande différée lit l'état actuel, ne
capture aucune ancienne sélection, et remplace les couleurs par pad avant
chaque lot. Les rendus clock/pulse plus récents supplantent les couleurs en
attente. Aucun événement d'entrée musical n'est supprimé ; ni clock, ni
tempo, ni backend MIDI ne sont modifiés. Reset/reconnexion annulent le rendu.

Tests : six probes de 1 024 frappes, remplacement pendant drainage partiel,
convergence vers l'état final, différentiel de deux pads, reset ; 2 048
sélections supplémentaires entrelacées avec 32 Steps natifs et vérification
des Note On/Off immédiats, phase inchangée et absence de notes après drainage.
Suite complète 314/314, syntaxe 47 fichiers JS/MJS/CJS, git diff --check OK.
Ces mesures mock MIDI ne prouvent pas un jitter hardware nul.
Aucun commit/push. STOP hardware : validation Dan attendue.

### DELETE court/long CHAIN — STOP hardware

DELETE+BOOK en CHAIN sans FOCUS est maintenant résolu une seule fois :
PRESS capture l'intention, RELEASE avant 300 ms retire l'occurrence ciblée,
seuil atteint vide le Motif du Book et retire toutes ses occurrences.
Le seuil réutilise TEMPO_HOLD_DELAY_MS, déjà employé pour le hold Motif.
Un release après confirmation est consommé. Annuler DELETE ou reset annule
les intentions en attente. Le pad partagé cible l'occurrence sélectionnée
correspondante, sinon la dernière occurrence selon la règle historique.

FOCUS conserve explicitement sa sémantique locale, sans retrait d'occurrences.
PLAYING n'est pas rephasé : le cycle différé existant garde sa géométrie
jusqu'à la transition naturelle. NEXT, indices et LoopMaster sont actualisés
par la suppression structurelle existante ; supprimer le Motif LoopMaster
entraîne LOOP OFF. Aucun changement clock/tempo, CHAIN NEXT ou coalescence LED.

Validation : 324/324 tests, syntaxe 47 fichiers JS/MJS/CJS, git diff --check OK.
Tests [01][05][03][05][08] en STOP/PAUSE/PLAY, seuil 299/300 ms, release sans
seconde action, FOCUS court/long local, annulation, Chain entièrement supprimée,
PLAYING supprimé et non supprimé, indices VIEW/PLAYING et LoopMaster décalés.
Aucun commit/push. STOP hardware : validation Dan attendue.

### Préécoute par flèches puis rafale au PLAY — 28 septembre 2026

Daniel confirme que le symptôme suit l'utilisation des flèches. La préécoute
sonore a été rétablie à sa demande lors de l'harmonisation précédente ; elle
empruntait à nouveau les files ordinaires sans durée de validité ni annulation
à la reprise. Les ticks de navigation ne sont pas une file de clock.

Correction ciblée : les Note On de préécoute portent un numéro de génération
et une échéance de 50 ms (gate existante). Chaque transition de transport invalide
les préécoutes encore en attente dans le routage Utility et dans le worker.
Un ancien message reçu après cette invalidation est rejeté. Une préécoute périmée
est également rejetée avant routage ou émission ; elle ne peut plus être jouée
après l'échéance de son propre Note Off.

Les Note Off ne portent pas cette marque : aucun callback de gate n'est annulé,
aucun Note Off n'est retiré et leur priorité existante reste intacte. Les Note On
ordinaires du playback ne sont ni invalidés ni soumis à cette expiration.
La préécoute immédiate demeure disponible. Aucun changement du tempo, des ticks,
de la phase, du scheduler ou des règles de sélection/navigation.

Tests logiciels : 364 réussis. Régression sur les fonctions réelles du worker
avec file volontairement retardée, message ancien reçu après PLAY, gate déjà
émise, expiration en STOP ; routage en attente de destination ; propagation de
la marque depuis le dispatch de navigation jusqu'à MidiManager et Note Off
sans marque. Suite existante complète réussie.

Ce scénario retardé démontre le risque logiciel et sa protection ; il ne constitue
pas une capture de la rafale physique. Validation Launchpad encore nécessaire,
source de clock hardware non précisée. Aucun commit/push, hardware non sollicité.

### Précision hardware : INTERNAL, flèches silencieuses en STOP

Daniel indique que la rafale persiste en INTERNAL et que les préécoutes des
flèches ne sont pas audibles en STOP. Le correctif de péremption précédent ne
peut donc pas être considéré comme une résolution hardware validée.

Ajout d'un test du fichier worker complet en VM, avec temps et sortie MIDI
simulés : clock INTERNAL active, transport STOP, deux préécoutes et leurs gates,
puis START. Les quatre messages de notes sont émis avant START ; aucun Step
musical n'est généré avant PLAY. Ce résultat ne reproduit pas le blocage réel.
365 tests passent, syntaxe du test et diff --check OK.

Pas de nouveau correctif de production conjectural. À préciser : destination
des notes et redémarrage complet de LiRythme après modification des fichiers
Utility/Worker. Un rechargement du renderer seul ne recrée pas le worker.
Aucun accès hardware, aucun commit/push.

### Validation de la préécoute et préparation Field Build #2

Daniel confirme que la rafale apparaît en redémarrant Bespoke seul, LiRythme
restant en STOP. La pause de Bespoke suspend son moteur audio ; conserver
Bespoke en PLAY permet la préécoute immédiate. Daniel valide ensuite les sons
par flèches en STOP directement sur le DrumBrute (« sans failles »).
La protection de péremption des préécoutes ne peut pas retirer les notes déjà
reçues par une application externe dont le moteur audio est suspendu.

Le 28 septembre, Daniel autorise explicitement le commit puis la compilation
de cette version pour son setup hardware. Aucun push demandé. Field Build #2
conserve la première distribution et identifie son commit dans le manifeste.
