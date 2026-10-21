# Optimisations appliquées — 20 octobre 2026

Suite à [l'audit](AUDIT-OPTIMISATION-2026-10-20.md). Les modifications locales antérieures, notamment Chain, CYCLE, MIDI CC et les couleurs GATE, sont conservées. Aucun changement de grille musicale ni retour du zoom MICROTIMING.

## Résultats logiciels

| Sujet | Modification | Vérification |
| --- | --- | --- |
| Fermeture | Tous les appels `flush()` partagent la promesse du vidage complet, même si une édition arrive entre deux résolutions de promesses. Le main attend aussi sa file de stockage avant fermeture. | Deux écritures retardées séparément ; édition dans la microtâche de fin ; erreurs et nouvelle tentative dans les tests existants. |
| Note Off | Registre des notes par port/canal/pitch, commun aux Steps et aux Voices. Une génération est libérée avant le Note On suivant ; son ancien timer devient sans effet. | GATE 100 %, MIDI DRUM, Voice partageant une note, changement de port/canal, arrêt et drainage des anciens timers. |
| Sauvegarde | Suppression du clonage préalable de tout le Book et des validations/clonages répétés avant la validation des banques de projets. Chaque banque de sortie demeure validée et indépendante. | Exclusion des valeurs A/T provisoires, indépendance des projets et de la banque active, rejet des métadonnées invalides, tests de restauration existants. |
| GATE | Palette stable et affectations de texte/couleur uniquement quand leur valeur change. | 1 001 rendus inchangés : une seule affectation du texte et de la couleur, contre 1 001 auparavant. |
| GROOVE MORPH | Cache réutilisé dès le Step zéro, invalidé par l'entrée réelle ou le changement de contexte. | Les sources modifiées n'affectent pas l'occurrence déjà engagée ; elles sont prises en compte à l'entrée suivante. |
| Routage A/T | Extraction du gestionnaire dans `LaunchpadATInput.mjs`, sans changement des gestes. Son seuil d'appui long est partagé avec le contrôleur. | Suite des gestes et priorités existante, dont SHIFT relâché avant le pad, Chain, COPY/DELETE et Projets. |
| MIDI indisponible | File du main limitée à 256 commandes ; LED fusionnées par pad ; dernier état de configuration/transport conservé. Les messages musicaux ne sont pas mis en attente avant disponibilité ; après échec, les commandes ne s'accumulent pas. | Surcharge, refus explicite des requêtes excédentaires, 1 000 commandes après échec, absence de vieux Note On à rejouer. |
| Livraison | Chemin de portable obligatoire pour le smoke test ; commande qui vérifie sa provenance, sa correspondance avec les sources et assets actuels, puis lance tests et smoke test. Le manifeste inclut l'état Git local. | Vérifications de syntaxe et refus des commandes sans chemin. Nouveau portable non construit/testé pendant ce lot. |

Suite complète : **692 tests réussis, aucun échec**. Les tests de dispatch qui retardaient tous les Note Off jusqu'à la fin du scénario vérifient désormais aussi les libérations anticipées au retrigger : autant de Note Off que de Note On, par port/canal/pitch. Leurs assertions d'événements musicaux comptent explicitement les Note On.

## Mesure de sauvegarde

Même jeu synthétique que dans l'audit : 16 Motifs, 16 Voices × 32 Steps, événements actifs et matrices VELOCITY/COLOR/SWING/RATCHET complètes, puis 16 projets. Cinq passages sous Node, hors IPC et écriture disque.

| Snapshot | Médiane audit | Médiane après modification |
| --- | ---: | ---: |
| Banque seule | 1,60 ms | 1,18 ms |
| Book de 16 projets denses | 151,52 ms | 21,29 ms |

Le document reste de **3 768 925 octets**. Réduction observée de la médiane du scénario dense : environ **86 %**. Ce sont des mesures locales ; elles ne constituent pas une mesure du jitter MIDI et varieront avec la machine et le contenu. Une tâche d'environ 21 ms peut encore dépasser la durée d'une image : un profilage Electron reste utile avant de décider d'une nouvelle optimisation.

Reproduction :

```powershell
npm.cmd run benchmark:persistence
npm.cmd test
```

Le benchmark est séparé des tests : aucun seuil de durée dépendant de la machine ne fait échouer la suite.

## Propriété des gestes conservée

| Contexte | Geste | Propriétaire et résultat |
| --- | --- | --- |
| Page PLAY, Book A/T | SHIFT + pad Book | Parcours A/T, y compris lorsque Chain est active. Aucun Loop Point sur cette surface. |
| Bibliothèque, Chain, STOP/PAUSE | SHIFT + clic court sur le Motif de l'occurrence sélectionnée | Place ou retire le Loop Point. |
| Bibliothèque, Chain pendant la lecture | SHIFT + clic court sur le Motif courant, sans flèche | Place ou retire le Loop Point ; le pad du Loop Point existant permet son retrait. |
| Bibliothèque, Chain pendant la lecture | Maintenir SHIFT + pad du bloc actif/suivant, puis << / >> | Déplace l'occurrence ; les flèches annulent l'intention de Loop Point pour ce geste. |
| Mode Projets | Gestes capturés par le contrôleur de Projets | Ne traversent pas le routage musical ordinaire. |
| COPY/DELETE ou entrée déjà consommée | Relâchement du geste | Reste associé au propriétaire initial, même si SHIFT a été relâché auparavant. |

## Politique de retrigger MIDI

Deux Voices qui utilisent le même port, canal et pitch partagent désormais explicitement la même note physique. La répétition libère la génération précédente avant le nouveau Note On. Les autres ports, canaux et pitches restent indépendants. Le Note Off conserve le routage capturé au déclenchement, même si la configuration change entre-temps.

STOP/PAUSE annulent les futurs déclenchements selon le mécanisme existant. Les Note Off encore nécessaires continuent d'être émis ; les callbacks appartenant aux générations déjà libérées sont sans effet. Cette politique doit être vérifiée à l'écoute sur le synthétiseur, particulièrement à GATE 100 % et avec plusieurs Voices partageant un pitch.

## Commandes de livraison

```powershell
npm.cmd run build:windows-portable -- <numero-build>
npm.cmd run validate:release -- "C:\chemin\vers\le\portable"
```

Le numéro choisi doit disposer de sa fiche `docs/WINDOWS-FIELD-BUILD-<numero>.md`, conformément au mécanisme existant. Le build crée un nouvel artefact et ne remplace pas implicitement un précédent portable. La validation refuse un ancien manifeste sans provenance ou un artefact dont les sources/assets ne correspondent plus au workspace. Un succès de cette commande inclut le smoke test Electron, pas un test des ports MIDI physiques.

## Retour de validation matérielle

Le 20 octobre 2026, Daniel confirme après essai : « le côté hardware semble très bien fonctionner », sans problème rencontré. Ce retour valide le fonctionnement observé sur son matériel après les optimisations.

Les scénarios précis et la durée de l'essai ne sont pas détaillés ; aucune mesure physique de jitter n'est revendiquée. La construction et la validation d'un nouveau portable restent à effectuer.

**Retour complémentaire le même jour :** Daniel signale ensuite des notes KEY GROUP suspendues dans Chain et avec Modulation, sans CLOCK OUT. Une inversion Note Off/Note On a été reproduite dans la file du worker et corrigée ; voir [l'investigation et ses tests](NOTE-OFF-CHAIN-MODULATION-2026-10-20.md). Après un nouvel essai, Daniel confirme : « ça semble bon! ». Le retour matériel après correction est concluant sur la configuration signalée.

### Scénarios de référence pour les prochaines validations

Conserver les scénarios suivants pour les prochaines validations ciblées :

- KEY GROUP à GATE 100 %, notes successives identiques et Voices partageant un pitch.
- RATCHET/SWING avec horloge interne puis MIDI externe ; écoute des notes et capture de F8 séparées.
- Polymétrie 4/7/5/32 pendant des éditions et sauvegardes de projets.
- Chain avec occurrences répétées, clic court Loop Point et déplacement avec flèches.
- Utilitaire/USB indisponible puis reconnexion ; absence de rafale de vieilles notes.
- Portable construit depuis ces sources, restauration et fermeture pendant sauvegarde.

Le routage A/T a été extrait, mais le découpage complet du rendu LED et du mode Projets n'est pas entrepris ici. Il reste une amélioration progressive de maintenabilité, à traiter indépendamment des gains mesurés. Les paramètres du worker d'horloge et la file LED différée restent ceux déjà validés matériellement.
