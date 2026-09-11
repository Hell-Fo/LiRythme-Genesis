# COPY — Action → Source → Target

Sur MOTIF : COPY arme l'attente de source (YELLOW/OFF, 160 ms). Un instrument
capture un instantané de ses 32 événements et de sa longueur explicite, null
compris. COPY devient YELLOW fixe : attente de destination. Un instrument cible
reçoit ces événements et cette géométrie ; succès désarme COPY (OFF).
Un deuxième COPY annule à toute étape. Les boutons maintenus et leurs releases
sont consommés. Une cible invalide conserve l'étape et ne déclenche aucune autre
action, notamment PLAY. Copier vers soi est autorisé et termine l'opération.

La destination conserve intégralement sa Pad Configuration et son identité
(NAME/TYPE/output/channel/note). La sélection ne change pas. Les cellules sont
indépendantes : la source est un instantané, pas une référence à la matrice.

Pendant PLAY, les événements sont remplacés immédiatement sans émission de note
immédiate. La longueur utilise `setTargetLength` et sa transition différée existante,
en INTERNAL et MIDI : fin du cycle local puis adoption ; durée globale actuelle
conservée jusqu'à sa frontière, reset global prioritaire. Aucun compteur parallèle.
L'API accepte désormais une cible explicite sans changer la sélection. Les gestes
SHIFT+STEP et leur politique Leader/Follower ne changent pas. Hors PLAY, la politique
de longueur existante reste appliquée (reset si longueur modifiée).
Les Note Off déjà programmés terminent leurs gates habituels de 50 ms : aucune
annulation, nouvel All Notes Off ou modification de l'identité des notes actives.

`captureMusicalCopy` distingue VOICE et MOTIF. Le format MOTIF contient événements,
longueurs explicites des Voices et durée explicite, sans identité matérielle.
Aucune destination Motif, aucun collage Motif ni bibliothèque ne sont exposés.
SHIFT+COPY profond est réservé et ne démarre aucune copie. Pas de MODULATION,
Attributes, Transformations, Chain, SOLO ou MUTE.

COPY et DELETE s'excluent : armer l'une annule l'autre. Le nettoyage contrôleur
annule timers et source. Les LEDs COPY seules sont écrites dans les deux buffers,
sans changement aux couleurs MOTIF/MODULATION ni au pulse PLAY.

Validation logicielle : 98/98 tests ; syntaxe JS/MJS et git diff --check.
Couverture : étapes/feedback/annulations, invalides, SHIFT réservé, exclusion DELETE,
copie des 32 événements, longueurs 7/null/32, identité et source conservées,
instantané indépendant, format Motif sans destination, phases live Leader/Follower,
Note Off existants. Les 94 tests précédents passent.

Hardware : tester COPY/annulation avant et après source, copier 7 vers une autre
Voice puis une Voice libre, vérifier identité MIDI et phase pendant PLAY en Leader
et Follower, tester cible PLAY invalide et alternance DELETE/COPY.
Aucun commit. STOP pour validation hardware.
