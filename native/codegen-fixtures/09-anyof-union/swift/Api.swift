import Foundation
import BlocksRuntime

public class Api {
    private let client: BlocksClient

    public init(server: BlocksServer = Servers.local) {
        self.client = BlocksClient(server: server)
    }

    /// Calls `api.search`.
    public func search(query: Search.Query) async throws -> Search.Result {
        let request = BlocksRequest(method: "api.search", params: [query], id: BlocksRequest.nextId())
        let result = try await client.execute(request)
        guard let result else { throw RPCError(message: "Unexpected null result for api.search") }
        return try JSONDecoder().decode(Search.Result.self, from: result)
    }

    /// Calls `api.getValue`.
    public func getValue() async throws -> String? {
        let request = BlocksRequest(method: "api.getValue", params: [], id: BlocksRequest.nextId())
        let result = try await client.execute(request)
        guard let result else { return nil }
        return try JSONDecoder().decode(String.self, from: result)
    }

    public enum Search {

        public struct Query_Variant1: Codable {
            public let fuzzy: Bool?
            public let text: String

            enum CodingKeys: String, CodingKey {
                case fuzzy
                case text
            }

            public func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encodeIfPresent(self.fuzzy, forKey: .fuzzy)
                try c.encode(self.text, forKey: .text)
            }
        }

        public enum Query: Codable {
            case query_Variant0
            case query_Variant1(Query_Variant1)

            public func encode(to encoder: Encoder) throws {
                switch self {
                case .query_Variant0:
                    var c = encoder.container(keyedBy: EmptyKey.self)
                    _ = c
                case .query_Variant1(let payload):
                    try payload.encode(to: encoder)
                }
            }

            public init(from decoder: Decoder) throws {
                var lastError: Error?
                do {
                    self = .query_Variant1(try Query_Variant1(from: decoder))
                    return
                } catch { lastError = error }
                self = .query_Variant0
            }

            private enum EmptyKey: CodingKey {}
        }

        public struct Result: Codable {
            public let count: Int
        }
    }
}


// MARK: - Servers

public enum Servers {
    public static let local = BlocksServer(name: "local", url: "http://localhost:3001/aws-blocks/api")
}