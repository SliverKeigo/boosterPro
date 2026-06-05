/* eslint-disable @typescript-eslint/no-explicit-any */
// 「可回导」导出列（客户端，无 prisma）。表头须与服务端 importConfigs 一致，以保证导出→改→导入闭环。
// 关系列导出名称、子表列导出 JSON 数组、首列固定 id（导入据此判定更新/新增）。

export interface RoundTripColumn {
  header: string
  getValue: (row: any) => any
}

const GENDER_LABELS: Record<string, string> = { MALE: '男', FEMALE: '女' }

export const IMPORT_COLUMNS: Record<string, RoundTripColumn[]> = {
  TALENT_POOL: [
    { header: 'id', getValue: (r) => r.id },
    { header: '姓名', getValue: (r) => r.name ?? '' },
    { header: '性别', getValue: (r) => GENDER_LABELS[r.gender] ?? '' },
    { header: '出生年月', getValue: (r) => r.birthYear ?? '' },
    { header: '最高学历', getValue: (r) => r.education ?? '' },
    { header: '联系电话', getValue: (r) => r.phone ?? '' },
    { header: '当前职位', getValue: (r) => r.currentPosition ?? '' },
    { header: '意向职位', getValue: (r) => r.targetPosition ?? '' },
    { header: '所属行业', getValue: (r) => r.positionType ?? '' },
    { header: '职位级别', getValue: (r) => r.positionLevel ?? '' },
    { header: '人才标签', getValue: (r) => (Array.isArray(r.tags) ? r.tags.join('、') : (r.tags ?? '')) },
    { header: '简历及相关资料', getValue: (r) => r.resumeUrl ?? '' },
  ],
}
