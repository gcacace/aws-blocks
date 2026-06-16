/// Abstract interface for persisting OIDC tokens.
abstract class TokenStore {
  Future<String?> get(String key);
  Future<void> set(String key, String value);
  Future<void> delete(String key);
}

/// In-memory token store — tokens are lost when the process exits.
class InMemoryTokenStore implements TokenStore {
  final _map = <String, String>{};

  @override
  Future<String?> get(String key) async => _map[key];

  @override
  Future<void> set(String key, String value) async => _map[key] = value;

  @override
  Future<void> delete(String key) async => _map.remove(key);
}
