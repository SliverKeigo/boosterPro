'use client'

import { useCallback, useEffect, useState } from 'react'
import { Pencil, Trash2, Plus, ShieldCheck, ShieldAlert, Users } from 'lucide-react'
import { Modal, Field, useToast } from '@/components/ui'
import { useMyPermissions } from '@/lib/usePermissions'
import {
  RESOURCES,
  ACTIONS,
  ACTION_LABEL,
  type ResourceKey,
} from '@/lib/resources'

type MemberType = 'USER' | 'DEPARTMENT' | 'ROLE'

interface GroupMember {
  memberType: MemberType
  memberId: number
}

interface PermissionGroup {
  id: number
  name: string
  resource: string
  actions: string[]
  applyToAll: boolean
  members: GroupMember[]
}

interface OptionItem {
  id: number
  name: string
}

const EMPTY_FORM = {
  name: '',
  actions: [] as string[],
  applyToAll: true,
  userIds: [] as number[],
  departmentIds: [] as number[],
  roleIds: [] as number[],
}

type FormState = typeof EMPTY_FORM

export default function PermissionsPage() {
  const toast = useToast()
  const { isAdmin, loading: permLoading } = useMyPermissions()

  const [activeResource, setActiveResource] = useState<ResourceKey>(RESOURCES[0].key)
  const [groups, setGroups] = useState<PermissionGroup[]>([])
  const [loading, setLoading] = useState(true)

  const [users, setUsers] = useState<OptionItem[]>([])
  const [departments, setDepartments] = useState<OptionItem[]>([])
  const [roles, setRoles] = useState<OptionItem[]>([])

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<PermissionGroup | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  // 拉取当前资源的权限组。showLoading=false（如初始 / tab effect）时不在同步路径触发 setState，
  // 首条语句即 await（规避 react-hooks/set-state-in-effect）；loading 初值即 true。
  const fetchGroups = useCallback(
    async (resource: ResourceKey, showLoading = false) => {
      try {
        if (showLoading) setLoading(true)
        const res = await fetch(`/api/permission-groups?resource=${resource}`)
        if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || '')
        const json = await res.json()
        setGroups(json.data ?? [])
      } catch (e) {
        toast.error(e instanceof Error && e.message ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    },
    [toast],
  )

  // 选项（用户 / 部门 / 角色），仅管理员需要
  const fetchOptions = useCallback(async () => {
    try {
      const [uRes, dRes, rRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/departments'),
        fetch('/api/roles'),
      ])
      const [uJson, dJson, rJson] = await Promise.all([uRes.json(), dRes.json(), rRes.json()])
      setUsers(uJson.data ?? [])
      setDepartments(dJson.data ?? [])
      setRoles(rJson.data ?? [])
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '加载用户 / 部门 / 角色失败')
    }
  }, [toast])

  // 管理员就绪后加载选项；effect 同步路径不含 setState（fetchOptions 首条语句即 await）。
  useEffect(() => {
    if (permLoading || !isAdmin) return
    void (async () => {
      await fetchOptions()
    })()
  }, [permLoading, isAdmin, fetchOptions])

  // 切换资源 / 管理员就绪后加载权限组。effect 同步路径不传 showLoading，故不触发 setLoading。
  useEffect(() => {
    if (permLoading || !isAdmin) return
    void (async () => {
      await fetchGroups(activeResource)
    })()
  }, [permLoading, isAdmin, activeResource, fetchGroups])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setOpen(true)
  }

  const openEdit = (g: PermissionGroup) => {
    setEditing(g)
    setForm({
      name: g.name ?? '',
      actions: [...(g.actions ?? [])],
      applyToAll: g.applyToAll,
      userIds: (g.members ?? []).filter((m) => m.memberType === 'USER').map((m) => m.memberId),
      departmentIds: (g.members ?? [])
        .filter((m) => m.memberType === 'DEPARTMENT')
        .map((m) => m.memberId),
      roleIds: (g.members ?? []).filter((m) => m.memberType === 'ROLE').map((m) => m.memberId),
    })
    setOpen(true)
  }

  const toggleAction = (key: string) =>
    setForm((f) => ({
      ...f,
      actions: f.actions.includes(key)
        ? f.actions.filter((a) => a !== key)
        : [...f.actions, key],
    }))

  const toggleMember = (kind: 'userIds' | 'departmentIds' | 'roleIds', id: number) =>
    setForm((f) => ({
      ...f,
      [kind]: f[kind].includes(id) ? f[kind].filter((x) => x !== id) : [...f[kind], id],
    }))

  const handleDelete = async (id: number) => {
    if (!window.confirm('确认删除该权限组？')) return
    try {
      const res = await fetch(`/api/permission-groups/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || '')
      toast.success('删除成功')
      void fetchGroups(activeResource, true)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '操作失败')
    }
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) return toast.error('请填写权限组名称')
    if (form.actions.length === 0) return toast.error('请至少选择一项功能权限')
    if (
      !form.applyToAll &&
      form.userIds.length === 0 &&
      form.departmentIds.length === 0 &&
      form.roleIds.length === 0
    ) {
      return toast.error('请至少指定一个用户 / 部门 / 角色，或开启「应用于全部用户」')
    }
    setSubmitting(true)
    try {
      const members: GroupMember[] = form.applyToAll
        ? []
        : [
            ...form.userIds.map((memberId) => ({ memberType: 'USER' as const, memberId })),
            ...form.departmentIds.map((memberId) => ({
              memberType: 'DEPARTMENT' as const,
              memberId,
            })),
            ...form.roleIds.map((memberId) => ({ memberType: 'ROLE' as const, memberId })),
          ]
      const payload = {
        name: form.name.trim(),
        resource: activeResource,
        actions: form.actions,
        applyToAll: form.applyToAll,
        members,
      }
      const url = editing ? `/api/permission-groups/${editing.id}` : '/api/permission-groups'
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || '')
      toast.success(editing ? '更新成功' : '创建成功')
      setOpen(false)
      void fetchGroups(activeResource, true)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  const actionsText = (actions: string[]) =>
    actions.length ? actions.map((a) => ACTION_LABEL[a] ?? a).join('，') : '—'

  const scopeText = (g: PermissionGroup) => {
    if (g.applyToAll) return '全部用户'
    const u = g.members.filter((m) => m.memberType === 'USER').length
    const d = g.members.filter((m) => m.memberType === 'DEPARTMENT').length
    const r = g.members.filter((m) => m.memberType === 'ROLE').length
    return `用户 ${u} · 部门 ${d} · 角色 ${r}`
  }

  // 权限校验中
  if (permLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    )
  }

  // 非管理员
  if (!isAdmin) {
    return (
      <div>
        <div className="mb-4">
          <h1 className="text-xl font-bold text-base-content">权限设置</h1>
          <p className="mt-0.5 text-sm text-base-content/50">配置用户、部门、角色对各资源的访问权限</p>
        </div>
        <div className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body items-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-error/10">
              <ShieldAlert className="h-8 w-8 text-error" />
            </div>
            <h2 className="mt-2 text-lg font-semibold text-base-content">无权访问</h2>
            <p className="max-w-md text-sm text-base-content/50">仅管理员可配置权限</p>
          </div>
        </div>
      </div>
    )
  }

  const memberCheckboxList = (
    kind: 'userIds' | 'departmentIds' | 'roleIds',
    items: OptionItem[],
    emptyText: string,
  ) => (
    <div className="max-h-44 overflow-y-auto rounded-lg border border-base-300 bg-base-100 p-2">
      {items.length === 0 ? (
        <div className="py-4 text-center text-xs text-base-content/40">{emptyText}</div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {items.map((it) => (
            <label
              key={it.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-base-200"
            >
              <input
                type="checkbox"
                className="checkbox checkbox-sm checkbox-primary"
                checked={form[kind].includes(it.id)}
                onChange={() => toggleMember(kind, it.id)}
              />
              <span className="text-sm text-base-content">{it.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-base-content">权限设置</h1>
          <p className="mt-0.5 text-sm text-base-content/50">
            为用户、部门或角色配置对各业务资源的功能权限
          </p>
        </div>
        <button className="btn btn-primary btn-sm gap-1.5" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          新增权限组
        </button>
      </div>

      {/* 资源 tabs */}
      <div role="tablist" className="tabs tabs-boxed mb-4 flex-wrap bg-base-200">
        {RESOURCES.map((r) => (
          <button
            key={r.key}
            role="tab"
            className={`tab gap-1.5 ${activeResource === r.key ? 'tab-active' : ''}`}
            onClick={() => setActiveResource(r.key)}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {r.label}
          </button>
        ))}
      </div>

      {/* 权限组列表 */}
      <div className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body p-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <span className="loading loading-spinner loading-md text-primary" />
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-base-200">
                <ShieldCheck className="h-7 w-7 text-base-content/40" />
              </div>
              <p className="text-sm text-base-content/50">该资源暂无权限组，点击右上角「新增权限组」开始配置</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {groups.map((g) => (
                <div
                  key={g.id}
                  className="flex flex-col gap-3 rounded-xl border border-base-300 bg-base-100 p-4 transition-colors hover:border-primary/40 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-base-content">{g.name}</span>
                      {g.applyToAll && (
                        <span className="badge badge-success badge-sm gap-1">
                          <Users className="h-3 w-3" />
                          全部用户
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-base-content/60">
                      <span>
                        <span className="text-base-content/40">功能：</span>
                        {actionsText(g.actions)}
                      </span>
                      <span>
                        <span className="text-base-content/40">范围：</span>
                        {scopeText(g)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      className="btn btn-ghost btn-xs gap-1 text-primary"
                      onClick={() => openEdit(g)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      编辑
                    </button>
                    <button
                      className="btn btn-ghost btn-xs gap-1 text-error"
                      onClick={() => handleDelete(g.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 新增 / 编辑弹窗 */}
      <Modal
        open={open}
        title={editing ? '编辑权限组' : '新增权限组'}
        onClose={() => setOpen(false)}
        onOk={handleSubmit}
        okText={editing ? '保存' : '创建'}
        confirmLoading={submitting}
        width={680}
      >
        <div className="flex flex-col gap-4">
          <Field label="权限组名称" required>
            <input
              className="input input-bordered w-full"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="请输入，如：销售部可查看候选人"
            />
          </Field>

          <Field label="功能权限" required>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {/* 导入已恢复（全模块导出→改→导入），IMPORT 权限可正常配置 */}
              {ACTIONS.map((a) => (
                <label
                  key={a.key}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-base-300 px-3 py-2 hover:bg-base-200"
                >
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-primary"
                    checked={form.actions.includes(a.key)}
                    onChange={() => toggleAction(a.key)}
                  />
                  <span className="text-sm text-base-content">{a.label}</span>
                </label>
              ))}
            </div>
          </Field>

          <div className="flex items-center justify-between rounded-lg border border-base-300 px-3 py-2.5">
            <div>
              <div className="text-sm font-medium text-base-content/80">应用于全部用户</div>
              <div className="text-xs text-base-content/50">开启后该资源对所有用户生效</div>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={form.applyToAll}
              onChange={(e) => setField('applyToAll', e.target.checked)}
            />
          </div>

          {!form.applyToAll && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="指定用户">
                {memberCheckboxList('userIds', users, '暂无用户')}
              </Field>
              <Field label="指定部门">
                {memberCheckboxList('departmentIds', departments, '暂无部门')}
              </Field>
              <Field label="指定角色">
                {memberCheckboxList('roleIds', roles, '暂无角色')}
              </Field>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
