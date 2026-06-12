// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// BoostTable 用 useMyPermissions 拿 userId 拼持久化 key（按用户隔离）；测试 mock 成固定用户 7
vi.mock('@/lib/usePermissions', () => ({
  useMyPermissions: () => ({ perm: { userId: 7, isAdmin: true, permissions: {} }, loading: false, can: () => true }),
}))

import { BoostTable, type BoostColumn } from '@/components/ui/BoostTable'

interface Row {
  id: number
  name: string
  age: number
}

const columns: BoostColumn<Row>[] = [
  { key: 'name', title: '姓名', sortable: true },
  { key: 'age', title: '年龄', sortable: true },
]

const data: Row[] = [
  { id: 1, name: '张三', age: 30 },
  { id: 2, name: '李四', age: 20 },
  { id: 3, name: '王五', age: 25 },
]

/** 取 tbody 内的数据行（排除表头行与空态 div） */
function bodyRows(container: HTMLElement): HTMLTableRowElement[] {
  return Array.from(container.querySelectorAll('tbody tr')) as HTMLTableRowElement[]
}

/** 取第 rowIndex 行第 colIndex 个单元格文本 */
function cellText(container: HTMLElement, rowIndex: number, colIndex: number): string {
  const row = bodyRows(container)[rowIndex]
  return (row.querySelectorAll('td')[colIndex]?.textContent ?? '').trim()
}

