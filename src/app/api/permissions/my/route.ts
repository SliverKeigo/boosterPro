import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getCurrentUser, getPermissionMap } from '@/lib/permissions'
import { getMyLedGroupId } from '@/lib/groups'

// 返回当前用户对八个业务资源的功能权限，供前端控制菜单 / 按钮显隐
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })
    const permissions = await getPermissionMap(user)
    // groupId：所属组；ledGroupId：作为组长所领的组（工作计划「新增」按钮据此显隐）
    const ledGroupId = await getMyLedGroupId(user)
    return NextResponse.json({
      isAdmin: user.isAdmin,
      userId: user.id,
      departmentId: user.departmentId,
      groupId: user.groupId,
      ledGroupId,
      permissions,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
