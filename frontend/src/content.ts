/**
 * User-facing copy for the puzzle page.
 * Keep in sync with docs/page-copy.md when you change copy.
 */
export const copy = {
  headline: "Let's build a better Chicago together.",
  subheadline: "Every Chicago neighborhood is a piece of the puzzle.",

  puzzleInstruction:
    "Drag each neighborhood back into place to complete the map. Pieces will gently snap into the outline when you're close enough.",
  lastTappedPrefix: "You last tapped",
  completionCaption:
    "Puzzle complete. Check the message below to get early access updates.",

  teaser:
    "Something new for Chicago is on the way. Complete the map to get a first look.",

  modalTitle: "You mapped Chicago.",
  modalBody:
    "We're building chicago.com as a new way for Chicagoans to see their city, neighborhood by neighborhood. Drop your email below if you'd like early access when it's ready.",
  emailLabel: "Email address",
  submitButton: "Get early access updates",
  submitButtonBusy: "Sending…",
  secondaryButton: "Maybe later",
  successMessage:
    "Thanks — you're on the list. We'll be in touch as chicago.com takes shape.",
  privacyNote:
    "We'll only use your email for updates about this project. For full terms and privacy details, see Chicago Public Media's main site.",

  footerLine1:
    "A prototype from Chicago Public Media, created to explore what's possible with chicago.com.",
  footerLine2:
    "Light-touch prototype only; final experience will follow full terms and privacy standards on the main site.",

  emailRequired: "Please enter an email address.",
  emailInvalid: "That email address does not look valid.",
  sessionError:
    "Something went wrong identifying this session. Please reload.",
  submitError: "We could not save your email. Please try again.",
  networkError:
    "Network error. Please check your connection and try again.",

  loadingPuzzle: "Loading puzzle…",
  loadingNeighborhoods: "Loading Chicago neighborhoods…",
  loadError: "Something went wrong loading the puzzle.",
  retry: "Retry",
} as const
