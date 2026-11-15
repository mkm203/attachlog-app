export async function resolve(specifier, context, nextResolve) {
  const relative = specifier.startsWith('./') || specifier.startsWith('../');
  if (relative && !/\.[cm]?[jt]s$/.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      /* not a file: try a folder's index.ts */
    }
    try {
      return await nextResolve(`${specifier}/index.ts`, context);
    } catch {
      /* fall through to the default resolution */
    }
  }
  return nextResolve(specifier, context);
}
