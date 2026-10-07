# Through the web container: checks the relay and the API in one call.
output "health_url" {
  value = "http://127.0.0.1:${var.host_port}/api/health"
}

output "public_url" {
  value = local.public_url
}

output "backup_databases" {
  value = [postgresql_database.app.name]
}
