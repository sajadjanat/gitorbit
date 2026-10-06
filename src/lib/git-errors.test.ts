import { expect, it } from "vitest";
import { isAuthenticationError, redactGitError } from "./git-errors";
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
