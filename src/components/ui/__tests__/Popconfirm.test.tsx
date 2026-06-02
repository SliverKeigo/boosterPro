// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Popconfirm } from '@/components/ui/Popconfirm'

describe('Popconfirm', () => {
  it('初始不显示确认气泡', () => {
    render(
      <Popconfirm title="确定删除？" onConfirm={() => {}}>
        <button type="button">删除</button>
      </Popconfirm>,
    )
    expect(screen.getByText('删除')).toBeInTheDocument()
    expect(screen.queryByText('确定删除？')).toBeNull()
  })

  it('点击触发器显示确认气泡（含 title / description）', async () => {
    const user = userEvent.setup()
    render(
      <Popconfirm title="确定删除？" description="删除后不可恢复" onConfirm={() => {}}>
        <button type="button">删除</button>
      </Popconfirm>,
    )
    await user.click(screen.getByText('删除'))
    expect(screen.getByText('确定删除？')).toBeInTheDocument()
    expect(screen.getByText('删除后不可恢复')).toBeInTheDocument()
  })

  it('点击确认按钮触发 onConfirm 并关闭气泡', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <Popconfirm title="确定删除？" onConfirm={onConfirm}>
        <button type="button">删除</button>
      </Popconfirm>,
    )
    await user.click(screen.getByText('删除'))
    await user.click(screen.getByRole('button', { name: '确认' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('确定删除？')).toBeNull()
  })

  it('点击取消按钮关闭气泡且不触发 onConfirm', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <Popconfirm title="确定删除？" onConfirm={onConfirm}>
        <button type="button">删除</button>
      </Popconfirm>,
    )
    await user.click(screen.getByText('删除'))
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByText('确定删除？')).toBeNull()
  })

  it('支持自定义 okText / cancelText', async () => {
    const user = userEvent.setup()
    render(
      <Popconfirm title="确定删除？" onConfirm={() => {}} okText="是的" cancelText="算了">
        <button type="button">删除</button>
      </Popconfirm>,
    )
    await user.click(screen.getByText('删除'))
    expect(screen.getByRole('button', { name: '是的' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '算了' })).toBeInTheDocument()
  })
})
