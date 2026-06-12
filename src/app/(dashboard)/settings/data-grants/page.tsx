'use client'

import { useCallback, useEffect, useState } from 'react'
import { Eye, Trash2, Plus, Share2, ShieldAlert } from 'lucide-react'
import { Modal, Field, useToast } from '@/components/ui'
import { useMyPermissions } from '@/lib/usePermissions'
import { RESOURCES, RESOURCE_LABEL, type ResourceKey } from '@/lib/resources'

type Access = 'VIEW' | 'EDIT'
type SourceType = 'OWNER' | 'DEPARTMENT'
type GranteeType = 'USER' | 'DEPARTMENT'

interface DataGrant {
  id: number
  resource: string
  sourceType: SourceType
  sourceUserId: number | null
  sourceDeptId: number | null
  granteeType: GranteeType
  granteeUserId: number | null
  granteeDeptId: number | null
  access: Access
  grantedById: number | null
}

interface OptionItem {
  id: number
  name: string
}

const ACCESS_LABEL: Record<Access, string> = { VIEW: '查看', EDIT: '编辑' }

const EMPTY_FORM = {
  resource: RESOURCES[0].key as ResourceKey,
  sourceType: 'OWNER' as SourceType,
  sourceUserId: 0,
  sourceDeptId: 0,
  granteeType: 'USER' as GranteeType,
  granteeUserId: 0,
  granteeDeptId: 0,
  access: 'VIEW' as Access,
}

type FormState = typeof EMPTY_FORM

