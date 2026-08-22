import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const RESOURCE_ID = /^[a-z0-9]{20}$/;
const REQUIRED_ZONES = Object.freeze([
  "ru-central1-a",
  "ru-central1-b",
  "ru-central1-d",
]);
const SERVERLESS_SOURCE = "198.19.0.0/16";
const POSTGRES_PORT = 6432;

function fail(code) {
  throw new Error(`runtime_inventory_${code}`);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactResourceId(value) {
  return typeof value === "string" && RESOURCE_ID.test(value);
}

function selectedSubnetRows(value) {
  if (!isObject(value.selectedSubnets) || !Array.isArray(value.subnets)) {
    fail("invalid_subnets");
  }
  if (
    Object.keys(value.selectedSubnets).length !== REQUIRED_ZONES.length ||
    !REQUIRED_ZONES.every((zone) => exactResourceId(value.selectedSubnets[zone]))
  ) {
    fail("invalid_subnets");
  }

  return REQUIRED_ZONES.map((zone) => {
    const expectedId = value.selectedSubnets[zone];
    const matches = value.subnets.filter((subnet) => subnet?.id === expectedId);
    if (
      matches.length !== 1 ||
      matches[0].network_id !== value.networkId ||
      matches[0].zone_id !== zone
    ) {
      fail("subnet_mismatch");
    }
    return matches[0];
  });
}

function exactPostgresIngress(rule) {
  const cidrs = rule?.cidr_blocks?.v4_cidr_blocks;
  return (
    rule?.direction === "INGRESS" &&
    rule?.protocol_name === "TCP" &&
    rule?.ports?.from_port === String(POSTGRES_PORT) &&
    rule?.ports?.to_port === String(POSTGRES_PORT) &&
    Array.isArray(cidrs) &&
    cidrs.length === 1 &&
    cidrs[0] === SERVERLESS_SOURCE
  );
}

export function validateRuntimeInventory(value) {
  if (!isObject(value) || value.schemaVersion !== 1 || !exactResourceId(value.networkId)) {
    fail("invalid_document");
  }

  selectedSubnetRows(value);

  if (
    !exactResourceId(value.postgresSecurityGroupId) ||
    !isObject(value.postgresSecurityGroup) ||
    value.postgresSecurityGroup.id !== value.postgresSecurityGroupId ||
    value.postgresSecurityGroup.network_id !== value.networkId ||
    !Array.isArray(value.postgresSecurityGroup.rules)
  ) {
    fail("security_group_mismatch");
  }
  if (!value.postgresSecurityGroup.rules.some(exactPostgresIngress)) {
    fail("missing_serverless_postgres_ingress");
  }

  return Object.freeze({
    schemaVersion: 1,
    networkId: value.networkId,
    subnetZones: [...REQUIRED_ZONES],
    postgresSecurityGroupId: value.postgresSecurityGroupId,
    postgresIngress: Object.freeze({
      protocol: "TCP",
      port: POSTGRES_PORT,
      source: SERVERLESS_SOURCE,
    }),
    mutation: false,
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) fail("usage");
  const input = JSON.parse(await readFile(args[0], "utf8"));
  process.stdout.write(`${JSON.stringify(validateRuntimeInventory(input))}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    const code = typeof error?.message === "string" && /^runtime_inventory_[a-z0-9_]+$/.test(error.message)
      ? error.message
      : "runtime_inventory_invalid_json";
    process.stderr.write(`${JSON.stringify({ error: code })}\n`);
    process.exitCode = 1;
  });
}
