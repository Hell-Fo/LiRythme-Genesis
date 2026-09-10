# Integrated Pad Configuration Editor

Bibliothèque validée par Daniel. Éditeur intégré implémenté, sans commit, en attente
des essais Electron/hardware. Ce document remplace les limites « lecture seule »
du rapport de bibliothèque pour les types NONE et MIDI DRUM.

## Interface et fonctionnement

SETTINGS conserve les 16 boutons : uniquement le nom non vide, sinon 01–16.
La sélection d'un bouton affiche les paramètres de cette Voice et reste indépendante
de la sélection musicale Launchpad. EDIT fait défiler vers l'éditeur et place le
focus sur NAME. Aucun éditeur JSON brut.

NAME accepte du texte libre, Unicode compris, et est appliqué à chaque événement
de saisie ; le bouton et l'indicateur `*` sont immédiatement actualisés.
TYPE propose seulement NONE et MIDI DRUM.

Pour NONE, seuls NAME et TYPE sont affichés. Pour MIDI DRUM, le panneau affiche aussi
OUTPUT (DEFAULT, fixe), la destination MIDI par défaut courante, CHANNEL et NOTE.
CHANNEL et NOTE sont appliqués à la validation du champ (`change`, normalement
Entrée ou perte de focus), afin de permettre la saisie d'un nombre à plusieurs chiffres.
Une valeur incorrecte est refusée, le diagnostic Phase B reste visible sous les
champs et la dernière valeur active est réaffichée. Aucun clamp silencieux.

Une modification acceptée remplace uniquement la Pad Configuration active en mémoire.
Elle ne touche ni au Motif, ni au playhead, aux cycles ou au transport. Aucune écriture
filesystem n'est déclenchée par l'éditeur. SAVE utilise la sauvegarde sécurisée de la
bibliothèque et son contrôle des changements externes. Un échec conserve l'état modifié.
Revenir exactement au contenu sauvegardé retire naturellement l'astérisque.

## Architecture et validation

`src/PadVoiceEditor.mjs` construit une configuration candidate à partir d'un seul
paramètre et d'un voiceId. Il appelle le sérialiseur Phase B, qui valide intégralement
le document, puis l'activation existante qui revalide avant l'affectation atomique.
Les règles de structure, valeurs entières et plages restent exclusivement celles
de Phase B : CHANNEL 1–16, NOTE 0–127, OUTPUT DEFAULT.

Les attributs HTML min/max/step sont des aides de saisie, pas une autre autorité de
validation. Les gardes propres à l'éditeur contrôlent seulement l'identité du slot,
les champs éditables et le transport. Une erreur ne modifie aucune partie de l'état actif.
Le format `.lirythme-pads.json`, sa version et ses identifiants sont inchangés.

`SettingsUI.js` gère les champs et les boutons ; `PadLibrarySession` reste propriétaire
de l'instantané sauvegardé et du calcul dirty. `PadLibraryUI.js` expose l'état occupé
et l'existence d'un preset actif pour verrouiller l'éditeur pendant les opérations.
Ce découpage permet d'ajouter plus tard des champs propres à un nouveau type sans
déplacer la validation ou la persistance dans le formulaire. Aucun nouveau type ajouté.

## Transitions de type et valeurs initiales

- NONE → MIDI DRUM : nom conservé, OUTPUT DEFAULT, CHANNEL 10, NOTE 36.
- MIDI DRUM → NONE : seulement id, name et type restent en mémoire. output, channel
  et note sont supprimés, pas simplement masqués ou considérés actifs ailleurs.
- NONE → MIDI DRUM après ce retour à NONE : mêmes valeurs initiales 10/36 ; aucun
  ancien paramètre caché n'est restauré.
- Resélectionner le type déjà actif ne réinitialise pas les valeurs MIDI.

Les événements existants d'une Voice NONE restent dans le Motif, silencieux. Après
passage à MIDI DRUM, ces mêmes événements utilisent les paramètres actifs.

## STOP, PAUSE et PLAY

Politique volontairement uniforme : tous les champs, NAME compris, sont éditables
uniquement en STOP/PAUSE. En PLAY, ils sont désactivés et une indication explique
le verrouillage. Une garde synchrone revérifie le transport à chaque événement de
saisie ; le rafraîchissement visuel périodique ne constitue jamais la protection.

Les champs sont également verrouillés pendant restauration, sélection, création,
importation, sauvegarde et confirmation d'abandon. Cela empêche une édition de la
configuration précédente pendant qu'une autre configuration est en cours de chargement.
Sans preset actif (bibliothèque indisponible), l'éditeur reste verrouillé ; il faut
créer ou charger un preset avant d'éditer.

Les Note Off en cours de lecture/Scrub Preview conservent déjà leur destination,
canal et note capturés au Note On. Une modification en STOP/PAUSE ne les redirige pas.
Les déclenchements suivants utilisent les nouvelles valeurs. Aucun changement du
playback, Clock Engine, timing addon ou SoundCheck.

## Protection des modifications

