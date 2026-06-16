import Foundation
import BlocksRuntime

public class Api {
    private let client: BlocksClient

    public init(server: BlocksServer = Servers.local) {
        self.client = BlocksClient(server: server)
    }

    /// Calls `api.getScores`.
    public func getScores() async throws -> [String: Double] {
        let request = BlocksRequest(method: "api.getScores", params: [], id: BlocksRequest.nextId())
        let result = try await client.execute(request)
        guard let result else { throw RPCError(message: "Unexpected null result for api.getScores") }
        return try JSONDecoder().decode([String: Double].self, from: result)
    }

    /// Calls `api.signUp`.
    public func signUp(input: SignUp.Input) async throws -> SignUp.Result {
        let request = BlocksRequest(method: "api.signUp", params: [input], id: BlocksRequest.nextId())
        let result = try await client.execute(request)
        guard let result else { throw RPCError(message: "Unexpected null result for api.signUp") }
        return try JSONDecoder().decode(SignUp.Result.self, from: result)
    }

    public enum SignUp {

        public struct Input: Codable {
            public let password: String
            public let username: String
            public let attributes: [String: String]
        }

        public struct Result: Codable {
            public let ok: Bool
        }
    }
}


// MARK: - Servers

public enum Servers {
    public static let local = BlocksServer(name: "local", url: "http://localhost:3001/aws-blocks/api")
}