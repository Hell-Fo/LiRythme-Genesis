# DOUBLE — doublement contextuel

`SHIFT + >>` double la Voice sélectionnée, ou le Motif contextuel sans
sélection de Voice. Le geste est mémorisé à l'appui et exécuté au relâchement
sans répétition, même si SHIFT est relâché avant >>. Le chord [<<]+[>>]
reste exclusif et consomme le geste. Le rendu utilise la file LED différentielle
fusionnée existante, sans rafale synchrone.

## Modèle et cas limites

- Steps stockés sur 32 cellules, index 0–31 ; longueurs explicites 1–32.
- DOUBLE exige une longueur explicite 1–16 pour chaque cible à doubler.
  Une fin de Motif absente (PPCM/fallback) interdit DOUBLE complet ; elle
  n'interdit pas DOUBLE d'une Voice explicitement définie.
- Selon le choix de Daniel, les Voices vides sans longueur explicite sont
  ignorées lors du doublement complet. Une Voice contenant un événement
  quelconque sur ses 32 cellules sans longueur explicite fait refuser le tout.
  Les Voices vides avec longueur explicite participent au doublement.
- Chaque période [0,L[ est recopiée dans [L,2L[, silences compris : cette
  seconde moitié remplace donc les éventuelles cellules dormantes présentes.
  Les cellules à partir de 2L restent intactes. La copie ne tronque pas à la
  fin explicite du Motif : les notes au-delà restent des données de Voice.
- Les matrices d'attributs de Steps 16×32 sont copiées profondément avec les
  événements (vélocité comprise). Les futurs attributs d'une autre forme devront
  intégrer explicitement cette opération ; leur persistance reste à définir.
- Les répétitions doublent la dernière version éditée. Tout dépassement de 32
  refuse atomiquement : ni banque, ni notification, ni cycle temporel modifié.
- DOUBLE est indisponible pendant une transaction A/T et hors timeline MOTIF.
  Il ne change ni la cible figée A/T ni ses snapshots.

## EDIT NOW → TEMPORAL ACTIVATION AT NEXT ENTRY

La banque est remplacée atomiquement et devient immédiatement éditable et
persistable. Si la cible est PLAYING en PLAY, `liveLengthCycle` garde la durée,
les longueurs et phases engagées ; une capture du contenu joué complète ce
cycle. Le dispatch MIDI lit cette capture pour les Voices en attente.

DOUBLE Voice libère sa capture au prochain retour local à zéro et adopte la
longueur éditée, même en CHAIN. Les autres Voices ne sont pas réinitialisées.
DOUBLE Motif conserve toutes les Voices et leur contenu jusqu'au retour global
à zéro du Motif courant. Il n'attend jamais un tour entier de Chain.
La frontière globale reste prioritaire et coupe les cycles locaux incomplets.
NEXT et les occurrences Chain continuent leur transition naturelle habituelle.
Les doubles successifs avant activation conservent la capture engagée initiale.

INTERNAL et MIDI utilisent la même transition, sans tick ajouté, reset de clock,
modification du tempo ou révision transport. Les Note Off déjà programmés gardent
leurs callbacks et paramètres capturés.

En STOP/PAUSE, une édition de PLAYING efface la transition et revient au Step 0,
comme l'édition de longueur existante. Une édition du VIEW distinct de PLAYING
ne change pas le cycle joué. PAUSE/CONTINUE sans nouvelle édition conserve la
transition. START/STOP l'efface par la voie existante.

## Validation logicielle

Tests ajoutés dans `scripts/test-polymetric.mjs` : longueurs 4/5/7, doublement
individuel/complet et répété, silences, vélocités et copie profonde, limites et
refus atomiques, persistance, cassure explicite, transitions locales/globales,
composition avec une longueur différée, STOP/PAUSE, contextes NORMAL/CHAIN/FOCUS,
ordre des releases, maintien, exclusivité FOCUS, débit LED, dispatch et Note Off
avec les deux sources de clock.

Hardware non sollicité : STOP. Aucun commit/push.
