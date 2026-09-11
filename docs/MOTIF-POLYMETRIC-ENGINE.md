# MOTIF — Polymetric Engine Foundation

## État

`LiRythmeState` conserve les 16 × 32 cellules booléennes de `motif` et ajoute :
- `motifLength` : `null` ou entier 1–32, durée globale explicite.
- `voiceLengths` : 16 entrées `null` ou entier 1–32, par slot Voice.

Ces longueurs sont des données du Motif, pas de Pad Configuration. Elles restent
en mémoire pour la session ; aucun format Project ou sauvegarde Motif n’est ajouté.
Une activation de Pad Configuration conserve les longueurs des slots.

## Résolution

`getMotifDuration()` retourne la durée explicite du Motif en priorité, sans PPCM.
Sinon il calcule le PPCM des seules longueurs explicites de Voices, par PGCD entier.
Sans longueur explicite, le fallback est **32**. Une Voice libre joue sur 32 mais
ne participe pas au PPCM. Une Voice explicitement à 32 y participe : 7 + libre
donne 7, tandis que 7 + 32 donne 224. Toutes les longueurs explicites participent,
indépendamment des notes, du type de Voice et des filtres.

Aucun plafond artificiel de résolution : PPCM(1..32) = 144403552893600, entier
exactement représentable par Number. Les réglages individuels restent limités à 32.

## Playback et phases

`playheadPosition` est la position globale zéro-based dans la durée résolue.
Les actions précédente/suivante bouclent modulo cette durée. `getVoiceStep(id)`
retourne la position globale modulo la longueur réelle de la Voice (32 si libre).
Le dispatch MIDI lit cette cellule locale. Aucun compteur local mutable parallèle.
Au retour global à zéro, toutes les Voices reviennent au step 1, même si leur
cycle était incomplet. Le Motif explicite peut donc tronquer les cycles locaux.

Les pipelines INTERNAL natif et MIDI externe partagent cet avancement. Le Clock
Engine, son ordonnanceur et sa révision transport restent inchangés. START/STOP
remettent à zéro ; PAUSE/CONTINUE conservent la position. La convention existante
est conservée : le callback avance puis émet. START n’émet pas de note immédiate ;
le premier callback avance de l’index 0 à 1 (ou reste 0 pour une durée de 1).

En Leader (INTERNAL), une ?dition pendant PLAY conserve la phase courante.
La Voice adopte sa nouvelle longueur au prochain retour local ? z?ro ; la dur?e
Motif (explicite ou PPCM) attend le retour global ? z?ro du cycle courant.
Ce reset global reste prioritaire sur les cycles locaux incomplets.
Les valeurs et marqueurs ?dit?s sont visibles imm?diatement. PAUSE/CONTINUE
conserve la transition ; START/STOP l'efface et utilise les valeurs ?dit?es.
Hors PLAY et en FOLLOWER (MIDI), le reset imm?diat reste inchang?.
R?appliquer la m?me valeur ne change rien. Aucun correctif MIDI ajout?.
Les cellules au-del?à d’un cycle raccourci restent intactes pour une future extension.

Les Note Off existants à 50 ms capturent sortie/channel/note et ne sont pas annulés
par les resets. Les tests vérifient leur émission après reset naturel, changement
de longueur et STOP. Une déconnexion physique reste hors de cette garantie logicielle.

## Launchpad

- Sans Voice sélectionnée, la cible est le Motif ; sinon, la Voice sélectionnée.
- SHIFT + STEP n pose la longueur n (1–32), la remplace si elle diffère, ou la
  retire si n est déjà la longueur explicite. Même geste pour Motif et Voice.
- SHIFT + DELETE n’a aucune responsabilité sur les longueurs ni nouvelle fonction.
- STEP sans SHIFT conserve l’édition existante. Les releases ne changent pas les
  longueurs. Focus ne devient pas une cible de groupe.

La timeline physique reste limitée à 32 pads : position globale modulo 32 quand
la résolution dépasse 32. Le renderer mémorise le dernier pad allumé uniquement
pour son effacement correct lors des resets. Pas de tête graphique par Voice.

Un seul marqueur de longueur DIM RED apparaît au dernier step explicitement défini
de la cible sélectionnée. Aucun marqueur pour un fallback 32 ou une résolution PPCM.
Les événements ordinaires retrouvent leurs couleurs antérieures : YELLOW pour la
Voice sélectionnée, DIM AMBER pour les autres événements visibles selon le filtre.
Seul un événement sur la frontière explicite devient FULL RED (`LaunchpadColors.RED`).
Sur la timeline MOTIF, le curseur est DIM GREEN sur vide et GREEN sur événement
visible. À son départ, la cellule retrouve OFF ou sa couleur d’événement.
La frontière explicite conserve sa priorité DIM RED / FULL RED sous le curseur.
Aucun clignotement ni couleur combinée. Sans frontière explicite, aucun marqueur rouge.
Convention future uniquement : MODULATION utilisera DIM GREEN pour sa frontière
et GREEN pour ses événements. Aucun comportement Modulation n’est implémenté.

## PLAY et limites

`PlayMotifUI` lit `getMotifDuration()` pour DURATION et `getVoiceLength(id)` pour
STEP, ou la durée globale si la sélection est nulle. STEP demeure une longueur.
MOTIF 01 reste la convention du seul Motif ; aucun Play Mode n’est inventé.
PLAY demeure read-only. Pas d’Euclidean, subdivisions polyrythmiques, Chain,
transformation, nouvelle modulation ou Graphic Clock.

## Tests

83/83 tests : 70 précédents (projections adaptées aux méthodes moteur) et 13 polymétriques/rendu.
Couverture : messages Launchpad réels, validation atomique, PPCM/priorité explicite,
Voices libres, resets, transport INTERNAL/MIDI, projection PLAY, dispatch Note On/Off
et limite physique des LEDs. Validation musicale/hardware confirmée par Daniel,
incluant le toggle SHIFT + STEP, les frontières et la correction du playhead MOTIF.
Contrôles syntaxiques et `git diff --check` réussis.

## Investigation Leader apr?s 8144c86

Voir [rapport](LEADER-LIVE-LENGTH-INVESTIGATION.md). Correction : 88/88 tests ; validation hardware en attente.
