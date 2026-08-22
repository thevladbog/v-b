locals {
  common_function_environment = {
    NODE_ENV           = "production"
    VBTECH_RELEASE_SHA = var.function_release_sha
  }

  secret_entries = {
    database_url = {
      environment_variable = "CONTACT_DATABASE_URL"
      key                  = "contact_database_url"
    }
    outbox_encryption_key = {
      environment_variable = "CONTACT_OUTBOX_ENCRYPTION_KEY"
      key                  = "contact_outbox_encryption_key"
    }
    rate_limit_hmac_key = {
      environment_variable = "CONTACT_RATE_LIMIT_HMAC_KEY"
      key                  = "contact_rate_limit_hmac_key"
    }
    smartcaptcha_secret = {
      environment_variable = "SMARTCAPTCHA_SECRET"
      key                  = "smartcaptcha_secret"
    }
  }
}

resource "yandex_function" "contact_http" {
  name               = "vbtech-contact-http"
  description        = "Privacy-gated v-b.tech contact submission handler."
  runtime            = "nodejs22"
  entrypoint         = "index.httpHandler"
  memory             = var.function_memory_mb
  execution_timeout  = "10"
  service_account_id = yandex_iam_service_account.contact_runtime.id
  user_hash          = "${var.function_release_sha}:${var.function_package_sha256}:http"
  labels             = var.labels
  environment = merge(local.common_function_environment, {
    CONTACT_SUBMISSION_ENABLED = tostring(var.contact_submission_enabled)
  })

  connectivity {
    network_id = var.network_id
  }

  package {
    bucket_name = var.function_package_bucket
    object_name = var.function_package_object
    sha_256     = var.function_package_sha256
  }

  dynamic "secrets" {
    for_each = local.secret_entries
    content {
      id                   = var.runtime_secret_id
      version_id           = var.runtime_secret_version_id
      key                  = secrets.value.key
      environment_variable = secrets.value.environment_variable
    }
  }

  depends_on = [
    yandex_lockbox_secret_iam_member.contact_runtime,
  ]
}

resource "yandex_function" "contact_worker" {
  name               = "vbtech-contact-worker"
  description        = "Durable v-b.tech email outbox and retention worker."
  runtime            = "nodejs22"
  entrypoint         = "index.timerHandler"
  memory             = var.function_memory_mb
  execution_timeout  = "60"
  service_account_id = yandex_iam_service_account.contact_runtime.id
  user_hash          = "${var.function_release_sha}:${var.function_package_sha256}:worker"
  labels             = var.labels
  environment        = local.common_function_environment

  connectivity {
    network_id = var.network_id
  }

  package {
    bucket_name = var.function_package_bucket
    object_name = var.function_package_object
    sha_256     = var.function_package_sha256
  }

  dynamic "secrets" {
    for_each = {
      for name, entry in local.secret_entries : name => entry
      if contains(["database_url", "outbox_encryption_key"], name)
    }
    content {
      id                   = var.runtime_secret_id
      version_id           = var.runtime_secret_version_id
      key                  = secrets.value.key
      environment_variable = secrets.value.environment_variable
    }
  }

  depends_on = [
    yandex_lockbox_secret_iam_member.contact_runtime,
    yandex_resourcemanager_folder_iam_member.contact_postbox_sender,
  ]
}
