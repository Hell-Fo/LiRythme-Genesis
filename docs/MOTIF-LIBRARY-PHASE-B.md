# Bibliothèque Motif — Phase B : NEXT

Départ : `86c190c`. Le correctif MIDI `2086927` reste inchangé.

`playingMotifId` identifie l'entrée utilisée pour lecture et édition.
`currentMotifId` reste une projection compatible vers cet identifiant.
`nextMotifId` est null ou un unique index 0–15. Aucun VIEW indépendant,
FREEZE, CHAIN ou format de persistance n'est ajouté.

En PLAY, `requestMotif(id)` arme NEXT sans changer la matrice active, la position,
les longueurs, le Footer ou la cible d'édition. La dernière demande remplace
la précédente ; demander PLAYING annule NEXT sans restart. Les restrictions
de sélection pendant les gestes COPY/DELETE/SOLO/MUTE Hold restent existantes.

`nextStep()` avance d'abord le cycle existant. Si cette avance atteint le wrap
global et NEXT est armé, PLAYING change avant le dispatch du même tick : le
nouveau motif émet son step 0. Aucun appel de transport, reset d'horloge ou tick
supplémentaire. Les wraps de Voices n'activent pas NEXT. Une transition de
longueur live utilise la frontière portée par `liveLengthCycle`, comme avant.

La notification de changement visible est traitée après le handler musical
du tick, afin de ne pas placer le redessin complet avant ses Note On.
Footer Zone 1, timeline et édition suivent alors le nouveau PLAYING. Les
Note Off déjà programmés restent sous la responsabilité de leurs callbacks.

STOP, PAUSE et START explicite annulent NEXT. STOP/PAUSE conservent la sélection
immédiate Phase A, avec step 0 lors d'un changement réel ; recliquer le motif
courant reste sans effet. CONTINUE après PAUSE ne restaure aucun ancien NEXT.

En Bibliothèque : PLAYING GREEN fixe, NEXT alternance DIM GREEN/OFF toutes
les 160 ms, autres slots DIM GREEN. Un seul timer visuel ; remplacement,
annulation et transition retirent l'ancien blink. Quitter la Bibliothèque
suspend le timer sans annuler NEXT ; revenir rétablit son feedback. SWITCH
reste OFF. Le blink n'intervient jamais dans les compteurs musicaux.

Validation automatique : 119 tests, dont remplacement/annulation de NEXT,
blink et navigation, STOP/PAUSE, frontière de géométrie live, Footer et
dispatch sur 2245 ticks avec 4/7/5/32 en INTERNAL et MIDI. Vérification du
step 0 unique, des Note Off et de l'absence de mutations des motifs.

Phase B NEXT validée sur hardware par Dan avant commit.
