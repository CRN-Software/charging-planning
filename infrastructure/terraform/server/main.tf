locals {
  images = {
    api = "${var.image_prefix}/api:${var.image_tag}"
    web = "${var.image_prefix}/web:${var.image_tag}"
  }
  log_opts = {
    max-size = "10m"
    max-file = "3"
  }
}

resource "docker_network" "app" {
  name = "charging-planning"
}

# ---------- database (application data, private to the docker network) ----------

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "docker_volume" "db" {
  name = "charging-planning-db"
}

resource "docker_image" "postgres" {
  name         = "postgres:18-alpine"
  keep_locally = true
}

resource "docker_container" "db" {
  name    = "charging-planning-db"
  image   = docker_image.postgres.image_id
  restart = "unless-stopped"

  env = [
    "POSTGRES_DB=charging",
    "POSTGRES_USER=charging",
    "POSTGRES_PASSWORD=${random_password.db.result}",
  ]

  networks_advanced {
    name = docker_network.app.name
  }

  volumes {
    volume_name    = docker_volume.db.name
    container_path = "/var/lib/postgresql"
  }

  healthcheck {
    test     = ["CMD", "pg_isready", "-U", "charging", "-d", "charging"]
    interval = "30s"
    timeout  = "5s"
    retries  = 3
  }

  log_driver = "json-file"
  log_opts   = local.log_opts
}

# ---------- application images ----------

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
  name    = "charging-planning-api"
  image   = docker_image.app["api"].image_id
  restart = "unless-stopped"

  env = [
    "APP_VERSION=${var.image_tag}",
    "PUBLIC_BASE_URL=${var.public_base_url}",
    "DATABASE_URL=postgres://charging:${random_password.db.result}@${docker_container.db.name}:5432/charging",
  ]

  networks_advanced {
    name = docker_network.app.name
  }

  ports {
    internal = 6123
    external = var.api_host_port
    ip       = "127.0.0.1"
  }

  log_driver = "json-file"
  log_opts   = local.log_opts
}

resource "docker_container" "web" {
  name    = "charging-planning-web"
  image   = docker_image.app["web"].image_id
  restart = "unless-stopped"

  env = [
    "NUXT_API_INTERNAL_URL=http://${docker_container.api.name}:6123",
    "NUXT_PUBLIC_BASE_URL=${var.public_base_url}",
  ]

  networks_advanced {
    name = docker_network.app.name
  }

  ports {
    internal = 5123
    external = var.web_host_port
    ip       = "127.0.0.1"
  }

  log_driver = "json-file"
  log_opts   = local.log_opts
}
