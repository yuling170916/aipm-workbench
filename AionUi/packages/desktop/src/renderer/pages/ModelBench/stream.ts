type StreamEvent = {
  type?: string;
  error?: unknown;
  delta?: string | { text?: string; stop_reason?: string };
  choices?: { delta?: { content?: string }; finish_reason?: string | null }[];
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

/** Parse SSE across arbitrary byte boundaries, retaining UTF-8 and rejecting truncated runs. */
export async function readModelStream(response: Response, onText: (text: string) => void): Promise<void> {
  if (!response.body) throw new Error('BENCH_EMPTY_STREAM');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let complete = false;
  let hasText = false;
  let outputSize = 0;
  const consume = (frame: string): void => {
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) return;
    if (data.trim() === '[DONE]') {
      complete = true;
      return;
    }
    const event = JSON.parse(data) as StreamEvent;
    if (
      event.error ||
      event.type === 'error' ||
      event.type === 'response.failed' ||
      event.type === 'response.incomplete' ||
      event.promptFeedback?.blockReason
    )
      throw new Error('BENCH_PROVIDER_ERROR');
    let text = '';
    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') text += event.delta;
    if (event.type === 'content_block_delta' && typeof event.delta === 'object') text += event.delta?.text ?? '';
    const choice = event.choices?.[0];
    text += choice?.delta?.content ?? '';
    const candidate = event.candidates?.[0];
    text +=
      candidate?.content?.parts
        ?.filter((part) => !part.thought)
        .map((part) => part.text ?? '')
        .join('') ?? '';
    if (choice?.finish_reason && !['stop', 'length'].includes(choice.finish_reason))
      throw new Error('BENCH_PROVIDER_ERROR');
    if (candidate?.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason))
      throw new Error('BENCH_PROVIDER_ERROR');
    if (
      choice?.finish_reason ||
      candidate?.finishReason ||
      event.type === 'message_stop' ||
      event.type === 'response.completed'
    )
      complete = true;
    if (text) {
      outputSize += text.length;
      if (outputSize > 200_000) throw new Error('BENCH_OUTPUT_LIMIT');
      hasText = true;
      onText(text);
    }
    if (
      choice?.finish_reason === 'length' ||
      candidate?.finishReason === 'MAX_TOKENS' ||
      (typeof event.delta === 'object' && event.delta?.stop_reason === 'max_tokens')
    ) {
      throw new Error('BENCH_OUTPUT_LIMIT');
    }
  };
  try {
    while (true) {
      // Preserve stream order and backpressure with sequential reads.
      // eslint-disable-next-line no-await-in-loop
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      // Normalize CRLF only after the LF arrives, including split delimiters.
      buffer = buffer.replace(/\r\n/g, '\n');
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        consume(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
      }
      if (buffer.length > 1_000_000) throw new Error('BENCH_OUTPUT_LIMIT');
      if (complete) break;
      if (done) {
        if (buffer.trim()) consume(buffer);
        break;
      }
    }
    if (!complete) throw new Error('BENCH_STREAM_INTERRUPTED');
    if (!hasText) throw new Error('BENCH_EMPTY_STREAM');
  } finally {
    await reader.cancel().catch((): void => undefined);
    reader.releaseLock();
  }
}
