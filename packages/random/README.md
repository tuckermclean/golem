# @golem-engine/random

Hash and named channels: the one source of randomness permitted anywhere in packages/.

`dist/` is built by this package's `prepare` script (`tsc -p .`), which
root `npm ci`/`npm install` runs automatically. If `dist/` is missing
after a manual wipe, re-run `npm ci` (or `npm install`) at the repo
root rather than calling `tsc` by hand.
