/** Hibernating per-user WebSockets. Database remains the source of truth. */
export class LiveHub {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  async fetch(request) {
    if (request.headers.get('Upgrade') === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({userId: request.headers.get('X-KN-User')});
      return new Response(null, {status:101, webSocket:client});
    }
    if (request.method !== 'POST') return new Response('not found',{status:404});
    const item = await request.json();
    if (!['message','match','notification','typing','support','moderation','feed'].includes(item.type)) return new Response('bad type',{status:400});
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(JSON.stringify({type:item.type,matchId:item.matchId||null,at:Date.now()})); } catch {}
    }
    return new Response('ok');
  }
  webSocketMessage(socket, message) { if (message === 'ping') socket.send('pong'); }
}
export async function pushLive(env, ids, type, matchId=null) {
  if (!env.LIVE_HUB) return;
  await Promise.allSettled([...new Set(ids.filter(Boolean))].map(id => {
    const stub=env.LIVE_HUB.get(env.LIVE_HUB.idFromName(id));
    return stub.fetch('https://kennelly-internal.invalid/emit',{method:'POST',body:JSON.stringify({type,matchId})});
  }));
}
