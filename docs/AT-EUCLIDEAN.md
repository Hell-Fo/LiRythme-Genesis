# Euclidien — génération par instrument

Euclidien occupe le deuxième pad de la troisième rangée du Book A/T,
à droite de ROTATION. Il s'ouvre sur un Motif vide ou déjà programmé.
L'ouverture ne modifie aucun événement ; les réglages génèrent ensuite le rythme
de la Voice choisie, en conservant les autres Voices. Un Motif déjà créé avec
Euclidien peut être rouvert pour ajuster ses paramètres.
La transformation concerne MOTIF. La Voice sélectionnée reste allumée en jaune,
même si sa timeline est vide.

1. Choisir le Motif, puis ouvrir le Book A/T et le pad Euclidien.
2. Choisir un instrument, par exemple Kick.
3. Maintenir Shift et toucher un Step : son numéro donne la résolution
   de l'instrument, entre 1 et 32. Le Step choisi apparaît en rouge.
4. Toucher un Step sans Shift : son numéro donne le nombre de frappes,
   limité à la résolution. Le Step choisi apparaît en vert.
5. Choisir A pour polymétrique ou B pour polyrythmique.
   B clignote tant que la durée du Motif n’est pas définie.
6. Maintenir B et toucher un Step pour fixer la durée du Motif entier
   en pas d'horloge. Pendant B, cette limite est affichée en jaune.
   Une fois la durée définie, B reste allumé ; B + Step permet de la modifier.
7. Choisir un autre instrument pour créer son propre rythme.

Exemple : Shift + Step 16, puis Step 5 génère cinq frappes réparties
sur seize positions, avec une première frappe en position 1.
Les frappes générées sont affichées en vert atténué. Si résolution
et nombre de frappes occupent le même pad, celui-ci apparaît en jaune.
Un instrument encore non configuré est silencieux ; sa résolution initiale
est 32. Choisir sa résolution seule ne crée pas de frappes.

Chaque instrument conserve sa résolution, sa densité et son mode.
La durée réglée par B + Step est commune à tous les instruments du Motif.
Sans durée explicite, le calcul habituel du cycle global par PPCM s'applique.

- **A — Polymétrique** : une position correspond à un pas d'horloge.
  Chaque instrument boucle à sa propre résolution, jusqu'à la frontière
  du Motif, qui réinitialise tous les cycles.
- **B — Polyrythmique** : toutes les positions de l'instrument sont réparties
  dans la durée du Motif. Des frappes peuvent se produire entre les pas.
  Avec résolution 16 et B + Step 12, une position dure 12/16 de pas.

Un clic sur le pad Euclidien annule la transaction. Un maintien de 300 ms
sur ce même pad confirme les réglages, comme pour les autres A/T.
Les essais restent provisoires jusqu'à confirmation et ne sont pas enregistrés
par une sauvegarde déclenchée pendant l'édition.

En PLAY, les changements de rythme et de durée prennent effet à la prochaine
frontière du Motif. Le moteur conserve la géométrie engagée jusque-là.
Les horloges interne et MIDI, Audio et MIDI DRUM utilisent le même placement
des frappes. SWING et RATCHET s'appliquent à l'intérieur de chaque position
polyrythmique ; les messages d'horloge ne sont pas déplacés.

Les paramètres Euclidiens suivent les sauvegardes et COPY de Motif ou de Voice.
DELETE les efface avec la cible. DOUBLE duplique le cycle et met à jour
sa résolution et sa densité. Une édition manuelle des événements est conservée
jusqu'au prochain réglage de résolution ou de densité dans Euclidien,
qui régénère alors une répartition régulière.
