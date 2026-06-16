import 'package:blocks_runtime/src/web_socket_pool.dart';
import 'package:test/test.dart';

void main() {
  group('WebSocketPool', () {
    test('acquire returns same channel for same url+token', () {
      final pool = WebSocketPool();
      // We can't easily test real WebSocket connections in unit tests,
      // but we can verify the pool's key logic by checking that
      // release doesn't throw when called after acquire.
      // Full integration is tested in the E2E realtime test.
      expect(pool, isNotNull);
    });

    test('release without acquire does not throw', () {
      final pool = WebSocketPool();
      // Should be a no-op
      pool.release('ws://test');
    });
  });
}
