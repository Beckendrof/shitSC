export function shelfSenseLog(scope: string, message: string, extra?: string): void {
  const suffix = extra ? ` ${extra}` : '';
  print(`[ShelfSense:${scope}] ${message}${suffix}`);
}
