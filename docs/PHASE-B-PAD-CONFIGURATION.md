# Phase B — Pad Configuration files

Le workflow actuel est décrit dans [Bibliothèque de Pad Configurations](PAD-CONFIGURATION-LIBRARY.md).
Les sections ci-dessous documentent les étapes historiques Phase B/B.1.

## Complément Phase B.1 — préférences et restauration

La Phase B a été validée sur Electron/DrumBrute et commitée en `814b299`.
Les changements B.1 suivants sont en attente de validation, sans commit.
Ils remplacent la limitation de restauration au redémarrage décrite dans le
rapport historique ci-dessous.

Les préférences sont conservées dans `pad-configuration-preferences.json` sous
`app.getPath("userData")`, séparément des fichiers musicaux. Un dernier dossier
commun à LOAD et SAVE AS est mémorisé après sélection dans le dialogue ; une
annulation du dialogue ne le change pas. Un fichier sélectionné mais invalide
peut donc mémoriser son dossier sans devenir la configuration active.
Un dossier disparu, inaccessible ou remplacé par un fichier entraîne un repli
vers Documents. SAVE AS conserve le nom proposé et utilise ce dernier dossier.

Le chemin actif est mémorisé après LOAD effectivement activé (accusé de réception
du renderer par jeton IPC), ou après SAVE/SAVE AS réussi. Un LOAD refusé pendant
PLAY ou invalide ne remplace pas ce chemin. Les préférences utilisent l'écriture
temporaire/remplacement existante ; une erreur de préférence est signalée sans
annuler une activation ou une sauvegarde musicale déjà réussie.

Au démarrage, la restauration se termine avant de connecter les entrées MIDI et
les commandes de transport. Elle réutilise exactement le parseur/validateur et
l'activation de Phase B. Le nom, les Voices et le fichier courant sont restaurés,
et SAVE peut réécrire ce fichier. Aucun état du Motif n'est restauré ou modifié.
Un fichier absent/invalide conserve la compatibilité avec une indication dans
SETTINGS ; des préférences illisibles reviennent aux valeurs par défaut.
Le chemin indisponible est conservé pour permettre une nouvelle tentative au
prochain démarrage. SoundCheck et le Clock Engine ne sont pas modifiés.

Fichiers B.1 : `main.js`, `preload.js`, `src/SettingsUI.js`, `src/app.js`,
`src/PadConfigurationPreferences.cjs` (nouveau),
`scripts/test-pad-configuration.mjs` et ce rapport.

Validation automatisée B.1 : 38 tests réussis avec `npm.cmd test`, contrôles de
syntaxe et `git diff --check`. Ajouts : préférences après redémarrage simulé,
dossier absent/non-dossier, restauration UTF-8 BOM, fichiers absents/invalides
(dont doublons), préférences corrompues, échec d'écriture de préférence,
restauration SETTINGS avec Motif conservé et notification d'activation uniquement
après LOAD accepté. Les dialogues natifs et le matériel restent à valider.

Test manuel B.1 : LOAD depuis un dossier choisi, puis SAVE AS et LOAD pour vérifier
leur dossier initial commun ; redémarrer et vérifier configuration/fichier courant,
puis SAVE. Renommer le dernier fichier ou le rendre invalide et redémarrer :
compatibilité, indication SETTINGS, aucun crash. Supprimer/renommer le dernier
dossier : prochain dialogue dans Documents. Enfin, charger A avec succès puis
tenter B pendant PLAY ; au redémarrage, A doit être restauré.

---

Implémentation sans commit. Validation Electron et hardware à effectuer par Daniel.

## Fichiers

Ajoutés : `src/PadConfigurationFile.mjs` (format, validation, conversion, activation),
`src/PadConfigurationStorage.cjs` (lecture UTF-8 stricte et écriture sûre),
`scripts/test-pad-configuration.mjs`, ce rapport et
`docs/examples/DrumBrute Impact.lirythme-pads.json`.

Modifiés : `main.js` (dialogues et IPC), `preload.js` (trois méthodes dédiées),
`src/SettingsUI.js`, `index.html`, `package.json` (commande de tests).

Aucune modification du Clock Engine, de ses workers/utilities, du bridge natif,
du timing addon, de DrumBruteImpactProfile.js ou de SoundCheck.

## Format exact version 1

Fichier `.lirythme-pads.json`, JSON UTF-8 ; BOM accepté à la lecture, sortie sans BOM,
indentation de deux espaces et saut de ligne final. Le fichier d'exemple est généré
avec le sérialiseur à partir de la configuration de compatibilité existante.

