# GENESIS — Bibliothèque Motif — Phase A

Départ : `e322070` (THE GATE). Mémoire de session uniquement.

## Données

`state.motifs` contient 16 objets indépendants. Chaque entrée possède `events`
(16 Voices × 32 steps), `voiceLengths` (16 longueurs explicites ou null) et
`motifLength` (longueur explicite ou null). Tous commencent vides, avec les
longueurs libres existantes ; Motif 01 est courant au démarrage.

`currentMotifId` est un index interne 0–15, affiché 01–16. `getMotif(id)` donne
accès à une entrée précise. Les propriétés historiques `motif`, `voiceLengths`
et `motifLength` sont des projections vers l'entrée courante, sans copie de travail
ni sauvegarde implicite lors de la sélection. Les modifications de lignes et
les remplacements par COPY écrivent donc dans la bonne entrée.

Tempo, division rythmique de l'horloge, transport, timeline sélectionnée,
configuration des pads, sélection de Voice, Focus, SOLO/MUTE restent globaux.
`liveLengthCycle` et la tête de lecture sont des états d'exécution transitoires,
pas des données à mémoriser dans les motifs.

La banque et l'accès explicite par identifiant permettent une future séparation
lecture/édition. Cette phase lie encore les projections au motif courant ; les
futurs playing/view devront être routés aux points de lecture/édition concernés.
Aucun `nextMotifId`, FREEZE ou CHAIN de bibliothèque n'est implémenté.

## Navigation et rendu

En MOTIF_LIBRARY, les pads BOOK sélectionnent les motifs en STOP/PAUSE.
Un changement réel remet la tête au step 0 et efface la transition de longueur
transitoire, sans changer le statut du transport, la révision d'horloge ou les
Note Off programmés. Recliquer le motif courant ne fait rien. Pendant PLAY,
la sélection est refusée sans mutation ni mise en attente.

Pendant un geste COPY, DELETE ou SOLO/MUTE Hold en cours, les pads BOOK
n'effectuent pas de sélection : finir ou annuler le geste avant de changer de
motif. Aucun COPY/DELETE entre motifs n'est ajouté.

La notification de sélection rafraîchit la timeline, INSTRUMENTS, BOOK et les
projections DOM existantes. Le courant est GREEN, les autres DIM GREEN ; SWITCH
reste OFF. Footer Zone 1 affiche MOTIF 01–16, les autres zones gardent leurs
sources. Les titres MOTIF et SELECTED suivent aussi l'identité courante.
Retour PLAY : même motif, réservations BOOK DIM RED / DIM AMBER restaurées.

## Validation

116 tests : indépendance des 16 entrées et de leurs géométries, programmation
aller-retour par MIDI, STOP/PAUSE, refus PLAY, couleurs, Footer, préservation des
états globaux et Note Off après sélection en PAUSE, reprise polymétrique 5/7
en horloge interne et MIDI, comparaison avant/après Phase A sur 4480 ticks
avec les périodes 4/7/5/32. Suite existante conservée, y compris le test du
correctif MIDI indépendant `2086927`. Syntaxe et diff check validés.

Pas de format fichier ni persistance disque. Banque de 16 motifs validée sur
hardware par Dan avant commit. Capture temporaire d'investigation retirée.
