# SWING — attribut A/T

SWING occupe le troisième pad du Livre des Attributs (note Launchpad 70),
RED au repos. Entrée, sélection, COMMIT et CANCEL utilisent la grammaire
A/T existante. Aucun réglage d'activation supplémentaire n'est nécessaire.

| Valeur, du haut vers le bas | Swing |
| --- | --- |
| A | 75 % |
| B | 72 % |
| C | 69 % |
| D | 66 % |
| E | 63 % |
| F | 58 % |
| G | 54 % |
| H | 50 % — aucun retard |

## Cible musicale

- Motif : alternance selon sa position globale ; Steps 2, 4, 6… retardés.
- Voice(s) : alternance selon le cycle local de chaque Voice.
- Steps sélectionnés, avec ou sans Voices : retard direct, sans filtre pair/impair.

Les numéros ci-dessus sont en base 1. Le moteur conserve ses indices en base 0.
Une Voice de longueur impaire recommence son alternance à chaque cycle local.
La cible Motif conserve au contraire l'alternance globale, même lorsque les
Voices bouclent à des positions différentes. La cible est conservée avec
chaque affectation ; une sélection explicite ultérieure peut donc remplacer
la règle sur certaines cellules.

La durée d'un Step reste constante. Le retard vaut
`duréeStep × (pourcentage − 50) / 50` : à 120 BPM et 1/16, 75 % donne 62,5 ms,
66 % donne 40 ms et 50 % donne 0 ms. Le retard maximal reste inférieur à un
Step. La fin explicite du Motif conserve sa priorité sur les cycles locaux.

Dans MOTIF, seules les cellules contenant déjà un événement reçoivent SWING.
Les Steps vides restent sélectionnables ; l'application ne crée aucune note
ni aucun attribut orphelin. Dans MODULATION, les cellules A/T seules sont
autorisées comme pour les autres attributs. Un SWING explicite de MODULATION
remplace uniquement SWING, même à 50 %. VELOCITY et COLOR restent indépendants.
L'alternance d'un SWING provenant de MODULATION suit son propre Motif ou sa
propre Voice, selon la cible capturée.

## Activation et émission

L'édition est visible immédiatement. Pendant PLAY, les modifications de SWING
et leur CANCEL conservent la version temporelle engagée jusqu'à l'entrée
suivante : frontière du Motif pour une cible Motif, frontière locale des
Voices pour les autres cibles. La frontière explicite du Motif interrompt
toujours les cycles locaux. FOCUS édite VIEW sans déplacer PLAYING.
STOP/PAUSE conserve la sémantique d'édition existante.

`SwingTiming.mjs` retarde seulement les départs MIDI et audio. Le moteur de
clock, ses pulses, sa phase et son tempo ne sont pas modifiés. Chaque départ
capture les attributs composés et le routage de son Step. Les Note Off restent
programmés 50 ms après le départ MIDI effectif, vers la même note et le même
port. Le feedback Instrument accompagne le départ effectif.

STOP, PAUSE, redémarrage et changement de source annulent les départs encore
en attente. Les Note Off des notes déjà émises restent programmés. Le Step
suivant expire les départs obsolètes : aucune file de rattrapage n'est rejouée
à une nouvelle frontière. La navigation de préécoute en STOP reste immédiate.

En INTERNAL, la durée vient du tempo courant. En MIDI externe, elle est
estimée à partir des intervalles des pulses reçus, sur au plus 24 intervalles ;
avant de disposer de deux pulses, le tempo affiché sert de repli. Cette mesure
ne modifie pas la clock. Les retards utilisent les timers du renderer : leur
précision sous charge reste à valider matériellement. Si le renderer est
bloqué jusqu'au Step suivant, un départ expiré est supprimé plutôt que rejoué
en rafale. Aucun changement au moteur natif n'est inclus.

## Données et vérifications

Les sauvegardes antérieures sans SWING restent valides. La banque conserve
les valeurs explicites et leur cible. COPY, DOUBLE, ROTATION, DELETE, reset,
transactions et sauvegarde provisoire transportent ou nettoient SWING avec
les événements. Le panneau A/T affiche les pourcentages et les LED VALUE
reflètent les valeurs présentes au Step parcouru.

Tests automatisés : échelle et accès hardware simulé, Steps vides et sélections
mixtes, cycles impairs, MODULATION à 50 %, activation différée et FOCUS,
CANCEL/reset, persistance, copie/rotation/doublement, émissions MIDI et audio,
Note Off après départ retardé, préécoute, expiration et mesure MIDI externe.

## Validation Launchpad à effectuer

1. Sur un Motif régulier, appliquer A puis H : alternance forte puis jeu droit.
2. Comparer Motif et Voice de longueur 5 : l'alternance locale doit repartir
   avec la Voice, l'alternance globale doit suivre le Motif.
3. Sélectionner explicitement un Step impair occupé : il doit être retardé.
   Une sélection vide seule ne doit rien créer.
4. Dans MODULATION, appliquer H sur un Step portant seulement SWING : vérifier
   le retour au jeu droit et la conservation de VELOCITY/COLOR du Motif.
5. Tester COMMIT/CANCEL en PLAY, STOP/PAUSE pendant un retard, puis reprise ;
   vérifier l'absence de rafale et de note pendante.
6. Comparer INTERNAL et MIDI externe, puis tester sur le petit ordinateur
   avec Voices audio et MIDI, CHAIN/FOCUS et changements de contexte.

Aucune application ni aucun port matériel n'a été ouvert pour ces vérifications.
