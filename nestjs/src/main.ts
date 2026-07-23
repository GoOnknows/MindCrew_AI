import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ─── CORS ───
  app.enableCors({
    origin: [
      'http://localhost:5173', // Vite dev server
      'http://localhost:3000',
      'http://127.0.0.1:5173',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  });

  // ─── Global validation pipe ───
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  // ─── WebSocket adapter ───
  app.useWebSocketAdapter(new IoAdapter(app));

  // ─── Global prefix ───
  app.setGlobalPrefix('', { exclude: ['api/chat/stream'] });

  await app.listen(process.env.PORT ?? 3000);
  console.log(`🚀 MindCrew API is running on http://localhost:${process.env.PORT ?? 3000}`);
}
bootstrap();