Objet racine : `format` obligatoire, exactement `LiRythme Pad Configuration` ;
`version` obligatoire, nombre entier 1 ; `name` obligatoire, chaîne ;
`description` facultative, chaîne ; `voices` obligatoire, objet.
Les chaînes peuvent être vides, accentuées ou Unicode.

`voices` contient exactement `VOICE 01` à `VOICE 16`, une occurrence chacune.
Le sérialiseur les écrit dans cet ordre. L'ordre dans un fichier chargé est libre.
La conversion est centralisée dans `voiceKey` et `voiceId` : 01 ↔ 0, 16 ↔ 15.

Chaque Voice est exactement l'une des structures suivantes :

```json
{ "name": "", "type": "NONE" }
```

```json
{
  "name": "Kick",
  "type": "MIDI DRUM",
  "output": { "mode": "DEFAULT" },
  "channel": 10,
  "note": 36
}
```

`channel` : entier 1–16 ; `note` : entier 0–127. Aucun clamp ni conversion de chaîne
en nombre. Tous les champs supplémentaires sont refusés, y compris sur NONE,
sur output et à la racine. Les types futurs, DEVICE et les destinations explicites
sont refusés clairement. JSON strict : ni commentaires ni virgules finales.

## Validation et doublons

`JSON.parse` vérifie toute la syntaxe. Un scanner lexical parcourt ensuite le texte
original, consomme chaque chaîne entière et maintient un ensemble de clés par
objet. Les clés sont décodées par `JSON.parse`, ce qui détecte aussi `VOICE 12`
face à `VOICE \u0031\u0032`. Toutes les clés dupliquées sont refusées, même si
leurs valeurs sont identiques ; les mêmes champs dans des Voices distinctes
restent autorisés. Ce n'est pas un deuxième parseur JSON : le scanner ne valide
ni grammaire ni valeurs et ne s'exécute que sur une syntaxe déjà valide.
Aucune dépendance ajoutée.

Les erreurs de doublons indiquent ligne et colonne. Les erreurs de syntaxe sont
préfixées « JSON invalide » avec le diagnostic du moteur JavaScript (position,
ligne/colonne selon le cas). Les erreurs sémantiques sont regroupées et utilisent
les adresses humaines, par exemple `VOICE 13 → channel`, sans index interne.

## LOAD et activation

Le main ouvre le dialogue, lit en UTF-8 strict et valide intégralement. Le renderer
revalide puis vérifie le transport au moment exact de l'activation, après tous
les appels asynchrones. En STOP ou PAUSE, une seule affectation remplace
`state.padConfiguration`. Le fichier courant est associé seulement après succès.
Les 16 Voices et le nom affichés se rafraîchissent immédiatement.

En PLAY, un fichier valide est refusé avec une consigne STOP/PAUSE puis LOAD.
Aucune activation différée automatique ; aucun arrêt du transport. Si PLAY
commence pendant le dialogue, la vérification finale le prend en compte.
Un fichier invalide, une annulation ou une erreur de lecture conserve configuration
et association de fichier antérieures. SETTINGS reste ouvert.

Motif, références de ses tableaux, événements (y compris NONE), longueurs,
playhead, cycles, sélection et transport ne sont pas modifiés.
Les Note Off de lecture et Scrub Preview existants capturent déjà sortie, canal et
note au Note On dans `triggerMotifStep`. Ils finissent sur l'ancienne destination
après une activation STOP/PAUSE ; les prochains déclenchements utilisent la
nouvelle configuration. Aucun flush, changement de délai ou système live ajouté.

## SAVE et SAVE AS

SAVE utilise le fichier associé par le dernier LOAD activé ou SAVE AS réussi.
Sans association, il ouvre SAVE AS. SAVE AS ouvre toujours un dialogue natif,
initialement dans Documents avec un nom dérivé de la configuration. Aucun dossier
imposé ni créé automatiquement pour l'utilisateur. L'extension complète est
ajoutée si absente ; si cette correction vise un fichier existant, un dialogue
confirme son remplacement puisque le dialogue initial concernait un autre nom.

Le main revalide le contenu puis écrit un fichier temporaire exclusif dans le
même répertoire, synchronise son contenu, le ferme et le renomme sur la cible.
Pas de suppression préalable de la cible. Si Windows refuse le remplacement
(fichier verrouillé, droits), l'erreur est affichée ; aucun succès ni nouvelle
association n'est annoncé. Le temporaire est nettoyé après échec normal.
Un arrêt brutal peut laisser un temporaire ; aucune garantie absolue contre une
panne électrique ou les comportements particuliers d'un partage réseau.

