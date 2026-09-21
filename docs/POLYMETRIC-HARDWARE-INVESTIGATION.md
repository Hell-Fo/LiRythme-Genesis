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
