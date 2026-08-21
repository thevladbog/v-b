output "contact_http_function_id" {
  description = "HTTP contact function identifier used as the exact edge audience."
  value       = yandex_function.contact_http.id
}

output "contact_http_function_origin" {
  description = "HTTPS origin consumed by the reviewed Markiro edge configuration."
  value       = "https://functions.yandexcloud.net/${yandex_function.contact_http.id}"
}

output "contact_worker_function_id" {
  description = "Timer-only outbox worker function identifier."
  value       = yandex_function.contact_worker.id
}

output "contact_worker_trigger_id" {
  description = "Hourly outbox worker trigger identifier."
  value       = yandex_function_trigger.contact_worker.id
}

output "contact_runtime_service_account_id" {
  description = "Isolated runtime identity used by both contact functions."
  value       = yandex_iam_service_account.contact_runtime.id
}
