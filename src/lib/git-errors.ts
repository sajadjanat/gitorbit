export function isAuthenticationError(error: string) {
  return /authentication failed|failed to authenticate|could not read (?:username|password)|terminal prompts disabled|(?:invalid|incorrect) (?:username|password|credentials)|http basic: access denied|permission denied \(publickey\)|interactive prompts? (?:have been |are |is )?disabled|cannot prompt because user interactivity has been disabled|returned error: 401/i.test(error);
}

export function redactGitError(error: string) {
  return error.replace(/(https?:\/\/)[^\s/'"]+@/gi, "$1[redacted]@");
}
export function isSyncError(error: string) {
  return /non-fast-forward|fetch first|remote contains work|tip of your current branch is behind|remote-tracking branch changed|remote has commits you do not have|remote changed\. check incoming|divergent branches|not possible to fast-forward/i.test(error);
}

export type GitIssueKind = "authentication" | "sync" | "changes" | "operation" | "upstream" | "stale" | "network" | "unknown";
export function classifyGitError(error: string): GitIssueKind {
  if (isAuthenticationError(error)) return "authentication";
  if (isSyncError(error)) return "sync";
  if (/operation.*(?:in progress|progress)|finish.*(?:merge|rebase|operation)|MERGE_HEAD|unmerged files|unresolved conflicts|resolve.*conflict/i.test(error)) return "operation";
  if (/local changes|working tree.*clean|commit or stash|would be overwritten/i.test(error)) return "changes";
  if (/upstream|select a branch|detached HEAD/i.test(error)) return "upstream";
  if (/changed.*(?:refresh|review)|refresh.*review|stale/i.test(error)) return "stale";
  if (/could not resolve|unable to access|connection|timed? out|timeout|unreachable/i.test(error)) return "network";
  return "unknown";
}
