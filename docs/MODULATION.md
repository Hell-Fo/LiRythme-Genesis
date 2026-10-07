# MODULATION — livraison pour validation Launchpad

Implémentation logicielle terminée. Après ses essais hardware, Daniel valide
ce jalon et autorise son commit le 5 octobre 2026. Des ajustements ergonomiques
pourront suivre. Aucun lancement d'application, accès MIDI/hardware ni build de
distribution par l'agent ; aucun push demandé.

## Ajustements validés avant commit

- PLAY présente simultanément les blocs MOTIF et MODULATION, chacun avec ses
  informations et sa Chain. MODULATION affiche son activation effective et
  l'intention ON/OFF en attente de frontière.
- En PLAY et Chain de Modulation, le bouton MOD pulse au beat : DIM RED /
  DIM AMBER si l'effet est inactif, RED / YELLOW s'il est actif. STOP/PAUSE
  restaure le rouge fixe. Hors Chain, l'indication d'intention existante demeure.
- Le passage MOTIF / MODULATION par les flèches envoyait 142 messages LED
  synchrones dans le scénario de régression. Les rendus sont désormais fusionnés
  dans la file différentielle existante, drainée par lots de quatre messages.
  Les commandes de permutation de buffers sont exclues des rendus fusionnés.
  Daniel confirme le bon fonctionnement après cette correction du hoquet.
- Validation logicielle : 442 tests réussis, syntaxe et `git diff --check` OK.

## Modèle et réutilisation

Les deux systèmes utilisent `LiRythmeState` et les mêmes méthodes de
`LiRythmeActions`. Chaque système possède 16 motifs de 16 Voices × 32 Steps,
sa Chain d'occurrences, NEXT, Loop Point, FOCUS/VIEW, son curseur, ses longueurs
et son état temporel `liveLengthCycle`. `forSystem()` fournit une cible stable ;
`editingState` expose le système sélectionné aux commandes communes.

Transport, tempo, division, configurations de Voices, SOLO/MUTE et filtres restent
partagés. Un tick accepté avance chaque système exactement une fois. Le moteur
Clock et son ordonnanceur n'ont pas été modifiés.

MODULATION ne contient plus de notes : elle module uniquement les événements
de Motif. Ses matrices `events` restent vides pour compatibilité du format.
Elle possède `attributes.VELOCITY`, `attributes.COLOR` et `attributes.SWING`,
avec une présence indépendante
par Voice et Step. Un attribut inexistant, une famille absente ou une cellule
`null` signifie « aucun remplacement ». Les valeurs `false`, `100` et `127`
restent des valeurs explicites : COLOR OFF, vélocité neutre existante et 100 %.
Ces données de présence ne sont pas déduites d'une matrice de valeurs par défaut.

Les données éditables, les snapshots temporels de lecture et les événements
composés sont distincts. Le résultat n'est écrit dans aucune banque source.

## Ordre musical exact

Pour chaque Voice, indépendamment :

1. Résoudre le Step local et la version temporelle active du Motif.
2. Résoudre le Step local et la version temporelle active de MODULATION.
3. Les départs proviennent exclusivement de Motif. MODULATION n'ajoute ni ne
   remplace une note.
4. Sans événement de Motif à ce Step local pour cette Voice, ne rien émettre.
5. Partir des attributs du Motif, ou des valeurs habituelles en leur absence.
   Si MODULATION est active, remplacer séparément VELOCITY, COLOR et SWING lorsque l'attribut de
   MODULATION est explicitement présent à son Step local pour cette Voice.
6. Appliquer SOLO/MUTE puis le routage de la Voice. Audio reçoit la vélocité
   composée. MIDI choisit la note normale ou `colorNote` propre à la Voice.
7. Capturer destination, channel et note effectivement émis dans le Note Off
   existant à 50 ms. Une modification, un OFF ou un reset ultérieur ne change
   pas cette identité.

