// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'content-type', 'text/event-stream');
  setResponseHeader(event, 'cache-control', 'no-cache');

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      for (let i = 0; i < 5; i++) {
        controller.enqueue(encoder.encode(`data: chunk ${i} @ ${Date.now()}\n\n`));
        await new Promise((r) => setTimeout(r, 200));
      }
      controller.close();
    },
  });

  return sendStream(event, stream);
});
