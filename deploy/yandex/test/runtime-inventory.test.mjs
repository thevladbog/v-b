import assert from "node:assert/strict";
import test from "node:test";

import { validateRuntimeInventory } from "../scripts/validate-runtime-inventory.mjs";

const NETWORK_ID = "enpalfhs9aap572kt2e5";
const POSTGRES_SECURITY_GROUP_ID = "enpif8b4sm0j4nu8f4lr";

function inventory(overrides = {}) {
  return {
    schemaVersion: 1,
    networkId: NETWORK_ID,
    selectedSubnets: {
      "ru-central1-a": "e9b5i36s743e0f5r1pah",
      "ru-central1-b": "e2ls1epf9n0er9c5i2jl",
      "ru-central1-d": "fl8d2hdp1o5qut4lv6jv",
    },
    subnets: [
      {
        id: "e9b5i36s743e0f5r1pah",
        network_id: NETWORK_ID,
        zone_id: "ru-central1-a",
      },
      {
        id: "e2ls1epf9n0er9c5i2jl",
        network_id: NETWORK_ID,
        zone_id: "ru-central1-b",
      },
      {
        id: "fl8d2hdp1o5qut4lv6jv",
        network_id: NETWORK_ID,
        zone_id: "ru-central1-d",
      },
    ],
    postgresSecurityGroupId: POSTGRES_SECURITY_GROUP_ID,
    postgresSecurityGroup: {
      id: POSTGRES_SECURITY_GROUP_ID,
      network_id: NETWORK_ID,
      rules: [
        {
          direction: "INGRESS",
          protocol_name: "TCP",
          ports: { from_port: "6432", to_port: "6432" },
          cidr_blocks: { v4_cidr_blocks: ["198.19.0.0/16"] },
        },
      ],
    },
    ...overrides,
  };
}

test("accepts exact three-zone network inventory and the serverless PostgreSQL boundary", () => {
  assert.deepEqual(validateRuntimeInventory(inventory()), {
    schemaVersion: 1,
    networkId: NETWORK_ID,
    subnetZones: ["ru-central1-a", "ru-central1-b", "ru-central1-d"],
    postgresSecurityGroupId: POSTGRES_SECURITY_GROUP_ID,
    postgresIngress: {
      protocol: "TCP",
      port: 6432,
      source: "198.19.0.0/16",
    },
    mutation: false,
  });
});

test("rejects a missing serverless PostgreSQL rule", () => {
  const value = inventory();
  value.postgresSecurityGroup.rules = [];

  assert.throws(
    () => validateRuntimeInventory(value),
    /runtime_inventory_missing_serverless_postgres_ingress/,
  );
});

test("rejects a broader source, wrong port, or wrong protocol", () => {
  for (const rule of [
    {
      direction: "INGRESS",
      protocol_name: "TCP",
      ports: { from_port: "6432", to_port: "6432" },
      cidr_blocks: { v4_cidr_blocks: ["0.0.0.0/0"] },
    },
    {
      direction: "INGRESS",
      protocol_name: "TCP",
      ports: { from_port: "5432", to_port: "5432" },
      cidr_blocks: { v4_cidr_blocks: ["198.19.0.0/16"] },
    },
    {
      direction: "INGRESS",
      protocol_name: "ANY",
      ports: { from_port: "6432", to_port: "6432" },
      cidr_blocks: { v4_cidr_blocks: ["198.19.0.0/16"] },
    },
  ]) {
    const value = inventory();
    value.postgresSecurityGroup.rules = [rule];
    assert.throws(
      () => validateRuntimeInventory(value),
      /runtime_inventory_missing_serverless_postgres_ingress/,
    );
  }
});

test("rejects subnet substitutions and cross-network security groups", () => {
  const wrongSubnet = inventory();
  wrongSubnet.subnets[1] = { ...wrongSubnet.subnets[1], zone_id: "ru-central1-d" };
  assert.throws(
    () => validateRuntimeInventory(wrongSubnet),
    /runtime_inventory_subnet_mismatch/,
  );

  const wrongSecurityGroup = inventory();
  wrongSecurityGroup.postgresSecurityGroup = {
    ...wrongSecurityGroup.postgresSecurityGroup,
    network_id: "enp00000000000000000",
  };
  assert.throws(
    () => validateRuntimeInventory(wrongSecurityGroup),
    /runtime_inventory_security_group_mismatch/,
  );
});
