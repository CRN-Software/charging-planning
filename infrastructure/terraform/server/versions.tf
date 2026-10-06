terraform {
  required_version = ">= 1.10"

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 4.6"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # State lives in the Postgres shared by every Terraform project on the Raspberry Pi
  # (see baby-phone infrastructure/bootstrap). Connection: PG_CONN_STR env var.
  backend "pg" {
    schema_name = "charging_planning"
  }
}

provider "docker" {
  host = var.docker_host

  registry_auth {
    address  = "ghcr.io"
    username = var.registry_username
    password = var.registry_password
  }
}
