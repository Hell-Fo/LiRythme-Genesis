# Cadrans PLAY

Chaque système possède un cadran extérieur (orange MOTIF, bleu MODULATION)
et un cadran intérieur ivoire pour la Voice sélectionnée. Le rayon intérieur
vaut 80 % du rayon extérieur. Sans sélection, le cadran intérieur disparaît.

Les cycles de 3 à 16 Steps sont des polygones ; 1, 2 et les cycles plus longs
sont représentés par un anneau. La géométrie reste bornée même pour un grand
PPCM. Les positions chiffrées sont en base 1, le premier Step est à midi et
la progression suit le sens horaire, sans interpolation ni animation CSS.

En PLAY/PAUSE, les cadrans suivent PLAYING et les longueurs temporelles engagées
(`liveLengthCycle` si présent). Les positions locales viennent de `getVoiceStep`.
Si VIEW est différent, la légende précise le numéro en LECTURE. Les titres et
champs d'édition existants continuent à décrire VIEW. En STOP, le cadran décrit
le Motif courant et sa position d'inspection. Une fin explicite conserve sa
priorité : le dessin ne prolonge aucun cycle et ne calcule pas un autre PPCM.

Le rendu utilise la boucle visuelle PLAY existante. Aucun timer musical, aucun
appel MIDI, aucune modification de phase. La géométrie SVG est recalculée
uniquement quand la longueur change ; les attributs et textes sont actualisés
quand la projection change. MODULATION OFF conserve son cadran vivant puisque
son compteur continue à progresser. La résolution commune des deux systèmes
et son flash ne sont pas implémentés dans cette étape.

Validation : 444 tests réussis, syntaxe et diff vérifiés. Aperçu isolé sans
moteur MIDI à 1280 × 720 : cycle long 480, Voice 5, Modulation 8 / Voice 3,
footer visible sans défilement. Validation musicale hardware par Daniel à suivre.
