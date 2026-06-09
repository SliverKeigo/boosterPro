'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Eye, Trash2, Plus, X } from 'lucide-react'
import {
  BoostTable,
  type BoostColumn,
  Modal,
  Popconfirm,
  Field,
  SearchSelect,
  searchFetch,
  useToast,
} from '@/components/ui'
import { useMyPermissions } from '@/lib/usePermissions'
import { exportToExcel } from '@/lib/exportExcel'

const fmtDate = (s?: string | null) => (s ? String(s).slice(0, 10) : '')
let _keySeq = 1
const newKey = () => _keySeq++

interface ItemRow {
  _key: number
  customerId: string
  customerName: string
  requirementId: string
  requirementName: string
  progressNote: string
  positionOpenDate: string
  routineHunting: string // '是' | '否' | ''
  participation: string
  assignments: Record<string, string> // memberId → 计划日期文本
}
const emptyItem = (): ItemRow => ({
  _key: newKey(), customerId: '', customerName: '', requirementId: '', requirementName: '',
  progressNote: '', positionOpenDate: '', routineHunting: '', participation: '', assignments: {},
})
// 本周参与度 = 该行「填了计划日期的组员数」，自动计算（不手填）
const partCount = (it: ItemRow) => Object.values(it.assignments).filter((v) => String(v ?? '').trim()).length

