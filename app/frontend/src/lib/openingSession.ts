const OPENING_KEY = "cardiolens:opening-seen";

export function shouldShowOpening(): boolean {
  try {
    return sessionStorage.getItem(OPENING_KEY) !== "1";
  } catch {
    return true;
  }
}

export function rememberOpening(): void {
  try {
    sessionStorage.setItem(OPENING_KEY, "1");
  } catch {
    // Storage restrictions must not prevent the app from opening.
  }
}
