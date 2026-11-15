/**
 * `@react-pdf/renderer` 4.x is ESM-only. The app bundles it fine, but the seed
 * CLI runs under tsx in CommonJS mode, where a static import fails to resolve
 * the renderer's ESM-only dependencies. A dynamic import works in both, so this
 * is the one place that loads it.
 */
export type ReactPdf = typeof import("@react-pdf/renderer");
export type { Styles } from "@react-pdf/renderer";

let cached: Promise<ReactPdf> | null = null;
export function loadReactPdf(): Promise<ReactPdf> {
  cached ??= import("@react-pdf/renderer");
  return cached;
}
