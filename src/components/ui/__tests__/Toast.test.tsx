// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, useToast } from '@/components/ui/Toast'

// 暴露 toast api 给测试调用
function Consumer() {
  const toast = useToast()
  return (
    <div>
      <button type="button" onClick={() => toast.success('保存成功')}>
        success
      </button>
      <button type="button" onClick={() => toast.error('保存失败')}>
        error
      </button>
      <button type="button" onClick={() => toast.info('提示信息')}>
        info
      </button>
    </div>
  )
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Toast', () => {
  it('useToast 在 ToastProvider 外使用会抛错', () => {
    // 抑制 React 打印的报错噪声
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    function Bad() {
      useToast()
      return null
    }
    expect(() => render(<Bad />)).toThrow('useToast 必须在 ToastProvider 内使用')
    spy.mockRestore()
  })

  it('调用 toast.success 渲染对应消息', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <Consumer />
      </ToastProvider>,
    )
    expect(screen.queryByText('保存成功')).toBeNull()
    await user.click(screen.getByText('success'))
    expect(screen.getByText('保存成功')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('可手动点击关闭按钮移除消息', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <Consumer />
      </ToastProvider>,
    )
    await user.click(screen.getByText('error'))
    expect(screen.getByText('保存失败')).toBeInTheDocument()
    await user.click(screen.getByLabelText('关闭通知'))
    expect(screen.queryByText('保存失败')).toBeNull()
  })

  it('3.2s 后自动移除消息', () => {
    vi.useFakeTimers()
    // 用 fake timers 时避免 userEvent（其内部 setTimeout 会和假时钟冲突），
    // 直接用同步的 fireEvent 触发点击。
    render(
      <ToastProvider>
        <Consumer />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('info'))
    expect(screen.getByText('提示信息')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(3300)
    })
    expect(screen.queryByText('提示信息')).toBeNull()
  })
})
