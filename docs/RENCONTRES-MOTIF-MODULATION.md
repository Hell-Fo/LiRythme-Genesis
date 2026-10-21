# Rencontres Motif / Modulation — idées à reprendre

Note de conception du 20 octobre 2026. Idées consignées à la demande de Daniel ; aucune implémentation engagée. Les propositions restent à préciser.

## Intention

Déclencher un événement musical lorsque Motif et Modulation se rencontrent, pour ponctuer la musique et créer des relances.

Définition proposée d'une rencontre : retour simultané de Motif et Modulation au début de leurs cycles. À confirmer, notamment avec les changements de Motif et les Chains indépendantes.

## Scénarios proposés

| Action | Effet musical |
| --- | --- |
| IMPACT | Note dédiée : crash, grosse caisse renforcée, accord ou basse profonde. |
| TRIGGER | Courte impulsion sur une sortie audio pour déclencher un instrument externe. |
| ACCENT | Renforcer la vélocité de certains Instruments pendant le premier temps ou une mesure. |
| FILL | Appliquer un RATCHET ou une variation rythmique pendant une mesure, puis retrouver le Motif initial. |
| MUTATION TEMPORAIRE | Transformer une occurrence, puis revenir automatiquement à l'original sans modifier le Motif enregistré. |
| SOLO | Isoler un Instrument pendant une mesure, puis retrouver l'ensemble. |
| BREAK | Couper certains Instruments pendant un temps ou une mesure, puis les faire revenir ensemble. |
| RELANCE | Déclencher une note et rétablir l'ensemble après un passage dépouillé. |

Exemple de progression sur quatre rencontres :

1. Accent.
2. Fill.
3. Break d'une mesure.
4. Impact et retour complet.

Autre scénario à explorer : SOLO pendant une mesure, puis retour de tous les Instruments à l'unisson.

## Réglages envisagés

- ACTION : événement à déclencher.
- CIBLE : Instruments ou sortie concernés.
- DURÉE : événement ponctuel, un temps, une mesure ou une occurrence.
- FRÉQUENCE : chaque rencontre, une sur deux, une sur quatre, etc.

Point de départ suggéré, non décidé : IMPACT, FILL et BREAK.

## Questions à reprendre

- Quelles phases définissent la rencontre : cycles globaux, cycles d'Instruments ou autres repères ?
- Le démarrage du transport compte-t-il comme une rencontre ?
- Comment compter les rencontres après un changement de Motif, de Chain ou une pause ?
- Comment définir une mesure selon la résolution et les longueurs du projet ?
- Comment terminer un effet temporaire si Daniel intervient entre-temps sur SOLO, MUTE ou les attributs ?
- Quelle sortie et quelle forme d'impulsion utiliser pour le TRIGGER audio ?
- Quelle surface de commande réserver à ces événements ?
