import { useEffect, useRef, useState } from 'react'
import { workspaceTutorials, type TutorialChapter, type TutorialTopic } from '../shared/workspace-tutorial'

const chapters = [
  {
    title: '先做一张原创角色图',
    intro: '第一次练习只完成一张图。熟悉操作后，再让同一角色进入分镜和视频。',
    steps: ['回到首页，先检查「系统配置」中的图片服务。普通电脑可以使用云端接口，无需先安装本地大模型。', '新建项目，选择「原创二次元角色设定」起步模板和一个新的项目文件夹。', '进入画布后，打开左上角「实操指引」，按提示完成第一个图片节点。'],
    note: '教程和模板本身不会提交生成任务。只有你点击节点的生成按钮，才会调用对应模型。',
  },
  {
    title: '把接口配置好',
    intro: '对话、图片和视频使用各自的配置。对话能用，不代表视频接口也已配置完成。',
    steps: ['进入「系统配置 → 模型服务」，添加官方或自定义服务商，填写通用 API Key，再选择端点协议和 Base URL。多个服务商可以同时保留。', '图片：读取可用模型列表或手动登记模型 ID，确认是否支持参考图编辑及数量上限。视频：添加视频端点和模型；自定义 JSON 视频还需按文档填写提交／查询协议及 image 或 images 首帧变量。', '对话：为助手登记支持工具调用的 Chat Completions 模型。只做图片不必先接视频；已有图片可直接交给视频模型，不要求再接图片生成服务。', '在「默认用途」选择助手、图片、视频模型，点击顶部「保存配置」。模板会带入默认选择，也可逐节点改用其他服务。旧项目的连接仍可在兼容区维护。'],
    note: '能读取模型列表只代表列表请求成功。请先手动生成一张图片或一段短视频验证实际权限、协议与额度。',
  },
  {
    title: '看懂画布并替换内容',
    intro: '一个节点是一份工作，连线表示素材引用。先把模板变成自己的内容。',
    steps: ['点击图片节点，展开提示词。把【角色、产品、场景】等占位内容替换成自己的描述。', '滚轮缩放；按住 Shift＋滚轮水平移动，Alt＋滚轮上下移动。空格拖动或中键拖动也可以移动画布。', '使用底部选择工具框选多个节点，点击「复制选择」或 Ctrl＋D 复制分支；「整理布局」按引用方向重新排列全部节点，Ctrl＋Z 可撤销。', '已有商品图或角色图时，用左侧「上传」导入素材，再作为参考图连接到目标节点。原始商品封面和文字应以真实素材为准。'],
    note: '生成节点的副本会清空旧结果，保留提示词和引用关系；上传的素材节点保留实际素材。复制不会再次收费生成。',
  },
  {
    title: '完成第一张图片',
    intro: '先从没有上游引用的第一个图片节点开始。一次只验证一个结果。',
    steps: ['检查节点顶部的图片模型。若使用 Luna，请确认系统配置里已经保存实际模型 ID。', '提示词示例：原创二次元学习伙伴，短蓝发，白色连帽衫，手持空白笔记本，半身正面，干净浅色背景，不出现文字、商标或已有动漫角色。', '点击生成，等待图片回到节点。结果通常也会保存在项目目录中，不需要把聊天回答截图当素材。', '继续做角色多视图或连续分镜时，先确认上游图片已生成，再检查下游参考图是否正确。需要支持参考图的模型，才能发送参考素材。'],
    note: 'Luna 未识别模型暂按文生图处理，不发送参考图；画幅写入提示词，实际尺寸以服务返回为准。',
  },
  {
    title: '从图片到短视频',
    intro: '图片通过检查后，再做一段短视频。建议先验证一个镜头。',
    steps: ['选择带视频的模板，或用底部「视频」添加节点。先生成／上传图片，再将它连接到视频节点并核对首帧。', '选择已配置的真实视频模型。显示「视频工作流待配置」时，应先选模型，不能直接生成。', '动作提示词示例：角色保持正面，轻轻抬起笔记本并微笑，镜头缓慢推进，背景不变，动作自然；时长按服务支持的范围设置。', '手动点击视频生成。若有异常，打开右上角「生成任务」查看状态；已提交的任务优先恢复查询。'],
    note: '连线不会自动执行上下游任务。角色一致性、文字准确性和动作质量都需要人工检查，工作台不承诺自动完成成片剪辑。',
  },
  {
    title: '使用助手与保存结果',
    intro: '让助手帮助拆解任务和调整画布，你来决定什么时候生成。',
    steps: ['右侧选择「唐门创作助手」。可以输入：读取当前画布，把角色改成原创蓝发学习伙伴，先说明修改计划，不生成媒体。', '模板随附的「实操说明」在聊天文档卡片中，包含具体步骤、可复制的助手任务及开源来源。', '助手可以协助创建、修改和连接节点；图片和视频生成仍需在节点中手动操作。', '检查画布右上角保存状态，显示「已保存」后可返回首页。媒体与实操说明保存在创建时选择的项目文件夹。'],
    note: '拿到素材后，还需要自行完成配音、字幕、剪辑和平台发布。先完成一个作品，再复制分支尝试新版本。',
  },
  {
    title: '遇到问题怎么处理',
    intro: '先区分配置、生成任务和素材引用的问题，避免反复提交同一个任务。',
    steps: ['提示没有密钥／模型：返回首页进入系统配置，核对对应服务并保存，再重新打开项目。', '接口报错：检查实际模型 ID、服务地址、额度和视频提交／查询字段；不要用报价里的名字替代接口模型 ID。', '一直生成中、查询失败或提交结果未知：先看「生成任务」，核对服务端记录，修正配置后恢复查询，不要连续重复点击生成。', '参考图不生效：确认上游有真实图片、参考轨顺序正确、模型支持参考图；中转视频还要检查请求模板是否传入首帧。', '找不到节点／按钮：点击「适应画布」或收起右侧聊天。保存失败时先点击重试，保留当前窗口。'],
    note: '把错误提示、具体模型 ID 和操作步骤提供给辅导人员即可；不要在群聊或截图中泄露 API Key。',
  },
]

