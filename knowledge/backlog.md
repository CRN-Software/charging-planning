# Charging Planning — Backlog

## Fait

- Moteur de planification en TypeScript strict (`libs/planner`) : allers-retours, accompagnateurs, véhicules, attente/retour, enchaînements, recharges (travail, superchargeurs à tarifs horaires, journée au travail, recharges manuelles), fenêtre glissante de 7 jours.
- Interface Nuxt : écran de connexion seul hors session ; vues calendrier, liste et chronologie par ressource.
- CI/CD, images GHCR, déploiement par le deployer du serveur (Postgres partagé, site HTTPS).
- Connexion Google (OIDC + `calendar.readonly` hors ligne), sessions en base, foyer créé à la première connexion, page de confidentialité.
- Agendas réels : domicile, personnes (conducteur ou non), agendas reliés à une ou plusieurs personnes ; une occurrence par événement ; géocodage (BAN, Nominatim) et matrice de trajets (OSRM) en cache.
- Moteur en machine d'état de ressources : tournées de dépose, attente sur place, ramassages groupés.
- Véhicules, bornes (dont celle du travail, rattachée au lieu d'agenda voisin), réserve, et semaine corrigée (batterie relevée, conducteurs, attentes, ajouts) enregistrés côté serveur et partagés par le foyer.

## Étape 2 — multi-foyers

1. Invitations : un second adulte rejoint le foyer et y apporte ses agendas.
2. Liaison Tesla (OAuth Fleet API, région EU, clé publique servie sur `/.well-known/appspecific/com.tesla.3p.public-key.pem`), lecture sans réveil : batterie, charge et **position**, comparée au lieu où les agendas placent le véhicule.
3. Règles d'accompagnement récurrentes et routines de recharge configurables (aujourd'hui vides pour un foyer connecté).

## Étape 3

- Notifications (« branchez la voiture au bureau aujourd'hui »).
- Pilotage de la limite de charge Tesla (scope Vehicle Commands).
- Vue « un jour » pour téléphone.
