# COLOR — attribut transactionnel A/T

## Livraison

COLOR occupe le deuxième pad du Livre A/T (BOOK note 69), après VELOCITY.
Le moteur utilise BEGIN, CANCEL au clic et COMMIT au maintien de 300 ms,
avec le rendu différentiel/coalescé existant. Aucun commit/push ; aucun accès
au hardware pour cette implémentation. Validation Launchpad attendue de Daniel.

## SETTINGS et configuration des Voices

- `COLOR ENABLED` autorise l'entrée dans COLOR. Désactivé par défaut, mémorisé
  dans les préférences locales, il laisse le pad DIM RED et bloque BEGIN.
- Désactiver cette préférence ne change ni les événements ni leur lecture MIDI.
  Une transaction déjà ouverte conserve sa sortie CANCEL/COMMIT ; le pad reste
  DIM RED tant que la préférence est désactivée.
- Chaque Voice MIDI DRUM accepte `colorNote`, entier optionnel 0–127, indépendant
  de `note`. SETTINGS expose COLOR NOTE : vider le champ retire la variante.
  L'édition de la configuration reste verrouillée en PLAY comme auparavant.
- SAVE/chargement des Pad Configurations conservent ce champ optionnel dans le
  format version 1. Les anciens presets restent acceptés sans transformation.

## Événements, édition et persistance

`colors` est une matrice optionnelle de 16×32 booléens ; son absence signifie
OFF partout. VELOCITY conserve sa matrice indépendante. COLOR n'agit que sur
les événements existants, y compris ceux stockés hors de la longueur active.
La sélection Instruments × Steps détermine la portée ; une sélection vide
ne restreint pas cette dimension. Le curseur ne limite jamais l'application.

A applique une valeur commune : premier clic ON, suivant OFF. Un changement
de sélection remet cette commande à son état initial (premier clic ON), comme
la remise à zéro du choix de valeur dans la grammaire A/T. Les états mixtes ne
sont jamais inversés individuellement. B–H restent OFF et leurs appuis/releases
sont consommés avant DELETE/COPY/SWITCH et les autres commandes ordinaires.

Le Motif contextuel est capturé au BEGIN dans tous les modes. Un changement de
PLAYING/NEXT ou de VIEW ne déplace ni la cible de COLOR ni son affichage A/T.
CANCEL restaure les valeurs du BEGIN ; COMMIT émet la notification de sauvegarde.
Même si une autre action déclenche un autosave pendant la transaction, le snapshot
sérialisé contient les valeurs du BEGIN, jamais les couleurs provisoires.

Le format Motif Bank version 1 accepte et valide `colors`. COPY Voice/Motif
copie ses valeurs sans partage de lignes ; une source sans COLOR efface COLOR
sur la destination concernée. DELETE et le retrait/recréation d'un événement
remettent COLOR à OFF. DOUBLE copie COLOR avec les autres matrices d'attributs,
et sa capture temporelle continue à protéger le contenu du cycle engagé.

## Lecture et feedback

Le dispatch lit COLOR au Step local de la Voice polymétrique. ON utilise
`colorNote` si elle existe, sinon `note`. OFF utilise `note`. Aucune transposition
n'est calculée. Le callback Note Off capture la note réellement envoyée, ainsi
que le canal et la sortie, même si la configuration ou COLOR change ensuite.
Le réglage COLOR ENABLED n'intervient jamais dans ce dispatch.

Pendant COLOR, A inspecte la cellule du curseur de Timeline (position modulo 32)
dans le Motif capturé, avec les restrictions Instruments et Steps de la transaction.
Il compte les événements COLOR ON : 0 → OFF, 1 → DIM RED, 2 ou plus → RED.
Ce feedback d'inspection des cellules est distinct de l'index local utilisé par
le moteur polymétrique pour les notes. Il n'est pas réduit par SOLO/MUTE.
Il reste stable pendant le Step et se met à jour en PLAY et en navigation manuelle
STOP/PAUSE. Aucun timer de flash n'est ajouté à A.

Les changements de curseur et de sélection passent par la file LED existante :
états fusionnés, valeurs identiques éliminées, au plus quatre messages par tour
de rendu différé. Aucun changement du scheduler, tempo, priorité MIDI, reset
ou tick de clock n'est ajouté.

