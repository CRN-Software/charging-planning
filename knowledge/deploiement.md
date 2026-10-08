# Charging Planning — Déploiement

```
PR ──▶ pull-request.yml ── titre en commit conventionnel
                        └─ ci.yml : format · lint · typecheck · tests · build · images docker · terraform validate · actionlint
merge sur main ──▶ release.yml
   ci ─▶ semantic-release (tag vX.Y.Z, seulement pour feat/fix/perf/breaking)
        └─▶ images multi-arch (arm64 + amd64) → ghcr.io/crn-software/charging-planning/{api,web} (publiques)
              └─▶ deploy.yml : demande de déploiement (API Deployments de GitHub) pour vX.Y.Z
```

Squash-merge des PR : le titre devient le commit analysé par semantic-release.

## 1. Cible

Le serveur de la maison, décrit par [`Plokkke/home-platform`](https://github.com/Plokkke/home-platform) (`docs/architecture.md`). Son **deployer** lit les demandes de déploiement de ce dépôt, applique `infrastructure/terraform/server` à la version demandée, vérifie `health_url` et publie le statut dans l'onglet **Deployments**. GitHub ne contacte jamais le serveur et ne détient aucun secret de déploiement.

La pile crée :

- la base `charging_planning` et son rôle sur le **Postgres partagé** (provider `postgresql`, rôle `terraform` fourni par le deployer) ; l'API la joint par le réseau Docker `postgres` ;
- les conteneurs `charging-planning-api` (non publié) et `charging-planning-web` (`127.0.0.1:18090`), reliés par le réseau `charging-planning` ; le web relaie `/api` et `/.well-known/appspecific` vers l'API (`components/web/server/middleware/api-proxy.ts`) ;
- le site `https://charging-planning.crn-tech.fr` sur le nginx de l'hôte (`register-service.sh`, certificat compris).

État Terraform : schéma `charging_planning` de la base `tf_backend`.

## 2. Déployer, revenir en arrière

| Besoin                           | Comment                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Déployer une release             | automatique : `release.yml` appelle `deploy.yml` avec la nouvelle version                                                      |
| Changement d'infrastructure seul | automatique : un push sur `main` dans `infrastructure/terraform/server/**` redéploie la version en place avec la nouvelle pile |
| Revenir en arrière               | `gh workflow run deploy -f version=<précédente>` (ou _Run workflow_ dans l'onglet Actions)                                     |

Avant chaque déploiement, le deployer fait un dump de `charging_planning` (output `backup_databases`). Les migrations SQL restent compatibles avec la version précédente.

## 3. Variables d'environnement

| Variable                                 | Composant | Rôle                                                                                         |
| ---------------------------------------- | --------- | -------------------------------------------------------------------------------------------- |
| `PORT` (6123)                            | api       | Port HTTP                                                                                    |
| `APP_VERSION`                            | api       | Version exposée par `/api/health`                                                            |
| `PUBLIC_BASE_URL`                        | api       | URL publique (redirections OAuth)                                                            |
| `DATABASE_URL`                           | api       | Postgres de l'application                                                                    |
| `LOG_LEVEL`                              | api       | Niveau pino                                                                                  |
| `GOOGLE_CLIENT_ID`                       | api       | Client OAuth Google (sops)                                                                   |
| `GOOGLE_CLIENT_SECRET`                   | api       | Client OAuth Google (sops)                                                                   |
| `TESLA_CLIENT_ID`, `TESLA_CLIENT_SECRET` | api       | Application Tesla Fleet API (sops) ; absente, la batterie se saisit à la main                |
| `TESLA_AUDIENCE`                         | api       | API Fleet régionale (défaut : Europe)                                                        |
| `TOKEN_ENCRYPTION_KEY`                   | api       | 32 octets base64 : chiffre les jetons Google/Tesla et le cookie OAuth (généré par Terraform) |
| `NUXT_API_INTERNAL_URL`                  | web       | API vue depuis le serveur Nuxt (SSR et relais `/api`)                                        |
| `NUXT_PUBLIC_BASE_URL`                   | web       | URL publique                                                                                 |

En développement : `pnpm infra:up` (Postgres local), puis `pnpm dev`. Les variables vont dans `.env` à la racine (ignoré par git) ; `TOKEN_ENCRYPTION_KEY` : `openssl rand -base64 32`.

## Secrets

Les secrets externes sont dans `infrastructure/secrets/production.sops.yaml` (chiffré pour le Mac d'administration, la clé de secours et le serveur ; règles dans `.sops.yaml`) :

| Clé                                        | Usage                                                                                                                                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `google_client_id`, `google_client_secret` | client OAuth « Application Web » du projet GCP `crn-charging-planning`                                                                                                                                      |
| `tesla_client_id`, `tesla_client_secret`   | application Tesla Fleet API                                                                                                                                                                                 |
| `tesla_private_key`                        | clé EC (prime256v1) de l'application ; sa moitié publique est servie sur `/.well-known/appspecific/com.tesla.3p.public-key.pem` (`components/api/src/tesla/public-key.ts`) ; réservée aux futures commandes |

### Application Tesla

Dans le portail développeur Tesla : origine autorisée `https://charging-planning.crn-tech.fr`, redirections `https://charging-planning.crn-tech.fr/api/tesla/callback` et `http://localhost:5123/api/tesla/callback`, scopes _Vehicle Information_ et _Vehicle Location_. Une fois la clé publique en ligne, enregistrer le domaine une fois pour la région : `scripts/tesla-register.sh` (Touch ID).

Édition : `SOPS_AGE_KEY_FILE=~/.config/sops/age/se-identity.txt sops infrastructure/secrets/production.sops.yaml` (Touch ID). Terraform les lit au déploiement (provider `carlpett/sops`) et les injecte dans le conteneur ; rien n'est écrit sur le disque du serveur.

## 4. Terraform en local

```bash
ssh -N -L 5432:127.0.0.1:5432 pi &
export PG_CONN_STR=postgres://terraform:<mot de passe>@127.0.0.1:5432/tf_backend?sslmode=disable   # secrets de home-platform
export PGHOST=127.0.0.1 PGUSER=terraform PGPASSWORD=<mot de passe> PGSSLMODE=disable
terraform -chdir=infrastructure/terraform/server init
terraform -chdir=infrastructure/terraform/server plan -var image_tag=<version> -var docker_host=ssh://<utilisateur>@pi
```

Plans uniquement : les applies passent par une demande de déploiement.
