# Charging Planning — Déploiement

```
PR ──▶ pull-request.yml ── titre en commit conventionnel
                        └─ ci.yml : format · lint · typecheck · tests · build · images docker · terraform validate · actionlint
merge sur main ──▶ release.yml
   ci ─▶ semantic-release (tag vX.Y.Z, seulement pour feat/fix/perf/breaking)
        └─▶ images multi-arch (arm64 + amd64) → ghcr.io/crn-software/charging-planning/{api,web}
              └─▶ deploy (runner auto-hébergé sur le Raspberry Pi) : terraform apply → test de fumée /api/health
```

Squash-merge des PR : le titre devient le commit analysé par semantic-release.

## 1. Cible

Le Raspberry Pi de la maison, comme baby-phone :

- `charging-planning.crn-tech.fr` → CNAME `home.crn-tech.fr` (zone OVH).
- nginx de l'hôte termine le TLS (Let's Encrypt) et relaie vers les conteneurs en boucle locale : web `127.0.0.1:18090`, api `127.0.0.1:18091`.
- Terraform (fournisseur docker) gère le réseau, la base Postgres de l'application (volume `charging-planning-db`), l'API et le web. État dans le Postgres partagé `tf-backend`, schéma `charging_planning`.

## 2. Mise en place unique

1. **DNS (OVH)** : enregistrement `CNAME charging-planning → home.crn-tech.fr.`
2. **Certificat + nginx** sur le Pi :
   ```bash
   sudo cp infrastructure/nginx/charging-planning.conf /etc/nginx/sites-available/
   sudo ln -s /etc/nginx/sites-available/charging-planning.conf /etc/nginx/sites-enabled/
   sudo certbot --nginx -d charging-planning.crn-tech.fr
   sudo nginx -t && sudo systemctl reload nginx
   ```
3. **Runner GitHub** pour `CRN-Software/charging-planning` (Settings → Actions → Runners → New self-hosted runner → Linux ARM64), dans un dossier distinct de celui de baby-phone :
   ```bash
   ./config.sh --url https://github.com/CRN-Software/charging-planning --token <token> --labels rpi --name rpi-charging --unattended
   sudo ./svc.sh install && sudo ./svc.sh start
   sudo usermod -aG docker <utilisateur-du-runner>
   ```
4. **Environnement `production`** (Settings → Environments) : déploiement limité à `main`, secret `TF_STATE_PG_CONN_STR` = `postgres://terraform:<mot de passe>@127.0.0.1:5433/terraform?sslmode=disable` (même base d'état que baby-phone, autre schéma).
5. **Protections** (dépôt public + runner auto-hébergé) : PR obligatoire et CI verte sur `main`, pas de force push, approbation de chaque workflow de fork. Ne jamais approuver une PR de fork qui touche `.github/` sans l'avoir lue.

## 3. Variables d'environnement

| Variable                | Composant | Rôle                              |
| ----------------------- | --------- | --------------------------------- |
| `PORT` (6123)           | api       | Port HTTP                         |
| `APP_VERSION`           | api       | Version exposée par `/api/health` |
| `PUBLIC_BASE_URL`       | api       | URL publique (redirections OAuth) |
| `DATABASE_URL`          | api       | Postgres de l'application         |
| `LOG_LEVEL`             | api       | Niveau pino                       |
| `NUXT_API_INTERNAL_URL` | web       | API vue depuis le serveur Nuxt    |
| `NUXT_PUBLIC_BASE_URL`  | web       | URL publique                      |

En développement : `pnpm infra:up` (Postgres local), puis `pnpm dev`.

## 4. Terraform en local

```bash
ssh -N -L 5433:127.0.0.1:5433 rpi &
export PG_CONN_STR=postgres://terraform:<mot de passe>@127.0.0.1:5433/terraform?sslmode=disable
terraform -chdir=infrastructure/terraform/server init
terraform -chdir=infrastructure/terraform/server plan \
  -var image_prefix=ghcr.io/crn-software/charging-planning -var image_tag=<version> \
  -var registry_username=<utilisateur GitHub> -var registry_password=$(gh auth token) \
  -var docker_host=ssh://<utilisateur>@rpi
```
