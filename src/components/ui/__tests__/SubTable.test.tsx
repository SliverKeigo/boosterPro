// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SubTable, type SubTableColumn } from '@/components/ui/SubTable'

const columns: SubTableColumn[] = [
  { key: 'name', title: '项目名称' },
  { key: 'amount', title: '金额', type: 'number' },
]

describe('SubTable', () => {
  it('空 value 时渲染表头与空态提示', () => {
    render(<SubTable columns={columns} value={[]} onChange={() => {}} />)
    expect(screen.getByText('项目名称')).toBeInTheDocument()
    expect(screen.getByText('金额')).toBeInTheDocument()
    expect(screen.getByText('暂无数据，点击下方按钮添加')).toBeInTheDocument()
  })

  it('渲染已有数据行，输入框带当前值', () => {
    render(
      <SubTable
        columns={columns}
        value={[{ name: '设计费', amount: '1000' }]}
        onChange={() => {}}
      />,
    )
    expect(screen.getByDisplayValue('设计费')).toBeInTheDocument()
    expect(screen.getByDisplayValue('1000')).toBeInTheDocument()
    // 行号 1
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('点击新增按钮回调一行空数据', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SubTable columns={columns} value={[]} onChange={onChange} addText="新增一项" />)
    await user.click(screen.getByRole('button', { name: /新增一项/ }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith([{ name: '', amount: '' }])
  })

  it('编辑单元格触发 onChange 并合入该行', () => {
    const onChange = vi.fn()
    render(
      <SubTable
        columns={columns}
        value={[{ name: '设计费', amount: '1000' }]}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByDisplayValue('设计费'), { target: { value: '咨询费' } })
    expect(onChange).toHaveBeenCalledWith([{ name: '咨询费', amount: '1000' }])
  })

  it('点击删除按钮移除对应行', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <SubTable
        columns={columns}
        value={[
          { name: '设计费', amount: '1000' },
          { name: '咨询费', amount: '2000' },
        ]}
        onChange={onChange}
      />,
    )
    const delButtons = screen.getAllByRole('button', { name: '删除该行' })
    expect(delButtons).toHaveLength(2)
    await user.click(delButtons[0])
    expect(onChange).toHaveBeenCalledWith([{ name: '咨询费', amount: '2000' }])
  })

  it('select 类型列渲染下拉选项', () => {
    const cols: SubTableColumn[] = [
      {
        key: 'status',
        title: '状态',
        type: 'select',
        options: [
          { label: '进行中', value: 'doing' },
          { label: '已完成', value: 'done' },
        ],
      },
    ]
    render(<SubTable columns={cols} value={[{ status: 'doing' }]} onChange={() => {}} />)
    const select = screen.getByRole('combobox')
    expect(within(select).getByText('进行中')).toBeInTheDocument()
    expect(within(select).getByText('已完成')).toBeInTheDocument()
  })

  it('渲染可选标题', () => {
    render(<SubTable title="费用明细" columns={columns} value={[]} onChange={() => {}} />)
    expect(screen.getByText('费用明细')).toBeInTheDocument()
  })
})
