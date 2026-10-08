# Mutation — variations de Motif

Le bouton 6 ouvre une transaction Mutation sur le Motif courant, en PLAY,
STOP ou PAUSE, depuis le Livre Motif ou A/T. Il clignote RED / DIM RED.
A–H sont DIM AMBER ; le réglage sélectionné devient RED. La page PLAY affiche
le nom des méthodes et le numéro du motif capturé.
Le Book affiché à l'entrée reste inchangé : le Livre Motif/Chain conserve ses
couleurs et ses indicateurs, sans basculer vers le Livre A/T.

Un clic court sur le bouton 6 annule ; un appui de 300 ms confirme, comme A/T.
L'appui qui ouvre la transaction capture immédiatement la cible et ne peut
pas la confirmer involontairement. Les répétitions de pression sont consommées.
Les sélections de Voices, Steps et du Book ne changent pas la cible pendant
Mutation. La transaction porte sur le Motif complet.

## A–H : méthodes, pas intensités

| Réglage | Méthode | Première version |
| --- | --- | --- |
| A | Combinaison | Permutation, syncope, puis densification |
| B | Euclidien | Répartition régulière des frappes dans chaque cycle |
| C | Densification | Copie de frappes vers le Step suivant libre, budget maximal de la moitié du nombre initial, arrondi au supérieur |
| D | Allègement | Retrait d'une frappe secondaire sur deux |
| E | Redistribution | Transfert d'une frappe secondaire par Voice vers la Voice utilisée suivante, si la destination est libre |
| F | Permutation | Échange de deux fragments de même taille après le premier Step ; reste impair conservé |
| G | Syncope | Déplacement d'appuis secondaires vers le contretemps suivant libre |
| H | Déplacement | Déplacement d'une partie des frappes secondaires d'un Step, vers l'avant ou l'arrière |

Le repère protégé est la frappe la plus forte de chaque Voice ; en cas
d'égalité, la première. Il s'agit d'une heuristique à affiner par les tests
musicaux. Pour G, les appuis sont les Steps impairs affichés (indices pairs),
dans le cycle de chaque Voice. Aucune grille 4/4 n'est imposée aux longueurs.

Chaque essai repart de la source capturée à l'entrée. Le même réglage redonne
la même proposition. Les Voices disponibles, leurs longueurs et la durée du
Motif restent inchangées. Les attributs et leur destination suivent la frappe.
E conserve le nombre total d'événements ; B, F, G et H conservent aussi leur
nombre par Voice. C et A peuvent ajouter des frappes ; D en retire.

Un motif vide reste vide. Une Voice unique ne peut pas être redistribuée vers
une nouvelle Voice. Une grille pleine, une longueur de 1 ou des collisions
peuvent donner un réglage sans changement. Aucun allongement ou écrasement
d'événement n'est utilisé pour forcer une variation.

L'édition reste bornée par le cycle propre de chaque Voice et la fin explicite
du Motif lorsqu'elle est plus courte. Les données au-delà restent intactes.
Une longueur implicite conserve sa sémantique actuelle, sans devenir explicite.

## Chain et temporalité

En Chain, le FOCUS existant correspond à la sélection figée évoquée sous le
nom FREEZE : choisir VIEW, puis entrer dans Mutation. Sans FOCUS, le motif
PLAYING au moment de l'appui devient la cible. Les passages suivants de la
Chain ne la changent pas. Toutes les occurrences du même motif utilisent la
banque commune, comme les éditions de Motif existantes.

La variante est visible immédiatement. En PLAY, son audition commence à la
prochaine entrée du Motif ciblé. Le cycle engagé garde ses événements et ses
phases locales jusqu'à la frontière globale. Si la cible est VIEW, l'édition
sera entendue lorsqu'elle sera jouée. La Chain n'est pas arrêtée pour la tester.

CANCEL restaure la source dans l'éditeur immédiatement et suit la même règle
de prochaine entrée pour l'audition. COMMIT n'avance aucune frontière. Les
notes et trains RATCHET déjà programmés gardent leurs paramètres et Note Off.
En STOP/PAUSE, les flèches permettent la préécoute des Steps du motif capturé.

L'autosauvegarde conserve la source tant que la transaction n'est pas confirmée.
Après confirmation, la variante est un Motif ordinaire, compatible avec les
sauvegardes existantes. Aucun calcul de mutation ne s'exécute dans la clock.

Mutation concerne ici les événements de MOTIF. MODULATION reste exclusivement
A/T. Groove Morph et son geste BAKE ne font pas partie de cette implémentation.

## Validation hardware

Validation automatisée : 559 tests réussis, dont 28 dédiés à Mutation ; syntaxe
vérifiée sur 57 fichiers et `git diff --check` réussi. Aucun lancement de
l'application, accès matériel, commit, push ou build pendant cette étape.

1. STOP : bouton 6, essayer A–H, vérifier les noms sur PLAY et préécouter avec
   les flèches. Revenir à un réglage doit retrouver le même phrasé.
2. Clic court : retrouver l'original. Appui long : garder la variante. Relâcher
   ne doit ni annuler ni ouvrir une nouvelle transaction.
3. PLAY : tester des Voices de longueurs différentes. Le cycle en cours doit
   finir sans rafale ni rephase ; la variante entre à la frontière du Motif.
4. Chain : ouvrir pendant un passage, attendre le suivant, puis régler.
   Vérifier que seule la cible capturée est éditée. Refaire avec FOCUS / VIEW.
5. Annuler avant puis après audition ; vérifier la restitution à la frontière.
6. Tester COLOR, SWING, RATCHET et vélocités sur les frappes déplacées, puis
   sauvegarder/recharger après confirmation.
