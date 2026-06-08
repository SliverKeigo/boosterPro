'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Eye,
  Trash2,
  Plus,
  BookMarked,
  ShieldAlert,
  ListChecks,
} from 'lucide-react'
import { Modal, Field, Popconfirm, useToast } from '@/components/ui'
import { useMyPermissions } from '@/lib/usePermissions'
import { clearDictCache } from '@/lib/useDict'

interface DictType {
  id: number
  code: string
  name: string
  remark: string | null
  _count: { items: number }
}

interface DictItem {
  id: number
  typeId: number
  label: string
  value: string
  sort: number
  enabled: boolean
}

const EMPTY_TYPE_FORM = { code: '', name: '', remark: '' }
type TypeForm = typeof EMPTY_TYPE_FORM

const EMPTY_ITEM_FORM = { label: '', value: '', sort: '0', enabled: true }
type ItemForm = typeof EMPTY_ITEM_FORM

export default function DictionariesPage() {
  const toast = useToast()
  const { isAdmin, loading: permLoading } = useMyPermissions()

  // 字典类型
  const [types, setTypes] = useState<DictType[]>([])
  const [typesLoading, setTypesLoading] = useState(true)
  const [activeTypeId, setActiveTypeId] = useState<number | null>(null)

  // 字典项
  const [items, setItems] = useState<DictItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)

  // 类型弹窗
  const [typeOpen, setTypeOpen] = useState(false)
  const [editingType, setEditingType] = useState<DictType | null>(null)
  const [modeType, setModeType] = useState<'view' | 'edit'>('edit') // 详情(只读) / 编辑
  const [typeForm, setTypeForm] = useState<TypeForm>(EMPTY_TYPE_FORM)
  const [typeSubmitting, setTypeSubmitting] = useState(false)
  const setTypeField = <K extends keyof TypeForm>(k: K, v: TypeForm[K]) =>
    setTypeForm((f) => ({ ...f, [k]: v }))

  // 字典项弹窗
  const [itemOpen, setItemOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<DictItem | null>(null)
  const [modeItem, setModeItem] = useState<'view' | 'edit'>('edit') // 详情(只读) / 编辑
  const [itemForm, setItemForm] = useState<ItemForm>(EMPTY_ITEM_FORM)
  const [itemSubmitting, setItemSubmitting] = useState(false)
  const setItemField = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) =>
    setItemForm((f) => ({ ...f, [k]: v }))

  // 拉取字典类型。showLoading=false（初始 / effect）时不在同步路径触发 setState（规避
  // react-hooks/set-state-in-effect）；typesLoading 初值即 true，finally 置 false。
  const fetchTypes = useCallback(
    async (showLoading = false) => {
      try {
        if (showLoading) setTypesLoading(true)
        const res = await fetch('/api/dict-types')
        if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || '')
        const json = await res.json()
        const list: DictType[] = json.data ?? []
        setTypes(list)
        // 默认选中第一项；若当前选中项已被删除则回退到第一项
        setActiveTypeId((cur) =>
          cur != null && list.some((t) => t.id === cur) ? cur : (list[0]?.id ?? null),
        )
      } catch (e) {
        toast.error(e instanceof Error && e.message ? e.message : '加载失败')
      } finally {
        setTypesLoading(false)
      }
    },
    [toast],
  )

  // 拉取某类型下的字典项。effect 同步路径不传 showLoading，故不触发 setState。
  const fetchItems = useCallback(
    async (typeId: number, showLoading = false) => {
      try {
        if (showLoading) setItemsLoading(true)
        const res = await fetch(`/api/dict-items?typeId=${typeId}`)
        if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || '')
        const json = await res.json()
        setItems(json.data ?? [])
      } catch (e) {
        toast.error(e instanceof Error && e.message ? e.message : '加载失败')
      } finally {
        setItemsLoading(false)
      }
    },
    [toast],
  )

  // 管理员就绪后加载类型；effect 同步路径不含 setState（fetchTypes 首条语句即 await）。
  useEffect(() => {
    if (permLoading || !isAdmin) return
    void (async () => {
      await fetchTypes()
    })()
  }, [permLoading, isAdmin, fetchTypes])

  // 选中类型变化后加载其字典项。activeTypeId 为 null 时不发请求，items 由初值 / 上次结果兜底；
  // effect 同步路径不含 setState（fetchItems 首条语句即 await），规避 react-hooks/set-state-in-effect。
  useEffect(() => {
    if (permLoading || !isAdmin || activeTypeId == null) return
    void (async () => {
      await fetchItems(activeTypeId, true)
    })()
  }, [permLoading, isAdmin, activeTypeId, fetchItems])

  // ── 字典类型增删改 ──────────────────────────────────────────────
  const openCreateType = () => {
    setEditingType(null)
    setModeType('edit')
    setTypeForm({ ...EMPTY_TYPE_FORM })
    setTypeOpen(true)
  }

  const openDetailType = (t: DictType) => {
    setEditingType(t)
    setModeType('view')
    setTypeForm({ code: t.code ?? '', name: t.name ?? '', remark: t.remark ?? '' })
    setTypeOpen(true)
  }

  const handleDeleteType = async (id: number) => {
    try {
      const res = await fetch(`/api/dict-types/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || '')
      toast.success('删除成功')
      clearDictCache()
      void fetchTypes(true)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '操作失败')
    }
  }

  const handleSubmitType = async () => {
    if (!typeForm.code.trim()) return toast.error('请填写类型编码')
    if (!typeForm.name.trim()) return toast.error('请填写类型名称')
    setTypeSubmitting(true)
    try {
      const payload = {
        code: typeForm.code.trim(),
        name: typeForm.name.trim(),
        remark: typeForm.remark.trim() || undefined,
      }
      const url = editingType ? `/api/dict-types/${editingType.id}` : '/api/dict-types'
      const res = await fetch(url, {
        method: editingType ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || '')
      toast.success(editingType ? '更新成功' : '创建成功')
      setTypeOpen(false)
      clearDictCache()
      void fetchTypes(true)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '操作失败')
    } finally {
      setTypeSubmitting(false)
    }
  }

  // ── 字典项增删改 ────────────────────────────────────────────────
  const openCreateItem = () => {
    setEditingItem(null)
    setModeItem('edit')
    setItemForm({ ...EMPTY_ITEM_FORM })
    setItemOpen(true)
  }

  const openDetailItem = (it: DictItem) => {
    setEditingItem(it)
    setModeItem('view')
    setItemForm({
      label: it.label ?? '',
      value: it.value ?? '',
      sort: String(it.sort ?? 0),
      enabled: it.enabled,
    })
    setItemOpen(true)
  }

  const refreshAfterItemChange = () => {
    clearDictCache()
    if (activeTypeId != null) void fetchItems(activeTypeId, true)
    // 项数变化需同步左侧 _count
    void fetchTypes(true)
  }

  const handleDeleteItem = async (id: number) => {
    try {
      const res = await fetch(`/api/dict-items/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || '')
      toast.success('删除成功')
      refreshAfterItemChange()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '操作失败')
    }
  }

  const handleSubmitItem = async () => {
    if (activeTypeId == null) return toast.error('请先选择左侧字典类型')
    if (!itemForm.label.trim()) return toast.error('请填写显示名称')
    if (!itemForm.value.trim()) return toast.error('请填写存储值')
    setItemSubmitting(true)
    try {
      const payload = {
        typeId: activeTypeId,
        label: itemForm.label.trim(),
        value: itemForm.value.trim(),
        sort: Number(itemForm.sort) || 0,
        enabled: itemForm.enabled,
      }
      const url = editingItem ? `/api/dict-items/${editingItem.id}` : '/api/dict-items'
      const res = await fetch(url, {
        method: editingItem ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.clone().json().catch(() => ({}))).error || '')
      toast.success(editingItem ? '更新成功' : '创建成功')
      setItemOpen(false)
      refreshAfterItemChange()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '操作失败')
    } finally {
      setItemSubmitting(false)
    }
  }

  const activeType = types.find((t) => t.id === activeTypeId) ?? null

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
          <h1 className="text-xl font-bold text-base-content">字典管理</h1>
          <p className="mt-0.5 text-sm text-base-content/50">维护下拉选项等数据字典</p>
        </div>
        <div className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body items-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-error/10">
              <ShieldAlert className="h-8 w-8 text-error" />
            </div>
            <h2 className="mt-2 text-lg font-semibold text-base-content">无权访问</h2>
            <p className="max-w-md text-sm text-base-content/50">仅管理员可管理数据字典</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-base-content">字典管理</h1>
        <p className="mt-0.5 text-sm text-base-content/50">
          维护各业务下拉选项的数据字典（类型与字典项）
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* ── 左：字典类型列表 ── */}
        <div className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="flex items-center justify-between border-b border-base-300 px-4 py-3">
            <span className="text-sm font-semibold text-base-content">字典类型</span>
            <button className="btn btn-primary btn-xs gap-1" onClick={openCreateType}>
              <Plus className="h-3.5 w-3.5" />
              新增类型
            </button>
          </div>
          <div className="p-2">
            {typesLoading ? (
              <div className="flex items-center justify-center py-16">
                <span className="loading loading-spinner loading-md text-primary" />
              </div>
            ) : types.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-base-200">
                  <BookMarked className="h-6 w-6 text-base-content/40" />
                </div>
                <p className="px-4 text-sm text-base-content/50">
                  暂无字典类型，点击「新增类型」开始
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {types.map((t) => {
                  const active = t.id === activeTypeId
                  return (
                    <li key={t.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveTypeId(t.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setActiveTypeId(t.id)
                          }
                        }}
                        className={`group flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                          active
                            ? 'border-primary/40 bg-primary/5'
                            : 'border-transparent hover:bg-base-200'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-base-content">
                              {t.name}
                            </span>
                            <span className="badge badge-ghost badge-sm shrink-0">
                              {t._count?.items ?? 0} 项
                            </span>
                          </div>
                          <div className="mt-0.5 truncate font-mono text-xs text-base-content/50">
                            {t.code}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            aria-label="查看类型详情"
                            className="btn btn-ghost btn-xs btn-square text-primary"
                            onClick={(e) => {
                              e.stopPropagation()
                              openDetailType(t)
                            }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <span onClick={(e) => e.stopPropagation()}>
                            <Popconfirm
                              title="确认删除该字典类型？"
                              description="其下所有字典项将一并删除。"
                              onConfirm={() => handleDeleteType(t.id)}
                            >
                              <button
                                type="button"
                                aria-label="删除类型"
                                className="btn btn-ghost btn-xs btn-square text-error"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </Popconfirm>
                          </span>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* ── 右：所选类型的字典项 ── */}
        <div className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="flex items-center justify-between border-b border-base-300 px-4 py-3">
            <div className="min-w-0">
              <span className="text-sm font-semibold text-base-content">字典项</span>
              {activeType && (
                <span className="ml-2 text-xs text-base-content/50">
                  {activeType.name}
                  <span className="ml-1 font-mono">（{activeType.code}）</span>
                </span>
              )}
            </div>
            <button
              className="btn btn-primary btn-xs gap-1"
              onClick={openCreateItem}
              disabled={activeTypeId == null}
            >
              <Plus className="h-3.5 w-3.5" />
              新增字典项
            </button>
          </div>

          <div className="p-2">
            {activeTypeId == null ? (
              <div className="flex flex-col items-center gap-2 py-20 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-base-200">
                  <ListChecks className="h-6 w-6 text-base-content/40" />
                </div>
                <p className="text-sm text-base-content/50">请先在左侧选择一个字典类型</p>
              </div>
            ) : itemsLoading ? (
              <div className="flex items-center justify-center py-16">
                <span className="loading loading-spinner loading-md text-primary" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-20 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-base-200">
                  <ListChecks className="h-6 w-6 text-base-content/40" />
                </div>
                <p className="text-sm text-base-content/50">
                  该类型暂无字典项，点击右上角「新增字典项」开始
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>显示名称</th>
                      <th>存储值</th>
                      <th className="w-20">排序</th>
                      <th className="w-20">启用</th>
                      <th className="w-28 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id} className="hover:bg-base-200/60">
                        <td className="font-medium text-base-content">{it.label}</td>
                        <td className="font-mono text-xs text-base-content/70">{it.value}</td>
                        <td className="text-base-content/70">{it.sort}</td>
                        <td>
                          {it.enabled ? (
                            <span className="badge badge-success badge-sm">启用</span>
                          ) : (
                            <span className="badge badge-ghost badge-sm">停用</span>
                          )}
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              className="btn btn-ghost btn-xs gap-1 text-primary"
                              onClick={() => openDetailItem(it)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              详情
                            </button>
                            <Popconfirm
                              title="确认删除该字典项？"
                              onConfirm={() => handleDeleteItem(it.id)}
                            >
                              <button className="btn btn-ghost btn-xs gap-1 text-error">
                                <Trash2 className="h-3.5 w-3.5" />
                                删除
                              </button>
                            </Popconfirm>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 新增 / 编辑字典类型 */}
      <Modal
        open={typeOpen}
        title={modeType === 'view' ? '字典类型详情' : editingType ? '编辑字典类型' : '新增字典类型'}
        onClose={() => setTypeOpen(false)}
        onOk={handleSubmitType}
        okText={editingType ? '保存' : '创建'}
        confirmLoading={typeSubmitting}
        readOnly={modeType === 'view'}
        onEdit={isAdmin ? () => setModeType('edit') : undefined}
        width={520}
      >
        <div className="flex flex-col gap-4">
          <Field label="类型编码" required>
            <input
              className="input input-bordered w-full"
              value={typeForm.code}
              onChange={(e) => setTypeField('code', e.target.value)}
              placeholder="英文标识，如：candidate_status"
            />
          </Field>
          <Field label="类型名称" required>
            <input
              className="input input-bordered w-full"
              value={typeForm.name}
              onChange={(e) => setTypeField('name', e.target.value)}
              placeholder="请输入，如：候选人状态"
            />
          </Field>
          <Field label="备注">
            <textarea
              className="textarea textarea-bordered w-full"
              rows={2}
              value={typeForm.remark}
              onChange={(e) => setTypeField('remark', e.target.value)}
              placeholder="选填"
            />
          </Field>
        </div>
      </Modal>

      {/* 新增 / 编辑字典项 */}
      <Modal
        open={itemOpen}
        title={modeItem === 'view' ? '字典项详情' : editingItem ? '编辑字典项' : '新增字典项'}
        onClose={() => setItemOpen(false)}
        onOk={handleSubmitItem}
        okText={editingItem ? '保存' : '创建'}
        confirmLoading={itemSubmitting}
        readOnly={modeItem === 'view'}
        onEdit={isAdmin ? () => setModeItem('edit') : undefined}
        width={520}
      >
        <div className="flex flex-col gap-4">
          <Field label="显示名称" required>
            <input
              className="input input-bordered w-full"
              value={itemForm.label}
              onChange={(e) => setItemField('label', e.target.value)}
              placeholder="下拉中展示的文案"
            />
          </Field>
          <Field label="存储值" required>
            <input
              className="input input-bordered w-full"
              value={itemForm.value}
              onChange={(e) => setItemField('value', e.target.value)}
              placeholder="实际存库的值"
            />
          </Field>
          <Field label="排序">
            <input
              type="number"
              className="input input-bordered w-full"
              value={itemForm.sort}
              onChange={(e) => setItemField('sort', e.target.value)}
              placeholder="数字越小越靠前"
            />
          </Field>
          <div className="flex items-center justify-between rounded-lg border border-base-300 px-3 py-2.5">
            <div>
              <div className="text-sm font-medium text-base-content/80">启用</div>
              <div className="text-xs text-base-content/50">停用后该项不在前台下拉中出现</div>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={itemForm.enabled}
              onChange={(e) => setItemField('enabled', e.target.checked)}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
