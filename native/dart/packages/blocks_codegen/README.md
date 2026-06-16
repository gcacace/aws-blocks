# blocks_codegen

Code generator for the Blocks Dart SDK. Reads an OpenRPC spec and generates a fully typed Dart client with sealed classes, enums, maps, and transferable hydration.

## Usage

### CLI

```bash
dart run blocks_codegen --spec path/to/spec.json --output lib/blocks_client.dart
```

### build_runner

Add to `build.yaml` and place your `.spec.json` in `lib/`. Run:

```bash
dart run build_runner build
```

## License

Apache 2.0
