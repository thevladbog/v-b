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

data "yandex_vpc_security_group" "postgres" {
  security_group_id = var.postgres_security_group_id

  lifecycle {
    postcondition {
      condition = (
        self.network_id == var.network_id &&
        anytrue([
          for rule in self.ingress :
          rule.protocol == "TCP" &&
          (
            rule.port == 6432 ||
            (rule.from_port == 6432 && rule.to_port == 6432)
          ) &&
          toset(rule.v4_cidr_blocks) == toset(["198.19.0.0/16"])
        ])
      )
      error_message = "PostgreSQL must admit only TCP 6432 from the exact Yandex serverless VPC source range."
    }
  }
}
