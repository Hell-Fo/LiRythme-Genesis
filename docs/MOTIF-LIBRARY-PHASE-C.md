# Bibliothèque Motif — Phase C : COPY / DELETE

Départ : Phase B `064fc4e`, hardware validée. Aucun changement au worker MIDI,
à l'horloge, aux compteurs de phase ou au modèle PLAYING/NEXT.

Dans MOTIF_LIBRARY : COPY → pad BOOK source → pad BOOK destination.
La source est capturée au choix du pad : événements, longueurs des Voices,
longueur explicite du motif. La destination reçoit de nouveaux tableaux,
indépendants de la source et du snapshot. Une source modifiée ensuite ne change
pas le contenu capturé. Source = destination termine COPY sans mutation si la
destination est autorisée. En PLAY, une destination PLAYING/NEXT reste refusée,
même identique à la source : COPY demeure en TARGET avec son snapshot intact.

DELETE → pad BOOK cible remplace le contenu par une matrice 16 × 32 vide,
16 longueurs de Voice null et une longueur de motif null. Le slot reste valide.
Ni COPY ni DELETE ne sélectionnent la cible ni ne demandent NEXT.

En STOP/PAUSE, toutes les destinations sont autorisées. Si la cible est le
motif courant, sa position repart à zéro, la transition de longueur transitoire
est effacée et le rendu timeline/INSTRUMENTS/Footer est rafraîchi via la
notification existante. Le statut du transport reste inchangé.

En PLAY, écrire ou supprimer PLAYING **ou NEXT** est refusé. NEXT reste armé
et intact : aucun report ni annulation implicite. Annuler NEXT par clic sur
PLAYING après avoir quitté le geste, ou passer en STOP/PAUSE, avant d'écrire
sur ce slot. Tous les autres slots sont modifiables. PLAYING et NEXT peuvent
servir de sources COPY. Les protections sont revérifiées à la destination,
même si une frontière NEXT a eu lieu depuis le choix de la source.

Feedback du bouton : COPY SOURCE clignote YELLOW, TARGET reste YELLOW ; DELETE
armé clignote RED. Une cible refusée laisse le geste actif ; recliquer COPY ou
DELETE l'annule. Succès et self-copy quittent le geste. Footer Zone 3 suit
ces états, avec SOLO/MUTE inchangés. Aucun nouvel état n'est ajouté au Footer.

La première cible COPY détermine le type de snapshot : Voice sur INSTRUMENTS,
motif sur BOOK. Les destinations d'un autre type sont refusées. Les gestes
Voice existants restent disponibles, y compris après SWITCH. Les pads BOOK
n'exécutent les opérations de banque qu'en MOTIF_LIBRARY. Cette banque reste
accessible si la timeline globale était MODULATION ; elle ne change pas cette
sélection. SHIFT+COPY conserve sa réservation existante.

Palette BOOK : actif GREEN même vide ; non actif avec données DIM GREEN ;
non actif vide OFF (valeur couleur 0). Une longueur explicite de Voice/Motif
compte comme donnée, même sans événement. NEXT conserve son alternance
DIM GREEN/OFF, même vide ; annuler ou remplacer NEXT restaure la couleur de
contenu. Le renderer centralise cette priorité, et COPY/DELETE réussis
rafraîchissent immédiatement BOOK. SWITCH reste OFF. Aucune persistance disque.

Convention COPY sur BOOK : après snapshot, SOURCE alterne sa couleur verte et
OFF toutes les 160 ms (DIM GREEN pour une source non courante, même vide).
Une destination refusée reste RED pendant l'appui uniquement ; au relâchement,
son état normal ou NEXT reprend. Le snapshot et COPY restent armés.
Après succès, SOURCE cesse de clignoter, COPY se désactive et DESTINATION fait
un unique flash YELLOW de 120 ms avant de retrouver son état. CANCEL arrête
les overlays COPY et restaure les couleurs, sans mutation musicale. Ces effets
sont centralisés dans le renderer BOOK ; NEXT continue son état sous-jacent.

Validation automatique : 126 tests, dont copie hardware 1→5 en STOP/PAUSE,
snapshot indépendant et géométrie, self-copy sans mutation, effacement complet,
Footer, refus PLAYING/NEXT et protections après frontière en INTERNAL/MIDI.
Les parcours MIDI testent aussi COPY depuis PLAYING et NEXT pendant PLAY,
les destinations protégées successives puis un slot libre, et DELETE du motif
courant en STOP/PAUSE avec vérification du redessin des LEDs de timeline,
de la géométrie libre et de la conservation du slot sélectionné.
Le test de palette couvre vide, événements, géométrie seule, actif vide,
COPY/DELETE sur slot actif ou non actif et priorité du blink NEXT.
Suite Phase A/B, polymétrie, Note Off et worker MIDI conservée.

Phase C COPY/DELETE, convention COPY et feedback BOOK EMPTY/DATA/ACTIVE
validés sur hardware par Dan avant commit.
