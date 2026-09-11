import { expect, type Locator } from "@playwright/test";

/**
 * Fill a controlled input on a `client:load` Astro island. The SSR-rendered
 * field is editable before React hydrates, so a plain `fill()` can be
 * silently wiped when the island mounts and resets to its initial state.
 *
 * A subtler variant of the same race: `fill()` can land in the DOM and
 * *stay* there (so `toHaveValue` alone passes) while React's own event
 * delegation isn't attached yet, so its controlled state never actually
 * saw the change — the input looks right, but a derived element (an
 * enabled button, a character counter) that depends on React state stays
 * stuck at its initial value. Pass `confirmReactSaw` — an assertion on such
 * a derived element — so a false-positive DOM match still triggers a retry
 * (with a fresh `fill()`) instead of being accepted.
 */
export async function fillWhenHydrated(locator: Locator, value: string, confirmReactSaw?: () => Promise<void>) {
  await expect(async () => {
    await locator.fill(value);
    await expect(locator).toHaveValue(value);
    if (confirmReactSaw) {
      await confirmReactSaw();
    }
  }).toPass({ timeout: 10_000 });
}

/**
 * Same hydration-safety guarantee as `fillWhenHydrated`, for a form whose
 * "ready" signal (e.g. a submit button's enabled state) only becomes true
 * once *all* of several fields are set — filling one field at a time can't
 * confirm React saw it until the last field lands, so this retries the
 * whole set together against one shared `confirmReactSaw` check.
 */
export async function fillAllWhenHydrated(fills: [Locator, string][], confirmReactSaw?: () => Promise<void>) {
  await expect(async () => {
    for (const [locator, value] of fills) {
      await locator.fill(value);
    }
    // Checked together, after every fill — not immediately after each one —
    // so a later field's fill (or a delayed hydration event) that wipes an
    // earlier field is caught here and retries the whole set, instead of an
    // earlier per-field check having already declared success and moved on.
    for (const [locator, value] of fills) {
      await expect(locator).toHaveValue(value);
    }
    if (confirmReactSaw) {
      await confirmReactSaw();
    }
  }).toPass({ timeout: 10_000 });
}
