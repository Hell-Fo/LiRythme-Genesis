# Groove Morph

Groove Morph transforme un bloc vide en recette de transition entre les motifs
qui l'entourent dans la chaîne. Les motifs sources restent intacts. Le bloc garde
sa durée habituelle : 32 steps par défaut, réglable avec Shift + un step de la
timeline du motif.

## Gestes

- Book Motifs : Shift + Mutation, choisir un bloc vide, puis A–H.
- Chaîne : cibler un bloc vide à son passage en PLAY, ou le sélectionner avec
  << / >> en STOP, puis Shift + Mutation et A–H.
- Appui long (300 ms) sur Mutation : confirmer. Clic court : annuler.
- Shift + Mutation sur un bloc Groove Morph existant : rouvrir les réglages.

La cible reste figée pendant le réglage. Un motif ordinaire non vide ne peut
pas être converti. Dans le Book, il reste possible de choisir un bloc vide
après avoir ouvert Groove Morph depuis un motif non vide.

| Niveau | Méthode dominante |
| --- | --- |
| A | Liaison douce, accents et transfert progressif |
| B | Déplacement de frappes secondaires |
| C | Syncope |
| D | Allègement |
| E | Redistribution entre instruments utilisés |
| F | Répartition euclidienne et permutation |
| G | Densification et ratchets de fin |
| H | Combinaison et fill |

Les événements communs et les extrémités du motif sont protégés. Les attributs
et leurs destinations suivent les frappes transformées. Une variation d'accent
garantit une différence audible lorsqu'une transition contient des notes,
y compris entre deux sources identiques. Deux sources entièrement silencieuses
restent silencieuses.

## Occurrences et lecture

Dans le Book Motifs, un bloc Groove Morph cycle vert → ambre → rouge toutes
les 400 ms. Les couleurs sont DIM au repos et pleines pour le bloc sélectionné,
en lecture ou ciblé par le réglage. Les retours temporaires COPY gardent leur
priorité. Le cycle s'arrête lorsque le Book n'est plus affiché.
Sur la page PLAY, la chaîne affiche `[GM]` à la place du numéro du bloc,
avec la même typographie et les mêmes indicateurs d'occurrence : `[01] [GM] [05]`.

Le bloc sauvegarde sa recette, pas une copie des sources. Chaque occurrence
résout ses voisins dans la chaîne et produit un résultat déterministe. Les
blocs Groove Morph consécutifs recherchent les motifs ordinaires environnants.
Les frontières tiennent compte du point de boucle. Hors chaîne, un bloc Groove
Morph reste vide puisqu'il n'a pas de contexte.

Le résultat reste stable pendant un passage. Les modifications des voisins,
de la recette ou de sa durée prennent effet à l'entrée suivante. Revenir au
même contexte et aux mêmes réglages redonne le même résultat, même après une
restauration de la banque. Les recettes provisoires ne sont pas autosauvegardées.

## Validation musicale à effectuer

Les tests automatisés vérifient les gestes MIDI, l'annulation, la sauvegarde,
les variations déterministes et les contextes d'occurrence. Une écoute sur
le matériel reste nécessaire pour ajuster l'intensité A–H et la résolution des
fills, notamment avec des cycles de voix différents.
