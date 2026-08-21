resource "yandex_iam_service_account" "contact_runtime" {
  name        = "vbtech-contact-runtime"
  description = "Isolated runtime identity for v-b.tech contact functions."
  folder_id   = var.folder_id
}

resource "yandex_resourcemanager_folder_iam_member" "contact_postbox_sender" {
  folder_id = var.folder_id
  role      = "postbox.sender"
  member    = "serviceAccount:${yandex_iam_service_account.contact_runtime.id}"
}

resource "yandex_function_iam_binding" "contact_worker_invoker" {
  function_id = yandex_function.contact_worker.id
  role        = "functions.functionInvoker"
  members     = ["serviceAccount:${yandex_iam_service_account.contact_runtime.id}"]
}

resource "yandex_function_iam_binding" "contact_http_public_invoker" {
  count = var.public_endpoint_enabled && var.public_endpoint_abuse_controls_approved ? 1 : 0

  function_id = yandex_function.contact_http.id
  role        = "functions.functionInvoker"
  members     = ["system:allUsers"]
}
