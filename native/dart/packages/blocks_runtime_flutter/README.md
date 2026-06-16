# blocks_runtime_flutter

Flutter-specific implementations for `blocks_runtime`. Provides secure token storage via `flutter_secure_storage` and OAuth browser flow via `url_launcher`.

## Usage

```dart
import 'package:blocks_runtime_flutter/blocks_runtime_flutter.dart';
```

Register the Flutter implementations at app startup:

```dart
final client = BlocksClient(
  baseUrl: 'https://your-api.example.com',
  secureStore: FlutterSecureStore(),
  browserLauncher: FlutterBrowserLauncher(),
);
```

## License

Apache 2.0
