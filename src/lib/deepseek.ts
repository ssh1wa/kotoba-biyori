import { AppSettings, ModelFeature, Provider } from '../types';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const stripCodeFence = (value: string) =>
  value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export const getFeatureProvider = (settings: AppSettings, feature: ModelFeature) =>
  settings.featureProviders?.[feature] || settings.provider;

export const getFeatureProfile = (settings: AppSettings, feature: ModelFeature) =>
  settings[getFeatureProvider(settings, feature)];

export async function listAvailableModels(settings: AppSettings, provider: Provider): Promise<string[]> {
  const profile = settings[provider];
  if (!profile.apiKey.trim()) throw new ApiError('请先填写 API Key。');
  const baseUrl = profile.baseUrl.trim().replace(/\/+$/, '');
  if (!baseUrl) throw new ApiError('请先填写 API Base URL。');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: provider === 'gemini'
        ? { 'x-goog-api-key': profile.apiKey.trim() }
        : { Authorization: `Bearer ${profile.apiKey.trim()}` },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(payload?.error?.message || `模型列表请求失败（HTTP ${response.status}）`, response.status);
    }
    const models = provider === 'gemini'
      ? (Array.isArray(payload?.models) ? payload.models : [])
          .filter((model: { supportedGenerationMethods?: string[] }) => !model.supportedGenerationMethods || model.supportedGenerationMethods.includes('generateContent'))
          .map((model: { name?: string }) => String(model.name || '').replace(/^models\//, ''))
      : (Array.isArray(payload?.data) ? payload.data : []).map((model: { id?: string }) => String(model.id || ''));
    const unique = [...new Set<string>(models.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (!unique.length) throw new ApiError('接口已响应，但没有返回可用的生成模型。');
    return unique;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new ApiError('获取模型列表超时。');
    throw new ApiError(error instanceof Error ? error.message : '获取模型列表失败。');
  } finally {
    clearTimeout(timer);
  }
}

export async function requestJson<T>(
  settings: AppSettings,
  messages: ChatMessage[],
  temperature = 0.4,
  feature: ModelFeature = 'translation',
): Promise<T> {
  const provider = getFeatureProvider(settings, feature);
  const profile = settings[provider];
  const model = profile.models?.[feature]?.trim() || profile.model.trim();
  if (!profile.apiKey.trim()) {
    throw new ApiError(`请先在设置中填写${provider === 'gemini' ? ' Gemini' : ' OpenAI 兼容'} API Key。`);
  }

  const baseUrl = profile.baseUrl.trim().replace(/\/+$/, '');
  const fetchContent = async (requestMessages: ChatMessage[], requestTemperature: number) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
    const response = provider === 'gemini'
      ? await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': profile.apiKey.trim(),
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: requestMessages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n') }],
            },
            contents: requestMessages
              .filter((message) => message.role !== 'system')
              .map((message) => ({
                role: message.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: message.content }],
              })),
            generationConfig: {
              temperature: requestTemperature,
              maxOutputTokens: 4096,
              responseMimeType: 'application/json',
            },
          }),
          signal: controller.signal,
        })
      : await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${profile.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model,
        messages: requestMessages,
        temperature: requestTemperature,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
        ...(baseUrl.includes('api.deepseek.com') ? { thinking: { type: 'disabled' } } : {}),
        stream: false,
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload?.error?.message || payload?.error?.status || `请求失败（HTTP ${response.status}）`;
      throw new ApiError(detail, response.status);
    }

    const content = provider === 'gemini'
      ? payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('')
      : payload?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new ApiError('模型没有返回可读取的内容，请重试。');
    }
    return content;
    } finally {
      clearTimeout(timer);
    }
  };

  const parseContent = (content: string): T | undefined => {
    const cleaned = stripCodeFence(content);
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start < 0 || end <= start) return undefined;
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return undefined;
      }
    }
  };

  try {
    const content = await fetchContent(messages, temperature);
    const parsed = parseContent(content);
    if (parsed !== undefined) return parsed;

    const repairedContent = await fetchContent([
      ...messages,
      { role: 'assistant', content },
      {
        role: 'user',
        content: 'Your previous response was not complete valid JSON. Return the same answer again as one complete valid JSON object only. Preserve every required field, close every string, array, and object, and do not use Markdown or commentary.',
      },
    ], 0.1);
    const repaired = parseContent(repairedContent);
    if (repaired !== undefined) return repaired;
    throw new ApiError('模型连续两次返回了无法解析的 JSON，请重试。');
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('请求超时，请检查网络后重试。');
    }
    throw new ApiError(error instanceof Error ? error.message : '网络请求失败。');
  }
}
