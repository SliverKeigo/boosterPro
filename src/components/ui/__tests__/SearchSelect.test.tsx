// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchSelect } from '@/components/ui/SearchSelect'

const opts = [
  { value: '1', label: '腾讯' },
  { value: '2', label: '阿里' },
  { value: '3', label: '深圳腾讯' },
]

describe('SearchSelect（静态模式）', () => {
  it('回显已选项的 label', () => {
    render(<SearchSelect value="2" onChange={() => {}} options={opts} />)
    expect(screen.getByText('阿里')).toBeInTheDocument()
  })

  it('未选时显示 placeholder', () => {
    render(<SearchSelect value="" onChange={() => {}} options={opts} placeholder="请选择客户" />)
    expect(screen.getByText('请选择客户')).toBeInTheDocument()
  })

  it('输入「腾讯」过滤掉「阿里」，保留「腾讯」「深圳腾讯」', async () => {
    const user = userEvent.setup()
    render(<SearchSelect value="" onChange={() => {}} options={opts} placeholder="请选择" />)
    await user.click(screen.getByText('请选择')) // 展开
    await user.type(screen.getByPlaceholderText('输入以过滤…'), '腾讯')
    expect(screen.getByText('腾讯')).toBeInTheDocument()
    expect(screen.getByText('深圳腾讯')).toBeInTheDocument()
    expect(screen.queryByText('阿里')).not.toBeInTheDocument()
  })

  it('点击选项回调 onChange(value)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SearchSelect value="" onChange={onChange} options={opts} placeholder="请选择" />)
    await user.click(screen.getByText('请选择'))
    await user.click(screen.getByText('深圳腾讯'))
    expect(onChange).toHaveBeenCalledWith('3')
  })

  it('无匹配项时给出提示', async () => {
    const user = userEvent.setup()
    render(<SearchSelect value="" onChange={() => {}} options={opts} placeholder="请选择" />)
    await user.click(screen.getByText('请选择'))
    await user.type(screen.getByPlaceholderText('输入以过滤…'), '百度')
    expect(screen.getByText('无匹配项')).toBeInTheDocument()
  })
})

describe('SearchSelect（异步模式）', () => {
  it('打开即按空串请求后端，输入后按词请求（后端过滤）', async () => {
    const user = userEvent.setup()
    const fetchOptions = vi.fn(async (q: string) =>
      opts.filter((o) => o.label.includes(q)),
    )
    render(<SearchSelect value="" onChange={() => {}} fetchOptions={fetchOptions} placeholder="请选择" />)
    await user.click(screen.getByText('请选择'))
    // 防抖 250ms 后首次以空串请求
    await screen.findByText('腾讯')
    expect(fetchOptions).toHaveBeenCalledWith('')
    await user.type(screen.getByPlaceholderText('输入以过滤…'), '阿里')
    // 防抖后以「阿里」请求后端
    await waitFor(() => expect(fetchOptions).toHaveBeenCalledWith('阿里'))
  })
})
