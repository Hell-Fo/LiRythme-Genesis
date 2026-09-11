# Investigation Leader : longueurs pendant PLAY

## Cause exacte dans le code

`setTargetLength()` remettait systématiquement `playheadPosition` à zéro à chaque
édition effective. Le prochain Native Step avançait depuis zéro, alors que
l'horloge du Leader poursuivait sa phase : aucune transition transport, révision
ou synchronisation de l'horloge n'accompagnait ce repositionnement du motif.
Exemple : édition à l'index 5, prochain index joué 1 au lieu de 6.
Ce défaut ne nécessite aucune perte de Native Steps. Il est compatible avec
169 reçus / 169 acceptés / aucun rejet, perte ou désordre. La disparition de
l'offset entendu reste à confirmer sur hardware.

## Correction

- Leader (INTERNAL), Voice : terminer le cycle local avec sa longueur active,
  puis adopter la dernière valeur demandée. Un retrait signifie 32. Les autres
  Voices conservent leur phase.
- Leader, Motif : terminer le cycle global avec sa durée active, puis appliquer
  la nouvelle durée. Cela inclut le PPCM modifié par les longueurs de Voices et
  le retour au PPCM après retrait d'une durée explicite.
- Le reset global garde sa priorité historique sur les cycles locaux incomplets.
  Toutes les Voices adoptent alors les valeurs demandées et repartent à zéro.
  Une Voice peut adopter sa longueur avant le changement du PPCM global.
- Les valeurs éditées et leurs marqueurs s'affichent immédiatement ; le moteur
  conserve temporairement les longueurs et phases actives. Un grand PPCM peut
  imposer une longue attente avant le changement global, sans plafond artificiel.
- Les éditions successives remplacent la demande sans repousser la frontière.
  PAUSE/CONTINUE conserve la transition ; START/STOP l'efface avec reset explicite.
  Hors PLAY, le reset immédiat reste inchangé.
- FOLLOWER (MIDI) conserve le reset de motif immédiat et son compteur de pulses.
  Aucun message MIDI artificiel, modification du scheduler ou reset d'horloge.
- Les Note Off existants conservent leurs sortie/channel/note capturés.

## Tests et validation

`npm.cmd test` : 88/88 tests réussis. Couverture ciblée : création, déplacement,
retrait, raccourcissement et extension Voice/Motif, PPCM, phases locales/globales,
Native Steps acceptés et révision inchangée, éditions successives/idempotence,
PAUSE/CONTINUE/START/STOP, pulses Follower, dispatch réel des Note On et Note Off
après éditions et transitions transport. Tests logiciels sans appareil MIDI.

Hardware à valider : en Leader, éditer une Voice au milieu de son cycle (7 vers 3,
extension et retrait), puis créer/déplacer/retirer la fin globale Motif.
Contrôler la fin du cycle courant, le cycle suivant, les Voices non éditées,
la phase avec l'appareil externe et l'absence de notes bloquées. Refaire en
Follower ; tester PAUSE/CONTINUE avec édition en attente et STOP/START.
Relever à nouveau le diagnostic Native Step.

Aucun nouveau blink PLAY ni commit. STOP pour validation hardware.
