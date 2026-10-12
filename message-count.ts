/** Session entries as Pi stores them; only the fields the count reads. */
export interface BranchEntryLike {
  type: string;
  message?: { role: string };
}

/**
 * The user-turn count pi-starship shows: user-role messages on the session branch. Assistant and tool
 * messages are not counted, so this matches pi-starship's turn counter rather than every message.
 */
export function countUserTurns(branch: readonly BranchEntryLike[]): number {
  return branch.filter((entry) => entry.type === "message" && entry.message?.role === "user").length;
}
