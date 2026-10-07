# Charging Planning — Architecture

> Planifier la recharge d'un véhicule électrique à la semaine, à partir des agendas du foyer : qui se déplace, quand, avec quel véhicule, et où recharger au moindre coût sans jamais tomber en panne.

## 1. Principes

- **DÉCIDÉ** Multi-foyers : chaque foyer se connecte avec Google (identité + accès aux agendas) et relie son véhicule (API Tesla Fleet).
- **DÉCIDÉ** Gratuit pour le foyer fondateur : aucun service payant sur le chemin critique. L'API Tesla est facturée à l'usage avec un crédit mensuel de 10 $ par compte développeur ; on ne réveille jamais la voiture.
- **DÉCIDÉ** Le moteur de planification est pur et sans dépendance (`libs/planner`) : il prend un foyer, des événements, des réglages et rend un plan. Il tourne dans le navigateur (la fenêtre glissante dépend de « maintenant ») et pourra tourner côté serveur pour les notifications.
- Pas de données personnelles dans le dépôt : seules les données du foyer de démonstration (fictif) sont versionnées.

## 2. Découpage

| Chemin           | Rôle                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/planner`   | Moteur : événements → allers-retours (qui conduit, quel véhicule), simulation de batterie, choix des recharges, tarifs horaires, fenêtre glissante de 7 jours |
| `libs/contracts` | Schémas zod des échanges API ↔ web (source unique des DTO)                                                                                                    |
| `libs/tooling`   | tsconfig, eslint, vitest partagés                                                                                                                             |
| `components/web` | Nuxt 4 SSR : calendrier, courbe de batterie, recharges, corrections                                                                                           |
| `components/api` | NestJS 11 sur Fastify, Kysely + Postgres, migrations SQL brutes                                                                                               |

## 3. Modèle

- `household` : un foyer ; créé à la première connexion de son fondateur. `settings` (JSON validé par `householdSettingsSchema`) : adresse et coordonnées du domicile, personnes, agendas Google de chaque personne.
- `account` : une personne connectée avec Google (`google_sub` unique), membre d'un foyer.
- `google_credential` : jeton de rafraîchissement Google du compte (accès hors ligne en lecture aux agendas), **chiffré** (AES-256-GCM, `TOKEN_ENCRYPTION_KEY`), et droits accordés.
- `session` : cookie httpOnly `sid` ; seule l'empreinte SHA-256 du jeton est stockée ; 30 jours.
- `geocode_cache`, `route_cache` : réponses de Nominatim (adresse → coordonnées) et d'OSRM (trajet routier), partagées par tous les foyers ; une adresse n'est jamais cherchée deux fois.
- À venir : `vehicle_link` (véhicule Tesla, jetons chiffrés), réglages du foyer (véhicules, bornes, règles, corrections) côté serveur.

### Agendas

- `GET /api/household/calendars` : agendas Google des comptes du foyer. `PUT /api/household` : domicile (géocodé à l'enregistrement) et personnes, chacune avec ses agendas.
- `GET /api/household/agenda` : événements des 8 prochains jours, lus en direct (jamais stockés), dans le fuseau du foyer (`Europe/Paris`). Ne deviennent des trajets que les événements confirmés, à heure fixe et avec une adresse (pas les événements sur la journée, sans lieu ou en visio). Une adresse à moins de 200 m du domicile est le domicile ; une adresse introuvable est listée à part (`unresolved`) et l'événement ignoré.
- Nominatim est appelé au plus une fois par seconde (politique d'usage), avec un `User-Agent` identifiant l'application ; si OSRM ne répond pas, le moteur se replie sur la distance à vol d'oiseau × 1,3.
- Côté web, un foyer configuré (domicile + au moins un agenda) remplace le foyer de démonstration ; les corrections restent dans le navigateur, séparées par foyer, jusqu'à leur passage côté serveur.

### Connexion Google

**DÉCIDÉ** Application OAuth « externe », publiée en production sans vérification (avertissement « application non vérifiée », 100 utilisateurs au plus) : en mode test, Google ferait expirer l'accès aux agendas tous les 7 jours.

1. `GET /api/auth/google` : redirection vers Google (code d'autorisation + PKCE, `state`), droits `openid email profile calendar.readonly`, accès hors ligne ; le vérificateur PKCE et le `state` voyagent dans un cookie chiffré de 10 minutes.
2. `GET /api/auth/google/callback` : échange du code, contrôle du jeton d'identité (émetteur, audience, expiration, e-mail vérifié), création du compte et de son foyer à la première connexion, stockage chiffré du jeton de rafraîchissement, ouverture de la session. Sans jeton de rafraîchissement connu, nouvelle demande avec l'écran de consentement.
3. `GET /api/me` (session requise), `POST /api/auth/logout`.

Le web relaie `/api` vers l'API sans suivre les redirections (`server/middleware/api-proxy.ts`) : les redirections OAuth arrivent au navigateur.

## 4. Flux de planification

1. Les événements de la fenêtre (aujourd'hui + 6 jours) sont placés par jour (`buildWeek`).
2. `infer` reconstruit les allers-retours depuis le domicile : enchaînements, attentes sur place, dépôts/récupérations des enfants, accompagnateur, véhicule (sans double réservation).
3. `planWeek` simule la batterie trajet par trajet et, à chaque passage sous la réserve (km jusqu'à la borne la plus proche), ajoute ou complète la recharge la moins chère : borne du travail, superchargeur selon sa grille horaire, journée au travail.
4. Les corrections de l'utilisateur (accompagnateur, véhicule, attendre/rentrer, recharges manuelles) sont des données d'entrée du moteur.
