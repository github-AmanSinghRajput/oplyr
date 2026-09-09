// A stand-in for `sharp`, shipped into the packaged app's node_modules so that
// `@xenova/transformers` can be imported at all.
//
// Why this exists:
//   `@xenova/transformers/src/utils/image.js` opens with a STATIC `import sharp from 'sharp'`, and
//   `transformers.js` re-exports that file, so the module has to RESOLVE before anything else in
//   the library runs. Without it a packaged build dies at load with
//     Cannot find package 'sharp' imported from .../@xenova/transformers/src/utils/image.js
//   and every brain memory is stored with no vector while recall silently falls back to keyword
//   overlap. Same failure as the missing onnxruntime-node, one dependency further along.
//
// Why a stub rather than the real thing:
//   sharp exists to decode and resize IMAGES. Oplyr embeds text and nothing else, so the code that
//   would touch it is never reached. Shipping it would add ~25MB (23MB of vendored libvips) plus a
//   37-package dependency closure that would each have to be enumerated in extraResources by hand,
//   which is the very list whose gaps caused this bug twice.
//
// Why this is safe rather than clever:
//   Running without sharp is the library's OWN supported configuration. Its package.json declares
//   `"browser": { "sharp": false, ... }`, and image.js guards every use behind `else if (sharp)`,
//   so a falsy default disables image loading and leaves the text path untouched. Both of those
//   facts are pinned by sharp-stub.test.ts, which fails if a future version stops tolerating this
//   and we therefore have to ship the real package.
export default null;
