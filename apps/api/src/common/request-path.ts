// Paths longer than this are never one of the routes the middlewares look for, so they are not scanned.
const MAX_PATH_LENGTH = 2048;

/**
 * `path` without its trailing slashes, in linear time (a `/\/+$/` regex backtracks quadratically on a
 * long run of slashes followed by another character). Over-long paths come back as `""`, which matches
 * no route.
 */
export function trimTrailingSlashes(path: string): string {
  if (path.length > MAX_PATH_LENGTH) return "";
  let end = path.length;
  while (end > 0 && path.charCodeAt(end - 1) === 47) end -= 1;
  return path.slice(0, end);
}
