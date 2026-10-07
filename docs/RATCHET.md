# RATCHET — répétitions à l’intérieur d’un Step

Quatrième pad du Livre A/T (note Launchpad 71), RED au repos.
Sélection des Voices/Steps, valeurs A–H, COMMIT et CANCEL utilisent la grammaire
existante. Aucun réglage d’activation supplémentaire.

| Valeur | Frappes, première comprise |
| --- | --- |
| A | 8 |
| B | 7 |
| C | 6 |
| D | 5 |
| E | 4 |
| F | 3 |
| G | 2 |
| H | 1 — aucune répétition |

Les frappes gardent la vélocité, COLOR et le routage de l’événement composé.
Dans Motif, une application ne touche que les événements existants. Dans
Modulation, les cellules A/T seules sont permises et ciblent les événements
de Motif à leur intersection Voice/Step. Aucun événement de Motif : aucun son.
Un RATCHET explicite de Modulation remplace celui de Motif, y compris H = 1.
L’absence d’attribut conserve celui de Motif. Les autres familles restent
indépendantes.

## Temps et Note Off

Pour un Step de durée D, un retard SWING S et N frappes, les départs sont :
`S + i × (D − S) / N`, pour `i = 0 … N−1`.

Exemple : 120 BPM, division 1/16, SWING 75 %, E = 4 frappes :
62,5 / 78,125 / 93,75 / 109,375 ms. Le Step suivant commence à 125 ms.
La durée du Step, les pulses de clock et la frontière explicite du Motif
restent inchangés. MIDI et Audio suivent la même grille de départs.

Pour plusieurs frappes MIDI, la durée de note vaut le minimum entre 50 ms et
la moitié de l’intervalle entre deux frappes. À N = 1, les 50 ms existantes
sont conservées. Avant une nouvelle frappe du même train, un Note Off encore
en attente est émis en priorité ; son ancien callback devient sans effet.
Chaque Note Off conserve le port, le canal et la note effectivement jouée.

Les modifications RATCHET et CANCEL sont audibles dès le prochain événement,
sans attendre le cycle. Un train déjà commencé garde ses valeurs capturées,
ses départs et ses Note Off. Les transformations restent différées à leur
prochaine entrée ; éditer un attribut ne les active pas prématurément.

STOP/PAUSE et changement de source annulent les départs restants, sans annuler
les Note Off déjà dus. Chaque frappe expire à la subdivision suivante : un
renderer en retard ne rejoue pas toutes les frappes manquées. Le Step suivant
annule les départs obsolètes. Comme SWING, cette programmation utilise les
timers du renderer ; la précision réelle sous charge reste à tester matériellement.
La mesure de durée en MIDI externe est celle utilisée pour SWING.

En préécoute STOP/PAUSE, la première frappe est immédiate, puis RATCHET répète
dans la durée du Step, sans décalage SWING. Une nouvelle navigation annule les
répétitions précédentes encore en attente. Modulation seule reste silencieuse.

## Données et validation

COPY, DOUBLE, ROTATION, DELETE et reset transportent ou nettoient RATCHET avec
ses événements/cellules A/T. Les sauvegardes antérieures restent lisibles.
Les nouvelles matrices acceptent uniquement null ou un entier de 1 à 8 ; les
valeurs provisoires d’une transaction ne sont pas sauvegardées avant COMMIT.

Les tests dédiés couvrent le pad et les
valeurs A–H, cellules vides/mixtes, Modulation à cycles différents, valeur 1,
édition/CANCEL immédiats, transformations aux frontières, persistance,
copies/rotation/doublement,
sorties MIDI et audio pour 1–8 frappes à 120/300 BPM avec/sans SWING, Note Off
retardés, STOP/PAUSE/reprise, expiration, préécoute et durée MIDI externe.

À tester sur Launchpad : A puis H sur une note ; E + SWING A ; RATCHET de
Modulation ciblant Kick ; H dans Modulation annulant A dans Motif ; STOP/PAUSE
au milieu d’un train et reprise ; préécoute avec les flèches. Vérifier le son,
les pulses Instruments et l’absence de note pendante.

Aucun lancement d’application, accès hardware, commit, push ou build pour
cette implémentation.
