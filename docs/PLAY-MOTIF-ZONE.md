# PLAY — MOTIF Zone Foundation

Flux : `LiRythmeState → readPlayMotif → textes DOM` dans `PlayMotifUI.mjs`.
Le renderer est appelé par la boucle visuelle existante de PLAY et par son rendu
synchrone lors des transitions du transport. Aucun scheduler supplémentaire,
commande musicale ou état musical UI. STEP affiche une longueur, jamais la tête
de lecture. La progression sera représentée par la future horloge graphique.

| Élément | Source actuelle et limites |
| --- | --- |
| MOTIF 01 | L’unique matrice `state.motif`. « 01 » reprend la convention déjà validée de SELECTED, pas un numéro exposé par le moteur. Aucun catalogue, index ou changement de Motif courant n’existe. |
| DURATION | `state.getMotifDuration()` : durée explicite, sinon PPCM des longueurs explicites de Voices, sinon 32. |
| GRAPHIC CLOCK | Espace central réservé par CSS, sans graphique, animation ni calcul de phase. |
| STEP | `state.getVoiceLength(id)` pour la Voice sélectionnée (32 si libre), sinon `state.getMotifDuration()`. Indépendant de la tête de lecture. |
| PLAY MODE | Mode effectif du motif ou de la Voice selectionnee : FORWARD, PING-PONG ou BACKWARD. Voir [AT-PLAY-MODE.md](AT-PLAY-MODE.md). |
| CHAIN | Section titrée vide en bas, sans données ou comportement. |

La fondation polymétrique expose désormais les longueurs via les méthodes moteur.
La matrice de notes conserve ses 16 × 32 cellules ; une matrice invalide affiche
Non disponible. Aucun PPCM n’est dupliqué dans l’UI. Voir les règles dans
[MOTIF-POLYMETRIC-ENGINE.md](MOTIF-POLYMETRIC-ENGINE.md).

Le HEADER contient uniquement STATE, BPM et CLOCK SOURCE. La partie centrale suit
l’ordre MOTIF | MODULATION | SELECTION, avec une colonne MODULATION plus large.
Sur écran étroit, les zones s’empilent dans cet ordre. MODULATION contient seulement
son titre. SELECTION reçoit le champ `play-selected` existant : nom musical seul
ou Motif 01, sans changer son alimentation. Aucun NAME, INFO / HELP, OPTIONS A–H
ou FOOTER n’est ajouté dans cette phase.

La zone conserve les couleurs, bordures et typographie existantes. Aucun contrôle
souris/tactile/clavier n’est ajouté. La navigation globale reste existante.

Tests : cinq tests MOTIF couvrent les classes moteur réelles, la longueur STEP
indépendante de la progression, du wrap et du transport,
la durée, les valeurs indisponibles, la propagation par la boucle PLAY, l’absence
de mutation et le markup sans contrôles. Les 65 tests précédents sont conservés.
État intégré à la fondation polymétrique validée sur hardware par Daniel ; voir
[MOTIF-POLYMETRIC-ENGINE.md](MOTIF-POLYMETRIC-ENGINE.md) pour le bilan actuel.