L'API preload expose uniquement load/save/saveAs. Le main garde les chemins
autorisés par les dialogues derrière des jetons opaques ; le renderer ne peut pas
fournir un chemin arbitraire. Le sender et la frame principale sont vérifiés.
Une opération de fichier à la fois, boutons désactivés jusqu'au résultat.
Les protections IPC existantes sont conservées. Aucun contenu stocké en localStorage.
L'association de fichier est en mémoire et disparaît à la fermeture ; au prochain
démarrage la configuration de compatibilité reste le point de départ.

## Vérifications automatisées

`npm.cmd test` : format et round trip, 16 Voices et mapping aux extrémités, NONE,
MIDI DRUM, bornes et types des canaux/notes, champs absents ou supplémentaires,
format/version, DEVICE, syntaxe, BOM/Unicode, doublons simples/échappés/imbriqués,
activation atomique et conservation du reste de l'état, refus PLAY, association
de fichier dans SETTINGS (API simulée), annulations/échecs, vrai round trip disque,
remplacement, échec de renommage et nettoyage, refus d'encodage invalide.
Un test exécute la fonction réelle `triggerMotifStep` avec MIDI et temporisateurs
simulés pour vérifier les anciens Note Off et les nouvelles notes après LOAD.

Contrôles syntaxiques main/preload/modules ajoutés et `git diff --check`.
Pas de suite de tests préexistante dans package.json ; le probe de timing matériel
n'est pas exécuté. Les simulations ne remplacent pas un test Electron/hardware.

## Protocole Electron / hardware

1. Démarrer avec `npm.cmd start`. Vérifier SoundCheck et les connexions habituelles.
   Dans SETTINGS, vérifier le nom DrumBrute Impact, les boutons et l'absence de
   fichier associé. VOICE 01–08 : NONE ; VOICE 09–16 : notes
   39, 40, 43, 44, 36, 37, 38, 41, canal 10, DEFAULT.
2. En STOP, créer un Motif avec des événements sur plusieurs Voices, dont VOICE 13
   et une Voice NONE. Relever positions, longueurs et playhead. SAVE sans fichier
   doit ouvrir SAVE AS ; annuler et vérifier qu'aucun fichier n'est associé.
3. SAVE AS vers `DrumBrute-original.lirythme-pads.json`. Vérifier le chemin affiché,
   les 16 Voices et la lisibilité dans Notepad. Copier le fichier en
   `DrumBrute-modifie.lirythme-pads.json`, changer seulement VOICE 13 note 36 → 37.
   Enregistrer en UTF-8 (tester aussi UTF-8 BOM et des noms accentués).
4. LOAD du fichier modifié en STOP. Vérifier le nom, VOICE 13 note 37, et TOUS les
   événements/positions/longueurs/playhead identiques. Jouer le même Motif :
   VOICE 13 déclenche maintenant Snare 1 sur le DrumBrute configuré comme prévu.
   Les événements NONE restent présents et silencieux.
5. PAUSE, Scrub Preview, puis LOAD de l'original. Vérifier le playhead inchangé,
   le retour à note 36, l'absence de note bloquée et le comportement original.
   Répéter avec un preview juste avant activation pour couvrir les Note Off en cours.
6. Pendant PLAY, LOAD du fichier modifié : message de refus d'activation, lecture
   inchangée, fichier courant inchangé. STOP/PAUSE puis refaire LOAD pour l'activer.
7. Depuis des copies, tester canal 17, note 128, note absente, Voice manquante,
   VOICE 17, DEVICE, MIDI BANANA, double VOICE 12 et JSON mal formé. Chaque LOAD
   doit afficher l'erreur dans SETTINGS sans changer configuration, fichier ni Motif.
8. SAVE réécrit le fichier courant. SAVE AS vers un autre nom change l'association
   uniquement après succès. Annuler LOAD/SAVE AS ; vérifier l'état inchangé.
   Tester une cible sans extension et une cible existante après ajout d'extension.
   Tester un emplacement sans droit d'écriture ou une cible verrouillée : erreur
   visible, ancienne cible et association préservées.
9. Recharger l'original, vérifier SoundCheck et jouer le Motif initial. Optionnel :
   fermer/réouvrir puis LOAD d'un fichier sauvegardé pour vérifier sa portabilité.
   La persistance du Motif entre redémarrages n'appartient pas à cette phase.

STOP après ces changements : aucun commit, aucune phase suivante.
