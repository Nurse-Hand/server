const WINDOWS_INVALID_CHARACTER_PATTERN = /[<>"|?*]/;
const WINDOWS_DRIVE_ABSOLUTE_PATTERN = /^[A-Za-z]:[\\/]/;

export function isSafeAbsoluteStorageRoot(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    containsControlCharacter(value) ||
    WINDOWS_INVALID_CHARACTER_PATTERN.test(value) ||
    /^[\\/]{2}/.test(value)
  ) {
    return false;
  }

  if (WINDOWS_DRIVE_ABSOLUTE_PATTERN.test(value)) {
    const pathWithoutDriveRoot = value.slice(3);
    if (pathWithoutDriveRoot.includes(':')) {
      return false;
    }
    return hasSafeSegments(pathWithoutDriveRoot, /[\\/]/, true);
  }

  if (/^[A-Za-z]:/.test(value)) {
    return false;
  }

  if (value.startsWith('/')) {
    const pathWithoutRoot = value.slice(1);
    if (pathWithoutRoot.includes('\\') || pathWithoutRoot.includes(':')) {
      return false;
    }
    return hasSafeSegments(pathWithoutRoot, /\//, false);
  }

  return false;
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}

function hasSafeSegments(
  pathWithoutRoot: string,
  separator: RegExp,
  rejectWindowsTrailingCharacters: boolean,
): boolean {
  const segments = pathWithoutRoot.split(separator);
  if (segments.at(-1) === '') {
    segments.pop();
  }

  return (
    segments.length > 0 &&
    segments.every(
      (segment) =>
        segment.length > 0 &&
        segment !== '.' &&
        segment !== '..' &&
        (!rejectWindowsTrailingCharacters || !/[. ]$/.test(segment)),
    )
  );
}
