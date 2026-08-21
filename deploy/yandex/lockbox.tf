resource "yandex_lockbox_secret_iam_member" "contact_runtime" {
  secret_id = var.runtime_secret_id
  role      = "lockbox.payloadViewer"
  member    = "serviceAccount:${yandex_iam_service_account.contact_runtime.id}"
}
