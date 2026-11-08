# Third-party notices

## Prompt tutorial

The independent prompt tutorial adapts methods and excerpts from these repositories. Original excerpts and license files are bundled as offline text in the tutorial from `src/content/prompt-sources/`. No upstream demonstration images were downloaded or redistributed.

- DAIR.AI / Prompt-Engineering-Guide, https://github.com/dair-ai/Prompt-Engineering-Guide , commit `57673726396dd94acb23bdb1e67f27c78ee85a8e`, Copyright (c) 2022 DAIR.AI. MIT license retained in `DAIR-LICENSE.md`. Original Chinese files: `pages/introduction/elements.zh.mdx` and `pages/introduction/tips.zh.mdx`.
- ZeroLu / awesome-nanobanana-pro, https://github.com/ZeroLu/awesome-nanobanana-pro , commit `a544d8ed0656953ca65cab27792e8475ade4dfad`. README content is marked CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/); the repository LICENSE separately states MIT and is retained in `NANOBANANA-LICENSE.md`. This tutorial preserves the content attribution rather than treating the MIT file as removing it. Excerpts: README sections 2.16, 4.2 and 8.1. Section 2.16 credits @underwoodxie96 (https://x.com/underwoodxie96/status/1995109628825489647); sections 4.2 and 8.1 credit https://mp.weixin.qq.com/s/lrYNbs4rGs3KOqewoZ6aNQ . The exact source links remain with the excerpts.

Local changes: shortened multi-keyframe concepts into one-shot continuity exercises, changed examples into original adult characters and learning-account compositions, separated title layout from image generation, and added native workbench instructions and actual validation status. The Chinese teaching prompts are adapted local examples, not upstream model benchmark results. Star counts are dated discovery snapshots, not endorsements or quality guarantees.

## Creative starter templates

The native canvas starter templates adapt prompts and graph patterns from the following MIT-licensed projects. Original JSON workflows, an extracted prompt function, attribution and full license texts are distributed in `dist/template-sources/` (source directory: `public/template-sources/`). No upstream sample images or videos are included. The adapted canvas does not execute the original ComfyUI graph or MoneyPrinterTurbo pipeline.

- Comfy-Org/workflow_templates, commit `c067929d7e9cc0f3fd15be348fa1a1d85da15946`, Copyright (c) 2023-present Comfy Org. Files: `api_google_nano_banana_create_turnaround_sheet.json`, `api_bfl_flux_1_kontext_multiple_images_input.json`, `api_bytedance_image_to_video.json`. Full license: `template-sources/comfy/LICENSE.txt`.
- harry0703/MoneyPrinterTurbo, commit `4318f3a02ea83b4a75efd68e35b8d88a1f3b9d28`, Copyright (c) 2024 Harry. Files: `docs/loomloom/moneyprinterturbo-script-candidates.template.json` and the `build_social_metadata_prompt` function excerpt from `app/services/llm.py`. Full license: `template-sources/moneyprinter/LICENSE.txt`.

Chinese examples, story situations and native node adapters were added locally. MIT source licenses do not license model services, third-party input materials or generated outputs on behalf of their owners. See `template-sources/README.md` for exact source links and adaptation boundaries.

## Vercel AI SDK

The Tangmen creative assistant uses the upstream SDK as a dependency, with original adapter code to connect its tool loop to the existing canvas and chat UI. Upstream package source files are unmodified.

- Project: https://github.com/vercel/ai
- Packages: `ai@7.0.159`, `@ai-sdk/openai-compatible@3.0.82`
- Copyright 2023 Vercel, Inc.
- License: Apache License, Version 2.0. A full copy is included at `public/licenses/Apache-2.0.txt` (distributed as `dist/licenses/Apache-2.0.txt`). Original package license notices remain in their dependency directories.

```text
Copyright 2023 Vercel, Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

## storyai-3d-director-desk

The director-stage rig loading, skeleton cloning, bone shaping, and pose-mapping implementation was adapted from:

- Project: https://github.com/jiguang132/storyai-3d-director-desk
- Copyright (c) 2026 YZ
- License: MIT

```text
MIT License

Copyright (c) 2026 YZ

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## UE Mannequin (Retopology)

- Author: William Luque
- Source: https://sketchfab.com/3d-models/ue-mannequin-retopology-5394d9f894374a2ab7c57a21929ce4c2
- License: Sketchfab Standard License

The original asset notice is preserved at `public/models/ue-mannequin-retopology.license.txt`. The source-code MIT license above does not replace the model's separate asset license.

The student Windows distribution built with `npm run build:student` excludes this legacy GLB and its asset notice. Its actor menu offers the separately documented Storyboarder actors and lightweight procedural model; saved legacy actor identifiers are displayed with a Storyboarder actor without rewriting the saved identifiers. The legacy asset remains in the teacher's source checkout pending separate distribution authorization.
