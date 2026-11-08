import type { CanvasNodeSnapshot, CanvasEdgeSnapshot } from './ipc.types';
import { LUNA_IMAGE_WORKFLOW_ID } from './luna-config';

// A deliberate unconfigured relay ID: never silently fall back to a local GPU workflow.
export const TEMPLATE_VIDEO_WORKFLOW_ID = 'relay-video:template-select-model';
const COMFY_COMMIT = 'c067929d7e9cc0f3fd15be348fa1a1d85da15946';
const MONEY_COMMIT = '4318f3a02ea83b4a75efd68e35b8d88a1f3b9d28';
const source = (repo: string, commit: string, file: string, title: string) => ({
  title, url: `https://github.com/${repo}/blob/${commit}/${file}`, license: 'MIT',
});
const turnaround = source('Comfy-Org/workflow_templates', COMFY_COMMIT, 'templates/api_google_nano_banana_create_turnaround_sheet.json', 'ComfyUI 官方：角色四视图');
const kontext = source('Comfy-Org/workflow_templates', COMFY_COMMIT, 'templates/api_bfl_flux_1_kontext_multiple_images_input.json', 'ComfyUI 官方：参考图编辑与一致性');
const imageVideo = source('Comfy-Org/workflow_templates', COMFY_COMMIT, 'templates/api_bytedance_image_to_video.json', 'ComfyUI 官方：图生视频');
const script = source('harry0703/MoneyPrinterTurbo', MONEY_COMMIT, 'docs/loomloom/moneyprinterturbo-script-candidates.template.json', 'MoneyPrinterTurbo：短视频文案候选');
const social = source('harry0703/MoneyPrinterTurbo', MONEY_COMMIT, 'app/services/llm.py', 'MoneyPrinterTurbo：build_social_metadata_prompt');

interface TemplateNode {
  key: string;
  title: string;
  prompt: string;
  kind: 'image' | 'video';
  column: number;
  row: number;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  reference?: string;
}
export interface CreativeTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  outcome: string;
  preparation: string;
  adaptation: string;
  sources: ReturnType<typeof source>[];
  steps: string[];
  agentTask: string;
  nodes: TemplateNode[];
}
const image = (key: string, title: string, prompt: string, column: number, row = 0, reference?: string): TemplateNode => ({ key, title, prompt, column, row, reference, kind: 'image' });
const video = (key: string, title: string, prompt: string, column: number, row: number, reference: string): TemplateNode => ({ key, title, prompt, column, row, reference, kind: 'video' });
const characterPrompt = '原创二次元学习搭子“小曜”，深蓝短发，金色圆框眼镜，米白连帽衫，青色小背包，亲切的青年形象。全身正面站姿，双手自然放松，纯浅灰背景，干净赛璐璐风格，清晰轮廓，无文字、无商标，角色居中，16:9。';

