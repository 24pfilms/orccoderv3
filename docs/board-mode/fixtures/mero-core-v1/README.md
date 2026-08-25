# Mero core characterization fixture v1

This deterministic fixture was created for Board Mode parity and runs only in an isolated temporary Chrome profile and SQLite store.

## Coverage

- 2 nested frames with child references.
- 1 sticky note with votes and rotation.
- 1 editable text item.
- 3 representative shapes: rounded rectangle, circle, and diamond.
- 1 bidirectional arrow.
- 1 raster image with a per-item drawing overlay.
- Non-default pan/zoom, canvas color, dot density, z-order, text colors, dimensions, and rotations.
- Deterministic IDs and timestamps.
- Separate malformed/unsupported cases: duplicate IDs, broken frame child, invalid zoom/dimensions, remote image dependency, YouTube, Obsidian absolute path, and unknown future type.

## Files and provenance

- `fixture.json`: authored fixture matching Mero's Dexie/server item fields; SHA-256 `c85b764855ddbc96bba4ef292168dc73f21c2f076bbb55baeb98720f8944bf96`.
- `fixture-image.png`: deterministic generated RGBA gradient, 320×180; SHA-256 `2f8eb21a30cc00ec541915a8d975278ea2a4fa2ba893a1558254a525731033ba`.
- `fixture-drawing.png`: deterministic generated transparent RGBA stroke, 320×180; SHA-256 `b78810c64a07ff17d0e41180562e5e49652cc56f75415cae382f82c13d55769c`.
- `malformed-and-unsupported.json`: authored negative fixture; SHA-256 `646067b9f59cde4584f0127111c5d61b1dc96d0d376a7afb50936c816c773c8d`.

No source file, user board, remote media, absolute real path, token, password, API key, or live Mero profile is included.
