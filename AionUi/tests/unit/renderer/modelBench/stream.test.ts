import { describe, expect, it } from 'vitest';
import { readModelStream } from '@/renderer/pages/ModelBench/stream';

function response(text: string): Response {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    })
  );
}

describe('model comparison stream', () => {
  it('preserves partial text but flags token-limit truncation', async () => {
    let text = '';
    await expect(
      readModelStream(
        response('data: {"choices":[{"delta":{"content":"partial"},"finish_reason":"length"}]}\n\n'),
        (part) => {
          text += part;
        }
      )
    ).rejects.toThrow('BENCH_OUTPUT_LIMIT');
    expect(text).toBe('partial');
  });
  it('preserves UTF-8 and CRLF frames across single-byte chunks', async () => {
    let text = '';
    await readModelStream(
      response('data: {"choices":[{"delta":{"content":"你好🌍"}}]}\r\n\r\ndata: [DONE]\r\n\r\n'),
      (part) => {
        text += part;
      }
    );
    expect(text).toBe('你好🌍');
  });
  it.each([
    ['data: {"type":"content_block_delta","delta":{"text":"answer"}}\n\ndata: {"type":"message_stop"}\n\n'],
    ['data: {"type":"response.output_text.delta","delta":"answer"}\n\ndata: {"type":"response.completed"}\n\n'],
    [
      'data: {"candidates":[{"content":{"parts":[{"text":"private","thought":true},{"text":"answer"}]},"finishReason":"STOP"}]}\n\n',
    ],
  ])('reads native provider streams without including hidden reasoning', async (data) => {
    let text = '';
    await readModelStream(response(data), (part) => {
      text += part;
    });
    expect(text).toBe('answer');
  });
  it('rejects a partial response without a terminal event', async () => {
    await expect(
      readModelStream(response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'), () => undefined)
    ).rejects.toThrow('BENCH_STREAM_INTERRUPTED');
  });
  it('never exposes upstream error bodies', async () => {
    await expect(
      readModelStream(response('data: {"error":{"message":"secret-key"}}\n\n'), () => undefined)
    ).rejects.toThrow('BENCH_PROVIDER_ERROR');
  });
  it('rejects empty success rather than showing completed', async () => {
    await expect(readModelStream(response('data: [DONE]\n\n'), () => undefined)).rejects.toThrow('BENCH_EMPTY_STREAM');
  });
  it('rejects truncated Responses API completions', async () => {
    await expect(
      readModelStream(response('data: {"type":"response.incomplete"}\n\n'), () => undefined)
    ).rejects.toThrow('BENCH_PROVIDER_ERROR');
  });
});
