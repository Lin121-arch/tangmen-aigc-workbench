# 图片提示词案例原文节选

来源：ZeroLu/awesome-nanobanana-pro，固定版本 a544d8ed0656953ca65cab27792e8475ade4dfad。

README 标注内容许可 CC BY 4.0；保留每个案例原始来源。下文只移除了远程图片展示标签，不下载第三方示例图片。教程中的中文案例为唐门AI改编，非上游原文，也不代表这些案例已经在本站模型实测。

### 2.16. Cinematic Keyframe Generator
*Generates cinematic keyframes and storyboards from a reference image*


**Prompt:**
```text
<role>
You are an award-winning trailer director + cinematographer + storyboard artist. Your job: turn ONE reference image into a cohesive cinematic short sequence, then output AI-video-ready keyframes.
</role>

<input>
User provides: one reference image (image).
</input>

<non-negotiable rules - continuity & truthfulness>
1) First, analyze the full composition: identify ALL key subjects (person/group/vehicle/object/animal/props/environment elements) and describe spatial relationships and interactions (left/right/foreground/background, facing direction, what each is doing).
2) Do NOT guess real identities, exact real-world locations, or brand ownership. Stick to visible facts. Mood/atmosphere inference is allowed, but never present it as real-world truth.
3) Strict continuity across ALL shots: same subjects, same wardrobe/appearance, same environment, same time-of-day and lighting style. Only action, expression, blocking, framing, angle, and camera movement may change.
4) Depth of field must be realistic: deeper in wides, shallower in close-ups with natural bokeh. Keep ONE consistent cinematic color grade across the entire sequence.
5) Do NOT introduce new characters/objects not present in the reference image. If you need tension/conflict, imply it off-screen (shadow, sound, reflection, occlusion, gaze).
</non-negotiable rules - continuity & truthfulness>

<goal>
Expand the image into a 10–20 second cinematic clip with a clear theme and emotional progression (setup → build → turn → payoff).
The user will generate video clips from your keyframes and stitch them into a final sequence.
</goal>

<step 1 - scene breakdown>
Output (with clear subheadings):
- Subjects: list each key subject (A/B/C…), describe visible traits (wardrobe/material/form), relative positions, facing direction, action/state, and any interaction.
- Environment & Lighting: interior/exterior, spatial layout, background elements, ground/walls/materials, light direction & quality (hard/soft; key/fill/rim), implied time-of-day, 3–8 vibe keywords.
- Visual Anchors: list 3–6 visual traits that must stay constant across all shots (palette, signature prop, key light source, weather/fog/rain, grain/texture, background markers).
</step 1 - scene breakdown>

<step 2 - theme & story>
From the image, propose:
- Theme: one sentence.
- Logline: one restrained trailer-style sentence grounded in what the image can support.
- Emotional Arc: 4 beats (setup/build/turn/payoff), one line each.
</step 2 - theme & story>

<step 3 - cinematic approach>
Choose and explain your filmmaking approach (must include):
- Shot progression strategy: how you move from wide to close (or reverse) to serve the beats
- Camera movement plan: push/pull/pan/dolly/track/orbit/handheld micro-shake/gimbal—and WHY
- Lens & exposure suggestions: focal length range (18/24/35/50/85mm etc.), DoF tendency (shallow/medium/deep), shutter "feel" (cinematic vs documentary)
- Light & color: contrast, key tones, material rendering priorities, optional grain (must match the reference style)
</step 3 - cinematic approach>

<step 4 - keyframes for AI video (primary deliverable)>
Output a Keyframe List: default 9–12 frames (later assembled into ONE master grid). These frames must stitch into a coherent 10–20s sequence with a clear 4-beat arc.
Each frame must be a plausible continuation within the SAME environment.
</step 4 - keyframes for AI video>

<step 5 - contact sheet output (MUST OUTPUT ONE BIG GRID IMAGE)>
You MUST additionally output ONE single master image: a Cinematic Contact Sheet / Storyboard Grid containing ALL keyframes in one large image.
- Default grid: 3x3. If more than 9 keyframes, use 4x3 or 5x3 so every keyframe fits into ONE image.
Requirements:
1) The single master image must include every keyframe as a separate panel (one shot per cell) for easy selection.
2) Each panel must be clearly labeled: KF number + shot type + suggested duration (labels placed in safe margins, never covering the subject).
3) Strict continuity across ALL panels: same subjects, same wardrobe/appearance, same environment, same lighting & same cinematic color grade; only action/expression/blocking/framing/movement changes.
4) DoF shifts realistically: shallow in close-ups, deeper in wides; photoreal textures and consistent grading.
5) After the master grid image, output the full text breakdown for each KF in order so the user can regenerate any single frame at higher quality.
</step 5 - contact sheet output>

<final output format>
Output in this order:
A) Scene Breakdown
B) Theme & Story
C) Cinematic Approach
D) Keyframes (KF# list)
E) ONE Master Contact Sheet Image (All KFs in one grid)
</final output format>
```
*Source: [@underwoodxie96](https://x.com/underwoodxie96/status/1995109628825489647)*


### 4.2. Professional Product Photography
*Isolates products from messy backgrounds and places them in a high-end commercial studio setting.*


**Prompt:**
```text
Identify the main product in the uploaded photo (automatically removing any hands holding it or messy background details). Recreate it as a premium e-commerce product shot . Subject Isolation : Cleanly extract the product, completely removing any fingers, hands, or clutter . Background : Place the product on a pure white studio background (RGB 255, 255, 255) with a subtle, natural contact shadow at the base to ground it. Lighting : Use soft, commercial studio lighting to highlight the product's texture and material. Ensure even illumination with no harsh glare. Retouching : Automatically fix any lens distortion, improve sharpness, and color-correct to make the product look brand new and professional .
```
*Source: [WeChat Article](https://mp.weixin.qq.com/s/lrYNbs4rGs3KOqewoZ6aNQ)*


### 8.1. Viral Cover Image (Youtube/Douyin/TikTok)
*Creates engaging thumbnails with text overlays, exaggerated expressions, and bright graphics.*

  
  


**Prompt:**
```text
Design a viral video thumbnail using the person from Image 1. Face Consistency : Keep the person's facial features exactly the same as Image 1 , but change their expression to look excited and surprised . Action : Pose the person on the left side, pointing their finger towards the right side of the frame. Subject : On the right side, place a high-quality image of [a delicious avocado toast]. Graphics : Add a bold yellow arrow connecting the person's finger to the toast. Text : Overlay massive, pop-style text in the middle: '3分钟搞定!' (Done in 3 mins!). Use a thick white outline and drop shadow. Background : A blurred, bright kitchen background. High saturation and contrast.
```
*Source: [WeChat Article](https://mp.weixin.qq.com/s/lrYNbs4rGs3KOqewoZ6aNQ)*


