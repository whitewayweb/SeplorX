// The SDK ships its own TypeScript declarations in sub-paths (e.g.
// src/catalogitems_v2022_04_01/index.d.ts) but the top-level package entry
// (index.js) re-exports them all as namespaces via `export * as CatalogitemsSpApi`.
// TypeScript cannot resolve these re-exported namespaces automatically, so we
// declare the module here to silence the implicit-any error on the dynamic import.
// Individual API shapes are typed inline in the handler using local interfaces.
declare module "@amazon-sp-api-release/amazon-sp-api-sdk-js" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const CatalogitemsSpApi: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const SellersSpApi: any;
}
