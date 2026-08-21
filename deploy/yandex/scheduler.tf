resource "yandex_function_trigger" "contact_worker" {
  name        = "vbtech-contact-worker"
  description = "Runs the durable v-b.tech contact outbox and retention worker hourly."
  labels      = var.labels

  timer {
    cron_expression = "0 * ? * * *"
    payload         = "vbtech-contact-worker"
  }

  function {
    id                 = yandex_function.contact_worker.id
    service_account_id = yandex_iam_service_account.contact_runtime.id
    retry_attempts     = "3"
    retry_interval     = "30"
  }

  depends_on = [
    yandex_function_iam_binding.contact_worker_invoker,
  ]
}
