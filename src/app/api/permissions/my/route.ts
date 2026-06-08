import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getCurrentUser, getPermissionMap, getGrantsForUser } from '@/lib/permissions'
import { getMyLedGroupId } from '@/lib/groups'

// 返回当前用户对八个业务资源的功能权限，供前端控制菜单 / 按钮显隐
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })
    const permissions = await getPermissionMap(user)
    // groupId：所属组；ledGroupId：作为组长所领的组（工作计划「新增」按钮据此显隐）
    const ledGroupId = await getMyLedGroupId(user)
    // 「可编辑授权概要」：被授予 EDIT 的数据来源（创建者 userId / 创建者部门 deptId），
    // 供前端 canEditRow 镜像编辑/删除按钮显隐。仅 edit 维度——view 由后端 buildRowFilter 过滤保证。
    const rawGrants = await getGrantsForUser(user)
    const grants: Record<string, { editUserIds: number[]; editDeptIds: number[] }> = {}
    for (const [resource, g] of Object.entries(rawGrants)) {
      grants[resource] = { editUserIds: g.edit.userIds, editDeptIds: g.edit.deptIds }
    }
    return NextResponse.json({
      isAdmin: user.isAdmin,
      userId: user.id,
      departmentId: user.departmentId,
      groupId: user.groupId,
      ledGroupId,
      permissions,
      grants,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