export default function DataGrantsPage() {
  const toast = useToast()
  const { can, loading: permLoading } = useMyPermissions()

  const [grants, setGrants] = useState<DataGrant[]>([])
  const [users, setUsers] = useState<OptionItem[]>([])
  const [departments, setDepartments] = useState<OptionItem[]>([])
  // 名称映射：列表 API 直接返回（含来源/受让/操作人），无需前端逐个反查。
  const [userNames, setUserNames] = useState<Record<number, string>>({})
  const [deptNames, setDeptNames] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)

  const [open, setOpen] = useState(false)
  const [, setEditing] = useState<DataGrant | null>(null) // 仅用于打开详情时记录当前行；视图由 form 渲染
  const [mode, setMode] = useState<'view' | 'edit'>('edit') // 详情(只读) / 编辑
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  // 拉取授权列表。showLoading=false（初始 effect）时不在同步路径触发 setState，
  // 首条语句即 await（规避 react-hooks/set-state-in-effect）；loading 初值即 true。
  const fetchGrants = useCallback(
    async (showLoading = false) => {
      try {
        if (showLoading) setLoading(true)
        const res = await fetch('/api/data-grants')
        if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || '')
        const json = await res.json()
        setGrants(json.data ?? [])
        setUserNames(json.users ?? {})
        setDeptNames(json.departments ?? {})
      } catch (e) {
        toast.error(e instanceof Error && e.message ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    },
    [toast],
  )

  // 选项（用户 / 部门），用于新增授权下拉
  const fetchOptions = useCallback(async () => {
    try {
      const [uRes, dRes] = await Promise.all([fetch('/api/users'), fetch('/api/departments')])
      const [uJson, dJson] = await Promise.all([uRes.json(), dRes.json()])
      setUsers(uJson.data ?? [])
      setDepartments(dJson.data ?? [])
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '加载用户 / 部门失败')
    }
  }, [toast])

  // 登录就绪后加载列表与选项；effect 同步路径不含 setState（两个 fetch 首条语句即 await）。
  useEffect(() => {
    if (permLoading) return
    void (async () => {
      await fetchGrants()
    })()
  }, [permLoading, fetchGrants])

  useEffect(() => {
    if (permLoading) return
    void (async () => {
      await fetchOptions()
    })()
  }, [permLoading, fetchOptions])

  const openCreate = () => {
    setEditing(null)
    setMode('edit')
    // 来源默认本人（OWNER 时来源锁定自己）；受让用户默认空待选
    setForm({ ...EMPTY_FORM })
    setOpen(true)
  }

  const openDetail = (g: DataGrant) => {
    setEditing(g)
    setMode('view')
    setForm({
      resource: g.resource as ResourceKey,
      sourceType: g.sourceType,
      sourceUserId: g.sourceUserId ?? 0,
      sourceDeptId: g.sourceDeptId ?? 0,
      granteeType: g.granteeType,
      granteeUserId: g.granteeUserId ?? 0,
      granteeDeptId: g.granteeDeptId ?? 0,
      access: g.access,
    })
    setOpen(true)
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('确认撤销该授权？')) return
    try {
      const res = await fetch(`/api/data-grants/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || '')
      toast.success('撤销成功')
      void fetchGrants(true)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '操作失败')
    }
  }

  const handleSubmit = async () => {
    // 来源校验：用户(OWNER)须选来源用户；部门(DEPARTMENT)须选来源部门
    if (form.sourceType === 'OWNER' && !form.sourceUserId) {
      return toast.error('请选择来源用户')
    }
    if (form.sourceType === 'DEPARTMENT' && !form.sourceDeptId) {
      return toast.error('请选择来源部门')
    }
    if (form.granteeType === 'USER' && !form.granteeUserId) {
      return toast.error('请选择受让用户')
    }
    if (form.granteeType === 'DEPARTMENT' && !form.granteeDeptId) {
      return toast.error('请选择受让部门')
    }
    setSubmitting(true)
    try {
      const payload = {
        resource: form.resource,
        access: form.access,
        sourceType: form.sourceType,
        // 用户来源用所选用户；部门来源用所选部门
        sourceUserId: form.sourceType === 'OWNER' ? form.sourceUserId : null,
        sourceDeptId: form.sourceType === 'DEPARTMENT' ? form.sourceDeptId : null,
        granteeType: form.granteeType,
        granteeUserId: form.granteeType === 'USER' ? form.granteeUserId : null,
        granteeDeptId: form.granteeType === 'DEPARTMENT' ? form.granteeDeptId : null,
      }
      const res = await fetch('/api/data-grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || '')
      toast.success('授权成功')
      setOpen(false)
      void fetchGrants(true)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  // 文案：来源 / 受让 / 操作人。名称缺失时回退为「用户#id」「部门#id」。
  const userText = (id: number | null) =>
    id == null ? '—' : (userNames[id] ?? `用户#${id}`)
  const deptText = (id: number | null) =>
    id == null ? '—' : (deptNames[id] ?? `部门#${id}`)

  const sourceText = (g: DataGrant) =>
    g.sourceType === 'OWNER' ? `用户：${userText(g.sourceUserId)}` : `部门：${deptText(g.sourceDeptId)}`
  const granteeText = (g: DataGrant) =>
    g.granteeType === 'USER' ? `用户：${userText(g.granteeUserId)}` : `部门：${deptText(g.granteeDeptId)}`

  // 权限校验中
  if (permLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    )
  }

  // 无该资源查看权限
  if (!can('SYS_DATA_GRANT', 'VIEW')) {
    return (
      <div>
        <div className="mb-4">
          <h1 className="text-xl font-bold text-base-content">数据共享</h1>
          <p className="mt-0.5 text-sm text-base-content/50">把某用户或某部门录入的数据共享给他人查看 / 编辑</p>
        </div>
        <div className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body items-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-error/10">
              <ShieldAlert className="h-8 w-8 text-error" />
            </div>
            <h2 className="mt-2 text-lg font-semibold text-base-content">无权访问</h2>
            <p className="max-w-md text-sm text-base-content/50">无权限访问，请联系管理员开通</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-base-content">数据共享</h1>
          <p className="mt-0.5 text-sm text-base-content/50">
            把「某人 / 某部门 录入的某类数据」开放给指定用户或部门查看 / 编辑（注：查看默认全公司可见、可在「部门管理」按模块关闭；此处主要用于授予编辑权限）
          </p>
        </div>
        {can('SYS_DATA_GRANT', 'CREATE') && (
          <button className="btn btn-primary btn-sm gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            新增授权
          </button>
        )}
      </div>

      {/* 授权列表 */}
      <div className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body p-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <span className="loading loading-spinner loading-md text-primary" />
            </div>
          ) : grants.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-base-200">
                <Share2 className="h-7 w-7 text-base-content/40" />
              </div>
              <p className="text-sm text-base-content/50">暂无授权，点击右上角「新增授权」开始配置</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {grants.map((g) => (
                <div
                  key={g.id}
                  className="flex flex-col gap-3 rounded-xl border border-base-300 bg-base-100 p-4 transition-colors hover:border-primary/40 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-base-content">
                        {RESOURCE_LABEL[g.resource] ?? g.resource}
                      </span>
                      <span
                        className={`badge badge-sm ${g.access === 'EDIT' ? 'badge-warning' : 'badge-info'}`}
                      >
                        {ACCESS_LABEL[g.access]}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-base-content/60">
                      <span>
                        <span className="text-base-content/40">来源：</span>
                        {sourceText(g)}
                      </span>
                      <span>
                        <span className="text-base-content/40">受让：</span>
                        {granteeText(g)}
                      </span>
                      <span>
                        <span className="text-base-content/40">操作人：</span>
                        {userText(g.grantedById)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      className="btn btn-ghost btn-xs gap-1 text-primary"
                      onClick={() => openDetail(g)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      详情
                    </button>
                    {can('SYS_DATA_GRANT', 'DELETE') && (
                      <button
                        className="btn btn-ghost btn-xs gap-1 text-error"
                        onClick={() => handleDelete(g.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        撤销
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 新增 / 详情弹窗 */}
      <Modal
        open={open}
        title={mode === 'view' ? '授权详情' : '新增授权'}
        onClose={() => setOpen(false)}
        onOk={handleSubmit}
        okText="授权"
        confirmLoading={submitting}
        readOnly={mode === 'view'}
        // 授权一经创建即不可改（只可撤销重建），故详情态不提供「编辑」入口
        width={620}
      >
        <div className="flex flex-col gap-4">
          <Field label="资源" required>
            <select
              className="select select-bordered w-full"
              value={form.resource}
              onChange={(e) => setField('resource', e.target.value as ResourceKey)}
            >
              {RESOURCES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="来源类型" required>
              <select
                className="select select-bordered w-full"
                value={form.sourceType}
                onChange={(e) => setField('sourceType', e.target.value as SourceType)}
              >
                <option value="OWNER">用户</option>
                <option value="DEPARTMENT">部门</option>
              </select>
            </Field>
            <Field label="来源对象" required>
              {form.sourceType === 'OWNER' ? (
                // 用户来源：可选任意用户（共享该用户录入的数据）
                <select
                  className="select select-bordered w-full"
                  value={form.sourceUserId || ''}
                  onChange={(e) => setField('sourceUserId', Number(e.target.value))}
                >
                  <option value="">请选择用户</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  className="select select-bordered w-full"
                  value={form.sourceDeptId || ''}
                  onChange={(e) => setField('sourceDeptId', Number(e.target.value))}
                >
                  <option value="">请选择部门</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="受让类型" required>
              <select
                className="select select-bordered w-full"
                value={form.granteeType}
                onChange={(e) => setField('granteeType', e.target.value as GranteeType)}
              >
                <option value="USER">用户</option>
                <option value="DEPARTMENT">部门</option>
              </select>
            </Field>
            <Field label="受让对象" required>
              {form.granteeType === 'USER' ? (
                <select
                  className="select select-bordered w-full"
                  value={form.granteeUserId || ''}
                  onChange={(e) => setField('granteeUserId', Number(e.target.value))}
                >
                  <option value="">请选择用户</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  className="select select-bordered w-full"
                  value={form.granteeDeptId || ''}
                  onChange={(e) => setField('granteeDeptId', Number(e.target.value))}
                >
                  <option value="">请选择部门</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>

          <Field label="授权级别" required>
            <div className="flex gap-2">
              {(['VIEW', 'EDIT'] as Access[]).map((a) => (
                <label
                  key={a}
                  className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-base-300 px-3 py-2 hover:bg-base-200"
                >
                  <input
                    type="radio"
                    className="radio radio-sm radio-primary"
                    name="access"
                    checked={form.access === a}
                    onChange={() => setField('access', a)}
                  />
                  <span className="text-sm text-base-content">{ACCESS_LABEL[a]}</span>
                </label>
              ))}
            </div>
          </Field>
        </div>
      </Modal>
    </div>
  )
}