const topicNames = { beginner: '新手教程', canvas: '画布教程', director: '导演台教程' }

export function BeginnerTutorialButton({ topic = 'beginner', beforeOpen, disabled = false }: { topic?: TutorialTopic; beforeOpen?: () => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  return <>
    <button ref={trigger} type="button" disabled={disabled} onClick={() => { beforeOpen?.(); setOpen(true) }} className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#e8c766] hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-[#e8c766] disabled:opacity-40">{topicNames[topic]}</button>
    {open && <BeginnerTutorial initialTopic={topic} onClose={() => { setOpen(false); trigger.current?.focus() }} />}
  </>
}

function BeginnerTutorial({ initialTopic, onClose }: { initialTopic: TutorialTopic; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const body = useRef<HTMLElement>(null)
  const [index, setIndex] = useState(0)
  const [topic, setTopic] = useState(initialTopic)
  const currentChapters: TutorialChapter[] = topic === 'beginner' ? chapters.map((chapter, i) => ({ ...chapter, label: ['开始练习', '模型配置', '画布操作', '第一张图', '第一段视频', '助手与保存', '问题处理'][i] })) : workspaceTutorials[topic]
  const chapter = currentChapters[index]
  const close = () => { dialog.current?.close(); onClose() }
  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => { body.current?.scrollTo(0, 0) }, [index, topic])
  return <dialog ref={dialog} data-canvas-node-editor-dialog aria-labelledby="tutorial-title" onCancel={event => { event.preventDefault(); close() }} className="fixed inset-0 m-auto max-h-[85vh] w-[900px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-white/10 bg-[#111119] p-4 text-[#e8e6df] shadow-2xl backdrop:bg-black/70 sm:p-6">
    <div className="flex max-h-[calc(85vh-48px)] min-h-0 flex-col">
    <header className="flex shrink-0 items-center justify-between gap-4"><h2 id="tutorial-title" className="text-lg font-semibold">{topicNames[topic]}</h2><button autoFocus onClick={close} aria-label={`关闭${topicNames[topic]}`} className="rounded-lg px-3 py-2 text-sm text-[#b9b6c2] hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-[#e8c766]">关闭</button></header>
    <nav aria-label="教程分类" className="mt-3 flex shrink-0 gap-2">{(Object.keys(topicNames) as TutorialTopic[]).map(value => <button key={value} type="button" aria-pressed={topic === value} onClick={() => { setTopic(value); setIndex(0) }} className={`rounded-lg px-3 py-2 text-sm ${topic === value ? 'bg-[#d4af37]/15 text-[#e8c766]' : 'text-[#b9b6c2] hover:bg-white/5'}`}>{topicNames[value]}</button>)}</nav>
    <nav aria-label="教程章节" className="mt-4 flex shrink-0 flex-wrap gap-2 border-b border-white/10 pb-4">
      {currentChapters.map((item, i) => <button key={item.title} onClick={() => setIndex(i)} aria-current={index === i ? 'step' : undefined} className={`rounded-lg px-3 py-2 text-xs leading-5 focus-visible:outline-2 focus-visible:outline-[#e8c766] ${index === i ? 'bg-[#d4af37]/15 text-[#e8c766]' : 'text-[#b9b6c2] hover:bg-white/5'}`}>{i + 1}. {item.label}</button>)}
    </nav>
    <section ref={body} aria-live="polite" aria-label="当前教程内容" className="min-h-0 flex-1 overflow-y-auto py-5 pr-2">
      <h3 className="text-xl font-semibold">{chapter.title}</h3>
      <p className="mt-3 text-sm leading-7 text-[#b9b6c2]">{chapter.intro}</p>
      <ol className="mt-5 list-decimal space-y-4 pl-5 text-sm leading-7 marker:text-[#e8c766]">{chapter.steps.map(step => <li key={step} className="pl-1">{step}</li>)}</ol>
      {chapter.practice && <p className="mt-5 rounded-lg bg-white/5 px-4 py-3 text-sm leading-7"><strong className="font-medium text-[#e8c766]">动手练习：</strong>{chapter.practice}</p>}
      <p className="mt-6 border-t border-white/10 pt-4 text-xs leading-6 text-[#cdb064]">{chapter.note}</p>
    </section>
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
      <button disabled={index === 0} onClick={() => setIndex(i => i - 1)} className="rounded-lg border border-white/10 px-4 py-2 text-sm disabled:opacity-35">上一节</button>
      <button type="button" onClick={close} className="rounded-lg px-2 py-2 text-xs text-[#b9b6c2] hover:bg-white/5">回到操作</button>
      <span className="text-xs tabular-nums text-[#b9b6c2]">{index + 1} / {currentChapters.length}</span>
      <button onClick={() => index === currentChapters.length - 1 ? close() : setIndex(i => i + 1)} className="rounded-lg bg-[#d4af37] px-4 py-2 text-sm font-semibold text-[#241a05] hover:bg-[#e8c766]">{index === currentChapters.length - 1 ? '返回工作台' : '下一节'}</button>
    </footer>
    </div>
  </dialog>
}