export default function WorkPlansPage() {
  const toast = useToast()
  const { isAdmin, ledGroupId, loading: permLoading } = useMyPermissions()
  const canCreate = isAdmin || ledGroupId != null

  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('edit') // 详情(只读) / 编辑
  const [submitting, setSubmitting] = useState(false)

  // 编辑器表单
  const [groupId, setGroupId] = useState('')
  const [groupName, setGroupName] = useState('')
  const [weekStart, setWeekStart] = useState('')
  const [weekEnd, setWeekEnd] = useState('')
  const [strategy, setStrategy] = useState('')
  const [members, setMembers] = useState<{ id: number; name: string }[]>([])
  const [items, setItems] = useState<ItemRow[]>([])

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const res = await fetch('/api/work-plans')
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || '')
      setData((await res.json()).data ?? [])
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void (async () => { await fetchData() })()
  }, [fetchData])

  // 选组初始化：拉组员(矩阵列)+组名；regenItems 时按「组员录入的在招需求」每岗位生成一行明细，
  // 并对同客户同岗位带入该组上一份周计划的交付进展简述。
  const applyGroupSetup = useCallback(async (gid: string | number, regenItems: boolean) => {
    try {
      const res = await fetch(`/api/work-plans/group-setup?groupId=${gid}`)
      if (!res.ok) return
      const setup = await res.json()
      setGroupName(setup.groupName ?? '')
      setMembers(Array.isArray(setup.members) ? setup.members.map((m: any) => ({ id: m.id, name: m.name })) : [])
      if (regenItems) {
        const reqs: any[] = Array.isArray(setup.requirements) ? setup.requirements : []
        const last: Record<string, string> = setup.lastProgress ?? {}
        setItems(
          reqs.length
            ? reqs.map((r): ItemRow => ({
                _key: newKey(),
                customerId: r.customerId != null ? String(r.customerId) : '',
                customerName: r.customerShortName ?? '',
                requirementId: String(r.requirementId),
                requirementName: r.positionName ?? '',
                progressNote: last[`${r.customerId}:${r.requirementId}`] ?? '',
                positionOpenDate: fmtDate(r.positionOpenDate),
                routineHunting: '',
                participation: '',
                assignments: {},
              }))
            : [emptyItem()],
        )
      }
    } catch {
      /* 忽略：矩阵列为空时仍可手动维护明细，不阻断 */
    }
  }, [])

  const resetForm = () => {
    setGroupId(''); setGroupName(''); setWeekStart(''); setWeekEnd(''); setStrategy('')
    setMembers([]); setItems([emptyItem()])
  }

  const openCreate = () => {
    setEditing(null)
    setMode('edit')
    resetForm()
    // 组长：默认本组并锁定；管理员：留空待选
    if (!isAdmin && ledGroupId != null) {
      setGroupId(String(ledGroupId))
      void applyGroupSetup(ledGroupId, true)
    }
    setOpen(true)
  }

  const openDetail = (r: any) => {
    setEditing(r)
    setMode('view')
    setGroupId(String(r.groupId))
    setGroupName(r.group?.name ?? '')
    setWeekStart(fmtDate(r.weekStart))
    setWeekEnd(fmtDate(r.weekEnd))
    setStrategy(r.deliveryStrategy ?? '')
    void applyGroupSetup(r.groupId, false)
    setItems(
      (r.items ?? []).map((it: any): ItemRow => ({
        _key: newKey(),
        customerId: it.customerId != null ? String(it.customerId) : '',
        customerName: it.customer?.shortName ?? '',
        requirementId: it.requirementId != null ? String(it.requirementId) : '',
        requirementName: it.requirement?.positionName ?? '',
        progressNote: it.progressNote ?? '',
        positionOpenDate: fmtDate(it.positionOpenDate),
        routineHunting: it.routineHunting === true ? '是' : it.routineHunting === false ? '否' : '',
        participation: it.participation != null ? String(it.participation) : '',
        assignments: Object.fromEntries((it.assignments ?? []).map((a: any) => [String(a.memberId), a.planDates ?? ''])),
      })),
    )
    setOpen(true)
  }

  const onPickGroup = (v: string) => {
    setGroupId(v)
    if (v) void applyGroupSetup(v, true)
    else { setMembers([]); setGroupName('') }
  }

  // 选「本周开始」后自动算「本周结束」= 开始 + 6 天（一周，如 6.1 → 6.7）
  const onWeekStart = (v: string) => {
    setWeekStart(v)
    if (!v) return
    const d = new Date(`${v}T00:00:00`)
    d.setDate(d.getDate() + 6)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    setWeekEnd(`${d.getFullYear()}-${mm}-${dd}`)
  }

  // 明细行操作
  const setItem = (key: number, patch: Partial<ItemRow>) =>
    setItems((arr) => arr.map((it) => (it._key === key ? { ...it, ...patch } : it)))
  const setAssign = (key: number, memberId: number, v: string) =>
    setItems((arr) => arr.map((it) => (it._key === key ? { ...it, assignments: { ...it.assignments, [memberId]: v } } : it)))
  const addItem = () => setItems((arr) => [...arr, emptyItem()])
  const removeItem = (key: number) => setItems((arr) => arr.filter((it) => it._key !== key))

  // 岗位 createdAt 缓存：选岗位时「岗位开放时间」自动填为该岗位的创建时间（只读）
  const reqCreatedAt = useRef<Record<string, string>>({})
  const fetchRequirements = useCallback(async (q: string) => {
    const res = await fetch(`/api/requirements/options?q=${encodeURIComponent(q)}`)
    if (!res.ok) return []
    const json = await res.json()
    return (json.data ?? []).map((x: any) => {
      if (x.createdAt) reqCreatedAt.current[String(x.id)] = x.createdAt
      return { value: String(x.id), label: x.positionName }
    })
  }, [])
  const pickRequirement = (key: number, v: string) => {
    const created = reqCreatedAt.current[v]
    setItem(key, { requirementId: v, ...(created ? { positionOpenDate: fmtDate(created) } : {}) })
  }

  // 小计（前端计算，不入库）
  const subtotal = useMemo(() => {
    const participation = items.reduce((s, it) => s + partCount(it), 0)
    const perMember: Record<number, number> = {}
    for (const m of members) perMember[m.id] = items.filter((it) => (it.assignments[m.id] ?? '').trim()).length
    return { participation, perMember }
  }, [items, members])

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/work-plans/${id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error || '删除失败'); return }
      toast.success('删除成功')
      void fetchData()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '删除失败')
    }
  }

  const handleSubmit = async () => {
    if (!groupId) return toast.error('请选择所属组')
    if (!weekStart || !weekEnd) return toast.error('请选择本周起止日期')
    setSubmitting(true)
    try {
      const payload = {
        groupId: Number(groupId),
        weekStart, weekEnd,
        deliveryStrategy: strategy,
        items: items.map((it, i) => ({
          customerId: it.customerId || null,
          requirementId: it.requirementId || null,
          progressNote: it.progressNote,
          positionOpenDate: it.positionOpenDate || null,
          routineHunting: it.routineHunting,
          participation: partCount(it), // 自动算：该行有日期的组员数
          sortOrder: i,
          assignments: Object.entries(it.assignments)
            .filter(([, v]) => String(v).trim())
            .map(([memberId, planDates]) => ({ memberId: Number(memberId), planDates })),
        })),
      }
      const url = editing ? `/api/work-plans/${editing.id}` : '/api/work-plans'
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || '')
      toast.success(editing ? '更新成功' : '创建成功')
      setOpen(false)
      void fetchData()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : (editing ? '更新失败' : '创建失败'))
    } finally {
      setSubmitting(false)
    }
  }

  const canWriteRow = (r: any) => isAdmin || (ledGroupId != null && r.groupId === ledGroupId)

  // 「可回导」导出：扁平到每行一个明细行（组员分配＝「组员名=日期」多行），与 /api/work-plans/import 对应
  const doExport = () => {
    const cols = [
      { header: '周计划id', getValue: (x: any) => x.plan.id },
      { header: '明细id', getValue: (x: any) => x.item.id ?? '' },
      { header: '组*', getValue: (x: any) => x.plan.group?.name ?? '' },
      { header: '周开始*', getValue: (x: any) => fmtDate(x.plan.weekStart) },
      { header: '周结束*', getValue: (x: any) => fmtDate(x.plan.weekEnd) },
      { header: '交付策略', getValue: (x: any) => x.plan.deliveryStrategy ?? '' },
      { header: '客户名称', getValue: (x: any) => x.item.customer?.shortName ?? '' },
      { header: '岗位名称', getValue: (x: any) => x.item.requirement?.positionName ?? '' },
      { header: '交付进展', getValue: (x: any) => x.item.progressNote ?? '' },
      { header: '岗位开放时间', getValue: (x: any) => fmtDate(x.item.positionOpenDate) },
      { header: '是否例行寻猎', getValue: (x: any) => (x.item.routineHunting === true ? '是' : x.item.routineHunting === false ? '否' : '') },
      { header: '组员分配', getValue: (x: any) => (x.item.assignments ?? []).map((a: any) => `${a.member?.name ?? ''}=${a.planDates ?? ''}`).filter((s: string) => !s.startsWith('=') && !s.endsWith('=')).join('\n') },
    ]
    const flat = data.flatMap((plan: any) => (plan.items?.length ? plan.items.map((item: any) => ({ plan, item })) : [{ plan, item: {} }]))
    void exportToExcel({ title: '工作计划', columns: cols, rows: flat })
  }

  const columns: BoostColumn<any>[] = [
    { key: 'group', title: '组', accessor: (r) => r.group?.name ?? '—', render: (v) => <span className="font-medium">{v}</span> },
    { key: 'week', title: '本周', accessor: (r) => `${fmtDate(r.weekStart)} ~ ${fmtDate(r.weekEnd)}` },
    { key: 'deliveryStrategy', title: '交付策略', render: (v) => v ? <span className="line-clamp-1 max-w-[280px]">{v}</span> : <span className="text-base-content/30">—</span> },
    { key: 'itemCount', title: '明细行数', accessor: (r) => r.items?.length ?? 0, filterType: 'number',
      render: (v) => <span className="badge badge-ghost badge-sm">{v}</span> },
    { key: 'createdBy', title: '创建人', accessor: (r) => r.createdBy?.name ?? '—' },
    { key: 'updatedAt', title: '更新时间', filterType: 'date', render: (v) => fmtDate(v) },
  ]

  if (permLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-base-content">工作计划</h1>
        <p className="mt-0.5 text-sm text-base-content/50">各组每周「交付需求与计划管理表」（仅组长可维护本组，管理员可查看全部）</p>
      </div>

      <BoostTable
        title="周计划列表"
        columns={columns}
        data={data}
        loading={loading}
        rowKey="id"
        onCreate={canCreate ? openCreate : undefined}
        createText="新增周计划"
        onExport={doExport}
        importResource={canCreate ? 'WORK_PLAN' : undefined}
        importEndpoint="/api/work-plans/import"
        onRefresh={() => fetchData(true)}
        searchPlaceholder="搜索组 / 交付策略 / 创建人…"
        actions={(r) => (
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={() => openDetail(r)}>
              <Eye className="h-3.5 w-3.5" />详情
            </button>
            {canWriteRow(r) && (
              <Popconfirm title="确认删除该周计划？（含全部明细行）" onConfirm={() => handleDelete(r.id)}>
                <button className="btn btn-ghost btn-xs gap-1 text-error">
                  <Trash2 className="h-3.5 w-3.5" />删除
                </button>
              </Popconfirm>
            )}
          </div>
        )}
      />

      <Modal
        open={open}
        title={mode === 'view' ? '周计划详情' : editing ? '编辑周计划' : '新增周计划'}
        onClose={() => setOpen(false)}
        onOk={handleSubmit}
        okText={editing ? '保存' : '创建'}
        confirmLoading={submitting}
        readOnly={mode === 'view'}
        onEdit={editing && canWriteRow(editing) ? () => setMode('edit') : undefined}
        width={1180}
      >
        <div className="grid grid-cols-4 gap-4">
          <Field label="所属组" required>
            {isAdmin ? (
              <SearchSelect
                value={groupId}
                onChange={onPickGroup}
                fetchOptions={searchFetch('/api/groups/options', (g: any) => ({ value: String(g.id), label: g.name }))}
                initialLabel={groupName}
                placeholder="请选择组"
              />
            ) : (
              <input className="input input-bordered w-full" value={groupName || '（我的组）'} disabled />
            )}
          </Field>
          <Field label="本周开始" required>
            <input type="date" className="input input-bordered w-full" value={weekStart} onChange={(e) => onWeekStart(e.target.value)} />
          </Field>
          <Field label="本周结束" required>
            <input type="date" className="input input-bordered w-full" value={weekEnd} onChange={(e) => setWeekEnd(e.target.value)} />
          </Field>
          <Field label="本周交付策略" className="col-span-4">
            <textarea className="textarea textarea-bordered w-full" rows={2} value={strategy} onChange={(e) => setStrategy(e.target.value)} placeholder="如：第一梯队（画像清晰，薪资合适…）" />
          </Field>
        </div>

        {/* 明细行 + 组员日期矩阵 */}
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">本周计划明细（{items.length} 行）</span>
            <button className="btn btn-outline btn-xs gap-1" onClick={addItem}><Plus className="h-3.5 w-3.5" />添加行</button>
          </div>
          <div className="min-h-[320px] max-h-[56vh] overflow-auto rounded-lg border border-base-300">
            <table className="table table-xs">
              <thead>
                <tr>
                  <th rowSpan={2} className="min-w-[160px]">客户名称</th>
                  <th rowSpan={2} className="min-w-[160px]">岗位名称</th>
                  <th rowSpan={2} className="min-w-[180px]">交付进展简述</th>
                  <th rowSpan={2} className="min-w-[130px]">岗位开放时间</th>
                  <th rowSpan={2} className="min-w-[90px]">例行寻猎</th>
                  <th rowSpan={2} className="min-w-[90px]">本周参与度</th>
                  {members.length > 0 && (
                    <th colSpan={members.length} className="border-x border-base-300 bg-base-200 text-center">本周计划岗位（组员）</th>
                  )}
                  <th rowSpan={2} className="w-10"></th>
                </tr>
                <tr>
                  {members.map((m) => <th key={m.id} className="min-w-[110px] bg-base-200">{m.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it._key}>
                    <td>
                      <SearchSelect value={it.customerId} initialLabel={it.customerName}
                        onChange={(v) => setItem(it._key, { customerId: v })}
                        fetchOptions={searchFetch('/api/clients/options', (c: any) => ({ value: String(c.id), label: c.shortName ?? c.fullName }))}
                        placeholder="选客户" />
                    </td>
                    <td>
                      <SearchSelect value={it.requirementId} initialLabel={it.requirementName}
                        onChange={(v) => pickRequirement(it._key, v)}
                        fetchOptions={fetchRequirements}
                        placeholder="选岗位" />
                    </td>
                    <td><input className="input input-bordered input-xs w-full" value={it.progressNote} onChange={(e) => setItem(it._key, { progressNote: e.target.value })} placeholder="如：1人谈薪中" /></td>
                    <td><input type="date" readOnly disabled className="input input-bordered input-xs w-full bg-base-200" value={it.positionOpenDate} title="岗位开放时间＝所选岗位的创建时间，自动填充" /></td>
                    <td>
                      <select className="select select-bordered select-xs w-full" value={it.routineHunting} onChange={(e) => setItem(it._key, { routineHunting: e.target.value })}>
                        <option value="">—</option><option value="是">是</option><option value="否">否</option>
                      </select>
                    </td>
                    <td className="text-center font-medium" title="自动计算＝本行填了计划日期的组员数">{partCount(it)}</td>
                    {members.map((m) => (
                      <td key={m.id} className="bg-base-100">
                        <input className="input input-bordered input-xs w-full" value={it.assignments[m.id] ?? ''}
                          onChange={(e) => setAssign(it._key, m.id, e.target.value)} placeholder="如 6.1、6.3" />
                      </td>
                    ))}
                    <td>
                      <button className="btn btn-ghost btn-xs text-error" onClick={() => removeItem(it._key)} title="删除该行"><X className="h-3.5 w-3.5" /></button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={7 + members.length} className="text-center text-base-content/40">暂无明细，点「添加行」</td></tr>
                )}
              </tbody>
              {items.length > 0 && (
                <tfoot>
                  <tr className="font-medium">
                    <td colSpan={5} className="text-right">小计</td>
                    <td>{subtotal.participation}</td>
                    {members.map((m) => <td key={m.id}>{subtotal.perMember[m.id] ?? 0}</td>)}
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {members.length === 0 && (
            <p className="mt-1 text-xs text-warning">
              {groupId
                ? '该组暂无成员，「本周计划岗位（组员）」列为空——请先在「系统管理 → 组管理」为该组添加成员。'
                : '请先在上方选择「所属组」，「本周计划岗位（组员）」列会按该组成员自动出现。'}
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
