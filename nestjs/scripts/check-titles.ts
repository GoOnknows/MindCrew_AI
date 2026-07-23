import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({
    connectionString: 'postgresql://postgres:postgres@localhost:5432/mindcrew',
    max: 2,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const sessions = await prisma.chatSession.findMany({
    select: { id: true, title: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  console.log('=== 所有会话 ===');
  for (const s of sessions) {
    const count = await prisma.chatMessage.count({
      where: { sessionId: s.id },
    });
    console.log(
      '  [' +
        s.id.slice(0, 8) +
        '] title="' +
        s.title +
        '"  msgs=' +
        count +
        '  created=' +
        s.createdAt.toISOString(),
    );

    // 对标题还是默认值的，打印第一条消息
    if (s.title === '新对话') {
      const first = await prisma.chatMessage.findFirst({
        where: { sessionId: s.id, role: 'user' },
        orderBy: { createdAt: 'asc' },
        select: { content: true, createdAt: true },
      });
      if (first) {
        console.log('      第一条消息: "' + first.content.slice(0, 50) + '"');
      } else {
        console.log('      第一条消息: (无)');
      }
    }
  }
  console.log('共 ' + sessions.length + ' 条');

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
