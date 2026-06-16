import 'dart:typed_data';
import 'package:http/http.dart' as http;

class FileDownloadHandle {
  final String url;

  FileDownloadHandle._({required this.url});

  factory FileDownloadHandle.fromJson(Map<String, dynamic> json) {
    return FileDownloadHandle._(url: json['url'] as String);
  }

  String getUrl() => url;

  Future<Uint8List> download() async {
    final response = await http.get(Uri.parse(url));
    if (response.statusCode != 200) {
      throw Exception('Download failed: HTTP ${response.statusCode}');
    }
    return response.bodyBytes;
  }
}
