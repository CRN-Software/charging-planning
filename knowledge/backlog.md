# Charging Planning — Backlog

## Fait

- Moteur de planification en TypeScript strict (`libs/planner`) : allers-retours, accompagnateurs, véhicules, attente/retour, enchaînements, recharges (travail, superchargeurs à tarifs horaires, journée au travail, recharges manuelles), fenêtre glissante de 7 jours.
- Interface Nuxt en mode démonstration (foyer fictif).
- CI/CD, images GHCR, déploiement par le deployer du serveur (Postgres partagé, site HTTPS).
- Connexion Google (OIDC + `calendar.readonly` hors ligne), sessions en base, foyer créé à la première connexion, page de confidentialité.
- Agendas réels : domicile, personnes et agendas associés ; événements des 8 jours à venir ; géocodage (Nominatim) et trajets (OSRM) en cache.

## Étape 2 — multi-foyers

1. Invitations : un second adulte rejoint le foyer et y apporte ses agendas.
2. Liaison Tesla (OAuth Fleet API, région EU, clé publique servie sur `/.well-known/appspecific/com.tesla.3p.public-key.pem`), lecture sans réveil : batterie, charge et **position**, comparée au lieu où les agendas placent le véhicule.
3. Véhicules, bornes (dont celle du travail), règles et corrections du foyer enregistrées côté serveur (aujourd'hui dans le navigateur).

## Étape 3

- Notifications (« branchez la voiture au bureau aujourd'hui »).
- Pilotage de la limite de charge Tesla (scope Vehicle Commands).
- Vue « un jour » pour téléphone.
