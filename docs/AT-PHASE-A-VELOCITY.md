# A/T Phase A — Transaction Engine + VELOCITY

Extension normative de [CONTEXTUAL-GRAMMAR.md](CONTEXTUAL-GRAMMAR.md).
Point de départ : `1ac5b3075b195496a4e2f958119909730077898a`.
La règle VALUE ci-dessous incorpore le mapping physique confirmé par Dan.
Moteur VELOCITY, édition, lecture des états, sélection et transaction validés
hardware par Dan. Clic = CANCEL / longpress = COMMIT est le geste A/T définitif.
Validation finale hardware Dan : **OK** (2026-09-21). VELOCITY, TARGET
Instrument × Step et sélections, A–H, CANCEL/COMMIT, panneau PLAY et transfert
vers le Livre A/T préexistant sont validés. La correction de la régression
clock liée au burst LED est également confirmée hardware.

## Livres et activation

SWITCH conserve `PLAY ↔ MOTIF_LIBRARY`. Le Livre A/T préexistant occupe la
zone BOOK de `PLAY` ; Phase A le peuple sans ajouter de destination THE GATE.
Afficher cette surface ne démarre
aucune transaction et ne modifie ni transport, ni PLAYING/VIEW, ni phase,
ni Chain. Sans transaction, SWITCH reste libre.

Le Livre AT réserve les huit premiers pads BOOK aux Attributs et les huit
suivants aux Transformations. Seul le premier Attribut, BOOK note 68, est
VELOCITY : RED fixe au repos. Les sept autres Attributs sont EMPTY/DIM RED ;
les huit Transformations sont EMPTY/DIM AMBER. EMPTY reste non activable.
La grammaire de famille est : Attribut absent DIM RED, présent RED ;
Transformation absente DIM AMBER, présente YELLOW. Une fonction active clignote
dans sa couleur de famille. Aucun COLOR, RATCHET, SHUFFLE, GROOVE, MICRO ou ACCENT.

Clic court sur VELOCITY : BEGIN au relâchement, snapshot avant toute édition,
sélections Instrument et Step vides, cible MOTIF, aucune valeur encore choisie.
VELOCITY clignote RED/OFF toutes les 160 ms. Un maintien au repos ne démarre
pas de transaction. Pendant la transaction :

- clic court VELOCITY : CANCEL de toutes les éditions depuis BEGIN ;
- maintien VELOCITY de 300 ms : COMMIT de toutes ces éditions, sans action
  supplémentaire au relâchement.

Ces sorties effacent les sélections temporaires et la valeur choisie, arrêtent
le clignotement, rétablissent VELOCITY RED fixe via le rendu LED différé et restituent
la colonne VALUE. Elles ne déplacent ni VIEW,
ni PLAYING, ni les index Chain/Loop Point, ni le playhead ou le cycle différé.
Un clic ultérieur crée un nouveau snapshot. La réinitialisation des entrées
du contrôleur annule une transaction ouverte et nettoie ses timers.

## TARGET : Instrument Set × Step Set

| Instruments | Steps | Cible |
| --- | --- | --- |
| vides | vides | Motif entier |
| sélectionnés | vides | Ces Instruments, tous les Steps |
| vides | sélectionnés | Toutes les voix présentes sur ces Steps |
| sélectionnés | sélectionnés | Intersection des deux ensembles |

Dans chaque catégorie, un clic sur un élément absent remplace exclusivement
la sélection de cette catégorie ; un clic sur un élément présent le retire.
SHIFT+élément fait un toggle additif. Les deux catégories ne s'effacent jamais
mutuellement. Retirer le dernier élément rétablit la dimension entière.
Les pads sélectionnés sont YELLOW ; ces sélections ne modifient pas
`selectedInstrument`, Instrument Focus, les événements ou les longueurs.

Chaque application interroge `resolveContext().editingMotifId`. En FOCUS,
c'est VIEW, même si PLAYING est différent. La navigation individuelle et le
chord FOCUS gardent leur grammaire existante ; si VIEW change, la prochaine
application vise ce nouveau motif. Sans FOCUS, une frontière Chain peut
changer le motif courant : la transaction reste ouverte et suit ce contexte.
CANCEL couvre tous les motifs modifiés, même ceux quittés depuis BEGIN.

VELOCITY modifie uniquement les cellules contenant un événement, parmi les
32 cellules stockées de chaque Voice ciblée, y compris les événements hors
longueur active. Elle ne crée ni supprime de notes et ne change aucune longueur.
Les filtres visuels et SOLO/MUTE ne réduisent pas la TARGET implicite MOTIF.

## Colonne VALUE — règle normative exclusive

A est le pad supérieur ; H est le pad inférieur.

| Valeur | Note Launchpad | VELOCITY | Commande normale suspendue |
| --- | --- | --- | --- |
| A | 8 | 127 | — |
| B | 24 | 111 | — |
| C | 40 | 96 | — |
| D | 56 | 80 | — |
| E | 72 | 64 | — |
| F | 88 | 48 | DELETE |
| G | 104 | 32 | COPY |
| H | 120 | 16 | SWITCH |

Pendant la transaction, les huit pads sont exclusivement des valeurs A–H.
F ne supprime rien, G ne copie rien, H ne navigue pas. C'est le verrouillage
physique de SWITCH ; `toggleView()` est aussi verrouillé côté actions.
Cette table appartient à VELOCITY, jamais à un mapping musical global.
127 correspond au niveau Accent visé pour DrumBrute Impact ; aucun Attribut
ACCENT distinct n'est ajouté.

