export function isAuthenticationError(error: string) {
  return /authentication failed|failed to authenticate|could not read (?:username|password)|terminal prompts disabled|(?:invalid|incorrect) (?:username|password|credentials)|http basic: access denied|permission denied \(publickey\)|interactive prompts? (?:have been |are |is )?disabled|cannot prompt because user interactivity has been disabled|returned error: 401/i.test(error);
}

export function redactGitError(error: string) {
  return error.replace(/(https?:\/\/)[^\s/'"]+@/gi, "$1[redacted]@");
}
export function isSyncError(error: string) {
  return /non-fast-forward|fetch first|remote contains work|tip of your current branch is behind|remote-tracking branch changed|remote has commits you do not have|remote changed\. check incoming|divergent branches|not possible to fast-forward/i.test(error);
}
