variable "image_prefix" {
  description = "Image prefix, e.g. ghcr.io/crn-software/charging-planning (suffixed by /api and /web)"
  type        = string
}

variable "image_tag" {
  description = "Semantic version to deploy"
  type        = string
}

variable "docker_host" {
  description = "Docker API endpoint; the deploy runner sits on the Raspberry Pi itself"
  type        = string
  default     = "unix:///var/run/docker.sock"
}

variable "registry_username" {
  type = string
}

variable "registry_password" {
  type      = string
  sensitive = true
}

variable "public_base_url" {
  description = "Public URL served by the host nginx"
  type        = string
  default     = "https://charging-planning.crn-tech.fr"
}

variable "web_host_port" {
  description = "Loopback port the host nginx proxies to for the web app"
  type        = number
  default     = 18090
}

variable "api_host_port" {
  description = "Loopback port the host nginx proxies /api to"
  type        = number
  default     = 18091
}
