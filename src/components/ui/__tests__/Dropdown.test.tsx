// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dropdown } from '@/components/ui/Dropdown'

describe('Dropdown', () => {
  it('渲染触发器，面板初始关闭', () => {
    render(
      <Dropdown trigger={<span>打开菜单</span>}>
        <div>面板内容</div>
      </Dropdown>,
    )
    expect(screen.getByText('打开菜单')).toBeInTheDocument()
    expect(screen.queryByText('面板内容')).toBeNull()
  })

  it('点击触发器打开面板（children 节点）', async () => {
    const user = userEvent.setup()
    render(
      <Dropdown trigger={<span>打开菜单</span>}>
        <div>面板内容</div>
      </Dropdown>,
    )
    await user.click(screen.getByText('打开菜单'))
    expect(screen.getByText('面板内容')).toBeInTheDocument()
  })

  it('支持 render-prop 形式的 children 并暴露 close', async () => {
    const user = userEvent.setup()
    render(
      <Dropdown trigger={<span>打开菜单</span>}>
        {(close) => (
          <button type="button" onClick={close}>
            关闭面板
          </button>
        )}
      </Dropdown>,
    )
    await user.click(screen.getByText('打开菜单'))
    const closeBtn = screen.getByText('关闭面板')
    expect(closeBtn).toBeInTheDocument()
    // 调用 render-prop 提供的 close 关闭面板
    await user.click(closeBtn)
    expect(screen.queryByText('关闭面板')).toBeNull()
  })

  it('再次点击触发器切换关闭', async () => {
    const user = userEvent.setup()
    render(
      <Dropdown trigger={<span>打开菜单</span>}>
        <div>面板内容</div>
      </Dropdown>,
    )
    const trigger = screen.getByText('打开菜单')
    await user.click(trigger)
    expect(screen.getByText('面板内容')).toBeInTheDocument()
    await user.click(trigger)
    expect(screen.queryByText('面板内容')).toBeNull()
  })

  it('点击外部（document mousedown）关闭面板', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <Dropdown trigger={<span>打开菜单</span>}>
          <div>面板内容</div>
        </Dropdown>
        <div data-testid="outside">外部区域</div>
      </div>,
    )
    await user.click(screen.getByText('打开菜单'))
    expect(screen.getByText('面板内容')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByText('面板内容')).toBeNull()
  })
})
