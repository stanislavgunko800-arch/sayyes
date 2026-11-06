# Motion in SayYes

The vanilla JavaScript interface uses the official `motion` package's `motion/mini`
entry point (native Web Animations API). React is not required.

`public/motion.js` adds progressive enhancement after each section render:
- a short opacity transition and at most two visible entry blocks;
- subtle press feedback for buttons, including action cards and keyboard activation;
- no repeated entrance when filters or data refresh within the same section;
- cancellation on section replacement, reduced-motion changes, printing and page exit;
- automatic removal of finished effects, preserving existing CSS transforms and layout.

Animation never controls navigation, form submission, API calls or semantic state.
Content starts visible in CSS. No layout properties, calendar rows, or client data
are animated or modified. No observers or permanent animation loops are installed.

Run `npm ci`, then `npm run build` (also available as `npm run preview:build`).
The build produces `public/motion.bundle.js`, embeds that local bundle into
`public/index.html`, and includes it in `SayYes-preview.html`. Inline delivery
preserves the server's explicit static-asset allowlist without changing server
routes. Commit all three generated files after changing the Motion source.
There are no runtime CDN requests.

Validation performed: all 51 existing tests; build; Chromium at 390×844 and
1440×900 for both the live module app and standalone preview; calendar navigation,
booking dialog open/close, reduced-motion during navigation and during transitions,
animation cleanup, and absence of page JavaScript errors. Initial dashboard had
no horizontal overflow at either size. These are emulated viewport checks, not
physical iPhone or Safari device testing.

UI UX Pro Max guidance applied: interruptible state transitions, restrained
opacity/transform effects, reduced motion, no blocking of user interactions.