Le troisième panneau PLAY indique COLOR, le Motif capturé, les Voices/Steps et
la dernière valeur collective appliquée (ON/OFF ; tiret avant application).
Il ne montre qu'une ligne A. Cette valeur ne dépend pas de l'intensité lumineuse
sous le curseur. CANCEL/COMMIT rétablissent le panneau normal ; VELOCITY retrouve
ses huit lignes A–H.

## Vérification logicielle

Suite complète : **348 tests réussis**, incluant 15 nouveaux tests et l'extension
du test SETTINGS intégré. Couverture : scénarios A–E, sélection/intersection,
aucune création d'événement, alternance collective, états mixtes, feedback stable
et différentiel, B–H exclusifs, préférence, note 0/127 et validation atomique,
ancien format, annulation/commit/autosave, cible capturée CHAIN/FOCUS, panneau
PLAY, COPY/DELETE/DOUBLE et dispatch réel INTERNAL/MIDI avec Note Off capturés.
Les suites existantes VELOCITY, polymétrie, CHAIN/NEXT/FOCUS, SOLO/MUTE, DOUBLE,
configuration et persistance passent également.

Validation matérielle non effectuée : rester en STOP jusqu'au contrôle Launchpad
par Daniel. Aucun lancement de l'application ni commande de transport hardware.

## Investigation — COLOR absent du Livre

Le test intégré `COLOR Book regression` relie le vrai handler de SETTINGS au
contrôleur Launchpad, vérifie les messages MIDI LED du pad BOOK 69, puis envoie
les appuis/releases réels : activé → RED et BEGIN COLOR ; désactivé → DIM RED
et aucune transaction. Il vérifie également le retour au repos après CANCEL,
la préférence mémorisée et l'absence de modification de la banque/clock.

Résultat : défaut non reproduit dans les sources actuelles ; 349/349 tests passent,
syntaxe du test et `git diff --check` OK. Aucun correctif de production appliqué
sans cause identifiée. Il reste à préciser la version lancée (projet/portable)
et l'état coché de COLOR ENABLED lors du constat. Hardware non sollicité,
aucun commit/push ; STOP pour le contrôle de Daniel.

## Correction hardware — Steps vides et Timeline A/T

Les mutations VELOCITY/COLOR filtraient déjà les événements existants, mais
`apply()` enregistrait une valeur choisie même lorsqu'aucun événement ne pouvait
recevoir l'attribut. Cette réussite visuelle trompeuse est corrigée : une cible
entièrement vide retourne false, garde `valueIndex` à null, ne marque aucun Motif
comme modifié et ne déclenche pas de sauvegarde au COMMIT. COLOR n'avance pas
son alternance ON/OFF sur un clic sans événement.

Les indicateurs de valeur du Launchpad et du panneau PLAY vérifient également
la présence d'événements dans l'intersection Instruments × Steps. Les valeurs
ne sont pas présentées comme appliquées sur la seule base d'une sélection vide.
La navigation et la sélection de Steps vides restent disponibles.

Feedback Timeline pendant VELOCITY et COLOR :
- Step sélectionné avec événement dans les Voices ciblées : YELLOW ;
- Step sélectionné vide dans ces Voices : DIM GREEN ;
- Step non sélectionné avec événement visible : DIM AMBER ;
- Step non sélectionné vide : OFF.

La matrice dense existante reste compatible avec la persistance : les cellules
vides conservent les valeurs neutres (VELOCITY 100, COLOR false), jamais la valeur
appliquée. Aucune matrice n'est créée pour une application entièrement vide.
Pas de migration des données ni de nouvelle convention de stockage.

356 tests réussis : sept nouveaux cas couvrent les cibles vides, mixtes et
multi-Voices pour les deux attributs, l'absence de notification/persistance
provisoire, CANCEL et l'alternance COLOR après clic sur vide. Les attentes
historiques de sélection Timeline sont adaptées au nouveau feedback.

COLOR absent : Daniel a confirmé que COLOR ENABLED n'était pas coché. Le test
intégré SETTINGS → LED du pad 69 → clic reste passant : RED/accessible activé,
DIM RED/inactif désactivé. Aucun contournement de cette préférence n'est ajouté.
Aucun commit/push, aucune sollicitation hardware ; STOP pour validation Daniel.
