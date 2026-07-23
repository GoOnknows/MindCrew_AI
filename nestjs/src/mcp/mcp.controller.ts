import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { McpService } from './mcp.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('api/mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  /** 获取 MCP 工具列表 */
  @Get('tools')
  async getTools() {
    return this.mcpService.getTools();
  }

  /** 启用/禁用工具 */
  @Put('tools/:name/toggle')
  async toggleTool(
    @Param('name') name: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.mcpService.toggleTool(name, body.enabled);
  }

  /** 测试工具调用 */
  @Post('tools/test')
  async testTool(@Body() body: { tool: string; params: any }) {
    return this.mcpService.testTool(body.tool, body.params);
  }

  /** 工具调用统计 */
  @Get('tools/stats')
  async getToolStats() {
    return this.mcpService.getToolStats();
  }
}