// Adapted prompts/graph patterns; originals and their MIT licenses ship in public/template-sources.
export const CREATIVE_TEMPLATES: readonly CreativeTemplate[] = [
  {
    id: 'anime-character', name: '原创二次元角色设定', category: '二次元',
    description: '先定一个原创角色，再做四视图和表情设定，作为后续系列内容的参考。',
    outcome: '角色主设定图 + 四视图 + 表情设定图，共 3 张待生成图片。',
    preparation: '支持参考图的云端生图模型；示例角色可直接改名、换服装。',
    adaptation: '移植官方四视图提示词的视角、一致性和布光结构，并将机器人改为原创学习搭子；21:9 改为本工作台支持的 16:9，不复制上游图片。',
    sources: [turnaround, kontext],
    steps: [
      '生成“角色主设定”，挑选满意的一张后，再处理右侧节点。',
      '打开“四视图”和“表情设定”，确认参考图列表已显示角色主设定，再逐张生成。',
      '检查发型、服装、配色是否一致。若某张偏离，只修改对应节点后重做。',
    ],
    agentTask: '请先读取本项目的模板说明和画布。我要把“小曜”改成【填写角色设定】，请保留角色主设定→四视图/表情设定的引用关系，更新三个节点的提示词。先给我确认角色描述，不要提交图片或视频生成。',
    nodes: [
      image('character', '角色主设定', characterPrompt, 0),
      image('turnaround', '角色四视图', '以图1为唯一角色参考。Orthographic character sheet, full body turnaround views：同一角色正面、左侧、背面、右侧四视图，外貌、发型、服装与配色完全一致，平整柔光，纯浅灰背景，等距排列，干净赛璐璐线条，无文字，16:9。', 1, 0, 'character'),
      image('expressions', '角色表情设定', '以图1为唯一角色参考，保持相同面部特征、发型、眼镜和服装。六格半身表情设定：开心、思考、惊讶、鼓励、认真、困惑。每格只改变表情和小幅手势，统一平视机位，浅色背景，无文字，16:9。', 1, 1, 'character'),
    ],
  },
  {
    id: 'anime-storyboard', name: '二次元连续分镜短片', category: '二次元',
    description: '用同一个角色拍三个镜头，练习人物一致性、镜头衔接和图生视频。',
    outcome: '1 张角色图 + 3 张分镜图 + 3 段各 5 秒的待生成片段。',
    preparation: '参考图生图模型 + 支持首帧的视频 API；配音、字幕与成片剪辑另行完成。',
    adaptation: '将官方参考图编辑和首帧图生视频图结构组合为三镜头；故事、角色和中文提示词为唐门适配。',
    sources: [kontext, imageVideo],
    steps: [
      '先生成最左侧角色图，再生成中列三个分镜，逐张检查人物是否一致。',
      '为右列视频节点选择你已配置的云端视频模型；首帧已预先关联对应分镜。',
      '先试做一个 5 秒镜头，确认画风和动作后再生成其余片段，最后导入剪辑软件衔接。',
    ],
    agentTask: '请读取模板说明和画布，将“深夜赶稿”故事改为【我的故事】。保留同一角色参考和分镜→视频首帧关系，为三个镜头分别写景别、动作与运镜。故事控制为三镜头，不增加生成任务。',
    nodes: [
      image('character', '角色参考 · 小曜', characterPrompt, 0),
      ...[
        ['开场 · 深夜书桌', '图1中的同一角色在深夜书桌前看着堆叠的练习本，面露困惑。中景，暖色台灯与窗外蓝色夜景，保留图1的五官发型服装，二次元赛璐璐画风，无文字，9:16。', '角色轻轻低头看练习本，再抬头思考；镜头缓慢推近，台灯稳定，不换装、不换脸，无字幕。'],
        ['转折 · 灵感亮起', '图1中的同一角色坐在同一书桌前，举起一张画有简洁几何图形的卡片，露出恍然大悟的微笑。半身近景，暖色台灯，保持角色外貌和服装一致，无文字，9:16。', '角色微笑着举起卡片，眼神由卡片移向镜头；轻微镜头推进，保持手和卡片形状稳定，不生成文字。'],
        ['收尾 · 从容完成', '图1中的同一角色在整理好的书桌前合上练习本，轻松伸展肩膀。中景，窗外接近黎明，保持发型眼镜衣服与图1一致，无文字，9:16。', '角色缓慢合上练习本，轻轻伸展肩膀，露出轻松表情；固定镜头，保持外貌与室内陈设一致，无字幕。'],
      ].flatMap(([title, prompt, motion], index) => [
        { ...image(`shot-${index}`, title, prompt, 1, index, 'character'), aspectRatio: '9:16' as const },
        video(`clip-${index}`, `${title} · 5秒`, motion, 2, index, `shot-${index}`),
      ]),
    ],
  },
  {
    id: 'textbook-explainer', name: '教材知识点可视化讲解', category: '教材内容',
    description: '以“三角形的稳定性”为例，把一个知识点拆成问题、演示、总结。',
    outcome: '3 张示意图 + 3 段各 5 秒的待生成演示片段；说明内含口播任务。',
    preparation: '确认教材版本与知识点；示例用原创示意画面，公式和字幕在剪辑时准确添加。',
    adaptation: '借用 MoneyPrinterTurbo 的主题→口播→素材关键词结构，结合官方图生视频案例；未接入上游自动配音、素材下载和成片功能。',
    sources: [script, imageVideo],
    steps: [
      '先在右侧助手对话中按说明生成三段口播，核对概念和示例是否正确。',
      '依次生成问题、演示、总结三张图；图形有误时先修正，确认后再生成视频。',
      '每段试做 5 秒，再配口播、正确标注和字幕；动画仅作直观说明，不能替代准确的几何演示。',
    ],
    agentTask: '参照模板的三段结构，围绕【年级/教材版本/知识点】写一份约30秒的中文口播。先列问题、演示、总结，再输出JSON：{"script":"完整口播","videoTerms":["英文素材关键词"]}，给5到10个素材词。只使用核实过的知识，随后提出三张示意图的改写建议；先等我确认，不提交生成。',
    nodes: [
      ...[
        ['问题 · 哪个框架更稳', '干净的科普桌面，左侧三根木棒组成一个完整三角形框架，右侧四根木棒组成正方形框架，连接点清楚，正上方俯视，柔和光线，原创教材插画风格，画面上方留白给后期标题，不生成文字或公式，9:16。', '固定俯视镜头，三角形框架保持形状；指示光点缓慢移向三角形，无手部操作，不新增木棒，不变更几何拓扑，无文字。'],
        ['演示 · 三角支撑', '原创科普示意图，一座简洁的小桥模型，桥侧面清楚显示三角形支撑结构，纯净浅色背景，微缩摄影质感，结构完整、易辨识，上方留白用于后期标注，不生成文字，9:16。', '镜头沿小桥侧面缓慢平移，呈现已存在的三角支撑结构，桥体保持静止和稳定，光线不变，无文字。'],
        ['总结 · 生活中的三角形', '原创科普插画，同一画面清楚展示自行车车架和屋顶三角支撑两个日常例子，干净背景，几何结构简明，预留顶部与底部字幕空间，不生成文字，9:16。', '镜头缓慢推近自行车车架，突出已存在的三角形结构，物体不变形不移动，无字幕，无新增零件。'],
      ].flatMap(([title, prompt, motion], index) => [
        { ...image(`image-${index}`, title, prompt, 0, index), aspectRatio: '9:16' as const },
        video(`video-${index}`, `${title} · 5秒`, motion, 1, index, `image-${index}`),
      ]),
    ],
  },
  {
    id: 'product-video', name: '教材与商品种草短片', category: '视频带货',
    description: '练习“使用场景—内容展示—收尾”的三段式商品短片，再换成自己的实拍素材。',
    outcome: '3 张商品练习场景图 + 3 段各 5 秒片段；均为待生成草稿。',
    preparation: '准备真实商品封面、内页和准确卖点；示例无品牌练习册仅供练习。',
    adaptation: '移植短视频脚本结构和参考图→视频流程，增加真实商品素材替换步骤；不包含自动挂车或平台发布。',
    sources: [script, kontext, imageVideo],
    steps: [
      '先用无品牌练习册示意图练熟一条流程，不能把练习图当作真实商品展示。',
      '正式制作时用左侧“上传”导入真实封面和内页，连接到对应图片节点，或把实拍图直接连到视频作为首帧。可让助手协助换连线。',
      '核实商品名、年级、版本与卖点；先做一个视频镜头，确认后再完成其余镜头，并在剪辑软件加入真实价格与文案。',
    ],
    agentTask: '我要介绍【商品名称/年级/版本】，已核实卖点是【填写】。参照模板写三段口播与素材词JSON，分别对应使用场景、真实内容展示、收尾。未提供的信息标为待确认，不编造提分或销量。先给我文案并指出需要上传哪些实拍素材，暂不生成或发布。',
    nodes: [
      image('scene', '使用场景 · 练习示意', '一张整洁学习桌，桌面放置无品牌米白封面的练习册、铅笔和橡皮，晨间自然光，写实商品摄影，书本完整清晰，封面空白，不生成品牌、书名或虚构教材内页，上方留白，9:16。', 0),
      video('scene-video', '使用场景 · 5秒', '镜头从桌面前方缓慢推向练习册，保持书本、文具的位置与封面一致，纸张静止，不出现手，不生成文字。', 1, 0, 'scene'),
      image('detail', '内容展示 · 待换实拍', '无品牌练习册摊开在同一张木质学习桌上，页面只展示抽象浅灰几何版式，不出现可读题目，柔和自然光，写实摄影，练习用示意画面，无文字，9:16。', 0, 1, 'scene'),
      video('detail-video', '内容展示 · 5秒', '固定俯视镜头缓慢推近已摊开的页面，纸张保持完全静止，不翻页，不改写内容，不出现新文字和图案。', 1, 1, 'detail'),
      image('closing', '收尾主视觉 · 练习示意', '以图1中的无品牌练习册为同一物体，保持封面颜色、形状和装订不变，置于整洁浅色桌面中央，旁边仅一支铅笔，柔和侧光，上方留足后期标题空间，无文字，9:16。', 0, 2, 'scene'),
      video('closing-video', '收尾主视觉 · 5秒', '镜头缓慢拉远，书本保持静止，柔和光线，封面与装订不变化，不生成文字或价格，不出现手。', 1, 2, 'closing'),
    ].map(node => ({ ...node, aspectRatio: '9:16' })),
  },
  {
    id: 'scene-variants', name: '同图换场景与风格对照', category: '图片制作',
    description: '保留同一主体，分别换背景、换画风，避免一次修改太多内容。',
    outcome: '1 张基础图 + 2 张参考图编辑结果，共 3 张待生成图片。',
    preparation: '支持参考图的生图模型；也可上传自己的产品照片，连接到两张变体图。',
    adaptation: '翻译并应用官方 Kontext 模板里的“分步编辑、明确保留内容、指定风格”提示词框架；不使用其本地图片拼接算子或上游照片。',
    sources: [kontext],
    steps: [
      '先生成基础图；有自己的图片时，用左侧“上传”导入，接到两个变体节点并移除原基础图入边。',
      '只换场景：保持主体位置、比例、材质和形状，只改变背景。',
      '只换画风：保持主体轮廓和构图，只改变绘画风格。对照三张图决定适合自己的方向。',
    ],
    agentTask: '请把模板中的白色马克杯改为【我的主体】。两个变体分别为【目标场景】与【目标画风】，每次只改变一个因素，并明确保留主体轮廓、比例和构图。若使用上传照片，请先读取画布确认准确节点ID，得到我确认后再更换参考连线。不要生成。',
    nodes: [
      image('base', '基础图 · 白色马克杯', '一个纯白陶瓷马克杯放在浅木色桌面上，无文字无商标，杯口和杯柄形状清楚，正面略俯视，居中构图，柔和自然光，写实商品摄影，16:9。', 0),
      image('background', '只换背景 · 窗边', 'Change the background to a bright window-side study desk, keep the subject in the exact same position and pose. 以图1为参考，马克杯的形状、材质、大小、位置和拍摄视角完全不变，只把背景换成明亮窗边书桌，保持真实摄影风格，无文字，16:9。', 1, 0, 'base'),
      image('style', '只换画风 · 二次元', 'Transform to a clean anime cel-shading style, while maintaining the original composition and object silhouette unchanged. 以图1为参考，保持杯子轮廓、杯柄、位置、比例和背景布局不变，仅改为清晰赛璐璐画风，干净线稿与平涂阴影，无文字，16:9。', 1, 1, 'base'),
    ],
  },
  {
    id: 'social-kit', name: '账号选题与封面套装', category: '内容运营',
    description: '围绕一个主题生成不同切入角度，配套封面底图和待发布文案。',
    outcome: '3 张封面底图节点；说明内附选题、口播与双平台发布文案任务。',
    preparation: '对话模型 + 生图模型；示例主题为学习方法，中文标题在剪辑或排版时添加。',
    adaptation: '移植文案候选的 subject/requirements/candidateIndex 输入结构，以及 title/caption/hashtags 输出结构；抖音、视频号的语气和封面主题为本地适配，不采用上游海外平台长度限制。',
    sources: [script, social],
    steps: [
      '把下方任务复制给创作助手，补充账号受众、主题和真实信息，先得到三个不同切入角度。',
      '挑一个角度修改封面底图；底图不生成中文标题，后期手动叠加以避免错字。',
      '让助手分别整理抖音、视频号的标题、简介、话题标签，人工核对后发布；记录真实数据，不预填虚构播放量。',
    ],
    agentTask: '我的账号受众是【填写】，本期主题是【填写】，已确认的信息是【填写】。请按candidateIndex=1/2/3分别给出反差、清单、故事三个角度，每项输出{"script":"约30秒口播","videoTerms":["5到10个简短英文素材词"]}。选题由我确认后，再分别为抖音和视频号输出{"title":"标题","caption":"含行动建议的简介","hashtags":["#相关话题"]}，简介不要混入标签。最后给出三张封面底图的改写建议；不编造账号数据，不自动发布。',
    nodes: [
      image('cover-contrast', '封面底图 · 反差角度', '学习方法主题封面底图，画面下方左侧是凌乱纸张，右侧是整齐归类的笔记与文具，温暖自然光，写实桌面摄影，视觉反差明确，上方三分之一纯净留白给后期标题，不出现文字、数字或商标，9:16。', 0),
      image('cover-list', '封面底图 · 清单角度', '学习方法主题封面底图，三组整齐摆放的笔记本、便签、铅笔组成清楚的三段视觉层次，浅米色桌面，俯拍，干净实用，上方三分之一留白给后期标题，不生成文字、数字和符号，9:16。', 1),
      image('cover-story', '封面底图 · 故事角度', '学习方法主题二次元封面底图，一位原创青年学习者坐在窗边整理笔记，温暖晨光，神情专注轻松，画面主体放在下半部，上方三分之一纯净留白给后期标题，清晰赛璐璐风格，无文字，9:16。', 2),
    ].map(node => ({ ...node, aspectRatio: '9:16' })),
  },
];

