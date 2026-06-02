// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// react-quill-new 在 jsdom 下依赖 getSelection / range API，不稳定。
// 用一个轻量 textarea stub 替换，既能验证 RichText 的封装行为，又不引入浏览器依赖。
// 必须在 import 组件前 mock。
vi.mock('react-quill-new', () => {
  return {
    default: function QuillStub({
      value,
      onChange,
      placeholder,
    }: {
      value?: string
      onChange?: (v: string) => void
      placeholder?: string
    }) {
      return (
        <textarea
          data-testid="quill-stub"
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
        />
      )
    },
  }
})

// quill 的 css 在 node 环境会被 vite 处理；mock 掉避免副作用。
vi.mock('react-quill-new/dist/quill.snow.css', () => ({}))

import { RichText } from '@/components/ui/RichText'

describe('RichText', () => {
  it('烟囱测试：给定 value/onChange 不抛错且渲染编辑器', async () => {
    const onChange = vi.fn()
    render(<RichText value="<p>初始内容</p>" onChange={onChange} />)
    // next/dynamic 异步加载 stub
    await waitFor(() => expect(screen.getByTestId('quill-stub')).toBeInTheDocument())
    expect(screen.getByTestId('quill-stub')).toHaveValue('<p>初始内容</p>')
  })

  it('value 为空时渲染空字符串', async () => {
    render(<RichText onChange={() => {}} />)
    await waitFor(() => expect(screen.getByTestId('quill-stub')).toBeInTheDocument())
    expect(screen.getByTestId('quill-stub')).toHaveValue('')
  })

  it('编辑内容时透传 onChange', async () => {
    const onChange = vi.fn()
    render(<RichText value="" onChange={onChange} />)
    const editor = await waitFor(() => screen.getByTestId('quill-stub'))
    fireEvent.change(editor, { target: { value: '新的内容' } })
    expect(onChange).toHaveBeenCalledWith('新的内容')
  })

  it('透传 placeholder', async () => {
    render(<RichText onChange={() => {}} placeholder="请输入正文" />)
    await waitFor(() => expect(screen.getByTestId('quill-stub')).toBeInTheDocument())
    expect(screen.getByPlaceholderText('请输入正文')).toBeInTheDocument()
  })
})
