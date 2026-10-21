# FLAM - Motif et Modulation

FLAM occupe le troisième pad de la deuxième rangée du Book A/T (slot 6,
note Launchpad 86). Il est disponible dans les Timelines Motif et Modulation.

Les boutons A–H donnent respectivement **100, 75, 50, 35, 20, 10, 5 et 0 ms**.
Les sélections Voices et Steps suivent la gestuelle A/T habituelle ; sans
sélection, toutes les cellules du Motif courant sont ciblées.
Clic court pour annuler, maintien de 300 ms pour confirmer.

Pendant la lecture, seules les Voices audibles portant une valeur FLAM positive
et dont les frappes commencent au même instant participent. La première Voice
reste en place ; chaque suivante ajoute son écart, dans l'ordre des Voices.
Trois Voices à 20 ms jouent ainsi à 0, +20 et +40 ms. Une Voice seule, une cellule
absente ou une valeur 0 ne crée aucun décalage.

SWING est calculé avant de regrouper les frappes simultanées. FLAM décale toute
la série RATCHET de chaque Voice, en conservant ses intervalles et son GATE.
L'écart collectif est réduit si nécessaire pour conserver les frappes avant
la prochaine attaque locale ou la fin du Step, avec une marge de 2 ms
(réduite si l'espace restant est inférieur à 4 ms). Seules les Voices
effectivement retardées limitent l'étalement. La Clock et les Steps ne sont pas déplacés.

Correction du 21 octobre 2026 : la limite précédente réduisait l'étalement à
une demi-période RATCHET, même lorsque le Step disposait de davantage de place.
À 120 BPM, résolution 16, sans SWING ni RATCHET, deux Voices réglées à 100 ms
jouent maintenant à 0 et +100 ms. Trois Voices sont limitées à 0, +61,5 et
+123 ms pour rester dans le Step de 125 ms. Ces temps sont vérifiés dans le
dispatch logiciel ; ils ne constituent pas une mesure physique MIDI.

FLAM ne crée aucun événement dans Modulation. La préécoute manuelle reste sans
FLAM. STOP/PAUSE et le Step suivant annulent les déclenchements encore en attente ;
les Note Off suivent le mécanisme commun. Les valeurs explicites, dont 0,
sont conservées dans les sauvegardes et suivent COPY, DOUBLE, ROTATION et DELETE
comme les autres attributs explicites de Modulation.

Validation logicielle : dispatch MIDI, SWING/RATCHET à tempo rapide et horloge
MIDI, annulation STOP, sélection, annulation d'édition et sauvegarde/restauration.
L'écoute sur matériel reste à effectuer.

Dans Motif, FLAM ne s’applique qu’aux cellules contenant un événement.
Une cellule FLAM explicite de Modulation remplace la valeur du Motif ;
0 désactive la participation de cette Voice. Sans cellule de Modulation,
la valeur du Motif reste utilisée. Les anciennes valeurs de 0 à 20 ms
sont conservées à la restauration des sauvegardes.