L'échelle VELOCITY reste `[127, 111, 96, 80, 64, 48, 32, 16]`, sans multiplication.
Un COLOR absent ne supprime jamais le COLOR du Motif ; un COLOR explicitement OFF
le remplace. Les exemples Kick/Hat/Snare de la demande sont couverts par les tests.

## Phase, frontières et activation

`modulationRequested` est la dernière intention ; `modulationActive` est l'effet
effectivement audible. Pendant PLAY, ON/OFF s'applique à la prochaine entrée du
cycle global engagé de MODULATION. Les demandes intermédiaires s'annulent ou se
remplacent ; seule la dernière intention demeure. Le bouton affiche l'intention
sans nouveau clignotement ; le footer montre l'effet et une intention en attente,
par exemple `MODULATION OFF → ON`.

OFF neutralise uniquement la composition. Le compteur de MODULATION et sa Chain
continuent de progresser. Le changement de Motif, de Modulation, ou le retour de
cycle de l'un ne réinitialise jamais l'autre.

Les conventions de transport existantes sont partagées : START et STOP remettent
les deux positions à zéro ; PAUSE/CONTINUE conserve leurs positions et les
transitions temporelles préparées. Depuis STOP, l'état demandé est engagé au
démarrage. Une commande ON/OFF en STOP/PAUSE est immédiatement effective, sans
déplacement des positions. Une demande faite en PLAY puis suivie d'une PAUSE
reste en attente jusqu'à la frontière lors de la reprise.

Les éditions de MODULATION sont visibles immédiatement et reprennent les
snapshots de DOUBLE/ROTATION pour l'audition différée : cible globale à l'entrée
du motif, cible locale à l'entrée des Voices concernées. La frontière globale
termine les cycles locaux incomplets. Modifier la durée attend la frontière
ancienne engagée ; changer NEXT ou avancer une Chain attend la frontière de
son propre système. Les deux sources Clock sont couvertes.

Sans durée globale explicite, les règles existantes s'appliquent : PPCM des
longueurs de Voices explicitement fixées ; fallback 32 s'il n'y en a aucune.
Une Voice libre utilise 32 sans participer au PPCM.

COMMIT persiste le résultat édité sans forcer la frontière. CANCEL restaure la
source ; après une activation audible, cette restauration attend aussi les
frontières pertinentes. La transaction mémorise toutes les Voices touchées,
même si la sélection change avant CANCEL. Les comportements d'édition et de
lecture historiques des Motifs sont conservés ; ROTATION et DOUBLE partagent
le même mécanisme temporel dans les deux systèmes.

## Édition, gestes et feedback

- Bouton supérieur 2 : intention ON/OFF de MODULATION.
- SHIFT + bouton 2 : Chain de MODULATION, sans déclencher le toggle simple.
- En PLAY, flèches simples : `<<` sélectionne MOTIF, `>>` MODULATION, y compris
  en FOCUS. Elles ne déplacent ni PLAYING, ni VIEW, ni les compteurs.
- `<< + >>` reste l'accord exclusif FOCUS du système sélectionné. SHIFT + `>>`
  reste DOUBLE ; les accords de tempo avec PLAY/STOP conservent leur priorité.
- Pendant une transaction ROTATION, `<< / >>` conserve sa fonction de rotation.
- En STOP/PAUSE, la grammaire Steps/occurrences, les maintiens, FOCUS/VIEW et la
  préécoute restent ceux du système ciblé. La navigation de MODULATION est
  silencieuse : ses cellules A/T seules ne déclenchent aucun son autonome.
- Le Book Motif/Chain affiché change de banque avec le contexte. Le Book A/T
  reste ouvert. Chaque BEGIN capture désormais le système et le motif pour
  tous les slots, y compris VELOCITY hors Chain ; les anciennes transactions
  contextuelles ne peuvent donc plus migrer vers un autre motif.
- Une transaction engagée reste affichée et éditée dans sa cible capturée.
  Après sa fermeture, le prochain BEGIN utilise le contexte sélectionné.
