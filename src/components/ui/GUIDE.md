# boosterPro 通用 UI 组件使用指南（daisyUI 体系）

所有页面禁止使用 antd / @ant-design。统一用下列组件（从 `@/components/ui` 导入）+ daisyUI 类 + lucide-react 图标。

参照已完成的黄金样板：`src/app/(dashboard)/candidates/page.tsx` 和子表写法 `src/lib/candidateData.ts`。

## BoostTable —— 通用列表表格

内置：**新增/导入/导出按钮、全字段模糊搜索、显示列控制、排序、刷新、全屏、分页**。

```tsx
import { BoostTable, type BoostColumn } from '@/components/ui'

const columns: BoostColumn<any>[] = [
  { key: 'name', title: '名称' },                                   // 默认显示
  { key: 'customerName', title: '客户', accessor: (r) => r.customer?.shortName }, // 嵌套字段
  { key: 'status', title: '状态', render: (v) => <span className="badge badge-info badge-sm">{label[v]}</span> },
  { key: 'createdAt', title: '创建时间', render: (v) => v?.slice(0, 10) },
  { key: 'phone', title: '电话', defaultVisible: false },           // 默认隐藏，"显示列"里可勾选
]

<BoostTable
  title="列表标题" columns={columns} data={data} loading={loading} rowKey="id"
  onCreate={openCreate} onImport={() => toast.info('导入开发中')} onRefresh={fetchData}
  searchPlaceholder="搜索…"
  actions={(r) => (
    <div className="flex items-center gap-1">
      <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" />编辑</button>
      <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
        <button className="btn btn-ghost btn-xs gap-1 text-error"><Trash2 className="h-3.5 w-3.5" />删除</button>
      </Popconfirm>
    </div>
  )}
/>
```

**关键**：`columns` 必须覆盖该模型的**所有字段**（满足"显示列支持所有字段"），不常用的设 `defaultVisible: false`。

## Modal

```tsx
import { Modal } from '@/components/ui'
<Modal open={open} title={editing ? '编辑X' : '新增X'} onClose={() => setOpen(false)}
  onOk={handleSubmit} okText={editing ? '保存' : '创建'} confirmLoading={submitting} width={720}>
  {/* 表单 */}
</Modal>
```

## Field + daisyUI 表单控件

```tsx
import { Field } from '@/components/ui'
<div className="grid grid-cols-2 gap-4">
  <Field label="名称" required>
    <input className="input input-bordered w-full" value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="请输入" />
  </Field>
  <Field label="类型">
    <select className="select select-bordered w-full" value={form.type} onChange={(e) => setField('type', e.target.value)}>
      <option value="">请选择</option><option value="A">甲</option>
    </select>
  </Field>
  <Field label="日期"><input type="date" className="input input-bordered w-full" value={form.date} onChange={(e) => setField('date', e.target.value)} /></Field>
  <Field label="数量"><input type="number" className="input input-bordered w-full" value={form.qty} onChange={(e) => setField('qty', e.target.value)} /></Field>
  <Field label="描述" className="col-span-2">
    <textarea className="textarea textarea-bordered w-full" rows={2} value={form.desc} onChange={(e) => setField('desc', e.target.value)} />
  </Field>
</div>
```

## SubTable —— 表单内嵌子表（多条新增/删除/行内编辑）

```tsx
import { SubTable } from '@/components/ui'
<SubTable
  title="进展记录" value={form.records} onChange={(rows) => setField('records', rows)}
  columns={[
    { key: 'date', title: '日期', type: 'date', width: 160 },
    { key: 'description', title: '内容', type: 'textarea', width: 320 },
    { key: 'kind', title: '类型', type: 'select', options: [{ label: '甲', value: 'A' }] },
  ]}
/>
```

## useToast / Popconfirm / 图标

```tsx
import { useToast } from '@/components/ui'
const toast = useToast(); toast.success('成功'); toast.error('失败'); toast.info('提示')
import { Pencil, Trash2 } from 'lucide-react'   // 图标统一用 lucide-react
```

## 页面骨架

```tsx
'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { BoostTable, type BoostColumn, Modal, Popconfirm, Field, useToast } from '@/components/ui'

const EMPTY_FORM: any = { /* 各字段空值，含子表数组 */ }

export default function XPage() {
  const toast = useToast()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>(EMPTY_FORM)
  const setField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const fetchData = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/X'); const j = await r.json(); setData(j.data) }
    catch { toast.error('加载失败') } finally { setLoading(false) }
  }, [toast])
  useEffect(() => { void fetchData() }, [fetchData])

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM }); setOpen(true) }
  const openEdit = (r: any) => { setEditing(r); setForm({ ...EMPTY_FORM, ...r, /* 日期 slice(0,10)，子表 map，数字 ?? '' */ }); setOpen(true) }
  const handleDelete = async (id: number) => { try { const r = await fetch(`/api/X/${id}`, { method: 'DELETE' }); if (!r.ok) throw new Error(); toast.success('删除成功'); void fetchData() } catch { toast.error('删除失败') } }
  const handleSubmit = async () => { /* 校验 → fetch POST/PUT → toast → setOpen(false) → fetchData */ }

  const columns: BoostColumn<any>[] = [ /* 覆盖所有字段 */ ]
  return (<div>{/* 标题 + BoostTable + Modal */}</div>)
}
```

## API 改造（每个 list GET 改为返回全量，前端分页）

```ts
export async function GET() {
  try {
    const data = await prisma.X.findMany({ orderBy: { createdAt: 'desc' }, include: { /* relations + 子表 */ } })
    return NextResponse.json({ data, total: data.length })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Internal server error' }, { status: 500 }) }
}
```

- **数字字段**（xxxId、数值）：表单传字符串，POST/PUT 前转 `Number()` 或 `null`（空串归 null）
- **日期字段**：转 `new Date()`
- **含子表的模型**：嵌套写，参照 `src/lib/candidateData.ts`：
  - create：`{ create: rows.filter(有值).map(r => ({...,date: r.date? new Date(r.date): null})) }`
  - update：`{ deleteMany: {}, create: [...] }`
  - 解构剔除 relation 对象 / id / createdAt / updatedAt / _count，避免传给 Prisma 报错

## 验收
- `cd /Users/keigo/Projects/boosterPro && npx tsc --noEmit` 必须 0 错误
- 全文不得出现 `from 'antd'` 或 `@ant-design`
