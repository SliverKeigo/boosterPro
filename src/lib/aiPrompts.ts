import { prisma } from '@/lib/prisma'

// AI 提示词内置默认值（库中无对应 key 时回退，保证 AI 永不因缺提示词而崩）。模板用 {{变量}} 占位。
export const PROMPT_DEFAULTS: Record<string, { name: string; content: string; description: string }> = {
  job_profile: {
    name: '岗位画像分析',
    content:
      '岗位名称：{{positionName}}\n岗位 JD：\n{{jobDescription}}\n\n' +
      '请先联网搜索该岗位当前（最近一年）的主流技术栈与任职要求趋势，确保提炼的技术与要求是【当下最新】的，不要使用已过时的技术。\n' +
      '然后结合 JD 分析「岗位简易画像」，从岗位知识、专业技能、管理能力、项目经验、行业经验、资质证书等各方面提炼要求。\n\n' +
      '严格只返回 JSON（不要多余文字、不要 markdown 围栏、不要引用角标）：\n' +
      '{"profiles":[{"category":"分类名称","description":"该方面的具体要求"}]}\n' +
      '条目数量与分类根据该 JD 的实际情况灵活确定（可能 3 条，也可能 6-8 条），不要固定数量。',
    description: '可用变量：{{positionName}} 岗位名称、{{jobDescription}} 岗位 JD。要求返回 {"profiles":[{category,description}]}。',
  },
  company_info: {
    name: '客户信息智能填充',
    content:
      '请联网搜索「{{companyName}}」的最新公开信息，提取用于自动填充客户档案的字段。\n' +
      '对标企业务必是【当前真实存在】的竞品（排除已倒闭 / 已被收购 / 已退出市场的）。\n\n' +
      '严格只返回 JSON（不要多余文字、不要 markdown 围栏、不要引用角标）：\n' +
      '{"industry":"所属行业","region":"总部所在城市或地区","formerName":"公司曾用名（无则空字符串）","detailedAddress":"总部详细地址（街道门牌等，能查到则填，查不到则空字符串）","companyCulture":"企业文化与福利简述(150字内)","benchmarkCompanies":"对标竞品公司，多个用顿号分隔"}',
    description: '可用变量：{{companyName}} 公司名称。要求返回 {industry,region,formerName,detailedAddress,companyCulture,benchmarkCompanies}。',
  },
  supplement_opening: {
    name: '客户补充-开聊话术',
    content:
      '客户公司：{{company}}\n具体需求/补充：{{demand}}\n\n' +
      '请先联网搜索该公司的最新公开信息（主营业务、行业地位、规模、亮点、企业文化与福利等），' +
      '然后为猎头顾问生成一段「开聊话术」——用于向【候选人】介绍并推荐该客户公司、激发候选人兴趣。\n' +
      '话术要真实可信、有吸引力、口语化，突出该公司对候选人的价值点，约 150-300 字。\n\n' +
      '严格只返回 JSON（不要多余文字、不要 markdown 围栏）：{"opening":"话术内容"}',
    description: '可用变量：{{company}} 客户公司名、{{demand}} 具体需求/补充。要求返回 {"opening":"话术内容"}。',
  },
}

/**
 * 取提示词模板并填充变量：库（ai_prompts.key）优先，缺失则回退 PROMPT_DEFAULTS；
 * 再把模板里的 {{变量}} 用 vars 替换（缺失变量替为空串）。
 */
export async function getPrompt(key: string, vars: Record<string, string | undefined> = {}): Promise<string> {
  let tmpl = PROMPT_DEFAULTS[key]?.content ?? ''
  try {
    const row = await prisma.aiPrompt.findUnique({ where: { key }, select: { content: true } })
    if (row?.content?.trim()) tmpl = row.content
  } catch {
    /* 库不可用时用默认值，保证 AI 不因取提示词失败而崩 */
  }
  return tmpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, v) => vars[v] ?? '')
}
