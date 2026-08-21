terraform {
  required_version = "= 1.15.8"

  required_providers {
    yandex = {
      source  = "yandex-cloud/yandex"
      version = "= 0.215.0"
    }
  }

  backend "s3" {}
}

provider "yandex" {
  cloud_id  = var.cloud_id
  folder_id = var.folder_id
}
