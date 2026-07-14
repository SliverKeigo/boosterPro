'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, Trash2 } from 'lucide-react'
import {
  BoostTable,
  type BoostColumn,
  Modal,
  Popconfirm,
  Field,
  MultiDatePicker,
  useToast,
} from '@/components/ui'
import { useMyPermissions } from '@/lib/usePermissions'
import { fmtDate } from '@/lib/datetime'

let _keySeq = 1
const newKey = () => _keySeq++

// 存库的 planDates（JSON 日期数组字符串）→ string[]；兼容历史自由文本（顿号/逗号分隔）。
function parseDates(v: any): string[] {
  if (Array.isArray(v)) return v.map(String)
  if (typeof v === 'string' && v.trim()) {
    try {
      const p = JSON.parse(v)
      return Array.isArray(p) ? p.map(String) : [v]
    } catch {
      return v.split(/[,、，]/).map((s) => s.trim()).filter(Boolean)
    }
  }
  return []
}

interface ItemRow {
  _key: number
  groupId: number // 明细来源组（按组分页）
  groupName: string
  customerId: string
  customerName: string
  requirementId: string
  requirementName: string
  progressNote: string
  positionOpenDate: string
  routineHunting: string // '是' | '否' | ''
  assignments: Record<string, string[]> // memberId → 计划日期数组
}
// 本周参与度 = 该行「填了计划日期的组员数」，自动计算（不手填）
const partCount = (it: ItemRow) => Object.values(it.assignments).filter((v) => Array.isArray(v) && v.length > 0).length

