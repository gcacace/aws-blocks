// GENERATED CODE — DO NOT MODIFY BY HAND
// Generator: blocks-codegen
// Source: test v1.0.0
// ignore_for_file: constant_identifier_names

import 'package:blocks_runtime/blocks_runtime.dart';
export 'package:blocks_runtime/blocks_runtime.dart' show BlocksClient, BlocksRpcException, SessionStore, InMemorySessionStore;

// --- Models ---

class CognitoUser {
  final String userSub;
  final List<String> groups;
  final Map<String, String?> attributes;
  final String userId;
  final String username;

  const CognitoUser({
    required this.userSub,
    required this.groups,
    required this.attributes,
    required this.userId,
    required this.username,
  });

  factory CognitoUser.fromJson(Map<String, dynamic> json) {
    return CognitoUser(
      userSub: json['userSub'] as String,
      groups: (json['groups'] as List<dynamic>).cast<String>(),
      attributes: (json['attributes'] as Map<String, dynamic>).map((k, v) => MapEntry(k, v as String?)),
      userId: json['userId'] as String,
      username: json['username'] as String,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'userSub': userSub,
      'groups': groups,
      'attributes': attributes,
      'userId': userId,
      'username': username,
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CognitoUser &&
          userSub == other.userSub &&
          groups == other.groups &&
          attributes == other.attributes &&
          userId == other.userId &&
          username == other.username;

  @override
  int get hashCode => Object.hash(userSub, groups, attributes, userId, username);

  @override
  String toString() => 'CognitoUser(userSub: $userSub, groups: $groups, attributes: $attributes, userId: $userId, username: $username)';
}


enum CodeDeliveryDetailsDeliveryMedium {
  SMS,
  EMAIL,
  PHONE_NUMBER
;

  String toJson() => name;
  static CodeDeliveryDetailsDeliveryMedium fromJson(String json) => values.byName(json);
}


class CodeDeliveryDetails {
  final String destination;
  final CodeDeliveryDetailsDeliveryMedium deliveryMedium;
  final String attributeName;

  const CodeDeliveryDetails({
    required this.destination,
    required this.deliveryMedium,
    required this.attributeName,
  });

  factory CodeDeliveryDetails.fromJson(Map<String, dynamic> json) {
    return CodeDeliveryDetails(
      destination: json['destination'] as String,
      deliveryMedium: CodeDeliveryDetailsDeliveryMedium.fromJson(json['deliveryMedium'] as String),
      attributeName: json['attributeName'] as String,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'destination': destination,
      'deliveryMedium': deliveryMedium.toJson(),
      'attributeName': attributeName,
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CodeDeliveryDetails &&
          destination == other.destination &&
          deliveryMedium == other.deliveryMedium &&
          attributeName == other.attributeName;

  @override
  int get hashCode => Object.hash(destination, deliveryMedium, attributeName);

  @override
  String toString() => 'CodeDeliveryDetails(destination: $destination, deliveryMedium: $deliveryMedium, attributeName: $attributeName)';
}


// --- API Namespaces ---

class ApiApi {
  final BlocksClient _client;
  ApiApi(this._client);

  Future<dynamic> cognitoConfirmSignIn({required String session, required String challengeResponse}) async {
    final params = <String, dynamic>{
      'session': session,
      'challengeResponse': challengeResponse,
    };
    final result = await _client.call('api.cognitoConfirmSignIn', params);
    return result as dynamic;
  }

  Future<dynamic> cognitoSignIn({required String username, required String password}) async {
    final params = <String, dynamic>{
      'username': username,
      'password': password,
    };
    final result = await _client.call('api.cognitoSignIn', params);
    return result as dynamic;
  }
}


// --- Blocks Client ---

class Blocks {
  late final ApiApi api;

  Blocks({required String baseUrl, SessionStore? sessionStore}) {
    final client = BlocksClient(baseUrl: baseUrl, sessionStore: sessionStore);
    api = ApiApi(client);
  }
}

