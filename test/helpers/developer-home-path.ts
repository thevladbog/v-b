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
const SOURCES_ARRAY_START = /"sources"\s*:\s*\[/g;
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

const containsLinuxHomeInSourcesArray = (value: string): boolean => {
  SOURCES_ARRAY_START.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = SOURCES_ARRAY_START.exec(value)) !== null) {
    const arrayStart = SOURCES_ARRAY_START.lastIndex;
    let cursor = arrayStart;
    let memberCount = 0;

    const assertWithinBounds = () => {
      if (cursor - arrayStart > MAX_SOURCES_ARRAY_LENGTH) {
        throw new RangeError(
          `Sources array scan limit exceeds ${MAX_SOURCES_ARRAY_LENGTH} characters`,
        );
      }
    };
    const skipWhitespace = () => {
      while (cursor < value.length && /\s/.test(value[cursor]!)) {
        cursor += 1;
        assertWithinBounds();
      }
    };

    skipWhitespace();
    if (value[cursor] === "]") {
      SOURCES_ARRAY_START.lastIndex = cursor + 1;
      continue;
    }

    while (cursor < value.length) {
      assertWithinBounds();
      if (value[cursor] !== '"') {
        throw new SyntaxError("Malformed sources array: expected a JSON string member");
      }

      memberCount += 1;
      if (memberCount > MAX_SOURCES_ARRAY_MEMBERS) {
        throw new RangeError(
          `Sources array scan limit exceeds ${MAX_SOURCES_ARRAY_MEMBERS} members`,
        );
      }

      const memberStart = cursor + 1;
      cursor = memberStart;
      let escaped = false;
      while (cursor < value.length) {
        assertWithinBounds();
        const character = value[cursor]!;
        if (!escaped && character === '"') break;
        if (!escaped && character === "\\") {
          escaped = true;
        } else {
          escaped = false;
        }
        cursor += 1;
      }
      if (cursor >= value.length) {
        throw new SyntaxError("Malformed sources array: unterminated JSON string member");
      }

      if (LINUX_HOME_ARRAY_MEMBER.test(value.slice(memberStart, cursor))) return true;

      cursor += 1;
      skipWhitespace();
      if (value[cursor] === "]") {
        SOURCES_ARRAY_START.lastIndex = cursor + 1;
        break;
      }
      if (value[cursor] !== ",") {
        throw new SyntaxError("Malformed sources array: expected a comma or closing bracket");
      }
      cursor += 1;
      skipWhitespace();
      if (value[cursor] === "]") {
        throw new SyntaxError("Malformed sources array: trailing commas are not allowed");
      }
    }

    if (cursor >= value.length) {
      throw new SyntaxError("Malformed sources array: missing closing bracket");
    }
  }

  return false;
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
    || containsLinuxHomeInSourcesArray(withoutHostedUrls)
    || GENERATED_LINUX_HOME_CONTEXT.test(withoutHostedUrls);
};
