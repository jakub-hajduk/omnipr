export function normalizeDirectoryPath(path: string): string {
  let normalizedPath = path.replace(/\\\\/g, "/"); // Convert backslashes to forward slashes

  // Remove leading and trailing slashes, unless it's just a root slash
  if (normalizedPath !== "/") {
    normalizedPath = normalizedPath.replace(/^\/|\/$/g, "");
  }

  // Handle '.' as an empty string for root directory logic
  if (normalizedPath === ".") {
    return "";
  }

  return normalizedPath;
}
