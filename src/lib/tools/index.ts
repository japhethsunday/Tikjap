// Tool *types* are shared with the client (the composer renders toggles from
// them). The registry, executor and permission checks live server-side only,
// in src/server/tools — a browser-side tool registry could be edited by the
// user, so it must never be the thing that decides what may run.
export * from "./types";
