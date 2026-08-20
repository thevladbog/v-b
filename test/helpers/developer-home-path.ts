const MAX_INPUT_LENGTH = 4 * 1024 * 1024;
const MAX_NORMALIZATION_PASSES = 8;
const MAX_SOURCES_ARRAY_LENGTH = 64 * 1024;
const MAX_SOURCES_ARRAY_MEMBERS = 1024;

const HOSTED_URL = /\bhttps?:\/\/[^\s"'`()<>\[\]\{\},;\\]+/gi;
const FILE_HOME_URL = /file:\/\/\/(?:Users|home)\/[^/\s"'<>]+(?:\/|$)/i;
const STRICT_POSIX_HOME_PATH = /(?:^|[\s"'({:,;\[])\/(?:Users|home)\/[^/\s"'<>]+(?:\/|$)/i;
const GENERATED_MACOS_HOME_PATH = /(?:^|[\s"'({:,;\[])\/Users\/[^/\s"'<>]+(?:\/|$)/i;
// Bare /home/<segment> is ambiguous with a root-relative web route: strict provenance rejects
// it, while generated artifacts require file:// or an explicit filesystem-value label.
const GENERATED_LINUX_HOME_CONTEXT =
  /(?:^|[\s,{;])["']?(?:path|absolutePath|file|filename|source|sourceFile|sourceMap|sourcePath|sourceRoot|sourceMappingURL|cwd|workdir|directory)["']?\s*(?::|=)\s*["']?\/home\/[^/\s"'<>]+(?:\/|$)/i;
const WINDOWS_HOME_PATH = /(?:^|[\s"'=({:,;\[])[A-Z]:\\Users\\[^\\/\s"'<>]+(?:\\|$)/i;
const LINUX_HOME_ARRAY_MEMBER = /\/home\/[^/\s"'<>]+(?:\/|$)/i;

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

const isJsonWhitespace = (character: string | undefined): boolean =>
  character === " " || character === "\t" || character === "\n" || character === "\r";

const sourcesArraySpanLimitError = (): RangeError =>
  new RangeError(`Sources array scan limit exceeds ${MAX_SOURCES_ARRAY_LENGTH} characters`);

const findJsonStringEnd = (
  value: string,
  start: number,
  maximumExclusive?: number,
): number | null => {
  let cursor = start + 1;
  while (cursor < value.length && (maximumExclusive === undefined || cursor < maximumExclusive)) {
    if (value[cursor] === '"') return cursor;
    if (value[cursor] === "\\") cursor += 1;
    cursor += 1;
  }
  if (maximumExclusive !== undefined && cursor >= maximumExclusive) {
    throw sourcesArraySpanLimitError();
  }
  return null;
};

const findSourcesArrayEnd = (value: string, arrayStart: number): number => {
  let cursor = arrayStart;
  let depth = 0;

  while (cursor < value.length) {
    if (cursor - arrayStart + 1 > MAX_SOURCES_ARRAY_LENGTH) {
      throw sourcesArraySpanLimitError();
    }

    if (value[cursor] === '"') {
      const stringEnd = findJsonStringEnd(
        value,
        cursor,
        arrayStart + MAX_SOURCES_ARRAY_LENGTH,
      );
      if (stringEnd === null) {
        throw new SyntaxError("Malformed sources array: unterminated JSON string");
      }
      cursor = stringEnd + 1;
      continue;
    }
    if (value[cursor] === "[") depth += 1;
    if (value[cursor] === "]") {
      depth -= 1;
      if (depth === 0) return cursor;
    }
    cursor += 1;
  }

  throw new SyntaxError("Malformed sources array: missing closing bracket");
};

const containsDeveloperHomeInDecodedSource = (value: string): boolean => {
  if (WINDOWS_HOME_PATH.test(value) || FILE_HOME_URL.test(value)) return true;
  const withoutHostedUrls = value.replace(HOSTED_URL, " ");
  return GENERATED_MACOS_HOME_PATH.test(withoutHostedUrls)
    || LINUX_HOME_ARRAY_MEMBER.test(withoutHostedUrls);
};

const containsDeveloperHomeInSourcesArrays = (value: string): boolean => {
  let cursor = 0;

  while (cursor < value.length) {
    if (value[cursor] !== '"') {
      cursor += 1;
      continue;
    }

    const keyEnd = findJsonStringEnd(value, cursor);
    if (keyEnd === null) return false;
    if (value.slice(cursor, keyEnd + 1) !== '"sources"') {
      cursor = keyEnd + 1;
      continue;
    }

    let arrayStart = keyEnd + 1;
    while (isJsonWhitespace(value[arrayStart])) arrayStart += 1;
    if (value[arrayStart] !== ":") {
      cursor = keyEnd + 1;
      continue;
    }
    arrayStart += 1;
    while (isJsonWhitespace(value[arrayStart])) arrayStart += 1;
    if (value[arrayStart] !== "[") {
      cursor = keyEnd + 1;
      continue;
    }

    const arrayEnd = findSourcesArrayEnd(value, arrayStart);
    let sources: unknown;
    try {
      sources = JSON.parse(value.slice(arrayStart, arrayEnd + 1));
    } catch {
      throw new SyntaxError("Malformed sources array: invalid JSON");
    }
    if (!Array.isArray(sources)) {
      throw new TypeError("Malformed sources array: expected an array");
    }
    if (sources.length > MAX_SOURCES_ARRAY_MEMBERS) {
      throw new RangeError(
        `Sources array scan limit exceeds ${MAX_SOURCES_ARRAY_MEMBERS} members`,
      );
    }
    for (const source of sources) {
      if (typeof source !== "string") {
        throw new TypeError("Malformed sources array: every member must be a string");
      }
      if (containsDeveloperHomeInDecodedSource(source)) return true;
    }
    cursor = arrayEnd + 1;
  }

  return false;
};

export const containsDeveloperHomePath = (
  value: string,
  context: DeveloperHomePathContext,
): boolean => {
  const normalized = normalizeEscapedPathSeparators(value);
  if (context === "generated-artifact" && containsDeveloperHomeInSourcesArrays(value)) {
    return true;
  }
  if (WINDOWS_HOME_PATH.test(normalized) || FILE_HOME_URL.test(normalized)) return true;

  const withoutHostedUrls = normalized.replace(HOSTED_URL, " ");
  if (context === "strict-provenance") {
    return STRICT_POSIX_HOME_PATH.test(withoutHostedUrls);
  }
  return GENERATED_MACOS_HOME_PATH.test(withoutHostedUrls)
    || GENERATED_LINUX_HOME_CONTEXT.test(withoutHostedUrls);
};