export default function WorkPlansPage() {
  const toast = useToast()
  const { can, loading: permLoading } = useMyPermissions()
  const canCreate = can('WORK_PLAN', 'CREATE')
  const canEdit = can('WORK_PLAN', 'EDIT')
  const canDelete = can('WORK_PLAN', 'DELETE')

  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('edit') // 详情(只读) / 编辑
  const [submitting, setSubmitting] = useState(false)

  // 编辑器表单
  const [weekStart, setWeekStart] = useState('')
  const [weekEnd, setWeekEnd] = useState('')
  const [strategy, setStrategy] = useState('')
  const [allMembers, setAllMembers] = useState<{ id: number; name: string }[]>([]) // 全部人员（矩阵列）
  const [items, setItems] = useState<ItemRow[]>([])
  const [activeTab, setActiveTab] = useState<number | null>(null) // 当前组 tab 的 groupId

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

  // 拉「新增初始化」：全部人员(矩阵列) + 各组在招需求(按组生成明细) + 上周进展(同客户同岗位带入)。
  const fetchSetup = useCallback(async () => {
    const res = await fetch('/api/work-plans/all-setup')
    if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || '初始化失败')
    return res.json()
  }, [])

  const openCreate = async () => {
    try {
      const setup = await fetchSetup()
      setAllMembers(Array.isArray(setup.members) ? setup.members.map((m: any) => ({ id: m.id, name: m.name })) : [])
      const last: Record<string, string> = setup.lastProgress ?? {}
      const rows: ItemRow[] = []
      for (const g of setup.groups ?? []) {
        for (const r of g.requirements ?? []) {
          rows.push({
            _key: newKey(),
            groupId: g.groupId,
            groupName: g.groupName,
            customerId: r.customerId != null ? String(r.customerId) : '',
            customerName: r.customerShortName ?? '',
            requirementId: String(r.requirementId),
            requirementName: r.positionName ?? '',
            progressNote: last[`${r.customerId}:${r.requirementId}`] ?? '',
            positionOpenDate: fmtDate(r.positionOpenDate),
            routineHunting: '',
            assignments: {},
          })
        }
      }
      setEditing(null)
      setMode('edit')
      setWeekStart(''); setWeekEnd(''); setStrategy('')
      setItems(rows)
      setOpen(true)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '初始化失败')
    }
  }

  const openDetail = async (r: any) => {
    try {
      // 详情/编辑也需要「全部人员」做矩阵列（即使该计划里某些人没分配，也要显示其列）
      const setup = await fetchSetup().catch(() => ({ members: [] }))
      setAllMembers(Array.isArray(setup.members) ? setup.members.map((m: any) => ({ id: m.id, name: m.name })) : [])
      setEditing(r)
      setMode('view')
      setWeekStart(fmtDate(r.weekStart))
      setWeekEnd(fmtDate(r.weekEnd))
      setStrategy(r.deliveryStrategy ?? '')
      setItems(
        (r.items ?? []).map((it: any): ItemRow => ({
          _key: newKey(),
          groupId: it.group?.id ?? it.groupId,
          groupName: it.group?.name ?? '',
          customerId: it.customerId != null ? String(it.customerId) : '',
          customerName: it.customer?.shortName ?? '',
          requirementId: it.requirementId != null ? String(it.requirementId) : '',
          requirementName: it.requirement?.positionName ?? '',
          progressNote: it.progressNote ?? '',
          positionOpenDate: fmtDate(it.positionOpenDate),
          routineHunting: it.routineHunting === true ? '是' : it.routineHunting === false ? '否' : '',
          assignments: Object.fromEntries(
            (it.assignments ?? []).map((a: any) => [String(a.memberId), parseDates(a.planDates)]),
          ),
        })),
      )
      setOpen(true)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '加载失败')
    }
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

  // 明细行操作（明细全自动生成、不可手动加/删行；仅可改进展/例行寻猎/组员日期）
  const setItem = (key: number, patch: Partial<ItemRow>) =>
    setItems((arr) => arr.map((it) => (it._key === key ? { ...it, ...patch } : it)))
  const setAssign = (key: number, memberId: number, dates: string[]) =>
    setItems((arr) => arr.map((it) => (it._key === key ? { ...it, assignments: { ...it.assignments, [memberId]: dates } } : it)))

  // 按组分页：tab 列表 = 明细出现过的组（去重，保序）
  const tabGroups = useMemo(() => {
    const seen = new Map<number, string>()
    for (const it of items) if (!seen.has(it.groupId)) seen.set(it.groupId, it.groupName)
    return Array.from(seen, ([groupId, groupName]) => ({ groupId, groupName }))
  }, [items])

  // 当前生效 tab：activeTab 若不在当前组列表中（如刚打开新弹窗、切换计划），回退到第一个组
  const effectiveTab =
    activeTab != null && tabGroups.some((g) => g.groupId === activeTab) ? activeTab : (tabGroups[0]?.groupId ?? null)

  const visibleItems = useMemo(() => items.filter((it) => it.groupId === effectiveTab), [items, effectiveTab])

  // 当前组小计（前端计算，不入库）：参与度合计 + 各成员在本组的命中行数
  const subtotal = useMemo(() => {
    const participation = visibleItems.reduce((s, it) => s + partCount(it), 0)
    const perMember: Record<number, number> = {}
    for (const m of allMembers) perMember[m.id] = visibleItems.filter((it) => (it.assignments[m.id] ?? []).length > 0).length
    return { participation, perMember }
  }, [visibleItems, allMembers])

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
    if (!weekStart || !weekEnd) return toast.error('请选择本周起止日期')
    setSubmitting(true)
    try {
      const payload = {
        weekStart, weekEnd,
        deliveryStrategy: strategy,
        items: items.map((it, i) => ({
          groupId: it.groupId,
          customerId: it.customerId || null,
          requirementId: it.requirementId || null,
          progressNote: it.progressNote,
          positionOpenDate: it.positionOpenDate || null,
          routineHunting: it.routineHunting,
          participation: partCount(it), // 自动算：该行有日期的组员数
          sortOrder: i,
          assignments: Object.entries(it.assignments)
            .filter(([, dates]) => Array.isArray(dates) && dates.length > 0)
            .map(([memberId, dates]) => ({ memberId: Number(memberId), planDates: dates })),
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

  const readOnly = mode === 'view'
  const columns: BoostColumn<any>[] = [
    { key: 'week', title: '本周', accessor: (r) => `${fmtDate(r.weekStart)} ~ ${fmtDate(r.weekEnd)}`, render: (v) => <span className="font-medium">{v}</span> },
    { key: 'deliveryStrategy', title: '交付策略', render: (v) => v ? <span className="line-clamp-1 max-w-[280px]">{v}</span> : <span className="text-base-content/30">—</span> },
    { key: 'groupCount', title: '涉及组数', accessor: (r) => new Set((r.items ?? []).map((it: any) => it.group?.id ?? it.groupId)).size, filterType: 'number',
      render: (v) => <span className="badge badge-ghost badge-sm">{v}</span> },
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
        <p className="mt-0.5 text-sm text-base-content/50">全公司每周「交付需求与计划管理表」：一周一条、涵盖全部组，岗位按组分页</p>
      </div>

      <BoostTable
        title="周计划列表"
        columns={columns}
        data={data}
        loading={loading}
        rowKey="id"
        onCreate={canCreate ? openCreate : undefined}
        createText="新增周计划"
        onRefresh={() => fetchData(true)}
        searchPlaceholder="搜索交付策略 / 创建人…"
        actions={(r) => (
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={() => openDetail(r)}>
              <Eye className="h-3.5 w-3.5" />详情
            </button>
            {canDelete && (
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
        readOnly={readOnly}
        onEdit={editing && canEdit ? () => setMode('edit') : undefined}
        size="full"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="本周开始" required>
            <input type="date" className="input input-bordered w-full" value={weekStart} onChange={(e) => onWeekStart(e.target.value)} />
          </Field>
          <Field label="本周结束" required>
            <input type="date" className="input input-bordered w-full" value={weekEnd} onChange={(e) => setWeekEnd(e.target.value)} />
          </Field>
          <Field label="本周交付策略">
            <textarea className="textarea textarea-bordered w-full [field-sizing:content]" rows={1} value={strategy} onChange={(e) => setStrategy(e.target.value)} placeholder="如：第一梯队（画像清晰，薪资合适…）" />
          </Field>
        </div>

        {/* 按组分页：每个组一个 tab，页内＝该组明细行 × 全员日期矩阵 */}
        <div className="mt-4">
          {tabGroups.length === 0 ? (
            <div className="rounded-lg border border-dashed border-base-300 py-12 text-center text-sm text-base-content/40">
              暂无明细。各组成员录入「在招」客户需求后，新增工作计划会自动按组生成明细行。
            </div>
          ) : (
            <>
              <div className="tabs tabs-boxed mb-2 w-fit max-w-full overflow-x-auto">
                {tabGroups.map((g) => (
                  <a
                    key={g.groupId}
                    className={`tab whitespace-nowrap ${effectiveTab === g.groupId ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab(g.groupId)}
                  >
                    {g.groupName}（{items.filter((it) => it.groupId === g.groupId).length}）
                  </a>
                ))}
              </div>
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-base-300">
                <table className="table table-xs">
                  <thead className="sticky top-0 z-10 bg-base-100">
                    <tr>
                      <th rowSpan={2} className="w-[6em] min-w-[6em]">客户名称</th>
                      <th rowSpan={2} className="min-w-[140px]">岗位名称</th>
                      <th rowSpan={2} className="min-w-[20rem]">交付进展简述</th>
                      <th rowSpan={2} className="min-w-[120px]">岗位开放时间</th>
                      <th rowSpan={2} className="min-w-[80px]">例行寻猎</th>
                      <th rowSpan={2} className="min-w-[80px]">本周参与度</th>
                      {allMembers.length > 0 && (
                        <th colSpan={allMembers.length} className="border-x border-base-300 bg-base-200 text-center">本周计划岗位（组员）</th>
                      )}
                    </tr>
                    <tr>
                      {allMembers.map((m) => <th key={m.id} className="min-w-[8.5rem] bg-base-200">{m.name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((it) => (
                      <tr key={it._key}>
                        <td>
                          <span className="block w-[6em] truncate font-medium" title={it.customerName}>{it.customerName || '—'}</span>
                        </td>
                        <td>
                          <span className="block max-w-[200px] truncate" title={it.requirementName}>{it.requirementName || '—'}</span>
                        </td>
                        <td>
                          <textarea
                            className="textarea textarea-bordered textarea-xs w-full min-w-[20rem] [field-sizing:content]"
                            rows={1}
                            value={it.progressNote}
                            onChange={(e) => setItem(it._key, { progressNote: e.target.value })}
                            placeholder="如：1人谈薪中"
                          />
                        </td>
                        <td>
                          <span className="text-base-content/70" title="岗位开放时间＝所选岗位的创建时间">{it.positionOpenDate || '—'}</span>
                        </td>
                        <td>
                          <select className="select select-bordered select-xs w-full" value={it.routineHunting} onChange={(e) => setItem(it._key, { routineHunting: e.target.value })}>
                            <option value="">—</option><option value="是">是</option><option value="否">否</option>
                          </select>
                        </td>
                        <td className="text-center font-medium" title="自动计算＝本行填了计划日期的组员数">{partCount(it)}</td>
                        {allMembers.map((m) => (
                          <td key={m.id} className="bg-base-100 align-top">
                            <MultiDatePicker
                              value={it.assignments[m.id] ?? []}
                              onChange={(dates) => setAssign(it._key, m.id, dates)}
                              readOnly={readOnly}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                    {visibleItems.length === 0 && (
                      <tr><td colSpan={6 + allMembers.length} className="text-center text-base-content/40">该组本周无在招岗位明细</td></tr>
                    )}
                  </tbody>
                  {visibleItems.length > 0 && (
                    <tfoot>
                      <tr className="font-medium">
                        <td colSpan={5} className="text-right">小计</td>
                        <td className="text-center">{subtotal.participation}</td>
                        {allMembers.map((m) => <td key={m.id} className="text-center">{subtotal.perMember[m.id] ?? 0}</td>)}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {allMembers.length === 0 && (
                <p className="mt-1 text-xs text-warning">系统暂无用户，「本周计划岗位（组员）」列为空。</p>
              )}
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
