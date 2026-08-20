const POSIX_HOME_PATH = /(?:^|[\s"'=({:,;\[])\/(?:Users|home)\/[^/\s"'<>]+(?:\/|$)/i;
const WINDOWS_HOME_PATH = /(?:^|[\s"'=({:,;\[])[A-Z]:\\Users\\[^\\/\s"'<>]+(?:\\|$)/i;

export const containsDeveloperHomePath = (value: string): boolean => {
  const normalizedWindowsSeparators = value.replaceAll("\\\\", "\\");
  return POSIX_HOME_PATH.test(value) || WINDOWS_HOME_PATH.test(normalizedWindowsSeparators);
};
