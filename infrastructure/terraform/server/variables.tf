variable "image_prefix" {
  description = "Image prefix, suffixed by /api and /web"
  type        = string
  default     = "ghcr.io/crn-software/charging-planning"
}

variable "image_tag" {
  description = "Semantic version to deploy"
  type        = string

  validation {
    condition     = var.image_tag != ""
    error_message = "image_tag is required: deploy a released version."
  }
}

variable "docker_host" {
  description = "Docker API endpoint; the deployer runs on the Raspberry Pi itself"
  type        = string
  default     = "unix:///var/run/docker.sock"
}

variable "subdomain" {
  description = "https://<subdomain>.crn-tech.fr"
  type        = string
  default     = "charging-planning"
}

variable "host_port" {
  description = "Loopback port of the web app, the only one the host nginx proxies to"
  type        = number
  default     = 18090
}
