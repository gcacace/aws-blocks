import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:blocks_runtime/blocks_runtime.dart';
import 'package:blocks_runtime_flutter/blocks_runtime_flutter.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';

@GenerateMocks([FlutterSecureStorage])
import 'flutter_secure_store_test.mocks.dart';

void main() {
  late MockFlutterSecureStorage mockStorage;
  late FlutterSecureStore store;

  setUp(() {
    mockStorage = MockFlutterSecureStorage();
    store = FlutterSecureStore(storage: mockStorage);
  });

  test('implements TokenStore', () {
    expect(store, isA<TokenStore>());
  });

  test('get delegates to read', () async {
    when(mockStorage.read(key: 'token')).thenAnswer((_) async => 'value');

    final result = await store.get('token');

    expect(result, 'value');
    verify(mockStorage.read(key: 'token')).called(1);
  });

  test('get returns null when key missing', () async {
    when(mockStorage.read(key: 'missing')).thenAnswer((_) async => null);

    expect(await store.get('missing'), isNull);
  });

  test('set delegates to write', () async {
    when(mockStorage.write(key: 'k', value: 'v')).thenAnswer((_) async {});

    await store.set('k', 'v');

    verify(mockStorage.write(key: 'k', value: 'v')).called(1);
  });

  test('delete delegates to delete', () async {
    when(mockStorage.delete(key: 'k')).thenAnswer((_) async {});

    await store.delete('k');

    verify(mockStorage.delete(key: 'k')).called(1);
  });
}