- COPY et DELETE provisoires et les maintiens Chain sont annulés au changement
  de contexte pour éviter une écriture accidentelle dans l'autre banque.
- ROTATION déplace les cellules A/T de MODULATION : attributs présents et
  métadonnées se déplacent ensemble. La permutation
  en destination occupée et les cycles locaux restent inchangés. Aucune note
  porteuse n'est créée. Dans un Motif de jeu, seuls les événements sont ciblés.
- COPY, DELETE court/long, DOUBLE, NEXT, Loop Point et FOCUS utilisent les mêmes
  commandes et validations. Les copies portent leur système et ne traversent
  pas implicitement les banques.

Hors Chain, les Motifs stockés sont DIM GREEN (Motif) ou DIM RED (Modulation).
Dans les deux Chains, les maillons sont DIM AMBER, PLAYING est YELLOW et NEXT
clignote DIM AMBER/YELLOW. Les priorités FOCUS, COPY et Loop Point restent actives. Les mêmes cadences NEXT, COPY et Loop Point sont
réutilisées ; COPY/refus, VIEW en FOCUS et Loop Point gardent leurs priorités.
Le curseur Motif est vert, celui de Modulation rouge, avec distinction DIM/FULL.
La frontière explicite de Modulation est verte, conformément à la convention
déjà réservée dans l'architecture. Les cellules A/T seules comptent comme données
visuelles, sans devenir des notes.

Le changement de contexte pendant A/T conserve la collecte, la fusion et
l'émission différentielle des LEDs. Le feedback de transition ON/OFF au tick
est traité après les émissions musicales et la programmation des Note Off.

## Persistance et compatibilité

Le format `lirythme-motif-bank`, version 1, reçoit une extension optionnelle
`modulation` contenant ses 16 motifs, longueurs, attributs explicites, destinations
A/T, motif sélectionné, Chain, activation de Chain, Loop Point et état demandé.
Les compteurs, snapshots et transactions ne sont pas sauvegardés.

La sauvegarde utilise les valeurs BEGIN du seul système en transaction jusqu'à
COMMIT. Les éditions de l'autre banque peuvent être enregistrées normalement.
La validation se termine avant de remplacer les données en mémoire.

Un ancien fichier sans `modulation` charge une banque parallèle vide et inactive
sans altérer les Motifs. Les attributs explicites de Modulation ne sont pas
acceptés comme attributs orphelins dans une banque de Motifs de jeu. La Chain
Motif conserve sa politique existante de données de session ; la nouvelle Chain
Modulation est persistée comme demandé.

## Vérifications

- Suite complète après passage à A/T seuls : 491 tests réussis.
- Couverture : exemples normatifs, intersections Voice/Step sur cycles 8/6, présence/OFF,
  A/T seuls, sources intactes, phases et Chains indépendantes, Clock INTERNAL/MIDI,
  activation aux frontières, longueur 1 et fallback/PPCM, CANCEL avant/après
  activation et après changement de sélection, isolation des transactions,
  gestes exclusifs, DELETE court/long, COPY/DOUBLE, palettes, rendu différentiel,
  préécoute, sauvegarde/compatibilité, Audio et identités Note On/Note Off.
- Les assertions historiques dont les conventions changent explicitement
  (réservation MODULATION, palettes Chain, flèches PLAY et cible VELOCITY figée)
  ont été adaptées. Les autres tests de non-régression sont conservés.
- Vérification syntaxique de tous les fichiers JS/MJS/CJS de `src` et `scripts`,
  ainsi que de `main.js` et `preload.js`, et `git diff --check`.

Pas de fusion/bake, Root Modulation, nouvel A/T, cadran graphique, modification
Clock ou flash de résolution commune. Aucun point musical bloquant ne reste
ouvert ; l'écoute, l'ergonomie et le feedback physique attendent la validation.

