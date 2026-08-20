const MAX_INPUT_LENGTH = 4 * 1024 * 1024;
const MAX_NORMALIZATION_PASSES = 8;

const HOSTED_URL = /\bhttps?:\/\/[^\s"'<>]+/gi;
const FILE_HOME_URL = /file:\/\/\/(?:Users|home)\/[^/\s"'<>]+(?:\/|$)/i;
const STRICT_POSIX_HOME_PATH = /(?:^|[\s"'({:,;\[])\/(?:Users|home)\/[^/\s"'<>]+(?:\/|$)/i;
const GENERATED_MACOS_HOME_PATH = /(?:^|[\s"'({:,;\[])\/Users\/[^/\s"'<>]+(?:\/|$)/i;
// Bare /home/<segment> is ambiguous with a root-relative web route: strict provenance rejects
// it, while generated artifacts require file:// or an explicit filesystem-value label.
const GENERATED_LINUX_HOME_CONTEXT =
  /(?:^|[\s,{;])["']?(?:(?:[a-z][a-z0-9_-]*)?source|source\s+path|path|file|cwd|workdir|checkout|directory)["']?\s*(?::|=)\s*["']?\/home\/[^/\s"'<>]+(?:\/|$)/i;
const WINDOWS_HOME_PATH = /(?:^|[\s"'=({:,;\[])[A-Z]:\\Users\\[^\\/\s"'<>]+(?:\\|$)/i;

export type DeveloperHomePathContext = "strict-provenance" | "generated-artifact";

const normalizeEscapedPathSeparators = (value: string): string => {
  if (value.length > MAX_INPUT_LENGTH) {
    throw new RangeError(`Developer-home scan input exceeds ${MAX_INPUT_LENGTH} characters`);
  }

  let normalized = value;
  for (let pass = 0; pass < MAX_NORMALIZATION_PASSES; pass += 1) {
    const next = normalized.replace(/\\\//g, "/").replace(/\\\\/g, "\\");
    if (next === normalized) return normalized;
    normalized = next;
  }
  throw new RangeError(
    `Developer-home scan input exceeds ${MAX_NORMALIZATION_PASSES} escape layers`,
  );
};

export const containsDeveloperHomePath = (
  value: string,
  context: DeveloperHomePathContext,
): boolean => {
  const normalized = normalizeEscapedPathSeparators(value);
  if (WINDOWS_HOME_PATH.test(normalized) || FILE_HOME_URL.test(normalized)) return true;

  const withoutHostedUrls = normalized.replace(HOSTED_URL, " ");
  if (context === "strict-provenance") {
    return STRICT_POSIX_HOME_PATH.test(withoutHostedUrls);
  }
  return GENERATED_MACOS_HOME_PATH.test(withoutHostedUrls)
    || GENERATED_LINUX_HOME_CONTEXT.test(withoutHostedUrls);
};
