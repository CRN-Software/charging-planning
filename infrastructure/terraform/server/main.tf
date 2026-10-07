locals {
  name          = "charging-planning"
  database      = "charging_planning"
  public_url    = "https://${var.subdomain}.crn-tech.fr"
  shared_server = "postgres" # container and network of the shared Postgres
  images = {
    api = "${var.image_prefix}/api:${var.image_tag}"
    web = "${var.image_prefix}/web:${var.image_tag}"
  }
  log_opts = {
    max-size = "10m"
    max-file = "3"
  }
}

# ---------- database on the shared Postgres ----------

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "postgresql_role" "app" {
  name     = local.database
  login    = true
  password = random_password.db.result
}

resource "postgresql_database" "app" {
  name  = local.database
  owner = postgresql_role.app.name
}

resource "postgresql_grant" "no_public_connect" {
  database    = postgresql_database.app.name
  role        = "public"
  object_type = "database"
  privileges  = []
}

# ---------- containers ----------

resource "docker_network" "app" {
  name = local.name
}

data "docker_registry_image" "app" {
  for_each = local.images
  name     = each.value
}

resource "docker_image" "app" {
  for_each      = local.images
  name          = each.value
  pull_triggers = [data.docker_registry_image.app[each.key].sha256_digest]
  keep_locally  = true
}

resource "docker_container" "api" {
  name          = "${local.name}-api"
  image         = docker_image.app["api"].image_id
  restart       = "unless-stopped"
  security_opts = ["no-new-privileges:true"]

  env = [
    "APP_VERSION=${var.image_tag}",
    "PUBLIC_BASE_URL=${local.public_url}",
    "DATABASE_URL=postgres://${postgresql_role.app.name}:${random_password.db.result}@${local.shared_server}:5432/${postgresql_database.app.name}",
  ]

  networks_advanced {
    name = docker_network.app.name
  }

  networks_advanced {
    name = local.shared_server
  }

  log_driver = "json-file"
  log_opts   = local.log_opts
}

resource "docker_container" "web" {
  name          = "${local.name}-web"
  image         = docker_image.app["web"].image_id
  restart       = "unless-stopped"
  security_opts = ["no-new-privileges:true"]

  env = [
    "NUXT_API_INTERNAL_URL=http://${docker_container.api.name}:6123",
    "NUXT_PUBLIC_BASE_URL=${local.public_url}",
  ]

  networks_advanced {
    name = docker_network.app.name
  }

  ports {
    internal = 5123
    external = var.host_port
    ip       = "127.0.0.1"
  }

  log_driver = "json-file"
  log_opts   = local.log_opts
}

# ---------- HTTPS site on the host nginx (certificate included); kept as is when it exists ----------

resource "terraform_data" "site" {
  input = { subdomain = var.subdomain, port = var.host_port }

  provisioner "local-exec" {
    command = "[ -e /etc/nginx/sites-available/${self.input.subdomain}.crn-tech.fr ] || sudo /etc/nginx/register-service.sh ${self.input.subdomain} ${self.input.port}"
  }

  provisioner "local-exec" {
    when    = destroy
    command = "sudo /etc/nginx/unregister-service.sh ${self.input.subdomain}"
  }

  depends_on = [docker_container.web]
}