## Protocole court pour Daniel

1. Préparer un Motif Kick + Hat, avec une durée explicite de 5. Configurer les
   notes COLOR de quelques Voices et activer COLOR dans Settings.
2. Passer en PLAY, sélectionner MODULATION par `>>`, puis arrêter pour la
   préparer : durée 6, choisir Kick et les Steps 1 et 3 dans COLOR.
   Vérifier les intersections avec les notes Kick de Motif ; aucune Snare ajoutée.
   Sans sélection de Voice, vérifier que toutes les Voices existantes sont ciblées.
3. Reprendre PLAY et commander ON/OFF entre deux frontières. Vérifier l'état
   demandé/actif, les attributs composés et le retour du Motif original après OFF.
   Réactiver : la phase doit avoir continué, sans repartir à zéro.
4. Tester COLOR ON puis OFF sur un Step sans note de MODULATION, puis ROTATION
   de cette cellule. Vérifier les notes propres à chaque Voice et l'absence de
   note créée par l'attribut seul. Essayer CANCEL avant et après une frontière.
5. Préparer des Chains dans les deux systèmes, activer celle de MODULATION par
   SHIFT + bouton 2. Vérifier qu'elle traverse les changements de la Chain Motif ;
   tester NEXT, un Loop Point et les longueurs individuelles différentes.
6. Ouvrir une transaction A/T, changer de contexte pendant PLAY et appliquer une
   valeur : seule la cible capturée doit changer. Tester COPY, DOUBLE et DELETE
   court/long dans la banque Modulation ; vérifier l'accord FOCUS et le tempo.
7. Arrêter, fermer puis rouvrir manuellement : vérifier motifs, attributs OFF,
   longueurs et Chain Modulation. Tester une ancienne sauvegarde : couche vide/OFF.

Le travail s'arrête à cette livraison pour validation hardware par Daniel.


## Révision : MODULATION uniquement A/T

La sélection A/T détermine les destinations :

- Voice(s) sans Steps : leurs A/T sont présents sur le cycle de Modulation.
- Voice(s) et Steps : seulement ces Voices aux Steps sélectionnés.
- Aucune Voice ni Step : toutes les Voices sur le cycle entier.
- Steps sans Voice : toutes les Voices aux Steps sélectionnés.

Les cycles restent indépendants. Une cellule Kick/COLOR au Step 1 de
Modulation n'agit que si un événement Kick de Motif se produit au même tick.
Elle ne programme pas un Kick. Pour SWING, l'alternance Motif/Voice et le
ciblage direct des Steps restent ceux documentés dans SWING.md.

Les clics ordinaires sur la Timeline de Modulation ne créent plus de notes.
L'édition passe par le Livre A/T ; la sélection des Voices, les longueurs,
COPY, DOUBLE et ROTATION restent disponibles. A/T seuls apparaissent atténués,
sans jaune de note sélectionnée. DELETE+MOD (bouton 2) vide la Chain de Modulation si elle est active
(y compris FOCUS), sinon les A/T du Motif de Modulation courant. DELETE+PLAY
cible toujours Motif, indépendamment du Livre affiché. SHIFT+PLAY bascule la
Chain Motif ; SHIFT+MOD bascule la Chain de Modulation. DELETE+un maillon
conserve la suppression contextuelle de cette occurrence, sans effacer la banque.
DELETE prend priorité sur l’activation et consomme aussi le relâchement du bouton.

Compatibilité : au chargement, les anciennes notes de MODULATION sont retirées
sans être converties en A/T. Les A/T explicites, longueurs, Chains et Loop Point
sont conservés. Le document fourni au chargeur n'est pas modifié ; les futures
sauvegardes contiennent les matrices de notes vides. Le moteur ignore également
les notes résiduelles éventuelles avant normalisation. La banque Motif est intacte.

Validation hardware encore requise. Aucun lancement d'application, accès MIDI,
commit, push ou build de distribution pour cette révision.
