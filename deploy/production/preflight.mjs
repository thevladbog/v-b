const IMAGE_REPOSITORY = "ghcr.io/thevladbog/vbtech-web";
const IMAGE_PATTERN =
  /^ghcr\.io\/thevladbog\/vbtech-web:([0-9a-f]{40})-(disabled|enabled)$/;
const ACTIVE_CONSENT_PATTERN = /^VBT-PD-02\/\d{4}\.\d{2}\/\d{2}$/;
const CONSENT_PATTERN = /^VBT-PD-02\/(?:DRAFT|\d{4}\.\d{2}\/\d{2})$/;
const AUTHORITY_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function required(environment, name, maximum = 2_048) {
  const value = environment[name];
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`invalid_${name.toLowerCase()}`);
  }
  return value;
}

function exactDomain(environment, name, expected) {
  const value = required(environment, name, 253);
  if (!AUTHORITY_PATTERN.test(value) || value !== expected) {
    throw new Error(`invalid_${name.toLowerCase()}`);
  }
  return value;
}

function functionOrigin(environment) {
  const value = required(environment, "VBTECH_FUNCTION_ORIGIN");
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("invalid_vbtech_function_origin");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.hostname.length === 0
  ) {
    throw new Error("invalid_vbtech_function_origin");
  }
  return parsed.href.replace(/\/$/, "");
}

function reservedAuthorities(environment) {
  const raw = required(environment, "MARKIRO_EDGE_AUTHORITIES");
  const values = raw.split(",").map((value) => value.trim());
  if (
    values.length === 0 ||
    values.some((value) => !AUTHORITY_PATTERN.test(value))
  ) {
    throw new Error("invalid_markiro_edge_authorities");
  }
  return new Set(values);
}

export function parseDeploymentConfig(environment, artifact) {
  const imageTag = required(environment, "VBTECH_IMAGE_TAG");
  const imageMatch = imageTag.match(IMAGE_PATTERN);
  if (!imageMatch) throw new Error("invalid_vbtech_image_tag");
  const releaseSha = imageMatch[1];
  if (releaseSha !== artifact.releaseSha) {
    throw new Error("image_artifact_release_mismatch");
  }

  const canonical = exactDomain(environment, "VBTECH_DOMAIN", "v-b.tech");
  const www = exactDomain(environment, "VBTECH_WWW_DOMAIN", "www.v-b.tech");
  const reserved = reservedAuthorities(environment);
  if (reserved.has(canonical) || reserved.has(www))
    throw new Error("authority_collision");

  const submissionState = required(environment, "VBTECH_SUBMISSION_STATE", 16);
  if (submissionState !== "disabled" && submissionState !== "enabled") {
    throw new Error("invalid_vbtech_submission_state");
  }
  if ((submissionState === "enabled") !== artifact.submissionEnabled) {
    throw new Error("submission_artifact_state_mismatch");
  }
  if (imageMatch[2] !== submissionState) {
    throw new Error("image_submission_state_mismatch");
  }

  const consentRelease = required(environment, "VBTECH_CONSENT_RELEASE", 64);
  if (!CONSENT_PATTERN.test(consentRelease))
    throw new Error("invalid_vbtech_consent_release");
  if (consentRelease !== artifact.consentId) {
    throw new Error("consent_artifact_release_mismatch");
  }
  if (
    submissionState === "enabled" &&
    !ACTIVE_CONSENT_PATTERN.test(consentRelease)
  ) {
    throw new Error("active_consent_required");
  }

  const audience = required(environment, "VBTECH_FUNCTION_AUDIENCE", 256);
  if (!/^[A-Za-z0-9._:/-]+$/.test(audience)) {
    throw new Error("invalid_vbtech_function_audience");
  }

  return Object.freeze({
    image: Object.freeze({
      repository: IMAGE_REPOSITORY,
      tag: imageTag,
      releaseSha,
    }),
    domains: Object.freeze({ canonical, www }),
    contact: Object.freeze({
      functionOrigin: functionOrigin(environment),
      functionAudience: audience,
      submissionState,
      consentRelease,
    }),
  });
}
