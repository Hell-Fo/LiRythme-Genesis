# Notes KEY GROUP suspendues — Chain et Modulation

## Retour matériel

Le 20 octobre 2026, après le premier retour positif sur les optimisations, Daniel signale des notes parfois suspendues aux changements de Motif dans Chain et lorsque Modulation est appliquée. Précisions : Voices **KEY GROUP**, **aucune sortie CLOCK OUT**.

## Défaut reproduit

La protection ajoutée dans `app.js` ordonne les générations de notes côté renderer. Elle ne suffisait pas à garantir cet ordre jusqu'au port MIDI : le worker séparait les messages ordinaires des Note Off et vidait systématiquement ces derniers en premier.

Si un Note On et son extinction sont tous deux en attente avant le prochain tour d'envoi, le worker pouvait produire :

```text
Reçu : Note On 60 → Note Off 60
Émis : Note Off 60 → Note On 60
```

La note est ainsi allumée après son extinction. Un changement de pitch dans Chain ou par Modulation peut la laisser suspendue, puisqu'aucun autre événement ne vient nécessairement l'éteindre.

L'absence de CLOCK OUT n'exclut pas ce chemin : `MidiClockUtility.getDesiredWorkerDestination()` utilise la sortie de notes principale lorsqu'aucune destination d'horloge n'est choisie. La reproduction couvre aussi le worker lorsque son horloge de sortie est inactive.

Ce défaut logiciel est établi ; la correspondance avec chaque incident entendu reste à confirmer par un nouvel essai matériel.

## Correction

Dans `MidiClockWorker.cjs`, un Note Off garde une référence au dernier Note On antérieur encore en attente sur le même canal et pitch. Le worker transmet la file ordinaire dans son ordre jusqu'à ce Note On avant d'émettre son extinction. Un Note Off sans dépendance conserve sa priorité.

Les références internes sont retirées des messages remis au driver. Les événements de canaux/pitches différents ne sont pas confondus. Les previews invalidées peuvent être supprimées sans bloquer leur extinction. La limite de file, la marge de 2 ms avant les pulses et le mécanisme de garde avant chaque envoi restent inchangés.

Aucun All Notes Off global ni extinction forcée à chaque changement de Motif n'est ajouté : les durées et les fins de notes restent celles du jeu musical.

## Vérification

Les tests exécutent le **worker complet** avec une sortie MIDI simulée et observent les messages réellement remis au driver simulé, pas uniquement ceux produits par le renderer.

- Note On/Off reçus avant un tour de sortie, horloge inactive puis active.
- Répétition On/Off/On et priorité d'une extinction indépendante.
- Accord sur les 16 canaux, ordre des Voices et vrais messages Note Off `0x80`.
- File pleine de 256 messages : 128 paires de déclenchement/extinction.
- Extinction d'une note déjà transmise avant sa répétition.
- Preview invalidée sans blocage de l'extinction.
- KEY GROUP dans Chain avec changement de pitch, horloge interne puis MIDI, Modulation inactive puis active ; Modulation KEY GROUP et RATCHET.

Sur le worker du commit de référence `c40abb0`, ces dix tests donnent **9 échecs / 1 réussite**. Avec le correctif : **10 réussites**. La suite complète donne **702 tests réussis, aucun échec**.

Commande ciblée :

```powershell
node --test scripts/test-note-off-delivery.mjs
```

## Retour matériel après correction

Le 20 octobre 2026, Daniel indique après le nouvel essai : « ça semble bon! ». Le retour est concluant sur la configuration signalée, KEY GROUP sans CLOCK OUT, après correction de l'ordre d'envoi. Aucune nouvelle note suspendue n'est signalée dans ce retour ; il ne constitue pas une mesure physique de jitter ni un essai d'endurance documenté.

### Scénario de référence

Pour les prochaines validations, reprendre la configuration signalée : KEY GROUP sans CLOCK OUT, même Chain, d'abord sans Modulation puis avec le Motif de Modulation. Vérifier les changements de pitch et laisser jouer plusieurs passages.
