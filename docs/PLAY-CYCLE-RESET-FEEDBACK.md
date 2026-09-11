# PLAY Cycle Reset Feedback — étape 2

Étape 1 : validation hardware confirmée par Daniel. La logique de longueurs et
phases de LiRythmeState/LiRythmeActions n'est pas modifiée par cette étape.

Le callback musical existant `setClockStepHandler` déclenche `pulseMotifCycle`
après le dispatch des notes et le dessin du step. La position moteur zéro après
cet avancement représente le début réel du nouveau cycle global, y compris une
durée de 1. Aucun compteur UI, reset supplémentaire ou événement sur simple
redraw/édition/START n'est ajouté. INTERNAL et MIDI utilisent ce même callback.

Sur la timeline MOTIF :
- durée Motif explicite : YELLOW ;
- sinon au moins une Voice explicitement bornée (résolution PPCM) : RED ;
- sinon fallback 32 : aucun feedback spécial, beat habituel conservé.

La couleur décrit le cycle qui commence : lors d'une édition Leader différée,
le blink attend la frontière globale effective et utilise les réglages adoptés
à cette frontière. Les wraps locaux seuls ne produisent pas ce feedback.

Le pulse transport existant est étendu avec couleur et priorité. Il conserve
son unique timeout de 80 ms, sa génération anti-callback obsolète, sa révision
transport et l'écriture du bouton dans les deux buffers Launchpad. Le cycle
remplace un beat en cours et prime sur le beat simultané ; celui-ci ne prolonge
pas le pulse de cycle. Après expiration, retour GREEN. PAUSE/STOP annulent le
pulse et conservent DIM GREEN. Un redraw conserve la couleur temporaire active.

MODULATION conserve son beat existant, sans nouveau feedback de cycle.
DELETE + PLAY / DELETE + instrument restent hors scope et non implémentés.
Aucun changement au transport, aux inputs Launchpad, aux notes ou aux Note Off.

Validation logicielle : 91/91 tests, syntaxe des fichiers JS/MJS concernés et
`git diff --check`. Tests : couleurs et priorité, fallback, durée 1, deux cycles
Leader/Follower, wiring app réel, restauration après 80 ms, chevauchements,
PAUSE/STOP/reprise, MODULATION exclue, frontière live et phases conservées.

Validation hardware à faire : Motif 16 (YELLOW), Voices 5/7 sans durée Motif
(RED à 35), priorité Motif 16 avec Voices 5/7 (YELLOW), fallback libre (beat
normal), puis mêmes cas en Follower. Vérifier retour GREEN et PAUSE/STOP pendant
le blink. Aucun commit. STOP pour validation hardware.
