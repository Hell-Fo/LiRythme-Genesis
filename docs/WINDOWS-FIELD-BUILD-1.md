# Windows Field Build #1 — LiRythme Genesis

## Audit et stratégie

Checkpoint : `1ac5b3075b195496a4e2f958119909730077898a`.
Le projet ne contient aucun packager, installer ni configuration de distribution.
Scripts initiaux : `start` et la suite Node de 236 tests.
Electron installé : **43.2.0**, déclaré `^43.2.0`, verrouillé par package-lock.
Main : `main.js` (CommonJS), preload : `preload.js`, renderer : `index.html`
et `src/app.js` (modules ES chargés directement, sans bundler).
Le preload expose les ponts IPC ; le renderer n'a pas besoin de Node.

Choix pour ce test : distribution manuelle Electron, en dossier portable Windows
x64, sans ASAR, nouvelle dépendance, installer ou téléchargement.
Cette [méthode officielle](https://github.com/electron/electron/blob/main/docs/tutorial/application-distribution.md)
préserve les chemins du utility process, du worker et des addons.
`npm.cmd run build:windows-portable` copie la distribution Electron installée,
les fichiers runtime et la fermeture transitive des dépendances de production.
Le dossier cible doit être absent : une ancienne build n'est jamais écrasée.

Runtime : `@julusian/midi` 3.8.1 (Node-API v7, prebuild Windows x64),
`pkg-prebuilds`, `tslib`, `node-addon-api` 6.1.0 ; addon local
`native/timing/build/Release/lirythme_timing.node` (Node-API, backend Win32,
runtime C++ statique en Release). Le binaire local doit être compilé avant le
packaging ; cette build réutilise le binaire présent et vérifie son chargement.
Dev uniquement : Electron, node-gyp 12.4.0, TypeScript 7.0.2.
Assets : `index.html`, tout `src/`, `assets/` (actuellement vide),
`docs/examples/DrumBrute Impact.lirythme-pads.json` (preset initial).
Les scripts de test/probe, le dépôt Git et les outils de compilation sont exclus.

## Persistence et MIDI

Identité conservée : `lirythme-genesis` ; aucun changement de format/migration.
Motifs : `app.getPath("userData")/motif-bank.json`, soit normalement
`%APPDATA%\lirythme-genesis\motif-bank.json`.
Préférences Pad : même dossier, `pad-configuration-preferences.json`.
Préférences renderer (MIDI, Focus, Help) : localStorage Chromium dans le profil
utilisateur Electron, hors des ressources de l'application.
Journal Chromium : `userData/electron.log` ; les logs Electron utilisent
`app.setAppLogsPath()`. Le `debug.log` historique de la distribution locale
est exclu de la copie. Cette correction concerne uniquement les diagnostics.
Bibliothèque Pad : `app.getPath("documents")\LiRythme\Pad Configurations`.
Documents peut être redirigé par Windows/OneDrive : le chemin Windows est respecté.
Un import copie le preset dans cette bibliothèque ; le preset embarqué est lu
uniquement pour initialiser la bibliothèque. Rien n'est écrit dans `resources/`
ou Program Files. Une copie du dossier portable ne copie pas ces données.

Le renderer appelle `initialize({ webMidiEnabled: false, nativeBridge })`.
Le MIDI actif passe par IPC, utilityProcess, `@julusian/midi` et le worker de
timing ; aucune permission WebMIDI, SysEx ou flag Chromium supplémentaire
n'est nécessaire. La branche WebMIDI est dormante ; son activation future
nécessiterait une vérification des permissions Electron et des tests matériels.
Les drivers MIDI habituels restent nécessaires sur le PC cible.

## Copier et lancer sur le petit PC

Windows x64 requis. Copier **tout** le dossier
`dist\LiRythme-Genesis-1.0.0-field1-win32-x64` sur le petit PC (par exemple
Documents ou une clé USB), puis double-cliquer `LiRythme-Genesis.exe`.
Ne pas copier seulement l'exécutable ; conserver DLL, locales et resources.
Aucun VS Code, Node, npm ou compilation n'est nécessaire pour lancer.
Pas d'installer, d'auto-update ni signature ajoutés pour ce test privé.

Brancher Launchpad et instrument MIDI, fermer les autres applications qui
occupent leurs ports. Vérifier SETTINGS/SOUNDCHECK, sélectionner les ports,
vérifier pads/LED, notes, Start/Stop et horloge. Créer un Motif et une Pad
Configuration, fermer normalement et rouvrir ; vérifier leur restauration.
La précision musicale sur le petit PC reste à mesurer pendant le Field Test.

## Validation locale

Validation du 17 septembre 2026 :

- Deux lancements du véritable exécutable packagé (`app.isPackaged === true`),
  depuis un autre répertoire, avec sortie normale code 0 à chaque fermeture.
- Profil et Documents de test isolés sous `dist/field-smoke-WFVLbo`, injectés
  avant le main par le débogueur ; aucun fichier runtime de la build modifié.
  Commande : `node scripts/test-windows-portable.mjs` (hors sandbox Windows).
- Restauration du Motif (événement et longueur de voix 7, affichage `7 STEPS`),
  de la Pad Configuration créée depuis l'UI et de la préférence Focus.
- Launchpad Mini détecté : ouverture effective de ses ports input/output.
- Note On/Off reçus sur loopMIDI depuis le renderer via IPC/utility/worker.
  Addon de timing chargé, priorité du thread et sommeil précis exécutés.
- Intégrité SHA-256 de tous les fichiers de la build et liste des fichiers
  inchangées après deux exécutions : aucune écriture dans le dossier portable.
- Suite complète : **236/236**, syntaxe JS/MJS/CJS et `git diff --check`.

Le sandbox de l'agent bloquait GPU/Crashpad ; le test hors sandbox n'a produit
aucune erreur de chargement natif ni de fermeture. Le profil vierge affiche
normalement une configuration MIDI mémorisée incomplète avant choix des ports.
L'ouverture du Launchpad ne valide pas les gestes physiques ou les LED à l'œil.
Ces gestes, le son de l'instrument et la précision d'horloge sur le petit PC
restent à vérifier par Dan. Aucune refonte ni modification du moteur musical.

Le manifeste `BUILD-MANIFEST.json` contient les empreintes SHA-256 du runtime.
Cette build transporte le binaire natif local déjà compilé ; une reconstruction
sur une nouvelle machine de développement exige les outils C++ pour cet addon,
mais pas le PC qui exécute le dossier portable.
**Aucun commit, aucun push. STOP pour Field Test par Dan.**
