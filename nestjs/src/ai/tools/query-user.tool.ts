import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { UserService } from '../user.service';
import type { FactoryProvider } from '@nestjs/common';

export const QUERY_USER_TOOL = 'QUERY_USER_TOOL';

export const queryUserToolProvider: FactoryProvider = {
  provide: QUERY_USER_TOOL,
  useFactory: (userService: UserService) => {
    return tool(
      async ({ userId }: { userId: string }) => {
        const user = userService.findOne(userId);
        if (!user) {
          const availables = userService
            .findAll()
            .map((u) => u.id)
            .join(',');
          return `用户${userId}不存在，可用用户ID为：${availables}`;
        }
        return `用户信息：\n- 用户ID：${user.id}\n- 用户名：${user.name}\n- 用户邮箱：${user.email}\n- 用户角色：${user.role}`;
      },
      {
        name: 'query_user',
        description: '查询用户信息',
        schema: z.object({
          userId: z.string().describe('用户ID，例如001,002,003'),
        }),
      },
    );
  },
  inject: [UserService],
};
