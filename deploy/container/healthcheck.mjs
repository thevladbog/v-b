const expectedRelease = process.env.VBTECH_RELEASE_SHA;
const target = process.env.VBTECH_HEALTHCHECK_URL ?? "http://127.0.0.1:8080/__health";

async function main() {
  if (!/^[0-9a-f]{40}$/.test(expectedRelease ?? "")) {
    throw new Error("VBTECH_RELEASE_SHA must be an immutable 40-character Git SHA");
  }

  const response = await fetch(target, {
    redirect: "error",
    signal: AbortSignal.timeout(3_000),
  });

  if (response.status !== 200) {
    throw new Error(`health endpoint returned ${response.status}`);
  }

  const actualRelease = response.headers.get("x-vbtech-release-sha");
  if (actualRelease !== expectedRelease) {
    throw new Error("health endpoint release identity does not match the expected artifact");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "health check failed");
  process.exitCode = 1;
});
