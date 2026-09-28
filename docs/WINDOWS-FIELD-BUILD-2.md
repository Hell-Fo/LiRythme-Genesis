# Windows Field Build #2 — 28 septembre 2026

Version de test hardware : DOUBLE contextuel, COLOR, édition A/T sur événements
existants, navigation contextuelle et feedback Timeline, préécoute par flèches.

Compiler après commit : `npm.cmd run build:windows-portable -- 2`.
Le manifeste BUILD-MANIFEST.json identifie le commit et les empreintes SHA-256.
La distribution réutilise Electron et les addons natifs installés, sans
recompiler le moteur natif inchangé.

Copier tout le dossier `LiRythme-Genesis-1.0.0-field2-win32-x64` sur le PC
Windows x64, puis lancer `LiRythme-Genesis.exe`. Conserver tous les fichiers
du dossier ; Node et VS Code ne sont pas nécessaires sur le PC cible.
La build précédente est conservée. Les données utilisateur gardent leur
emplacement habituel ; elles ne sont pas incluses dans ce dossier portable.

Daniel a validé la préécoute en STOP sur DrumBrute et sur Bespoke avec son
moteur audio en PLAY. La pause audio de Bespoke empêchait l'écoute immédiate
et était associée à une rafale au redémarrage de Bespoke seul.

Cette nouvelle distribution reste à tester dans le setup hardware : sélection
des ports, navigation en STOP, reprise PLAY, feedback A/T, COLOR et DOUBLE.
La compilation ne lance pas l'application et ne sollicite pas les ports MIDI.
