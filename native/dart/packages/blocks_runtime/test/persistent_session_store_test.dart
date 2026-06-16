import 'dart:convert';

import 'package:blocks_runtime/blocks_runtime.dart';
import 'package:test/test.dart';

void main() {
  group('PersistentSessionStore', () {
    test('implements SessionStore', () {
      expect(
        PersistentSessionStore(store: InMemoryTokenStore()),
        isA<SessionStore>(),
      );
    });

    test('parses Set-Cookie and builds the Cookie header', () {
      final store = PersistentSessionStore(store: InMemoryTokenStore());
      store.setCookies('blocks_session=abc; Path=/; HttpOnly');
      expect(store.cookies['blocks_session'], 'abc');
      expect(store.cookieHeader, 'blocks_session=abc');
    });

    test('write-through persists the cookie map to the TokenStore', () async {
      final token = InMemoryTokenStore();
      final store = PersistentSessionStore(store: token, storageKey: 'k');

      store.setCookies('blocks_session=abc; Path=/');
      // Allow the fire-and-forget write-through to complete.
      await Future<void>.delayed(Duration.zero);

      final raw = await token.get('k');
      expect(raw, isNotNull);
      expect((jsonDecode(raw!) as Map)['blocks_session'], 'abc');
    });

    test('load hydrates the cache from the TokenStore (round-trip)', () async {
      final token = InMemoryTokenStore();

      // Persist via one instance...
      final writer = PersistentSessionStore(store: token, storageKey: 'k');
      writer.setCookies('blocks_session=persisted; Path=/');
      await Future<void>.delayed(Duration.zero);

      // ...then a fresh instance (e.g. after app restart) loads it.
      final reader = PersistentSessionStore(store: token, storageKey: 'k');
      expect(reader.cookieHeader, isNull); // not yet loaded
      await reader.load();
      expect(reader.cookies['blocks_session'], 'persisted');
      expect(reader.cookieHeader, 'blocks_session=persisted');
    });

    test('load is a no-op when nothing is stored', () async {
      final store = PersistentSessionStore(store: InMemoryTokenStore());
      await store.load();
      expect(store.cookies, isEmpty);
      expect(store.cookieHeader, isNull);
    });

    test('load tolerates a corrupt payload by clearing it', () async {
      final token = InMemoryTokenStore();
      await token.set('k', 'not-json{');
      final store = PersistentSessionStore(store: token, storageKey: 'k');
      await store.load();
      expect(store.cookies, isEmpty);
      expect(await token.get('k'), isNull);
    });

    test('clear wipes the cache and the backing store', () async {
      final token = InMemoryTokenStore();
      final store = PersistentSessionStore(store: token, storageKey: 'k');
      store.setCookies('blocks_session=abc');
      await Future<void>.delayed(Duration.zero);
      expect(await token.get('k'), isNotNull);

      store.clear();
      expect(store.cookies, isEmpty);
      await Future<void>.delayed(Duration.zero);
      expect(await token.get('k'), isNull);
    });

    test('multiple cookies round-trip through persistence', () async {
      final token = InMemoryTokenStore();
      final writer = PersistentSessionStore(store: token, storageKey: 'k');
      writer.setCookies('a=1; Path=/');
      writer.setCookies('b=2; Path=/');
      await Future<void>.delayed(Duration.zero);

      final reader = PersistentSessionStore(store: token, storageKey: 'k');
      await reader.load();
      expect(reader.cookies, {'a': '1', 'b': '2'});
    });
  });
}
