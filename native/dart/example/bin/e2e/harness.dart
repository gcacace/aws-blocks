import 'dart:io';
import '../../lib/blocks_client.dart';
export '../../lib/blocks_client.dart';

int _passed = 0;
int _failed = 0;

/// Creates a Blocks client pointing at test-apps/native-bindings.
/// Default: http://localhost:3001/aws-blocks/api (the native-bindings dev server,
/// `npm run dev:server`).
/// Override with BLOCKS_URL env var for sandbox/production testing.
Blocks createBlocks() {
  final url = Platform.environment['BLOCKS_URL'] ?? 'http://localhost:3001/aws-blocks/api';
  print('Using endpoint: $url');
  return Blocks(baseUrl: url);
}

void group(String name) {
  print('\n--- $name ---');
}

void check(bool condition, String message) {
  if (!condition) {
    _failed++;
    print('  ✗ $message');
  } else {
    _passed++;
    print('  ✓ $message');
  }
}

Future<T?> expectError<T>(Future<T> Function() fn, {String? label}) async {
  try {
    await fn();
    _failed++;
    print('  ✗ ${label ?? "expected error"} — no error thrown');
    return null;
  } on BlocksRpcException catch (e) {
    _passed++;
    print('  ✓ ${label ?? "expected error"} — got BlocksRpcException(${e.code}): ${e.message}');
    return null;
  } catch (e) {
    _passed++;
    print('  ✓ ${label ?? "expected error"} — got ${e.runtimeType}: $e');
    return null;
  }
}

void printResults() {
  print('\n${'=' * 40}');
  print('Results: $_passed passed, $_failed failed');
  if (_failed > 0) {
    print('❌ SOME TESTS FAILED');
    exit(1);
  } else {
    print('✅ All tests passed!');
  }
}