Une valeur s'applique immédiatement à la TARGET et sera utilisée aux prochains
Note On selon les règles live existantes. Les Note Off déjà programmés conservent
leur gate de 50 ms. Les huit LEDs VALUE sont DIM AMBER, la valeur choisie YELLOW.
Un changement de sélection efface la surbrillance jusqu'à une nouvelle application.

Les gestes COPY/DELETE déjà armés sont conservés mais suspendus pendant A/T.
Leurs timers ne peuvent pas écraser les LEDs A–H ; à la sortie, leurs feedbacks
normaux reprennent avec leur phase courante. SWITCH retrouve OFF. Les appuis
A/T encore maintenus restent consommés jusqu'au relâchement, même après COMMIT.
Les relâchements d'appuis historiques commencés avant BEGIN libèrent leurs
verrous sans déclencher de commande. Hors transaction, COPY/DELETE/SWITCH
retrouvent leurs règles historiques et la navigation à deux vues préexistante.

## Troisième panneau PLAY

Le panneau SELECTION devient VELOCITY pendant la transaction. Il affiche le
numéro du motif édité, la TARGET compacte (`MOTIF`, `STEPS 03·05·07`,
`SNARE+CYMBAL · 03·05·07`, etc.), les huit valeurs de haut en bas et la valeur
choisie en surbrillance. Il suit la boucle de rendu PLAY existante, sans nouveau
timer UI. À CANCEL/COMMIT il redevient SELECTION. Le Launchpad suffit à jouer.

## Architecture et persistance

`ATTransaction.mjs` possède le registre de 16 emplacements, le cycle de vie,
les ensembles indépendants et le snapshot. Chaque définition fournit ses
valeurs et ses opérations `capture/apply/restore`. Les futurs A/T pourront
brancher leurs opérations musicales sans changer le protocole transactionnel.
Les quinze définitions futures restent absentes.

BEGIN capture les seules données musicales concernées pour les 16 motifs,
afin de permettre les changements ultérieurs de VIEW/PLAYING. VELOCITY capture
ses matrices, pas le transport ni la géométrie. CANCEL restaure uniquement
les matrices des motifs effectivement touchés, y compris l'absence initiale
du champ. COMMIT conserve le résultat et signale la banque modifiée.

Les événements restent booléens. Un champ facultatif `velocities` (16 × 32
entiers 1–127) accompagne chaque motif modifié. L'absence du champ conserve
la vélocité historique 100. Le codec v1 accepte les anciennes banques sans
migration obligatoire, valide ce champ et le clone. COPY Voice/Motif emporte
les vélocités avec les notes ; DELETE ou recréation d'une note rétablit 100.
Les cibles, protections, longueurs et règles live de COPY/DELETE sont inchangées.

Les valeurs provisoires restent audibles mais ne sont pas sauvegardées.
Si une transition Chain ou une autre modification déclenche l'autosave pendant
A/T, le snapshot de persistance projette les vélocités BEGIN. COMMIT rend les
nouvelles valeurs sauvegardables. Une fermeture sans COMMIT conserve donc les
dernières valeurs validées. Aucun état de transaction n'est sérialisé.
L'emplacement, le debounce, l'IPC et l'écriture atomique restent existants.

## Vérifications

Suite complète : **268 tests réussis**, dont **32 tests A/T**.
Validation syntaxique : tous les fichiers JS/MJS/CJS du périmètre versionné, sans erreur.
`git diff --check` : aucune erreur d'espacement.

`scripts/test-at.mjs` couvre les cibles simples et multiples, leur intersection,
les gestes SHIFT, toutes les valeurs et leur mapping physique, BEGIN/CANCEL/
COMMIT et la transaction suivante, les snapshots multi-motifs, le verrouillage,
les commandes et LEDs suspendues/restaurées, les relâchements et répétitions,
CHAIN et FOCUS/VIEW, les cycles différés, COPY/DELETE, la compatibilité de banque,
la projection autosave et le panneau PLAY. Le dispatch réel extrait de `app.js`
vérifie les Note On/Off et la continuité 5×7 en horloge interne et MIDI.

La suite historique conserve les matrices contextuelles DELETE/navigation/chord
et le comparatif polymétrique de 4480 ticks. Seules ses attentes de navigation
THE GATE retrouvent les deux vues préexistantes. Les tests de finition vérifient
les 16 couleurs, EMPTY non activable, les deux sorties et le retour au Livre
sans destination dupliquée. Le panneau a aussi été rendu et inspecté
dans un Electron isolé sans connexion MIDI : aucune largeur débordante,
surbrillance unique, TARGET lisible et restitution SELECTION vérifiées.

La régression de timing et ses mesures avant/après sont documentées dans
[POLYMETRIC-HARDWARE-INVESTIGATION.md](POLYMETRIC-HARDWARE-INVESTIGATION.md).
VALUE ne redessine plus le motif entier. Les mises à jour LED A/T sont
fusionnées par pad et envoyées par lots de quatre, espacés de 4 ms, sans
modifier le moteur MIDI/clock ni les Note On/Off. Les tests couvrent les
bursts, le drainage borné, les couleurs obsolètes et le nettoyage des timers.

**Validation hardware finale Dan : OK. Phase A prête au commit ; aucun push.**
