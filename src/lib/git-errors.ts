export function isAuthenticationError(error: string) {
  return /authentication failed|failed to authenticate|could not read (?:username|password)|terminal prompts disabled|(?:invalid|incorrect) (?:username|password|credentials)|http basic: access denied|permission denied \(publickey\)|interactive prompts? (?:have been |are |is )?disabled|cannot prompt because user interactivity has been disabled|returned error: 401/i.test(error);
}

export function redactGitError(error: string) {
  return error.replace(/(https?:\/\/)[^\s/'"]+@/gi, "$1[redacted]@");
}
