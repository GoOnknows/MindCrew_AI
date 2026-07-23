import type { ModelConfigDto } from '../model-config';

export async function checkModelHealth(
  modelConfig: ModelConfigDto,
  healthCheckTimeoutMs: number,
  logger: { warn: (msg: string) => void },
): Promise<boolean> {
  const baseUrl = modelConfig.baseUrl.replace(/\/+$/, '');
  const apiKey = modelConfig.apiKey;

  if (!apiKey) {
    logger.warn(`模型 "${modelConfig.name}" 未配置 API_KEY`);
    return false;
  }

  // 尝试 /models 端点
  try {
    const ok = await fetchWithTimeout(
      `${baseUrl}/models`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
      healthCheckTimeoutMs,
      logger,
    );
    if (ok) return true;
  } catch (e) {
    logger.warn(`模型 "${modelConfig.name}" 健康检查 /models 端点失败: ${(e as Error).message}`);
  }

  // fallback: dry-run chat
  try {
    const ok = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelConfig.modelName,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
      },
      healthCheckTimeoutMs,
      logger,
    );
    return ok;
  } catch (e) {
    logger.warn(`模型 "${modelConfig.name}" 健康检查 /chat/completions 端点失败: ${(e as Error).message}`);
    return false;
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  logger: { warn: (msg: string) => void },
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res.ok;
  } catch (error) {
    logger.warn(`健康检查请求失败: ${(error as Error).message}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}