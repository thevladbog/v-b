data "yandex_vpc_subnet" "serverless" {
  for_each = var.serverless_subnet_ids

  subnet_id = each.value

  lifecycle {
    postcondition {
      condition     = self.zone == each.key && self.network_id == var.network_id
      error_message = "Every serverless subnet must belong to the reviewed network and its declared availability zone."
    }
  }
}
