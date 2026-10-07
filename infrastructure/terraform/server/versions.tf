terraform {
  required_version = ">= 1.10"

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 4.6"
    }
    postgresql = {
      source  = "cyrilgdn/postgresql"
      version = "~> 1.25"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # State lives in the home server's shared Postgres; the deployer provides PG_CONN_STR.
  backend "pg" {
    schema_name = "charging_planning"
  }
}

# Public images: no registry credentials.
provider "docker" {
  host = var.docker_host
}

# Shared Postgres, `terraform` role (CREATEDB, CREATEROLE): PGHOST/PGUSER/PGPASSWORD from the deployer.
provider "postgresql" {
  superuser = false
}
