// Client-safe branch constants. Kept separate from `lib/branches.ts` (which is
// server-only) so client components can import the sentinel without pulling in
// server code.

// Sentinel used in the URL/select to mean "show every branch".
export const ALL_BRANCHES = 'all'
