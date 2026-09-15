# GENESIS — CHAIN Phase A — stabilisation hardware R1–R5

## Gestes validés

SHIFT+PLAY bascule CHAIN sans action transport. La liste reste en mémoire lors
de la sortie du mode. Chaque maillon référence un des 16 Motifs, sans copie.
La Timeline suit PLAYING ; aucun nouveau FOCUS ni VIEW indépendant n'est ajouté.

Dans la vue Bibliothèque, en CHAIN :

- BOOK court : aucun append, aucune sélection ni modification de Timeline.
- BOOK maintenu 300 ms : append d'une occurrence en fin de liste, une seule fois.
  Aucun append au relâchement. L'ancien geste d'insertion après PLAYING est retiré.
- DELETE puis BOOK X : retire la dernière occurrence de X, sans modifier sa banque.
- DELETE puis NEXT : retire l'occurrence immédiatement suivante, avec wrap.
- DELETE puis PLAY : vide la structure. En PLAY, le Motif courant finit son cycle
  puis boucle seul, sans STOP ni reset CLOCK et sans couper les Note Off.
- DELETE puis INSTRUMENT : efface uniquement les événements de cette Voice,
  conserve les longueurs et les autres Voices, rafraîchit la Timeline et autosave.
- COPY puis INSTRUMENT source puis destination : copie Voice et longueur selon
  les règles historiques. Les tableaux restent indépendants ; la chaîne ne change pas.
- COPY puis BOOK source puis destination : copie Bibliothèque Phase C, protections
  COPY de PLAYING/NEXT et feedback conservés. Un mauvais type de destination ne
  consomme pas la source COPY : Voice vers BOOK et BOOK vers Voice sont refusés.

Hors CHAIN, DELETE puis BOOK CURRENT est autorisé, même pendant PLAY : événements
vidés, longueurs par défaut, même slot courant, Timeline rafraîchie et BOOK GREEN.
La suppression passe par l'autosave C.1. Un NEXT différent reste protégé.
DELETE+PLAY et DELETE/COPY Voice gardent leur comportement historique.

## Lecture et mutations

La chaîne non vide boucle. Un START explicite ou PLAY depuis STOP commence au
premier maillon, step 0. L'entrée CHAIN pendant PLAY termine le cycle courant
avant d'engager le premier maillon. PAUSE/CONTINUE garde l'occurrence et la position.
STOP conserve la liste ; le prochain PLAY repart de sa tête.

Chaque transition utilise la frontière naturelle NEXT : longueur Motif explicite,
sinon PPCM des longueurs de voix explicites, sinon 32. Chaque occurrence commence
au step 0, même entre deux IDs identiques. Pas de reset CLOCK aux frontières.
Les données sont lues dans la Bibliothèque aux lectures futures ; le gel avancé
de géométrie pendant une occurrence n'est pas implémenté.

Les mutations recalculent NEXT. Une suppression avant PLAYING ajuste son index.
Supprimer PLAYING laisse finir son cycle et conserve la place de son successeur,
sans marquer faussement une autre occurrence PLAYING. Sans occurrence engagée,
DELETE+NEXT retire la tête. Une chaîne vide laisse le Motif courant boucler seul.

## Affichage PLAY — R4

La chaîne affiche une suite compacte de texte monospace : [01][05][05][03].
Aucune carte, bordure, largeur de case imposée ou espace ajouté entre maillons.
L'ordre et les doublons restent visibles. Aucun texte PLAYING/NEXT, aucun style
NEXT. Seule la couleur du texte PLAYING change selon l'index d'occurrence ;
le texte et la géométrie restent fixes, y compris entre deux IDs identiques.
En PAUSE, PLAYING reste identifié ; en STOP ou hors CHAIN, aucun maillon n'est
marqué PLAYING. Une chaîne vide n'affiche rien. Aucun éditeur interactif ajouté.

## LED Launchpad — conventions inchangées pendant R1–R5

BOOK : EMPTY=OFF, DATA=DIM GREEN, PLAYING=GREEN. NEXT différent alterne
DIM GREEN/GREEN. Seul un successeur immédiatement identique fait alterner le pad
courant DIM GREEN/DIM AMBER. À la frontière identique : YELLOW ponctuel de 120 ms,
puis reprise du feedback approprié. Les autres membres ne clignotent pas du seul
fait de leur présence dans la liste. Le wrap est une adjacence réelle : dans
[1][5][1], le dernier 1 est immédiatement suivi du premier 1.
COPY conserve ses priorités. Hors CHAIN, BOOK et NEXT historiques sont conservés.

PLAY : pulsation YELLOW avec retour atténué ; flash RED de 80 ms à chaque entrée
d'occurrence, doublons et wrap inclus. RED prime temporairement sur YELLOW.
Les timers LED restent indépendants du timing musical.

## Persistance et limites

Chaîne, activation et curseur restent en mémoire uniquement. Quitter l'application
perd la chaîne ; sortir du mode ne la perd pas. La banque des 16 Motifs continue
à utiliser C.1 version 1 et son autosave, sans migration ni changement de format.
Pas de FREEZE, Timeline concaténée, insertion locale hardware ou nouveau FOCUS.
SHIFT+SOLO Focus historique et navigation STOP restent conservés.

## Validation

146 tests passent. Tests de reproduction ajoutés avant correction pour R1–R5 ;
R3 était déjà fonctionnel et est désormais verrouillé par la matrice croisée.
Les attentes anciennes contradictoires (refus DELETE CURRENT, clic append,
insertion hardware, textes PLAYING/NEXT) sont adaptées à cette stabilisation.
Test de sauvegarde réelle via le bridge simulé pour DELETE BOOK CURRENT ; tests
COPY/DELETE Voice et BOOK dans les trois états, avec CHAIN actif ou inactif.
Les tests LED, polymétrie, Leader/Follower, Note Off, CLOCK, worker, NEXT,
SOLO/MUTE, SHIFT+SOLO, COPY et persistance restent dans la suite complète.
Syntaxe JS/MJS et git diff --check vérifiés.

**CHAIN Phase A validée hardware/UI par Dan après stabilisation R1–R5.**
L'affichage final en texte compact est également validé. Aucun FOCUS anticipé.
Commit de clôture autorisé : `feat(chain): add motif chain playback and structural editing`.
Aucun push ; arrêt après commit.

Parcours de validation : matrice R1–R5, DELETE CURRENT BOOK, COPY/DELETE Voice avec et sans
CHAIN, DELETE structurels, clic BOOK neutre et hold append unique. Observer la
phrase [01][05][05][05][03][05][05] immobile à l'écran pendant plusieurs tours.
Vérifier à l'écoute et sur Launchpad les conventions LED déjà validées, CLOCK
et Note Off. FOCUS reste hors du périmètre de cette Phase A.
