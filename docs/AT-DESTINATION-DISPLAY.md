# Affichage A/T par destination

**Validation utilisateur — 2026-10-02 :** grammaire visuelle et transitions
audibles de Rotation validées. Cette procédure constitue la référence normative
pour les prochains A/T : préserver la musicalité sans interrompre le cycle engagé.
Toute nouvelle implémentation doit vérifier la sélection par destination,
l'indication des commandes actives, CANCEL/COMMIT et, lorsqu'elle modifie le temps
ou le rythme, le passage audible à la frontière du cycle approprié. Les tests
doivent couvrir ces comportements, notamment les voix de longueurs différentes.

En édition A/T, le rouge indique uniquement la destination de l'A/T sélectionné.

Cette grammaire est commune à tous les attributs et toutes les transformations,
actuels et futurs : destination, affichage DimRed/RED, sélection, COMMIT/CANCEL
et remise à zéro par Delete → A/T. Chaque nouvel A/T doit respecter ces règles
et déclarer sa valeur par défaut ainsi que la manière de reconnaître une valeur
appliquée; il ne doit pas introduire une grammaire d'affichage différente.

Les transformations temporelles commandées par << / >> signalent ces commandes
par un clignotement RED/OFF pendant leur édition. La première est
[ROTATION](AT-ROTATION.md), qui déplace les événements et leurs attributs.

Pendant la lecture, une transformation temporelle devient audible uniquement
à la fin du cycle engagé : cycle du motif pour une cible motif, cycle individuel
de chaque voix pour une cible instrument ou steps. L'édition reste immédiatement
visible; COMMIT ne court-circuite pas cette attente.

| Cible lors de l'application | Affichage |
| --- | --- |
| Steps sélectionnés, avec ou sans instruments sélectionnés | Steps DimRed, puis RED au passage du curseur |
| Instruments sélectionnés, aucun step sélectionné | Pads instruments DimRed, puis RED lorsqu'un événement est actif au step courant |
| Aucune sélection | Bouton Play DimRed, puis RED au tempo pendant la lecture |

Les autres surfaces conservent leur affichage habituel. La dernière application
d'un A/T sur un événement détermine sa destination affichée; les valeurs musicales
restent enregistrées par événement. COLOR OFF retire le marquage correspondant.

Les destinations sont conservées dans la banque, les copies et DOUBLE. CANCEL
restaure valeurs et destinations; les valeurs provisoires ne sont pas sauvegardées.
Les anciennes banques sans destination affichent leurs A/T au niveau des steps,
car leur destination d'origine ne peut pas être reconstruite.

Dans le BOOK A/T (vue PLAY, hors transaction d'édition), appuyer sur Delete puis
sur un pad A/T remet **tous les A/T du motif édité** à leurs valeurs par défaut
(vélocité 100, COLOR désactivé). Les notes et les longueurs sont conservées.
Le geste désarme Delete et n'ouvre pas de transaction A/T. En CHAIN/FOCUS, il
s'applique au motif édité, pas automatiquement au motif en cours de lecture.
