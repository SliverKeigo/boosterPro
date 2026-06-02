// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RegionCascade from '@/components/ui/RegionCascade'

// 注：RegionCascade 运行时动态 import 大体量 pca.json（真实数据）。
// 按指引保持轻量：只验证触发器渲染、打开后出现首级选项、选择叶子触发 onChange，
// 不深入断言级联下钻的具体数据。

describe('RegionCascade', () => {
  it('无 value 时触发器显示占位符', () => {
    render(<RegionCascade value="" onChange={() => {}} />)
    expect(screen.getByText('请选择地区')).toBeInTheDocument()
  })

  it('有 value 时触发器显示该值', () => {
    render(<RegionCascade value="广东省 深圳市 南山区" onChange={() => {}} />)
    expect(screen.getByText('广东省 深圳市 南山区')).toBeInTheDocument()
  })

  it('点击触发器打开浮层，数据加载后出现首级选项', async () => {
    const user = userEvent.setup()
    render(<RegionCascade value="" onChange={() => {}} />)
    await user.click(screen.getByText('请选择地区'))
    // 数据异步加载完成后，首级出现省级单位（北京市来自 pca.json）
    await waitFor(() => expect(screen.getByText('北京市')).toBeInTheDocument(), { timeout: 4000 })
    // 顶级也包含 regionsExtra 追加的「海外」
    expect(screen.getByText('海外')).toBeInTheDocument()
  })

  it('选择顶级叶子节点「海外」时以拼接字符串触发 onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<RegionCascade value="" onChange={onChange} />)
    await user.click(screen.getByText('请选择地区'))
    const overseas = await waitFor(() => screen.getByText('海外'), { timeout: 4000 })
    await user.click(overseas)
    expect(onChange).toHaveBeenCalledWith('海外')
  })
})
