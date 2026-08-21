# Yandex Cloud deployment boundary

This directory defines the isolated v-b.tech functions and their least-privilege runtime identity. It deliberately does not create a VM, a Managed PostgreSQL cluster, a database user, a database, or a Lockbox payload.

## Managed PostgreSQL provisioning

Yandex Managed Service for PostgreSQL does not allow connecting to the `postgres` system database or creating users, roles, and databases with SQL. The `vbtech_contact` user and database must therefore be provisioned through an explicitly approved Yandex Cloud control-plane operation before the SQL bootstrap is used.

Use the Yandex Cloud management console for this one-time operation so that a generated password never appears in shell history, process arguments, Terraform state, source, or CI logs:

1. Open the reviewed existing PostgreSQL cluster by its exact cluster ID and verify its host FQDN. The selected production cluster must run PostgreSQL 15 or newer; the current production design targets PostgreSQL 17.
2. Create the password-authenticated user `vbtech_contact` with a generated password, deletion protection matching the cluster, no managed role grants, and no permissions to an existing protected database.
3. Create the database `vbtech_contact` with `vbtech_contact` as its owner.
4. Edit the user so its database-permission list contains only `vbtech_contact`. Recheck that no managed roles are assigned.
5. Store the generated credential and final PostgreSQL URL through the approved Lockbox secret workflow outside Terraform. The URL must use `vbtech_contact`, the reviewed host on port 6432, the `vbtech_contact` database, and `sslmode=verify-full`. Do not paste it into a `.tfvars` file.

Official references:

- [SQL command limits](https://yandex.cloud/en/docs/managed-postgresql/concepts/sql-limits)
- [Managing PostgreSQL users](https://yandex.cloud/en/docs/managed-postgresql/operations/cluster-users)
- [Managing PostgreSQL databases](https://yandex.cloud/en/docs/managed-postgresql/operations/databases)

## Acceptance sequence

Inject all target values from the approved secret runner or an ephemeral local environment. Never write them to the repository or command history.

The live `--check` requires:

- `VBTECH_CONTACT_DATABASE_URL`
- `VBTECH_EXPECTED_POSTGRES_HOST`
- `VBTECH_EXPECTED_POSTGRES_CLUSTER_ID`
- `VBTECH_OBSERVED_POSTGRES_CLUSTER_ID`, freshly read from the Yandex Cloud control plane
- `VBTECH_PROTECTED_DATABASE_NAME`
- `VBTECH_POSTGRES_CA_FILE`, an absolute path to the reviewed Yandex Cloud CA

Run `node deploy/yandex/scripts/bootstrap-database.mjs --check` first. It connects only to `vbtech_contact`, verifies strict TLS, PostgreSQL version, exact database ownership, role flags, direct role memberships, and confirms that the same credential cannot connect to the protected database. It performs no mutation.

Only after the check evidence and the database-bootstrap change are explicitly approved, inject `VBTECH_DATABASE_BOOTSTRAP_APPROVED=yes` and run `node deploy/yandex/scripts/bootstrap-database.mjs --apply`. Apply changes only schema ownership and application objects inside the pre-provisioned contact database. It never creates or alters a database user or database.

Finally run `node deploy/yandex/scripts/verify-permissions.mjs --verify`. Record only the timestamp, reviewed cluster ID and host, PostgreSQL version, object names, exact public-schema owner, and protected connection denial. Do not record credentials or connection URLs.

No command in the ordinary CI or PR workflow performs this live acceptance sequence.
