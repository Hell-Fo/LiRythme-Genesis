# Voix Audio

Validation utilisateur : fonctionnement des voix Audio confirmé à l'écoute
après l'implémentation (« one shot deal, c'est parfait »).

Dans Settings, charger ou créer un preset, sélectionner une voix puis choisir
le type **Audio**, la sortie **Left** ou **Right**, et un fichier `.wav`.
SAVE conserve le chemin du fichier et le routage dans le preset. Les fichiers
audio restent externes : les déplacer nécessite de les sélectionner à nouveau.
L'édition est autorisée en STOP/PAUSE, verrouillée pendant PLAY.

Chaque événement déclenche le sample entier, sans boucle. Plusieurs occurrences
peuvent se superposer. La vélocité règle le gain (127 = gain unitaire). Un WAV
stéréo est réduit en mono par moyenne des canaux, puis envoyé exclusivement
à gauche ou à droite de la sortie audio système par défaut. COLOR ne change pas
le sample. Aucun message MIDI n'est émis pour une voix Audio.

Le chargement et le décodage sont effectués en amont; aucun accès disque ni
décodage n'est lancé au déclenchement d'une note. Settings indique le chargement,
la disponibilité ou l'erreur. Une voix non prête reste silencieuse : ses notes
ne sont pas rejouées en retard. Les fichiers WAV RIFF jusqu'à 64 Mo sont acceptés
si leur encodage est décodable par Chromium. STOP/PAUSE coupe les samples actifs.

Le déclenchement utilise les mêmes événements de lecture que MIDI : cycles
individuels, SOLO/MUTE, vélocité et instant d'application différé de Rotation.
Les pads instruments fournissent également le retour visuel des événements Audio.

Le moteur utilise Web Audio et la sortie système; il ne propose pas encore
de sélection de périphérique audio, d'ASIO ou de compensation de latence MIDI/audio.
Cette validation d'usage ne constitue pas une mesure de latence MIDI/audio.

Références : [décodage Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData)
et [routage des canaux](https://developer.mozilla.org/en-US/docs/Web/API/ChannelMergerNode).
