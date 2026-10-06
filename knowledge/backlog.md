# Charging Planning — Backlog

## Fait

- Moteur de planification en TypeScript strict (`libs/planner`) : allers-retours, accompagnateurs, véhicules, attente/retour, enchaînements, recharges (travail, superchargeurs à tarifs horaires, journée au travail, recharges manuelles), fenêtre glissante de 7 jours.
- Interface Nuxt en mode démonstration (foyer fictif).
- CI/CD, images GHCR, déploiement Terraform sur le Raspberry Pi.

## Étape 2 — multi-foyers

1. Connexion Google (OIDC + `calendar.readonly`, accès hors ligne), sessions en base, cookie `sid`.
2. Foyers et invitations ; personnes du foyer (adultes, enfants, hors foyer) ; association agenda → personne.
3. Lecture des agendas Google par compte, géocodage des adresses (cache), itinéraires routiers (cache).
4. Liaison Tesla (OAuth Fleet API, région EU, clé publique servie sur `/.well-known/appspecific/com.tesla.3p.public-key.pem`), lecture sans réveil.
5. Corrections et règles du foyer enregistrées côté serveur (aujourd'hui dans le navigateur).

## Étape 3

- Notifications (« branchez la voiture au bureau aujourd'hui »).
- Pilotage de la limite de charge Tesla (scope Vehicle Commands).
- Vue « un jour » pour téléphone.
