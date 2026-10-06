output "api_health_url" {
  value = "http://127.0.0.1:${var.api_host_port}/api/health"
}

output "web_url" {
  value = "http://127.0.0.1:${var.web_host_port}/"
}
