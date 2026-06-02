// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileUpload } from '@/components/ui/FileUpload'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FileUpload', () => {
  it('无 value 时渲染上传区', () => {
    render(<FileUpload onChange={() => {}} />)
    expect(screen.getByText('点击或拖拽文件到此处上传')).toBeInTheDocument()
  })

  it('选择文件触发上传并把返回 url 透传给 onChange', async () => {
    const onChange = vi.fn()
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ url: '/api/files/123-abc-resume.pdf' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(<FileUpload onChange={onChange} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['hello'], 'resume.pdf', { type: 'application/pdf' })

    fireEvent.change(input, { target: { files: [file] } })

    // POST 到 /api/upload
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith('/api/upload', expect.objectContaining({ method: 'POST' }))
    // 上传成功后透传返回的 url
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('/api/files/123-abc-resume.pdf'))
  })

  it('上传失败（res.ok=false）时不调用 onChange', async () => {
    const onChange = vi.fn()
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: 'too large' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(<FileUpload onChange={onChange} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.png')] } })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    // 给微任务一点时间，确认 onChange 仍未被调用
    await Promise.resolve()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('已上传的 value（/api/files/ 前缀）渲染文件名 + 下载/移除按钮', () => {
    render(<FileUpload value="/api/files/123-abc-合同.pdf" onChange={() => {}} />)
    // fileNameFromUrl 去掉前缀时间戳，展示原始文件名
    expect(screen.getByText('合同.pdf')).toBeInTheDocument()
    expect(screen.getByLabelText('下载')).toBeInTheDocument()
    expect(screen.getByLabelText('移除')).toBeInTheDocument()
  })

  it('点击移除按钮以空字符串回调 onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FileUpload value="/api/files/123-abc-合同.pdf" onChange={onChange} />)
    await user.click(screen.getByLabelText('移除'))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('旧文本内容（非 /api/files/ 前缀）作为原内容展示', () => {
    render(<FileUpload value="这是历史纯文本内容" onChange={() => {}} />)
    expect(screen.getByText(/原内容：/)).toBeInTheDocument()
    expect(screen.getByText(/这是历史纯文本内容/)).toBeInTheDocument()
  })
})