export function findCreativeTemplate(id: unknown): CreativeTemplate | undefined {
  if (id === undefined || id === '') return undefined;
  const template = CREATIVE_TEMPLATES.find(item => item.id === id);
  if (!template) throw new Error('所选模板不存在，请重新选择模板');
  return template;
}

export function buildTemplateSnapshot(template: CreativeTemplate, prefix: string, models: import('./template-models').TemplateModelSelection = {}) {
  const id = (key: string) => `${prefix}-${key}`;
  const rowSpacing = template.nodes.some(node => node.aspectRatio === '9:16' || node.kind === 'video') ? 1540 : 920;
  const nodes: CanvasNodeSnapshot[] = template.nodes.map(node => ({
    id: id(node.key), type: 'storyNode',
    position: { x: 100 + node.column * 820, y: 100 + node.row * rowSpacing },
    data: {
      kind: node.kind, title: node.title, prompt: node.prompt,
      aspectRatio: node.aspectRatio ?? (node.kind === 'video' ? '9:16' : '16:9'),
      workflowId: node.kind === 'image' ? models.imageWorkflowId || LUNA_IMAGE_WORKFLOW_ID : models.videoWorkflowId || TEMPLATE_VIDEO_WORKFLOW_ID,
      generationStatus: 'idle',
      ...(node.kind === 'video' ? { duration: 5, firstFrameNodeId: node.reference ? id(node.reference) : undefined } : {}),
      ...(node.reference ? { referenceImageNodeIds: [id(node.reference)] } : {}),
    },
  }));
  const edges: CanvasEdgeSnapshot[] = template.nodes.filter(node => node.reference).map(node => ({
    id: id(`edge-${node.key}`), source: id(node.reference!), target: id(node.key),
  }));
  return { type: 'react-flow' as const, version: 4 as const, nodes, edges, viewport: { x: 24, y: 45, zoom: 0.5 } };
}

