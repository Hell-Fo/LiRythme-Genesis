# CHAIN — Phase C — FOCUS

Base : `c02a507`, Phase B validée hardware. **CHAIN Phase C / FOCUS et sa stabilisation contextuelle validées hardware par Dan le 16 septembre 2026.** Clôture par le commit `feat(chain): add focus editing and contextual interaction grammar`. Aucun push ; STOP après commit.

Référence normative : [Grammaire contextuelle](CONTEXTUAL-GRAMMAR.md), commune à NORMAL, CHAIN et CHAIN+FOCUS.

## PLAYING et VIEW

`playingMotifId` reste la référence musicale. `chainFocus`, `viewMotifId` et `chainViewIndex` sont des états de session. `currentMotifId` projette VIEW en FOCUS, PLAYING autrement ; events/voiceLengths/motifLength restent des références directes au Motif édité. Le dispatch MIDI, les pas locaux musicaux et l'avancement du moteur utilisent explicitement PLAYING.

En CHAIN, [<<]+[>>] toggle FOCUS sans transport, reset ni rephase. Entrée : VIEW = PLAYING, index VIEW ancré sur l'occurrence attachée. Sortie : la projection reprend immédiatement PLAYING actuel. STOP/PAUSE conservent FOCUS et VIEW ; un redémarrage engage la première occurrence sans déplacer VIEW. Désactiver CHAIN quitte FOCUS.

## Chord et navigation

Les gestes individuels sont résolus au relâchement pour que le chord exclusif ne déclenche aucune navigation préalable, preview, sélection de Timeline, FREEZE ou LOCK. Les deux ordres d'appui et les releases décalés sont équivalents. En NORMAL, le chord est consommé sans action.

CHAIN sans FOCUS conserve la navigation par occurrence en STOP/PAUSE et les flashes de butée YELLOW/RED de 120 ms. En CHAIN+FOCUS+PLAY, << / >> parcourent les occurrences via `chainViewIndex` et changent VIEW sans modifier PLAYING, NEXT, Loop Point, playhead ou géométrie engagée. Avec [01][05a][05b][03], 05a et 05b restent distinctes malgré le même Motif affiché. La navigation est bornée ; sans sélection, le premier déplacement choisit la tête.

En CHAIN+FOCUS+STOP/PAUSE, << / >> parcourent les Steps du VIEW selon sa durée locale. En NORMAL ou CHAIN sans FOCUS + PLAY, Motif ↔ Modulation reste futur et non implémenté. Les raccourcis SHIFT hors CHAIN et les accords de tempo avec PLAY restent réservés.

## BOOK, palette et Timeline

Dans MOTIF_LIBRARY, un BOOK relâché avant 300 ms sélectionne VIEW s'il contient des données ou représente un membre Chain. Un BOOK vide hors Chain est ignoré. Le short press ne modifie jamais la structure. Un BOOK membre ancre VIEW sur sa première occurrence ; un Motif externe détache l'index VIEW.

Les longpress conservent APPEND en PLAY et INSERT après l'occurrence sélectionnée en STOP/PAUSE, avec confirmation GREEN 120 ms. Les modifications structurelles ajustent l'index VIEW pour préserver l'identité de l'occurrence, ou le détachent si elle est retirée. SHIFT+BOOK conserve Loop Point ; COPY/DELETE conservent leur priorité.

Palette FOCUS : EMPTY OFF, DATA externe DIM AMBER, membre DIM GREEN, PLAYING GREEN, NEXT DIM GREEN/GREEN, VIEW YELLOW. Priorité musicale : VIEW > PLAYING > NEXT > membre > DATA. LoopMaster garde DIM RED au repos, DIM RED/RED en NEXT, GREEN/DIM RED en PLAYING ; VIEW gagne. Les feedbacks explicites COPY/DELETE restent les overlays Phase B ; la confirmation structurelle est GREEN sauf sur VIEW, qui garde YELLOW.

<< et >> indiquent FOCUS avec GREEN/DIM GREEN selon le contexte Timeline. Un flash de butée en cours est annulé à l'entrée. Les transitions musicales rafraîchissent l'affichage sans déplacer VIEW. En PLAY, le curseur musical apparaît seulement lorsque VIEW = PLAYING ; en STOP/PAUSE, le curseur local du VIEW reste visible. Changer de Book et Instrument Focus conservent le Motif VIEW.

## Édition live et géométrie temporelle

Step, effacement et copie Voice ciblent VIEW. Les événements de PLAYING sont lus directement : leurs éditions sont immédiatement visibles au moteur. Les Note Off restent sous la responsabilité des callbacks existants.

Les longueurs sont enregistrées immédiatement. En CHAIN+PLAY, une édition de PLAYING capture durée, longueurs et positions locales dans `liveLengthCycle`, mécanisme utilisé par Leader/Follower. Le marqueur `untilEntry` conserve cette géométrie pendant l'engagement, y compris les boucles locales ; la frontière naturelle libère ce cycle et l'engagement suivant utilise les données enregistrées. Cela vaut pour les clocks interne et externe. Éditer un autre VIEW ne touche ni ce cycle ni le playhead. Hors CHAIN, la politique historique de renouvellement des cycles locaux est conservée.

## Routage contextuel COPY / DELETE

`resolveContext()` expose le Motif édité, le caractère structurel et la navigation. COPY capture les données du Motif édité ; DELETE et navigation interrogent cette résolution commune. DELETE+Instrument reste toujours local. CHAIN sans FOCUS est le seul contexte qui détourne DELETE+PLAY et DELETE+BOOK vers la structure Chain.

En FOCUS, DELETE+PLAY vide les événements du VIEW et remet motifLength et voiceLengths à null. DELETE+BOOK supprime le Motif ciblé sans retirer ses occurrences. Si VIEW = PLAYING en PLAY, le cycle différé conserve la géométrie engagée jusqu'à la frontière naturelle ; les Note Off déjà programmés restent émis. En STOP/PAUSE ou pour un VIEW non-PLAYING, la remise à zéro ne touche pas le runtime. Les protections BOOK PLAYING/NEXT autres que le Motif édité restent explicites dans la référence normative.

Le format Persistence C.1 est inchangé : les états FOCUS et VIEW ne sont pas sérialisés. Les motifs édités et l'identifiant courant utilisent le contrat existant.

## Vérification et validation hardware

Suite complète : **236/236 tests**, dont les 178 tests Phase A/B existants et 45 tests matriciels de stabilisation : 27 DELETE, 9 navigation, 9 chord dans les deux ordres. Les tests Phase C couvrent aussi BOOK interne/externe, gestes longs et confirmation, palettes et LoopMaster, transitions et wrap sous VIEW fixe, Instrument Focus, Step/Voice, MIDI et Note Off, géométrie différée sur les deux clocks, STOP/PAUSE et redémarrage.

Régressions conservées : Loop Point, INSERT/APPEND, palette et butées, COPY/DELETE Voice, SOLO/MUTE, Instrument Focus, polymétrie, Leader/Follower, timing MIDI et Persistence. Contrôles de clôture : syntaxe JS/MJS et `git diff --check`, absence de debug et d'artefacts temporaires, revue du scope.

Validation hardware confirmée par Dan. La dernière vérification avant commit est logicielle ; aucune nouvelle intervention hardware. Aucun push ; STOP après commit.
