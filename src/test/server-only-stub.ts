// `server-only` ships a browser build that throws on import. The suite runs in
// jsdom, so server modules guarded by it would be untestable; alias it to this
// no-op. The guard still does its job where it matters — the production build,
// which is where a client import must fail.
export {};
