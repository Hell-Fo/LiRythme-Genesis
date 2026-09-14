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
