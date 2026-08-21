variable "cloud_id" {
  description = "Existing Yandex Cloud identifier containing the shared Markiro production contour."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[a-z0-9]{20}$", var.cloud_id))
    error_message = "cloud_id must be an exact Yandex Cloud resource identifier."
  }
}

variable "folder_id" {
  description = "Existing production folder identifier. No new folder is created."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[a-z0-9]{20}$", var.folder_id))
    error_message = "folder_id must be an exact Yandex Cloud resource identifier."
  }
}

variable "network_id" {
  description = "Existing VPC network used by the Markiro VM and managed PostgreSQL cluster."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[a-z0-9]{20}$", var.network_id))
    error_message = "network_id must be an exact existing VPC network identifier."
  }
}

variable "serverless_subnet_ids" {
  description = "Read-only inventory of existing subnets in every zone required by Cloud Functions connectivity."
  type        = map(string)
  nullable    = false

  validation {
    condition = (
      toset(keys(var.serverless_subnet_ids)) ==
      toset(["ru-central1-a", "ru-central1-b", "ru-central1-d"]) &&
      alltrue([
        for subnet_id in values(var.serverless_subnet_ids) :
        can(regex("^[a-z0-9]{20}$", subnet_id))
      ])
    )
    error_message = "serverless_subnet_ids must contain exact existing subnet IDs for ru-central1-a, ru-central1-b and ru-central1-d."
  }
}

variable "runtime_secret_id" {
  description = "Reviewed Lockbox secret identifier. Its payload is provisioned outside Terraform."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[a-z0-9]{20}$", var.runtime_secret_id))
    error_message = "runtime_secret_id must be an exact Lockbox secret identifier."
  }
}

variable "runtime_secret_version_id" {
  description = "Reviewed immutable Lockbox secret-version identifier."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[a-z0-9]{20}$", var.runtime_secret_version_id))
    error_message = "runtime_secret_version_id must be an exact Lockbox version identifier."
  }
}

variable "function_package_bucket" {
  description = "Existing private Object Storage bucket containing the immutable function ZIP."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.function_package_bucket))
    error_message = "function_package_bucket must be a canonical Object Storage bucket name."
  }
}

variable "function_package_object" {
  description = "Immutable Object Storage key of the reviewed function ZIP."
  type        = string
  nullable    = false

  validation {
    condition = (
      can(regex("^vbtech-contact/[0-9a-f]{40}/function\\.zip$", var.function_package_object)) &&
      !strcontains(var.function_package_object, "..") &&
      var.function_package_object == "vbtech-contact/${var.function_release_sha}/function.zip"
    )
    error_message = "function_package_object must include the exact function_release_sha."
  }
}

variable "function_package_sha256" {
  description = "Lowercase SHA-256 digest of the immutable function ZIP."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[0-9a-f]{64}$", var.function_package_sha256))
    error_message = "function_package_sha256 must be one lowercase SHA-256 digest."
  }
}

variable "function_release_sha" {
  description = "Exact Git SHA represented by the function artifact."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[0-9a-f]{40}$", var.function_release_sha))
    error_message = "function_release_sha must be one lowercase 40-character Git SHA."
  }
}

variable "contact_submission_enabled" {
  description = "Server-side submission feature gate. Remains false until the separate activation approval."
  type        = bool
  default     = false
  nullable    = false

  validation {
    condition = (
      !var.contact_submission_enabled ||
      (var.public_endpoint_enabled && var.public_endpoint_abuse_controls_approved)
    )
    error_message = "contact submission requires the public endpoint and separately approved abuse controls."
  }
}

variable "public_endpoint_enabled" {
  description = "Public invocation gate. Remains false until the separate production activation approval."
  type        = bool
  default     = false
  nullable    = false

  validation {
    condition     = !var.public_endpoint_enabled || var.public_endpoint_abuse_controls_approved
    error_message = "public endpoint activation requires separately approved abuse controls."
  }
}

variable "public_endpoint_abuse_controls_approved" {
  description = "Records explicit approval of SmartCaptcha, rate-limit, monitoring and cost-abuse controls before public activation."
  type        = bool
  default     = false
  nullable    = false
}

variable "function_memory_mb" {
  description = "Memory assigned to each contact function version."
  type        = number
  default     = 256
  nullable    = false

  validation {
    condition     = var.function_memory_mb >= 256 && var.function_memory_mb <= 1024 && var.function_memory_mb % 128 == 0
    error_message = "function_memory_mb must be a 128 MiB multiple between 256 and 1024."
  }
}

variable "labels" {
  description = "Reviewed non-secret labels applied to v-b.tech resources."
  type        = map(string)
  default = {
    application = "vbtech"
    environment = "production"
    managed_by  = "terraform"
  }
  nullable = false

  validation {
    condition = alltrue([
      for key, value in var.labels :
      can(regex("^[a-z][a-z0-9_-]{0,62}$", key)) &&
      can(regex("^[a-z0-9][a-z0-9_-]{0,62}$", value))
    ])
    error_message = "labels must contain only bounded lowercase non-secret identifiers."
  }
}
