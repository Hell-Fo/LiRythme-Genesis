# CYCLE — jouer une fois sur n passages

CYCLE occupe le deuxième pad de la deuxième rangée du Book A/T.
La gestuelle est celle des autres attributs : ouvrir CYCLE, choisir les Voices
et/ou Steps, puis une valeur A–H. Un clic court sur CYCLE annule ; un appui long
confirme.

| Bouton | A | B | C | D | E | F | G | H |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Jouer une fois sur | 8 | 7 | 6 | 5 | 4 | 3 | 2 | 1 |

Le premier passage joue toujours. Avec F = 1 sur 3, les passages 1, 4, 7… jouent.
H = 1 joue à chaque passage.

- Sans sélection : régler le Motif, selon les passages complets de ce Motif.
- Voices sélectionnées : régler leurs boucles locales.
- Steps sélectionnés : régler ces Steps dans les boucles locales des Voices.
  Sans sélection de Voice, les Steps sont ciblés dans toutes les Voices.

La priorité est **STEP > VOICE > MOTIF** : les conditions ne se cumulent pas.
Les trois niveaux restent indépendants ; modifier le Motif ne supprime pas les
exceptions de Voice ou de Step. Une valeur explicite de 1 force donc la lecture
de cette cible à chaque passage. Les réglages s'appliquent aussi aux événements
ajoutés ensuite.

STOP remet tous les compteurs à zéro ; PAUSE les conserve. START redémarre aussi
au premier passage. Chaque Motif garde ses propres compteurs pendant la Chain,
y compris quand il apparaît plusieurs fois. Les Voices polymétriques comptent
leurs boucles locales ; les Voices polyrythmiques comptent les passages complets
du Motif. Les boucles locales incomplètes se terminent à la frontière du Motif.
Le mute ne suspend pas le décompte.

CYCLE filtre le départ de l'événement, pour MIDI DRUM, MIDI CC, Audio et Key Group.
Un événement autorisé conserve tout son RATCHET ; les notes et Note Off déjà
programmés terminent normalement. La préécoute manuelle des Steps reste audible
indépendamment de CYCLE et ne fait pas avancer ses compteurs.

Dans MODULATION, un CYCLE explicite remplace celui du Motif et suit les compteurs
de la timeline MODULATION. Sans CYCLE explicite, le réglage du Motif reste actif.

Les réglages sont sauvegardés dans la banque et les projets ; les compteurs de
lecture restent temporaires. COPY, DOUBLE et ROTATION conservent les réglages
appropriés ; les exceptions de Step suivent les événements déplacés. RESET A/T
efface CYCLE avec les autres attributs.
