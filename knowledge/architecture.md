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

## 4. Moteur : une machine d'état de ressources

**DÉCIDÉ** Le moteur simule la journée comme une machine d'état. Les **entités** sont les personnes (conductrices ou non) et les véhicules du foyer. Les **occurrences** de l'agenda imposent la présence de leurs participants à un lieu pendant un créneau. Les **trajets** déplacent un groupe {véhicule, conducteur, passagers} d'un lieu à un autre ; une **recharge** est un événement du véhicule sur une borne.

### Invariants

1. Une entité n'est jamais réservée deux fois en même temps (événement, trajet, attente, stationnement).
2. Une entité part toujours de l'endroit où elle se trouve ; tout le monde part de la maison et y rentre le soir.
3. Un véhicule du foyer est toujours conduit par une personne conductrice ; les autres voyagent comme passagers.
4. La batterie ne descend jamais sous la réserve.

`violations()` (`libs/planner/src/timeline.ts`) vérifie les trois premiers indépendamment de la construction ; la simulation de batterie vérifie le quatrième.

### Données

- **Personnes** : nom, conducteur ou non. **Agendas** : chacun lié à une ou plusieurs personnes (un agenda « Famille » à tout le foyer, un agenda « Enfants » aux enfants).
- **Occurrence** : un événement de l'agenda, une seule fois quel que soit le nombre d'agendas où il apparaît (invitations, agendas partagés) ; ses **participants** sont l'union des personnes de ces agendas.
- L'affichage montre les occurrences réelles ; seul le moteur raisonne en présences et en trajets.

### Planification

**DÉCIDÉ** Les déplacements se planifient **jour par jour** (tout le monde dort à la maison) et **indépendamment de la batterie** : l'énergie ne change pas les trajets. La recharge vient ensuite, sur la semaine, à partir de la consommation de chaque jour.

1. **Présences** (`presences.ts`) : les occurrences de chaque participant ; deux occurrences proches au même lieu n'en font qu'une. Entre deux présences d'une personne, un **lien** : enchaîner ou repasser par la maison (automatique selon le temps disponible, règle du foyer ou correction).
2. **Déplacements** (`journeys.ts`) : les mouvements nécessaires de chaque personne (maison → présence, présence → présence, présence → maison), regroupés quand les mêmes personnes vont du même lieu au même lieu à la même heure (± 15 min).
3. **Dispatch** (`dispatch.ts`, `choices.ts`) : dans l'ordre du temps, chaque déplacement reçoit un conducteur et un véhicule _libres et présents au bon endroit_ d'après le registre (`ledger.ts`) :
   - correction de l'utilisateur, sinon un conducteur qui voyage de toute façon (il emmène les autres : la voiture reste stationnée sur place pendant l'occurrence), sinon une règle du foyer (un ami), sinon un conducteur libre qui vient les chercher ;
   - après une dépose, l'accompagnateur attend sur place si la récupération arrive plus tôt qu'un aller-retour à la maison (lien « attente », corrigeable), sinon il rentre ;
   - un départ attend que tout le groupe soit libre ; un retard de plus de 10 minutes, une occurrence manquée, une absence de conducteur ou de voiture deviennent des **incohérences** affichées.
4. **Recharge** (`charging.ts`, `planner.ts`) : la voiture suivie peut charger quand elle est **stationnée** près d'une borne, ou au superchargeur quand elle est **libre à la maison** ; à chaque passage sous la réserve, le planificateur ajoute ou complète la recharge la moins chère.

### Vues

- **Calendrier** : les occurrences réelles (un bloc avec ses participants) et les couloirs des véhicules (trajets, stationnements, recharges).
- **Liste** : par jour, les trajets (véhicule, conducteur, passagers), les liens (↩ retour maison, → enchaîne, ⏸ attend) et les incohérences.
- **Chronologie** : une ligne par personne et par véhicule, l'état heure par heure (maison, événement, trajet, attente, stationnée, en charge).
