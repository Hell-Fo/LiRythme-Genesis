# A/T Play Mode

Le 11e pad A/T (BOOKS[10], famille des transformations) ouvre PLAY MODE.
A choisit Forward, B choisit Ping-pong, C choisit Backward. Les valeurs D-H sont inactives.
Sans selection d'instrument, le choix s'applique au motif et remplace ses exceptions.
Avec un ou plusieurs instruments selectionnes, seuls leurs parcours changent.
Les steps ne constituent pas une destination pour ce reglage.

Forward : 1, 2, 3, 4, 1...
Backward : 4, 3, 2, 1, 4...
Ping-pong : 1, 2, 3, 4, 3, 2, 1... Les extremites ne sont pas doublees.
Une longueur de 1 reste sur le premier step. Une longueur de 2 alterne 1 et 2.
Le parcours est defini sur la longueur de la Voice, bornee par la longueur explicite
du motif en ping-pong ou backward. Le cycle global tient compte des periodes aller-retour
(PPCM si plusieurs periodes sont necessaires), pour permettre un retour complet.

Le curseur Launchpad suit le step musical de l'instrument inspecte. Dans A/T,
il suit le premier instrument selectionne, ou le motif sans selection d'instrument.
Changer la selection ne modifie ni la phase du transport ni les steps selectionnes
pour l'edition. Les couleurs de limites de longueur conservent leur priorite.
Les changements de parcours sont audibles a partir du prochain step, sans restart.
Les notes deja declenchees conservent leur Note Off.

MOTIF et MODULATION disposent de parcours independants. Le panneau PLAY affiche
le mode effectif de l'instrument selectionne. La banque sauvegarde les modes apres
COMMIT ; CANCEL les restaure. Les anciennes banques utilisent Forward par defaut.
COPY motif/Voice et DELETE/RESET incluent ce reglage.

Verification : npm.cmd test (tests moteur, projection UI et controleur MIDI simule).

## Sortie des clips en chaine

Forward joue 1, 2, 3, 4 puis passe au clip suivant.
Backward joue 4, 3, 2, 1 puis passe au clip suivant.
Ping-pong joue 1, 2, 3, 4, 3, 2, 1 puis passe au clip suivant.
Le dernier step 1 du retour est joue avant le changement de clip ; hors chaine,
il reste partage avec le debut du prochain aller-retour pour eviter un doublon.
Les Voices sans longueur explicite ne rallongent pas le cycle calcule a partir
des Voices de longueur explicite. Ces regles s'appliquent aussi a la chaine Modulation.
