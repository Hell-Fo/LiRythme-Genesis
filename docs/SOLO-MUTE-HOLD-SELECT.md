# SOLO + MUTE — Hold → Select → Release

Chaque fonction possède son Set mémorisé et son booléen actif dans le moteur.
Pendant le maintien, les instruments basculent dans une sélection de travail :
YELLOW pour les membres, DIM GREEN pour les autres. Les pulses de notes sont
suspendus sur ces boutons pendant la sélection. La timeline reste inchangée.
Au relâchement, une sélection éditée non vide active la fonction ; une sélection
vide reste inactive. Sans édition, le clic bascule actif/inactif avec mémoire.
Si les deux boutons sont maintenus, les Voices éditent le dernier bouton maintenu.

SOLO actif autorise ses membres ; MUTE actif interdit ses membres. MUTE gagne
sur leur intersection. Le dispatch seul est filtré : notes du Motif, longueurs,
configuration, transport, phases et playheads restent intacts. Les notes déjà
émises terminent leur gate existant de 50 ms avec les Note Off capturés.

Boutons actifs : blink normal/OFF à 160 ms, SOLO AMBER et MUTE YELLOW. Inactifs :
couleur normale fixe. Timers indépendants et écriture dans les deux buffers.
DELETE → SOLO/MUTE efface uniquement la mémoire concernée et désactive la fonction,
puis désarme DELETE. Le relâchement de la cible est consommé par DELETE existant.
L'ancien geste SHIFT+SOLO de filtre visuel est remplacé par ce modèle commun.
COPY et les transitions polymétriques ne sont pas modifiés.

Validation : 100/100 tests, dont les 98 précédents. Couverture maintien/multi-toggle,
mémoire/A-B, vide, DELETE, indépendance, composition, feedback, dispatch réel,
Note Off et phases Leader/Follower. Syntaxe JS/MJS et git diff --check.

Hardware à vérifier : sélectionner plusieurs Voices, relâcher, A/B, éditer à nouveau,
combiner SOLO/MUTE, DELETE de chaque mémoire pendant PLAY en Leader/Follower ;
contrôler couleurs, phases et absence de notes bloquées.
Aucun commit. STOP pour validation hardware.
