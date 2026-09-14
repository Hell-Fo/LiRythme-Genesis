# SOLO + MUTE — Hold → Select → Release

Chaque fonction possède son Set mémorisé et son booléen actif dans le moteur.
Pendant le maintien, les instruments basculent dans une sélection de travail :
YELLOW pour les membres, DIM GREEN pour les autres. Les pulses de notes sont
suspendus sur ces boutons pendant la sélection. La timeline reste inchangée.
Au relâchement, une sélection éditée non vide active la fonction ; une sélection
vide reste inactive. Sans édition, le clic bascule actif/inactif avec mémoire.
Si les deux boutons sont maintenus, les Voices éditent le dernier bouton maintenu.

SOLO actif autorise ses membres ; MUTE actif interdit ses membres. MUTE gagne
sur leur intersection. Le dispatch seul est filtré : notes du Motif, longueurs,
configuration, transport, phases et playheads restent intacts. Les notes déjà
émises terminent leur gate existant de 50 ms avec les Note Off capturés.

Boutons actifs : blink normal/OFF à 160 ms, SOLO AMBER et MUTE YELLOW. Inactifs :
couleur normale fixe. Timers indépendants et écriture dans les deux buffers.
DELETE → SOLO/MUTE efface uniquement la mémoire concernée et désactive la fonction,
puis désarme DELETE. Le relâchement de la cible est consommé par DELETE existant.
SHIFT+SOLO conserve Instrument Timeline Focus : maintien pour ajouter/retirer des
Voices du filtre visuel, première activation même vide, sortie au clic suivant
sans édition. Ce geste ne change ni l'activation ni la mémoire SOLO. Le témoin
SOLO est vert pendant le Focus : vert/OFF à 160 ms si SOLO est actif, vert fixe
sinon. Hors Focus, il retrouve AMBER/OFF si actif et AMBER fixe sinon.
SOLO Hold/Select et clic A/B s'appliquent sans SHIFT. DELETE garde sa priorité.
COPY et les transitions polymétriques ne sont pas modifiés.

Validation : 103/103 tests, dont une non-régression SHIFT+SOLO (activation vide,
édition, sortie, ordre de relâchement, témoin vert et mémoire SOLO préservée).
Couverture maintien/multi-toggle,
mémoire/A-B, vide, DELETE, indépendance, composition, feedback, dispatch réel,
Note Off et phases Leader/Follower. Syntaxe JS/MJS et git diff --check.

Ajustements visuels PLAY : le footer comporte quatre zones égales séparées.
Zone 1 vide et non définie ; Zone 2 réservée au projet (Non disponible tant que
le moteur n'expose pas de projet actif) ; Zone 3 réunissant les états actifs
dans un seul texte, vide au repos ; Zone 4 : durée du motif en steps et division
rythmique. SOLO/MUTE apparaissent selon leurs activations indépendantes ; COPY
pendant SOURCE/TARGET ; DELETE lorsqu'armé. Indicateurs sans interaction,
actualisés par la boucle PLAY existante, sans commande ni modification Launchpad.
PLAY actif : base DIM GREEN, flash GREEN de 80 ms au beat, retour DIM GREEN.
PAUSE : DIM GREEN fixe, sans blink tempo. STOP : OFF (bits de couleur à zéro).
Le feedback prioritaire des fins de cycle reste inchangé.
Les pads INSTRUMENTS utilisent le feedback événement existant de 80 ms :
DIM GREEN au repos / GREEN pendant l'événement ; instrument sélectionné :
DIM AMBER au repos / YELLOW pendant l'événement. Les sélections Focus et
SOLO/MUTE gardent leur feedback dédié. Aucun changement du dispatch musical.

Hardware à vérifier : sélectionner plusieurs Voices, relâcher, A/B, éditer à nouveau,
combiner SOLO/MUTE, DELETE de chaque mémoire pendant PLAY en Leader/Follower ;
contrôler couleurs, phases et absence de notes bloquées.
Aucun commit. STOP pour validation hardware.