export function buildTemplateGuide(template: CreativeTemplate, models: import('./template-models').TemplateModelSelection = {}): string {
  return `# ${template.name} · 实操说明

${template.description}

## 本项目已经准备好什么

${template.outcome}

已创建可编辑节点、提示词和参考连线。这是待实操模板，图片和视频尚未生成，不代表已经交付的成品案例。

## 开始前

${template.preparation}

图片节点统一使用：${models.imageWorkflowId || LUNA_IMAGE_WORKFLOW_ID}。请先在系统配置中保存对应服务的地址、密钥和实际模型 ID。参考图流程需要已确认支持参考图的模型；未知 Luna 模型只发送文字，不能据此宣称角色一致。

${models.videoWorkflowId ? `视频节点统一使用：${models.videoWorkflowId}。` : '视频节点显示“视频工作流待配置”，请在视频节点顶部选择已配置的云端视频模型。'}中转视频请确认提交协议包含 image 或 images 首帧变量。模板不依赖本机显卡，不会自动下载 ComfyUI 模型；如需更换，请在节点顶部单独选择。

选择模板和打开说明不会产生生成费用。生成按钮由你手动点击；请先验证一个镜头，再继续其余镜头。每条参考连线都需要上游已经生成或上传的有效图片，连线本身不会自动运行。

## 操作顺序

${template.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

## 给创作助手的任务

先填写【】中的信息，再将下面任务复制到右侧对话框发送。助手需要先在系统配置中配置支持工具调用的对话模型，也可以直接手动编辑节点。

> ${template.agentTask}

## 检查结果

- 图像主体、参考图顺序和真实信息是否正确。
- 视频首帧是否对应当前分镜；动作、手部、文字和结构是否出现错误。
- 模型支持的画幅与时长是否符合预期。Luna 的画幅通过提示词描述，实际尺寸以服务端返回为准。
- 口播、配音、字幕、剪辑和平台发布需另行完成；本模板不承诺自动成片、流量或收益。

## 开源来源与适配范围

${template.sources.map(item => `- [${item.title}](${item.url})，${item.license}。`).join('\n')}

${template.adaptation}

原始工作流 JSON 或提示词节选和完整 MIT 许可随应用保存在 template-sources 目录。上游原工作流要求的 ComfyUI 节点、原模型及其账号与本工作台不同；这里运行的是适配后的原生画布，不会将原 JSON 当作任意模型通用接口直接执行。示例素材、中文情境和课程安排为唐门本地新增。
`;
}
