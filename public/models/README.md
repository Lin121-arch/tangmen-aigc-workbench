# Director-stage character asset

## Storyboarder actors (2026-11-04)

Four local GLB actors in `storyboarder/` come from Wonder Unit's
`wonderunit/shot-generator-models` at commit
`8195e380179561c04bcd1b5ed4a772c305245dff`.
Upstream README, MIT LICENSE and byte sizes/SHA-256 checksums are included.
The original GLBs are unchanged. Runtime adaptation selects LOD0, isolates
skeletons/materials, preserves the authored texture, adapts body morphs and
existing director gestures, and anchors feet in actor-local coordinates.
Reproduce imports with `node scripts/fetch-storyboarder-actors.mjs`.
This source's MIT notice does not cover other folders or user-imported models.

## Existing UE mannequin

`ue-mannequin-retopology.glb` is the **UE Mannequin (Retopology)** model by William Luque.

- Source: https://sketchfab.com/3d-models/ue-mannequin-retopology-5394d9f894374a2ab7c57a21929ce4c2
- Upstream implementation reference: https://github.com/jiguang132/storyai-3d-director-desk
- Asset license: Sketchfab Standard License. See `ue-mannequin-retopology.license.txt` in this directory.

The upstream application's source code is MIT licensed, but that MIT license does not replace the model's separate asset license. Preserve this notice and the adjacent license file when redistributing builds that contain the model.
