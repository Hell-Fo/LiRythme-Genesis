# Rotation — première Transformation

ROTATION occupe le premier pad Transformation du BOOK A/T (slot 8, note 100).
Le pad est YELLOW au repos et clignote YELLOW/OFF pendant l'édition.
La sélection et l'affichage par destination suivent [la grammaire commune](AT-DESTINATION-DISPLAY.md).

## Commandes

- Clic sur ROTATION : ouverture de l'édition; nouveau clic : CANCEL.
- Maintien de ROTATION pendant 300 ms : COMMIT.
- **<< / >> clignotent RED/OFF toutes les 160 ms** pendant l'édition.
- Chaque pression sur << ou >> déplace les événements ciblés d'un step.
  Un maintien ne répète pas le déplacement. Ces commandes ne naviguent pas
  entre les motifs et ne déplacent pas le curseur pendant Rotation.
- La colonne VALUE A–H est éteinte et inactive; le panneau PLAY indique les
  deux commandes temporelles sans les présenter comme des valeurs A–H.

## Cibles et déplacement

Sans sélection : tous les événements du motif. Instruments seuls : leurs
événements. Steps seuls : les événements présents sur ces steps. Les deux
sélections : leur intersection. SHIFT conserve la sélection additive habituelle.

Le déplacement est circulaire sur le **cycle individuel de chaque voix** :
un kick de 8 steps boucle entre 8 et 1, une snare de 6 steps entre 6 et 1.
Sans longueur de voix explicite, le cycle est de 32 steps. La longueur globale
du motif ne remplace pas les cycles individuels. Les événements stockés hors
cycle restent intacts. Les longueurs, la phase de lecture et le transport ne
changent pas.

La sélection de steps accompagne les événements déplacés pour les pressions
suivantes. Si les cycles diffèrent, le suivi est conservé séparément par voix;
les pads montrent l'union des positions sans inclure d'autres événements dans
les déplacements suivants. Une nouvelle sélection explicite redéfinit la cible.

Les sources sont capturées ensemble avant de vider les emplacements de départ,
puis écrites à destination. Les événements adjacents se déplacent donc ensemble.
Une destination occupée du même instrument provoque une **permutation** :
l'événement rencontré revient à la place libérée avec ses attributs.
Pour plusieurs événements sélectionnés adjacents, ils avancent tous d'un step;
l'événement rencontré au bout du groupe revient à l'origine libérée du groupe.
Aucun événement n'est effacé. La sélection continue de suivre uniquement les
événements initialement sélectionnés, pas l'événement rencontré.
Les autres instruments ne sont pas affectés. Vélocité, COLOR et leurs destinations
d'affichage accompagnent chaque événement. Une sélection vide d'événements ne
modifie rien. Le motif édité est fixé à l'ouverture, même en CHAIN/FOCUS.

## Validation, sauvegarde et reset

Pendant PLAY, l'affichage et la banque d'édition sont mis à jour immédiatement,
mais le son conserve la séquence engagée jusqu'à la fin de son cycle : une cible
motif attend la frontière du motif; une cible instrument ou steps attend la
frontière individuelle de chaque voix concernée. La frontière globale du motif
termine aussi les cycles locaux incomplets. Plusieurs pressions préparent le
dernier résultat pour cette frontière sans modifier le cycle en cours.

COMMIT ne force pas une application audible immédiate. CANCEL avant la frontière
laisse entendre l'original; après une première application audible, le retour à
l'original attend également la fin du cycle engagé. STOP/PAUSE permettent
l'édition et l'audition manuelle immédiates. Un motif non joué est préparé pour
sa prochaine entrée. Ce mécanisme réutilise le différé temporel de DOUBLE.

CANCEL restaure les positions et les attributs de tous les événements déplacés depuis
l'ouverture. La sauvegarde pendant l'édition conserve également cet état initial.
COMMIT enregistre les positions résultantes et les marquages de Rotation.
Ces marquages suivent les copies, DOUBLE et la sauvegarde de la banque.

Rotation est une transformation appliquée aux événements, pas un décalage ajouté
au moteur de lecture. Après COMMIT, les nouvelles positions constituent le motif.
Delete → A/T réinitialise les attributs et retire les marquages de Rotation en
conservant ces positions, comme il conserve les notes. Il ne constitue pas un
historique d'annulation des déplacements déjà validés.

Les steps déplacés sont DimRed/RED pour une cible step; seuls les pads instruments
le sont pour une cible instrument; seule la LED Play le signale pour une cible
motif, avec RED au tempo. Les commandes << / >> retrouvent leur affichage habituel
à la sortie de l'édition.
