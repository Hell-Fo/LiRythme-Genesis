# DELETE — Action → Target

DELETE est un mode temporaire du contrôleur Launchpad, disponible sur MOTIF.
Un appui arme l'action ; un deuxième appui l'annule. Les releases et répétitions
d'un bouton maintenu ne sont pas de nouveaux appuis.

- DELETE → instrument : efface les 32 cellules de cette Voice, même hors longueur.
- DELETE → PLAY : efface les cellules des 16 Voices du Motif courant.
- Une cible valide désarme immédiatement, même si son contenu était déjà vide.
- Une cible invalide ne fait rien et conserve l'armement. Son geste est consommé.
- La sélection de Voice reste inchangée. PLAY ciblé ne déclenche ni pause ni
  long press transport ; son relâchement est consommé après le désarmement.
- DELETE n'est pas armé dans MODULATION. Aucun effacement MODULATION ajouté.

`LiRythmeActions.clearMotifEvents()` ne modifie que les booléens de la matrice.
Pad Configuration, nom/type/MIDI, longueurs Voice, durée Motif, phases actives
et différées, sélection, tempo et transport sont conservés. La suppression est
possible en PLAY comme à l'arrêt. Aucun appel au reset polymétrique ou à la clock.

Les notes déjà émises terminent leur gate existant : le Note Off à 50 ms conserve
sa sortie, son canal et sa note capturés. Effacer la matrice n'annule pas ces
callbacks ; les prochains steps ne produisent plus les événements effacés.
Aucun All Notes Off global ou arrêt des autres Voices n'est ajouté.

Le bouton DELETE alterne RED/OFF toutes les 160 ms, avec écriture dans les deux
buffers sans swap global. Annulation, succès et reset du contrôleur annulent le
timer et restaurent OFF, son état inactif actuel. La génération protège contre
un callback obsolète. Le feedback PLAY existant n'est pas modifié.

Validation : 94/94 tests, dont les 91 précédents. Le test historique des longueurs
annule désormais explicitement DELETE avant de poursuivre SHIFT+STEP.
Nouveaux tests : armement/annulation, phases du blink et nettoyage, invalides,
exclusion MODULATION, cibles Voice/PLAY en Leader/Follower, maintien/release,
préservation de toute la structure et des phases différées, Note Off capturé.
Syntaxe JS/MJS et `git diff --check` vérifiés.

Hardware à valider : armer/annuler ; cibler une Voice puis PLAY pendant la lecture ;
vérifier les notes effacées, géométrie et phase intactes, transport continu,
absence de note bloquée et retour DELETE OFF. Répéter en Follower.
Pas de suppression de longueur/configuration/bibliothèque, Chain, COPY, SOLO,
MUTE, confirmation ou nouvelle action long press. Aucun commit.
STOP pour validation hardware.
