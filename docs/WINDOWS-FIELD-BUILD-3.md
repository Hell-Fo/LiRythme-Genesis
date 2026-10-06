# Windows Field Build #3 — 5 octobre 2026

Version de test Windows x64 : MODULATION, interface PLAY adaptée au petit
écran 1280 × 720, palette sombre commune à SETTINGS et cadrans concentriques.
Le cercle extérieur indique le cycle du Motif ; le cycle de la Voice
sélectionnée occupe 80 % de son rayon. MODULATION dispose du même affichage.
Les positions et longueurs affichées suivent la géométrie temporelle engagée.

Construction après commit : `npm.cmd run build:windows-portable -- 3`.
BUILD-MANIFEST.json identifie le commit et les empreintes SHA-256.
La distribution réutilise Electron et les addons natifs installés, sans
recompiler le moteur natif inchangé.

Copier tout le dossier `LiRythme-Genesis-1.0.0-field3-win32-x64` sur le petit
ordinateur Windows x64, puis lancer `LiRythme-Genesis.exe`. Tous les fichiers
du dossier sont nécessaires ; Node et VS Code ne sont pas requis.
Les données utilisateur restent à leur emplacement habituel et ne sont pas
incluses dans le dossier portable. La distribution précédente est conservée.

Validation avant distribution : 444 tests réussis, syntaxe et diff vérifiés.
Présentation vérifiée dans un aperçu isolé à 1280 × 720, sans accès MIDI.
La construction ne lance ni l'application ni les ports matériels.

À valider sur le petit ordinateur : lisibilité et absence de débordement,
cycles indépendants Motif/Voice et MODULATION, navigation STOP/PLAY,
frontière explicite du Motif, FOCUS et changement de contexte sans rafale.
Voir docs/PLAY-CYCLE-CLOCKS.md dans le dépôt pour les règles des cadrans.
