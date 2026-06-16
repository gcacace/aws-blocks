/// Interface for providing bearer token authentication to [BlocksClient].
abstract class AuthProvider {
  /// Returns the current access token, or null if not authenticated.
  Future<String?> getAccessToken();

  /// Called on 401 — should attempt token refresh.
  Future<void> onAuthFailure();
}
