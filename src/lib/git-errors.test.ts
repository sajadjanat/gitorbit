import { expect, it } from "vitest";
import { isAuthenticationError, isSyncError, redactGitError } from "./git-errors";
it.each([
  "remote: Failed to authenticate user fatal: Authentication failed for 'https://git.example.invalid/repo'",
  "fatal: could not read Username: terminal prompts disabled",
  "fatal: Cannot prompt because user interactivity has been disabled.",
  "remote: HTTP Basic: Access denied", "Permission denied (publickey).", "requested URL returned error: 401",
])("recognizes recoverable authentication: %s", error => expect(isAuthenticationError(error)).toBe(true));
it.each(["non-fast-forward", "Could not resolve host", "SSL certificate problem", "The branch changed after this preview."])("does not mistake %s for login failure", error => expect(isAuthenticationError(error)).toBe(false));
it("masks embedded URL credentials in error details", () => {
  expect(redactGitError("fatal: https://user:secret@git.example.invalid/repo")).toBe("fatal: https://[redacted]@git.example.invalid/repo");
});
it.each(["remote contains work that you do not have locally", "! [rejected] main -> main (fetch first)", "non-fast-forward", "The remote changed. Check incoming commits and sync before pushing.", "Not possible to fast-forward, aborting.", "The remote-tracking branch changed. Refresh the push list before pushing."])("offers sync recovery for %s", error => expect(isSyncError(error)).toBe(true));
it.each(["Authentication failed", "Could not resolve host", "SSL certificate problem", "Permission denied (publickey)."])("keeps unrelated failure out of sync recovery: %s", error => expect(isSyncError(error)).toBe(false));
