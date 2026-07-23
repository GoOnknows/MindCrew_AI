/**
 * 迁移脚本：将 title 仍为 '新对话' 的 ChatSession 更新为第一条消息的前 30 字
 *
 * 用法: npx tsx scripts/migrate-chat-titles.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function main() {
  const dbUrl =
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/mindcrew';

  const pool = new Pool({ connectionString: dbUrl, max: 2 });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const sessions = await prisma.chatSession.findMany({
      where: { title: '新对话' },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    console.log(`找到 ${sessions.length} 个待更新会话\n`);

    let updated = 0;
    let skipped = 0;

    for (const session of sessions) {
      const firstMsg = await prisma.chatMessage.findFirst({
        where: { sessionId: session.id, role: 'user' },
        orderBy: { createdAt: 'asc' },
        select: { content: true },
      });

      if (!firstMsg) {
        skipped++;
        continue;
      }

      const title = firstMsg.content.slice(0, 30);
      await prisma.chatSession.update({
        where: { id: session.id },
        data: { title },
      });

      updated++;
      if (updated <= 5 || sessions.length <= 10) {
        console.log(`  ✓ [${session.id.slice(0, 8)}] → "${title}"`);
      }
    }

    console.log(`\n完成: 更新 ${updated} 条，跳过 ${skipped} 条（无消息记录）`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('迁移失败:', e);
  process.exit(1);
});
