import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

/**
 * WebSocket 语音通信网关
 *
 * 处理实时语音对话的双向音频流：
 *   - 客户端发送 PCM 音频数据
 *   - 服务端接收后进行 VAD 分段
 *   - 调用 ASR 将语音转为文本
 *   - 将文本送入 AI 对话链
 *   - AI 回复文本通过 TTS 转为音频
 *   - 音频 PCM 数据流回客户端播放
 */
@WebSocketGateway({
  namespace: '/chat/voice',
  cors: { origin: '*' },
})
export class VoiceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(VoiceGateway.name);
  private readonly audioBuffers = new Map<string, Buffer[]>();
  private readonly isSpeaking = new Map<string, boolean>();

  handleConnection(client: Socket) {
    this.logger.log(`Voice client connected: ${client.id}`);
    this.audioBuffers.set(client.id, []);
    this.isSpeaking.set(client.id, false);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Voice client disconnected: ${client.id}`);
    this.audioBuffers.delete(client.id);
    this.isSpeaking.delete(client.id);
  }

  /**
   * 接收客户端发送的 PCM 音频数据
   */
  @SubscribeMessage('audio-data')
  async handleAudioData(
    @MessageBody() data: { audio: number[]; sampleRate: number },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const buffer = Buffer.from(data.audio);
    const chunks = this.audioBuffers.get(client.id) ?? [];
    chunks.push(buffer);
    this.audioBuffers.set(client.id, chunks);

    // 简单 VAD：如果音频能量超过阈值，标记为用户正在说话
    const energy = this.calculateEnergy(buffer);
    const speaking = energy > 100;

    if (speaking && !this.isSpeaking.get(client.id)) {
      this.isSpeaking.set(client.id, true);
      client.emit('speech-start', {});
    }

    if (!speaking && this.isSpeaking.get(client.id)) {
      this.isSpeaking.set(client.id, false);
      client.emit('speech-end', {});

      // 将累积的音频片段合并发送到 ASR
      this.processAudio(client);
    }
  }

  /**
   * 接收客户端音频流并返回 TTS 合成结果
   */
  @SubscribeMessage('voice-query')
  async handleVoiceQuery(
    @MessageBody() data: { text: string; sessionId?: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    this.logger.log(`Voice query: ${data.text.slice(0, 50)}...`);

    // 此处应该调用 TTS 服务（如 CosyVoice）合成语音
    // 然后将音频 PCM 数据通过 socket 发回客户端
    // 当前为占位实现，返回文本
    client.emit('tts-response', {
      text: `收到语音:「${data.text}」，语音回复功能待 TTS 服务接入后启用。`,
    });
  }

  private async processAudio(client: Socket) {
    const chunks = this.audioBuffers.get(client.id) ?? [];
    if (chunks.length === 0) return;

    // 合并 PCM 数据
    const combined = Buffer.concat(chunks);

    // 发送到客户端显示波形
    client.emit('audio-waveform', { size: combined.length });

    // 清空缓冲区
    this.audioBuffers.set(client.id, []);
  }

  private calculateEnergy(buffer: Buffer): number {
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 2) {
      const sample = buffer.readInt16LE(i);
      sum += sample * sample;
    }
    return Math.sqrt(sum / (buffer.length / 2));
  }
}