describe('BoostTable', () => {
  it('渲染所有数据行', () => {
    const { container } = render(<BoostTable columns={columns} data={data} />)
    expect(bodyRows(container)).toHaveLength(3)
    expect(screen.getByText('张三')).toBeInTheDocument()
    expect(screen.getByText('李四')).toBeInTheDocument()
    expect(screen.getByText('王五')).toBeInTheDocument()
    // 列表底部展示总条数
    expect(screen.getByText('共 3 条')).toBeInTheDocument()
  })

  it('空数据时显示空态提示', () => {
    render(<BoostTable columns={columns} data={[]} emptyText="暂无记录" />)
    expect(screen.getByText('暂无记录')).toBeInTheDocument()
  })

  it('搜索框按全字段过滤可见行', async () => {
    const user = userEvent.setup()
    const { container } = render(<BoostTable columns={columns} data={data} />)
    expect(bodyRows(container)).toHaveLength(3)
    const searchBox = screen.getByPlaceholderText('搜索全部字段…')
    await user.type(searchBox, '李四')
    expect(bodyRows(container)).toHaveLength(1)
    expect(cellText(container, 0, 0)).toBe('李四')
  })

  it('点击可排序列表头改变行顺序', () => {
    const { container } = render(<BoostTable columns={columns} data={data} />)
    // 初始顺序按 data 原序：张三 / 李四 / 王五
    expect(cellText(container, 0, 0)).toBe('张三')

    // 点击「年龄」表头 → 升序（李四20 / 王五25 / 张三30）
    fireEvent.click(screen.getByRole('button', { name: '年龄' }))
    expect(cellText(container, 0, 1)).toBe('20')
    expect(cellText(container, 1, 1)).toBe('25')
    expect(cellText(container, 2, 1)).toBe('30')

    // 再次点击 → 降序（30 / 25 / 20）
    fireEvent.click(screen.getByRole('button', { name: '年龄' }))
    expect(cellText(container, 0, 1)).toBe('30')
    expect(cellText(container, 2, 1)).toBe('20')
  })

  it('分页：pageSize 限制每页行数，下一页可前进', () => {
    const big: Row[] = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      name: `员工${i + 1}`,
      age: 20 + i,
    }))
    const { container } = render(<BoostTable columns={columns} data={big} pageSize={2} />)
    // 每页仅 2 行
    expect(bodyRows(container)).toHaveLength(2)
    expect(cellText(container, 0, 0)).toBe('员工1')
    // 页码 1 / 3（ceil(5/2)）
    expect(screen.getByText('1 / 3')).toBeInTheDocument()

    // 下一页：分页区最后一个按钮（ChevronRight）
    const pager = container.querySelector('.join') as HTMLElement
    const pagerBtns = within(pager).getAllByRole('button')
    const nextBtn = pagerBtns[pagerBtns.length - 1]
    fireEvent.click(nextBtn)

    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(cellText(container, 0, 0)).toBe('员工3')
  })

  it('“显示列”可隐藏某一列', async () => {
    const user = userEvent.setup()
    render(<BoostTable columns={columns} data={data} />)
    // 初始两列表头都在
    expect(screen.getByRole('button', { name: '姓名' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '年龄' })).toBeInTheDocument()

    // 打开“显示列”面板
    await user.click(screen.getByText('显示列'))
    // 面板内出现勾选项提示
    expect(screen.getByText('勾选要显示的列')).toBeInTheDocument()

    // 取消勾选“年龄”列（label 内含文字“年龄”的 checkbox）
    const ageLabel = screen.getByText('年龄', { selector: 'span' }).closest('label') as HTMLElement
    const ageCheckbox = within(ageLabel).getByRole('checkbox')
    expect(ageCheckbox).toBeChecked()
    await user.click(ageCheckbox)

    // 表头不再有可排序的“年龄”按钮
    expect(screen.queryByRole('button', { name: '年龄' })).toBeNull()
    // 姓名仍在
    expect(screen.getByRole('button', { name: '姓名' })).toBeInTheDocument()
  })

  it('默认渲染内置导出控件', () => {
    render(<BoostTable columns={columns} data={data} />)
    // 未传 onExport 时为内置导出 Dropdown，触发器文字为“导出”
    expect(screen.getByText('导出')).toBeInTheDocument()
  })

  it('showExport=false 时隐藏导出控件', () => {
    render(<BoostTable columns={columns} data={data} showExport={false} />)
    expect(screen.queryByText('导出')).toBeNull()
  })

  it('传入 onExport 时点击触发自定义导出回调', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()
    render(<BoostTable columns={columns} data={data} onExport={onExport} />)
    await user.click(screen.getByText('导出'))
    expect(onExport).toHaveBeenCalledTimes(1)
  })

  it('onCreate 渲染新增按钮并可点击', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<BoostTable columns={columns} data={data} onCreate={onCreate} createText="新增候选人" />)
    await user.click(screen.getByRole('button', { name: /新增候选人/ }))
    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it('actions 列为每行渲染操作内容', () => {
    const { container } = render(
      <BoostTable
        columns={columns}
        data={data}
        actions={(r) => <button type="button">编辑{r.name}</button>}
      />,
    )
    expect(screen.getByRole('button', { name: '编辑张三' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '编辑李四' })).toBeInTheDocument()
    // 表头出现“操作”列
    expect(within(container.querySelector('thead') as HTMLElement).getByText('操作')).toBeInTheDocument()
  })

  it('筛选连接符：整组单一「且/或」，仅第 2 条可改且同步到后续条件', async () => {
    const user = userEvent.setup()
    render(<BoostTable columns={columns} data={data} />)
    await user.click(screen.getByText('筛选'))
    // 面板首行为「当」；点两次「添加筛选条件」→ 共 3 条
    const addBtn = await screen.findByText('添加筛选条件')
    await user.click(addBtn)
    await user.click(addBtn)
    // 连接符 select = 含 <option value="and"> 的 select（字段/运算符 select 不含）
    const connectors = () =>
      (Array.from(document.querySelectorAll('select')) as HTMLSelectElement[]).filter((s) =>
        s.querySelector('option[value="and"]'),
      )
    // 第 1 条是「当」(无 select)，故连接符 select 只有第 2、3 条共 2 个
    expect(connectors()).toHaveLength(2)
    // 第 2 条可改、第 3 条只读
    expect(connectors()[0].disabled).toBe(false)
    expect(connectors()[1].disabled).toBe(true)
    // 把第 2 条改成「或」→ 第 3 条同步为「或」
    fireEvent.change(connectors()[0], { target: { value: 'or' } })
    expect(connectors()[0].value).toBe('or')
    expect(connectors()[1].value).toBe('or')
  })

  it('multiValue select 列：默认「等于任意」，勾选某状态命中多状态行（status 多值筛选）', async () => {
    const user = userEvent.setup()
    interface R {
      id: number
      status: string[]
    }
    const cols: BoostColumn<R>[] = [
      {
        key: 'status',
        title: '岗位状态',
        filterType: 'select',
        multiValue: true,
        filterOptions: [
          { label: '正常', value: '正常' },
          { label: '重启', value: '重启' },
          { label: '新增', value: '新增' },
        ],
        accessor: (r) => r.status.join(' '),
        render: (_v, r) => <span>{r.status.join('/')}</span>,
      },
    ]
    const rows: R[] = [
      { id: 1, status: ['正常', '重启'] },
      { id: 2, status: ['新增'] },
    ]
    const { container } = render(<BoostTable columns={cols} data={rows} />)
    expect(bodyRows(container)).toHaveLength(2)

    // 打开筛选面板：默认带一条 status 条件，运算符应为「等于任意」(in) → 直接出现勾选区
    await user.click(screen.getByText('筛选'))
    // 勾选「正常」（label 内 span 文本恰为「正常」；单元格渲染为「正常/重启」不冲突）
    const normalLabel = screen.getByText('正常', { selector: 'span' }).closest('label') as HTMLElement
    await user.click(within(normalLabel).getByRole('checkbox'))
    // 点面板主按钮应用筛选
    await user.click(container.querySelector('.btn-primary') as HTMLElement)

    // 「正常 重启」行命中、「新增」行被过滤
    expect(bodyRows(container)).toHaveLength(1)
    expect(screen.getByText('正常/重启')).toBeInTheDocument()
  })

  it('筛选条件持久化：重新挂载（如再次进入页面）后沿用上次筛选，无需重新添加', async () => {
    const user = userEvent.setup()
    const KEY = 'bp:filters:u7:测试持久化' // 带 userId 前缀（按用户隔离）
    window.localStorage.removeItem(KEY)

    // 第一次进入：设置「姓名 包含 李」并应用
    const first = render(<BoostTable columns={columns} data={data} storageKey="测试持久化" />)
    await user.click(screen.getByText('筛选'))
    await user.type(screen.getByPlaceholderText('输入值'), '李')
    await user.click(first.container.querySelector('.btn-primary') as HTMLElement)
    expect(bodyRows(first.container)).toHaveLength(1)
    expect(cellText(first.container, 0, 0)).toBe('李四')
    // 已写入 localStorage
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? '[]')).toHaveLength(1)
    first.unmount()

    // 第二次进入（重新挂载）：无需任何操作，上次筛选直接生效
    const second = render(<BoostTable columns={columns} data={data} storageKey="测试持久化" />)
    expect(bodyRows(second.container)).toHaveLength(1)
    expect(cellText(second.container, 0, 0)).toBe('李四')

    // 面板里能看到回显的条件值；清空值后应用 → 全量恢复且存储被清
    await user.click(screen.getByText('筛选'))
    expect(screen.getByDisplayValue('李')).toBeInTheDocument()
    await user.click(screen.getByText('清空值'))
    await user.click(second.container.querySelector('.btn-primary') as HTMLElement)
    expect(bodyRows(second.container)).toHaveLength(3)
    window.localStorage.removeItem(KEY)
  })
})