Une configuration modifiée bloque sélection, NEW, IMPORT et restauration qui
remplaceraient son contenu. SAVE la conserve dans son preset. DUPLICATE reste une
issue sans perte : les modifications sont copiées dans un nouveau preset indépendant,
comme dans la bibliothèque validée. Cette création explicite écrit le nouveau fichier ;
elle ne réécrit jamais l'original.

« Recharger la version sauvegardée » demande confirmation avant abandon. En PLAY,
le rechargement est refusé sans ouvrir de confirmation. Une fermeture normale de la
fenêtre avec un état modifié demande également confirmation. Annuler conserve l'app
et l'état en mémoire ; accepter ferme sans écrire le preset. Une opération de fichier
en cours doit finir avant une nouvelle tentative de fermeture.

Les confirmations utilisent `dialog.showMessageBox` asynchrone via une API IPC étroite,
avec les contrôles sender/frame existants. Elles ne suspendent pas le renderer et
ses Note Off comme le ferait une confirmation JavaScript synchrone. Aucun message,
chemin ou opération arbitraire ne peut être fourni : seulement close ou reload.
L'arrêt forcé du processus ou une panne ne peut pas être intercepté ; pas d'autosave.

## Fichiers de cette phase

Ajoutés : `src/PadVoiceEditor.mjs`, `scripts/test-pad-editor.mjs`, ce rapport.

Modifiés : `src/SettingsUI.js`, `src/PadLibraryUI.js`, `index.html`, `main.js`,
`preload.js`, `package.json`, `scripts/test-pad-configuration.mjs`,
`scripts/test-pad-library.mjs`, `docs/PAD-CONFIGURATION-LIBRARY.md`.
Les changements des phases précédentes présents dans l'arbre de travail restent
non commités. Aucun fichier de configuration utilisateur n'a été modifié par ces tests.

## Vérifications

`npm.cmd test` : 59 tests réussis, dont les 53 tests existants (les assertions de
lecture SETTINGS utilisent maintenant les valeurs des champs) et six tests éditeur.
Couverture : sélection/édition des 16 slots, affichage des paramètres, noms et labels
immédiats, transitions de type, bornes/invalides/atomicité, PLAY/STOP/PAUSE, conservation
du Motif, dirty, sauvegarde et rechargement sur vrai disque temporaire, copie des
modifications, protection des remplacements, UI occupée, confirmation d'abandon,
playback réel avec sorties simulées et anciens Note Off après édition.

Contrôles syntaxiques des fichiers JS/CJS/MJS concernés et `git diff --check`.
La validation matérielle reste à réaliser ; les tests DOM utilisent un environnement
simulé et ne remplacent pas les essais dans Electron.

## Protocole Electron/hardware

1. Démarrer, vérifier la restauration du preset, SoundCheck, EDIT et l'affichage des
   16 boutons. Sélectionner notamment 04 et 07, vérifier leurs paramètres existants.
2. En STOP, renommer un pad : son bouton doit changer immédiatement, `*` et SAVE
   apparaître. Vider NAME : seul le numéro sur deux chiffres doit rester. Sans SAVE,
   le fichier sur disque doit rester inchangé.
3. NEW → preset de test. Sélectionner un NONE, passer à MIDI DRUM : DEFAULT/10/36.
   Modifier CHANNEL et NOTE, puis saisir 0/17 pour CHANNEL et -1/128 pour NOTE,
   une décimale et un champ vide. Vérifier refus clair et retour à la valeur active.
4. Sur Cow Bell, passer note 42 → 45 en STOP/PAUSE. Jouer le même Motif et vérifier
   le nouveau son. Repasser en PAUSE et modifier juste après un Scrub Preview : pas
   de note bloquée. Passer à NONE : événements conservés mais silencieux. Repasser à
   MIDI DRUM : DEFAULT/10/36 et nom conservé.
5. En PLAY, vérifier les champs verrouillés. STOP/PAUSE les réactive. La sélection
   d'un bouton SETTINGS doit rester possible pour consulter d'autres Voices.
6. Modifier puis tenter sélection d'un autre preset, NEW et IMPORT : refus sans perte.
   DUPLICATE doit conserver les modifications dans une copie indépendante. Recharger
   la version sauvegardée : Annuler conserve, Abandonner restaure le disque.
7. SAVE : disparition de `*`, contenu JSON correct. Recharger/redémarrer : mêmes
   valeurs éditées. Tester également un échec de sauvegarde ou un conflit externe :
   erreur explicite, état modifié conservé.
8. Modifier puis fermer la fenêtre : Annuler conserve tout ; accepter ferme sans
   sauvegarder. Vérifier le même cas après avoir repris PLAY et l'absence de Note Off
   bloqué pendant la confirmation. Terminer avec le preset DrumBrute habituel.

Hors périmètre : AUDIO, trigger/gate, multi-output, Project, nouveaux types MIDI,
éditeur JSON brut, undo/redo et édition live pendant PLAY.

STOP — aucun commit avant validation Electron/hardware.
