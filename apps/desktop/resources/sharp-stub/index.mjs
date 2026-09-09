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
// Why the export must be TRUTHY:
//   image.js picks an image backend at module load:
//       if (BROWSER_ENV) { ... } else if (sharp) { ... } else { throw new Error('Unable to load
//       image processing library.') }
//   A falsy default therefore does not disable image support, it throws — which is exactly how
//   0.5.1 shipped, trading one broken embedding path for another. The library's own
//   `"browser": { "sharp": false }` map is safe only because a browser takes the FIRST branch.
//   In Node the value simply has to be truthy; the closure the branch installs is never invoked
//   unless something actually decodes an image, and Oplyr only ever embeds text.
//
// Why a stub rather than the real package:
//   sharp exists to decode and resize images. Shipping it would add ~25MB (23MB of vendored
//   libvips) plus a dependency closure that would each have to be enumerated in extraResources by
//   hand, which is the very list whose gaps caused this twice.
//
// This is verified, not reasoned about: embedding-packaging.test.ts imports the real
// @xenova/transformers against this stub in an isolated node_modules and embeds a sentence.
function unavailable() {
  throw new Error(
    'Oplyr ships a stub for sharp: the brain embeds text only, so no image decoding is available.'
  );
}

// A few properties transformers touches on the namespace, kept harmless.
unavailable.cache = unavailable;
unavailable.concurrency = unavailable;

export default unavailable;
